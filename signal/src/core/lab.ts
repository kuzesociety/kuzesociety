/**
 * The Lab: rules the bot invents beyond the edge finder's menu, each one proven only on coins
 * that came after it was invented.
 *
 * The edge finder tries a fixed menu — an entry, one of 22 coin conditions, an exit — and checks
 * its best picks on the newest third of the data. The Lab looks further: conditions on any of the
 * facts the bot records about a coin at the moment of entry (money flowing in, smart wallets,
 * holders, narrative and market heat …), up to two at a time. Searching that much finds lucky
 * rules easily, so the Lab pays for its freedom with a stricter proof:
 *
 *   1. Invent (every learning cycle): on the finished data so far, the rules with the best
 *      cautious average that also made money in both halves of that data become ideas. Each is
 *      written down with the newest entry the search saw.
 *   2. Prove: an idea is judged only on coins that appeared after that entry, so nothing it was
 *      invented from can count for it. It is looked at when it reaches 60, 120, 240 and 480
 *      finished coins, and passes when the low end of its range — counting coins bought in the
 *      same hour as one piece of evidence — is above zero at one-sided 0.05% per look: an idea
 *      without an edge passes by luck at most about once in 500.
 *   3. Retire: clearly losing (the top of its 95% range below zero), not proven by its last look,
 *      or too few coins in a week. A proven idea leaves again when the coins after its proof
 *      clearly fall short of it (the top of their 95% range below its proven worst case), or
 *      after two weeks (the search can find it again on newer data).
 *
 * A proven idea is offered to the autopilot like an edge-finder rule, its proof being the coins
 * after its invention. Your own ideas can be added as text (parseLabRule) — your hunches, or
 * rules Claude proposed from the Lab's summary (labSummary) — and are tested the same way.
 * Every rule is one the bot can trade exactly as recorded: its conditions are checked on the
 * same facts, at the same moment (Settings.conds, Engine.entryBlock).
 */
import { type EdgeFound, EXITS, HOLDS_MIN, exitReturn } from "./edges.js";
import { FEATURE_KEYS, fmtAge } from "./features.js";
import { ENTRY_LEVELS, GRID, GRID_VERSION, PATH_MIN, type Sample } from "./outcomes.js";
import { ENTRY_POINTS, type RuleCond, type Settings, condsHold, entryLabel } from "./settings.js";
import { clusteredMeanCI, hourOf, newId } from "./util.js";

const DAY = 86_400_000;
const NF = FEATURE_KEYS.length;
const H = HOLDS_MIN.length;

export const LAB = {
  /** ideas from the search tested at once */
  maxActive: 20,
  /** your own ideas tested at once */
  mineMax: 5,
  /** new ideas from one search at most, one per entry */
  newPerRun: 3,
  /** finished coins at which an idea is looked at; it can be proven only at these */
  looks: [60, 120, 240, 480],
  /** one-sided error per look: an idea without an edge passes a look by luck at most this often */
  alpha: 0.0005,
  /** a proof resting on a handful of lucky wins is not trusted */
  minWins: 10,
  /** an idea not proven after this long leaves */
  maxAgeMs: 7 * DAY,
  /** a proven idea leaves after this long, and has to be found and proven again */
  provenMs: 14 * DAY,
  /** coins after its proof before a proven idea can be dropped for falling short */
  postMin: 40,
  /** the search: fewest trades a rule needs on the data it is invented from */
  minSeen: 60,
  /** the search needs this much finished data */
  minHours: 24,
  minRows: 1_000,
  /** candidate thresholds: these shares of each fact's values at each entry */
  quantiles: [0.1, 0.25, 0.5, 0.75, 0.9],
  /** thresholds per entry that get every exit after the first look (on SCREEN exits) */
  screenTop: 16,
  /** single conditions per entry carried into pairs */
  pairTop: 8,
  /** a failed idea is not suggested again for this long */
  retryAfterMs: 3 * DAY,
  /** retired ideas kept to show */
  keepRetired: 30,
  /** results kept per idea (oldest dropped beyond) */
  keepVals: 3_000,
};

/** How ideas are proven; state from another method starts over. */
export const LAB_METHOD = 1;

// ---- the facts a rule can use, in everyday units --------------------------------------------

export interface LabFact {
  key: string;
  label: string;
  /** model units (features.ts) → everyday value, and back (both increasing) */
  raw: (x: number) => number;
  x: (raw: number) => number;
  /** a round everyday value near `raw`, so every threshold reads cleanly */
  nice: (raw: number) => number;
  show: (raw: number) => string;
  /** a yes/no fact */
  yesNo?: boolean;
  /** everyday values are fractions shown as % */
  pct?: boolean;
}

const sig2 = (v: number) => (v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(2)));
const signedPct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const pctFact = (key: string, label: string): LabFact => ({ key, label, raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 100) / 100, show: (r) => `${Math.round(r * 100)}%`, pct: true });
const countFact = (key: string, label: string): LabFact => ({ key, label, raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: (r) => (r >= 10 ? sig2(r) : Math.round(r)), show: (r) => `${Math.round(r)}` });
const solFact = (key: string, label: string): LabFact => ({ key, label, raw: Math.sinh, x: Math.asinh, nice: sig2, show: (r) => `${r} SOL` });
const moveFact = (key: string, label: string): LabFact => ({ key, label, raw: (x) => Math.exp(x) - 1, x: (r) => Math.max(-2, Math.min(2, Math.log(1 + Math.max(-0.99, r)))), nice: (r) => Math.round(r * 100) / 100, show: signedPct, pct: true });
const yesNoFact = (key: string, label: string): LabFact => ({ key, label, raw: (x) => x, x: (r) => r, nice: (r) => (r >= 0.5 ? 1 : 0), show: (r) => (r >= 0.5 ? "yes" : "no"), yesNo: true });

/** Every recorded fact a rule may set a condition on (the hour and the time since graduation are the entry's business). */
export const LAB_FACTS: LabFact[] = [
  { key: "age", label: "Age", raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: (r) => (r < 90 ? Math.round(r / 5) * 5 : r < 5400 ? Math.round(r / 60) * 60 : Math.round(r / 600) * 600), show: fmtAge },
  { key: "mcap", label: "Market cap", raw: Math.exp, x: (r) => Math.log(Math.max(r, 1)), nice: sig2, show: (r) => `${r} SOL` },
  pctFact("progress", "Curve progress"),
  solFact("net60", "Net inflow 60s"),
  solFact("net300", "Net inflow 5m"),
  { key: "accel", label: "Acceleration", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 10) / 10, show: (r) => r.toFixed(1) },
  pctFact("buyRatio", "Buy share 60s"),
  countFact("uniq60", "New buyers 60s"),
  countFact("uniqTotal", "Buyers total"),
  countFact("trades60", "Trades 60s"),
  { key: "avgBuy", label: "Avg buy 5m", raw: (x) => Math.exp(x) - 0.01, x: (r) => Math.log(0.01 + Math.max(0, r)), nice: sig2, show: (r) => `${r} SOL` },
  pctFact("whale", "Largest buy share"),
  pctFact("devShare", "Dev holds"),
  pctFact("devSold", "Dev sold"),
  pctFact("bundle", "Bundled supply"),
  pctFact("early", "Sniper supply"),
  pctFact("top10", "Top 10 holders"),
  countFact("holders", "Holders"),
  pctFact("drawdown", "Below peak"),
  moveFact("chg30", "Move 30s"),
  moveFact("chg120", "Move 2m"),
  countFact("smart", "Smart wallets in"),
  pctFact("fresh", "Fresh wallets"),
  { key: "socials", label: "Socials", raw: (x) => x * 3, x: (r) => r / 3, nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} of 3` },
  yesNoFact("tweet", "Tweet-linked"),
  { key: "cluster", label: "Narrative heat", raw: Math.exp, x: (r) => Math.log(Math.max(1, r)), nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} similar coins` },
  yesNoFact("leader", "Narrative leader"),
  yesNoFact("copycat", "Copycat"),
  { key: "serial", label: "Dev launches in 24 h", raw: (x) => Math.expm1(x) + 1, x: (r) => Math.log1p(Math.max(0, r - 1)), nice: (r) => Math.round(r), show: (r) => `${Math.round(r)}` },
  { key: "creatorBest", label: "Dev's best coin", raw: (x) => Math.expm1(x) * 100, x: (r) => Math.log1p(Math.max(0, r) / 100), nice: sig2, show: (r) => `${r} SOL` },
  { key: "heat", label: "Market heat", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 100) / 100, show: (r) => r.toFixed(2) },
  { key: "liquidity", label: "Liquidity", raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: sig2, show: (r) => `${r} SOL` },
  { key: "dex", label: "DEX listing paid", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} of 2` },
];
const FACT = new Map(LAB_FACTS.map((f) => [f.key, f]));
const FACT_INDEX = LAB_FACTS.map((f) => FEATURE_KEYS.indexOf(f.key));

// ---- rules ---------------------------------------------------------------------------------

export interface LabRule {
  /** entry: a score level (`x70`, the first time the score reaches it) or a fixed point in a coin's life (an ENTRY_POINTS key) */
  at: string;
  stage?: "curve" | "amm";
  conds: RuleCond[];
  tp: number;
  sl: number;
  /** time limit, minutes (0: until the target, the stop or the end of the recording) */
  hold: number;
}

/** "top 10 holders ≤ 25%", "smart wallets in ≥ 1", "tweet-linked" */
export function describeCond(c: RuleCond): string {
  const f = FACT.get(c.k);
  if (!f) return c.k;
  const raw = f.raw(c.v);
  if (f.yesNo) return c.op === ">=" ? f.label.toLowerCase() : `not ${f.label.toLowerCase()}`;
  return `${f.label.toLowerCase()} ${c.op === ">=" ? "≥" : "≤"} ${f.show(raw)}`;
}

/** The condition as it is typed: "top10<=25%", "smart>=1", "tweet=1". */
function condCode(c: RuleCond): string {
  const f = FACT.get(c.k);
  if (!f) return `${c.k}${c.op}${c.v}`;
  const raw = f.raw(c.v);
  if (f.yesNo) return `${c.k}=${c.op === ">=" ? 1 : 0}`;
  return `${c.k}${c.op}${f.pct ? `${Math.round(raw * 100)}%` : String(Number(raw.toPrecision(4)))}`;
}

function entryWords(at: string): string {
  return at.startsWith("x") ? `Buy when a coin first reaches ${at.slice(1)}` : `Buy every coin ${entryLabel(at)}`;
}

/** In words: "Lab: Buy every coin 5 min after graduating with top 10 holders ≤ 25% and smart wallets in ≥ 1 · sell at +100% or −30%, or after 30 min". */
export function describeLab(r: LabRule): string {
  const where = [r.stage === "curve" ? "still on the bonding curve" : r.stage === "amm" ? "already graduated" : "", ...r.conds.map(describeCond)].filter(Boolean);
  const time = r.hold ? `, or after ${r.hold} min` : "";
  return `Lab: ${entryWords(r.at)}${where.length ? ` with ${where.join(" and ")}` : ""} · sell at +${r.tp}% or −${r.sl}%${time}`;
}

/** As it is typed: "mig300 top10<=25% smart>=1 tp100 sl30 hold30". */
export function labCode(r: LabRule): string {
  const entry = r.at.startsWith("x") ? `score${r.at.slice(1)}` : r.at;
  return [entry, r.stage ? `stage=${r.stage}` : "", ...r.conds.map(condCode), `tp${r.tp}`, `sl${r.sl}`, r.hold ? `hold${r.hold}` : ""].filter(Boolean).join(" ");
}

const GRID_TPS = [...new Set(GRID.map((g) => g.tp))];
const GRID_SLS = [...new Set(GRID.map((g) => g.sl))];

/** How to write a rule, for help texts. */
export const LAB_FORMAT =
  `entry, then up to 3 conditions, then the exit — e.g. "mig300 top10<=25% smart>=1 tp100 sl30 hold30". ` +
  `Entry: score50…score95 (the first time the score reaches it) or ${Object.keys(ENTRY_POINTS).join(", ")}. ` +
  `Optional: stage=curve or stage=amm. Conditions on: ${LAB_FACTS.map((f) => f.key).join(", ")} (with >= or <=; % for shares; =1 / =0 for yes/no). ` +
  `Take profit tp: ${GRID_TPS.join(", ")}; stop loss sl: ${GRID_SLS.join(", ")}; time limit hold (minutes): ${HOLDS_MIN.filter((h) => h > 0).join(", ")}, or none.`;

/** Reads a rule typed as text (labCode's format). */
export function parseLabRule(text: string): { rule: LabRule } | { error: string } {
  const words = text.trim().replace(/≥/g, ">=").replace(/≤/g, "<=").split(/\s+/).filter(Boolean);
  if (!words.length) return { error: `Write a rule: ${LAB_FORMAT}` };
  let at = "";
  const first = words[0]!.toLowerCase();
  const score = /^(?:score|x)(\d+)$/.exec(first);
  if (score && (ENTRY_LEVELS as readonly number[]).includes(Number(score[1]))) at = `x${score[1]}`;
  else if (first in ENTRY_POINTS) at = first;
  else return { error: `"${words[0]}" is not an entry. Start with score50…score95 or one of: ${Object.keys(ENTRY_POINTS).join(", ")}.` };
  const rule: LabRule = { at, conds: [], tp: NaN, sl: NaN, hold: 0 };
  for (const w of words.slice(1)) {
    const lw = w.toLowerCase();
    let m: RegExpExecArray | null;
    if ((m = /^stage=(curve|amm)$/.exec(lw))) rule.stage = m[1] as "curve" | "amm";
    else if ((m = /^tp(\d+)%?$/.exec(lw))) rule.tp = Number(m[1]);
    else if ((m = /^sl(\d+)%?$/.exec(lw))) rule.sl = Number(m[1]);
    else if ((m = /^hold(\d+)(?:m|min)?$/.exec(lw))) rule.hold = Number(m[1]);
    else if ((m = /^([a-z0-9]+)(>=|<=|=|>|<)(-?\d+(?:\.\d+)?)(%?)$/i.exec(w))) {
      const f = LAB_FACTS.find((x) => x.key.toLowerCase() === m![1]!.toLowerCase());
      if (!f) return { error: `"${m[1]}" is not a fact the bot records. Use one of: ${LAB_FACTS.map((x) => x.key).join(", ")}.` };
      let raw = Number(m[3]);
      if (f.pct && (m[4] === "%" || Math.abs(raw) > 1)) raw /= 100;
      let op: RuleCond["op"];
      if (f.yesNo) {
        if (m[2] !== "=" || (raw !== 0 && raw !== 1)) return { error: `${f.key} is yes/no: write ${f.key}=1 or ${f.key}=0.` };
        op = raw === 1 ? ">=" : "<=";
      } else if (m[2] === "=") return { error: `Use >= or <= with ${f.key}.` };
      else op = m[2]!.startsWith(">") ? ">=" : "<=";
      rule.conds.push({ k: f.key, op, v: f.x(raw) });
    } else return { error: `Could not read "${w}". ${LAB_FORMAT}` };
  }
  if (rule.conds.length > 3) return { error: "At most 3 conditions." };
  if (!Number.isFinite(rule.tp) || !Number.isFinite(rule.sl)) return { error: `Give the exit: tp (one of ${GRID_TPS.join(", ")}) and sl (one of ${GRID_SLS.join(", ")}).` };
  if (!GRID.some((g) => g.tp === rule.tp && g.sl === rule.sl)) return { error: `The bot records take profit ${GRID_TPS.join(", ")} and stop loss ${GRID_SLS.join(", ")} only.` };
  if (!(HOLDS_MIN as readonly number[]).includes(rule.hold)) return { error: `Time limit: hold${HOLDS_MIN.filter((h) => h > 0).join(", hold")}, or leave it out.` };
  if (rule.at.startsWith("mig") && rule.stage === "curve") return { error: "A coin is bought after graduating there, so it cannot still be on the curve." };
  return { rule };
}

/** Settings that trade the rule exactly as recorded (without a time limit a trade was followed for `horizonMs`). */
export function labSettings(r: LabRule, horizonMs: number): Partial<Settings> {
  const score = r.at.startsWith("x");
  return {
    entryAt: score ? "score" : r.at,
    conds: r.conds.map((c) => ({ ...c })),
    minScore: score ? Number(r.at.slice(1)) : 0,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || Math.round(horizonMs / 60_000),
    trailPct: 0,
    takeInitials: false,
    reentry: false,
    tradeCurve: r.stage !== "amm",
    tradeAmm: r.stage !== "curve",
    scoreOnly: true,
  };
}

// ---- ideas and their proof -----------------------------------------------------------------

export interface LabStats {
  n: number;
  mean: number;
  lo: number;
  hi: number;
}

export interface LabIdea extends LabRule {
  id: string;
  text: string;
  code: string;
  source: "search" | "you";
  /** when it entered the Lab */
  born: number;
  /** only coins that qualified after this entry time count for it (the newest the search saw, or when you added it) */
  from: number;
  /** on the data it was invented from — the search's own numbers, not proof */
  seen?: { n: number; mean: number; lo: number };
  status: "testing" | "proven" | "retired";
  /** coins that qualified after `from`; results of those whose exit counts (outcomes counts), with their market hour */
  coins: number;
  vals: number[];
  hrs: number[];
  heldSec: number;
  /** looks taken (how many of LAB.looks were reached) */
  looked: number;
  provenAt?: number;
  /** the newest entry its proof used: the coins after it check the proof */
  provenTo?: number;
  proof?: LabStats;
  post: { vals: number[]; hrs: number[] };
  retiredAt?: number;
  why?: string;
  /** retired because the coins after its proof fell short (evidence against it, for the autopilot) */
  stopped?: boolean;
  /** at retirement, all coins after `from` (95% range) */
  last?: LabStats;
}

export interface LabState {
  v: 1;
  method: number;
  ranAt: number;
  /** the newest finished entry already counted for the ideas */
  seenTo: number;
  /** how long outcomes are followed (for the settings of rules without a time limit) */
  horizonMs: number;
  /** rules scored by the last search */
  tested: number;
  note: string;
  ideas: LabIdea[];
  /** the strongest single conditions per entry in the last search (on past data — hints, not proof) */
  leads: { code: string; n: number; mean: number }[];
  /** per entry: coins a day and the best plain exit on past data (for the summary) */
  entries: { at: string; perDay: number; best: string; mean: number }[];
}

export function emptyLab(): LabState {
  return { v: 1, method: LAB_METHOD, ranAt: 0, seenTo: 0, horizonMs: 6 * 3_600_000, tested: 0, note: "The Lab starts once a day of market is recorded.", ideas: [], leads: [], entries: [] };
}

/** A copy that can be changed without touching `st`. */
function copyLab(st: LabState): LabState {
  return {
    ...st,
    leads: st.leads.map((x) => ({ ...x })),
    entries: st.entries.map((x) => ({ ...x })),
    ideas: st.ideas.map((i) => ({ ...i, conds: i.conds.map((c) => ({ ...c })), vals: [...i.vals], hrs: [...i.hrs], post: { vals: [...i.post.vals], hrs: [...i.post.hrs] } })),
  };
}

/** Restores a saved Lab (anything unusable starts over). */
export function restoreLab(saved: unknown): LabState {
  const s = saved as Partial<LabState> | null;
  if (!s || s.v !== 1 || s.method !== LAB_METHOD || !Array.isArray(s.ideas)) return emptyLab();
  return copyLab({ ...emptyLab(), ...s, ideas: s.ideas.filter((i) => i && Array.isArray(i.vals) && Array.isArray(i.conds) && i.post) } as LabState);
}

const shapeOf = (r: LabRule) => `${r.at}|${r.stage ?? ""}|${r.conds.map((c) => c.k + c.op).sort().join(",")}|${r.tp}|${r.sl}|${r.hold}`;
const exitOf = (r: LabRule) => GRID.findIndex((g) => g.tp === r.tp && g.sl === r.sl) * H + HOLDS_MIN.indexOf(r.hold as (typeof HOLDS_MIN)[number]);

function statsOf(vals: number[], hrs: number[], level: number): LabStats {
  if (vals.length < 2) return { n: vals.length, mean: vals.length ? vals[0]! : NaN, lo: -Infinity, hi: Infinity };
  const m = clusteredMeanCI(vals, hrs, level);
  return { n: vals.length, mean: m.mean, lo: m.lo, hi: m.hi };
}

/** Two-sided level whose lower bound is one-sided at LAB.alpha. */
const STRICT = 1 - 2 * LAB.alpha;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function newIdea(rule: LabRule, source: LabIdea["source"], now: number, from: number, seen?: LabIdea["seen"]): LabIdea {
  return {
    id: newId("lab"),
    ...rule,
    conds: rule.conds.map((c) => ({ ...c })),
    text: describeLab(rule),
    code: labCode(rule),
    source,
    born: now,
    from,
    ...(seen ? { seen } : {}),
    status: "testing",
    coins: 0,
    vals: [],
    hrs: [],
    heldSec: 0,
    looked: 0,
    post: { vals: [], hrs: [] },
  };
}

/** Adds your own idea (text, see parseLabRule). Only coins from now on count for it. */
export function addLabIdea(st: LabState, text: string, now = Date.now()): { ok: true; idea: LabIdea; state: LabState } | { ok: false; error: string } {
  const p = parseLabRule(text);
  if ("error" in p) return { ok: false, error: p.error };
  const next = copyLab(st);
  const code = labCode(p.rule);
  if (next.ideas.some((i) => i.status !== "retired" && i.code === code)) return { ok: false, error: "This rule is already being tested." };
  if (next.ideas.filter((i) => i.source === "you" && i.status === "testing").length >= LAB.mineMax) return { ok: false, error: `At most ${LAB.mineMax} of your ideas are tested at once — wait for one to finish.` };
  const idea = newIdea(p.rule, "you", now, now);
  next.ideas.push(idea);
  return { ok: true, idea, state: next };
}

function retire(i: LabIdea, now: number, why: string) {
  i.last = statsOf(i.vals, i.hrs, 0.95);
  i.status = "retired";
  i.retiredAt = now;
  i.why = why;
  i.vals = [];
  i.hrs = [];
  i.post = { vals: [], hrs: [] };
}

const pct1 = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/** Takes the looks each idea is due, and retires what should go (see the top of the file). */
function judge(st: LabState, now: number): { proven: LabIdea[] } {
  const proven: LabIdea[] = [];
  for (const i of st.ideas) {
    if (i.status === "testing") {
      const n = i.vals.length;
      const reached = LAB.looks.filter((k) => n >= k).length;
      if (reached > i.looked) {
        i.looked = reached;
        const strict = statsOf(i.vals, i.hrs, STRICT);
        const wins = i.vals.filter((v) => v > 0).length;
        const ci = statsOf(i.vals, i.hrs, 0.95);
        if (strict.lo > 0 && wins >= LAB.minWins) {
          Object.assign(i, { status: "proven", provenAt: now, provenTo: st.seenTo, proof: strict });
          proven.push(i);
          continue;
        }
        if (ci.hi < 0) {
          retire(i, now, `losing: ${pct1(ci.mean)} per trade on ${n} coins after it was invented (at best ${pct1(ci.hi)})`);
          continue;
        }
        if (reached === LAB.looks.length) {
          retire(i, now, `not proven on ${n} coins after it was invented (${pct1(ci.mean)} per trade, range ${pct1(ci.lo)} to ${pct1(ci.hi)})`);
          continue;
        }
      }
      if (now - i.born > LAB.maxAgeMs) retire(i, now, `too few coins to judge in a week (${n} of ${LAB.looks[0]})`);
    } else if (i.status === "proven") {
      const post = statsOf(i.post.vals, i.post.hrs, 0.95);
      if (i.proof && post.n >= LAB.postMin && post.hi < i.proof.lo) {
        retire(i, now, `stopped working: ${pct1(post.mean)} per trade on ${post.n} coins after its proof, below the ${pct1(i.proof.lo)} worst case it had shown`);
        i.stopped = true;
      }
      else if (now - (i.provenAt ?? now) > LAB.provenMs) retire(i, now, "proven two weeks ago: the search has to find and prove it again on newer data");
    }
  }
  // keep the newest retired ideas only
  const retired = st.ideas.filter((i) => i.status === "retired").sort((a, b) => (b.retiredAt ?? 0) - (a.retiredAt ?? 0));
  const drop = new Set(retired.slice(LAB.keepRetired).map((i) => i.id));
  if (drop.size) st.ideas = st.ideas.filter((i) => !drop.has(i.id));
  return { proven };
}

// ---- the search ----------------------------------------------------------------------------

/**
 * Exits for the first look at every threshold, from tight to wide, with and without a time limit:
 * a condition that picks better coins shows on some of them. The strongest thresholds then get all
 * 192 exits.
 */
const SCREEN = [
  [25, 10, 0],
  [50, 20, 0],
  [50, 20, 10],
  [100, 30, 0],
  [100, 30, 30],
  [100, 50, 0],
  [200, 50, 0],
  [150, 40, 60],
  [300, 70, 0],
  [500, 50, 0],
]
  .map(([tp, sl, hold]) => GRID.findIndex((g) => g.tp === tp && g.sl === sl) * H + HOLDS_MIN.indexOf(hold as (typeof HOLDS_MIN)[number]))
  .filter((e) => e >= 0);

interface Found {
  at: string;
  stage?: "curve" | "amm";
  conds: RuleCond[];
  e: number;
  n: number;
  mean: number;
  lo: number;
  /** the rows it takes (for pairs) */
  rows?: Int32Array;
}

interface Data {
  rows: Sample[];
  X: Float32Array;
  R: Float32Array;
}

/** Running totals per exit over a set of rows (count, sum, sum of squares, wins), filled row by row: each row's exits sit side by side. */
class Totals {
  readonly t = new Float64Array(4 * EXITS);
  add(R: Float32Array, row: number) {
    const base = row * EXITS;
    const t = this.t;
    for (let e = 0; e < EXITS; e++) {
      const v = R[base + e]!;
      if (v !== v) continue; // does not count
      t[e]!++;
      t[EXITS + e]! += v;
      t[2 * EXITS + e]! += v * v;
      if (v > 0) t[3 * EXITS + e]!++;
    }
  }
}

/** The best exit between two snapshots of Totals (b − a): by the cautious average (mean − 2 standard errors), with enough trades and wins. */
function bestBetween(b: Float64Array, a: Float64Array | null): { e: number; n: number; mean: number; lo: number } | null {
  let best: { e: number; n: number; mean: number; lo: number } | null = null;
  for (let e = 0; e < EXITS; e++) {
    const n = b[e]! - (a ? a[e]! : 0);
    if (n < LAB.minSeen || b[3 * EXITS + e]! - (a ? a[3 * EXITS + e]! : 0) < LAB.minWins) continue;
    const mean = (b[EXITS + e]! - (a ? a[EXITS + e]! : 0)) / n;
    const sq = b[2 * EXITS + e]! - (a ? a[2 * EXITS + e]! : 0);
    const lo = mean - 2 * Math.sqrt(Math.max(0, (sq - n * mean * mean) / (n - 1)) / n);
    if (!best || lo > best.lo) best = { e, n, mean, lo };
  }
  return best;
}

/** The best exit for a set of rows (see bestBetween). */
function bestExit(d: Data, rows: ArrayLike<number>): { e: number; n: number; mean: number; lo: number } | null {
  const tot = new Totals();
  for (let k = 0; k < rows.length; k++) tot.add(d.R, rows[k]!);
  return bestBetween(tot.t, null);
}

/** Whether the rule made money in both halves (older, newer) of the rows it was found on. */
function heldBothHalves(d: Data, rows: Int32Array, e: number, mid: number): boolean {
  const half = [0, 0];
  const cnt = [0, 0];
  for (const i of rows) {
    const v = d.R[i * EXITS + e]!;
    if (v !== v) continue;
    const k = d.rows[i]!.ts < mid ? 0 : 1;
    half[k]! += v;
    cnt[k]!++;
  }
  return cnt[0]! >= LAB.minSeen / 3 && cnt[1]! >= LAB.minSeen / 3 && half[0]! > 0 && half[1]! > 0;
}

function lowerBound(a: Float64Array, v: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m]! < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * One entry's search: every fact at a few round thresholds (≥ and ≤), each with its best exit —
 * sums over the rows sorted by the fact make every threshold one subtraction — then pairs of the
 * strongest. Returns the rules that held in both halves of the data, best first, and the strongest singles.
 */
function* searchEntry(d: Data, at: string, idx: Int32Array): Generator<void, { found: Found[]; singles: Found[]; tested: number }> {
  const m = idx.length;
  const singles: Found[] = [];
  const screened: { fact: LabFact; mk: { op: RuleCond["op"]; v: number; a: number; b: number }; score: number; rows: Int32Array }[] = [];
  let tested = 0;
  // stage for score entries (a fixed point in a coin's life already fixes it)
  if (at.startsWith("x"))
    for (const stage of ["curve", "amm"] as const) {
      const rows = idx.filter((i) => d.rows[i]!.stage === stage);
      if (rows.length < LAB.minSeen || rows.length > m - LAB.minSeen / 2) continue;
      tested += EXITS;
      const b = bestExit(d, rows);
      if (b) singles.push({ at, stage, conds: [], ...b, rows });
    }
  for (let fi = 0; fi < LAB_FACTS.length; fi++) {
    const fact = LAB_FACTS[fi]!;
    const col = FACT_INDEX[fi]!;
    if (col < 0) continue;
    const vals = new Float64Array(m);
    for (let p = 0; p < m; p++) vals[p] = d.X[idx[p]! * NF + col]!;
    const order = Int32Array.from({ length: m }, (_, p) => p).sort((a, b) => vals[a]! - vals[b]!);
    const sorted = Float64Array.from(order, (p) => vals[p]!);
    const masks: { op: RuleCond["op"]; v: number; a: number; b: number }[] = [];
    const seenT = new Set<number>();
    for (const q of LAB.quantiles) {
      const t = fact.x(fact.nice(fact.raw(sorted[Math.floor(q * (m - 1))]!)));
      if (!Number.isFinite(t) || seenT.has(t)) continue;
      seenT.add(t);
      const ge = lowerBound(sorted, t - 1e-9);
      const le = lowerBound(sorted, t + 1e-9);
      for (const mk of [
        { op: ">=" as const, v: t, a: ge, b: m },
        { op: "<=" as const, v: t, a: 0, b: le },
      ])
        if (mk.b - mk.a >= LAB.minSeen && mk.b - mk.a <= m - LAB.minSeen / 2) masks.push(mk);
    }
    if (!masks.length) continue;
    // a first look on a few telling exits: totals at every mask boundary, adding the rows in the
    // fact's order, make each threshold one subtraction
    const cuts = new Set<number>();
    for (const mk of masks) cuts.add(mk.a).add(mk.b);
    const snap = new Map<number, Float64Array>();
    const E = SCREEN.length;
    const t = new Float64Array(4 * E);
    for (let p = 0; p <= m; p++) {
      if (cuts.has(p)) snap.set(p, t.slice());
      if (p === m) break;
      const base = idx[order[p]!]! * EXITS;
      for (let j = 0; j < E; j++) {
        const v = d.R[base + SCREEN[j]!]!;
        if (v !== v) continue;
        t[j]!++;
        t[E + j]! += v;
        t[2 * E + j]! += v * v;
        if (v > 0) t[3 * E + j]!++;
      }
    }
    tested += masks.length * E;
    for (const mk of masks) {
      const b = snap.get(mk.b)!;
      const a = snap.get(mk.a)!;
      let score = -Infinity;
      for (let j = 0; j < E; j++) {
        const n = b[j]! - a[j]!;
        if (n < LAB.minSeen || b[3 * E + j]! - a[3 * E + j]! < LAB.minWins) continue;
        const mean = (b[E + j]! - a[E + j]!) / n;
        const lo = mean - 2 * Math.sqrt(Math.max(0, (b[2 * E + j]! - a[2 * E + j]! - n * mean * mean) / (n - 1)) / n);
        if (lo > score) score = lo;
      }
      if (score > -Infinity) screened.push({ fact, mk, score, rows: Int32Array.from(order.subarray(mk.a, mk.b), (p) => idx[p]!) });
    }
    yield;
  }
  // the strongest thresholds, every exit
  screened.sort((a, b) => b.score - a.score);
  for (const c of screened.slice(0, LAB.screenTop)) {
    tested += EXITS;
    const b = bestExit(d, c.rows);
    if (b) singles.push({ at, conds: [{ k: c.fact.key, op: c.mk.op, v: c.mk.v }], ...b, rows: c.rows });
  }
  yield;
  singles.sort((a, b) => b.lo - a.lo);
  // pairs of the strongest singles (different facts)
  const top = singles.filter((s) => s.mean > 0).slice(0, LAB.pairTop);
  const pairs: Found[] = [];
  const mark = new Uint8Array(d.rows.length);
  for (let i = 0; i < top.length; i++) {
    for (const r of top[i]!.rows!) mark[r] = 1;
    for (let j = i + 1; j < top.length; j++) {
      const A = top[i]!;
      const B = top[j]!;
      if ((A.stage && B.stage) || (A.conds[0] && B.conds[0] && A.conds[0].k === B.conds[0].k)) continue;
      const rows = B.rows!.filter((r) => mark[r] === 1);
      if (rows.length < LAB.minSeen) continue;
      tested += EXITS;
      const b = bestExit(d, rows);
      if (b) pairs.push({ at, stage: A.stage ?? B.stage, conds: [...A.conds, ...B.conds], ...b, rows });
    }
    for (const r of top[i]!.rows!) mark[r] = 0;
    yield;
  }
  const mid = d.rows[idx[Math.floor(m / 2)]!]!.ts;
  const found = [...singles, ...pairs].filter((f) => f.lo > 0 && f.mean > 0 && heldBothHalves(d, f.rows!, f.e, mid)).sort((a, b) => b.lo - a.lo);
  return { found: found.slice(0, 5), singles: singles.slice(0, 3), tested };
}

/** A would-be entry the Lab can use: current layout, facts recorded, finished. */
function usable(s: Sample, cutoff: number): boolean {
  return (
    (s.kind === "entry" || (s.kind === "checkpoint" && s.tag in ENTRY_POINTS)) &&
    s.gv === GRID_VERSION &&
    s.x?.length === NF &&
    s.gridT?.length === GRID.length &&
    s.path?.length === PATH_MIN.length &&
    s.ts <= cutoff
  );
}

function matches(i: LabRule, s: Sample): boolean {
  return s.tag === i.at && (!i.stage || s.stage === i.stage) && condsHold(i.conds, s.x);
}

export interface LabOptions {
  now?: number;
  /** outcomes are followed this long; newer entries are unfinished and wait */
  horizonMs?: number;
}

function* labSteps(samples: Sample[], prev: LabState, opts: LabOptions): Generator<void, { state: LabState; proven: LabIdea[]; added: LabIdea[] }> {
  const now = opts.now ?? Date.now();
  const st = copyLab(prev.method === LAB_METHOD ? prev : emptyLab());
  st.horizonMs = opts.horizonMs ?? st.horizonMs;
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - st.horizonMs;
  const rows = samples.filter((s) => usable(s, cutoff)).sort((a, b) => a.ts - b.ts);
  const n = rows.length;
  const X = new Float32Array(n * NF);
  const R = new Float32Array(n * EXITS);
  for (let i = 0; i < n; i++) {
    const s = rows[i]!;
    X.set(s.x, i * NF);
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < H; h++) R[i * EXITS + c * H + h] = exitReturn(s, c, h);
    if (i % 2_000 === 0) yield;
  }
  const d: Data = { rows, X, R };

  // 1. every idea's coins since the last run (each finished entry is counted once, in order)
  const live = st.ideas.filter((i) => i.status !== "retired");
  for (let r = 0; r < n; r++) {
    const s = rows[r]!;
    if (s.ts <= st.seenTo) continue;
    for (const i of live) {
      if (s.ts <= i.from || !matches(i, s)) continue;
      i.coins++;
      const e = exitOf(i);
      const v = R[r * EXITS + e]!;
      if (v !== v) continue; // its exit does not count (outcomes counts)
      const hour = hourOf(s.ts);
      i.vals.push(r4(v));
      i.hrs.push(hour);
      const sec = s.gridT![Math.floor(e / H)] ?? 0;
      i.heldSec += i.hold ? Math.min(sec, i.hold * 60) : sec;
      if (i.status === "proven" && s.ts > (i.provenTo ?? Infinity)) {
        i.post.vals.push(r4(v));
        i.post.hrs.push(hour);
      }
      if (i.vals.length > LAB.keepVals) {
        i.vals.shift();
        i.hrs.shift();
      }
    }
    if (r % 5_000 === 0) yield;
  }
  if (n) st.seenTo = Math.max(st.seenTo, rows[n - 1]!.ts);

  // 2. the looks that are due, and what leaves
  const { proven } = judge(st, now);

  // 3. new ideas, from the finished data so far
  const added: LabIdea[] = [];
  const hours = n ? (rows[n - 1]!.ts - rows[0]!.ts) / 3_600_000 : 0;
  st.ranAt = now;
  if (n < LAB.minRows || hours < LAB.minHours) {
    st.note = `The Lab needs ${LAB.minHours} hours of recorded market and ${LAB.minRows.toLocaleString("en-US")} finished would-be trades to invent from (so far: ${hours.toFixed(1)} h, ${n.toLocaleString("en-US")}).`;
    return { state: st, proven, added };
  }
  const byEntry = new Map<string, number[]>();
  rows.forEach((s, i) => {
    let l = byEntry.get(s.tag);
    if (!l) byEntry.set(s.tag, (l = []));
    l.push(i);
  });
  const found: Found[] = [];
  const leads: Found[] = [];
  const entries: LabState["entries"] = [];
  let tested = 0;
  for (const [at, list] of byEntry) {
    const idx = Int32Array.from(list);
    const b = bestExit(d, idx);
    const spanDays = Math.max(1 / 24, (rows[list[list.length - 1]!]!.ts - rows[list[0]!]!.ts) / DAY);
    if (b) {
      const c = Math.floor(b.e / H);
      entries.push({ at, perDay: idx.length / spanDays, best: `tp${GRID[c]!.tp} sl${GRID[c]!.sl}${HOLDS_MIN[b.e % H] ? ` hold${HOLDS_MIN[b.e % H]}` : ""}`, mean: b.mean });
    }
    if (idx.length < 3 * LAB.minSeen) continue;
    const res = yield* searchEntry(d, at, idx);
    tested += res.tested;
    found.push(...res.found);
    leads.push(...res.singles);
  }
  st.tested = tested;
  st.entries = entries.sort((a, b) => b.mean - a.mean);
  const toRule = (f: Found): LabRule => ({ at: f.at, ...(f.stage ? { stage: f.stage } : {}), conds: f.conds, tp: GRID[Math.floor(f.e / H)]!.tp, sl: GRID[Math.floor(f.e / H)]!.sl, hold: HOLDS_MIN[f.e % H]! });
  st.leads = leads
    .filter((f) => f.mean > 0)
    .sort((a, b) => b.lo - a.lo)
    .slice(0, 12)
    .map((f) => ({ code: labCode(toRule(f)), n: f.n, mean: f.mean }));

  const busy = new Set(st.ideas.filter((i) => i.status !== "retired" || now - (i.retiredAt ?? 0) < LAB.retryAfterMs).map(shapeOf));
  let room = Math.min(LAB.newPerRun, LAB.maxActive - st.ideas.filter((i) => i.source === "search" && i.status === "testing").length);
  const usedEntry = new Set<string>();
  for (const f of found.sort((a, b) => b.lo - a.lo)) {
    if (room <= 0) break;
    const rule = toRule(f);
    if (usedEntry.has(rule.at) || busy.has(shapeOf(rule))) continue;
    const idea = newIdea(rule, "search", now, st.seenTo, { n: f.n, mean: f.mean, lo: f.lo });
    st.ideas.push(idea);
    added.push(idea);
    busy.add(shapeOf(rule));
    usedEntry.add(rule.at);
    room--;
  }
  const testing = st.ideas.filter((i) => i.status === "testing").length;
  st.note = `Searched ${tested.toLocaleString("en-US")} rules on ${hours.toFixed(0)} h of market${added.length ? `; ${added.length} new idea${added.length > 1 ? "s" : ""}` : ""}. ${testing} idea${testing === 1 ? "" : "s"} being tested on coins that came after them.`;
  return { state: st, proven, added };
}

/** One Lab run to completion (tests, command line). */
export function runLab(samples: Sample[], prev: LabState, opts: LabOptions = {}): { state: LabState; proven: LabIdea[]; added: LabIdea[] } {
  const it = labSteps(samples, prev, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** The same, pausing every ~15 ms so a live bot keeps up with the market meanwhile. */
export async function runLabAsync(samples: Sample[], prev: LabState, opts: LabOptions = {}): Promise<{ state: LabState; proven: LabIdea[]; added: LabIdea[] }> {
  const it = labSteps(samples, prev, opts);
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

// ---- what the rest of the bot sees ---------------------------------------------------------

/** Proven ideas as rules the autopilot can rank (only while the Lab is fresh: the same 6 hours as the edge finder). */
export function labProofs(st: LabState, now: number, freshMs = 6 * 3_600_000): EdgeFound[] {
  if (st.method !== LAB_METHOD || now - st.ranAt > freshMs) return [];
  return st.ideas
    .filter((i) => i.status === "proven")
    .map((i) => {
      const all = statsOf(i.vals, i.hrs, STRICT);
      const wins = i.vals.filter((v) => v > 0).length;
      const days = Math.max(1 / 24, (st.seenTo - i.from) / DAY);
      return {
        level: i.at.startsWith("x") ? Number(i.at.slice(1)) : 0,
        ...(i.at in ENTRY_POINTS ? { at: i.at } : {}),
        cond: "lab",
        tp: i.tp,
        sl: i.sl,
        hold: i.hold,
        text: i.text,
        discovery: { n: i.seen?.n ?? 0, mean: i.seen?.mean ?? NaN, lo: i.seen?.lo ?? NaN, winRate: NaN },
        holdout: { n: all.n, mean: all.mean, lo: all.lo, winRate: all.n ? wins / all.n : NaN },
        baseline: NaN,
        tradesPerDay: i.coins / days,
        avgHoldMin: all.n ? i.heldSec / all.n / 60 : undefined,
        settings: labSettings(i, st.horizonMs),
      };
    });
}

/**
 * A proven idea in use: the coins after its proof (95% range) — the autopilot's forward check. One
 * that stopped working reads as clearly short; one that only expired is no evidence either way.
 */
export function labForward(st: LabState, text: string): { text: string; n: number; mean: number; lo: number; hi: number } | undefined {
  const i = st.ideas.find((x) => x.text === text && x.provenAt);
  if (!i) return undefined;
  if (i.status === "retired") return i.stopped ? { text, n: Math.max(i.last?.n ?? 0, LAB.postMin), mean: i.last?.mean ?? NaN, lo: -Infinity, hi: -Infinity } : undefined;
  const post = statsOf(i.post.vals, i.post.hrs, 0.95);
  return { text, n: post.n, mean: post.mean, lo: post.lo, hi: post.hi };
}

/** What the dashboard shows. */
export function labView(st: LabState, now = Date.now()) {
  const idea = (i: LabIdea) => {
    const ci = i.status === "retired" ? (i.last ?? { n: 0, mean: NaN, lo: NaN, hi: NaN }) : statsOf(i.vals, i.hrs, 0.95);
    const next = LAB.looks.find((k) => k > i.vals.length);
    const days = Math.max(1 / 24, (st.seenTo - i.from) / DAY);
    return {
      id: i.id,
      text: i.text,
      code: i.code,
      source: i.source,
      status: i.status,
      born: i.born,
      n: ci.n,
      mean: ci.mean,
      lo: Number.isFinite(ci.lo) ? ci.lo : null,
      hi: Number.isFinite(ci.hi) ? ci.hi : null,
      coinsPerDay: st.seenTo > i.from ? i.coins / days : null,
      nextLook: i.status === "testing" ? (next ?? null) : null,
      seen: i.seen ?? null,
      proof: i.proof ?? null,
      provenAt: i.provenAt ?? null,
      post: i.status === "proven" ? statsOf(i.post.vals, i.post.hrs, 0.95) : null,
      why: i.why ?? null,
      retiredAt: i.retiredAt ?? null,
    };
  };
  const by = (a: LabIdea, b: LabIdea) => b.vals.length - a.vals.length;
  return {
    ranAt: st.ranAt,
    note: st.note,
    tested: st.tested,
    fresh: now - st.ranAt <= 6 * 3_600_000,
    testing: st.ideas.filter((i) => i.status === "testing").sort(by).map(idea),
    proven: st.ideas.filter((i) => i.status === "proven").map(idea),
    retired: st.ideas
      .filter((i) => i.status === "retired")
      .sort((a, b) => (b.retiredAt ?? 0) - (a.retiredAt ?? 0))
      .slice(0, 10)
      .map(idea),
    slots: { search: st.ideas.filter((i) => i.source === "search" && i.status === "testing").length, max: LAB.maxActive, mine: st.ideas.filter((i) => i.source === "you" && i.status === "testing").length, mineMax: LAB.mineMax },
    format: LAB_FORMAT,
  };
}

export type LabView = ReturnType<typeof labView>;

/**
 * A plain-text summary to paste into a chat with Claude (the subscription you already have): what
 * the market looks like at each entry, the strongest leads, what is being tested and what failed —
 * and the format to answer in, so its ideas can be pasted back into the Lab and tested like any other.
 */
export function labSummary(st: LabState, you: { rule: string; record?: string }): string {
  const hrs = (t: number) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");
  const line = (i: LabIdea) => {
    const s = i.status === "retired" ? i.last : statsOf(i.vals, i.hrs, 0.95);
    const res = s && s.n ? `${s.n} coins, ${pct1(s.mean)} per trade${Number.isFinite(s.lo) ? ` (95% range ${pct1(s.lo)} to ${pct1(s.hi)})` : ""}` : "no finished coins yet";
    return `- ${i.code} — ${res}${i.why ? ` — ${i.why}` : ""}`;
  };
  const testing = st.ideas.filter((i) => i.status === "testing");
  const proven = st.ideas.filter((i) => i.status === "proven");
  const retired = st.ideas.filter((i) => i.status === "retired").slice(-12);
  return [
    "SIGNAL Lab summary — pump.fun coins, paper-traded would-be entries. Please propose up to 5 new rules for the Lab to test, one per line, in the format below, each with one sentence on why it might work. They will be judged only on coins that come after they are added.",
    "",
    `Format: ${LAB_FORMAT}`,
    "Returns are per trade after fees, delay and slippage. \"hold\" = sell after that many minutes if neither target nor stop was hit.",
    "",
    `Data up to ${hrs(st.seenTo)}. Last search: ${st.note}`,
    "",
    "Entries (coins a day · best plain exit on past data · its average per trade):",
    ...st.entries.map((e) => `- ${e.at.startsWith("x") ? `score${e.at.slice(1)}` : e.at} · ${e.perDay.toFixed(0)}/day · ${e.best} · ${pct1(e.mean)}`),
    "",
    "Strongest single conditions in the last search (past data — hints, not proof):",
    ...(st.leads.length ? st.leads.map((l) => `- ${l.code} · ${l.n} trades · ${pct1(l.mean)} per trade`) : ["- none yet"]),
    "",
    "Being tested now (coins after each idea was added):",
    ...(testing.length ? testing.map(line) : ["- none"]),
    ...(proven.length ? ["", "Proven:", ...proven.map(line)] : []),
    ...(retired.length ? ["", "Retired (did not hold up):", ...retired.map(line)] : []),
    "",
    `The bot's rule now: ${you.rule}${you.record ? ` — ${you.record}` : ""}.`,
  ].join("\n");
}
