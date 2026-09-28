import { describe, expect, it } from "vitest";
import { CONDITIONS, HOLDS_MIN, describeRule, edgeRuleFromText, findEdges, measureRule, normInv, recordedRows, settingsFor, tInv } from "../src/core/edges.js";
import { Engine } from "../src/core/engine.js";
import { priorModel } from "../src/core/model.js";
import { ENTRY_LEVELS, GRID, GRID_VERSION, PATH_MIN, type Sample } from "../src/core/outcomes.js";
import { MarketSim } from "../src/sim/market.js";
import { ENTRY_POINTS, entryLabel, momentTag, sanitizeSettings } from "../src/core/settings.js";
import { rng } from "../src/core/util.js";

const T0 = Date.UTC(2026, 8, 1);

/**
 * Entry outcomes over `days`: every exit loses on average (like most of pump.fun), except
 * where `edge` says otherwise.
 */
function makeEntries(n: number, days: number, seed: number, edge?: (s: Sample, c: number) => number | null, tags?: string[], fromDay = 0): Sample[] {
  const r = rng(seed);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const ts = T0 + (fromDay + r() * (days - fromDay)) * 86_400_000;
    const level = ENTRY_LEVELS[Math.floor(r() * ENTRY_LEVELS.length)]!;
    const tag = tags ? tags[Math.floor(r() * tags.length)]! : `x${level}`;
    const s: Sample = {
      id: `e${i}${tag}`, kind: tag.startsWith("x") ? "entry" : tag in ENTRY_POINTS ? "checkpoint" : "moment", tag, mint: `m${i}`, symbol: "X", ts, stage: tag.startsWith("mig") || (tag.startsWith("x") && r() < 0.4) ? "amm" : "curve",
      score: level, p: 0.1, x: [], entryMcap: 50, tp: 100, sl: 50, y: 0, ret: 0, exit: "timeout", grid: [], maxMult: 1, minMult: 1, secToMax: 0,
      resolvedAt: ts + 3_600_000, gv: GRID_VERSION, ov: 1, gridT: [], path: PATH_MIN.map(() => -0.3 + r() * 0.4),
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
    // Student's t (the holdout counts evidence per hour, often a few dozen hours)
    expect(tInv(0.975, 10)).toBeCloseTo(2.228139, 3);
    expect(tInv(0.9975, 15)).toBeCloseTo(3.286039, 3);
    expect(tInv(0.9975, 5)).toBeCloseTo(4.773341, 1);
    expect(tInv(0.9975, 2)).toBeCloseTo(14.08905, 3);
    expect(tInv(0.9975, 3)).toBeGreaterThan(5.840909);
    expect(tInv(0.9975, 5000)).toBeCloseTo(normInv(0.9975), 2);
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
    // how long its trades last decides how many the open-position limit allows (autopilot)
    expect(top.avgHoldMin).toBeGreaterThan(0);
    // the rule is directly runnable: graduated coins only, score-only (no filter needed)
    expect(top.settings).toMatchObject({ minScore: top.level, tpPct: 50, slPct: 20, tradeCurve: false, tradeAmm: true, scoreOnly: true });
    expect(rep.placebo.avgSurvivors).toBeLessThanOrEqual(1);
  });

  it("finds an edge at a fixed point in coins' lives, checked on its own unseen days, and makes it tradable", () => {
    const target = GRID.findIndex((g) => g.tp === 75 && g.sl === 30);
    // score entries over 10 days; the fixed points were only recorded for the last 3 days —
    // one time split for everything (at day 6.7) would put them all in the holdout and never
    // search them
    const entries = makeEntries(10_000, 10, 21);
    const points = makeEntries(6_000, 10, 22, (s, c) => (c === target && s.tag === "prog50" ? 0.55 : null), ["prog25", "prog50", "prog75", "mig300", "age180"], 7);
    const rep = findEdges([...entries, ...points], { now: T0 + 11 * 86_400_000 });
    expect(rep.status).toBe("ok");
    const top = rep.survivors[0]!;
    expect(top).toBeDefined();
    expect(top.at).toBe("prog50");
    expect([top.tp, top.sl]).toEqual([75, 30]);
    expect(top.text).toContain("Buy every coin halfway to graduation");
    expect(top.settings).toMatchObject({ entryAt: "prog50", minScore: 0, tpPct: 75, slPct: 30 });
    expect(rep.survivors.every((x) => x.at === "prog50")).toBe(true);
  });

  it("finds nothing in pure noise, and the placebo agrees", () => {
    const rep = findEdges(makeEntries(14_000, 10, 11), { now: T0 + 11 * 86_400_000 });
    expect(rep.status).toBe("ok");
    expect(rep.survivors).toHaveLength(0);
    expect(rep.placebo.maxSurvivors).toBeLessThanOrEqual(1);
  });

  it("a hot hour of the market is not an edge: evidence is counted hour by hour", () => {
    // No rule has an edge (every exit breaks even), but the market has moods: in half the hours
    // every coin wins more often, in the other half less. Counting trade by trade, the holdout
    // "proved" 7 rules on this data (seed 6) and 1 on seed 3; hour by hour, none.
    const moody = (seed: number) => {
      const r = rng(seed);
      const mood = Array.from({ length: 48 }, () => (r() < 0.5 ? -0.9 : 0.9));
      const out: Sample[] = [];
      for (let i = 0; i < 20_000; i++) {
        const ts = T0 + r() * 2 * 86_400_000;
        const h = Math.floor((ts - T0) / 3_600_000);
        const level = ENTRY_LEVELS[Math.floor(r() * ENTRY_LEVELS.length)]!;
        const s: Sample = {
          id: `e${i}x${level}`, kind: "entry", tag: `x${level}`, mint: `m${i}`, symbol: "X", ts, stage: r() < 0.4 ? "amm" : "curve",
          score: level, p: 0.1, x: [], entryMcap: 50, tp: 100, sl: 50, y: 0, ret: 0, exit: "timeout", grid: [], maxMult: 1, minMult: 1, secToMax: 0,
          resolvedAt: ts + 3_600_000, gv: GRID_VERSION, ov: 1, gridT: [], path: PATH_MIN.map(() => -0.3 + r() * 0.4),
          f: { mcap: 20 + r() * 600, age: 10 + r() * 1800, buyers: Math.floor(3 + r() * 300), top10: 0.1 + r() * 0.7, bundle: r() * 0.4, devShare: r() * 0.3, devSold: r() < 0.5 ? 0 : r(), socials: Math.floor(r() * 4), launches24h: 1 + Math.floor(r() * 6) },
        };
        for (const g of GRID) {
          // break-even: a loss averages the stop + 5%
          const pWin = Math.min(0.97, Math.max(0.01, ((g.sl + 5) / (g.tp + g.sl + 5)) * (1 + mood[h]!)));
          s.grid.push(r() < pWin ? g.tp / 100 : -(g.sl / 100 + 0.1 * r()));
          s.gridT!.push(30 + r() * 3000);
        }
        out.push(s);
      }
      return out;
    };
    for (const seed of [3, 6]) expect(findEdges(moody(seed), { now: T0 + 3 * 86_400_000, placeboRuns: 0 }).survivors).toHaveLength(0);
  });

  it("measures the rule in use on the coins that qualified after its proof (its forward test)", () => {
    const samples = makeEntries(6000, 10, 8);
    const after = T0 + 7 * 86_400_000;
    const rule = { level: 75, cond: "any", tp: 100, sl: 50, hold: 0 };
    const rep = findEdges(samples, { now: T0 + 11 * 86_400_000, placeboRuns: 0, incumbent: { rule, after } });
    const gi = GRID.findIndex((g) => g.tp === 100 && g.sl === 50);
    const mine = samples.filter((s) => s.tag === "x75" && s.ts > after && s.ts <= rep.cutoff!);
    expect(mine.length).toBeGreaterThan(40);
    expect(rep.incumbent!.n).toBe(mine.length);
    expect(rep.incumbent!.mean).toBeCloseTo(mine.reduce((a, s) => a + s.grid[gi]!, 0) / mine.length, 9);
    expect(rep.incumbent!.lo).toBeLessThan(rep.incumbent!.mean);
    expect(rep.incumbent!.hi).toBeGreaterThan(rep.incumbent!.mean);
    expect(rep.incumbent!.text).toMatch(/first reaches 75/);
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

  it("measures your own rule exactly as it checks a candidate: the same unseen coins, the same bar", () => {
    const target = GRID.findIndex((g) => g.tp === 50 && g.sl === 20);
    const samples = makeEntries(14_000, 10, 3, (s, c) => (c === target && s.stage === "amm" && s.score >= 70 ? 0.55 : null));
    const rep = findEdges(samples, { now: T0 + 11 * 86_400_000 });
    const checked = [...rep.survivors, ...rep.failed];
    expect(checked.length).toBeGreaterThan(1);
    const rows = recordedRows(samples, 6 * 3_600_000);
    // every rule the search checked, set as your own rule, measures what the search measured
    for (const r of checked) {
      const m = measureRule(rows, sanitizeSettings(r.settings), { horizonMs: 6 * 3_600_000, tests: rep.candidates, minN: 2, minWins: 0 });
      expect(m.ok).toBe(true);
      expect(m.n).toBe(r.holdout.n);
      expect(m.mean).toBeCloseTo(r.holdout.mean, 5);
      expect(m.lo).toBeCloseTo(r.holdout.lo, 5);
      expect(m.coinsPerDay).toBeCloseTo(r.tradesPerDay, 6);
      expect(m.avgHoldMin!).toBeCloseTo(r.avgHoldMin!, 4);
    }
    // your filters are applied as the engine applies them: a narrower rule measures fewer coins
    const top = rep.survivors[0]!;
    const narrow = measureRule(rows, sanitizeSettings({ ...top.settings, scoreOnly: false, filters: { minBuyers: 150, maxTop10Pct: 100, maxDevPct: 100, maxBundlePct: 100, maxDevLaunches24h: 0 } }), { horizonMs: 6 * 3_600_000, minN: 2, minWins: 0 });
    expect(narrow.n).toBeGreaterThan(0);
    expect(narrow.n).toBeLessThan(top.holdout.n);
    // …and the search reports the rule in use measured this way, at its own bar
    const withOwn = findEdges(samples, { now: T0 + 11 * 86_400_000, own: sanitizeSettings(top.settings) });
    expect(withOwn.own).toMatchObject({ ok: true, n: top.holdout.n });
    expect(withOwn.own!.lo).toBeCloseTo(top.holdout.lo, 5);
  });

  it("never approximates a rule the recordings cannot express: it says why", () => {
    const rows = recordedRows(makeEntries(6_000, 4, 5), 6 * 3_600_000);
    const why = (patch: Record<string, unknown>) => measureRule(rows, sanitizeSettings({ entryAt: "score", minScore: 70, tpPct: 50, slPct: 20, maxHoldMin: 30, scoreOnly: true, ...patch }), { horizonMs: 6 * 3_600_000 }).why ?? "";
    expect(why({})).toBe("");
    expect(why({ minScore: 72 })).toMatch(/score 72 is not one of the levels/);
    expect(why({ tpPct: 123 })).toMatch(/\+123% \/ −20% is not among the exits/);
    expect(why({ maxHoldMin: 240 })).toMatch(/a time limit of 240 min/);
    expect(why({ maxHoldMin: 360 })).toBe(""); // the horizon: followed as long as a rule without a limit
    expect(why({ maxHoldMin: 120 })).toBe("");
    expect(why({ trailPct: 20 })).toMatch(/trailing stop/);
    expect(why({ reentry: true })).toMatch(/same coin again/);
    expect(why({ entryAt: "mig1800" })).toMatch(/no finished recordings of coins 30 min after graduating/);
    // too few coins, or too few wins, is not evidence either
    expect(measureRule(rows.slice(0, 300), sanitizeSettings({ minScore: 70, tpPct: 50, slPct: 20, maxHoldMin: 30, scoreOnly: true }), { horizonMs: 6 * 3_600_000 }).why).toMatch(/needed/);
    expect(measureRule(rows, sanitizeSettings({ minScore: 70, tpPct: 500, slPct: 10, maxHoldMin: 0, scoreOnly: true }), { horizonMs: 6 * 3_600_000, minN: 2 }).why).toMatch(/too few to count on/);
  });

  it("reads its own rule texts back, for every entry, condition and exit", () => {
    const ats = [...Object.keys(ENTRY_POINTS), momentTag("mig", 1800), momentTag("age", 150), momentTag("mig", 9000)];
    let n = 0;
    for (const cond of CONDITIONS)
      for (const g of GRID)
        for (const hold of HOLDS_MIN)
          for (const e of [...ENTRY_LEVELS.map((level) => ({ level })), ...ats.map((at) => ({ level: 0, at }))]) {
            if ((n++ & 7) !== 0) continue; // a sample of the combinations keeps the test quick
            const rule = { ...e, cond: cond.key, tp: g.tp, sl: g.sl, hold };
            const text = describeRule(rule);
            expect(edgeRuleFromText(text)).toEqual(rule);
          }
    expect(entryLabel(momentTag("mig", 1800))).toBe("30 min after graduating");
    expect(entryLabel(momentTag("age", 150))).toBe("2.5 min after launch");
    expect(entryLabel(momentTag("mig", 9000))).toBe("2.5 h after graduating");
    expect(edgeRuleFromText("Buy every coin 7 min after lunch · sell at +50% or −20%")).toBeNull();
    expect(edgeRuleFromText("Buy when a coin first reaches 72 · sell at +50% or −20%")).toBeNull();
    expect(settingsFor(edgeRuleFromText("Buy every coin 15 min after graduating · market cap ≥ 300 SOL · sell at +50% or −70%, or after 60 min")!, 6 * 3_600_000)).toMatchObject({
      entryAt: "mig900",
      tpPct: 50,
      slPct: 70,
      maxHoldMin: 60,
      scoreOnly: false,
      filters: { minMcapSol: 300 },
    });
  });

  it("searches moments of your own once they are recorded, like the fixed ones", () => {
    const target = GRID.findIndex((g) => g.tp === 75 && g.sl === 30);
    const mine = momentTag("mig", 1800);
    const entries = makeEntries(9_000, 10, 23);
    const moments = makeEntries(4_000, 10, 24, (s, c) => (c === target ? 0.6 : null), [mine], 6);
    const rep = findEdges([...entries, ...moments], { now: T0 + 11 * 86_400_000 });
    const found = rep.survivors.find((r) => r.at === mine);
    expect(found).toBeDefined();
    expect(found!.text).toMatch(/^Buy every coin 30 min after graduating/);
    expect(found!.settings.entryAt).toBe(mine);
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
