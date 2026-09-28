/**
 * Autopilot: the bot trades the best rule that has proven itself, by itself.
 *
 * Each time the edge finder answers (every 2 hours), the rules it proved on data it never saw
 * are ranked by what they would earn per day at the user's trade size and limits, counted
 * pessimistically: the worst case per trade on unseen data (the holdout's corrected lower bound)
 * × the trades the open-position and hourly limits leave room for. The best one is switched in
 * at once. While it holds up, another rule replaces it only when clearly better (by 25%).
 *
 * It does not fool itself:
 *   - an answer counts only while fresh (6 hours) and made by the current method of proof
 *     (EDGE_METHOD: after an update, the next search replaces an older answer), and only if the search's own luck check
 *     (the same search on shuffled outcomes) "found" next to nothing (at most 1 rule in 5 runs);
 *     its proof already counts coins bought in the same hour as one piece of evidence, so a
 *     hot hour of the market is not taken for an edge (core/edges.ts holdoutStats);
 *   - with real money it uses only rules that meet the go-live bar (≥ 100 unseen trades and a
 *     worst case above +2% per trade); without one, new live entries wait — exits always go on;
 *   - the rule in use is checked against its own trades: after 30, if it is clearly worse than
 *     it had shown (the upper 95% bound of its average below its worst case on unseen data), it
 *     is benched for a day and the next best, or the user's own rule, takes over.
 * It changes the rule only — entry, which coins, exits, time limit — never the trade size, the
 * limits or the mode. Changing the rule by hand turns it off (Engine.updateSettings).
 */
import { EDGE_METHOD, type EdgeFound, type EdgeReport } from "./edges.js";
import type { Position } from "./positions.js";
import { ruleSummary } from "./presets.js";
import type { Settings } from "./settings.js";
import { meanCI } from "./util.js";

const HOUR = 3_600_000;

/** The settings a trading rule is made of (what a strategy or an edge-finder rule sets). */
export const RULE_KEYS = ["entryAt", "minScore", "tpPct", "slPct", "maxHoldMin", "trailPct", "takeInitials", "reentry", "tradeCurve", "tradeAmm", "scoreOnly", "filters"] as const;

export const AUTOPILOT = {
  /** an edge-finder answer older than this switches nothing */
  freshMs: 6 * HOUR,
  /** a new rule replaces one that still holds up only when it earns this much more per day */
  better: 1.25,
  /** real money: the go-live bar */
  liveMinTrades: 100,
  liveMinLo: 0.02,
  /** the search is trusted only while it "finds" at most this many rules per run on shuffled data (1 in 5 runs) */
  maxPlacebo: 0.2,
  /** trades of the rule in use before its own results are judged */
  checkAfter: 30,
  benchMs: 24 * HOUR,
};

export interface AutopilotState {
  /** text of the edge-finder rule in use; null = the user's own rule */
  active: string | null;
  since: number;
  /** what the rule showed on unseen data when it was switched in (net return per trade) */
  proof: { mean: number; lo: number; n: number } | null;
  /** the user's own rule, put back when no proven rule is left */
  own: Partial<Settings> | null;
  /** real money: new entries wait because no rule meets the go-live bar */
  holding: boolean;
  /** why entries are waiting (shown in the "Why no trade?" list) */
  holdReason: string;
  /** rules that failed in practice → until when they are benched */
  benched: Record<string, number>;
  /** decisions, newest last */
  log: { at: number; what: string }[];
}

export function emptyAutopilot(): AutopilotState {
  return { active: null, since: 0, proof: null, own: null, holding: false, holdReason: "", benched: {}, log: [] };
}

export interface AutopilotDecision {
  action: "none" | "switch" | "restore" | "hold" | "release";
  /** the rule switched to */
  rule?: EdgeFound;
  /** settings to apply (switch, restore) */
  settings?: Partial<Settings>;
  /** what happened, in plain words (empty when nothing did) */
  note: string;
  state: AutopilotState;
}

/** Trades a day your limits leave room for with this rule: hourly cap, and open slots × how long its trades last. */
export function capacityPerDay(rule: Pick<EdgeFound, "avgHoldMin" | "hold">, s: Settings): number {
  const holdMin = Math.max(1, rule.avgHoldMin ?? (rule.hold || 60));
  return Math.min(s.maxTradesPerHour * 24, (s.maxOpen * 1440) / holdMin);
}

/** Worst-case earnings a day, in trade sizes (× the size = SOL): worst case per trade × trades the limits allow. */
export function worstPerDay(rule: EdgeFound, s: Settings): number {
  return Math.max(0, rule.holdout.lo) * Math.min(rule.tradesPerDay, capacityPerDay(rule, s));
}

/** The rule part of the settings (a copy). */
export function ruleOf(s: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of RULE_KEYS) out[k] = k === "filters" ? { ...s.filters } : s[k];
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

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/**
 * What a search can be used for right now: `fresh` — made by the current method, found enough
 * data, and less than 6 hours old; `trusted` — fresh, and its luck check stayed clean.
 */
export function evidenceOf(report: EdgeReport | null, now: number): { fresh: boolean; trusted: boolean } {
  const fresh = !!report && report.status === "ok" && report.method === EDGE_METHOD && now - report.generatedAt <= AUTOPILOT.freshMs;
  return { fresh, trusted: fresh && report!.placebo.avgSurvivors <= AUTOPILOT.maxPlacebo };
}

/** Why no rule can be used right now, in plain words (undefined: there is one). */
function whyNone(report: EdgeReport | null, fresh: boolean, trusted: boolean, live: boolean, hadSurvivors: boolean): string {
  if (!report || report.status !== "ok") return "the edge finder has no answer yet (it needs about a day of recorded market)";
  if (report.method !== EDGE_METHOD) return "the edge finder's last answer was made by an older version of the bot; the next search replaces it (the first runs 20 minutes after the bot starts)";
  if (!fresh) return "the edge finder's last answer is more than 6 hours old";
  if (!trusted) return `the edge finder's luck check "found" ${report.placebo.avgSurvivors.toFixed(1)} rules per run on shuffled data, so its answers are not trusted right now`;
  if (!hadSurvivors) return "no rule held up on data the search never saw";
  return live
    ? `no rule meets the bar for real money (at least ${AUTOPILOT.liveMinTrades} unseen trades and a worst case above +${AUTOPILOT.liveMinLo * 100}% per trade)`
    : "no rule held up that is not benched";
}

/**
 * The autopilot's decision for this moment: the latest edge-finder report, the settings, the
 * autopilot's own state and the closed trades (to judge the rule in use).
 */
export function decideAutopilot(o: { report: EdgeReport | null; settings: Settings; state: AutopilotState; closed: Position[]; now: number }): AutopilotDecision {
  const s = o.settings;
  const now = o.now;
  const st: AutopilotState = { ...o.state, benched: { ...o.state.benched }, log: [...o.state.log] };
  const notes: string[] = [];
  const done = (action: AutopilotDecision["action"], extra: Partial<AutopilotDecision> = {}): AutopilotDecision => {
    const note = notes.join(" ");
    if (note) st.log = [...st.log, { at: now, what: note }].slice(-30);
    return { action, note, state: st, ...extra };
  };
  for (const [k, until] of Object.entries(st.benched)) if (until <= now) delete st.benched[k];

  if (!s.autopilot) {
    // off: nothing is held or tracked; the rule in place stays as it is
    const wasHolding = st.holding;
    Object.assign(st, { active: null, proof: null, own: null, holding: false, holdReason: "" });
    if (wasHolding) notes.push("Autopilot is off: live entries are no longer held.");
    return done(wasHolding ? "release" : "none");
  }
  const live = s.mode === "live";
  if (!live && st.holding) {
    // holding is for real money only
    Object.assign(st, { holding: false, holdReason: "" });
    notes.push("Paper mode: new entries are no longer held.");
  }

  // 1. the rule in use, judged on its own trades
  let benchedNow = false;
  if (st.active && st.proof) {
    const mine = o.closed.filter((p) => p.status === "closed" && p.mode === s.mode && p.openedAt >= st.since && Number.isFinite(p.pnlPct));
    if (mine.length >= AUTOPILOT.checkAfter) {
      const m = meanCI(mine.map((p) => (p.pnlPct ?? 0) / 100));
      if (m.hi < st.proof.lo) {
        st.benched[st.active] = now + AUTOPILOT.benchMs;
        notes.push(`Dropped "${st.active}": its ${mine.length} trades averaged ${pct(m.mean)}, below the ${pct(st.proof.lo)} worst case it had shown on unseen data. Benched for a day.`);
        benchedNow = true;
      }
    }
  }

  // 2. what the latest search proved
  const report = o.report;
  const { fresh, trusted } = evidenceOf(report, now);
  const passes = (r: EdgeFound) => r.holdout.lo > 0 && (!live || (r.holdout.n >= AUTOPILOT.liveMinTrades && r.holdout.lo > AUTOPILOT.liveMinLo));
  const ranked = (trusted ? report!.survivors : [])
    .filter((r) => passes(r) && !((st.benched[r.text] ?? 0) > now))
    .map((r) => ({ r, v: worstPerDay(r, s) }))
    .sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const cur = st.active ? ranked.find((x) => x.r.text === st.active) : undefined;

  if (best) {
    if (cur && (cur === best || best.v < cur.v * AUTOPILOT.better)) return done("none");
    if (st.active === null && !st.holding && !st.own) st.own = ruleOf(s);
    const was = st.active;
    Object.assign(st, { active: best.r.text, since: now, proof: { mean: best.r.holdout.mean, lo: best.r.holdout.lo, n: best.r.holdout.n }, holding: false, holdReason: "" });
    const sol = best.v * s.positionSol;
    notes.push(
      `Now trading: ${best.r.text}. On ${best.r.holdout.n} trades the search never saw it made ${pct(best.r.holdout.mean)} per trade (worst case ${pct(best.r.holdout.lo)}), about ${best.r.tradesPerDay.toFixed(0)} coins a day; at your size and limits that is at least ~${sol.toFixed(2)} SOL a day on that data${was ? `, more than "${was}"` : ""}. Past results can stop working: it is checked against its own trades.`,
    );
    return done("switch", { rule: best.r, settings: best.r.settings });
  }

  const why = whyNone(report, fresh, trusted, live, (report?.survivors.length ?? 0) > 0);
  if (live) {
    if (st.holding && !benchedNow) {
      st.holdReason = why;
      return done("none");
    }
    Object.assign(st, { active: null, proof: null, holding: true, holdReason: why });
    notes.push(`Holding new live entries: ${why}. Open positions are still managed.`);
    return done("hold");
  }
  // paper: back to the user's own rule once the evidence says the auto rule no longer holds —
  // a stale or missing answer is no evidence either way
  if (st.active && (benchedNow || fresh)) {
    const own = st.own;
    Object.assign(st, { active: null, proof: null, own: null });
    notes.push(own ? `Back to your own rule (${ruleSummary({ ...s, ...own } as Settings)}): ${why}.` : `No proven rule: ${why}.`);
    return done("restore", own ? { settings: own } : {});
  }
  return done("none");
}

/** What the dashboard shows about the autopilot: the rule in use, the ranking, and recent decisions. */
export function autopilotView(o: { report: EdgeReport | null; settings: Settings; state: AutopilotState; now: number }) {
  const s = o.settings;
  const report = o.report;
  const live = s.mode === "live";
  const { trusted } = evidenceOf(report, o.now);
  const ranking = (report?.status === "ok" ? report.survivors : [])
    .map((r) => ({
      text: r.text,
      perTrade: r.holdout.mean,
      worstPerTrade: r.holdout.lo,
      unseenTrades: r.holdout.n,
      coinsPerDay: r.tradesPerDay,
      tradesPerDay: Math.min(r.tradesPerDay, capacityPerDay(r, s)),
      worstSolPerDay: worstPerDay(r, s) * s.positionSol,
      liveGrade: r.holdout.n >= AUTOPILOT.liveMinTrades && r.holdout.lo > AUTOPILOT.liveMinLo,
      benchedUntil: o.state.benched[r.text] ?? 0,
      active: r.text === o.state.active,
    }))
    .sort((a, b) => b.worstSolPerDay - a.worstSolPerDay);
  return {
    on: s.autopilot,
    live,
    active: o.state.active,
    since: o.state.since,
    proof: o.state.proof,
    holding: o.state.holding,
    holdReason: o.state.holdReason,
    rule: ruleSummary(s),
    reportAt: report?.generatedAt ?? 0,
    trusted,
    ranking: ranking.slice(0, 8),
    log: o.state.log.slice(-12).reverse(),
  };
}

export type AutopilotView = ReturnType<typeof autopilotView>;
