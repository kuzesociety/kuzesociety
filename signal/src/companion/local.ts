/**
 * The whole SIGNAL engine running inside the page on a simulated market: same scoring,
 * entry rules, exits, risk limits and API routes as the server (core/api.ts), with the
 * agent simulator standing in for the Solana feeds. Nothing leaves the browser.
 */
import { type ApiContext, accountSummary, handleApi } from "../core/api";
import { type EdgeReport, findEdgesAsync } from "../core/edges";
import { Engine, type FeedHealth } from "../core/engine";
import { trainAndSelect } from "../core/learn";
import { priorModel } from "../core/model";
import type { Settings } from "../core/settings";
import type { AmmSwap, MarketEvent } from "../core/types";
import { type Logger, Ring } from "../core/util";
import { MarketSim } from "../sim/market";
import type { Transport } from "../web/store";

export interface DemoOptions {
  /** simulated launches per minute (pump.fun itself does roughly 10–20) */
  launchesPerMin: number;
  /** how much early order flow reveals about a coin's future: 0 = nothing, 1 = everything */
  predictability: number;
  /** minutes of market history simulated at start so the radar opens full */
  warmMinutes: number;
  onProgress?: (fraction: number) => void;
}

type Listener = (event: string, data: unknown) => void;

const SETTINGS_KEY = "signal-demo-settings-v1";

/** The user's plan from the start: buy at score 75+, sell at 2× or −50%, score decides alone. */
const DEMO_DEFAULTS: Partial<Settings> = { enabled: true, scoreOnly: true, minScore: 75, tpPct: 100, slPct: 50, positionSol: 0.1, maxOpen: 3 };

function loadSaved(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode or blocked storage: settings last for this visit only */
  }
}

export function createLocalEngine(o: DemoOptions) {
  const listeners = new Set<Listener>();
  const emit = (event: string, data: unknown) => {
    for (const l of listeners) l(event, data);
  };
  const lines = new Ring<{ ts: number; level: string; msg: string }>(300);
  const logAt = (level: string) => (msg: string) => lines.push({ ts: Date.now(), level, msg });
  const log: Logger = { debug() {}, info: logAt("info"), warn: logAt("warn"), error: logAt("error") };

  const warmMs = Math.max(0, o.warmMinutes) * 60_000;
  const t0 = Date.now() - warmMs;
  let seed = (Math.random() * 1e9) | 0;
  const newSim = (from: number) =>
    new MarketSim({ seed: seed++, startTs: from, durationMs: 12 * 3_600_000, launchesPerMin: o.launchesPerMin, predictability: o.predictability });
  let gen = newSim(t0).run();
  let pending: MarketEvent | AmmSwap | null = null;
  const feed: FeedHealth = { name: "simulator", status: "open", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: true, note: "simulated market in this page" };

  const engine = new Engine({
    now: t0,
    model: priorModel(t0),
    log,
    settings: { ...DEMO_DEFAULTS, ...loadSaved(), mode: "paper" },
    config: { maxWallets: 40_000, outcomeMaxOpen: 8_000, maxSamplesInMemory: 8_000 },
    hooks: {
      onSignal: (rec) => emit("signal", rec),
      onSettings: (s) => {
        save(s);
        emit("settings", s);
      },
      onPosition: (p, what) => emit("position", { position: p, what }),
    },
  });
  engine.setFeedHealth(feed);
  log.warn("Demo: the SIGNAL engine is running on a simulated market inside this page.");

  let lastAdvance = 0;
  let caughtUp = warmMs === 0;
  let learner = { lastRun: 0, running: false, lastError: "", reports: [] as unknown[] };
  let edges: EdgeReport | null = null;

  /** Releases simulated events up to `until`, spending at most `budgetMs` of main-thread time. */
  function pump(until: number, budgetMs: number): boolean {
    const started = performance.now();
    let n = 0;
    for (;;) {
      if (!pending) {
        const next = gen.next();
        if (next.done) {
          gen = newSim(Math.max(engine.clock, until - 1)).run();
          continue;
        }
        pending = next.value;
      }
      if (pending.ts > until) break;
      engine.ingest(pending);
      feed.msgs++;
      feed.lastMsgAt = pending.ts;
      if (pending.ts - lastAdvance >= 250) {
        engine.advance(pending.ts);
        lastAdvance = pending.ts;
      }
      pending = null;
      if (++n % 200 === 0 && performance.now() - started > budgetMs) return false;
    }
    engine.advance(until);
    lastAdvance = until;
    return true;
  }

  const ready = new Promise<void>((resolve) => {
    const step = () => {
      const now = Date.now();
      const done = pump(now, 40);
      o.onProgress?.(Math.min(1, (engine.clock - t0) / Math.max(1, now - t0)));
      if (done) {
        caughtUp = true;
        resolve();
      } else setTimeout(step, 0);
    };
    if (warmMs === 0) resolve();
    else setTimeout(step, 30);
  });

  // Real-time clock after warm-up. Browsers throttle hidden tabs; a short gap is replayed in
  // slices, a long one is skipped (a fresh stretch of market starts a minute before now).
  const tick = setInterval(() => {
    if (!caughtUp) return;
    const now = Date.now();
    if (now - engine.clock > 10 * 60_000) {
      pending = null;
      gen = newSim(now - 60_000).run();
      engine.advance(now - 60_000);
      lastAdvance = now - 60_000;
      log.info("The page was in the background; the demo market skipped ahead.");
    }
    pump(now, 25);
  }, 100);

  const health = () => ({
    ...engine.health(),
    simulated: true,
    loopLagMs: 0,
    diskMb: 0,
    recorded: 0,
    live: null,
    config: {
      runs: "in this page (demo)",
      feeds: ["simulator"],
      launchesPerMinute: o.launchesPerMin,
      predictability: o.predictability,
      liveTrading: "impossible in the demo",
    },
    learner,
  });

  const ctx: ApiContext = {
    engine: () => engine,
    samples: () => [],
    health,
    learnRun: async () => {
      learner = { ...learner, running: true };
      try {
        const rows = engine.samples
          .toArray()
          .filter((s) => s.kind === "checkpoint")
          .map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
        const { model, reports } = trainAndSelect(engine.model, rows, { now: Date.now() });
        if (reports.some((r) => r.adopted)) engine.setModel(model);
        learner = { lastRun: Date.now(), running: false, lastError: "", reports };
        return reports;
      } catch (e) {
        learner = { ...learner, running: false, lastError: String(e) };
        return [];
      }
    },
    logs: () => lines.toArray().slice(-200).reverse(),
    edges: () => edges,
    edgesRun: async () => (edges = await findEdgesAsync(engine.samples.toArray(), { placeboRuns: 3 })),
  };

  const transport: Transport = {
    async request(path, body) {
      const url = new URL(path, "http://demo.local");
      const method = body === undefined ? "GET" : "POST";
      if (path === "/api/login") return { status: 200, json: { ok: true } };
      const r = await handleApi(ctx, method, url.pathname, url.searchParams, (body ?? {}) as Record<string, unknown>);
      // structured clone keeps the UI from holding live engine objects
      return { status: r.status, json: JSON.parse(JSON.stringify(r.json)) };
    },
    stream(on, onOpen) {
      const l: Listener = (ev, data) => on(ev, JSON.parse(JSON.stringify(data)));
      listeners.add(l);
      const send = (ev: string, data: unknown) => l(ev, data);
      const hello = () => send("hello", { settings: engine.settings, account: accountSummary(engine), rows: engine.radar({ limit: 80 }), serverTime: Date.now() });
      const t1 = setInterval(() => send("radar", { rows: engine.radar({ limit: 80 }), account: accountSummary(engine) }), 2_000);
      const t2 = setInterval(() => send("health", health()), 5_000);
      setTimeout(() => {
        onOpen();
        hello();
        send("health", health());
      }, 0);
      return () => {
        listeners.delete(l);
        clearInterval(t1);
        clearInterval(t2);
      };
    },
  };

  return { transport, ready, engine, stop: () => clearInterval(tick) };
}
