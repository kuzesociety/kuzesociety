/**
 * Bot settings: one validated object, versioned and journaled. Every field is clamped
 * to a safe range so a typo can never produce an absurd order. Open positions keep the
 * exit settings they were opened with; changes apply to new entries.
 */
import { clamp, num } from "./util.js";

export type Mode = "paper" | "live";

export interface Filters {
  /** market-cap window, SOL (0 = no limit) */
  minMcapSol: number;
  maxMcapSol: number;
  /** max share of supply held by the dev (%) */
  maxDevPct: number;
  /** max share held by the top 10 wallets (%) */
  maxTop10Pct: number;
  /** max share bought in the launch block by other wallets (%) */
  maxBundlePct: number;
  /** min distinct buyers so far */
  minBuyers: number;
  /** token age window (seconds / minutes, 0 = none) */
  minAgeSec: number;
  maxAgeMin: number;
  requireSocials: boolean;
  /** skip devs that launched more than N coins in 24h (0 = off) */
  maxDevLaunches24h: number;
  /** skip when the dev already sold this share of their bag (%, 100 = off) */
  maxDevSoldPct: number;
}

export interface Settings {
  /** auto-trading on/off (the radar always runs) */
  enabled: boolean;
  mode: Mode;
  /** enter when score ≥ this (0–100) */
  minScore: number;
  /**
   * Score only: ignore every token filter below and enter on the score alone.
   * Account limits (budget, max positions, one entry per coin) still apply —
   * they protect the wallet, not judge the token.
   */
  scoreOnly: boolean;
  /** which stages to trade */
  tradeCurve: boolean;
  tradeAmm: boolean;
  /** take profit, % net of all costs (100 = 2×) */
  tpPct: number;
  /** stop loss, % below entry cost (50 = −50%) */
  slPct: number;
  /** trailing stop after TP arms, % from peak (0 = off) */
  trailPct: number;
  /** sell only enough at TP to recover the stake, let the rest ride (with trail) */
  takeInitials: boolean;
  /** close after this many minutes regardless (0 = off) */
  maxHoldMin: number;
  /** sell when the coin has had no trades for this many minutes — dead coins free the slot (0 = off) */
  staleExitMin: number;
  /** SOL per trade (fees included) */
  positionSol: number;
  maxOpen: number;
  /** stop new entries after this realized loss today, SOL (0 = off) */
  maxDailyLossSol: number;
  maxTradesPerHour: number;
  /** entry slippage tolerance % (price may move this much before the buy lands) */
  slippagePct: number;
  /** exit slippage tolerance %, escalates automatically on retries */
  exitSlippagePct: number;
  /** priority fee per transaction, SOL */
  priorityFeeSol: number;
  /** execution venue fee % per trade (PumpPortal local API = 0.5) */
  platformFeePct: number;
  /** score must hold ≥ minScore for this many consecutive evaluations */
  confirmTicks: number;
  /** keep retrying a failed entry for this long while the score holds, s */
  retryWindowSec: number;
  /** allow buying the same coin again after closing it */
  reentry: boolean;
  /** simulated time between decision and on-chain landing (paper), ms */
  paperLatencyMs: number;
  /** paper mode: let the learner switch TP/SL/score to the best-proven combination */
  autoTune: boolean;
  filters: Filters;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  mode: "paper",
  minScore: 75,
  scoreOnly: false,
  tradeCurve: true,
  tradeAmm: true,
  tpPct: 100,
  slPct: 50,
  trailPct: 0,
  takeInitials: false,
  maxHoldMin: 240,
  staleExitMin: 10,
  positionSol: 0.1,
  maxOpen: 3,
  maxDailyLossSol: 0.5,
  maxTradesPerHour: 12,
  slippagePct: 20,
  exitSlippagePct: 25,
  priorityFeeSol: 0.0005,
  platformFeePct: 0.5,
  // hold ~5 s (one evaluation per second while the coin trades): in simulation, buying on the
  // first tick above the line caught more one-off spikes and did 2–6 points worse per trade
  confirmTicks: 5,
  retryWindowSec: 20,
  reentry: false,
  paperLatencyMs: 1500,
  autoTune: false,
  filters: {
    minMcapSol: 0,
    maxMcapSol: 0,
    maxDevPct: 20,
    maxTop10Pct: 60,
    maxBundlePct: 25,
    minBuyers: 5,
    minAgeSec: 0,
    maxAgeMin: 0,
    requireSocials: false,
    maxDevLaunches24h: 5,
    maxDevSoldPct: 100,
  },
};

/** Hard ceilings that no settings change can exceed (live-mode caps come from env). */
export const LIMITS = {
  positionSol: [0.001, 100],
  maxOpen: [1, 50],
  tpPct: [1, 10_000],
  slPct: [1, 99],
  slippagePct: [0.5, 99],
  exitSlippagePct: [1, 99],
  priorityFeeSol: [0, 0.1],
  platformFeePct: [0, 5],
  maxHoldMin: [0, 10_080],
  paperLatencyMs: [0, 30_000],
} as const;

function bool(v: unknown, d: boolean) {
  return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : d;
}

/** Merge a partial update into `base`, clamping every value. Unknown keys are ignored. */
export function sanitizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const f = (i.filters && typeof i.filters === "object" ? i.filters : {}) as Record<string, unknown>;
  const b = base;
  const bf = base.filters;
  const out: Settings = {
    enabled: bool(i.enabled, b.enabled),
    mode: i.mode === "live" || i.mode === "paper" ? i.mode : b.mode,
    minScore: clamp(num(i.minScore, b.minScore), 0, 100),
    scoreOnly: bool(i.scoreOnly, b.scoreOnly),
    tradeCurve: bool(i.tradeCurve, b.tradeCurve),
    tradeAmm: bool(i.tradeAmm, b.tradeAmm),
    tpPct: clamp(num(i.tpPct, b.tpPct), ...LIMITS.tpPct),
    slPct: clamp(num(i.slPct, b.slPct), ...LIMITS.slPct),
    trailPct: clamp(num(i.trailPct, b.trailPct), 0, 95),
    takeInitials: bool(i.takeInitials, b.takeInitials),
    maxHoldMin: clamp(num(i.maxHoldMin, b.maxHoldMin), ...LIMITS.maxHoldMin),
    staleExitMin: clamp(num(i.staleExitMin, b.staleExitMin), 0, 1440),
    positionSol: clamp(num(i.positionSol, b.positionSol), ...LIMITS.positionSol),
    maxOpen: Math.round(clamp(num(i.maxOpen, b.maxOpen), ...LIMITS.maxOpen)),
    maxDailyLossSol: clamp(num(i.maxDailyLossSol, b.maxDailyLossSol), 0, 1000),
    maxTradesPerHour: Math.round(clamp(num(i.maxTradesPerHour, b.maxTradesPerHour), 1, 500)),
    slippagePct: clamp(num(i.slippagePct, b.slippagePct), ...LIMITS.slippagePct),
    exitSlippagePct: clamp(num(i.exitSlippagePct, b.exitSlippagePct), ...LIMITS.exitSlippagePct),
    priorityFeeSol: clamp(num(i.priorityFeeSol, b.priorityFeeSol), ...LIMITS.priorityFeeSol),
    platformFeePct: clamp(num(i.platformFeePct, b.platformFeePct), ...LIMITS.platformFeePct),
    confirmTicks: Math.round(clamp(num(i.confirmTicks, b.confirmTicks), 1, 20)),
    retryWindowSec: clamp(num(i.retryWindowSec, b.retryWindowSec), 0, 600),
    reentry: bool(i.reentry, b.reentry),
    paperLatencyMs: clamp(num(i.paperLatencyMs, b.paperLatencyMs), ...LIMITS.paperLatencyMs),
    autoTune: bool(i.autoTune, b.autoTune),
    filters: {
      minMcapSol: clamp(num(f.minMcapSol, bf.minMcapSol), 0, 1e7),
      maxMcapSol: clamp(num(f.maxMcapSol, bf.maxMcapSol), 0, 1e7),
      maxDevPct: clamp(num(f.maxDevPct, bf.maxDevPct), 0, 100),
      maxTop10Pct: clamp(num(f.maxTop10Pct, bf.maxTop10Pct), 0, 100),
      maxBundlePct: clamp(num(f.maxBundlePct, bf.maxBundlePct), 0, 100),
      minBuyers: Math.round(clamp(num(f.minBuyers, bf.minBuyers), 0, 10_000)),
      minAgeSec: clamp(num(f.minAgeSec, bf.minAgeSec), 0, 86_400),
      maxAgeMin: clamp(num(f.maxAgeMin, bf.maxAgeMin), 0, 100_000),
      requireSocials: bool(f.requireSocials, bf.requireSocials),
      maxDevLaunches24h: Math.round(clamp(num(f.maxDevLaunches24h, bf.maxDevLaunches24h), 0, 1000)),
      maxDevSoldPct: clamp(num(f.maxDevSoldPct, bf.maxDevSoldPct), 0, 100),
    },
  };
  if (!out.tradeCurve && !out.tradeAmm) out.tradeCurve = true;
  return out;
}

/** Exit rules frozen onto a position when it opens. */
export interface ExitPlan {
  tpPct: number;
  slPct: number;
  trailPct: number;
  takeInitials: boolean;
  maxHoldMin: number;
  staleExitMin: number;
  exitSlippagePct: number;
}

export function exitPlanFrom(s: Settings): ExitPlan {
  return {
    tpPct: s.tpPct,
    slPct: s.slPct,
    trailPct: s.trailPct,
    takeInitials: s.takeInitials,
    maxHoldMin: s.maxHoldMin,
    staleExitMin: s.staleExitMin,
    exitSlippagePct: s.exitSlippagePct,
  };
}

/** The fields of an edited copy that differ from the settings it started from (filters too). */
export function settingsChanges(draft: Settings, base: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(draft) as (keyof Settings)[]) if (k !== "filters" && draft[k] !== base[k]) out[k] = draft[k];
  const f: Record<string, unknown> = {};
  for (const k of Object.keys(draft.filters) as (keyof Settings["filters"])[]) if (draft.filters[k] !== base.filters[k]) f[k] = draft.filters[k];
  if (Object.keys(f).length) out.filters = f;
  return out as Partial<Settings>;
}

/** Settings changed elsewhere while being edited: the latest settings with the edits laid over them. */
export function rebaseSettings(draft: Settings, base: Settings, latest: Settings): Settings {
  const edits = settingsChanges(draft, base);
  return { ...latest, ...edits, filters: { ...latest.filters, ...(edits.filters ?? {}) } };
}
