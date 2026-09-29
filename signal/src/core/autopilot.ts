/**
 * Autopilot: the bot trades the best rule that has proven itself, by itself.
 *
 * Each time the edge finder answers (every 2 hours), the rules it proved on data it never saw
 * are ranked by what they would earn per day at the user's trade size and limits, counted
 * pessimistically: the worst case per trade on unseen data (the holdout's corrected lower bound)
 * × the trades the open-position and hourly limits leave room for. The best one is switched in
 * at once. It then stays until there is evidence against it: its own trades, the coins that
 * qualified after its proof (forward test), or a rule worth clearly more (25%). A later search
 * that simply does not list it again is not evidence — each search re-checks only its best
 * candidates, and those shift as the data grows.
 *
 * It does not fool itself:
 *   - an answer counts only while fresh (6 hours) and made by the current method of proof
 *     (EDGE_METHOD: after an update, the next search replaces an older answer), and only if the search's own luck check
 *     (the same search on shuffled outcomes) "found" next to nothing (at most 1 rule in 5 runs);
 *     its proof already counts coins bought in the same hour as one piece of evidence, so a
 *     hot hour of the market is not taken for an edge (core/edges.ts holdoutStats);
 *   - with real money it uses only rules that meet the go-live bar (≥ 100 unseen trades and a
 *     worst case above +2% per trade); without one, new live entries wait — exits always go on;
 *   - the rule in use is checked against its own trades (after 30) and against every coin that
 *     qualified for it after its proof (after 40, as far as their prices were observed): if either
 *     is clearly worse than it had shown (the upper 95% bound of the average below its worst case
 *     on unseen data), it is benched for a day and the next best, or the user's own rule, takes over.
 * Your own rule competes too. A rule you pick by hand leaves the autopilot on (pickRule): a rule it
 * had proven is traded and judged as its own pick; any other becomes your own rule, and a proven
 * rule replaces it only when it does clearly better (25% more a day at its worst case) than the
 * best evidence about yours — its own trades once there are 30, until then the newest recordings,
 * the part on which the search checks its candidates, with the same bar (core/edges measureRule).
 * It changes the rule only — entry, which coins, exits, time limit — never the trade size, the
 * limits or the mode. Every decision names the rules it is about, so any of them is one click away.
 */
import { EDGE_METHOD, type EdgeFound, type EdgeReport, type RuleMeasure, edgeRuleFromText, settingsFor } from "./edges.js";
import type { Position } from "./positions.js";
import { followsPreset, ruleSummary } from "./presets.js";
import { type Settings, ruleKey, ruleOf } from "./settings.js";
import { clusteredMeanCI, hourOf, meanCI } from "./util.js";

export { RULE_KEYS, ruleChanged, ruleKey, ruleOf, touchesRule } from "./settings.js";

const HOUR = 3_600_000;

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
  /** coins that qualified after it was proven, before its forward test is judged */
  forwardMin: 40,
  /** trades of the user's own rule before its track record counts against a proven rule */
  trackMin: 30,
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
  /** decisions, newest last, with the rules each is about */
  log: { at: number; what: string; rules?: LoggedRule[] }[];
  /** the rule in use as it was proven: valued with it, and tested forward, when a search does not list it again */
  rule?: EdgeFound | null;
  /** the newest would-be entry its proof used; the coins after it are its forward test */
  proofTo?: number;
  /** the proven rule last declined because the user's own rule did better (noted once) */
  keptOwnOver?: string;
  /** when you last picked the rule by hand */
  pickedAt?: number;
  /** the pick was already reported as losing on its own trades (said once, not every 10 minutes) */
  saidLosing?: boolean;
}

/** A rule a decision is about, with the settings that trade it: one click puts it back in use. */
export interface LoggedRule {
  text: string;
  settings: Partial<Settings>;
}

/** Your own rule measured on the recordings (core/edges measureRule), at `at`. */
export type OwnMeasure = RuleMeasure & { at: number };

export function emptyAutopilot(): AutopilotState {
  return { active: null, since: 0, proof: null, own: null, holding: false, holdReason: "", benched: {}, log: [], rule: null, proofTo: 0 };
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

/**
 * What the rule in `s` has actually made, per day and at its worst case, from its own trades
 * (the last 3 days, same mode): the lower end of the 95% range per trade (counted per hour) ×
 * its trades a day. Null until it has AUTOPILOT.trackMin trades — too few to count on.
 */
export function trackRecord(s: Settings, closed: Position[], now: number): { n: number; mean: number; lo: number; hi: number; perDay: number; v: number } | null {
  const key = ruleKey(s);
  const from = now - 3 * 24 * HOUR;
  const mine = closed.filter((p) => p.status === "closed" && p.mode === s.mode && p.rule === key && p.openedAt >= from && Number.isFinite(p.pnlPct));
  if (mine.length < AUTOPILOT.trackMin) return null;
  const m = clusteredMeanCI(
    mine.map((p) => (p.pnlPct ?? 0) / 100),
    mine.map((p) => hourOf(p.openedAt)),
  );
  const first = Math.min(...mine.map((p) => p.openedAt));
  const perDay = mine.length / Math.max(1 / 24, (now - first) / (24 * HOUR));
  return { n: mine.length, mean: m.mean, lo: m.lo, hi: m.hi, perDay, v: Math.max(0, m.lo) * perDay };
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/**
 * What your own rule is worth, per day at its worst case, from the best evidence there is: its
 * own trades once it has AUTOPILOT.trackMin (trackRecord); until then the newest recordings, the
 * part the search checks its candidates on, with the same bar (`measured`, while it is fresh and
 * about this very rule). Null: nothing to go on — the recordings cannot express it, or too few
 * coins qualified yet.
 */
export function ownEvidence(s: Settings, closed: Position[], now: number, measured?: OwnMeasure | null): { v: number; n: number; mean: number; lo: number; perDay: number; from: "trades" | "recordings" } | null {
  const track = trackRecord(s, closed, now);
  if (track) return { v: track.v, n: track.n, mean: track.mean, lo: track.lo, perDay: track.perDay, from: "trades" };
  const m = measured;
  if (!m || !m.ok || m.key !== ruleKey(s) || now - m.at > AUTOPILOT.freshMs) return null;
  const perDay = Math.min(m.coinsPerDay, capacityPerDay({ avgHoldMin: m.avgHoldMin, hold: s.maxHoldMin }, s));
  return { v: Math.max(0, m.lo) * perDay, n: m.n, mean: m.mean, lo: m.lo, perDay, from: "recordings" };
}

/** Your own rule's evidence in words. */
function ownWords(own: NonNullable<ReturnType<typeof ownEvidence>>): string {
  return own.from === "trades"
    ? `its ${own.n} trades made ${pct(own.mean)} each (at least ${pct(own.lo)}), about ${own.perDay.toFixed(0)} a day`
    : `on the newest recordings, the part the search checks its candidates on, it made ${pct(own.mean)} per trade on ${own.n} coins (at least ${pct(own.lo)}), about ${own.perDay.toFixed(0)} trades a day at your limits`;
}

const logged = (r: EdgeFound): LoggedRule => ({ text: r.text, settings: r.settings });

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
export function decideAutopilot(o: {
  report: EdgeReport | null;
  settings: Settings;
  state: AutopilotState;
  closed: Position[];
  now: number;
  /** rules the Lab proved on coins after their invention (core/lab labProofs: fresh ones only) */
  extra?: EdgeFound[];
  /** the rule in use on the coins after its proof, when the Lab proved it (core/lab labForward) */
  forward?: EdgeReport["incumbent"];
  /** your own rule measured on the recordings (ownEvidence) */
  measured?: OwnMeasure | null;
  /** your pick is being measured right now: your own rule is not replaced before that is known */
  measuring?: boolean;
}): AutopilotDecision {
  const s = o.settings;
  const now = o.now;
  const st: AutopilotState = { ...o.state, benched: { ...o.state.benched }, log: [...o.state.log] };
  const notes: string[] = [];
  /** the rules the notes are about */
  const named: LoggedRule[] = [];
  const done = (action: AutopilotDecision["action"], extra: Partial<AutopilotDecision> = {}): AutopilotDecision => {
    const note = notes.join(" ");
    if (note) st.log = [...st.log, { at: now, what: note, ...(named.length ? { rules: named } : {}) }].slice(-30);
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
        if (st.rule) named.push(logged(st.rule));
        benchedNow = true;
      }
    }
  }

  // 1b. …and on every coin that qualified for it after it was proven (not only the ones it traded)
  const report = o.report;
  const fwd = o.forward ?? report?.incumbent;
  if (st.active && st.proof && !benchedNow && fwd?.text === st.active && fwd.n >= AUTOPILOT.forwardMin && fwd.hi < st.proof.lo) {
    st.benched[st.active] = now + AUTOPILOT.benchMs;
    notes.push(`Dropped "${st.active}": on ${fwd.n} coins that qualified after it was proven it averaged ${pct(fwd.mean)}, below the ${pct(st.proof.lo)} worst case it had shown. Benched for a day.`);
    if (st.rule) named.push(logged(st.rule));
    benchedNow = true;
  }

  // 1c. …and the rule in use judged against zero, whatever put it there.
  // A rule the search proved is benched above when it falls short of the worst case it was
  // switched in on. A rule you picked by hand carries no such promise, so nothing ever stopped
  // one: on a real bot the pick had made −7.1% a trade over 200 paper trades and was still
  // trading, because the autopilot only ever replaces your rule with a proven one and nothing
  // was proven. The bar that matters is the same for both — did it make money. When a rule's own
  // trades say no, and the top of their range is still below zero (per market hour, so a run of
  // bad hours is not mistaken for a bad rule), real money stops going into new entries. Open
  // positions are still managed, and paper keeps trading: there the evidence costs nothing and
  // is worth having.
  const ownDead = st.active === null ? (trackRecord(s, o.closed, now) ?? null) : null;
  const losing = ownDead && ownDead.hi < 0 ? ownDead : null;

  // 2. what the latest search proved
  const { fresh, trusted } = evidenceOf(report, now);
  const passes = (r: EdgeFound) => r.holdout.lo > 0 && (!live || (r.holdout.n >= AUTOPILOT.liveMinTrades && r.holdout.lo > AUTOPILOT.liveMinLo));
  const ranked = [...(trusted ? report!.survivors : []), ...(o.extra ?? [])]
    .filter((r) => passes(r) && !((st.benched[r.text] ?? 0) > now))
    .map((r) => ({ r, v: worstPerDay(r, s) }))
    .sort((a, b) => b.v - a.v);
  const best = ranked[0];

  // 3. the rule in use stays until there is evidence against it — its own trades, the coins after
  //    its proof, or a rule worth clearly more. A search that does not list it again is not such
  //    evidence: each search re-checks only its best candidates, and those shift as data comes in.
  //    With real money it must meet the go-live bar.
  const liveGrade = (p: AutopilotState["proof"]) => !!p && p.n >= AUTOPILOT.liveMinTrades && p.lo > AUTOPILOT.liveMinLo;
  const stands = !!st.active && !benchedNow && (!live || liveGrade(st.proof));
  if (stands) {
    const listed = ranked.find((x) => x.r.text === st.active);
    const curV = listed?.v ?? (st.rule ? worstPerDay(st.rule, s) : 0);
    if (!best || best.r.text === st.active || best.v < curV * AUTOPILOT.better) {
      if (st.holding) Object.assign(st, { holding: false, holdReason: "" });
      return done("none");
    }
  }

  // your own rule is replaced only by a rule proven to do clearly better than the best evidence
  // about yours: its own trades, or else the newest recordings with the same bar (both counted at
  // their worst case, per day). A pick still being measured is not replaced before that is known.
  const own = st.active === null && !live ? ownEvidence(s, o.closed, now, o.measured) : null;
  if (best && !stands && st.active === null && !live) {
    if (o.measuring) return done("none");
    if (own && best.v < own.v * AUTOPILOT.better) {
      if (st.keptOwnOver !== best.r.text) {
        st.keptOwnOver = best.r.text;
        named.push(logged(best.r));
        notes.push(
          `Kept your own rule: ${ownWords(own)} — at your size at least ~${(own.v * s.positionSol).toFixed(2)} SOL a day, more than the best proven rule ("${best.r.text}", at least ~${(best.v * s.positionSol).toFixed(2)} SOL a day) would add.`,
        );
      }
      return done("none");
    }
  }

  if (best) {
    const fromOwn = st.active === null && !st.holding;
    if (fromOwn && !st.own) st.own = ruleOf(s);
    const was = stands ? st.active : null;
    Object.assign(st, {
      active: best.r.text,
      since: now,
      proof: { mean: best.r.holdout.mean, lo: best.r.holdout.lo, n: best.r.holdout.n },
      rule: best.r,
      proofTo: best.r.cond === "lab" ? now : (report?.cutoff ?? report?.generatedAt ?? now),
      holding: false,
      holdReason: "",
    });
    const sol = best.v * s.positionSol;
    // what it replaced: your own rule, with what was known about it
    const yours = !fromOwn || live
      ? ""
      : own
        ? ` Your own rule (${ruleSummary(s)}): ${ownWords(own)} — at least ~${(own.v * s.positionSol).toFixed(2)} SOL a day.`
        : ` Your own rule (${ruleSummary(s)}) has nothing to show yet: ${o.measured?.key === ruleKey(s) && o.measured.why ? `${o.measured.why}, and ` : ""}it has fewer than ${AUTOPILOT.trackMin} trades of its own.`;
    named.push(logged(best.r));
    if (fromOwn && !live) named.push({ text: `your own rule (${ruleSummary(s)})`, settings: ruleOf(s) });
    notes.push(
      `Now trading: ${best.r.text}. On ${best.r.holdout.n} ${best.r.cond === "lab" ? "coins that came after the Lab invented it" : "trades the search never saw"} it made ${pct(best.r.holdout.mean)} per trade (worst case ${pct(best.r.holdout.lo)}), about ${best.r.tradesPerDay.toFixed(0)} coins a day; at your size and limits that is at least ~${sol.toFixed(2)} SOL a day on that data${was ? `, more than "${was}"` : ""}. Past results can stop working: it is checked against its own trades and the coins after it.${yours}`,
    );
    return done("switch", { rule: best.r, settings: best.r.settings });
  }

  const none = whyNone(report, fresh, trusted, live, (report?.survivors.length ?? 0) + (o.extra?.length ?? 0) > 0);
  const why = losing
    ? `the rule you picked has lost money on its own trades — ${pct(losing.mean)} each over its last ${losing.n}, and at best ${pct(losing.hi)} — and ${none}`
    : none;
  if (!live && losing && !st.saidLosing) {
    st.saidLosing = true;
    notes.push(
      `The rule you picked is losing: its last ${losing.n} trades made ${pct(losing.mean)} each, and the top of their range is ${pct(losing.hi)}, so that is not a bad run. Paper keeps trading it — the evidence costs nothing — but with real money new entries would wait until a rule is proven, or you pick another.`,
    );
    named.push({ text: `your own rule (${ruleSummary(s)})`, settings: ruleOf(s) });
  }
  if (!losing && st.saidLosing) st.saidLosing = undefined;
  if (live) {
    if (st.holding && !st.active) {
      st.holdReason = why;
      return done("none");
    }
    if (losing) notes.push(`The rule you picked has lost money on its own trades (${pct(losing.mean)} each over its last ${losing.n}, at best ${pct(losing.hi)}).`);
    Object.assign(st, { active: null, proof: null, rule: null, holding: true, holdReason: why });
    notes.push(`Holding new live entries: ${why}. Open positions are still managed.`);
    return done("hold");
  }
  // paper: back to the user's own rule once the rule in use was dropped and nothing proven replaces it
  if (st.active && benchedNow) {
    const saved = st.own;
    Object.assign(st, { active: null, proof: null, rule: null, own: null });
    // a rule saved before rules had conditions has none
    const back = saved ? { conds: [], ...saved } : null;
    notes.push(back ? `Back to your own rule (${ruleSummary({ ...s, ...back } as Settings)}): ${why}.` : `No proven rule: ${why}.`);
    if (back) named.push({ text: `your own rule (${ruleSummary({ ...s, ...back } as Settings)})`, settings: back });
    return done("restore", back ? { settings: back } : {});
  }
  return done("none");
}

/**
 * You picked the rule by hand with the autopilot on (`prev`: the settings before). A rule it has
 * proven (listed now and not benched) is traded and judged like its own pick; any other becomes
 * your own rule, which a proven rule replaces only when it does clearly better (decideAutopilot).
 * The autopilot stays on either way.
 */
export function pickRule(o: { state: AutopilotState; settings: Settings; prev: Settings; report: EdgeReport | null; extra?: EdgeFound[]; now: number }): AutopilotState {
  const s = o.settings;
  const now = o.now;
  const st: AutopilotState = { ...o.state, benched: { ...o.state.benched }, log: [...o.state.log], keptOwnOver: undefined, pickedAt: now };
  const { trusted } = evidenceOf(o.report, now);
  const proven = [...(trusted ? o.report!.survivors : []), ...(o.extra ?? [])].find((r) => !((st.benched[r.text] ?? 0) > now) && followsPreset(s, r.settings));
  const note = (what: string, rules: LoggedRule[]) => {
    st.log = [...st.log, { at: now, what, rules }].slice(-30);
    return st;
  };
  if (proven) {
    // the rule put back when no proven rule is left: yours from before, if it was yours
    if (st.active === null && !st.own) st.own = ruleOf(o.prev);
    Object.assign(st, {
      active: proven.text,
      since: now,
      proof: { mean: proven.holdout.mean, lo: proven.holdout.lo, n: proven.holdout.n },
      rule: proven,
      proofTo: proven.cond === "lab" ? now : (o.report?.cutoff ?? o.report?.generatedAt ?? now),
    });
    return note(`You picked "${proven.text}", a rule proven on data the search never saw: the autopilot trades it and judges it like its own picks — on its own trades and on the coins after its proof.`, [logged(proven)]);
  }
  Object.assign(st, { active: null, proof: null, rule: null, own: null });
  return note(
    `You picked your own rule: ${ruleSummary(s)}. The autopilot stays on and keeps it unless a proven rule does clearly better (${Math.round((AUTOPILOT.better - 1) * 100)}% more a day at its worst case) — judged on its own trades once it has ${AUTOPILOT.trackMin}, until then on the newest recordings with the same bar as the proven rules.`,
    [{ text: `your own rule (${ruleSummary(s)})`, settings: ruleOf(s) }],
  );
}

/** Your own rule on the dashboard: being measured, what the autopilot weighs it by, or why there is nothing yet. */
export type OwnView =
  | { measuring: true }
  | { from: "trades" | "recordings"; n: number; mean: number; lo: number; perDay: number; worstSolPerDay: number }
  | { why: string };

/** The rules an older decision names, read back from its words (decisions made before they kept their rules). */
function rulesInWords(what: string, horizonMs: number): LoggedRule[] {
  const out: LoggedRule[] = [];
  const add = (text: string) => {
    const r = edgeRuleFromText(text);
    if (r && !out.some((x) => x.text === text)) out.push({ text, settings: settingsFor(r, horizonMs) });
  };
  for (const m of what.matchAll(/Dropped "([^"]+)"/g)) add(m[1]!);
  for (const m of what.matchAll(/Now trading: (Buy .+?)\. On \d/g)) add(m[1]!);
  for (const m of what.matchAll(/best proven rule \("([^"]+)"/g)) add(m[1]!);
  return out;
}

/** What the dashboard shows about the autopilot: the rule in use, the ranking, your own rule's evidence, and recent decisions. */
export function autopilotView(o: {
  report: EdgeReport | null;
  settings: Settings;
  state: AutopilotState;
  now: number;
  extra?: EdgeFound[];
  forward?: EdgeReport["incumbent"];
  closed?: Position[];
  measured?: OwnMeasure | null;
  measuring?: boolean;
  /** how long would-be trades are followed (a rule without a time limit is traded with this one) */
  horizonMs?: number;
}) {
  const s = o.settings;
  const report = o.report;
  const live = s.mode === "live";
  const { trusted } = evidenceOf(report, o.now);
  const ranking = [...(report?.status === "ok" ? report.survivors : []), ...(o.extra ?? [])]
    .map((r) => ({
      text: r.text,
      settings: r.settings,
      inUse: followsPreset(s, r.settings),
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
  const inc = o.forward ?? report?.incumbent;
  const fwd = inc && inc.text === o.state.active ? inc : null;
  // your own rule, while it is the one in use: what the autopilot weighs it by
  const ev = o.state.active === null ? ownEvidence(s, o.closed ?? [], o.now, o.measured) : null;
  const m = o.measured && o.measured.key === ruleKey(s) ? o.measured : null;
  const own: OwnView | null =
    o.state.active !== null
      ? null
      : o.measuring
        ? { measuring: true as const }
        : ev
          ? { from: ev.from, n: ev.n, mean: ev.mean, lo: ev.lo, perDay: ev.perDay, worstSolPerDay: ev.v * s.positionSol }
          : { why: m?.why ?? (m ? "its measure is out of date; the next search measures it again" : "it is measured at the next search (every 2 hours)") };
  const horizonMs = o.horizonMs ?? 6 * HOUR;
  return {
    on: s.autopilot,
    live,
    active: o.state.active,
    since: o.state.since,
    proof: o.state.proof,
    /** the latest search listed the rule in use again */
    relisted: !!o.state.active && ranking.some((r) => r.active),
    /** the rule in use on coins that qualified after its proof */
    forward: fwd && fwd.n > 0 ? { n: fwd.n, mean: fwd.mean, lo: fwd.lo, hi: fwd.hi } : null,
    holding: o.state.holding,
    holdReason: o.state.holdReason,
    rule: ruleSummary(s),
    reportAt: report?.generatedAt ?? 0,
    trusted,
    ranking: ranking.slice(0, 8),
    /** your own rule's evidence while it is in use (ownEvidence), or why there is none yet */
    own,
    log: o.state.log
      .slice(-12)
      .reverse()
      .map((x) => ({ at: x.at, what: x.what, rules: (x.rules ?? rulesInWords(x.what, horizonMs)).map((r) => ({ ...r, inUse: followsPreset(s, r.settings) })) })),
  };
}

export type AutopilotView = ReturnType<typeof autopilotView>;
