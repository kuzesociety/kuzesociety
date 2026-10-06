import { describe, expect, it } from "vitest";
import { type AutopilotState, emptyAutopilot } from "../src/core/autopilot.js";
import { GRID, GRID_VERSION, PATH_MIN, type Sample } from "../src/core/outcomes.js";
import type { Position } from "../src/core/positions.js";
import { SELFCHECK, type SelfCheckInput, checkChanges, coverage, decisions, engineHealth, extraordinary, learningLoop, recordedVsReal, ruleDelivers, runChecks } from "../src/core/selfcheck.js";
import { rng } from "../src/core/util.js";

const NOW = Date.UTC(2026, 8, 28, 12);
const HOUR = 3_600_000;
const gi = GRID.findIndex((g) => g.tp === 100 && g.sl === 50);
const plan = { tpPct: 100, slPct: 50, trailPct: 0, takeInitials: false, maxHoldMin: 0, staleExitMin: 0, exitSlippagePct: 20 };

/** A closed trade and the recording of its own signal, `rec` and `real` its results. */
function pair(i: number, real: number, rec: number, o: { blind?: number; maxHoldMin?: number; recAt?: number; mode?: "paper" | "live"; openedAt?: number } = {}): [Position, Sample] {
  const at = o.openedAt ?? NOW - 3 * 24 * HOUR + i * 20 * 60_000;
  const p = {
    id: `p${i}`, mint: `m${i}`, status: "closed", mode: o.mode ?? "paper", signalAt: at, openedAt: at, closedAt: at + 30 * 60_000,
    plan: { ...plan, maxHoldMin: o.maxHoldMin ?? 0 }, exitReason: real > 0 ? "tp" : "sl", pnlPct: real * 100, pnl: real * 1e8,
  } as unknown as Position;
  const grid = GRID.map(() => -0.1);
  grid[gi] = rec;
  const gridT = GRID.map(() => 900);
  if (o.recAt !== undefined) gridT[gi] = o.recAt;
  const s = {
    id: `s${i}`, kind: "signal", tag: "sig", mint: `m${i}`, symbol: "X", ts: at + 1500, stage: "curve", score: 80, p: 0.1, x: [], entryMcap: 50, tp: 100, sl: 50, y: 0, ret: rec,
    exit: "tp", grid, gv: GRID_VERSION, gridT, path: PATH_MIN.map(() => rec / 2), ov: 1, maxMult: 1, minMult: 1, secToMax: 0, resolvedAt: at + 6 * HOUR,
    ...(o.blind !== undefined ? { blind: o.blind } : {}),
  } as Sample;
  return [p, s];
}

function pairs(n: number, f: (i: number, r: () => number) => [number, number], extra = {}): { closed: Position[]; samples: Sample[] } {
  const r = rng(n);
  const closed: Position[] = [];
  const samples: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const [real, rec] = f(i, r);
    const [p, s] = pair(i, real, rec, extra);
    closed.push(p);
    samples.push(s);
  }
  return { closed, samples };
}

describe("self-check", () => {
  it("compares what the bot records with the trades it actually makes, coin by coin", () => {
    // recordings that match the trades (a little noise either way)
    const same = pairs(60, (_i, r) => {
      const x = r() < 0.4 ? 0.9 : -0.5;
      return [x, x + (r() - 0.5) * 0.02];
    });
    expect(recordedVsReal(same.closed, same.samples, NOW).status).toBe("ok");
    // recordings clearly better than what the bot got: a stop that the recordings missed,
    // a price that stopped updating … — everything proven on them would be too optimistic
    const rosy = pairs(60, (_i, r) => {
      const x = r() < 0.4 ? 0.9 : -0.5;
      return [x, x < 0 ? 0.1 : x];
    });
    const c = recordedVsReal(rosy.closed, rosy.samples, NOW);
    expect(c.status).toBe("warn");
    expect(c.detail).toMatch(/too optimistic/);
    // too few trades to judge
    expect(recordedVsReal(rosy.closed.slice(0, SELFCHECK.minPairs - 1), rosy.samples, NOW).status).toBe("info");
    // an exit the recording did not observe is not compared at all
    const unseen = pairs(60, () => [-0.5, 0.9], { blind: 300, recAt: 900 });
    expect(recordedVsReal(unseen.closed, unseen.samples, NOW).detail).toMatch(/0 of 20 needed \(60 trades closed/);
    // with a time limit the recording's value at that time counts (here half its result)
    const timed = pairs(60, () => [0.2, 0.4], { maxHoldMin: 30, recAt: 3600 });
    const t = recordedVsReal(timed.closed, timed.samples, NOW);
    expect(t.status).toBe("ok");
    expect(t.detail).toMatch(/\+20\.0% vs \+20\.0%/);
  });

  it("checks the rule in use against what it promised", () => {
    const st: AutopilotState = { ...emptyAutopilot(), active: "A", since: NOW - 10 * HOUR, proof: { mean: 0.3, lo: 0.1, n: 150 } };
    const base = { now: NOW, samples: [], mode: "paper", autopilotOn: true, autopilot: st, learning: { everyHours: 2, lastRun: NOW - HOUR, lastError: "", edgesAt: NOW - HOUR, startedAt: NOW - 20 * HOUR }, engine: { errors: 0, saveFailures: 0, saveError: "", feedDown: false } } as unknown as SelfCheckInput;
    const trades = (n: number, ret: (i: number) => number) => Array.from({ length: n }, (_, i) => pair(i, ret(i), 0, { openedAt: NOW - 9 * HOUR + i * 60_000 })[0]);
    expect(ruleDelivers({ ...base, closed: trades(5, () => 0.5) }).status).toBe("info");
    expect(ruleDelivers({ ...base, closed: trades(20, (i) => (i % 2 ? 0.5 : -0.1)) }).status).toBe("ok");
    const below = ruleDelivers({ ...base, closed: trades(20, (i) => (i % 2 ? 0.1 : -0.1)) });
    expect(below.status).toBe("warn");
    expect(below.detail).toMatch(/Below its promise/);
    // on the user's own rule nothing was promised: just what happened
    expect(ruleDelivers({ ...base, autopilot: emptyAutopilot(), closed: trades(3, () => 0.1) }).status).toBe("info");
  });

  it("notices an autopilot that keeps changing its mind", () => {
    const log = (n: number) => Array.from({ length: n }, (_, i) => ({ at: NOW - i * HOUR, what: `Now trading: rule ${i}` }));
    expect(decisions({ ...emptyAutopilot(), log: log(2) }, NOW).status).toBe("ok");
    expect(decisions({ ...emptyAutopilot(), log: log(SELFCHECK.maxSwitches + 1) }, NOW).status).toBe("warn");
    // older changes do not count
    expect(decisions({ ...emptyAutopilot(), log: log(8).map((x) => ({ ...x, at: x.at - 2 * 24 * HOUR })) }, NOW).status).toBe("ok");
  });

  it("says how much of what it records it could actually see", () => {
    const s = (stage: "curve" | "amm", blind?: number, blindBy: "pool" | "feed" | "stop" = "pool") => ({ stage, ov: 1, resolvedAt: NOW - HOUR, ...(blind !== undefined ? { blind, blindBy } : {}) }) as Sample;
    expect(coverage([s("curve")], NOW, true).status).toBe("fail");
    expect(coverage([s("curve"), s("amm")], NOW, false).status).toBe("ok");
    const amm = [...Array.from({ length: 30 }, () => s("amm", 600)), ...Array.from({ length: 10 }, () => s("amm"))];
    const c = coverage(amm, NOW, false);
    expect(c.status).toBe("info");
    expect(c.detail).toMatch(/75% of graduated-coin recordings stopped being watched before they ended/);
    const outage = [...Array.from({ length: 5 }, () => s("curve", 60, "feed")), ...Array.from({ length: 20 }, () => s("curve"))];
    expect(coverage(outage, NOW, false).status).toBe("warn");
    expect(coverage(outage, NOW, false).detail).toMatch(/20% of all recordings were cut by trade-feed outages/);
    // coins bought on the curve whose pool was dropped after they graduated are not an outage
    const graduated = [...Array.from({ length: 5 }, () => s("curve", 900)), ...Array.from({ length: 20 }, () => s("curve"))];
    expect(coverage(graduated, NOW, false).status).toBe("ok");
    // cut by the bot restarting (an update): said, but no outage, and not a pool that was dropped
    const restarted = [...Array.from({ length: 5 }, () => s("amm", 60, "stop")), ...Array.from({ length: 20 }, () => s("amm"))];
    const r = coverage(restarted, NOW, false);
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/0% of graduated-coin recordings stopped being watched/);
    expect(r.detail).toMatch(/20% were cut by the bot restarting/);
  });

  it("flags promises a real market is unlikely to keep", () => {
    const i = (mean: number, mode: "paper" | "live") => ({ mode, autopilotOn: true, autopilot: { ...emptyAutopilot(), active: "A", proof: { mean, lo: mean / 3, n: 290 } } }) as unknown as SelfCheckInput;
    expect(extraordinary(i(0.2, "paper")).status).toBe("ok");
    expect(extraordinary(i(0.612, "paper")).status).toBe("info");
    expect(extraordinary(i(0.612, "live")).status).toBe("warn");
  });

  it("watches the learning loop and the engine", () => {
    const l = { everyHours: 2, lastRun: NOW - HOUR, lastError: "", edgesAt: NOW - HOUR, startedAt: NOW - 20 * HOUR };
    expect(learningLoop(l, NOW).status).toBe("ok");
    expect(learningLoop({ ...l, lastError: "out of memory" }, NOW).status).toBe("warn");
    expect(learningLoop({ ...l, lastRun: NOW - 9 * HOUR }, NOW).status).toBe("warn");
    expect(learningLoop({ ...l, edgesAt: NOW - 8 * HOUR }, NOW).status).toBe("warn");
    expect(learningLoop({ ...l, everyHours: 0 }, NOW).status).toBe("info");
    expect(engineHealth({ errors: 0, saveFailures: 0, saveError: "", feedDown: false }).status).toBe("ok");
    expect(engineHealth({ errors: 3, saveFailures: 0, saveError: "", feedDown: false }).status).toBe("warn");
    expect(engineHealth({ errors: 0, saveFailures: 2, saveError: "disk full", feedDown: false }).status).toBe("fail");
  });

  it("tells once when a check turns bad, and once when it is fine again", () => {
    const input = { now: NOW, closed: [], samples: [], mode: "paper", autopilotOn: true, autopilot: emptyAutopilot(), learning: { everyHours: 2, lastRun: NOW - HOUR, lastError: "", edgesAt: NOW - HOUR, startedAt: NOW - 20 * HOUR }, engine: { errors: 0, saveFailures: 0, saveError: "", feedDown: false } } as unknown as SelfCheckInput;
    const good = runChecks(input);
    expect(good.map((c) => c.key)).toEqual(["recorded", "rule", "decisions", "coverage", "extraordinary", "learning", "engine", "storage"]);
    const state = (cs: typeof good) => new Map(cs.map((c) => [c.key, c.status]));
    expect(checkChanges(new Map(), good)).toEqual([]);
    const broken = runChecks({ ...input, engine: { ...input.engine, feedDown: true, saveFailures: 1, saveError: "disk full" } });
    const msgs = checkChanges(state(good), broken);
    expect(msgs).toHaveLength(2);
    expect(msgs.join("\n")).toMatch(/🛑 Self-check — The bot sees what it records/);
    expect(checkChanges(state(broken), broken)).toEqual([]);
    const back = checkChanges(state(broken), good);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatch(/✅ .*fine again/);
  });
});

describe("self-check: storage", () => {
  it("says when the disk is getting full, before saving fails", async () => {
    const { storageCheck } = await import("../src/core/selfcheck.js");
    const base = { usedMb: 2_000, maxMb: 10_000, minFreeMb: 2_000, recordingPaused: false };
    expect(storageCheck({ ...base, freeMb: 50_000 }).status).toBe("ok");
    expect(storageCheck({ ...base, freeMb: 3_000 }).status).toBe("warn");
    expect(storageCheck({ ...base, freeMb: 1_500 }).status).toBe("fail");
    expect(storageCheck({ ...base, freeMb: 50_000, recordingPaused: true }).status).toBe("fail");
    expect(storageCheck(undefined).status).toBe("info");
  });
});
