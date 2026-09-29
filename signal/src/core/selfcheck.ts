/**
 * Self-check: the bot watching itself, so a problem does not wait for someone to spot it.
 *
 * Each check answers one question in plain words — ok, info, warn or fail:
 *   1. Recorded vs real: do the would-be trades the bot learns from match the trades it
 *      actually makes? Every closed trade is paired with the recording of the same coin at the
 *      same moment (its signal sample), under the same exits. If the recordings come out clearly
 *      better, everything proven on them — the score, the edge finder, the autopilot — is too
 *      optimistic (a price that stopped updating, fills that could not happen, …).
 *   2. The rule in use delivers: its own trades against what it promised.
 *   3. Decisions: the autopilot should not keep changing its mind.
 *   4. What the bot can see: would-be trades that went unobserved, and the trade feed.
 *   5. Extraordinary promises: a rule claiming more per trade than a real market plausibly pays.
 *   6. The learning loop: runs on time, without errors.
 *   7. The engine: errors, saves.
 */
import type { AutopilotState } from "./autopilot.js";
import { GRID, PATH_MIN, type Sample, comboObserved, seenAt } from "./outcomes.js";
import type { Position } from "./positions.js";
import { clusteredMeanCI, hourOf } from "./util.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type CheckStatus = "ok" | "info" | "warn" | "fail";

export interface Check {
  key: string;
  status: CheckStatus;
  title: string;
  detail: string;
}

export const SELFCHECK = {
  /** trades compared, recorded vs real */
  windowMs: 7 * DAY,
  /** pairs before the comparison is judged */
  minPairs: 20,
  /** recordings better than real trades by more than this (per trade, at the low end of the range) → warn */
  gap: 0.05,
  /** rule switches a day before the autopilot looks like it chases noise */
  maxSwitches: 4,
  /** a promise above this per trade is extraordinary for a real market */
  extraordinary: 0.3,
};

const pct = (x: number, d = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} points`;

/**
 * What the recording of a trade's signal made under the trade's own exit plan, as far as it was
 * observed (undefined when that cannot be read from the recording). Seen is enough here, unlike
 * for evidence (counts): each recording is compared with the real trade on the same coin, so
 * which coins are compared does not move the difference.
 */
export function recordedReturn(s: Sample, p: Pick<Position, "plan">): number | undefined {
  const { tpPct, slPct, maxHoldMin } = p.plan;
  const gi = GRID.findIndex((g) => g.tp === tpPct && g.sl === slPct);
  if (gi < 0 || s.grid?.length !== GRID.length || !s.gridT) return undefined;
  const t = s.gridT[gi]!;
  if (maxHoldMin > 0 && t > maxHoldMin * 60) {
    // the trade would have been sold at its time limit
    const k = PATH_MIN.indexOf(maxHoldMin as (typeof PATH_MIN)[number]);
    const v = k >= 0 ? s.path?.[k] : undefined;
    return v !== undefined && v !== null && seenAt(s, maxHoldMin * 60) ? v : undefined;
  }
  return comboObserved(s, gi) ? s.grid[gi] : undefined;
}

/** Closed trades paired with the recording of their own signal: [recorded, real, hour]. */
export function pairTrades(closed: Position[], samples: Sample[], from: number): { rec: number; real: number; hour: number }[] {
  const signals = new Map<string, Sample[]>();
  for (const s of samples) {
    if (s.kind !== "signal") continue;
    let l = signals.get(s.mint);
    if (!l) signals.set(s.mint, (l = []));
    l.push(s);
  }
  const out: { rec: number; real: number; hour: number }[] = [];
  for (const p of closed) {
    if (p.status !== "closed" || (p.closedAt ?? 0) < from || !Number.isFinite(p.pnlPct)) continue;
    // one clean exit under the plan: not a trailing stop, a partial exit, a stale coin, a kill or a manual sale
    if (!["tp", "sl", "time"].includes(p.exitReason ?? "") || p.plan.trailPct > 0 || p.plan.takeInitials) continue;
    // the recording of the same signal starts when that entry lands (signal + delay)
    const s = signals.get(p.mint)?.find((x) => x.ts >= p.signalAt && x.ts - p.signalAt <= 120_000);
    if (!s) continue;
    const rec = recordedReturn(s, p);
    if (rec === undefined) continue;
    out.push({ rec, real: (p.pnlPct ?? 0) / 100, hour: hourOf(p.openedAt) });
  }
  return out;
}

export interface SelfCheckInput {
  now: number;
  closed: Position[];
  /** recorded would-be trades (the newest, at least the check window) */
  samples: Sample[];
  mode: "paper" | "live";
  autopilotOn: boolean;
  autopilot: AutopilotState;
  learning: { everyHours: number; lastRun: number; lastError: string; edgesAt: number; startedAt: number };
  /** `feedDown`: an outage — no trade data for a minute or more, not a reconnect of a few seconds */
  engine: { errors: number; saveFailures: number; saveError: string; feedDown: boolean };
  /** the data folder against its budget (MB), and the disk's free space (null: unknown) */
  storage?: { usedMb: number; maxMb: number; freeMb: number | null; minFreeMb: number; recordingPaused: boolean };
}

/** 1. Recorded vs real. */
export function recordedVsReal(closed: Position[], samples: Sample[], now: number): Check {
  const title = "Recordings match real trades";
  const from = now - SELFCHECK.windowMs;
  const pairs = pairTrades(closed, samples, from);
  if (pairs.length < SELFCHECK.minPairs) {
    const done = closed.filter((p) => p.status === "closed" && (p.closedAt ?? 0) >= from).length;
    return {
      key: "recorded",
      status: "info",
      title,
      detail: `Not enough trades to compare yet: ${pairs.length} of ${SELFCHECK.minPairs} needed (${done} trades closed in the last 7 days). A trade is compared once the recording of its own moment has finished (up to 6 h), under the same exits, as far as it was observed; recordings of graduated coins from before this version are not trusted.`,
    };
  }
  const d = clusteredMeanCI(
    pairs.map((x) => x.rec - x.real),
    pairs.map((x) => x.hour),
  );
  const rec = pairs.reduce((a, x) => a + x.rec, 0) / pairs.length;
  const real = pairs.reduce((a, x) => a + x.real, 0) / pairs.length;
  const range = `95% range ${pts(d.lo)} to ${pts(d.hi)}`;
  if (d.lo > SELFCHECK.gap)
    return {
      key: "recorded",
      status: "warn",
      title,
      detail: `On ${pairs.length} trades the recordings of the same coins at the same moments made ${pct(rec)} per trade, the trades themselves ${pct(real)} (${pts(d.mean)}, ${range}). What the bot learns and proves from recordings is too optimistic — its promises will not be kept.`,
    };
  if (d.hi < -SELFCHECK.gap)
    return { key: "recorded", status: "info", title, detail: `The bot's own ${pairs.length} trades did better than their recordings (${pts(-d.mean)} per trade): the recordings are on the cautious side.` };
  return { key: "recorded", status: "ok", title, detail: `On ${pairs.length} trades recordings and real trades agree: ${pct(rec)} vs ${pct(real)} per trade (${pts(d.mean)}, ${range}).` };
}

/** 2. The rule in use delivers what it promised. */
export function ruleDelivers(i: SelfCheckInput): Check {
  const title = "The rule in use delivers";
  const st = i.autopilot;
  if (!i.autopilotOn || !st.active || !st.proof) {
    const day = i.closed.filter((p) => p.status === "closed" && p.mode === i.mode && (p.closedAt ?? 0) >= i.now - DAY && Number.isFinite(p.pnlPct));
    const pnl = day.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
    return { key: "rule", status: "info", title, detail: `Your own rule — nothing was promised for it. Last 24 h: ${day.length} trades, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} SOL.` };
  }
  const mine = i.closed.filter((p) => p.status === "closed" && p.mode === i.mode && p.openedAt >= st.since && Number.isFinite(p.pnlPct));
  if (mine.length < 10) return { key: "rule", status: "info", title, detail: `${mine.length} trades so far under "${st.active}" — it promised at least ${pct(st.proof.lo)} per trade.` };
  const m = clusteredMeanCI(
    mine.map((p) => (p.pnlPct ?? 0) / 100),
    mine.map((p) => hourOf(p.openedAt)),
  );
  const said = `Its ${mine.length} trades averaged ${pct(m.mean)} (95% range ${pct(m.lo)} to ${pct(m.hi)}); it promised at least ${pct(st.proof.lo)}, typically ${pct(st.proof.mean)}.`;
  if (m.mean < st.proof.lo) return { key: "rule", status: "warn", title, detail: `${said} Below its promise so far — once its own trades or the coins after its proof show it clearly worse, the autopilot drops it.` };
  return { key: "rule", status: "ok", title, detail: said };
}

/** 3. The autopilot does not keep changing its mind. */
export function decisions(st: AutopilotState, now: number): Check {
  const title = "Autopilot decisions are steady";
  const day = st.log.filter((x) => x.at >= now - DAY);
  // an answer to a rule you just picked (within 15 minutes) is not the autopilot changing its mind
  const answer = (i: number) => day.slice(0, i).some((y) => /^You picked/.test(y.what) && day[i]!.at - y.at <= 15 * 60_000);
  const switches = day.filter((x, i) => /^(Now trading|Back to your own rule|Dropped)/.test(x.what) && !answer(i)).length;
  const picks = day.filter((x) => /^You picked/.test(x.what)).length;
  const yours = picks ? ` You picked the rule ${picks} time${picks === 1 ? "" : "s"} (not counted).` : "";
  if (switches > SELFCHECK.maxSwitches)
    return { key: "decisions", status: "warn", title, detail: `${switches} rule changes by the autopilot in the last 24 h. A rule should stay until its results turn; this many changes looks like chasing noise.${yours}` };
  return { key: "decisions", status: "ok", title, detail: `${switches} rule change${switches === 1 ? "" : "s"} by the autopilot in the last 24 h.${yours}` };
}

/** 4. What the bot can see. */
export function coverage(samples: Sample[], now: number, feedDown: boolean): Check {
  const title = "The bot sees what it records";
  if (feedDown) return { key: "coverage", status: "fail", title, detail: "No trade data for over a minute: no new entries, and nothing open is observed until it is back." };
  const day = samples.filter((s) => s.resolvedAt >= now - DAY && s.ov === 1);
  const amm = day.filter((s) => s.stage === "amm");
  const ammBlind = amm.filter((s) => s.blind !== undefined && s.blindBy !== "feed" && s.blindBy !== "stop");
  const outage = day.filter((s) => s.blind !== undefined && s.blindBy === "feed").length;
  const stopped = day.filter((s) => s.blind !== undefined && s.blindBy === "stop").length;
  const parts: string[] = [];
  if (amm.length)
    parts.push(
      `${Math.round((ammBlind.length / amm.length) * 100)}% of graduated-coin recordings stopped being watched before they ended (the bot follows at most 40 pools). Those count only for rules whose time limit they were watched through, never by how they ended, so rules on graduated coins that hold long are judged by the bot's own trades`,
    );
  if (outage) parts.push(`${Math.round((outage / day.length) * 100)}% of all recordings were cut by trade-feed outages (a minute or more without data)`);
  if (stopped) parts.push(`${Math.round((stopped / day.length) * 100)}% were cut by the bot restarting (updates, settings that need a restart), kept as far as they were watched`);
  if (!day.length) return { key: "coverage", status: "info", title, detail: "No recordings finished in the last 24 h yet." };
  const status: CheckStatus = outage / day.length > 0.1 ? "warn" : amm.length > 20 && ammBlind.length / amm.length > 0.5 ? "info" : "ok";
  return { key: "coverage", status, title, detail: parts.length ? `Last 24 h: ${parts.join("; ")}.` : `Last 24 h: all ${day.length} recordings were observed to the end.` };
}

/** 5. Extraordinary promises. */
export function extraordinary(i: SelfCheckInput): Check {
  const title = "Promises are plausible";
  const p = i.autopilot.proof;
  if (!i.autopilotOn || !i.autopilot.active || !p || p.mean <= SELFCHECK.extraordinary)
    return { key: "extraordinary", status: "ok", title, detail: "No rule in use promises more than a real market plausibly pays." };
  return {
    key: "extraordinary",
    status: i.mode === "live" ? "warn" : "info",
    title,
    detail: `The rule in use showed ${pct(p.mean)} per trade on data it never saw — extraordinary for a real market. Such numbers are more often a measuring problem than an edge: trust its own trades over the promise (see "Recordings match real trades").`,
  };
}

/** 6. The learning loop. */
export function learningLoop(l: SelfCheckInput["learning"], now: number): Check {
  const title = "Learning runs on time";
  if (l.everyHours <= 0) return { key: "learning", status: "info", title, detail: "Learning is off on this server (LEARN_EVERY_HOURS=0)." };
  if (l.lastError) return { key: "learning", status: "warn", title, detail: `The last learning run failed: ${l.lastError}` };
  const up = now - l.startedAt;
  if (l.lastRun && now - l.lastRun > (l.everyHours * 2 + 1) * HOUR) return { key: "learning", status: "warn", title, detail: `The score last learned ${((now - l.lastRun) / HOUR).toFixed(1)} h ago; it should every ${l.everyHours} h.` };
  if (up > 3 * HOUR && l.edgesAt && now - l.edgesAt > 6 * HOUR) return { key: "learning", status: "warn", title, detail: `The edge finder last answered ${((now - l.edgesAt) / HOUR).toFixed(1)} h ago; it should every 2 h.` };
  return { key: "learning", status: "ok", title, detail: l.lastRun ? `Last learned ${((now - l.lastRun) / 60_000).toFixed(0)} min ago.` : "First learning run 20 minutes after start." };
}

/** 7. The engine. */
export function engineHealth(e: SelfCheckInput["engine"]): Check {
  const title = "The engine runs cleanly";
  if (e.saveFailures > 0) return { key: "engine", status: "fail", title, detail: `Settings and positions could not be saved (${e.saveFailures} times in a row): ${e.saveError}. A restart would lose recent changes.` };
  if (e.errors > 0) return { key: "engine", status: "warn", title, detail: `${e.errors} internal error${e.errors === 1 ? "" : "s"} since start (details in the server log).` };
  return { key: "engine", status: "ok", title, detail: "No errors since start." };
}

/** 8. Storage has room: the data stays within its budget and never fills the disk (store.enforceBudget). */
export function storageCheck(st: SelfCheckInput["storage"]): Check {
  const title = "Storage has room";
  if (!st) return { key: "storage", status: "info", title, detail: "Storage is not measured here." };
  const gb = (mb: number) => `${(mb / 1000).toFixed(1)} GB`;
  if (st.recordingPaused || (st.freeMb !== null && st.freeMb < st.minFreeMb))
    return {
      key: "storage",
      status: "fail",
      title,
      detail: `The disk is nearly full (${gb(st.freeMb ?? 0)} free): raw market recording is paused, and saving settings and positions is at risk. Free some space on the disk, or lower DATA_MAX_GB.`,
    };
  if (st.freeMb !== null && st.freeMb < 2 * st.minFreeMb)
    return { key: "storage", status: "warn", title, detail: `Only ${gb(st.freeMb)} free on the disk; below ${gb(st.minFreeMb)} raw recording pauses. Free some space on the disk.` };
  return {
    key: "storage",
    status: "ok",
    title,
    detail: `Data ${gb(st.usedMb)} of at most ${gb(st.maxMb)}${st.freeMb !== null ? `, ${gb(st.freeMb)} free on the disk` : ""}. When it fills, the oldest raw recordings go first, then old outcomes (the newest 3 days are kept).`,
  };
}

/** Every check, in the order above. */
export function runChecks(i: SelfCheckInput): Check[] {
  return [
    recordedVsReal(i.closed, i.samples, i.now),
    ruleDelivers(i),
    decisions(i.autopilot, i.now),
    coverage(i.samples, i.now, i.engine.feedDown),
    extraordinary(i),
    learningLoop(i.learning, i.now),
    engineHealth(i.engine),
    storageCheck(i.storage),
  ];
}

const bad = (s: CheckStatus | undefined) => s === "warn" || s === "fail";

/** What changed since the last run, as messages: newly bad checks, and bad ones that recovered. */
export function checkChanges(prev: Map<string, CheckStatus>, next: Check[]): string[] {
  const out: string[] = [];
  for (const c of next) {
    const was = prev.get(c.key);
    if (bad(c.status) && !bad(was)) out.push(`${c.status === "fail" ? "🛑" : "⚠️"} Self-check — ${c.title}: ${c.detail}`);
    else if (bad(was) && !bad(c.status)) out.push(`✅ Self-check — ${c.title}: fine again. ${c.detail}`);
  }
  return out;
}

/** One line for the dashboard header and /status. */
export function checksSummary(checks: Check[]): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails) return `🛑 ${fails} problem${fails > 1 ? "s" : ""}${warns ? `, ${warns} to look at` : ""}`;
  if (warns) return `⚠️ ${warns} thing${warns > 1 ? "s" : ""} to look at`;
  return "✅ all checks fine";
}
