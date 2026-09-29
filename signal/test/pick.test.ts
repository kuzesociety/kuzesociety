import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EDGE_METHOD, type EdgeFound, type EdgeReport } from "../src/core/edges.js";
import { Engine } from "../src/core/engine.js";
import { GRID, GRID_VERSION, PATH_MIN, type Sample } from "../src/core/outcomes.js";
import { type Settings, entryLabel, momentTag, sanitizeSettings, tagOfLabel } from "../src/core/settings.js";
import { rng } from "../src/core/util.js";
import { Learner } from "../src/node/learner.js";
import { DataStore } from "../src/node/store.js";
import { Scenario, key } from "./helpers.js";

const HOUR = 3_600_000;
const silent = { debug() {}, info() {}, warn() {}, error() {} };

/** Graduated coins recorded 1 h after graduating over the last `days`; `win(c)`: how often exit c reaches its target first. */
function recordings(now: number, days: number, win: (c: number) => number): Sample[] {
  const r = rng(9);
  return Array.from({ length: days * 120 }, (_, i) => {
    const ts = now - 7 * HOUR - r() * days * 24 * HOUR;
    const grid: number[] = [];
    const gridT: number[] = [];
    GRID.forEach((g, c) => {
      grid.push(r() < win(c) ? g.tp / 100 - 0.03 : -g.sl / 100 - 0.03);
      gridT.push(60 + r() * 3 * 3600);
    });
    return {
      id: `s${i}`, kind: "checkpoint", tag: "mig3600", mint: `m${i}`, symbol: "X", ts, stage: "amm", score: 60, p: 0.1, x: [], entryMcap: 300, tp: 100, sl: 50, y: 0, ret: 0,
      exit: "timeout", grid, gv: GRID_VERSION, gridT, path: PATH_MIN.map(() => 0), ov: 1, maxMult: 1, minMult: 1, secToMax: 0, resolvedAt: ts + 6 * HOUR,
      f: { mcap: 300, age: 5000, buyers: 200, top10: 0.2, bundle: 0.05, devShare: 0.01, devSold: 0, socials: 1, launches24h: 1 },
    } as Sample;
  });
}

function proven(text: string, lo: number, settings: Partial<Settings>): EdgeFound {
  return {
    level: 0, at: "mig300", cond: "any", tp: 50, sl: 20, hold: 30, text,
    discovery: { n: 300, mean: lo + 0.1, lo, winRate: 0.5 }, holdout: { n: 150, mean: lo + 0.1, lo, winRate: 0.5 },
    baseline: 0, tradesPerDay: 20, avgHoldMin: 20, settings,
  };
}

function answer(survivors: EdgeFound[]): EdgeReport {
  return {
    generatedAt: Date.now() - HOUR, method: EDGE_METHOD, status: "ok", note: "", samples: 20_000, hours: 48, discoveryHours: 32, holdoutHours: 16, tested: 60_000, candidates: 20,
    survivors, failed: [], placebo: { runs: 5, avgSurvivors: 0, maxSurvivors: 0 },
  };
}

/** A bot with the autopilot on and the learner listening to its settings, on a data folder with these recordings. */
function bot(samples: Sample[], survivors: EdgeFound[]) {
  const store = new DataStore(mkdtempSync(join(tmpdir(), "signal-pick-")), silent);
  for (const s of samples) store.sample(s);
  store.flush();
  let learner: Learner | null = null;
  const engine = new Engine({ now: Date.now(), settings: { autopilot: true, maxOpen: 3 }, hooks: { onSettings: (s, why) => learner?.onSettings(s, why) } });
  learner = new Learner({ store, engine: () => engine, log: silent, everyHours: 0, sampleDays: 30 });
  learner.lastEdges = answer(survivors);
  const settled = async () => {
    for (let i = 0; i < 500 && learner!.measuring; i++) await new Promise((r) => setTimeout(r, 10));
  };
  return { engine, learner, settled };
}

const other = { entryAt: "mig300", minScore: 0, tpPct: 50, slPct: 20, maxHoldMin: 30, trailPct: 0, takeInitials: false, reentry: false, tradeCurve: true, tradeAmm: true, scoreOnly: true, conds: [] };
const yours = { entryAt: "mig3600", tpPct: 500, slPct: 30, maxHoldMin: 360, scoreOnly: true, trailPct: 0 };
const tp500sl30 = GRID.findIndex((g) => g.tp === 500 && g.sl === 30);

describe("a rule you pick with the autopilot on", () => {
  it("is measured on the recordings at once and kept when it does at least as well as the proven rules", async () => {
    // your rule: 1 h after graduating, +500% / −30%, and the recordings say it wins often
    const { engine, learner, settled } = bot(recordings(Date.now(), 5, (c) => (c === tp500sl30 ? 0.4 : 0.1)), [proven("B", 0.05, other)]);
    engine.updateSettings(yours);
    expect(engine.settings.autopilot).toBe(true);
    expect(learner.measuring).toBe(true);
    await settled();
    expect(learner.ownMeasure).toMatchObject({ ok: true });
    expect(learner.ownMeasure!.n).toBeGreaterThan(100);
    // yours stays: it does better than "B" on the same bar
    expect(engine.settings).toMatchObject({ entryAt: "mig3600", tpPct: 500, slPct: 30 });
    expect(learner.autopilot.active).toBeNull();
    const log = learner.autopilot.log.map((x) => x.what);
    expect(log.at(-2)).toMatch(/^You picked your own rule: 1 h after graduating · \+500% \/ −30% · 6 h/);
    expect(log.at(-1)).toMatch(/^Kept your own rule: on the newest recordings/);
    // the dashboard shows what it is weighed by
    expect(learner.autopilotView().own).toMatchObject({ from: "recordings" });
  });

  it("is replaced by a proven rule when the recordings cannot show it is any good — and the decision says why", async () => {
    const { engine, learner, settled } = bot(recordings(Date.now(), 5, () => 0.1), [proven("B", 0.05, other)]);
    // a take profit the bot does not record: nothing to weigh it by
    engine.updateSettings({ ...yours, tpPct: 123 });
    await settled();
    expect(learner.ownMeasure).toMatchObject({ ok: false, why: expect.stringMatching(/\+123% \/ −30% is not among the exits/) });
    expect(learner.autopilot.active).toBe("B");
    expect(engine.settings).toMatchObject({ entryAt: "mig300", tpPct: 50 });
    // the autopilot is still on, and your rule is one click away in its decision
    expect(engine.settings.autopilot).toBe(true);
    const last = learner.autopilot.log.at(-1)!;
    expect(last.what).toMatch(/has nothing to show yet: \+123% \/ −30% is not among the exits/);
    expect(last.rules!.map((r) => r.settings.tpPct)).toEqual([50, 123]);
  });

  it("is traded as the autopilot's own when it is a proven rule, without measuring", () => {
    const b = proven("B", 0.05, other);
    const { engine, learner } = bot([], [b]);
    engine.updateSettings(other);
    expect(learner.measuring).toBe(false);
    expect(learner.autopilot).toMatchObject({ active: "B", proof: { lo: 0.05 } });
    expect(engine.settings.autopilot).toBe(true);
  });
});

describe("a moment of your own", () => {
  it("is any time after launch or after graduating, named exactly, and kept recorded", () => {
    expect(momentTag("mig", 1799)).toBe("mig1800");
    expect(entryLabel("mig1800")).toBe("30 min after graduating");
    expect(tagOfLabel("30 min after graduating")).toBe("mig1800");
    expect(tagOfLabel("5 min after graduating")).toBe("mig300"); // a fixed point keeps its own tag
    const s = sanitizeSettings({ entryAt: "mig1800" });
    expect(s).toMatchObject({ entryAt: "mig1800", moments: ["mig1800"] });
    // off the grid, out of range, or not a moment: refused
    expect(sanitizeSettings({ entryAt: "mig1799" }).entryAt).toBe("score");
    expect(sanitizeSettings({ entryAt: "age5" }).entryAt).toBe("score");
    expect(sanitizeSettings({ entryAt: "sig12" }).entryAt).toBe("score");
    expect(sanitizeSettings({ moments: ["age20", "mig1800", "mig1800", "x70", "age600"] }).moments).toEqual(["mig1800", "age600"]);
    // at most four are recorded; the one the rule buys at always stays
    let t = sanitizeSettings({ moments: ["age30", "age40", "age50", "age60"] });
    t = sanitizeSettings({ entryAt: "mig5400" }, t);
    expect(t.moments).toEqual(["age40", "age50", "age60", "mig5400"]);
  });

  it("is where the bot buys, recorded like the fixed points, and still recorded after you switch", () => {
    const MIN = 60_000;
    const at = momentTag("age", 30);
    expect(entryLabel(at)).toBe("30 s after launch");
    const s = new Scenario({ entryAt: at, scoreOnly: true }, { outcomeHorizonMs: 20 * MIN });
    const mint = key(601);
    s.create(mint, key(602));
    s.crowd(mint, 30, 0.3, 6030, 1500); // 45 s of trading
    s.advance(2_000);
    expect(s.engine.funnel.recent.toArray().some((r) => r.mint === mint)).toBe(true);
    expect(s.positions().length + s.closed().length).toBeGreaterThan(0);
    // you switch to buying by score: the moment is still recorded, and nobody buys at it
    s.engine.updateSettings({ entryAt: "score", minScore: 99 });
    expect(s.engine.settings.moments).toEqual([at]);
    const next = key(603);
    s.create(next, key(604));
    s.crowd(next, 30, 0.3, 6040, 1500);
    s.advance(25 * MIN);
    const recorded = s.engine.samples.toArray().filter((x) => x.tag === at);
    expect(recorded.map((x) => [x.mint, x.kind])).toEqual([
      [mint, "moment"],
      [next, "moment"],
    ]);
    expect(s.positions().filter((p) => p.mint === next)).toHaveLength(0);
  });
});

describe("the Lab inbox", () => {
  it("takes rules left in data/lab-inbox.txt by a session on this computer, and says what became of each", async () => {
    const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
    const { learner } = bot([], []);
    const dir = (learner as unknown as { o: { store: DataStore } }).o.store.dir;
    writeFileSync(join(dir, "lab-inbox.txt"), "# ideas from the research session\nmig300 top10<=25% tp100 sl30 hold30\r\nscore80 stage=curve tp200 sl50\nmig301 tp100 sl30\n\n");
    const done = learner.takeLabInbox(Date.UTC(2026, 8, 29, 12));
    expect(done).toEqual([
      "2026-09-29 12:00 added: mig300 top10<=25% tp100 sl30 hold30",
      "2026-09-29 12:00 added: score80 stage=curve tp200 sl50",
      expect.stringMatching(/^2026-09-29 12:00 not added: mig301 tp100 sl30 — "mig301" is not an entry/),
    ]);
    expect(learner.lab.ideas.filter((i) => i.source === "you").map((i) => i.code)).toEqual(["mig300 top10<=25% tp100 sl30 hold30", "score80 stage=curve tp200 sl50"]);
    // taken once: the file is gone, and the log keeps what happened
    expect(existsSync(join(dir, "lab-inbox.txt"))).toBe(false);
    expect(readFileSync(join(dir, "lab-inbox.done.txt"), "utf8").trim().split("\n")).toHaveLength(3);
    expect(learner.takeLabInbox()).toEqual([]);
  });
});
