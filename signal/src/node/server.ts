/**
 * Dashboard HTTP server: static dashboard, JSON API, live Server-Sent Events stream.
 *
 * Security: every /api route needs the dashboard token (cookie after login, or a Bearer
 * header). The session cookie is HttpOnly + SameSite=Strict, state-changing requests
 * need a custom header (CSRF), login attempts are rate-limited, and the page is served
 * with a strict Content-Security-Policy.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Engine } from "../core/engine.js";
import { type ApiContext, accountSummary, handleApi } from "../core/api.js";
import type { Logger } from "../core/util.js";
import { type Config, describeConfig, isPublicRpc } from "./config.js";
import type { Learner } from "./learner.js";
import { getJson, postJson } from "./http.js";
import type { LiveExecutor } from "./live/executor.js";
import { parseWalletSecret } from "./live/solana.js";
import type { ServerLog } from "./log.js";
import {
  LIVE_PHRASE,
  type SetupKey,
  type SetupStore,
  isLocalRequest,
  isPrivateChannel,
  lanAddress,
  newLinkCode,
  rpcFromInput,
  telegramTokenLooksValid,
} from "./setup.js";
import type { DataStore } from "./store.js";
import type { Updater } from "./update.js";

export interface AppContext {
  engine: () => Engine;
  store: DataStore;
  config: Config;
  log: ServerLog;
  learner: Learner;
  live: () => LiveExecutor | null;
  token: string;
  /** settings saved from the dashboard's Setup page */
  setup: SetupStore;
  effective: (k: SetupKey) => string;
  /** restarts the bot to apply feed or wallet changes; false when nothing would start it again */
  restart: () => boolean;
  /** one-tap updates (null in tests that do not need them) */
  updater?: Updater | null;
  reloadTelegram: () => void;
  port: number;
  dashboardHtml: () => string;
  extraHealth: () => Record<string, unknown>;
}

interface Client {
  res: ServerResponse;
  id: number;
}

const MAX_BODY = 64 * 1024;

export class DashboardServer {
  private server: Server;
  private clients = new Set<Client>();
  private nextId = 1;
  private loginHits = new Map<string, number[]>();
  private timers: NodeJS.Timeout[] = [];
  private session: string;
  private csp = "";
  private api: ApiContext;

  constructor(private ctx: AppContext) {
    this.session = createHmac("sha256", ctx.token).update("signal-session-v1").digest("hex");
    this.api = {
      engine: ctx.engine,
      samples: (days) => this.cachedSamples(days),
      health: () => this.healthPayload(),
      learnRun: () => ctx.learner.run(),
      live: {
        status: () => ctx.live()?.status() ?? null,
        resume: () => ctx.live()?.resume(),
        allowed: () => ctx.config.liveTrading && !!ctx.live()?.ready(),
      },
      logs: () => ctx.log.tail.toArray().slice(-200).reverse(),
      edges: () => (ctx.learner.lastEdges ? { ...ctx.learner.lastEdges, running: ctx.learner.edgesRunning } : null),
      edgesRun: () => ctx.learner.findEdges(),
      onSettingsChanged: () => {
        const s = ctx.engine().settings;
        // the engine's onSettings hook already broadcasts the change to open dashboards
        ctx.log.info("settings updated", { minScore: s.minScore, scoreOnly: s.scoreOnly, tp: s.tpPct, sl: s.slPct, enabled: s.enabled, mode: s.mode });
      },
    };
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        ctx.log.error("http handler error", { err: String(e), url: req.url });
        if (!res.headersSent) this.json(res, 500, { error: "internal error" });
        else res.end();
      });
    });
    this.server.keepAliveTimeout = 65_000;
    this.server.headersTimeout = 70_000;
  }

  private sampleCache: { days: number; at: number; data: ReturnType<DataStore["loadSamples"]> } | null = null;
  private sampleCacheTimer: NodeJS.Timeout | null = null;

  /** The Learn tab refreshes every minute; reading days of samples from disk each time is wasteful. */
  private cachedSamples(days: number) {
    const c = this.sampleCache;
    if (c && c.days === days && Date.now() - c.at < 5 * 60_000) return c.data;
    const data = this.ctx.store.loadSamples(days);
    this.sampleCache = { days, at: Date.now(), data };
    // let the memory go when nobody is looking at the Learn tab
    if (this.sampleCacheTimer) clearTimeout(this.sampleCacheTimer);
    this.sampleCacheTimer = setTimeout(() => (this.sampleCache = null), 6 * 60_000);
    this.sampleCacheTimer.unref?.();
    return data;
  }

  listen(port: number, host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        this.server.off("error", reject);
        resolve();
      });
    }).then(() => {
      this.timers.push(setInterval(() => this.pushRadar(), 2_000));
      this.timers.push(setInterval(() => this.broadcast("health", this.healthPayload()), 5_000));
      this.timers.push(setInterval(() => this.heartbeat(), 15_000));
    });
  }

  get address() {
    return this.server.address();
  }

  close() {
    for (const t of this.timers) clearInterval(t);
    if (this.sampleCacheTimer) clearTimeout(this.sampleCacheTimer);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
    this.server.close();
  }

  // -------------------------------------------------------------------------------

  broadcast(event: string, data: unknown) {
    if (this.clients.size === 0) return;
    let payload: string;
    try {
      payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    } catch {
      return;
    }
    for (const c of [...this.clients]) {
      try {
        c.res.write(payload);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  private heartbeat() {
    for (const c of [...this.clients]) {
      try {
        c.res.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  private pushRadar() {
    if (this.clients.size === 0) return;
    const e = this.ctx.engine();
    this.broadcast("radar", { rows: e.radar({ limit: 80 }), account: this.accountSummary() });
  }

  private accountSummary() {
    return accountSummary(this.ctx.engine());
  }

  private healthPayload() {
    const e = this.ctx.engine();
    return {
      ...e.health(),
      config: describeConfig(this.ctx.config),
      live: this.ctx.live()?.status() ?? null,
      recorded: this.ctx.store.recorded,
      ...this.ctx.extraHealth(),
      learner: { lastRun: this.ctx.learner.lastRun, running: this.ctx.learner.running, lastError: this.ctx.learner.lastError, reports: this.ctx.learner.lastReports },
    };
  }

  // -------------------------------------------------------------------------------

  private authed(req: IncomingMessage): boolean {
    if (isLocalRequest(req)) return true; // the computer running the bot: no token needed
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ") && safeEq(auth.slice(7).trim(), this.ctx.token)) return true;
    const cookie = req.headers.cookie ?? "";
    const m = /(?:^|;\s*)signal_session=([a-f0-9]{64})/.exec(cookie);
    return !!m && safeEq(m[1]!, this.session);
  }

  private setSession(req: IncomingMessage, res: ServerResponse) {
    const secure = req.headers["x-forwarded-proto"] === "https" || (req.socket as { encrypted?: boolean }).encrypted;
    res.setHeader("set-cookie", `signal_session=${this.session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 60}${secure ? "; Secure" : ""}`);
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(text);
  }

  private async body(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error("body too large"));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", reject);
    });
  }

  private ip(req: IncomingMessage) {
    const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim();
    return fwd || req.socket.remoteAddress || "?";
  }

  private loginAllowed(ip: string) {
    const now = Date.now();
    const hits = (this.loginHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    hits.push(now);
    this.loginHits.set(ip, hits);
    if (this.loginHits.size > 5_000) this.loginHits.clear();
    return hits.length <= 10;
  }

  private page(res: ServerResponse) {
    const html = this.ctx.dashboardHtml();
    if (!this.csp) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`);
      this.csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "font-src 'self' data:",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join("; ");
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy": this.csp,
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    res.end(html);
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (path === "/healthz") return this.json(res, 200, { ok: true, app: "signal", uptime: process.uptime() });

    if (method === "GET" && (path === "/" || path === "/index.html")) {
      const t = url.searchParams.get("token");
      if (t) {
        if (this.loginAllowed(this.ip(req)) && safeEq(t, this.ctx.token)) {
          this.setSession(req, res);
          res.writeHead(302, { location: "/" });
          return res.end();
        }
      }
      return this.page(res);
    }

    if (path === "/api/login" && method === "POST") {
      if (!this.loginAllowed(this.ip(req))) return this.json(res, 429, { error: "Too many attempts — wait a minute." });
      const b = (await this.body(req)) as { token?: string };
      if (typeof b.token === "string" && safeEq(b.token.trim(), this.ctx.token)) {
        this.setSession(req, res);
        return this.json(res, 200, { ok: true });
      }
      return this.json(res, 401, { error: "Wrong access token." });
    }

    if (!path.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    if (!this.authed(req)) return this.json(res, 401, { error: "login required" });
    if (method === "POST" && req.headers["x-signal"] !== "1") return this.json(res, 403, { error: "missing x-signal header" });

    if (method === "GET") {
      if (path === "/api/stream") return this.stream(req, res);
      if (path === "/api/export/samples") return this.exportFiles(res, "samples", "signal-samples.jsonl");
      if (path === "/api/export/journal") return this.exportFiles(res, "journal", "signal-journal.jsonl");
    }
    const raw = method === "POST" ? await this.body(req) : {};
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    if (path === "/api/setup" && method === "GET") return this.json(res, 200, this.setupStatus(req));
    if (path.startsWith("/api/setup/") || path === "/api/restart") {
      if (method !== "POST") return this.json(res, 405, { error: "method not allowed" });
      const r = await this.setupAction(req, path, body);
      return this.json(res, r.status, r.json);
    }
    const r = await handleApi(this.api, method, path, url.searchParams, body);
    return this.json(res, r.status, r.json);
  }

  // ---- setup from the dashboard ----------------------------------------------------

  private setupStatus(req: IncomingMessage) {
    const eff = this.ctx.effective;
    const rpcUrl = eff("RPC_URL") || this.ctx.config.rpcHttp;
    let host = "";
    try {
      host = new URL(rpcUrl).host;
    } catch {
      host = "invalid";
    }
    const feed = this.ctx.engine().health().feeds.find((f) => f.name === "solana-rpc");
    const up = Math.max(120, process.uptime());
    const perDay = (bytes?: number) => (bytes ? (bytes / 1e6) * (86_400 / up) : null);
    const tgToken = eff("TELEGRAM_BOT_TOKEN");
    const tgChat = eff("TELEGRAM_CHAT_ID");
    let address: string | null = null;
    const key = eff("WALLET_PRIVATE_KEY");
    if (key) {
      try {
        address = parseWalletSecret(key).address;
      } catch {
        address = null;
      }
    }
    const lan = lanAddress();
    const num = (k: SetupKey, d: number) => (Number.isFinite(Number(eff(k))) && eff(k) !== "" ? Number(eff(k)) : d);
    return {
      supervised: process.env.SIGNAL_SUPERVISED === "1",
      local: isLocalRequest(req),
      privateChannel: isPrivateChannel(req),
      rpc: {
        host,
        isPublic: isPublicRpc(rpcUrl),
      },
      stream: {
        /** running now */
        source: this.ctx.config.streamSource,
        /** saved choice (applies after a restart) */
        chosen: eff("STREAM_SOURCE") === "rpc" ? "rpc" : "public",
        budgetMb: this.ctx.config.streamBudgetMb,
        ammFirehose: this.ctx.config.ammFirehose,
        feed: feed
          ? {
              host: feed.host ?? "",
              status: feed.status,
              msgs: feed.msgs,
              mbPerDay: perDay(feed.bytes),
              netMbPerDay: perDay(feed.wire),
              budget: feed.budget ?? null,
            }
          : null,
      },
      telegram: {
        tokenSet: !!tgToken && tgToken !== "off",
        linked: !!tgChat && tgChat !== "none",
        code: !tgChat || tgChat === "none" ? (this.ctx.setup.read().TELEGRAM_LINK_CODE ?? null) : null,
      },
      live: {
        enabled: this.ctx.config.liveTrading,
        pendingRestart: (eff("LIVE_TRADING") === LIVE_PHRASE) !== this.ctx.config.liveTrading,
        walletSet: !!address,
        address,
        maxPositionSol: num("LIVE_MAX_POSITION_SOL", 0.05),
        maxDailyLossSol: num("LIVE_MAX_DAILY_LOSS_SOL", 0.25),
        ready: !!this.ctx.live()?.ready(),
      },
      phoneUrl: lan ? `http://${lan}:${this.ctx.port}/?token=${this.ctx.token}` : null,
      update: this.ctx.updater?.status() ?? null,
    };
  }

  private async setupAction(req: IncomingMessage, path: string, body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
    const fail = (status: number, error: string) => ({ status, json: { error } });
    const done = (extra: Record<string, unknown> = {}) => ({ status: 200, json: { ok: true, ...extra } });
    const restartNote = (restarting: boolean) => (restarting ? {} : { note: "Saved. Close the bot window and start it again to apply." });
    switch (path) {
      case "/api/setup/rpc": {
        const r = rpcFromInput(String(body.key ?? ""));
        if (!r) return fail(400, "Paste your Helius API key (it looks like 1a2b3c4d-5e6f-…) or a full RPC address.");
        const test = await postJson<{ result?: number }>(r.http, { jsonrpc: "2.0", id: 1, method: "getSlot" }, { timeoutMs: 10_000 });
        if (!test.ok || typeof test.json?.result !== "number") {
          return fail(400, `That key did not work (${test.status ? `error ${test.status}` : "no answer"}). Copy it again from your Helius dashboard.`);
        }
        this.ctx.setup.write({ RPC_URL: r.http, RPC_WS_URL: r.ws });
        this.ctx.log.info("data feed changed from the dashboard", { host: new URL(r.http).host });
        const restarting = this.ctx.restart();
        return done({ slot: test.json.result, restarting, ...restartNote(restarting) });
      }
      case "/api/setup/stream": {
        const source = body.source === "rpc" ? "rpc" : "public";
        const budget = Math.round(Number(body.budgetMb ?? this.ctx.config.streamBudgetMb));
        if (source === "rpc" && isPublicRpc(this.ctx.effective("RPC_WS_URL") || this.ctx.config.rpcWs)) return fail(400, "Add your RPC key first (step 1), then choose to stream through it.");
        if (!(budget >= 50 && budget <= 100_000)) return fail(400, "The daily cap must be between 50 and 100,000 MB.");
        this.ctx.setup.write({ STREAM_SOURCE: source, STREAM_BUDGET_MB_PER_DAY: String(budget) });
        this.ctx.log.info("market data source changed from the dashboard", { source, budget });
        const restarting = this.ctx.restart();
        return done({ restarting, ...restartNote(restarting) });
      }
      case "/api/setup/telegram": {
        const token = String(body.token ?? "").trim();
        if (!telegramTokenLooksValid(token)) return fail(400, "Paste the token @BotFather gave you (it looks like 123456789:AAH…).");
        const me = await getJson<{ ok: boolean; result?: { username?: string } }>(`https://api.telegram.org/bot${token}/getMe`, { timeoutMs: 10_000 });
        if (!me?.ok) return fail(400, "Telegram did not accept that token. Copy it again from @BotFather.");
        const code = newLinkCode();
        this.ctx.setup.write({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "none", TELEGRAM_LINK_CODE: code });
        this.ctx.reloadTelegram();
        return done({ bot: me.result?.username ?? null, code });
      }
      case "/api/setup/telegram-off":
        this.ctx.setup.write({ TELEGRAM_BOT_TOKEN: "off", TELEGRAM_CHAT_ID: "none", TELEGRAM_LINK_CODE: "" });
        this.ctx.reloadTelegram();
        return done();
      case "/api/setup/live": {
        if (!isPrivateChannel(req)) return fail(403, `For safety, add the wallet on the computer running the bot: open http://localhost:${this.ctx.port} there.`);
        if (String(body.confirm ?? "").trim().toUpperCase().replace(/\s+/g, "_") !== LIVE_PHRASE) return fail(400, 'Type "I understand the risk" to confirm.');
        const maxPos = Number(body.maxPositionSol);
        const maxLoss = Number(body.maxDailyLossSol);
        if (!(maxPos > 0 && maxPos <= 10)) return fail(400, "Max per trade must be between 0 and 10 SOL.");
        if (!(maxLoss > 0 && maxLoss <= 100)) return fail(400, "Max loss per day must be between 0 and 100 SOL.");
        const key = String(body.walletKey ?? "").trim();
        let address: string;
        try {
          address = parseWalletSecret(key || this.ctx.effective("WALLET_PRIVATE_KEY")).address;
        } catch {
          return fail(400, key ? "That is not a Solana private key. In Phantom: Settings → Manage accounts → your bot wallet → Show private key." : "Paste the bot wallet's private key.");
        }
        this.ctx.setup.write({
          LIVE_TRADING: LIVE_PHRASE,
          ...(key ? { WALLET_PRIVATE_KEY: key } : {}),
          LIVE_MAX_POSITION_SOL: String(maxPos),
          LIVE_MAX_DAILY_LOSS_SOL: String(maxLoss),
        });
        this.ctx.log.warn("live trading enabled from the dashboard", { wallet: address, maxPos, maxLoss });
        const restarting = this.ctx.restart();
        return done({ address, restarting, ...restartNote(restarting) });
      }
      case "/api/setup/live-off": {
        const e = this.ctx.engine();
        e.updateSettings({ mode: "paper" });
        e.persistNow();
        this.ctx.setup.write({ LIVE_TRADING: "off" });
        this.ctx.log.warn("live trading switched off from the dashboard");
        const restarting = this.ctx.restart();
        return done({ restarting, ...restartNote(restarting) });
      }
      case "/api/setup/wallet-remove": {
        if (!isPrivateChannel(req)) return fail(403, `Remove the wallet on the computer running the bot: open http://localhost:${this.ctx.port} there.`);
        const e = this.ctx.engine();
        e.updateSettings({ mode: "paper" });
        e.persistNow();
        this.ctx.setup.write({ LIVE_TRADING: "off", WALLET_PRIVATE_KEY: "" });
        const restarting = this.ctx.restart();
        return done({ restarting, ...restartNote(restarting) });
      }
      case "/api/setup/update-check": {
        const u = this.ctx.updater;
        if (!u) return fail(400, "Updates are not available here.");
        return done({ update: await u.check() });
      }
      case "/api/setup/update": {
        const u = this.ctx.updater;
        if (!u) return fail(400, "Updates are not available here.");
        const r = await u.apply();
        if (!r.ok) return fail(u.can ? 502 : 400, r.error);
        if (r.upToDate) return done({ upToDate: true, note: "SIGNAL is already up to date." });
        return done({ version: r.version, restarting: r.restarting, ...restartNote(r.restarting) });
      }
      case "/api/restart": {
        const restarting = this.ctx.restart();
        return restarting ? done({ restarting }) : fail(400, "This bot was started without its starter, so it cannot restart itself. Close it and start it again.");
      }
      default:
        return fail(404, "unknown endpoint");
    }
  }

  private stream(req: IncomingMessage, res: ServerResponse) {
    if (this.clients.size >= 25) return this.json(res, 503, { error: "too many live connections" });
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const c: Client = { res, id: this.nextId++ };
    this.clients.add(c);
    const e = this.ctx.engine();
    res.write(`event: hello\ndata: ${JSON.stringify({ settings: e.settings, account: this.accountSummary(), rows: e.radar({ limit: 80 }), serverTime: Date.now() })}\n\n`);
    req.on("close", () => this.clients.delete(c));
  }

  private exportFiles(res: ServerResponse, sub: string, name: string) {
    res.writeHead(200, { "content-type": "application/x-ndjson", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" });
    try {
      const dir = join(this.ctx.store.dir, sub);
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) res.write(readFileSync(join(dir, f)));
    } catch {
      /* nothing recorded yet */
    }
    res.end();
  }
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type { Logger };
