import { describe, expect, it } from "vitest";
import { boostSteps, ensembleContrib, ensembleMargin, validEnsemble } from "../src/core/boost.js";
import { FEATURE_KEYS, featureVector } from "../src/core/features.js";
import { driversOf, freshCheck, learnRunOf } from "../src/core/insight.js";
import { REDUNDANT, type TrainRow, evaluate, fitStage, labelOf, trainAndSelect, trainAndSelectAsync, trainingRows } from "../src/core/learn.js";
import { type ModelSpec, contributionPoints, pointsPerLogit, priorModel, rawLogit, scoreToken, scoreVector, validateModel } from "../src/core/model.js";
import { GRID, GRID_VERSION, type Sample } from "../src/core/outcomes.js";
import { rng, runSteps } from "../src/core/util.js";
import { learningMessage } from "../src/node/telegram.js";

const T0 = Date.UTC(2026, 8, 1);
const HOUR = 3_600_000;
const at = (k: string) => FEATURE_KEYS.indexOf(k);
const prior = (): ModelSpec => ({ ...priorModel(T0), scaledAt: T0 });

/**
 * Coin moments with feature vectors spread like the prior expects, and a win chance set by
 * `pWin` from the standardized inputs. One row per coin, evenly over `hours` from `from`.
 */
function world(n: number, seed: number, pWin: (z: number[]) => number, o: { from?: number; hours?: number; stage?: "curve" | "amm" } = {}): TrainRow[] {
  const r = rng(seed);
  const st = priorModel().stages[o.stage ?? "curve"];
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
  const from = o.from ?? T0;
  const span = (o.hours ?? 48) * HOUR;
  const out: TrainRow[] = [];
  for (let i = 0; i < n; i++) {
    const z = FEATURE_KEYS.map(() => normal());
    const x = FEATURE_KEYS.map((k, j) => (st.mean[k] ?? 0) + (st.std[k] ?? 1) * z[j]!);
    out.push({ ts: from + Math.floor((i / n) * span), stage: o.stage ?? "curve", x, y: r() < pWin(z) ? 1 : 0, mint: `c${seed}-${i}`, kind: "checkpoint" });
  }
  return out;
}

/** Wins when exactly one of two signals is high: no weighted sum of the two can rank that. */
const xor = (z: number[]) => ((z[at("net60")]! > 0) !== (z[at("devSold")]! > 0) ? 0.45 : 0.04);

describe("boosted trees", () => {
  it("learn a combination of signals that a weighted sum cannot", () => {
    const rows = world(14_000, 1, xor);
    const learn = rows.slice(0, 10_000);
    const test = rows.slice(10_000);
    const lin = fitStage(prior().stages.curve, learn);
    expect(evaluate(lin, test).auc).toBeLessThan(0.58);
    const r = trainAndSelect(prior(), rows.slice(0, 10_000), { now: T0 });
    const rep = r.reports.find((x) => x.stage === "curve")!;
    expect(rep.adopted).toBe(true);
    expect(rep.recipe).toBe("trees");
    expect(rep.treeCount).toBeGreaterThan(5);
    expect(evaluate(r.model.stages.curve, test).auc).toBeGreaterThan(0.75);
    expect(r.model.insight?.recipe.curve).toBe("trees");
  });

  it("stop early on noise instead of memorizing it", () => {
    const rows = world(8_000, 2, () => 0.1);
    const mk = (list: TrainRow[]) => {
      const d = FEATURE_KEYS.length;
      const X = new Float32Array(list.length * d);
      list.forEach((row, i) => X.set(row.x as number[], i * d));
      return { n: list.length, d, X, y: Uint8Array.from(list, (x) => x.y), w: new Float32Array(list.length).fill(1), base: new Float64Array(list.length).fill(Math.log(0.1 / 0.9)) };
    };
    const res = runSteps(boostSteps(mk(rows.slice(0, 6_000)), mk(rows.slice(6_000)), FEATURE_KEYS));
    expect(res.ens.trees.length).toBeLessThan(15);
    // and the whole learner keeps the weighted sum alone: trees must beat it by more than luck
    // (one-sided 5% test per coin), so on noise they almost never do
    const picks = [21, 22, 23, 24].map((seed) => trainAndSelect(prior(), world(8_000, seed, () => 0.1), { now: T0 }).reports.find((x) => x.stage === "curve")!);
    expect(picks.filter((x) => x.recipe === "trees").length).toBeLessThanOrEqual(1);
    for (const x of picks) expect(x.treesZ ?? 0).toBeLessThan(3);
  });

  it("explain every tree output exactly: the splits' credits add up to the output", () => {
    const r = trainAndSelect(prior(), world(10_000, 3, xor), { now: T0 });
    const ens = r.model.stages.curve.trees!;
    const probe = world(200, 4, xor);
    const credit = new Float64Array(FEATURE_KEYS.length);
    for (const row of probe) {
      const out = new Float64Array(FEATURE_KEYS.length);
      const bias = ensembleContrib(ens, row.x, out);
      expect(bias + out.reduce((a, b) => a + b, 0)).toBeCloseTo(ensembleMargin(ens, row.x), 9);
      out.forEach((v, j) => (credit[j] += Math.abs(v)));
    }
    // the XOR lives in two inputs: they get the most credit
    const top = [...credit.keys()].sort((a, b) => credit[b]! - credit[a]!).slice(0, 2);
    expect(top.sort()).toEqual([at("net60"), at("devSold")].sort());
    // the score's reasons in points add up to its distance from the weighted sum's bias
    const st = r.model.stages.curve;
    const x = probe[0]!.x;
    const pts = contributionPoints(st, x).reduce((a, b) => a + b, 0);
    const k = (st.calib?.b ?? 1) * pointsPerLogit(st);
    expect(pts / k).toBeCloseTo(rawLogit(st, x) - st.bias - ensembleContrib(ens, x, new Float64Array(FEATURE_KEYS.length)), 6);
  });

  it("survive a save and restart; a damaged or foreign tree file is refused", () => {
    const r = trainAndSelect(prior(), world(10_000, 5, xor), { now: T0 });
    const saved: ModelSpec = JSON.parse(JSON.stringify(r.model));
    expect(validateModel(saved)).toBe(true);
    const probe = world(20, 6, xor);
    for (const row of probe) expect(scoreVector(saved, "curve", row.x).score).toBeCloseTo(scoreVector(r.model, "curve", row.x).score, 9);
    const loop: ModelSpec = JSON.parse(JSON.stringify(saved));
    loop.stages.curve.trees!.trees[0]!.l[0] = 0; // a cycle would hang the scorer
    expect(validateModel(loop)).toBe(false);
    const foreign: ModelSpec = JSON.parse(JSON.stringify(saved));
    foreign.stages.curve.trees!.keys[0] = "notAFeature"; // trained on inputs this build does not have
    expect(validateModel(foreign)).toBe(false);
    expect(validEnsemble({ keys: [], trees: [], gain: {} }, FEATURE_KEYS)).toBe(true);
  });
});

function sample(o: Partial<Sample> & { gridRet?: (tp: number, sl: number) => number }): Sample {
  const ts = o.ts ?? T0;
  return {
    id: "s",
    kind: "checkpoint",
    tag: "age20",
    mint: "m",
    symbol: "M",
    ts,
    stage: "curve",
    score: 50,
    p: 0.1,
    x: FEATURE_KEYS.map(() => 0),
    entryMcap: 30,
    tp: 100,
    sl: 50,
    y: 0,
    ret: -0.5,
    exit: "sl",
    grid: GRID.map((g) => o.gridRet?.(g.tp, g.sl) ?? -g.sl / 100),
    gv: GRID_VERSION,
    maxMult: 1,
    minMult: 0.5,
    secToMax: 0,
    resolvedAt: ts + 600_000,
    ...o,
  };
}

describe("training data", () => {
  it("a win means the same thing whatever take profit and stop loss the bot had when it recorded", () => {
    const target = { tpPct: 100, slPct: 50 };
    const won = (tp: number) => (tp <= 100 ? tp / 100 : -0.3);
    // the same coin path recorded while the bot used 100/50, and while it used 500/20
    const a = sample({ tp: 100, sl: 50, y: 1, ret: 1, gridRet: won });
    const b = sample({ tp: 500, sl: 20, y: 0, ret: -0.2, gridRet: won });
    expect(labelOf(a, target)).toBe(1);
    expect(labelOf(b, target)).toBe(1);
    // older samples without the exit grid count only when they were recorded at the target
    expect(labelOf({ ...b, gv: undefined, grid: [] }, target)).toBeNull();
    expect(labelOf({ ...a, gv: undefined, grid: [] }, target)).toBe(1);
  });

  it("learns from the moments the bot buys, counts one coin moment once, and waits for finished outcomes", () => {
    const target = { tpPct: 100, slPct: 50 };
    const list = [
      sample({ id: "1", mint: "a", ts: T0, kind: "checkpoint", tag: "age45" }),
      sample({ id: "2", mint: "a", ts: T0 + 1_000, kind: "entry", tag: "x75" }), // same moment: several levels crossed at once
      sample({ id: "3", mint: "a", ts: T0 + 9_000, kind: "entry", tag: "x90" }),
      sample({ id: "4", mint: "b", ts: T0 + 1_000, kind: "entry", tag: "x75" }),
      sample({ id: "5", mint: "c", ts: T0 + 2_000, kind: "signal", tag: "sig1" }), // the user's own signals duplicate entries
    ];
    const rows = trainingRows(list, target);
    expect(rows.map((r) => [r.mint, r.kind])).toEqual([
      ["a", "checkpoint"],
      ["b", "entry"],
      ["a", "entry"],
    ]);
    // a moment is used once every outcome of its time has finished (quick crashes finish first)
    const late = sample({ id: "6", mint: "d", ts: T0 + 5 * HOUR, resolvedAt: T0 + 5 * HOUR + 60_000 });
    expect(trainingRows([...list, late], target, { horizonMs: 6 * HOUR }).length).toBe(0);
    expect(trainingRows([...list, late], target, { horizonMs: 4 * HOUR }).map((r) => r.mint)).toEqual(["a", "b", "a"]);
  });
});

describe("choosing a model", () => {
  const edge = (z: number[]) => 1 / (1 + Math.exp(-(-2.6 + 1.2 * z[at("uniq60")]! - 0.9 * z[at("devSold")]! + (z[at("net60")]! > 1 && z[at("bundle")]! > 0.5 ? -2 : 0))));

  it("replaces the current model only after winning on coins neither has seen", () => {
    const day1 = world(9_000, 7, edge, { from: T0, hours: 24 });
    const first = trainAndSelect(prior(), day1, { now: T0 + 24 * HOUR });
    const rep = first.reports.find((r) => r.stage === "curve")!;
    expect(rep.adopted).toBe(true);
    expect(rep.freshRows).toBeGreaterThan(1_000);
    expect(rep.candidate.auc).toBeGreaterThan(rep.current.auc);
    expect(first.model.stages.curve.trainedTo).toBe(day1[day1.length - 1]!.ts);

    // the same data again: nothing it has not seen, so nothing to judge a challenger on
    const again = trainAndSelect(first.model, day1, { now: T0 + 25 * HOUR });
    expect(again.reports.find((r) => r.stage === "curve")!.adopted).toBe(false);
    expect(again.reports.find((r) => r.stage === "curve")!.reason).toMatch(/waiting for newer coins/);
    expect(again.model).toEqual(first.model);

    // a new day arrives: the comparison happens on it alone
    const day2 = world(9_000, 8, edge, { from: T0 + 24 * HOUR, hours: 24 });
    const next = trainAndSelect(first.model, [...day1, ...day2], { now: T0 + 48 * HOUR });
    const rep2 = next.reports.find((r) => r.stage === "curve")!;
    expect(rep2.freshRows).toBeGreaterThan(200);
    expect(rep2.freshRows).toBeLessThanOrEqual(rep2.valRows);
  });

  it("keeps the score's meaning when it learns: the typical coin scores 50, the top 5% of moments 75", () => {
    const rows = world(9_000, 19, edge);
    const m = trainAndSelect(prior(), rows, { now: T0 }).model;
    expect(m.stages.curve.scale).toBeDefined();
    const scores = rows.map((r) => scoreVector(m, "curve", r.x).score).sort((a, b) => a - b);
    expect(scores[Math.floor(scores.length / 2)]!).toBeCloseTo(50, 0);
    const top = scores.filter((x) => x >= 75).length / scores.length;
    expect(top).toBeGreaterThan(0.04);
    expect(top).toBeLessThan(0.06);
    // the ranking and the win chances are the model's own; only where the score sits is anchored
    const a = scoreVector(m, "curve", rows[0]!.x);
    const b = scoreVector({ ...m, stages: { ...m.stages, curve: { ...m.stages.curve, scale: undefined } } }, "curve", rows[0]!.x);
    expect(a.p).toBeCloseTo(b.p, 12);
  });

  it("keeps market cap as the one measure of a coin's size on the bonding curve", () => {
    // wins also depend on curve progress and liquidity: on a real curve those are market cap again
    const sized = (z: number[]) => Math.min(0.9, xor(z) * (z[at("progress")]! + z[at("liquidity")]! > 0 ? 1.5 : 0.7));
    const r = trainAndSelect(prior(), world(10_000, 9, sized), { now: T0 });
    const st = r.model.stages.curve;
    expect(st.trees?.trees.length).toBeGreaterThan(0);
    for (const k of REDUNDANT.curve) expect(st.weights[k]).toBe(0);
    const banned = REDUNDANT.curve.map((k) => st.trees!.keys.indexOf(k));
    for (const t of st.trees!.trees) for (const f of t.f) expect(banned).not.toContain(f);
  });

  it("does not trade a working model for noise", () => {
    const good = trainAndSelect(prior(), world(9_000, 10, edge, { hours: 24 }), { now: T0 });
    // outcomes that no longer follow any signal: whatever is adopted must rank no worse than the current model
    const noise = world(9_000, 11, () => 0.1, { from: T0 + 24 * HOUR, hours: 24 });
    const r = trainAndSelect(good.model, noise, { now: T0 + 48 * HOUR });
    for (const rep of r.reports) if (rep.adopted) expect(rep.candidate.auc).toBeGreaterThanOrEqual(rep.current.auc - 0.005);
  });

  it("learns in slices, so the bot keeps trading while it learns", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    const rows = world(12_000, 12, xor);
    const started = Date.now();
    await trainAndSelectAsync(prior(), rows, { now: T0 });
    clearInterval(timer);
    const took = Date.now() - started;
    // timers ran throughout: at least one every ~50 ms of learning
    expect(ticks).toBeGreaterThan(took / 50);
  });
});

describe("what the bot learned", () => {
  it("checks the model on finished outcomes of coins it has not seen", () => {
    const edge = (z: number[]) => (z[at("uniq60")]! > 0.5 ? 0.4 : 0.05);
    const learned = trainAndSelect(prior(), world(8_000, 13, edge, { hours: 24 }), { now: T0 }).model;
    const later = world(3_000, 14, edge, { from: T0 + 24 * HOUR, hours: 12 });
    const samples = later.map((r, i) =>
      sample({ id: `f${i}`, mint: r.mint!, ts: r.ts, x: r.x as number[], gridRet: (tp, sl) => (r.y ? tp / 100 : -sl / 100) }),
    );
    const [curve, amm] = freshCheck(learned, samples);
    expect(curve!.n).toBe(3_000);
    expect(curve!.verdict).toBe("working");
    expect(curve!.auc).toBeGreaterThan(0.7);
    expect(curve!.topWinRate).toBeGreaterThan(curve!.winRate);
    expect(curve!.bands.reduce((s, b) => s + b.n, 0)).toBe(3_000);
    expect(amm!.verdict).toBe("not_enough");
    // with outcomes that no longer follow the signal, the check says so
    const flipped = samples.map((s) => ({ ...s, grid: s.grid.map((v) => -v) }));
    expect(freshCheck(learned, flipped)[0]!.verdict).toBe("lost");
  });

  it("ranks what moves the score from coin to coin, not what shifts every coin alike", () => {
    const m = prior();
    const st = m.stages.curve;
    for (const k of FEATURE_KEYS) st.weights[k] = 0;
    st.weights.net60 = 1; // more inflow, higher score
    st.weights.serial = -3; // a big weight, but every coin below has the same serial launcher count
    const xs = world(500, 15, () => 0.1).map((r) => {
      const x = [...(r.x as number[])];
      x[at("serial")] = 3;
      return x;
    });
    const d = driversOf(m, "curve", xs);
    expect(d[0]).toMatchObject({ key: "net60", dir: "up" });
    expect(d.find((x) => x.key === "serial")).toBeUndefined();
    expect(d[0]!.share).toBeCloseTo(1, 5);
  });

  it("tells the phone what it learned", () => {
    const r = trainAndSelect(prior(), world(10_000, 16, xor), { now: T0 });
    const run = learnRunOf(r.reports, { at: T0, trigger: "manual", version: r.model.version, rows: 10_000, ms: 1_000 });
    const msg = learningMessage(
      {
        model: { version: r.model.version, source: r.model.source, createdAt: T0, target: r.model.target, recipe: { curve: "trees", amm: "prior" }, trees: { curve: 30 }, rows: {}, training: null },
        drivers: { curve: driversOf(r.model, "curve", world(300, 17, xor).map((x) => x.x)) },
        driverCoins: { curve: 300 },
        fresh: [],
        history: [run],
        status: { running: false, lastRun: T0, nextRun: T0 + HOUR, lastError: "", everyHours: 6 },
      },
      T0 + 60_000,
    );
    expect(msg).toContain("What the score learned");
    expect(msg).toContain("weighted sum + 30 trees");
    expect(msg).toMatch(/Last learning run 1 min ago: switched to a better score/);
  });

  it("scores a live coin with the trees exactly as it scores the stored vector", () => {
    const r = trainAndSelect(prior(), world(10_000, 18, xor), { now: T0 });
    const f = {
      stage: "curve" as const, ageSec: 40, mcapSol: 45, progress: 0.2, net60: 3, net300: 5, netPrev60: 1, buys60: 12, sells60: 3, uniq60: 9, uniqTotal: 30, trades60: 15,
      avgBuy300: 0.4, whale300: 0.2, devShare: 0.02, devSold: 0.8, bundleShare: 0.01, earlyShare: 0.05, top10: 0.3, top1: 0.05, holders: 25, drawdown: 0.1, chg30: 0.1,
      chg120: 0.3, smartBuyers: 0, freshShare: 0.3, socials: 1, tweetLink: 0, clusterSize: 1, isLeader: 0, isFirst: 0, creatorLaunches24h: 1, creatorBest: 0, heat: 0,
      hourUtc: 14, sinceMigrateSec: 0, liquiditySol: 12, dexSignal: 0,
    };
    const live = scoreToken(r.model, f, true);
    expect(live.score).toBeCloseTo(scoreVector(r.model, "curve", featureVector(f)).score, 9);
    expect(live.contributions.map((c) => c.key)).toContain("devSold");
  });
});
