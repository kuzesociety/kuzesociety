import { describe, expect, it } from "vitest";
import { AUTOPILOT, type AutopilotState, RULE_KEYS, decideAutopilot, emptyAutopilot, ruleKey, worstPerDay } from "../src/core/autopilot.js";
import { EDGE_METHOD, type EdgeFound, type EdgeReport } from "../src/core/edges.js";
import { Engine } from "../src/core/engine.js";
import type { Position } from "../src/core/positions.js";
import { ruleSummary } from "../src/core/presets.js";
import { type Settings, sanitizeSettings } from "../src/core/settings.js";
import { Scenario, key } from "./helpers.js";

const NOW = Date.UTC(2026, 8, 20, 12);
const HOUR = 3_600_000;

function rule(text: string, o: { mean?: number; lo: number; n?: number; perDay: number; holdMin?: number; tp?: number }): EdgeFound {
  const tp = o.tp ?? 100;
  return {
    level: 85,
    cond: "any",
    tp,
    sl: 30,
    hold: 0,
    text,
    discovery: { n: 300, mean: (o.mean ?? o.lo + 0.2) + 0.05, lo: o.lo + 0.1, winRate: 0.5 },
    holdout: { n: o.n ?? 150, mean: o.mean ?? o.lo + 0.2, lo: o.lo, winRate: 0.5 },
    baseline: 0,
    tradesPerDay: o.perDay,
    avgHoldMin: o.holdMin ?? 20,
    settings: { entryAt: "score", minScore: 85, tpPct: tp, slPct: 30, maxHoldMin: 360, trailPct: 0, takeInitials: false, reentry: false, tradeCurve: true, tradeAmm: true, scoreOnly: true },
  };
}

function report(survivors: EdgeFound[], o: { at?: number; placebo?: number; method?: number | null } = {}): EdgeReport {
  return {
    generatedAt: o.at ?? NOW - HOUR,
    method: o.method === undefined ? EDGE_METHOD : o.method ?? undefined,
    status: "ok",
    note: "",
    samples: 20_000,
    hours: 48,
    discoveryHours: 32,
    holdoutHours: 16,
    tested: 60_000,
    candidates: 20,
    survivors,
    failed: [],
    placebo: { runs: 5, avgSurvivors: o.placebo ?? 0, maxSurvivors: Math.ceil(o.placebo ?? 0) },
  };
}

const settings = (patch: Partial<Settings> = {}) => sanitizeSettings({ maxOpen: 3, maxTradesPerHour: 12, positionSol: 0.1, ...patch });

function trades(n: number, pnlPct: (i: number) => number, from: number, mode: "paper" | "live" = "paper"): Position[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, status: "closed", mode, openedAt: from + i * 60_000, pnlPct: pnlPct(i) }) as unknown as Position);
}

describe("autopilot", () => {
  it("picks the rule that earns most per day at your limits, counted from its worst case on unseen data", () => {
    const rich = rule("rare but rich", { lo: 0.3, perDay: 5, holdMin: 30 });
    const busy = rule("frequent", { lo: 0.1, perDay: 60, holdMin: 10 });
    // 3 slots, 10-minute trades: room for all 60 a day → 6 stakes a day beats 1.5
    const d = decideAutopilot({ report: report([rich, busy]), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW });
    expect(d.action).toBe("switch");
    expect(d.rule!.text).toBe("frequent");
    expect(worstPerDay(busy, settings())).toBeCloseTo(6, 6);
    // one slot and 4-hour trades: only 6 a day fit, so the rare rule earns more
    const slow = rule("frequent but slow", { lo: 0.1, perDay: 60, holdMin: 240 });
    const one = decideAutopilot({ report: report([rich, slow]), settings: settings({ maxOpen: 1 }), state: emptyAutopilot(), closed: [], now: NOW });
    expect(one.rule!.text).toBe("rare but rich");
    // the switch sets the rule and nothing else: never the size, the limits or the mode
    expect(Object.keys(d.settings!).every((k) => (RULE_KEYS as readonly string[]).includes(k))).toBe(true);
    // and remembers the user's own rule to go back to
    expect(d.state.own).toMatchObject({ minScore: 75, tpPct: 100, slPct: 50 });
  });

  it("keeps a rule that holds up unless another is clearly better", () => {
    const a = rule("A", { lo: 0.1, perDay: 15 });
    const state: AutopilotState = { ...emptyAutopilot(), active: "A", since: NOW - 5 * HOUR, proof: { mean: 0.3, lo: 0.1, n: 150 }, own: {} };
    const close = rule("B", { lo: 0.11, perDay: 15 });
    expect(decideAutopilot({ report: report([a, close]), settings: settings(), state, closed: [], now: NOW }).action).toBe("none");
    const clearly = rule("C", { lo: 0.1 * AUTOPILOT.better + 0.01, perDay: 15 });
    const d = decideAutopilot({ report: report([a, clearly]), settings: settings(), state, closed: [], now: NOW });
    expect(d.action).toBe("switch");
    expect(d.rule!.text).toBe("C");
    expect(d.note).toMatch(/more than "A"/);
  });

  it("does not act on a search that fools itself, or on an old answer", () => {
    const a = rule("A", { lo: 0.2, perDay: 20 });
    expect(decideAutopilot({ report: report([a], { placebo: 1.2 }), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW }).action).toBe("none");
    // one "find" in 5 shuffled runs is tolerated, two are not
    expect(decideAutopilot({ report: report([a], { placebo: 0.2 }), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW }).action).toBe("switch");
    expect(decideAutopilot({ report: report([a], { placebo: 0.4 }), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW }).action).toBe("none");
    expect(decideAutopilot({ report: report([a], { at: NOW - 7 * HOUR }), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW }).action).toBe("none");
    // an answer made by an older version of the bot (weaker proof) is not acted on, even fresh
    expect(decideAutopilot({ report: report([a], { method: null }), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW }).action).toBe("none");
    const liveOld = decideAutopilot({ report: report([a], { method: null }), settings: settings({ mode: "live" }), state: emptyAutopilot(), closed: [], now: NOW });
    expect(liveOld.action).toBe("hold");
    expect(liveOld.state.holdReason).toMatch(/older version/);
    // for the rule in use, an untrusted or old search is no evidence either way: it stays
    const state: AutopilotState = { ...emptyAutopilot(), active: "A", since: NOW - HOUR, proof: { mean: 0.4, lo: 0.2, n: 150 }, own: { minScore: 70 }, rule: a };
    expect(decideAutopilot({ report: report([a], { placebo: 1.2 }), settings: settings(), state, closed: [], now: NOW }).action).toBe("none");
    expect(decideAutopilot({ report: report([a], { at: NOW - 9 * HOUR }), settings: settings(), state, closed: [], now: NOW }).action).toBe("none");
  });

  it("with real money uses only rules at the go-live bar, and otherwise holds new entries", () => {
    const paperOnly = rule("paper grade", { lo: 0.05, perDay: 30, n: 60 });
    const live = settings({ mode: "live" });
    const held = decideAutopilot({ report: report([paperOnly]), settings: live, state: emptyAutopilot(), closed: [], now: NOW });
    expect(held.action).toBe("hold");
    expect(held.state.holding).toBe(true);
    expect(held.state.holdReason).toMatch(/real money/);
    // nothing new: stays held, quietly
    const again = decideAutopilot({ report: report([paperOnly]), settings: live, state: held.state, closed: [], now: NOW + HOUR });
    expect(again.action).toBe("none");
    expect(again.note).toBe("");
    // a rule at the bar appears: switched in, entries released
    const proven = rule("live grade", { lo: 0.05, perDay: 30, n: 180 });
    const go = decideAutopilot({ report: report([paperOnly, proven]), settings: live, state: held.state, closed: [], now: NOW + 2 * HOUR });
    expect(go.action).toBe("switch");
    expect(go.rule!.text).toBe("live grade");
    expect(go.state.holding).toBe(false);
    // no answer at all with real money: hold from the first moment
    expect(decideAutopilot({ report: null, settings: live, state: emptyAutopilot(), closed: [], now: NOW }).action).toBe("hold");
    // back to paper, or the autopilot off: nothing held
    expect(decideAutopilot({ report: null, settings: settings(), state: held.state, closed: [], now: NOW }).state.holding).toBe(false);
    const off = decideAutopilot({ report: null, settings: settings({ mode: "live", autopilot: false }), state: held.state, closed: [], now: NOW });
    expect(off.action).toBe("release");
    expect(off.state.holding).toBe(false);
  });

  it("judges the rule in use by its own trades, and benches it when it is clearly worse than it showed", () => {
    const a = rule("A", { lo: 0.1, perDay: 20 });
    const b = rule("B", { lo: 0.08, perDay: 20 });
    const since = NOW - 10 * HOUR;
    const state: AutopilotState = { ...emptyAutopilot(), active: "A", since, proof: { mean: 0.3, lo: 0.1, n: 150 }, own: { minScore: 75 } };
    // too few trades to judge
    expect(decideAutopilot({ report: report([a, b]), settings: settings(), state, closed: trades(20, () => -40, since), now: NOW }).action).toBe("none");
    // doing what it showed: kept
    const fine = trades(40, (i) => (i % 2 ? 100 : -30), since);
    expect(decideAutopilot({ report: report([a, b]), settings: settings(), state, closed: fine, now: NOW }).action).toBe("none");
    // clearly losing: benched for a day, the next best takes over
    const bad = trades(40, (i) => (i % 3 ? -40 : 20), since);
    const d = decideAutopilot({ report: report([a, b]), settings: settings(), state, closed: bad, now: NOW });
    expect(d.action).toBe("switch");
    expect(d.rule!.text).toBe("B");
    expect(d.state.benched.A).toBe(NOW + AUTOPILOT.benchMs);
    expect(d.note).toMatch(/Dropped "A"/);
    // trades from before it was switched in do not count against it
    expect(decideAutopilot({ report: report([a, b]), settings: settings(), state, closed: trades(40, () => -40, since - 5 * HOUR), now: NOW }).action).toBe("none");
    // a benched rule stays out until its day is over
    const later = decideAutopilot({ report: report([a], { at: NOW + HOUR }), settings: settings(), state: d.state, closed: [], now: NOW + HOUR });
    expect(later.action).toBe("none");
    expect(later.state.active).toBe("B");
    const fresh: AutopilotState = { ...later.state, active: null, proof: null, rule: null };
    expect(decideAutopilot({ report: report([a], { at: NOW + HOUR }), settings: settings(), state: fresh, closed: [], now: NOW + HOUR }).action).toBe("none");
    const tomorrow = decideAutopilot({ report: report([a], { at: NOW + 25 * HOUR }), settings: settings(), state: fresh, closed: [], now: NOW + 26 * HOUR });
    expect(tomorrow.rule?.text).toBe("A");
  });

  it("keeps the rule in use when a later search does not list it again — only its results can drop it", () => {
    const a = rule("A", { lo: 0.1, perDay: 20 });
    const state: AutopilotState = { ...emptyAutopilot(), active: "A", since: NOW - 3 * HOUR, proof: { mean: 0.3, lo: 0.1, n: 150 }, own: { minScore: 70, tpPct: 50 }, rule: a, proofTo: NOW - 8 * HOUR };
    // the next search proves nothing: that is not evidence against the rule in use, it stays
    const kept = decideAutopilot({ report: report([]), settings: settings(), state, closed: [], now: NOW });
    expect(kept.action).toBe("none");
    expect(kept.state.active).toBe("A");
    expect(kept.note).toBe("");
    // the coins that qualified after its proof: too few yet, or consistent with its promise → it stays
    const withFwd = (n: number, mean: number, lo: number, hi: number) => ({ ...report([]), incumbent: { text: "A", n, mean, lo, hi } });
    expect(decideAutopilot({ report: withFwd(20, -0.5, -0.9, -0.1), settings: settings(), state, closed: [], now: NOW }).action).toBe("none");
    expect(decideAutopilot({ report: withFwd(60, 0.12, 0.02, 0.22), settings: settings(), state, closed: [], now: NOW }).action).toBe("none");
    // …clearly below the worst case it had shown → benched, back to your own rule
    const d = decideAutopilot({ report: withFwd(60, -0.05, -0.15, 0.05), settings: settings(), state, closed: [], now: NOW });
    expect(d.action).toBe("restore");
    expect(d.settings).toEqual({ conds: [], minScore: 70, tpPct: 50 });
    expect(d.state.active).toBeNull();
    expect(d.state.benched.A).toBe(NOW + AUTOPILOT.benchMs);
    expect(d.note).toMatch(/qualified after it was proven/);
    expect(d.note).toMatch(/Back to your own rule/);
    // a rule not listed again is replaced only by one clearly better than what it had shown
    const close = rule("C", { lo: 0.11, perDay: 20 });
    expect(decideAutopilot({ report: report([close]), settings: settings(), state, closed: [], now: NOW }).action).toBe("none");
    const clearly = rule("D", { lo: 0.1 * AUTOPILOT.better + 0.02, perDay: 20 });
    const sw = decideAutopilot({ report: report([clearly]), settings: settings(), state, closed: [], now: NOW });
    expect(sw.action).toBe("switch");
    expect(sw.state.rule?.text).toBe("D");
    expect(sw.state.proofTo).toBeGreaterThan(0);
  });

  it("keeps your own rule when its own trades already do better than the best proven rule would", () => {
    const s = settings();
    const mine = (n: number, pnlPct: (i: number) => number, rule = ruleKey(s)) =>
      Array.from({ length: n }, (_, i) => ({ id: `o${i}`, status: "closed", mode: "paper", rule, openedAt: NOW - 20 * HOUR + i * 20 * 60_000, pnlPct: pnlPct(i), pnl: 0 }) as unknown as Position);
    const weaker = rule("weaker", { lo: 0.05, perDay: 40 }); // ≈ 2 stakes a day at worst
    // your rule: 60 trades in 20 h (≈ 72 a day) at +30% each → far more than 2 stakes a day
    const good = mine(60, (i) => (i % 2 ? 80 : -20));
    const kept = decideAutopilot({ report: report([weaker]), settings: s, state: emptyAutopilot(), closed: good, now: NOW });
    expect(kept.action).toBe("none");
    expect(kept.note).toMatch(/Kept your own rule: its 60 trades/);
    // said once, not at every search
    expect(decideAutopilot({ report: report([weaker]), settings: s, state: kept.state, closed: good, now: NOW + HOUR }).note).toBe("");
    // a rule clearly better than even that is switched in
    const much = rule("much better", { lo: 0.6, perDay: 200, holdMin: 10 });
    expect(decideAutopilot({ report: report([weaker, much]), settings: s, state: kept.state, closed: good, now: NOW }).rule?.text).toBe("much better");
    // too few trades to count on, a losing record, or trades of another rule: the proven rule wins
    expect(decideAutopilot({ report: report([weaker]), settings: s, state: emptyAutopilot(), closed: good.slice(0, 20), now: NOW }).action).toBe("switch");
    expect(decideAutopilot({ report: report([weaker]), settings: s, state: emptyAutopilot(), closed: mine(60, (i) => (i % 2 ? 20 : -40)), now: NOW }).action).toBe("switch");
    expect(decideAutopilot({ report: report([weaker]), settings: s, state: emptyAutopilot(), closed: mine(60, () => 30, "another rule"), now: NOW }).action).toBe("switch");
  });

  it("with real money a rule in use must meet the go-live bar too", () => {
    const p = rule("paper grade", { lo: 0.05, perDay: 30, n: 60 });
    const state: AutopilotState = { ...emptyAutopilot(), active: p.text, since: NOW - HOUR, proof: { mean: 0.2, lo: 0.05, n: 60 }, own: {}, rule: p };
    const d = decideAutopilot({ report: report([p]), settings: settings({ mode: "live" }), state, closed: [], now: NOW });
    expect(d.action).toBe("hold");
    expect(d.state.active).toBeNull();
    const g = rule("live grade", { lo: 0.05, perDay: 30, n: 180 });
    const ok: AutopilotState = { ...state, active: g.text, proof: { mean: 0.2, lo: 0.05, n: 180 }, rule: g };
    expect(decideAutopilot({ report: report([]), settings: settings({ mode: "live" }), state: ok, closed: [], now: NOW }).action).toBe("none");
  });
});

describe("autopilot in the engine", () => {
  it("a rule changed by hand turns it off; its own changes and other settings do not", () => {
    const s = new Scenario({});
    const e = s.engine;
    expect(e.settings.autopilot).toBe(true);
    e.updateSettings({ positionSol: 0.2, maxOpen: 4 });
    expect(e.settings.autopilot).toBe(true);
    e.updateSettings(rule("A", { lo: 0.1, perDay: 10 }).settings, "autopilot");
    expect(e.settings.autopilot).toBe(true);
    expect(e.settings.minScore).toBe(85);
    e.updateSettings({ autopilot: true, tpPct: 60 });
    expect(e.settings.autopilot).toBe(true);
    // sending the rule it already has changes nothing
    e.updateSettings({ tpPct: 60, filters: { ...e.settings.filters } });
    expect(e.settings.autopilot).toBe(true);
    e.updateSettings({ tpPct: 50 });
    expect(e.settings.autopilot).toBe(false);
    expect(e.settings.tpPct).toBe(50);
  });

  it("after an update, a bot trading real money keeps its own rule until the owner turns the autopilot on", () => {
    const saved = (mode: "paper" | "live", autopilot?: boolean) => {
      const e = new Engine({ now: NOW });
      const st = e.exportState();
      const s: Record<string, unknown> = { ...st.settings, mode };
      if (autopilot === undefined) delete s.autopilot;
      else s.autopilot = autopilot;
      const r = new Engine({ now: NOW });
      r.restore({ ...st, settings: s as unknown as Settings });
      return r.settings.autopilot;
    };
    expect(saved("paper")).toBe(true);
    expect(saved("live")).toBe(false);
    expect(saved("live", true)).toBe(true);
    expect(saved("paper", false)).toBe(false);
  });

  it("holding stops new entries only: open positions still reach their exits", () => {
    const mint = key(31);
    const other = key(32);
    const s = new Scenario({ scoreOnly: true, paperLatencyMs: 500, tpPct: 100, slPct: 50 });
    s.create(mint, key(33));
    s.buy(mint, key(33), 1.5);
    s.crowd(mint, 4, 0.3, 3100);
    s.advance(2000);
    const pos = s.positions()[0]!;
    expect(pos.status).toBe("open");
    s.engine.autoHold = "no rule proven for real money";
    s.create(other, key(34));
    s.crowd(other, 4, 0.3, 3200);
    s.advance(2000);
    expect(s.positions().filter((p) => p.mint === other)).toHaveLength(0);
    expect(s.engine.funnel.recent.toArray().some((r) => r.mint === other && r.reason === "autopilot_hold")).toBe(true);
    for (let i = 0; i < 40 && pos.status === "open"; i++) s.buy(mint, key(3300 + i), 1.5, 300);
    s.advance(3000);
    expect(s.closed().find((p) => p.id === pos.id)?.exitReason).toBe("tp");
    // turning the autopilot off lets go at once
    s.engine.updateSettings({ autopilot: false });
    expect(s.engine.autoHold).toBeNull();
  });

  it("weighs a rule the Lab proved like any proven rule, and drops it when the coins after its proof fall short", () => {
    const conds = [{ k: "top10", op: "<=" as const, v: 0.25 }];
    const lab: EdgeFound = { ...rule("Lab: top holders few", { lo: 0.2, perDay: 30, holdMin: 20 }), cond: "lab", settings: { ...rule("x", { lo: 0, perDay: 1 }).settings, conds } };
    // the edge finder has nothing, the Lab has a proof: switched in, conditions and all
    const d = decideAutopilot({ report: report([]), settings: settings(), state: emptyAutopilot(), closed: [], now: NOW, extra: [lab] });
    expect(d.action).toBe("switch");
    expect(d.settings!.conds).toEqual(conds);
    expect(d.note).toMatch(/coins that came after the Lab invented it/);
    // it stays while the coins after its proof hold up…
    const kept = decideAutopilot({ report: report([]), settings: settings(d.settings), state: d.state, closed: [], now: NOW + HOUR, extra: [lab], forward: { text: lab.text, n: 50, mean: 0.25, lo: 0.1, hi: 0.4 } });
    expect(kept.action).toBe("none");
    // …and is benched when they clearly fall short of its worst case
    const own = { ...emptyAutopilot(), ...d.state, own: { minScore: 75 } };
    const dropped = decideAutopilot({ report: report([]), settings: settings(d.settings), state: own, closed: [], now: NOW + 2 * HOUR, extra: [], forward: { text: lab.text, n: 60, mean: -0.1, lo: -0.2, hi: 0.05 } });
    expect(dropped.state.benched[lab.text]).toBeGreaterThan(NOW);
    expect(dropped.action).toBe("restore");
    // your own rule comes back without the Lab rule's conditions (it was saved before rules had any)
    expect(dropped.settings).toMatchObject({ conds: [], minScore: 75 });
    expect(dropped.note).not.toMatch(/top 10 holders/);
    // and a rule's conditions show wherever the rule is summed up
    expect(ruleSummary({ ...settings(d.settings) })).toMatch(/top 10 holders ≤ 25%/);
    // a Lab rule's conditions are part of the rule: changing them by hand turns the autopilot off
    const e = new Engine({ now: NOW, settings: { autopilot: true } });
    e.updateSettings({ conds }, "autopilot");
    expect(e.settings.autopilot).toBe(true);
    e.updateSettings({ conds: [] });
    expect(e.settings.autopilot).toBe(false);
    expect(RULE_KEYS).toContain("conds");
  });

  it("the engine trades a Lab rule's conditions exactly as they were recorded", () => {
    for (const [conds, entered] of [
      [[{ k: "holders", op: ">=" as const, v: Math.log1p(1000) }], false],
      [[{ k: "holders", op: ">=" as const, v: Math.log1p(1) }], true],
    ] as const) {
      const s = new Scenario({ entryAt: "age20", scoreOnly: true, conds: conds as unknown as Settings["conds"] });
      const mint = key(501);
      s.create(mint, key(502));
      s.crowd(mint, 10, 0.3, 5030, 2000);
      s.advance(5_000);
      const sig = s.engine.funnel.recent.toArray().find((r) => r.mint === mint);
      expect(sig).toBeDefined();
      if (entered) expect(s.positions().length + s.closed().length).toBeGreaterThan(0);
      else expect(sig!.reason).toBe("rule_conditions");
    }
    // only real facts and at most three conditions are kept
    expect(sanitizeSettings({ conds: [{ k: "moon", op: ">=", v: 1 }, { k: "top10", op: "<=", v: 0.3 }, { k: "top10", op: "==", v: 1 }] }).conds).toEqual([{ k: "top10", op: "<=", v: 0.3 }]);
  });
});
