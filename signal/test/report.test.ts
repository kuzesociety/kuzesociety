import { describe, expect, it } from "vitest";
import { Funnel } from "../src/core/funnel.js";
import { priorModel } from "../src/core/model.js";
import { GRID, type Sample } from "../src/core/outcomes.js";
import { buildReport } from "../src/core/report.js";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { rng } from "../src/core/util.js";

function makeSamples(n: number, edge: (score: number, gi: number, r: () => number) => number, seed = 1): Sample[] {
  const r = rng(seed);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const score = r() * 100;
    const grid = GRID.map((_, gi) => edge(score, gi, r));
    out.push({
      id: `s${i}`, kind: "checkpoint", tag: "age60", mint: `m${i % 500}`, symbol: "X", ts: 1_700_000_000_000 + i * 60_000, stage: "curve",
      score, p: 0.1, x: [], entryMcap: 30, tp: 100, sl: 50, y: 0, ret: grid[GRID.findIndex((g) => g.tp === 100 && g.sl === 50)]!,
      exit: "timeout", grid, maxMult: 1, minMult: 1, secToMax: 0, resolvedAt: 0,
    });
  }
  return out;
}

describe("learning report", () => {
  it("suggests nothing when outcomes are pure noise (no false discoveries)", () => {
    const noise = makeSamples(6000, (_s, _g, r) => (r() < 0.3 ? 0.9 : -0.45) + (r() - 0.5) * 0.1, 3);
    const rep = buildReport(noise, { ...DEFAULT_SETTINGS, minScore: 75 }, priorModel(), [], Date.now());
    expect(rep.suggestion).toBeNull();
    expect(rep.gate.pass).toBe(false);
  });

  it("finds a genuine, stable edge and reports it", () => {
    // high scores with TP 200 / SL 50 win often in both halves of the data
    const target = GRID.findIndex((g) => g.tp === 200 && g.sl === 50);
    const edge = makeSamples(8000, (score, gi, r) => {
      if (score >= 80 && gi === target) return r() < 0.55 ? 1.9 : -0.52;
      return r() < 0.25 ? 0.9 : -0.5;
    }, 5);
    const rep = buildReport(edge, { ...DEFAULT_SETTINGS, minScore: 75 }, priorModel(), [], Date.now());
    expect(rep.suggestion).not.toBeNull();
    expect(rep.suggestion!.tpPct).toBe(200);
    expect(rep.suggestion!.slPct).toBe(50);
    expect(rep.suggestion!.minScore).toBeGreaterThanOrEqual(80);
    expect(rep.buckets.length).toBe(10);
  });
});

describe("funnel", () => {
  it("counts each coin once per hour by its best score", () => {
    const f = new Funnel();
    const now = 1_700_000_000_000;
    f.noteScored(now, "a", 60);
    f.noteScored(now + 1000, "a", 82);
    f.noteScored(now + 2000, "a", 70);
    f.noteScored(now + 3000, "b", 76);
    f.noteScored(now + 4000, "c", 40);
    const s = f.summary(now + 5000, 1);
    expect(s.scored).toBe(3);
    expect(s.coinsAbove[75]).toBe(2);
    expect(s.coinsAbove[80]).toBe(1);
    expect(s.maxScore).toBe(82);
  });
});
