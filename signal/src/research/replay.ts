/**
 * Exact replay backtests: feed recorded (or simulated) market events through a fresh
 * engine with given settings/model. Because the engine is deterministic and paper fills
 * are priced on the recorded reserves with the configured delay, a replay reproduces
 * what the bot would have done — the honest way to test a setting before using it.
 */
import { Engine } from "../core/engine.js";
import type { ModelSpec } from "../core/model.js";
import type { Sample } from "../core/outcomes.js";
import { paperStats } from "../core/report.js";
import type { Settings } from "../core/settings.js";
import type { AmmSwap, MarketEvent } from "../core/types.js";

export interface ReplayResult {
  events: number;
  from: number;
  to: number;
  hours: number;
  settings: Settings;
  modelVersion: string;
  entries: number;
  signals: number;
  blocked: Record<string, number>;
  failed: number;
  exits: Record<string, number>;
  paper: ReturnType<typeof paperStats>;
  avgPnlPct: number;
  samples: Sample[];
  errors: number;
}

export async function replay(
  events: AsyncIterable<unknown> | Iterable<unknown>,
  opts: { settings: Partial<Settings>; model?: ModelSpec; latencyMs?: number; keepSamples?: boolean; paperStartSol?: number },
): Promise<ReplayResult> {
  let engine: Engine | null = null;
  let n = 0;
  let from = 0;
  let to = 0;
  let lastAdvance = 0;
  const samples: Sample[] = [];
  for await (const raw of events as AsyncIterable<unknown>) {
    const ev = raw as MarketEvent | AmmSwap;
    if (!ev || typeof ev !== "object" || typeof (ev as { ts?: unknown }).ts !== "number") continue;
    if (!engine) {
      from = ev.ts;
      engine = new Engine({
        now: ev.ts,
        model: opts.model ? JSON.parse(JSON.stringify(opts.model)) : undefined,
        settings: { enabled: true, mode: "paper", maxTradesPerHour: 500, ...opts.settings, paperLatencyMs: opts.latencyMs ?? opts.settings.paperLatencyMs ?? 1500 },
        config: { paperStartSol: opts.paperStartSol ?? 1000, seed: 11 },
        hooks: opts.keepSamples ? { onSample: (s) => samples.push(s) } : {},
      });
      engine.setFeedHealth({ name: "replay", status: "open", lastMsgAt: ev.ts, msgs: 0, reconnects: 0, errors: 0, critical: false });
    }
    engine.ingest(ev);
    n++;
    to = ev.ts;
    if (ev.ts - lastAdvance >= 250) {
      engine.advance(ev.ts);
      lastAdvance = ev.ts;
    }
  }
  if (!engine) throw new Error("no events to replay");
  // let pending orders and exits settle a little after the data ends
  for (let t = to; t <= to + 30_000; t += 500) engine.advance(t);
  const f = engine.funnel.summary(engine.clock, 1e6);
  const closed = engine.closed.toArray();
  const exits: Record<string, number> = {};
  for (const p of closed) if (p.status === "closed") exits[p.exitReason ?? "?"] = (exits[p.exitReason ?? "?"] ?? 0) + 1;
  const blocked: Record<string, number> = {};
  for (const r of f.reasons) blocked[r.reason] = r.n;
  const stats = paperStats(closed);
  return {
    events: n,
    from,
    to,
    hours: (to - from) / 3_600_000,
    settings: engine.settings,
    modelVersion: engine.model.version,
    entries: engine.stats.entries,
    signals: f.signals,
    blocked,
    failed: f.failed,
    exits,
    paper: stats,
    avgPnlPct: stats.avgPct,
    samples,
    errors: engine.stats.errors,
  };
}
