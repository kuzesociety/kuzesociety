/**
 * Edge finder. Independently of the user's own plan, it searches for rules that made money
 * after every cost: which score to buy at, which coins, and how to get out (take profit,
 * stop loss, time limit). Every rule is one the bot can run as-is.
 *
 * Searching thousands of rules finds lucky ones, so the method guards itself:
 *   1. Discovery: rules are ranked on the older two thirds of the data only.
 *   2. Holdout: the best distinct candidates are re-tested on the newest third, which the
 *      search never saw, with a bound corrected for how many candidates were tested.
 *   3. Placebo: the whole search is repeated on shuffled outcomes, where no edge exists;
 *      how often it "finds" one there shows how often it fools itself.
 */
import { ENTRY_LEVELS, GRID, GRID_VERSION, PATH_MIN, type Sample } from "./outcomes.js";
import { ENTRY_POINTS, type Settings } from "./settings.js";
import { rng } from "./util.js";

/** Time limits tried with every take-profit/stop-loss pair (minutes, 0 = none). */
export const HOLDS_MIN = [0, 10, 30, 60] as const;
const EXITS = GRID.length * HOLDS_MIN.length;

type Filters = Settings["filters"];

interface Condition {
  key: string;
  label: string;
  test: (s: Sample) => boolean;
  stage?: "curve" | "amm";
  filters?: Partial<Filters>;
}

const f = (s: Sample) => s.f!;

/** Entry conditions, each one a setting the bot already has. */
export const CONDITIONS: Condition[] = [
  { key: "any", label: "any coin", test: () => true },
  { key: "curve", label: "still on the bonding curve", test: (s) => s.stage === "curve", stage: "curve" },
  { key: "amm", label: "already graduated", test: (s) => s.stage === "amm", stage: "amm" },
  ...[40, 80, 150].map((v) => ({ key: `mcap<=${v}`, label: `market cap ≤ ${v} SOL`, test: (s: Sample) => f(s).mcap <= v, filters: { maxMcapSol: v } })),
  ...[80, 150, 300].map((v) => ({ key: `mcap>=${v}`, label: `market cap ≥ ${v} SOL`, test: (s: Sample) => f(s).mcap >= v, filters: { minMcapSol: v } })),
  ...[1, 3, 10].map((m) => ({ key: `age<=${m}m`, label: `younger than ${m} min`, test: (s: Sample) => f(s).age <= m * 60, filters: { maxAgeMin: m } })),
  ...[3, 10].map((m) => ({ key: `age>=${m}m`, label: `older than ${m} min`, test: (s: Sample) => f(s).age >= m * 60, filters: { minAgeSec: m * 60 } })),
  { key: "bundle<=10", label: "≤ 10% bundled at launch", test: (s) => f(s).bundle * 100 <= 10, filters: { maxBundlePct: 10 } },
  { key: "top10<=30", label: "top 10 holders own ≤ 30%", test: (s) => f(s).top10 * 100 <= 30, filters: { maxTop10Pct: 30 } },
  ...[30, 100].map((n) => ({ key: `buyers>=${n}`, label: `${n}+ buyers`, test: (s: Sample) => f(s).buyers >= n, filters: { minBuyers: n } })),
  { key: "socials", label: "has socials", test: (s) => f(s).socials > 0, filters: { requireSocials: true } },
  { key: "dev<=5", label: "dev holds ≤ 5%", test: (s) => f(s).devShare * 100 <= 5, filters: { maxDevPct: 5 } },
  { key: "devheld", label: "dev hasn't sold", test: (s) => f(s).devSold <= 0, filters: { maxDevSoldPct: 0 } },
  { key: "onelaunch", label: "dev's only launch today", test: (s) => f(s).launches24h <= 1, filters: { maxDevLaunches24h: 1 } },
];

/** Filter values that let everything through. */
const OPEN_FILTERS: Filters = {
  minMcapSol: 0,
  maxMcapSol: 0,
  maxDevPct: 100,
  maxTop10Pct: 100,
  maxBundlePct: 100,
  minBuyers: 0,
  minAgeSec: 0,
  maxAgeMin: 0,
  requireSocials: false,
  maxDevLaunches24h: 0,
  maxDevSoldPct: 100,
};

export interface EdgeStats {
  n: number;
  mean: number;
  /** lower bound: 2 standard errors in discovery; multiple-comparison corrected in the holdout */
  lo: number;
  winRate: number;
}

export interface EdgeRule {
  /** entry when the score first reaches this level (0 when `at` is set) */
  level: number;
  /** or entry at a fixed point in every coin's life (a key of ENTRY_POINTS) */
  at?: string;
  cond: string;
  tp: number;
  sl: number;
  hold: number;
}

export interface EdgeFound extends EdgeRule {
  text: string;
  discovery: EdgeStats;
  holdout: EdgeStats;
  /** holdout average for every coin at the same entry (score level or fixed point) with the same exit */
  baseline: number;
  tradesPerDay: number;
  /** settings that make the bot trade exactly this rule */
  settings: Partial<Settings>;
}

export interface EdgeReport {
  generatedAt: number;
  status: "ok" | "not_enough_data";
  note: string;
  samples: number;
  hours: number;
  discoveryHours: number;
  holdoutHours: number;
  /** rules scored on the discovery data */
  tested: number;
  /** best distinct rules re-tested on the holdout */
  candidates: number;
  survivors: EdgeFound[];
  /** best candidates that failed the holdout, shown for transparency */
  failed: EdgeFound[];
  placebo: { runs: number; avgSurvivors: number; maxSurvivors: number };
}

export interface EdgeOptions {
  now?: number;
  /** outcomes are followed this long; newer entries are incomplete and left out */
  horizonMs?: number;
  minHours?: number;
  minSamples?: number;
  minDiscovery?: number;
  minHoldout?: number;
  candidates?: number;
  /** a rule resting on a handful of lucky wins is not trusted (matters for far targets) */
  minWins?: number;
  placeboRuns?: number;
  seed?: number;
}

const DEFAULTS: Required<Omit<EdgeOptions, "now">> = {
  horizonMs: 6 * 3_600_000,
  minHours: 24,
  minSamples: 1_000,
  minDiscovery: 80,
  minHoldout: 40,
  candidates: 20,
  minWins: 10,
  placeboRuns: 3,
  seed: 7,
};

/** Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  if (q < 0.02425) {
    const t = Math.sqrt(-2 * Math.log(q));
    return (((((c[0]! * t + c[1]!) * t + c[2]!) * t + c[3]!) * t + c[4]!) * t + c[5]!) / ((((d[0]! * t + d[1]!) * t + d[2]!) * t + d[3]!) * t + 1);
  }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const t = q - 0.5;
  const r = t * t;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * t) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Net return of a sample for grid combo `c` with time limit HOLDS_MIN[h]. */
function exitReturn(s: Sample, c: number, h: number): number {
  const ret = s.grid[c]!;
  const hold = HOLDS_MIN[h]!;
  if (hold === 0 || (s.gridT?.[c] ?? 0) <= hold * 60) return ret;
  const v = s.path?.[PATH_MIN.indexOf(hold as (typeof PATH_MIN)[number])];
  return v ?? ret;
}

function describe(r: EdgeRule): string {
  const cond = CONDITIONS.find((c) => c.key === r.cond)!;
  const when = r.cond === "any" ? "" : ` · ${cond.label}`;
  const time = r.hold ? `, or after ${r.hold} min` : "";
  const entry = r.at ? `Buy every coin ${ENTRY_POINTS[r.at] ?? r.at}` : `Buy when a coin first reaches ${r.level}`;
  return `${entry}${when} · sell at +${r.tp}% or −${r.sl}%${time}`;
}

function settingsFor(r: EdgeRule): Partial<Settings> {
  const cond = CONDITIONS.find((c) => c.key === r.cond)!;
  const out: Partial<Settings> = {
    entryAt: r.at ?? "score",
    minScore: r.at ? 0 : r.level,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || 360,
    trailPct: 0,
    takeInitials: false,
    reentry: false,
    tradeCurve: cond.stage !== "amm",
    tradeAmm: cond.stage !== "curve",
    scoreOnly: !cond.filters,
  };
  if (cond.filters) out.filters = { ...OPEN_FILTERS, ...cond.filters };
  return out;
}

interface Group {
  level: number;
  at?: string;
  cond: number;
  disc: Int32Array;
  hold: Int32Array;
  /** days covered by this entry family's holdout (for trades per day) */
  holdDays: number;
}

interface Scored {
  g: Group;
  e: number;
  disc: EdgeStats;
}

/** Everything a search run needs, so the real and the placebo runs share one code path. */
interface Data {
  R: Float32Array;
  row: (i: number) => number;
  shift: Float64Array;
  wins: (v: number) => boolean;
}

function stats(d: Data, idx: Int32Array, e: number, z: number): EdgeStats {
  let n = 0;
  let sum = 0;
  let sq = 0;
  let w = 0;
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]!) * EXITS + e]! - d.shift[e]!;
    n++;
    sum += v;
    sq += v * v;
    if (d.wins(v)) w++;
  }
  if (n < 2) return { n, mean: n ? sum : NaN, lo: -Infinity, winRate: n ? w / n : NaN };
  const mean = sum / n;
  const variance = Math.max(0, (sq - n * mean * mean) / (n - 1));
  return { n, mean, lo: mean - z * Math.sqrt(variance / n), winRate: w / n };
}

interface SearchResult {
  tested: number;
  cands: { c: Scored; hold: EdgeStats }[];
  passed: { c: Scored; hold: EdgeStats }[];
}

const wins = (st: EdgeStats) => Math.round(st.winRate * st.n);

function* search(d: Data, groups: Group[], o: Required<Omit<EdgeOptions, "now">>): Generator<void, SearchResult> {
  let tested = 0;
  const best: Scored[] = [];
  for (const g of groups) {
    if (g.disc.length < o.minDiscovery) continue;
    let top: Scored | null = null;
    for (let e = 0; e < EXITS; e++) {
      tested++;
      const st = stats(d, g.disc, e, 2);
      if (wins(st) < o.minWins) continue;
      if (!top || st.lo > top.disc.lo) top = { g, e, disc: st };
    }
    if (top && top.disc.mean > 0 && top.disc.lo > 0) best.push(top);
    yield;
  }
  best.sort((a, b) => b.disc.lo - a.disc.lo);
  const cands = best.slice(0, o.candidates);
  const z = normInv(1 - 0.05 / Math.max(1, cands.length));
  const checked = cands.map((c) => ({ c, hold: stats(d, c.g.hold, c.e, z) }));
  const passed = checked.filter((x) => x.hold.n >= o.minHoldout && wins(x.hold) >= o.minWins && x.hold.lo > 0);
  return { tested, cands: checked, passed };
}

/** Runs the search to completion in one go (tests, command line). */
export function findEdges(samples: Sample[], opts: EdgeOptions = {}): EdgeReport {
  const it = steps(samples, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** The same search, pausing every ~15 ms so a live bot keeps up with the market meanwhile. */
export async function findEdgesAsync(samples: Sample[], opts: EdgeOptions = {}): Promise<EdgeReport> {
  const it = steps(samples, opts);
  let t = Date.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > 15) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}

function* steps(samples: Sample[], opts: EdgeOptions): Generator<void, EdgeReport> {
  const o = { ...DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();
  const base: EdgeReport = {
    generatedAt: now,
    status: "not_enough_data",
    note: "",
    samples: 0,
    hours: 0,
    discoveryHours: 0,
    holdoutHours: 0,
    tested: 0,
    candidates: 0,
    survivors: [],
    failed: [],
    placebo: { runs: 0, avgSurvivors: 0, maxSurvivors: 0 },
  };

  // Would-be entries in the current layout, complete (older than the follow-up horizon): the
  // first time a coin reached each score level, and every coin at each fixed point in its life.
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - o.horizonMs;
  const rows = samples.filter(
    (s) =>
      (s.kind === "entry" || (s.kind === "checkpoint" && s.tag in ENTRY_POINTS)) &&
      s.gv === GRID_VERSION &&
      s.f &&
      s.gridT?.length === GRID.length &&
      s.path?.length === PATH_MIN.length &&
      s.ts <= cutoff,
  );
  rows.sort((a, b) => a.ts - b.ts);
  const n = rows.length;
  const t0 = n ? rows[0]!.ts : 0;
  const t1 = n ? rows[n - 1]!.ts : 0;
  const hours = n ? (t1 - t0) / 3_600_000 : 0;
  base.samples = n;
  base.hours = hours;
  if (n < o.minSamples || hours < o.minHours) {
    base.note = `Needs at least ${o.minHours} hours of recorded market and ${o.minSamples.toLocaleString("en-US")} finished would-be trades (so far: ${hours.toFixed(1)} h, ${n.toLocaleString("en-US")}). Each outcome finishes ${Math.round(o.horizonMs / 3_600_000)} hours after its entry.`;
    return base;
  }

  // Net return of every row for every exit, computed once.
  const R = new Float32Array(n * EXITS);
  for (let i = 0; i < n; i++) {
    const s = rows[i]!;
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < HOLDS_MIN.length; h++) R[i * EXITS + c * HOLDS_MIN.length + h] = exitReturn(s, c, h);
    if (i % 2_000 === 0) yield;
  }

  // Each entry family is split on its own time span (older two thirds to search, newest third
  // to check), so families recorded over different spans are all checked on unseen data.
  const groups: Group[] = [];
  const byEntry = new Map<string, number[]>();
  rows.forEach((s, i) => {
    let list = byEntry.get(s.tag);
    if (!list) byEntry.set(s.tag, (list = []));
    list.push(i);
  });
  const families: { tag: string; level: number; at?: string }[] = [
    ...ENTRY_LEVELS.map((level) => ({ tag: `x${level}`, level })),
    ...Object.keys(ENTRY_POINTS).map((at) => ({ tag: at, level: 0, at })),
  ];
  for (const fam of families) {
    const idx = byEntry.get(fam.tag) ?? [];
    if (!idx.length) continue;
    const f0 = rows[idx[0]!]!.ts;
    const f1 = rows[idx[idx.length - 1]!]!.ts;
    const split = f0 + ((f1 - f0) * 2) / 3;
    const holdDays = Math.max(1 / 24, (f1 - split) / 86_400_000);
    CONDITIONS.forEach((cond, ci) => {
      const disc: number[] = [];
      const hold: number[] = [];
      for (const i of idx) if (cond.test(rows[i]!)) (rows[i]!.ts < split ? disc : hold).push(i);
      groups.push({ level: fam.level, at: fam.at, cond: ci, disc: Int32Array.from(disc), hold: Int32Array.from(hold), holdDays });
    });
  }

  const zero = new Float64Array(EXITS);
  const real: Data = { R, row: (i) => i, shift: zero, wins: (v) => v > 0 };
  const run = yield* search(real, groups, o);

  const toFound = (c: Scored, holdSt: EdgeStats): EdgeFound => {
    const combo = Math.floor(c.e / HOLDS_MIN.length);
    const rule: EdgeRule = { level: c.g.level, cond: CONDITIONS[c.g.cond]!.key, tp: GRID[combo]!.tp, sl: GRID[combo]!.sl, hold: HOLDS_MIN[c.e % HOLDS_MIN.length]! };
    if (c.g.at) rule.at = c.g.at;
    const all = groups.find((g) => g.level === c.g.level && g.at === c.g.at && g.cond === 0)!;
    return {
      ...rule,
      text: describe(rule),
      discovery: c.disc,
      holdout: holdSt,
      baseline: stats(real, all.hold, c.e, 0).mean,
      tradesPerDay: new Set(Array.from(c.g.hold, (i) => rows[i]!.mint)).size / c.g.holdDays,
      settings: settingsFor(rule),
    };
  };
  const survivors = run.passed.map((x) => toFound(x.c, x.hold)).sort((a, b) => b.holdout.lo - a.holdout.lo);
  const failed = run.cands
    .filter((x) => !run.passed.includes(x))
    .slice(0, 3)
    .map((x) => toFound(x.c, x.hold));

  // Placebo: outcomes shuffled across entries and centred per exit, so no rule has an edge.
  const colMean = new Float64Array(EXITS);
  for (let i = 0; i < n; i++) for (let e = 0; e < EXITS; e++) colMean[e] += R[i * EXITS + e]!;
  for (let e = 0; e < EXITS; e++) colMean[e] /= n;
  const rand = rng(o.seed);
  const counts: number[] = [];
  for (let r = 0; r < o.placeboRuns; r++) {
    const perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i]!;
      perm[i] = perm[j]!;
      perm[j] = t;
    }
    counts.push((yield* search({ R, row: (i) => perm[i]!, shift: colMean, wins: (v) => v > 0 }, groups, o)).passed.length);
  }

  const discHours = hours * (2 / 3);
  return {
    ...base,
    status: "ok",
    note: survivors.length
      ? `${survivors.length} rule${survivors.length > 1 ? "s" : ""} held up on the newest data the search never saw.`
      : "No rule held up on the newest data yet. That is a real answer: keep recording, the search runs again every few hours.",
    discoveryHours: discHours,
    holdoutHours: hours - discHours,
    tested: run.tested,
    candidates: run.cands.length,
    survivors,
    failed,
    placebo: {
      runs: counts.length,
      avgSurvivors: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
      maxSurvivors: counts.length ? Math.max(...counts) : 0,
    },
  };
}
