/**
 * Dashboard API routes, shared by the Node server and the in-browser demo so both behave
 * identically. Platform-specific pieces (disk samples, learner, live wallet, logs) are
 * injected through the context.
 */
import type { Engine } from "./engine.js";
import type { Sample } from "./outcomes.js";
import { buildReport } from "./report.js";

export interface ApiContext {
  engine: () => Engine;
  samples: (days: number) => Sample[];
  health: () => Record<string, unknown>;
  learnRun: () => Promise<unknown[]>;
  live?: { status(): unknown; resume(): void; allowed(): boolean };
  logs: () => unknown[];
  onSettingsChanged?: () => void;
}

export interface ApiResult {
  status: number;
  json: unknown;
}

const ok = (json: unknown): ApiResult => ({ status: 200, json });
const err = (status: number, error: string): ApiResult => ({ status, json: { error } });

export function accountSummary(e: Engine) {
  const a = e.account();
  return { ...a, closed: a.closed.slice(0, 50), equityCurve: a.equityCurve.slice(-400) };
}

export async function handleApi(ctx: ApiContext, method: string, path: string, query: URLSearchParams, body: Record<string, unknown>): Promise<ApiResult> {
  const e = ctx.engine();
  if (method === "GET") {
    switch (path) {
      case "/api/state":
        return ok({
          settings: e.settings,
          account: accountSummary(e),
          health: ctx.health(),
          funnel: { hour: e.funnel.summary(e.clock, 1), day: e.funnel.summary(e.clock, 24) },
          signals: e.funnel.recent.toArray().slice(-150).reverse(),
          serverTime: Date.now(),
          solUsd: e.solUsd,
        });
      case "/api/radar":
        return ok({
          rows: e.radar({
            limit: Number(query.get("limit") ?? 80),
            minScore: Number(query.get("minScore") ?? 0),
            stage: (query.get("stage") as "curve" | "amm" | "all") ?? "all",
            sort: (query.get("sort") as "score" | "new" | "mcap") ?? "score",
          }),
        });
      case "/api/signals":
        return ok({ signals: e.funnel.recent.toArray().reverse(), hour: e.funnel.summary(e.clock, 1), day: e.funnel.summary(e.clock, 24) });
      case "/api/learn": {
        const days = Math.min(60, Math.max(1, Number(query.get("days") ?? 14)));
        const stored = ctx.samples(days);
        const samples = stored.length ? stored : e.samples.toArray();
        return ok(buildReport(samples, e.settings, e.model, e.closed.toArray(), Date.now()));
      }
      case "/api/wallets":
        return ok({ wallets: e.wallets.leaderboard(60), smart: e.wallets.smartCount(), tracked: e.wallets.size });
      case "/api/narratives":
        return ok({
          clusters: e.narratives.hot(40, (m) => e.tokens.get(m)?.mcapSol ?? 0).map((c) => ({
            ...c,
            leaderName: c.leader ? e.tokens.get(c.leader)?.name : undefined,
            leaderSymbol: c.leader ? e.tokens.get(c.leader)?.symbol : undefined,
            leaderScore: c.leader ? e.scoreOf(c.leader)?.res.score : undefined,
          })),
        });
      case "/api/logs":
        return ok({ lines: ctx.logs() });
      default:
        if (path.startsWith("/api/token/")) {
          const d = e.tokenDetail(decodeURIComponent(path.slice(11)));
          return d ? ok(d) : err(404, "Coin not tracked right now.");
        }
        return err(404, "unknown endpoint");
    }
  }
  if (method === "POST") {
    switch (path) {
      case "/api/settings": {
        if (body.mode === "live" && !ctx.live?.allowed()) {
          return err(400, "Live mode is locked: the server has no live trading enabled or the wallet is not ready. See Setup → Go live.");
        }
        const s = e.updateSettings(body);
        e.persistNow();
        ctx.onSettingsChanged?.();
        return ok({ settings: s });
      }
      case "/api/kill":
        e.setKill(!!body.on, !!body.sellAll);
        e.persistNow();
        return ok({ killed: e.killed });
      case "/api/learn/run":
        return ok({ reports: await ctx.learnRun() });
      case "/api/live/resume":
        ctx.live?.resume();
        return ok({ live: ctx.live?.status() ?? null });
      case "/api/paper/reset": {
        if (e.positions.size > 0) return err(400, "Close open positions first.");
        e.paperBalance = e.cfg.paperStartSol * 1e9;
        e.stats.realized = 0;
        e.stats.dayPnl = 0;
        e.stats.wins = 0;
        e.stats.losses = 0;
        e.stats.equity = [{ t: Date.now(), v: e.paperBalance }];
        e.closed.clear();
        e.persistNow();
        return ok({ ok: true });
      }
      default:
        if (path.startsWith("/api/positions/") && path.endsWith("/close")) {
          const id = decodeURIComponent(path.slice(15, -6));
          const done = e.closeManually(id, "manual");
          return done ? ok({ ok: true }) : err(400, "Position is not closable right now (no price, or an order is in flight).");
        }
        return err(404, "unknown endpoint");
    }
  }
  return err(405, "method not allowed");
}
