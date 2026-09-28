import { describe, expect, it } from "vitest";
import { AUTOPILOT, type AutopilotState, RULE_KEYS, decideAutopilot, emptyAutopilot, worstPerDay } from "../src/core/autopilot.js";
import { EDGE_METHOD, type EdgeFound, type EdgeReport } from "../src/core/edges.js";
import { Engine } from "../src/core/engine.js";
import type { Position } from "../src/core/positions.js";
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
    // a rule in use whose search stops being trusted is dropped: back to the user's own rule
    const state: AutopilotState = { ...emptyAutopilot(), active: "A", since: NOW - HOUR, proof: { mean: 0.4, lo: 0.2, n: 150 }, own: { minScore: 70 } };
    const d = decideAutopilot({ report: report([a], { placebo: 1.2 }), settings: settings(), state, closed: [], now: NOW });
    expect(d.action).toBe("restore");
    expect(d.settings).toEqual({ minScore: 70 });
    expect(d.note).toMatch(/luck check/);
    // but an old answer is no evidence either way: the rule stays
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
    const later = decideAutopilot({ report: report([a]), settings: settings(), state: d.state, closed: [], now: NOW + HOUR });
    expect(later.action).toBe("restore");
    const tomorrow = decideAutopilot({ report: report([a], { at: NOW + 25 * HOUR }), settings: settings(), state: later.state, closed: [], now: NOW + 26 * HOUR });
    expect(tomorrow.rule?.text).toBe("A");
  });

  it("paper: back to your own rule when its rule no longer holds up on the newest data", () => {
    const state: AutopilotState = { ...emptyAutopilot(), active: "A", since: NOW - 3 * HOUR, proof: { mean: 0.3, lo: 0.1, n: 150 }, own: { minScore: 70, tpPct: 50 } };
    const d = decideAutopilot({ report: report([]), settings: settings(), state, closed: [], now: NOW });
    expect(d.action).toBe("restore");
    expect(d.settings).toEqual({ minScore: 70, tpPct: 50 });
    expect(d.state.active).toBeNull();
    expect(d.note).toMatch(/Back to your own rule/);
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
});
