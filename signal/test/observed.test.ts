import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine.js";
import { findEdges } from "../src/core/edges.js";
import { labelOf } from "../src/core/learn.js";
import { priorModel } from "../src/core/model.js";
import { ENTRY_LEVELS, GRID, GRID_VERSION, PATH_MIN, type Sample, comboCounts, comboObserved, counts, seenAt } from "../src/core/outcomes.js";
import { normInv, rng } from "../src/core/util.js";
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
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN, feedStaleMs: 10_000, feedOutageMs: 30_000 });
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
    expect(s.engine.feedOutage()).toBe(true);
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

  it("when the bot stops (a restart, an update), open recordings are written as far as they were watched, not lost", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN });
    const mint = key(91);
    s.create(mint, key(92));
    s.crowd(mint, 12, 0.3, 9300, 5000); // a minute of trading: the early checkpoints open
    const pumpAt = s.now;
    s.buy(mint, key(9400), 12, 1000); // a big buy: the quick +25% targets are hit while watched
    s.advance(3 * MIN);
    const open = s.engine.outcomes.open;
    expect(open).toBeGreaterThan(0);
    const written = s.engine.samples.length;
    const stopAt = s.now;
    s.engine.endRecordings();
    expect(s.engine.outcomes.open).toBe(0);
    const cut = s.engine.samples.toArray().slice(written);
    expect(cut.length).toBe(open);
    for (const x of cut) {
      expect(x.blindBy).toBe("stop");
      expect(x.blind).toBeCloseTo((stopAt - x.ts) / 1000, 0);
      expect(x.resolvedAt).toBe(stopAt);
      // exits reached while watched are kept (the +25% of those opened before the big buy); the rest never count as results
      if (x.ts < pumpAt - 1500) {
        expect(comboObserved(x, gi(25, 10))).toBe(true);
        expect(x.grid[gi(25, 10)]!).toBeGreaterThan(0);
      }
      expect(comboObserved(x, gi(500, 10))).toBe(false);
      expect(comboCounts(x, gi(500, 10))).toBe(false);
      // like an outage: a rule counts it only if its whole window was watched
      expect(counts(x, 30, 60)).toBe(x.blind! >= 60);
      expect(counts(x, 30, 3600)).toBe(false);
    }
    expect(cut.filter((x) => x.ts < pumpAt - 1500).length).toBeGreaterThan(0);
    // the score never learns from a cut recording
    expect(cut.every((x) => labelOf(x, { tpPct: 25, slPct: 10 }) === null)).toBe(true);
  });

  it("a reconnect of a few seconds is not an outage: nothing is cut, entries only wait meanwhile", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN });
    const feed = { name: "rpc", status: "open" as "open" | "connecting", lastMsgAt: s.now, msgs: 1, reconnects: 0, errors: 0, critical: true };
    s.engine.setFeedHealth(feed);
    const mint = key(83);
    s.create(mint, key(84));
    for (let i = 0; i < 6; i++) {
      s.buy(mint, key(8400 + i), 0.3, 3000);
      s.engine.setFeedHealth({ ...feed, lastMsgAt: s.now });
    }
    // the socket drops and is back 8 seconds later (the public feed does this now and then)
    s.engine.setFeedHealth({ ...feed, status: "connecting", lastMsgAt: s.now });
    expect(s.engine.feedDown()).toBe(true);
    s.advance(8_000);
    expect(s.engine.feedOutage()).toBe(false); // entries wait, but nothing is cut and the self-check raises no alarm
    s.engine.setFeedHealth({ ...feed, status: "open", lastMsgAt: s.now });
    expect(s.engine.feedDown()).toBe(false);
    // …and carries on while the would-be trades finish
    for (let t = 0; t < 25 * MIN; t += 20_000) {
      s.advance(20_000);
      s.engine.setFeedHealth({ ...feed, lastMsgAt: s.now });
    }
    const mine = s.engine.samples.toArray().filter((x) => x.mint === mint);
    expect(mine.length).toBeGreaterThan(0);
    for (const x of mine) expect(x.blind).toBeUndefined();
  });

  it("a recording counts for a rule only if it was watched for the rule's whole time, not by how early it ended", () => {
    // graduated coins held up to 60 min for +50% / −70% (like "15 min after graduating · +50% /
    // −70% · 60 min"). For most of them the price stops reaching us at some moment — newer
    // graduates took the pools the bot follows — which has nothing to do with their price.
    const r = rng(11);
    const hour = 3600;
    let all = 0;
    const seen = { sum: 0, n: 0 };
    const counted = { sum: 0, n: 0 };
    const N = 40_000;
    for (let i = 0; i < N; i++) {
      let lp = 0;
      let ret = NaN;
      let t = hour;
      for (let m = 1; m <= 60 && Number.isNaN(ret); m++) {
        lp += -0.004 + 0.07 * normInv(Math.min(Math.max(r(), 1e-9), 1 - 1e-9));
        if (lp >= Math.log(1.5)) ret = 0.5;
        else if (lp <= Math.log(0.3)) ret = -0.7;
        if (!Number.isNaN(ret)) t = m * 60;
      }
      if (Number.isNaN(ret)) ret = Math.exp(lp) - 1; // sold at the time limit
      const s = { stage: "amm", ov: 1, ...(r() < 0.8 ? { blind: r() * 1.5 * hour, blindBy: "pool" } : {}) } as Sample;
      all += ret;
      // the old rule: the exit was seen
      if (seenAt(s, t)) (seen.sum += ret), seen.n++;
      // the rule now: watched for the whole hour, however it ended
      if (counts(s, t, hour)) (counted.sum += ret), counted.n++;
    }
    const truth = all / N;
    // keeping the exits that were seen keeps the quick targets and leaves out the slow sells
    expect(seen.sum / seen.n - truth).toBeGreaterThan(0.05);
    expect(Math.abs(counted.sum / counted.n - truth)).toBeLessThan(0.01);
    expect(counted.n).toBeGreaterThan(N * 0.3);
  });

  it("which recordings count: graduated coins and feed outages need the rule's whole window, a curve coin that graduated only its exit", () => {
    const amm = { stage: "amm", ov: 1, blind: 1800, blindBy: "pool" } as Sample;
    expect(counts(amm, 300, 600)).toBe(true); // a 10-minute rule: watched through
    expect(counts(amm, 700, 600)).toBe(true); // sold at its time limit, watched through
    expect(counts(amm, 300, 3600)).toBe(false); // a 60-minute rule: its target at 5 min was seen, but only luck decides which of them count
    expect(counts(amm, 300)).toBe(false); // no time limit: held to the end, not watched to the end
    expect(counts({ ...amm, blind: undefined, blindBy: undefined }, 20_000)).toBe(true);
    expect(counts({ ...amm, ov: undefined, blind: undefined }, 300, 600)).toBe(false); // recorded before watching was tracked
    const outage = { stage: "curve", ov: 1, blind: 1800, blindBy: "feed" } as Sample;
    expect(counts(outage, 300, 600)).toBe(true);
    expect(counts(outage, 300)).toBe(false);
    // cut by the bot stopping: the same as an outage
    const stopped = { ...outage, blindBy: "stop" } as Sample;
    expect(counts(stopped, 300, 600)).toBe(true);
    expect(counts(stopped, 300, 3600)).toBe(false);
    expect(counts(stopped, 300)).toBe(false);
    // bought on the curve, its pool dropped after it graduated: graduating is a result, the exit only needs to be seen
    const graduated = { stage: "curve", ov: 1, blind: 1800, blindBy: "pool" } as Sample;
    expect(counts(graduated, 300)).toBe(true);
    expect(counts(graduated, 2000)).toBe(false);
    expect(counts(graduated, 5000, 1200)).toBe(true); // sold at 20 min, before watching stopped
    const g = { ...amm, gridT: GRID.map(() => 300) } as Sample;
    expect(comboObserved(g, 0)).toBe(true);
    expect(comboCounts(g, 0)).toBe(false);
  });

  it("a coin that just graduated gets a minute to name its pool before it counts as unobserved", () => {
    for (const learnsPool of [true, false]) {
      const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN });
      const mint = key(91);
      s.create(mint, key(92));
      s.crowd(mint, 12, 0.3, 9300, 5000); // the 20 s and 45 s checkpoints open
      const gradAt = s.now;
      // one feed reports the graduation without the pool's address; the other names it a moment later
      s.emit({ k: "migrate", ts: s.now, src: "pumpportal", sig: key(9400), mint });
      s.advance(5_000);
      expect(s.engine.poolsToFollow()).toEqual([]);
      if (learnsPool) {
        const c = s.curves.get(mint)!;
        s.emit({ k: "pool", ts: s.now, src: "rpc", sig: key(9400), pool: key(9401), mint, quoteIsSol: true, base: c.vTok, quote: c.vSol });
        expect(s.engine.poolsToFollow()).toEqual([key(9401)]);
      }
      s.advance(60_000);
      s.engine.poolsToFollow();
      s.advance(25 * MIN);
      const mine = s.engine.samples.toArray().filter((x) => x.mint === mint && x.ts < gradAt);
      expect(mine.length).toBeGreaterThan(0);
      for (const x of mine) {
        if (learnsPool) expect(x.blind).toBeUndefined();
        else {
          // never named: nothing after the graduation was seen
          expect(x.blind).toBeCloseTo((gradAt - x.ts) / 1000, 0);
          expect(x.blindBy).toBe("pool");
        }
      }
    }
  });

  it("a graduated coin whose price the bot does not follow is not bought at its last price", () => {
    for (const followed of [true, false]) {
      const s = new Scenario({ entryAt: "mig60", scoreOnly: true, tradeCurve: false }, { outcomeHorizonMs: 20 * MIN });
      const mint = key(95);
      const pool = key(9501);
      s.create(mint, key(96));
      s.crowd(mint, 12, 0.3, 9600, 5000);
      const c = s.curves.get(mint)!;
      s.emit({ k: "migrate", ts: s.now, src: "rpc", sig: key(9502), mint, pool });
      s.emit({ k: "pool", ts: s.now, src: "rpc", sig: key(9502), pool, mint, quoteIsSol: true, base: c.vTok, quote: c.vSol });
      // a minute of swaps; the stream asks every 5 s which pools to follow (here: room for none, or plenty)
      for (let i = 0; i < 16; i++) {
        s.advance(5_000);
        s.engine.poolsToFollow(followed ? 40 : 0);
        s.emit({ k: "trade", ts: s.now, src: "rpc", sig: key(9600 + i), mint, buy: true, sol: 1e7, tok: 1e11, user: key(9700 + i), venue: "amm", vSol: c.vSol, vTok: c.vTok, pool });
      }
      s.advance(3_000);
      const sig = s.engine.funnel.recent.toArray().find((r) => r.mint === mint);
      expect(sig).toBeDefined();
      if (followed) expect(s.positions().some((p) => p.mint === mint)).toBe(true);
      else {
        expect(sig!.decision).toBe("blocked");
        expect(sig!.reason).toBe("not_followed");
        expect(s.positions()).toHaveLength(0);
      }
    }
  });

  it("a coin followed again after a gap is bought only once a swap has brought its price up to date", () => {
    for (const swapAfter of [true, false]) {
      const s = new Scenario({ entryAt: "mig300", scoreOnly: true, tradeCurve: false }, { outcomeHorizonMs: 60 * MIN });
      const mint = key(97);
      const pool = key(9701);
      s.create(mint, key(98));
      s.crowd(mint, 12, 0.3, 9800, 5000);
      const c = s.curves.get(mint)!;
      s.emit({ k: "migrate", ts: s.now, src: "rpc", sig: key(9702), mint, pool });
      s.emit({ k: "pool", ts: s.now, src: "rpc", sig: key(9702), pool, mint, quoteIsSol: true, base: c.vTok, quote: c.vSol });
      const swap = (i: number) =>
        s.emit({ k: "trade", ts: s.now, src: "rpc", sig: key(9800 + i), mint, buy: true, sol: 1e7, tok: 1e11, user: key(9900 + i), venue: "amm", vSol: c.vSol, vTok: c.vTok, pool });
      const follow = (max: number, ms: number) => {
        for (let t = 0; t < ms; t += 5_000) {
          s.engine.poolsToFollow(max);
          s.advance(5_000);
        }
      };
      follow(40, 60_000); // followed after graduating
      follow(0, 120_000); // dropped for newer graduates: swaps no longer reach the bot
      follow(40, 60_000); // followed again at 3 min, quiet so far
      if (swapAfter) swap(1);
      follow(40, 40_000);
      // the 5-minute moment: an aggregator's quote makes the bot look at the coin again
      s.emit({ k: "quote", ts: s.now, src: "dexscreener", mint, priceSol: 1e-7 });
      follow(40, 90_000);
      const sig = s.engine.funnel.recent.toArray().find((r) => r.mint === mint);
      expect(sig).toBeDefined();
      if (swapAfter) expect(s.positions().some((p) => p.mint === mint)).toBe(true);
      else {
        expect(sig!.reason).toBe("not_followed");
        expect(s.positions()).toHaveLength(0);
      }
    }
  });

  it("coins the rule is about to buy are followed first when there are more graduates than pools", () => {
    const s = new Scenario({ entryAt: "mig3600", scoreOnly: true, tradeCurve: false }, { outcomeHorizonMs: 3 * 3_600_000 });
    const graduate = (n: number) => {
      const mint = key(1000 + n);
      s.create(mint, key(1100 + n));
      s.crowd(mint, 12, 0.3, 1200 + n * 20, 2000);
      s.emit({ k: "migrate", ts: s.now, src: "rpc", sig: key(1300 + n), mint, pool: key(1400 + n) });
      return key(1400 + n);
    };
    const early = graduate(1); // will be bought 1 h after graduating
    const c = s.curves.get(key(1001))!;
    for (let i = 0; i < 13; i++) {
      s.advance(4 * MIN); // it keeps trading
      s.emit({ k: "trade", ts: s.now, src: "rpc", sig: key(1500 + i), mint: key(1001), buy: true, sol: 1e7, tok: 1e11, user: key(1600 + i), venue: "amm", vSol: c.vSol, vTok: c.vTok, pool: early });
    }
    const newer = [graduate(2), graduate(3), graduate(4)];
    // room for two pools: the coin about to be bought, then the newest graduate
    expect(s.engine.poolsToFollow(2).sort()).toEqual([early, newer[2]!].sort());
    // without such a rule, simply the newest
    s.engine.updateSettings({ entryAt: "score" });
    expect(s.engine.poolsToFollow(2).sort()).toEqual([newer[1]!, newer[2]!].sort());
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
