import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine.js";
import { findEdges } from "../src/core/edges.js";
import { labelOf } from "../src/core/learn.js";
import { priorModel } from "../src/core/model.js";
import { ENTRY_LEVELS, GRID, GRID_VERSION, PATH_MIN, type Sample, comboObserved } from "../src/core/outcomes.js";
import { rng } from "../src/core/util.js";
import { MarketSim } from "../src/sim/market.js";
import { Scenario, T0, key } from "./helpers.js";

const MIN = 60_000;
const gi = (tp: number, sl: number) => GRID.findIndex((g) => g.tp === tp && g.sl === sl);

describe("outcomes nobody observed", () => {
  it("a would-be trade keeps only the exits seen before its coin stopped being observed", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN });
    const mint = key(71);
    s.create(mint, key(72));
    s.crowd(mint, 12, 0.3, 7300, 5000); // a minute of trading: the 20 s and 45 s checkpoints open
    const pumpAt = s.now;
    s.buy(mint, key(7400), 12, 1000); // a big buy: +25% targets are hit while observed
    s.advance(2000);
    s.engine.outcomes.blindMint(mint, s.now); // e.g. its pool dropped out of the followed ones
    const blindAt = s.now;
    s.sell(mint, key(7400), 1, 1000); // the crash after that was not seen
    s.advance(25 * MIN);
    const mine = s.engine.samples.toArray().filter((x) => x.mint === mint && x.ts < pumpAt - 1500);
    expect(mine.length).toBeGreaterThan(0);
    for (const x of mine) {
      expect(x.blind).toBeCloseTo((blindAt - x.ts) / 1000, 0);
      // seen: the quick +25% target
      expect(comboObserved(x, gi(25, 10))).toBe(true);
      expect(x.grid[gi(25, 10)]!).toBeGreaterThan(0);
      // not seen: +500% never came before observation stopped, the stop after it does not count
      expect(comboObserved(x, gi(500, 10))).toBe(false);
      // the score's label at +100% / −50%: known if that trade ended while observed, else unknown
      const t = gi(100, 50);
      expect(labelOf(x, { tpPct: 100, slPct: 50 })).toBe(comboObserved(x, t) ? (x.grid[t]! > 0 ? 1 : 0) : null);
    }
    expect(mine.some((x) => labelOf(x, { tpPct: 100, slPct: 50 }) === null)).toBe(true);
  });

  it("graduated coins beyond the pools the bot can follow are marked, the rest are not", () => {
    const sim = new MarketSim({ durationMs: 45 * MIN, launchesPerMin: 10, seed: 12, predictability: 0.7 });
    const e = new Engine({ now: sim.opts.startTs, model: { ...priorModel(sim.opts.startTs), scaledAt: 1 }, settings: { enabled: false }, config: { outcomeHorizonMs: 30 * MIN } });
    let last = 0;
    let asked = 0;
    for (const ev of sim.run()) {
      e.ingest(ev);
      if (ev.ts - last >= 250) {
        e.advance(ev.ts);
        last = ev.ts;
      }
      // the stream asks every 5 s; here it can follow only 2 pools
      if (ev.ts - asked >= 5_000) {
        asked = ev.ts;
        e.poolsToFollow(2);
      }
    }
    e.advance(sim.opts.startTs + 4 * 3_600_000);
    const samples = e.samples.toArray();
    const amm = samples.filter((x) => x.stage === "amm");
    expect(amm.length).toBeGreaterThan(5);
    expect(amm.some((x) => x.blind !== undefined)).toBe(true);
    expect(amm.some((x) => x.blind === undefined)).toBe(true);
    // coins still on the bonding curve come with every trade of the pump program: a would-be
    // trade can only go unobserved once its coin graduated to a pool nobody follows
    const blind = samples.filter((x) => x.blind !== undefined);
    for (const x of blind) {
      expect(sim.truth.get(x.mint)?.graduated).toBe(true);
      expect(x.blind!).toBeGreaterThanOrEqual(0);
    }
    expect(samples.some((x) => x.stage === "curve" && x.blind === undefined)).toBe(true);
  });

  it("when the trade feed goes quiet, what happened meanwhile is not counted", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN, feedStaleMs: 10_000 });
    const feed = { name: "rpc", status: "open" as const, lastMsgAt: s.now, msgs: 1, reconnects: 0, errors: 0, critical: true };
    s.engine.setFeedHealth(feed);
    const mint = key(81);
    s.create(mint, key(82));
    for (let i = 0; i < 6; i++) {
      s.buy(mint, key(8300 + i), 0.3, 3000);
      s.engine.setFeedHealth({ ...feed, lastMsgAt: s.now });
    }
    const quietFrom = s.now;
    s.advance(60_000); // no messages for a minute (network down, the computer asleep)
    s.engine.setFeedHealth({ ...feed, lastMsgAt: s.now });
    s.advance(25 * MIN);
    const mine = s.engine.samples.toArray().filter((x) => x.mint === mint);
    expect(mine.filter((x) => x.ts < quietFrom).length).toBeGreaterThan(0);
    for (const x of mine) {
      // opened before the quiet minute: seen until it began; opened during it: never seen
      if (x.ts < quietFrom) expect(x.blind).toBeCloseTo((quietFrom - x.ts) / 1000, 0);
      else expect(x.blind).toBe(0);
    }
  });

  it("the edge finder does not take stops nobody saw for trades that held", () => {
    // graduated coins bought an hour after graduating: while observed they drift, then the price
    // stops reaching us. Frozen at their last value, a wide stop never triggers and holding looks
    // good; counted honestly, the exits after that moment are unknown.
    const r = rng(5);
    const T = Date.UTC(2026, 8, 1);
    const make = (blind: boolean): Sample[] =>
      Array.from({ length: 6000 }, (_, i) => {
        const ts = T + r() * 5 * 86_400_000;
        const grid = GRID.map((g) => (r() < 0.55 ? g.tp / 100 : -(g.sl / 100 + 0.05)));
        return {
          id: `s${i}`, kind: "checkpoint", tag: "mig3600", mint: `m${i}`, symbol: "X", ts, stage: "amm", score: 50, p: 0.1, x: [], entryMcap: 400, tp: 100, sl: 50, y: 0, ret: 0,
          exit: "timeout", grid, gv: GRID_VERSION, ov: 1, gridT: GRID.map(() => 3600 + r() * 7200), path: PATH_MIN.map(() => -0.05), resolvedAt: ts + 6 * 3_600_000, maxMult: 1, minMult: 1, secToMax: 0,
          f: { mcap: 400, age: 5000, buyers: 200, top10: 0.3, bundle: 0.05, devShare: 0.01, devSold: 0, socials: 1, launches24h: 1 },
          ...(blind ? { blind: 1800 } : {}),
        } as Sample;
      });
    const now = T + 6 * 86_400_000;
    expect(findEdges(make(false), { now, placeboRuns: 0 }).survivors.length).toBeGreaterThan(0);
    // observed for 30 minutes only: every exit that came later is unknown, and the only exits
    // left are the 10- and 30-minute time limits, which lose a little
    const honest = findEdges(make(true), { now, placeboRuns: 0 });
    expect(honest.survivors).toHaveLength(0);
    expect(ENTRY_LEVELS.length).toBeGreaterThan(0);
    // recorded before the bot tracked when observation stopped: a graduated coin's outcome may
    // have frozen at any point, so none of its exits is trusted (coins on the curve were always seen)
    const old = make(false).map(({ ov: _ov, ...x }) => x as Sample);
    expect(findEdges(old, { now, placeboRuns: 0 }).survivors).toHaveLength(0);
    expect(labelOf({ ...old[0]!, grid: GRID.map(() => 1) }, { tpPct: 100, slPct: 50 })).toBeNull();
    expect(labelOf({ ...old[0]!, stage: "curve", grid: GRID.map(() => 1) }, { tpPct: 100, slPct: 50 })).toBe(1);
  });
});
