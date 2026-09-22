import { describe, expect, it } from "vitest";
import { CONDITIONS, findEdges, normInv } from "../src/core/edges.js";
import { Engine } from "../src/core/engine.js";
import { priorModel } from "../src/core/model.js";
import { ENTRY_LEVELS, GRID, GRID_VERSION, PATH_MIN, type Sample } from "../src/core/outcomes.js";
import { MarketSim } from "../src/sim/market.js";
import { rng } from "../src/core/util.js";

const T0 = Date.UTC(2026, 8, 1);

/**
 * Entry outcomes over `days`: every exit loses on average (like most of pump.fun), except
 * where `edge` says otherwise.
 */
function makeEntries(n: number, days: number, seed: number, edge?: (s: Sample, c: number) => number | null): Sample[] {
  const r = rng(seed);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const ts = T0 + r() * days * 86_400_000;
    const level = ENTRY_LEVELS[Math.floor(r() * ENTRY_LEVELS.length)]!;
    const s: Sample = {
      id: `e${i}`, kind: "entry", tag: `x${level}`, mint: `m${i}`, symbol: "X", ts, stage: r() < 0.4 ? "amm" : "curve",
      score: level, p: 0.1, x: [], entryMcap: 50, tp: 100, sl: 50, y: 0, ret: 0, exit: "timeout", grid: [], maxMult: 1, minMult: 1, secToMax: 0,
      resolvedAt: ts + 3_600_000, gv: GRID_VERSION, gridT: [], path: PATH_MIN.map(() => -0.3 + r() * 0.4),
      f: { mcap: 20 + r() * 600, age: 10 + r() * 1800, buyers: Math.floor(3 + r() * 300), top10: 0.1 + r() * 0.7, bundle: r() * 0.4, devShare: r() * 0.3, devSold: r() < 0.5 ? 0 : r(), socials: Math.floor(r() * 4), launches24h: 1 + Math.floor(r() * 6) },
    };
    GRID.forEach((g, c) => {
      const planted = edge?.(s, c);
      // fair-ish coin flip at 80% of break-even: a steady loss for every exit
      const pWin = planted ?? (0.8 * (g.sl + 10)) / (g.tp + g.sl + 10);
      s.grid.push(r() < pWin ? g.tp / 100 : -(g.sl / 100 + 0.1 * r()));
      s.gridT!.push(30 + r() * 3000);
    });
    out.push(s);
  }
  return out;
}

describe("edge finder", () => {
  it("normal quantiles are right", () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normInv(0.5)).toBeCloseTo(0, 9);
    expect(normInv(1 - 0.05 / 20)).toBeCloseTo(2.807034, 5);
  });

  it("finds a planted edge and checks it on data it never saw", () => {
    const target = GRID.findIndex((g) => g.tp === 50 && g.sl === 20);
    // graduated coins that reach 70+ hit +50% before −20% far more often than break-even
    const samples = makeEntries(14_000, 10, 3, (s, c) => (c === target && s.stage === "amm" && s.score >= 70 ? 0.55 : null));
    const rep = findEdges(samples, { now: T0 + 11 * 86_400_000 });
    expect(rep.status).toBe("ok");
    expect(rep.tested).toBeGreaterThan(10_000);
    expect(rep.survivors.length).toBeGreaterThan(0);
    const top = rep.survivors[0]!;
    expect(top.cond).toBe("amm");
    expect([top.tp, top.sl]).toEqual([50, 20]);
    expect(top.level).toBeGreaterThanOrEqual(70);
    expect(top.holdout.lo).toBeGreaterThan(0);
    expect(top.holdout.mean).toBeGreaterThan(top.baseline);
    // the rule is directly runnable: graduated coins only, score-only (no filter needed)
    expect(top.settings).toMatchObject({ minScore: top.level, tpPct: 50, slPct: 20, tradeCurve: false, tradeAmm: true, scoreOnly: true });
    expect(rep.placebo.avgSurvivors).toBeLessThanOrEqual(1);
  });

  it("finds nothing in pure noise, and the placebo agrees", () => {
    const rep = findEdges(makeEntries(14_000, 10, 11), { now: T0 + 11 * 86_400_000 });
    expect(rep.status).toBe("ok");
    expect(rep.survivors).toHaveLength(0);
    expect(rep.placebo.maxSurvivors).toBeLessThanOrEqual(1);
  });

  it("filter rules carry the exact filter, with every other filter open", () => {
    const target = GRID.findIndex((g) => g.tp === 100 && g.sl === 30);
    const samples = makeEntries(14_000, 10, 5, (s, c) => (c === target && s.f!.buyers >= 100 && s.score >= 60 ? 0.5 : null));
    const rep = findEdges(samples, { now: T0 + 11 * 86_400_000 });
    const hit = rep.survivors.find((x) => x.cond === "buyers>=100");
    expect(hit).toBeDefined();
    expect(hit!.settings.scoreOnly).toBe(false);
    expect(hit!.settings.filters).toMatchObject({ minBuyers: 100, maxDevPct: 100, maxTop10Pct: 100, maxBundlePct: 100, minMcapSol: 0, maxAgeMin: 0 });
  });

  it("waits for enough complete data", () => {
    const rep = findEdges(makeEntries(500, 0.5, 2), { now: T0 + 86_400_000 });
    expect(rep.status).toBe("not_enough_data");
    expect(rep.note).toMatch(/Needs at least 24 hours/);
  });

  it("every condition matches a filter or stage the bot really has", () => {
    for (const c of CONDITIONS) expect(c.key === "any" || !!c.stage || !!c.filters).toBe(true);
  });

  it("the engine records what the finder needs", () => {
    const sim = new MarketSim({ durationMs: 30 * 60_000, launchesPerMin: 8, seed: 4, predictability: 0.5 });
    const e = new Engine({ now: sim.opts.startTs, model: { ...priorModel(sim.opts.startTs), scaledAt: 1 }, settings: { enabled: false } });
    let last = 0;
    for (const ev of sim.run()) {
      e.ingest(ev);
      if (ev.ts - last >= 250) {
        e.advance(ev.ts);
        last = ev.ts;
      }
    }
    e.advance(sim.opts.startTs + 8 * 3_600_000);
    const entries = e.samples.toArray().filter((s) => s.kind === "entry");
    expect(entries.length).toBeGreaterThan(50);
    for (const s of entries) {
      expect(s.gv).toBe(GRID_VERSION);
      expect(s.grid).toHaveLength(GRID.length);
      expect(s.gridT).toHaveLength(GRID.length);
      expect(s.path).toHaveLength(PATH_MIN.length);
      expect(s.f!.mcap).toBeGreaterThan(0);
      expect(ENTRY_LEVELS).toContain(Number(s.tag.slice(1)));
    }
    // a position still open at a horizon has a recorded value there
    const long = entries.filter((s) => s.gridT!.some((t) => t > 10 * 60));
    expect(long.length).toBeGreaterThan(0);
    for (const s of long) expect(s.path![1]).not.toBeNull();
  });
});
