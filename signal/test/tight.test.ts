import { describe, expect, it } from "vitest";
import { exitReturn, hasExit, recordedRows } from "../src/core/edges.js";
import { GRID, GRID_SL, GRID_TP, GRID_VERSION, GRID_VERSION_MIN, LEGACY_GRID, PATH_MIN, type Sample, comboCounts } from "../src/core/outcomes.js";
import { Scenario, T0, key } from "./helpers.js";

const MIN = 60_000;
const gi = (tp: number, sl: number) => GRID.findIndex((g) => g.tp === tp && g.sl === sl);

describe("the tight exits", () => {
  it("adds near targets and a tight stop, and keeps every older exit where it was", () => {
    expect(GRID_TP).toContain(10);
    expect(GRID_TP).toContain(15);
    expect(GRID_SL).toContain(5);
    // layout 2's 48 exits, in layout 2's order, still occupy the first 48 places
    const legacyTp = [25, 50, 75, 100, 150, 200, 300, 500];
    const legacySl = [10, 20, 30, 40, 50, 70];
    const legacy = legacyTp.flatMap((tp) => legacySl.map((sl) => ({ tp, sl })));
    expect(LEGACY_GRID).toBe(48);
    expect(GRID.slice(0, LEGACY_GRID)).toEqual(legacy);
    expect(GRID.length).toBe(GRID_TP.length * GRID_SL.length);
    // and every combination really is followed exactly once
    expect(new Set(GRID.map((g) => `${g.tp}/${g.sl}`)).size).toBe(GRID.length);
  });

  it("still reads a recording made under the older layout, for the exits it has", () => {
    const old: Sample = {
      id: "o", kind: "entry", tag: "x70", mint: "m", symbol: "M", ts: T0, stage: "curve", score: 70, p: 0.1,
      x: [], entryMcap: 30, tp: 100, sl: 50, y: 1, ret: 0.4, exit: "tp",
      grid: Array.from({ length: LEGACY_GRID }, () => 0.4),
      gv: GRID_VERSION_MIN,
      gridT: Array.from({ length: LEGACY_GRID }, () => 120),
      path: PATH_MIN.map(() => 0.1),
      f: { mcap: 30, age: 60, buyers: 10, top10: 0.2, bundle: 0, devShare: 0, devSold: 0, socials: 0, launches24h: 1 },
      maxMult: 1.4, minMult: 0.9, secToMax: 100, resolvedAt: T0 + 6 * 3_600_000,
    } as unknown as Sample;
    // an exit it followed reads as it always did
    expect(hasExit(old, gi(100, 50))).toBe(true);
    expect(exitReturn(old, gi(100, 50), 0)).toBeCloseTo(0.4, 6);
    expect(comboCounts(old, gi(100, 50))).toBe(true);
    // one it never followed is unknown, not zero and not a loss
    expect(hasExit(old, gi(10, 5))).toBe(false);
    expect(exitReturn(old, gi(10, 5), 0)).toBeNaN();
    expect(comboCounts(old, gi(10, 5))).toBe(false);
    // and it is still usable by the search
    expect(recordedRows([old], 6 * 3_600_000)).toHaveLength(1);
  });

  it("follows a +10% target and sells there, ahead of the +25% it used to need", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 30 * MIN });
    const mint = key(31);
    s.create(mint, key(32));
    s.crowd(mint, 10, 0.2, 3300, 3000); // the 20 s checkpoint opens
    s.advance(2000);
    s.buy(mint, key(3400), 4, 1000); // a jump: far past +10%, short of what the old grid could see
    s.advance(35 * MIN);

    const mine = s.engine.samples.toArray().filter((x) => x.mint === mint && x.tag === "age20");
    expect(mine.length).toBe(1);
    const x = mine[0]!;
    expect(x.gv).toBe(GRID_VERSION);
    expect(x.grid.length).toBe(GRID.length);
    expect(x.gridT!.length).toBe(GRID.length);
    const near = gi(10, 10);
    const far = gi(500, 10);
    // the near target was hit, and sold at about +10%
    expect(x.grid[near]!).toBeGreaterThan(0.09);
    expect(x.grid[near]!).toBeLessThan(0.30);
    // the far one was never reached: it ran to the time limit instead, and later
    expect(x.grid[far]!).toBeLessThan(5);
    expect(x.gridT![near]!).toBeLessThan(x.gridT![far]!);
    // which is the whole point: the old grid could not see this trade end in profit at all
    expect(x.grid[gi(25, 10)]!).toBeLessThan(x.grid[near]! + 1);
  });
});
