/**
 * Pipeline self-test: proves the research machinery is honest before anyone trusts it
 * with real data.
 *
 *  Positive control — a simulated world where early behaviour DOES reveal a coin's
 *  future: the learner (the same one the server runs) must find it and adopt a model that
 *  ranks coins well (AUC well above 0.5) and whose top-scored moments outperform, on coins
 *  it never trained on.
 *
 *  Negative control — the same moments with outcomes shuffled (any pattern is now pure
 *  luck): the learner must find nothing (AUC ≈ 0.5 on unseen coins) and the go-live gate
 *  must refuse.
 */
import { Engine } from "../core/engine.js";
import { evaluate, labelOf, trainAndSelect, trainingRows, type TrainRow } from "../core/learn.js";
import { type ModelSpec, priorModel, scoreVector } from "../core/model.js";
import { GRID, type Sample } from "../core/outcomes.js";
import { buildReport } from "../core/report.js";
import { DEFAULT_SETTINGS } from "../core/settings.js";
import { rng } from "../core/util.js";
import { MarketSim } from "../sim/market.js";

export interface SelfTestResult {
  samples: number;
  positive: { priorAuc: number; trainedAuc: number; recipe: string; trees: number; topDecileRet: number; bottomHalfRet: number };
  negative: { trainedAuc: number; gatePass: boolean; gateVerdict: string };
  passed: boolean;
  notes: string[];
}

export function collectSamples(hours: number, predictability: number, seed: number): Sample[] {
  const sim = new MarketSim({ durationMs: hours * 3_600_000, seed, predictability, launchesPerMin: 6 });
  const samples: Sample[] = [];
  const e = new Engine({
    now: sim.opts.startTs,
    settings: { enabled: false },
    config: { outcomeHorizonMs: 90 * 60_000, seed },
    hooks: { onSample: (s) => samples.push(s) },
  });
  let last = 0;
  let end = sim.opts.startTs;
  for (const ev of sim.run()) {
    e.ingest(ev);
    end = ev.ts;
    if (ev.ts - last >= 500) {
      e.advance(ev.ts);
      last = ev.ts;
    }
  }
  for (let t = end; t <= end + 95 * 60_000; t += 5_000) e.advance(t);
  return samples;
}

/** Coins in order of first appearance: the older share to learn from, the rest to test on. */
function splitByCoin(samples: Sample[], share: number): { learn: Sample[]; test: Sample[] } {
  const first = new Map<string, number>();
  for (const s of samples) if (!first.has(s.mint) || s.ts < first.get(s.mint)!) first.set(s.mint, s.ts);
  const coins = [...first.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  const testCoins = new Set(coins.slice(Math.floor(coins.length * share)));
  return { learn: samples.filter((s) => !testCoins.has(s.mint)), test: samples.filter((s) => testCoins.has(s.mint)) };
}

export async function pipelineSelfTest(opts: { hours?: number; seed?: number; log?: (m: string) => void } = {}): Promise<SelfTestResult> {
  const log = opts.log ?? (() => {});
  const hours = opts.hours ?? 4;
  const notes: string[] = [];
  log(`simulating ${hours}h of an "edge" world…`);
  const samples = collectSamples(hours, 0.9, opts.seed ?? 5).filter((s) => s.stage === "curve");
  const prior: ModelSpec = { ...priorModel(0), scaledAt: 1 };
  const target = prior.target;
  const { learn, test } = splitByCoin(samples, 0.7);
  const learnRows = trainingRows(learn, target);
  const testRows = trainingRows(test, target);
  const trained = trainAndSelect(prior, learnRows, { now: 1 });
  const rep = trained.reports.find((r) => r.stage === "curve")!;
  const priorAuc = evaluate(prior.stages.curve, testRows).auc;
  const trainedAuc = evaluate(trained.model.stages.curve, testRows).auc;
  // what the score's top picks earned: every moment of the test coins, at the model's target exit
  const gi = GRID.findIndex((g) => g.tp === target.tpPct && g.sl === target.slPct);
  const moments = test.filter((s) => s.kind !== "signal" && labelOf(s, target) !== null);
  const preds = moments.map((s) => scoreVector(trained.model, "curve", s.x).p);
  const order = preds.map((_, i) => i).sort((a, b) => preds[b]! - preds[a]!);
  const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  const retOf = (i: number) => moments[i]!.grid[gi]!;
  const top = order.slice(0, Math.max(1, Math.floor(order.length / 10))).map(retOf);
  const bottom = order.slice(Math.floor(order.length / 2)).map(retOf);
  log(`positive control: ${rep.adopted ? "adopted" : "did NOT adopt"} ${rep.recipe === "trees" ? `weighted sum + ${rep.treeCount} trees` : "weighted sum"}; AUC on unseen coins ${priorAuc.toFixed(3)} (prior) → ${trainedAuc.toFixed(3)}`);

  // negative control: shuffle outcomes across moments — nothing real is left to learn
  const r = rng(99);
  const shuffle = (rows: TrainRow[]) => {
    const ys = rows.map((x) => x.y);
    for (let i = ys.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [ys[i], ys[j]] = [ys[j]!, ys[i]!];
    }
    return rows.map((x, i) => ({ ...x, y: ys[i]! }));
  };
  const nLearn = shuffle(learnRows);
  const nTest = shuffle(testRows);
  const noise = trainAndSelect(prior, nLearn, { now: 2 });
  const nAuc = evaluate(noise.model.stages.curve, nTest).auc;
  // the go-live gate on the noise model's own signals: every moment re-scored, outcomes shuffled
  const perm = moments.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  const rescored = moments.map((s, i) => {
    const o = moments[perm[i]!]!;
    return { ...s, kind: "signal" as const, y: o.y, ret: o.ret, grid: o.grid, score: scoreVector(noise.model, "curve", s.x).score };
  });
  const report = buildReport(rescored, { ...DEFAULT_SETTINGS, minScore: 60 }, priorModel(), [], Date.now());
  log(`negative control: AUC on unseen coins ${nAuc.toFixed(3)}; gate: ${report.gate.verdict}`);

  const passed = rep.adopted && trainedAuc > 0.62 && trainedAuc >= priorAuc - 0.02 && avg(top) > avg(bottom) && Math.abs(nAuc - 0.5) < 0.06 && !report.gate.pass;
  if (!passed) notes.push("self-test did not meet all criteria — inspect the numbers above");
  return {
    samples: samples.length,
    positive: { priorAuc, trainedAuc, recipe: rep.recipe ?? "none", trees: rep.treeCount ?? 0, topDecileRet: avg(top), bottomHalfRet: avg(bottom) },
    negative: { trainedAuc: nAuc, gatePass: report.gate.pass, gateVerdict: report.gate.verdict },
    passed,
    notes,
  };
}
