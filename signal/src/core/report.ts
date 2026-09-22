/**
 * Learning report — answers "does a score of 75+ actually make money at MY settings?"
 * from resolved outcome samples, with confidence intervals, plus the go-live gate.
 */
import { breakEvenP, type ModelSpec } from "./model.js";
import { ENTRY_LEVELS, GRID, type Sample } from "./outcomes.js";
import type { Position } from "./positions.js";
import type { Settings } from "./settings.js";
import { meanCI, quantile, wilson } from "./util.js";

export interface BucketRow {
  lo: number;
  hi: number;
  n: number;
  winRate: number;
  winLo: number;
  winHi: number;
  avgRet: number;
  retLo: number;
  retHi: number;
  medMaxMult: number;
}

export interface GridCell {
  tp: number;
  sl: number;
  n: number;
  avgRet: number;
  retLo: number;
  retHi: number;
  winRate: number;
}

export interface LearnReport {
  generatedAt: number;
  samples: number;
  checkpoints: number;
  signals: number;
  entries: number;
  spanHours: number;
  settings: { tpPct: number; slPct: number; minScore: number };
  combo: { tp: number; sl: number; exact: boolean };
  breakEven: number;
  buckets: BucketRow[];
  signalStats: { n: number; winRate: number; winLo: number; winHi: number; avgRet: number; retLo: number; retHi: number };
  thresholds: { min: number; n: number; tokensPerHour: number; winRate: number; avgRet: number; retLo: number; retHi: number }[];
  /**
   * entries: each row is what happened after coins FIRST reached that score (how the bot buys);
   * checkpoints: snapshots at fixed ages, used until enough entry outcomes exist
   */
  thresholdSource: "entries" | "checkpoints";
  grid: GridCell[];
  gridSource: "signals" | "entries" | "checkpoints";
  best: GridCell | null;
  gate: { pass: boolean; verdict: string; detail: string };
  /** robustly better settings than the current ones, when the evidence supports it */
  suggestion: { minScore: number; tpPct: number; slPct: number; avgRet: number; retLo: number; n: number; why: string } | null;
  paper: { trades: number; wins: number; winRate: number; pnlSol: number; avgPct: number; profitFactor: number; maxDrawdownSol: number };
  model: { version: string; source: string; training: ModelSpec["training"] | null };
}

function nearestGrid(tp: number, sl: number): number {
  let best = 0;
  let bestD = Infinity;
  GRID.forEach((g, i) => {
    const d = Math.abs(Math.log(g.tp / tp)) + Math.abs(g.sl - sl) / 25;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The sample's exit grid when it uses the current layout (older layouts are not comparable). */
export function gridOf(s: Sample): number[] | undefined {
  return s.grid?.length === GRID.length ? s.grid : undefined;
}

/** Return of a sample for the (tp, sl) combo: exact when recorded, else from the grid. */
export function sampleReturn(s: Sample, tp: number, sl: number): { ret: number; exact: boolean } {
  if (s.tp === tp && s.sl === sl) return { ret: s.ret, exact: true };
  const g = gridOf(s);
  const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
  if (g && gi >= 0 && Number.isFinite(g[gi])) return { ret: g[gi]!, exact: true };
  return { ret: g?.[nearestGrid(tp, sl)] ?? s.ret, exact: false };
}

function statsOf(rets: number[]) {
  const wins = rets.filter((r) => r > 0).length;
  const w = wilson(wins, rets.length);
  const m = meanCI(rets);
  return { n: rets.length, winRate: rets.length ? wins / rets.length : NaN, winLo: w.lo, winHi: w.hi, avgRet: m.mean, retLo: m.lo, retHi: m.hi };
}

export function paperStats(closed: Position[]) {
  const done = closed.filter((p) => p.status === "closed" && Number.isFinite(p.pnl));
  const wins = done.filter((p) => (p.pnl ?? 0) > 0);
  const gross = wins.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const loss = -done.filter((p) => (p.pnl ?? 0) <= 0).reduce((s, p) => s + (p.pnl ?? 0), 0);
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  for (const p of [...done].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))) {
    eq += p.pnl ?? 0;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, peak - eq);
  }
  return {
    trades: done.length,
    wins: wins.length,
    winRate: done.length ? wins.length / done.length : NaN,
    pnlSol: (gross - loss) / 1e9,
    avgPct: done.length ? done.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / done.length : NaN,
    profitFactor: loss > 0 ? gross / loss : gross > 0 ? Infinity : NaN,
    maxDrawdownSol: mdd / 1e9,
  };
}

export function buildReport(samples: Sample[], settings: Settings, model: ModelSpec, closed: Position[], now: number): LearnReport {
  const tp = settings.tpPct;
  const sl = settings.slPct;
  const checkpoints = samples.filter((s) => s.kind === "checkpoint");
  const signals = samples.filter((s) => s.kind === "signal");
  const exactCombo = samples.length === 0 || sampleReturn(samples[0]!, tp, sl).exact;
  const retOf = (s: Sample) => sampleReturn(s, tp, sl).ret;
  const t0 = samples.reduce((m, s) => Math.min(m, s.ts), Infinity);
  const t1 = samples.reduce((m, s) => Math.max(m, s.ts), 0);
  const spanHours = samples.length ? Math.max(1 / 60, (t1 - t0) / 3_600_000) : 0;

  const buckets: BucketRow[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const rows = checkpoints.filter((s) => s.score >= lo && (s.score < hi || (hi === 100 && s.score <= 100)));
    const st = statsOf(rows.map(retOf));
    const mm = rows.map((s) => s.maxMult).sort((a, b) => a - b);
    buckets.push({ lo, hi, n: st.n, winRate: st.winRate, winLo: st.winLo, winHi: st.winHi, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, medMaxMult: quantile(mm, 0.5) });
  }

  const sigAbove = signals.filter((s) => s.score >= settings.minScore);
  const signalStats = statsOf(sigAbove.map(retOf));

  // Threshold comparison: prefer first-crossing entry outcomes. Snapshots of coins that are
  // above a score are kinder than buying the moment a coin reaches it (the crossing often
  // comes on a burst of buying), so snapshots are only a stand-in until entries accumulate.
  const entries = samples.filter((s) => s.kind === "entry");
  const thresholdSource: LearnReport["thresholdSource"] = entries.length >= 200 ? "entries" : "checkpoints";
  const atLevel = (min: number) => (thresholdSource === "entries" ? entries.filter((s) => s.tag === `x${min}`) : checkpoints.filter((s) => s.score >= min));
  const thresholds = [];
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    const st = statsOf(rows.map(retOf));
    const tokens = new Set(rows.map((s) => s.mint)).size;
    thresholds.push({ min, n: st.n, tokensPerHour: spanHours > 0 ? tokens / spanHours : NaN, winRate: st.winRate, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi });
  }

  // Exit heat map for coins at the user's score: their own signals when there are enough,
  // else entries at the nearest level at or below it, else snapshots.
  const level = [...ENTRY_LEVELS].reverse().find((l) => l <= settings.minScore) ?? ENTRY_LEVELS[0];
  const levelEntries = entries.filter((s) => s.tag === `x${level}`);
  let gridSource: LearnReport["gridSource"];
  let pool: Sample[];
  if (sigAbove.length >= 50) {
    gridSource = "signals";
    pool = sigAbove;
  } else if (levelEntries.length >= 50) {
    gridSource = "entries";
    pool = levelEntries;
  } else {
    gridSource = "checkpoints";
    pool = [...sigAbove, ...checkpoints.filter((s) => s.score >= settings.minScore)];
  }
  const grid: GridCell[] = GRID.map((g, i) => {
    const rets = pool.map((s) => gridOf(s)?.[i]).filter((x): x is number => Number.isFinite(x));
    const st = statsOf(rets);
    return { tp: g.tp, sl: g.sl, n: st.n, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, winRate: st.winRate };
  });
  const credible = grid.filter((c) => c.n >= 50 && Number.isFinite(c.retLo));
  const best = credible.length ? credible.reduce((a, b) => (b.retLo > a.retLo ? b : a)) : null;

  const minN = 150;
  let gate: LearnReport["gate"];
  if (signalStats.n < minN) {
    gate = {
      pass: false,
      verdict: "Not enough evidence yet",
      detail: `${signalStats.n}/${minN} resolved signals at score ≥ ${settings.minScore} with TP ${tp}% / SL ${sl}%. Keep paper trading.`,
    };
  } else if (!(signalStats.retLo > 0.02)) {
    gate = {
      pass: false,
      verdict: signalStats.avgRet > 0 ? "Positive but not proven" : "Losing at these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade (95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%) after fees, delay and slippage. The low end must clear +2% before risking real money.`,
    };
  } else {
    gate = {
      pass: true,
      verdict: "Evidence supports these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade over ${signalStats.n} signals; 95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%. Past results in this market can still stop working — start small.`,
    };
  }

  // Suggestion: search 10 thresholds × 20 exit combos (200 hypotheses) for settings that beat
  // the current ones. To avoid crowning a lucky winner: a multiple-comparison-corrected bound
  // (z = 3.5 instead of 1.96) must be positive, and the result must hold separately in the
  // older and the newer half of the data (walk-forward stability).
  let suggestion: LearnReport["suggestion"] = null;
  const zBound = (xs: number[], z: number) => {
    const m = meanCI(xs);
    return Number.isFinite(m.lo) ? m.mean - ((m.mean - m.lo) / 1.96) * z : -Infinity;
  };
  const cur = pool.map(retOf);
  let bestLo = cur.length >= 30 ? zBound(cur, 3.5) : -Infinity;
  const mid = t0 + (t1 - t0) / 2;
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    if (rows.length < 150) continue;
    GRID.forEach((g, i) => {
      const val = (s: Sample) => gridOf(s)?.[i];
      const all = rows.map(val).filter((x): x is number => Number.isFinite(x));
      if (all.length < 150) return;
      const lo = zBound(all, 3.5);
      if (!(lo > 0) || lo <= bestLo + 0.005) return;
      const older = rows.filter((s) => s.ts < mid).map(val).filter((x): x is number => Number.isFinite(x));
      const newer = rows.filter((s) => s.ts >= mid).map(val).filter((x): x is number => Number.isFinite(x));
      if (older.length < 50 || newer.length < 50 || !(zBound(older, 1.96) > 0) || !(zBound(newer, 1.96) > 0)) return;
      const m = meanCI(all);
      bestLo = lo;
      suggestion = {
        minScore: min,
        tpPct: g.tp,
        slPct: g.sl,
        avgRet: m.mean,
        retLo: lo,
        n: all.length,
        why: `${thresholdSource === "entries" ? "buying when coins first reached" : "coins scoring"} ${min}+ with TP ${g.tp}% / SL ${g.sl}% averaged ${(m.mean * 100).toFixed(1)}% per trade over ${all.length} outcomes, positive in both the older and newer half of the data (strict worst case ${(lo * 100).toFixed(1)}%)`,
      };
    });
  }

  return {
    generatedAt: now,
    suggestion,
    samples: samples.length,
    checkpoints: checkpoints.length,
    signals: signals.length,
    entries: entries.length,
    spanHours,
    settings: { tpPct: tp, slPct: sl, minScore: settings.minScore },
    combo: { tp, sl, exact: exactCombo },
    breakEven: breakEvenP(tp, sl),
    buckets,
    signalStats,
    thresholds,
    thresholdSource,
    grid,
    gridSource,
    best,
    gate,
    paper: paperStats(closed),
    model: { version: model.version, source: model.source, training: model.training ?? null },
  };
}
