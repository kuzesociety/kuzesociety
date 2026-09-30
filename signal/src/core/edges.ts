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
import { ENTRY_LEVELS, GRID, GRID_VERSION_MIN, LEGACY_GRID, PATH_MIN, type Sample, counts } from "./outcomes.js";
import { ENTRY_POINTS, type Settings, condsHold, customMoment, entryLabel, filterBlock, ruleKey, tagOfLabel } from "./settings.js";
import { clusteredMeanCI, hourOf, rng } from "./util.js";

/** Time limits tried with every take-profit/stop-loss pair (minutes, 0 = none). */
export const HOLDS_MIN = [0, 10, 30, 60] as const;
export const EXITS = GRID.length * HOLDS_MIN.length;

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
  /** or entry at a point in every coin's life (a key of ENTRY_POINTS, or a recorded moment of your own) */
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
  /** average minutes a trade of this rule stays open (holdout), which decides how many your open-position limit allows */
  avgHoldMin?: number;
  /** settings that make the bot trade exactly this rule */
  settings: Partial<Settings>;
}

/**
 * How the proof is computed. 2: the holdout counts evidence per market hour. 3: a recording whose
 * price stopped reaching us counts only if it was watched for the rule's whole window (counts). A
 * report made by an older method is shown but not acted on (core/autopilot).
 */
export const EDGE_METHOD = 3;

export interface EdgeReport {
  generatedAt: number;
  /** EDGE_METHOD of the search that made it (missing: made before methods were numbered) */
  method?: number;
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
  /** the newest would-be entry the search used (its proof covers entries up to here) */
  cutoff?: number;
  /**
   * The rule in use (EdgeOptions.incumbent) on every coin that qualified for it after it was
   * proven, as far as observed: its forward test. Range: 95%, counted per hour.
   */
  incumbent?: { text: string; n: number; mean: number; lo: number; hi: number };
  /** your own rule (EdgeOptions.own) on the same unseen coins as the candidates, with the same bar (measureRule) */
  own?: RuleMeasure;
}

/**
 * A rule you set, measured on the recordings the way the search checks its candidates: every
 * coin that qualified for it exactly (entry, stages, filters, conditions) on the newest third of
 * its entry's data, which the search never used to pick anything, counted per market hour, with
 * the lower bound corrected for the candidates checked at the same time (`tests`). A rule the
 * recordings cannot express exactly is not measured (`why`), never approximated.
 */
export interface RuleMeasure {
  /** the rule measured (settings ruleKey) */
  key: string;
  ok: boolean;
  /** why it could not be measured, in plain words */
  why?: string;
  n: number;
  mean: number;
  lo: number;
  hi: number;
  /** distinct coins a day that qualified on the measured data */
  coinsPerDay: number;
  /** average minutes a trade stayed open (as for EdgeFound) */
  avgHoldMin?: number;
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
  /** the rule in use and the newest entry its proof used: measured on what came after (EdgeReport.incumbent) */
  incumbent?: { rule: EdgeRule; after: number };
  /** your own rule: measured like a candidate (EdgeReport.own) */
  own?: Settings;
}

const DEFAULTS: Required<Omit<EdgeOptions, "now" | "incumbent" | "own">> = {
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

export { normInv, tInv } from "./util.js";

/**
 * Net return of a sample for grid combo `c` with time limit HOLDS_MIN[h] — NaN when it does not
 * count (the coin's price stopped reaching us before that exit, or before the rule's window ended
 * where only luck decides which samples are watched that long: see counts, Sample.blind).
 */
export function exitReturn(s: Sample, c: number, h: number): number {
  return exitReturnAt(s, c, HOLDS_MIN[h]!);
}

/** Whether a recording followed exit `c` at all: one made under an older layout followed fewer. */
export function hasExit(s: Pick<Sample, "grid" | "gridT">, c: number): boolean {
  if (c >= s.grid.length) return false;
  return s.gridT === undefined || c < s.gridT.length;
}

/** exitReturn for a time limit in minutes: 0 (none: followed for the horizon) or one of PATH_MIN. */
export function exitReturnAt(s: Sample, c: number, hold: number): number {
  if (!hasExit(s, c)) return NaN; // an older layout never followed this exit
  const ret = s.grid[c]!;
  const window = hold ? hold * 60 : Infinity;
  const t = s.gridT?.[c];
  if (hold === 0 || (t ?? 0) <= hold * 60) return counts(s, t ?? Infinity, window) ? ret : NaN;
  // sold at the time limit
  if (!counts(s, window, window)) return NaN;
  const v = s.path?.[PATH_MIN.indexOf(hold as (typeof PATH_MIN)[number])];
  return v ?? ret;
}

/** A rule in plain words ("Buy every coin 5 min after graduating · sell at +50% or −20%, or after 30 min"). */
export function describeRule(r: EdgeRule): string {
  return describe(r);
}

function describe(r: EdgeRule): string {
  const cond = CONDITIONS.find((c) => c.key === r.cond)!;
  const when = r.cond === "any" ? "" : ` · ${cond.label}`;
  const time = r.hold ? `, or after ${r.hold} min` : "";
  const entry = r.at ? `Buy every coin ${entryLabel(r.at)}` : `Buy when a coin first reaches ${r.level}`;
  return `${entry}${when} · sell at +${r.tp}% or −${r.sl}%${time}`;
}

/** The rule an edge-finder text describes (the inverse of its description), or null. */
export function edgeRuleFromText(text: string): EdgeRule | null {
  const m = /^Buy (?:every coin (.+?)|when a coin first reaches (\d+))(?: · (.+?))? · sell at \+(\d+)% or −(\d+)%(?:, or after (\d+) min)?$/.exec(text.trim());
  if (!m) return null;
  const at = m[1] !== undefined ? tagOfLabel(m[1]) : undefined;
  if (m[1] !== undefined && !at) return null;
  const level = m[2] !== undefined ? Number(m[2]) : 0;
  if (m[2] !== undefined && !(ENTRY_LEVELS as readonly number[]).includes(level)) return null;
  const cond = m[3] === undefined ? CONDITIONS[0] : CONDITIONS.find((c) => c.label === m[3]);
  const tp = Number(m[4]);
  const sl = Number(m[5]);
  const hold = m[6] === undefined ? 0 : Number(m[6]);
  if (!cond || !GRID.some((g) => g.tp === tp && g.sl === sl) || !(HOLDS_MIN as readonly number[]).includes(hold)) return null;
  const rule: EdgeRule = { level, cond: cond.key, tp, sl, hold };
  if (at) rule.at = at;
  return describe(rule) === text.trim() ? rule : null;
}

/** Settings that trade the rule as it was tested: without a time limit, a trade was followed for `horizonMs`. */
export function settingsFor(r: EdgeRule, horizonMs: number): Partial<Settings> {
  const cond = CONDITIONS.find((c) => c.key === r.cond)!;
  const out: Partial<Settings> = {
    entryAt: r.at ?? "score",
    conds: [],
    minScore: r.at ? 0 : r.level,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || Math.round(horizonMs / 60_000),
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

/**
 * The recordings the search and the measures use: would-be entries of the current layout — the
 * first time a coin reached each score level, and every coin at each recorded point in its life —
 * complete (older than the follow-up horizon), oldest first.
 */
export function recordedRows(samples: Sample[], horizonMs: number): Sample[] {
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - horizonMs;
  return samples
    .filter(
      (s) =>
        (s.kind === "entry" || (s.kind === "checkpoint" && s.tag in ENTRY_POINTS) || (s.kind === "moment" && customMoment(s.tag) !== null)) &&
        (s.gv ?? 0) >= GRID_VERSION_MIN &&
        s.f &&
        (s.gridT?.length ?? 0) >= LEGACY_GRID &&
        s.grid.length >= LEGACY_GRID &&
        s.path?.length === PATH_MIN.length &&
        s.ts <= cutoff,
    )
    .sort((a, b) => a.ts - b.ts);
}

/** Why the recordings cannot express a rule exactly, or null (see measureRule). */
export function whyUnmeasurable(s: Settings, horizonMs: number): string | null {
  if (s.entryAt === "score" && !(ENTRY_LEVELS as readonly number[]).includes(s.minScore)) return `score ${s.minScore} is not one of the levels the bot records (${ENTRY_LEVELS.join(", ")})`;
  if (s.entryAt === "score" && s.reentry) return "buying the same coin again is not recorded";
  if (!GRID.some((g) => g.tp === s.tpPct && g.sl === s.slPct))
    return `+${s.tpPct}% / −${s.slPct}% is not among the exits the bot records (take profit ${GRID_TP_TEXT}; stop loss ${GRID_SL_TEXT})`;
  if (holdOf(s, horizonMs) === null) return `a time limit of ${s.maxHoldMin} min is not among the ones the bot records (${PATH_MIN.join(", ")} min, ${Math.round(horizonMs / 3_600_000)} h or none)`;
  if (s.trailPct > 0) return "a trailing stop is not recorded";
  if (s.takeInitials) return "taking the initials out is not recorded";
  return null;
}

const GRID_TP_TEXT = [...new Set(GRID.map((g) => g.tp))].map((x) => `${x}%`).join(", ");
const GRID_SL_TEXT = [...new Set(GRID.map((g) => g.sl))].map((x) => `${x}%`).join(", ");

/** The recorded time limit a rule sells at: 0 (none, or at least the horizon), a PATH_MIN one, or null. */
function holdOf(s: Settings, horizonMs: number): number | null {
  if (s.maxHoldMin === 0 || s.maxHoldMin * 60_000 >= horizonMs) return 0;
  return (PATH_MIN as readonly number[]).includes(s.maxHoldMin) ? s.maxHoldMin : null;
}

/**
 * Your own rule on the recordings (RuleMeasure): the coins that qualified for it exactly, on the
 * newest third of its entry's data — the part on which the search checks its candidates — with
 * their bound corrected for `tests` candidates checked at once, so your rule and the proven ones
 * meet the same bar on the same coins. `rows`: recordedRows.
 */
export function measureRule(rows: Sample[], s: Settings, o: { horizonMs: number; tests?: number; minN?: number; minWins?: number }): RuleMeasure {
  const key = ruleKey(s);
  const none = (why: string): RuleMeasure => ({ key, ok: false, why, n: 0, mean: NaN, lo: NaN, hi: NaN, coinsPerDay: 0 });
  const bad = whyUnmeasurable(s, o.horizonMs);
  if (bad) return none(bad);
  const tag = s.entryAt === "score" ? `x${s.minScore}` : s.entryAt;
  const family = rows.filter((r) => r.tag === tag);
  if (family.length < 2) return none(`the bot has no finished recordings of ${s.entryAt === "score" ? `coins reaching ${s.minScore}` : `coins ${entryLabel(tag)}`} yet`);
  const f0 = family[0]!.ts;
  const f1 = family[family.length - 1]!.ts;
  const split = f0 + ((f1 - f0) * 2) / 3;
  const combo = GRID.findIndex((g) => g.tp === s.tpPct && g.sl === s.slPct);
  const hold = holdOf(s, o.horizonMs)!;
  // market hours counted as the search counts them, from its first entry
  const t0 = rows[0]!.ts;
  const vals: number[] = [];
  const hours: number[] = [];
  const mints = new Set<string>();
  let held = 0;
  let wins = 0;
  let qualified = 0;
  for (const r of family) {
    if (r.ts < split) continue;
    if ((r.stage === "curve" && !s.tradeCurve) || (r.stage === "amm" && !s.tradeAmm)) continue;
    if (s.conds.length && !condsHold(s.conds, r.x)) continue;
    if (!s.scoreOnly && filterBlock(s.filters, r.f!)) continue;
    qualified++;
    mints.add(r.mint);
    const v = exitReturnAt(r, combo, hold);
    if (Number.isNaN(v)) continue; // not observed for this exit
    vals.push(v);
    hours.push(Math.floor((r.ts - t0) / 3_600_000));
    if (v > 0) wins++;
    const sec = r.gridT?.[combo] ?? 0;
    held += hold ? Math.min(sec, hold * 60) : sec;
  }
  const minN = o.minN ?? DEFAULTS.minHoldout;
  const minWins = o.minWins ?? DEFAULTS.minWins;
  if (vals.length < minN)
    return none(
      qualified >= minN
        ? `only ${vals.length} of the ${qualified} coins that qualified on the newest recordings were watched through its whole time limit (${minN} needed) — graduated coins drop out of the 40 followed pools after a while`
        : `only ${qualified} coins qualified for it on the newest recordings (${minN} needed)`,
    );
  const m = clusteredMeanCI(vals, hours, 1 - 0.1 / Math.max(1, o.tests ?? DEFAULTS.candidates));
  const days = Math.max(1 / 24, (f1 - split) / 86_400_000);
  const out: RuleMeasure = { key, ok: true, n: vals.length, mean: m.mean, lo: m.lo, hi: m.hi, coinsPerDay: mints.size / days, avgHoldMin: held / vals.length / 60 };
  if (wins < minWins) return { ...out, ok: false, why: `only ${wins} of its ${vals.length} coins won — too few to count on` };
  return out;
}

/**
 * A rule on every coin that qualified for it after `after` (entries its proof never saw), as far
 * as observed: what it would have made since. The range counts evidence per market hour.
 */
function forwardTest(rows: Sample[], rule: EdgeRule, after: number): EdgeReport["incumbent"] {
  const tag = rule.at ?? `x${rule.level}`;
  const cond = CONDITIONS.find((c) => c.key === rule.cond);
  const combo = GRID.findIndex((g) => g.tp === rule.tp && g.sl === rule.sl);
  const h = HOLDS_MIN.indexOf(rule.hold as (typeof HOLDS_MIN)[number]);
  if (!cond || combo < 0 || h < 0) return undefined;
  const v: number[] = [];
  const hours: number[] = [];
  for (const s of rows) {
    if (s.ts <= after || s.tag !== tag || !cond.test(s)) continue;
    const x = exitReturn(s, combo, h);
    if (Number.isNaN(x)) continue;
    v.push(x);
    hours.push(hourOf(s.ts));
  }
  const m = clusteredMeanCI(v, hours);
  return { text: describe(rule), n: v.length, mean: m.mean, lo: m.lo, hi: m.hi };
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
  /** the hour each entry happened in (counted from the first entry) */
  hour: Int32Array;
}

function stats(d: Data, idx: Int32Array, e: number, z: number): EdgeStats {
  let n = 0;
  let sum = 0;
  let sq = 0;
  let w = 0;
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]!) * EXITS + e]! - d.shift[e]!;
    if (Number.isNaN(v)) continue; // not observed
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

/**
 * Holdout statistics, at confidence 1 − 0.05/`tests` (corrected for the candidates checked at
 * once). Coins bought in the same hour share the market's mood — one hot hour lifts all of
 * them — so the bound counts the evidence hour by hour as well as trade by trade and keeps the
 * more cautious one (util clusteredMeanCI): a rule carried by one lucky hour does not pass as
 * dozens of independent wins.
 */
function holdoutStats(d: Data, idx: Int32Array, e: number, tests: number): EdgeStats {
  const st = stats(d, idx, e, 0);
  if (st.n < 2) return st;
  const vals: number[] = [];
  const hours: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]!) * EXITS + e]! - d.shift[e]!;
    if (Number.isNaN(v)) continue; // not observed
    vals.push(v);
    hours.push(d.hour[idx[k]!]!);
  }
  // one-sided at 0.05/tests = two-sided at 1 − 0.1/tests
  return { ...st, lo: clusteredMeanCI(vals, hours, 1 - 0.1 / Math.max(1, tests)).lo };
}

interface SearchResult {
  tested: number;
  cands: { c: Scored; hold: EdgeStats }[];
  passed: { c: Scored; hold: EdgeStats }[];
}

const wins = (st: EdgeStats) => Math.round(st.winRate * st.n);

function* search(d: Data, groups: Group[], o: Required<Omit<EdgeOptions, "now" | "incumbent" | "own">>): Generator<void, SearchResult> {
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
  const checked = cands.map((c) => ({ c, hold: holdoutStats(d, c.g.hold, c.e, cands.length) }));
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
    method: EDGE_METHOD,
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
  // first time a coin reached each score level, and every coin at each point in its life.
  const rows = recordedRows(samples, o.horizonMs);
  if (rows.length) base.cutoff = rows[rows.length - 1]!.ts;
  if (opts.incumbent) base.incumbent = forwardTest(rows, opts.incumbent.rule, opts.incumbent.after);
  const own = (tests: number) => (opts.own ? { own: measureRule(rows, opts.own, { horizonMs: o.horizonMs, tests, minN: o.minHoldout, minWins: o.minWins }) } : {});
  const n = rows.length;
  const t0 = n ? rows[0]!.ts : 0;
  const t1 = n ? rows[n - 1]!.ts : 0;
  const hours = n ? (t1 - t0) / 3_600_000 : 0;
  base.samples = n;
  base.hours = hours;
  if (n < o.minSamples || hours < o.minHours) {
    base.note = `Needs at least ${o.minHours} hours of recorded market and ${o.minSamples.toLocaleString("en-US")} finished would-be trades (so far: ${hours.toFixed(1)} h, ${n.toLocaleString("en-US")}). Each outcome finishes ${Math.round(o.horizonMs / 3_600_000)} hours after its entry.`;
    return { ...base, ...own(o.candidates) };
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
  // moments of your own are searched like the fixed points once they are recorded
  const yours = [...new Set(rows.filter((s) => s.kind === "moment").map((s) => s.tag))].sort();
  const families: { tag: string; level: number; at?: string }[] = [
    ...ENTRY_LEVELS.map((level) => ({ tag: `x${level}`, level })),
    ...[...Object.keys(ENTRY_POINTS), ...yours].map((at) => ({ tag: at, level: 0, at })),
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

  // the hour of every entry: coins bought in the same hour share the market's mood (holdoutStats)
  const hour = new Int32Array(n);
  for (let i = 0; i < n; i++) hour[i] = Math.floor((rows[i]!.ts - t0) / 3_600_000);
  const zero = new Float64Array(EXITS);
  const real: Data = { R, row: (i) => i, shift: zero, wins: (v) => v > 0, hour };
  const run = yield* search(real, groups, o);

  const toFound = (c: Scored, holdSt: EdgeStats): EdgeFound => {
    const combo = Math.floor(c.e / HOLDS_MIN.length);
    const rule: EdgeRule = { level: c.g.level, cond: CONDITIONS[c.g.cond]!.key, tp: GRID[combo]!.tp, sl: GRID[combo]!.sl, hold: HOLDS_MIN[c.e % HOLDS_MIN.length]! };
    if (c.g.at) rule.at = c.g.at;
    const all = groups.find((g) => g.level === c.g.level && g.at === c.g.at && g.cond === 0)!;
    // time in the trade: until the target, the stop or the time limit, whichever came first
    let held = 0;
    let heldN = 0;
    for (const i of c.g.hold) {
      if (Number.isNaN(R[i * EXITS + c.e]!)) continue; // not observed
      const sec = rows[i]!.gridT?.[combo] ?? 0;
      held += rule.hold ? Math.min(sec, rule.hold * 60) : sec;
      heldN++;
    }
    return {
      ...rule,
      text: describe(rule),
      discovery: c.disc,
      holdout: holdSt,
      baseline: stats(real, all.hold, c.e, 0).mean,
      tradesPerDay: new Set(Array.from(c.g.hold, (i) => rows[i]!.mint)).size / c.g.holdDays,
      avgHoldMin: heldN ? held / heldN / 60 : undefined,
      settings: settingsFor(rule, o.horizonMs),
    };
  };
  const survivors = run.passed.map((x) => toFound(x.c, x.hold)).sort((a, b) => b.holdout.lo - a.holdout.lo);
  const failed = run.cands
    .filter((x) => !run.passed.includes(x))
    .slice(0, 3)
    .map((x) => toFound(x.c, x.hold));

  // Placebo: outcomes shuffled across entries and centred per exit, so no rule has an edge.
  const colMean = new Float64Array(EXITS);
  const colN = new Float64Array(EXITS);
  for (let i = 0; i < n; i++)
    for (let e = 0; e < EXITS; e++) {
      const v = R[i * EXITS + e]!;
      if (Number.isNaN(v)) continue;
      colMean[e] += v;
      colN[e]++;
    }
  for (let e = 0; e < EXITS; e++) colMean[e] = colN[e] ? colMean[e]! / colN[e]! : 0;
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
    counts.push((yield* search({ R, row: (i) => perm[i]!, shift: colMean, wins: (v) => v > 0, hour }, groups, o)).passed.length);
  }

  const discHours = hours * (2 / 3);
  return {
    ...base,
    ...own(run.cands.length),
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
