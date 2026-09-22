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
import { buildReport } from "../core/report.js";
import type { Logger } from "../core/util.js";
import { type Config, describeConfig } from "./config.js";
import type { Learner } from "./learner.js";
import type { LiveExecutor } from "./live/executor.js";
import type { ServerLog } from "./log.js";
import type { DataStore } from "./store.js";

export interface AppContext {
  engine: () => Engine;
  store: DataStore;
  config: Config;
  log: ServerLog;
  learner: Learner;
  live: () => LiveExecutor | null;
  token: string;
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

  constructor(private ctx: AppContext) {
    this.session = createHmac("sha256", ctx.token).update("signal-session-v1").digest("hex");
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
    const e = this.ctx.engine();
    const a = e.account();
    return { ...a, closed: a.closed.slice(0, 50), equityCurve: a.equityCurve.slice(-400) };
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

    if (path === "/healthz") return this.json(res, 200, { ok: true, uptime: process.uptime() });

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

    const e = this.ctx.engine();

    if (method === "GET") {
      switch (path) {
        case "/api/state":
          return this.json(res, 200, {
            settings: e.settings,
            account: this.accountSummary(),
            health: this.healthPayload(),
            funnel: { hour: e.funnel.summary(e.clock, 1), day: e.funnel.summary(e.clock, 24) },
            signals: e.funnel.recent.toArray().slice(-150).reverse(),
            serverTime: Date.now(),
            solUsd: e.solUsd,
          });
        case "/api/radar":
          return this.json(res, 200, {
            rows: e.radar({
              limit: Number(url.searchParams.get("limit") ?? 80),
              minScore: Number(url.searchParams.get("minScore") ?? 0),
              stage: (url.searchParams.get("stage") as "curve" | "amm" | "all") ?? "all",
              sort: (url.searchParams.get("sort") as "score" | "new" | "mcap") ?? "score",
            }),
          });
        case "/api/signals":
          return this.json(res, 200, { signals: e.funnel.recent.toArray().reverse(), hour: e.funnel.summary(e.clock, 1), day: e.funnel.summary(e.clock, 24) });
        case "/api/learn": {
          const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days") ?? 14)));
          const disk = this.ctx.store.loadSamples(days);
          const samples = disk.length ? disk : e.samples.toArray();
          return this.json(res, 200, buildReport(samples, e.settings, e.model, e.closed.toArray(), Date.now()));
        }
        case "/api/wallets":
          return this.json(res, 200, { wallets: e.wallets.leaderboard(60), smart: e.wallets.smartCount(), tracked: e.wallets.size });
        case "/api/narratives":
          return this.json(res, 200, {
            clusters: e.narratives.hot(40, (m) => e.tokens.get(m)?.mcapSol ?? 0).map((c) => ({
              ...c,
              leaderName: c.leader ? e.tokens.get(c.leader)?.name : undefined,
              leaderSymbol: c.leader ? e.tokens.get(c.leader)?.symbol : undefined,
              leaderScore: c.leader ? e.scoreOf(c.leader)?.res.score : undefined,
            })),
          });
        case "/api/logs":
          return this.json(res, 200, { lines: this.ctx.log.tail.toArray().slice(-200).reverse() });
        case "/api/stream":
          return this.stream(req, res);
        case "/api/export/samples":
          return this.exportFiles(res, "samples", "signal-samples.jsonl");
        case "/api/export/journal":
          return this.exportFiles(res, "journal", "signal-journal.jsonl");
        default:
          if (path.startsWith("/api/token/")) {
            const d = e.tokenDetail(decodeURIComponent(path.slice(11)));
            return d ? this.json(res, 200, d) : this.json(res, 404, { error: "Coin not tracked right now." });
          }
      }
    }

    if (method === "POST") {
      const b = (await this.body(req)) as Record<string, unknown>;
      switch (path) {
        case "/api/settings": {
          if (b.mode === "live" && !(this.ctx.config.liveTrading && this.ctx.live()?.ready())) {
            return this.json(res, 400, { error: "Live mode is locked: the server has no live trading enabled or the wallet is not ready. See Setup → Go live." });
          }
          const s = e.updateSettings(b);
          this.ctx.log.info("settings updated", { minScore: s.minScore, scoreOnly: s.scoreOnly, tp: s.tpPct, sl: s.slPct, enabled: s.enabled, mode: s.mode });
          this.broadcast("settings", s);
          e.persistNow();
          return this.json(res, 200, { settings: s });
        }
        case "/api/kill": {
          e.setKill(!!b.on, !!b.sellAll);
          e.persistNow();
          return this.json(res, 200, { killed: e.killed });
        }
        case "/api/learn/run": {
          const reports = await this.ctx.learner.run();
          return this.json(res, 200, { reports });
        }
        case "/api/live/resume": {
          this.ctx.live()?.resume();
          return this.json(res, 200, { live: this.ctx.live()?.status() ?? null });
        }
        case "/api/paper/reset": {
          if (e.positions.size > 0) return this.json(res, 400, { error: "Close open positions first." });
          e.paperBalance = e.cfg.paperStartSol * 1e9;
          e.stats.realized = 0;
          e.stats.dayPnl = 0;
          e.stats.wins = 0;
          e.stats.losses = 0;
          e.stats.equity = [{ t: Date.now(), v: e.paperBalance }];
          e.closed.clear();
          e.persistNow();
          return this.json(res, 200, { ok: true });
        }
        default:
          if (path.startsWith("/api/positions/") && path.endsWith("/close")) {
            const id = decodeURIComponent(path.slice(15, -6));
            const ok = e.closeManually(id, "manual");
            return this.json(res, ok ? 200 : 400, ok ? { ok } : { error: "Position is not closable right now (no price, or an order is in flight)." });
          }
      }
    }
    return this.json(res, 404, { error: "unknown endpoint" });
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
