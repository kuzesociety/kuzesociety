/**
 * Bot settings: one validated object, versioned and journaled. Every field is clamped
 * to a safe range so a typo can never produce an absurd order. Open positions keep the
 * exit settings they were opened with; changes apply to new entries.
 */
import { FEATURE_KEYS } from "./features.js";
import type { EntryFacts } from "./outcomes.js";
import { clamp, num } from "./util.js";

export type Mode = "paper" | "live";

/** One condition of a rule on a fact recorded about a coin at the moment of entry (features.ts FEATURE_KEYS, in the model's units). */
export interface RuleCond {
  k: string;
  op: ">=" | "<=";
  v: number;
}

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
   * What triggers an entry: "score" (the score reaches minScore), or a point in a coin's life:
   * one the bot always records (ENTRY_POINTS), or a moment of your own — some time after launch
   * or after graduating (customMoment), which the bot then records too (`moments`).
   */
  entryAt: string;
  /**
   * Moments of your own the bot records for every coin, like the fixed ones (at most
   * MAX_MOMENTS): a custom entry moment is added here, so rules at it can be measured and
   * searched even after you switch to another rule.
   */
  moments: string[];
  /**
   * More conditions of the rule, on the facts recorded about a coin at the moment of entry — set
   * by rules the Lab proved (core/lab). Every one must hold, whatever "score only" says.
   */
  conds: RuleCond[];
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
  /**
   * Autopilot: trade the best rule the edge finder has proven on data it never saw, switch as
   * soon as a clearly better one is proven, drop a rule that stops working in practice, and
   * with real money wait until a rule meets the go-live bar (core/autopilot.ts). A rule you pick
   * by hand competes with the proven ones: it stays unless one does clearly better.
   */
  autopilot: boolean;
  filters: Filters;
}

/**
 * Fixed points in a coin's life where every coin is followed as a would-be entry (the bot
 * records them all), in plain words. Keys match the engine's checkpoint tags.
 */
export const ENTRY_POINTS: Record<string, string> = {
  age20: "20 s after launch",
  age45: "45 s after launch",
  age90: "90 s after launch",
  age180: "3 min after launch",
  age360: "6 min after launch",
  age720: "12 min after launch",
  prog25: "a quarter of the way to graduation",
  prog50: "halfway to graduation",
  prog75: "three quarters of the way to graduation",
  mig60: "1 min after graduating",
  mig300: "5 min after graduating",
  mig900: "15 min after graduating",
  mig3600: "1 h after graduating",
};

/** Moments of your own recorded at most (each adds a would-be trade per coin that reaches it). */
export const MAX_MOMENTS = 4;

/** How long after launch (still on the bonding curve) or after graduating a moment of your own can be, in seconds. */
export const MOMENT_RANGE = { age: [10, 86_400], mig: [30, 86_400] } as const;

/** Seconds on the grid moments of your own use, so every one has an exact name: whole seconds under 2 min, half minutes under 2 h, half hours beyond. */
export function snapMomentSec(sec: number): number {
  if (sec < 120) return Math.round(sec);
  if (sec < 7_200) return Math.round(sec / 30) * 30;
  return Math.round(sec / 1_800) * 1_800;
}

/** A moment of your own: `age{s}` (s seconds after launch, on the bonding curve) or `mig{s}` (s seconds after graduating); null for anything else, the fixed points included. */
export function customMoment(tag: string): { kind: "age" | "mig"; sec: number } | null {
  const m = /^(age|mig)(\d{1,6})$/.exec(tag);
  if (!m || tag in ENTRY_POINTS) return null;
  const kind = m[1] as "age" | "mig";
  const sec = Number(m[2]);
  const [lo, hi] = MOMENT_RANGE[kind];
  return sec >= lo && sec <= hi && snapMomentSec(sec) === sec ? { kind, sec } : null;
}

/** The tag of a moment `sec` seconds after launch ("age") or graduating ("mig"), snapped to the grid and kept in range. */
export function momentTag(kind: "age" | "mig", sec: number): string {
  const [lo, hi] = MOMENT_RANGE[kind];
  return `${kind}${snapMomentSec(Math.min(hi, Math.max(lo, sec)))}`;
}

/** Whether `tag` is a point in a coin's life the bot records: a fixed one or a moment of your own. */
export function isMomentTag(tag: string): boolean {
  return tag in ENTRY_POINTS || customMoment(tag) !== null;
}

const duration = (sec: number) => (sec < 120 ? `${sec} s` : sec < 7_200 ? `${+(sec / 60).toFixed(1)} min` : `${+(sec / 3_600).toFixed(1)} h`);

/** A point in a coin's life in plain words ("5 min after graduating", "2.5 min after launch"). */
export function entryLabel(tag: string): string {
  const fixed = ENTRY_POINTS[tag];
  if (fixed) return fixed;
  const c = customMoment(tag);
  return c ? `${duration(c.sec)} after ${c.kind === "age" ? "launch" : "graduating"}` : tag;
}

/** The tag of a point in a coin's life from its plain words (entryLabel), or null. */
export function tagOfLabel(label: string): string | null {
  for (const [k, v] of Object.entries(ENTRY_POINTS)) if (v === label) return k;
  const m = /^(\d+(?:\.\d+)?) (s|min|h) after (launch|graduating)$/.exec(label);
  if (!m) return null;
  const sec = Math.round(Number(m[1]) * (m[2] === "s" ? 1 : m[2] === "min" ? 60 : 3_600));
  const tag = `${m[3] === "launch" ? "age" : "mig"}${sec}`;
  return isMomentTag(tag) ? tag : null;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  mode: "paper",
  minScore: 75,
  entryAt: "score",
  moments: [],
  conds: [],
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
  autopilot: true,
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
    entryAt: i.entryAt === "score" || (typeof i.entryAt === "string" && isMomentTag(i.entryAt)) ? i.entryAt : b.entryAt,
    moments: sanitizeMoments(i.moments, b.moments),
    conds: sanitizeConds(i.conds, b.conds),
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
    autopilot: bool(i.autopilot, b.autopilot),
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
  // a moment of your own that the rule buys at is always recorded, and stays recorded afterwards
  if (customMoment(out.entryAt) && !out.moments.includes(out.entryAt)) {
    out.moments.push(out.entryAt);
    while (out.moments.length > MAX_MOMENTS) out.moments.splice(out.moments.findIndex((m) => m !== out.entryAt), 1);
  }
  return out;
}

/** Up to MAX_MOMENTS distinct moments of your own from `v`; `d` (copied) when `v` is not a list. */
export function sanitizeMoments(v: unknown, d: readonly string[] = []): string[] {
  if (!Array.isArray(v)) return [...d];
  const out: string[] = [];
  for (const m of v) if (typeof m === "string" && customMoment(m) && !out.includes(m)) out.push(m);
  return out.slice(-MAX_MOMENTS);
}

/** Up to three valid conditions from `v`; `d` (copied) when `v` is not a list. */
export function sanitizeConds(v: unknown, d: RuleCond[] = []): RuleCond[] {
  if (!Array.isArray(v)) return d.map((c) => ({ ...c }));
  const out: RuleCond[] = [];
  for (const c of v) {
    if (!c || typeof c !== "object") continue;
    const { k, op, v: val } = c as Record<string, unknown>;
    if (typeof k === "string" && FEATURE_KEYS.includes(k) && (op === ">=" || op === "<=") && typeof val === "number" && Number.isFinite(val)) out.push({ k, op, v: val });
    if (out.length === 3) break;
  }
  return out;
}

/**
 * The filter a coin fails at entry, or null: one check for the engine's entries and for rules
 * measured on recordings (core/edges measureRule), which store the same facts (EntryFacts).
 */
export function filterBlock(f: Filters, x: EntryFacts): string | null {
  if (f.minMcapSol > 0 && x.mcap < f.minMcapSol) return "filter:mcap_min";
  if (f.maxMcapSol > 0 && x.mcap > f.maxMcapSol) return "filter:mcap_max";
  if (x.devShare * 100 > f.maxDevPct) return "filter:dev";
  if (x.top10 * 100 > f.maxTop10Pct) return "filter:top10";
  if (x.bundle * 100 > f.maxBundlePct) return "filter:bundle";
  if (x.buyers < f.minBuyers) return "filter:buyers";
  if (f.minAgeSec > 0 && x.age < f.minAgeSec) return "filter:age_min";
  if (f.maxAgeMin > 0 && x.age > f.maxAgeMin * 60) return "filter:age_max";
  if (f.requireSocials && x.socials === 0) return "filter:socials";
  if (f.maxDevLaunches24h > 0 && x.launches24h > f.maxDevLaunches24h) return "filter:serial_dev";
  if (f.maxDevSoldPct < 100 && x.devSold * 100 > f.maxDevSoldPct) return "filter:dev_sold";
  return null;
}

/** The settings a trading rule is made of (what a strategy or an edge-finder rule sets). */
export const RULE_KEYS = ["entryAt", "conds", "minScore", "tpPct", "slPct", "maxHoldMin", "trailPct", "takeInitials", "reentry", "tradeCurve", "tradeAmm", "scoreOnly", "filters"] as const;

/** The rule part of the settings (a copy). */
export function ruleOf(s: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of RULE_KEYS) out[k] = k === "filters" ? { ...s.filters } : k === "conds" ? (s.conds ?? []).map((c) => ({ ...c })) : s[k];
  return out as Partial<Settings>;
}

/** Whether a settings change touches the rule (entry, coins, exits). */
export function touchesRule(patch: Record<string, unknown>): boolean {
  return RULE_KEYS.some((k) => k in patch);
}

/** Whether the rule (entry, coins, exits) differs between two settings. */
export function ruleChanged(a: Settings, b: Settings): boolean {
  return JSON.stringify(ruleOf(a)) !== JSON.stringify(ruleOf(b));
}

/** A short fingerprint of the rule (entry, coins, exits): trades opened under it are its track record. */
export function ruleKey(s: Settings): string {
  const text = JSON.stringify(ruleOf(s));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Whether a coin's facts at entry (features.ts featureVector) meet every condition. */
export function condsHold(conds: readonly RuleCond[], x: ArrayLike<number>): boolean {
  for (const c of conds) {
    const v = x[FEATURE_KEYS.indexOf(c.k)];
    if (v === undefined || !Number.isFinite(v)) return false;
    if (c.op === ">=" ? v < c.v - 1e-9 : v > c.v + 1e-9) return false;
  }
  return true;
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
  for (const k of Object.keys(draft) as (keyof Settings)[]) {
    if (k === "filters") continue;
    if (k === "conds" || k === "moments" ? JSON.stringify(draft[k]) !== JSON.stringify(base[k]) : draft[k] !== base[k]) out[k] = draft[k];
  }
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
