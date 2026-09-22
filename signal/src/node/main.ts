/**
 * SIGNAL server entry point — runs 24/7 on a VPS, a PC or a container. The dashboard is
 * only a window into it: closing the browser (or the phone) never stops the bot.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";
import { Engine } from "../core/engine.js";
import { priorModel } from "../core/model.js";
import type { DecodedEvent } from "../core/decode.js";
import type { MarketEvent } from "../core/types.js";
import { loadConfig, loadDotEnv } from "./config.js";
import { DexScreenerFeed } from "./feeds/dexscreener.js";
import { MetadataFetcher } from "./feeds/metadata.js";
import { PoolResolver } from "./feeds/pools.js";
import { PumpPortalFeed } from "./feeds/pumpportal.js";
import { RpcLogsFeed } from "./feeds/rpc.js";
import { SimFeed } from "./feeds/sim.js";
import { SolPrice } from "./feeds/solprice.js";
import { Learner } from "./learner.js";
import { LiveExecutor } from "./live/executor.js";
import { ServerLog } from "./log.js";
import { EventRouter } from "./router.js";
import { DashboardServer } from "./server.js";
import { type SetupKey, SetupStore, lanAddress, openBrowser } from "./setup.js";
import { DataStore } from "./store.js";
import { Telegram } from "./telegram.js";

declare const __DASHBOARD_HTML__: string | undefined;

function dashboardHtml(): string {
  if (typeof __DASHBOARD_HTML__ === "string" && __DASHBOARD_HTML__) return __DASHBOARD_HTML__;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, "dashboard.html"), join(here, "../dist/dashboard.html"), join(process.cwd(), "dist/dashboard.html")]) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return "<!doctype html><title>SIGNAL</title><p>Dashboard not built. Run <code>npm run build</code>.</p>";
}

export async function main() {
  loadDotEnv();
  // values saved from the dashboard (data feed, Telegram, wallet) win over .env and host variables
  const baseEnv: NodeJS.ProcessEnv = { ...process.env };
  const setup = new SetupStore(resolve(process.env.DATA_DIR ?? "./data"));
  setup.applyTo(process.env);
  const effective = (k: SetupKey) => setup.read()[k] ?? baseEnv[k] ?? "";
  const config = loadConfig();
  const log = new ServerLog(config.logLevel);
  const store = new DataStore(config.dataDir, log);

  let token = config.dashboardToken || store.readSecret() || "";
  if (!token) {
    token = randomBytes(18).toString("base64url");
    store.writeSecret(token);
  }

  const model = store.loadModel() ?? priorModel(Date.now());
  let server: DashboardServer | null = null;
  let telegram: Telegram | null = null;
  let live: LiveExecutor | null = null;
  let pumpportal: PumpPortalFeed | null = null;
  let metadata: MetadataFetcher | null = null;
  let pools: PoolResolver | null = null;

  const engine = new Engine({
    now: Date.now(),
    model,
    log,
    config: {
      paperStartSol: Number(process.env.PAPER_START_SOL ?? 10) || 10,
      maxWallets: Math.max(5_000, Number(process.env.MAX_WALLETS ?? 80_000) || 80_000),
      // every resolved sample is on disk; memory only keeps a recent window
      maxSamplesInMemory: 10_000,
    },
    hooks: {
      persist: (s) => store.saveState(s),
      journal: (j) => store.journal(j),
      onSample: (s) => store.sample(s),
      onSignal: (rec) => server?.broadcast("signal", rec),
      onSettings: (s) => server?.broadcast("settings", s),
      onModel: (m) => {
        try {
          store.saveModel(m);
        } catch (e) {
          log.warn("model save failed", { err: String(e) });
        }
      },
      onPosition: (p, what) => {
        server?.broadcast("position", { position: p, what });
        telegram?.onPosition(p, what);
        if (what === "close" && p.mode === "live") live?.notePnl(p.pnl ?? 0, p.closedAt ?? Date.now());
      },
      needMeta: (mint, uri) => metadata?.request(mint, uri),
      needPool: (pool) => pools?.request(pool),
      watchMint: (mint, on) => pumpportal?.watch(mint, on),
    },
  });

  const saved = store.loadState();
  if (saved) engine.restore(saved);
  const wallets = store.loadWallets();
  if (wallets) engine.wallets.restore(wallets as never);

  if (config.liveTrading && config.walletSecret) {
    live = new LiveExecutor({
      walletSecret: config.walletSecret,
      rpcHttp: config.rpcHttp,
      maxPositionSol: config.liveMaxPositionSol,
      maxDailyLossSol: config.liveMaxDailyLossSol,
      log,
      engine: () => engine,
      onAlert: (m) => telegram?.send(m),
    });
    engine.executor = live;
    live.start();
    // align restored live positions with what the wallet really holds
    for (const p of [...engine.positions.values()].filter((x) => x.mode === "live")) {
      live.rpc
        .tokenBalance(live.wallet?.address ?? "", p.mint)
        .then((bal) => engine.reconcile(p.id, bal))
        .catch((e) => log.warn("live reconcile failed", { mint: p.mint, err: String(e) }));
    }
  } else if (engine.settings.mode === "live") {
    log.warn("settings asked for LIVE mode but the server has live trading disabled — switching to paper");
    engine.updateSettings({ mode: "paper" });
  }

  // ---- feeds ------------------------------------------------------------------------
  let rpc: RpcLogsFeed | null = null;
  const rpcHealthy = () => !!rpc && rpc.health.status === "open" && Date.now() - rpc.health.lastMsgAt < 20_000;
  const router = new EventRouter((ev) => {
    engine.ingest(ev as MarketEvent);
    if (config.record) {
      try {
        store.record(ev, ev.ts);
      } catch (e) {
        log.error("record failed", { err: String(e) });
      }
    }
  }, rpcHealthy);
  const onHealth = (h: Parameters<typeof engine.setFeedHealth>[0]) => engine.setFeedHealth(h);
  const feeds: { stop(): void }[] = [];

  if (config.feeds.has("sim")) {
    const sim = new SimFeed({ log, speed: config.simSpeed, predictability: config.simPredictability, onEvent: (ev) => router.push(ev as DecodedEvent), onHealth });
    sim.start();
    feeds.push(sim);
  }
  if (config.feeds.has("rpc")) {
    rpc = new RpcLogsFeed({ url: config.rpcWs, log, onEvent: (ev) => router.push(ev), onHealth });
    rpc.start();
    feeds.push(rpc);
    pools = new PoolResolver({ rpcHttp: config.rpcHttp, log, onResolved: (pool, mint) => engine.mapPool(pool, mint) });
  }
  if (config.feeds.has("pumpportal")) {
    pumpportal = new PumpPortalFeed({ apiKey: config.pumpPortalApiKey, critical: !config.feeds.has("rpc"), log, onEvent: (ev) => router.push(ev), onHealth });
    pumpportal.start();
    feeds.push(pumpportal);
  }
  if (config.feeds.has("dexscreener")) {
    const dex = new DexScreenerFeed({
      log,
      onEvent: (ev) => router.push(ev),
      onHealth,
      watchlist: () => {
        const held = [...engine.positions.values()].map((p) => p.mint);
        const top = engine.radar({ limit: 40, stage: "amm" }).map((r) => r.mint);
        return [...held, ...top];
      },
    });
    dex.start();
    feeds.push(dex);
  }
  if (config.metadata && !config.feeds.has("sim")) metadata = new MetadataFetcher({ log, onEvent: (ev) => router.push(ev) });
  const solPrice = new SolPrice(log, (usd) => (engine.solUsd = usd));
  if (!config.feeds.has("sim")) solPrice.start();
  else engine.solUsd = 200;

  // ---- engine clock & housekeeping ------------------------------------------------
  let lagMs = 0;
  let lastTick = Date.now();
  let lastSleepWarn = 0;
  const clock = setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lagMs = Math.max(0, gap - 100);
    if (gap > 60_000 && now - lastSleepWarn > 3_600_000) {
      // the computer slept (or froze): the market went on without us
      lastSleepWarn = now;
      const min = Math.round(gap / 60_000);
      log.warn(`the computer was asleep for ${min} min — the bot missed that time`);
      telegram?.send(`😴 The computer running SIGNAL was asleep for ${min} min, so the bot missed that time. Turn sleep off: Windows Settings → System → Power → Sleep → Never.`);
    }
    lastTick = now;
    engine.advance(now);
  }, 100);
  let diskMb = store.diskUsageMb();
  const hk = setInterval(() => {
    try {
      store.saveWallets(engine.wallets.snapshot());
      diskMb = store.diskUsageMb();
    } catch (e) {
      log.warn("wallet snapshot failed", { err: String(e) });
    }
  }, 10 * 60_000);
  // Memory guard: small cloud instances have 512 MB–1 GB. The wallet book is the one structure
  // that keeps growing with market activity, so when memory runs short forget the least
  // recently active wallets (keeping ones with a track record) instead of crashing. Two
  // limits count: V8's heap limit, and the container's own limit, which V8 may not know about.
  const heapLimit = getHeapStatistics().heap_size_limit;
  const boxed = (process as { constrainedMemory?: () => number | undefined }).constrainedMemory?.() ?? 0;
  const boxLimit = boxed > 0 && boxed < 64e9 ? boxed : 0;
  const memGuard = setInterval(() => {
    const { heapUsed, rss } = process.memoryUsage();
    if (heapUsed < heapLimit * 0.7 && !(boxLimit && rss > boxLimit * 0.8)) return;
    const before = engine.wallets.size;
    const dropped = engine.wallets.trim(0.5);
    log.warn("memory high: trimmed wallet book", { heapMb: Math.round(heapUsed / 1e6), rssMb: Math.round(rss / 1e6), limitMb: Math.round((boxLimit || heapLimit) / 1e6), before, dropped });
  }, 30_000);
  const daily = setInterval(() => {
    store.cleanup(config.recordDays, config.sampleDays);
    store.backupState();
  }, 3_600_000);
  store.cleanup(config.recordDays, config.sampleDays);
  store.backupState();

  const learner = new Learner({
    store,
    engine: () => engine,
    log,
    everyHours: config.learnEveryHours,
    sampleDays: config.sampleDays,
    onAdopt: (v) => telegram?.send(`🧠 New scoring model adopted: ${v}`),
    onTune: (m) => telegram?.send(m),
    onEdges: (m) => telegram?.send(m),
  });
  learner.start();

  /** (Re)starts Telegram from the current setup; linking a chat needs no restart. */
  const startTelegram = () => {
    telegram?.stop();
    const chat = effective("TELEGRAM_CHAT_ID");
    telegram = new Telegram({
      token: effective("TELEGRAM_BOT_TOKEN"),
      chatId: chat === "none" ? "" : chat,
      linkCode: setup.read().TELEGRAM_LINK_CODE,
      onLinked: (id) => {
        setup.write({ TELEGRAM_CHAT_ID: id, TELEGRAM_LINK_CODE: "" });
        log.info("telegram chat linked");
      },
      log,
      engine: () => engine,
    });
    telegram.start();
  };
  startTelegram();

  // Changing the data feed or the wallet restarts the bot (state is saved first). Only done
  // under a supervisor that starts it again: the Windows/Mac starters, Docker, systemd.
  let shutdownRef: (code: number) => void = () => {};
  const restart = () => {
    if (process.env.SIGNAL_SUPERVISED !== "1") return false;
    setTimeout(() => shutdownRef(75), 500);
    return true;
  };

  server = new DashboardServer({
    engine: () => engine,
    store,
    config,
    log,
    learner,
    live: () => live,
    token,
    setup,
    effective,
    restart,
    reloadTelegram: startTelegram,
    port: config.port,
    dashboardHtml,
    extraHealth: () => ({
      loopLagMs: lagMs,
      diskMb,
      router: { duplicates: router.duplicates, dropped: router.dropped },
      rpcFeed: rpc ? { decoded: rpc.decoded, truncated: rpc.truncated, failedTx: rpc.failedTx } : null,
      metadata: metadata ? { fetched: metadata.fetched, failed: metadata.failed } : null,
      pools: pools ? { resolved: pools.resolved } : null,
      simulated: config.feeds.has("sim"),
    }),
  });
  await server.listen(config.port, config.host);

  const shown = config.dashboardToken ? "(from DASHBOARD_TOKEN)" : token;
  const lan = lanAddress();
  log.info("================================================================");
  log.info(`SIGNAL running — dashboard on port ${config.port}`);
  log.info(`On this computer: http://localhost:${config.port}  (no token needed)`);
  if (lan) log.info(`On your phone at home (same Wi-Fi): http://${lan}:${config.port}/?token=${config.dashboardToken ? "<your DASHBOARD_TOKEN>" : token}`);
  log.info(`Access token ${shown}`);
  log.info(`Feeds: ${[...config.feeds].join(", ")} · mode ${engine.settings.mode} · auto-trading ${engine.settings.enabled ? "ON" : "off"}`);
  if (config.feeds.has("sim")) log.warn("SIMULATION MODE: all coins and prices are synthetic");
  log.info("================================================================");

  let stopping = false;
  const shutdown = (code: number) => {
    if (stopping) return;
    stopping = true;
    // set now: once everything is closed Node may exit on its own before the timer below
    process.exitCode = code;
    log.info("shutting down — saving state");
    try {
      engine.persistNow();
      store.saveWallets(engine.wallets.snapshot());
    } catch (e) {
      log.error("final save failed", { err: String(e) });
    }
    clearInterval(clock);
    clearInterval(hk);
    clearInterval(daily);
    clearInterval(memGuard);
    for (const f of feeds) f.stop();
    solPrice.stop();
    learner.stop();
    telegram?.stop();
    live?.stop();
    server?.close();
    store.close();
    setTimeout(() => process.exit(code), 300).unref();
  };
  shutdownRef = shutdown;
  if (process.env.SIGNAL_OPEN_BROWSER === "1") openBrowser(`http://localhost:${config.port}/`, config.dataDir);
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("unhandledRejection", (e) => log.error("unhandled rejection", { err: String(e) }));
  process.on("uncaughtException", (e) => {
    log.error("uncaught exception — saving state and restarting", { err: String(e), stack: e.stack });
    shutdown(1);
  });
  return { engine, server, store, shutdown };
}

const isEntry = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (isEntry || process.env.SIGNAL_FORCE_MAIN === "1") {
  main().catch((e) => {
    console.error("SIGNAL failed to start:", e);
    process.exit(1);
  });
}
