/**
 * Pipeline self-test: proves the research machinery is honest before anyone trusts it
 * with real data.
 *
 *  Positive control — a simulated world where early behaviour DOES reveal a coin's
 *  future: the learner must find it (validation AUC well above 0.5, top-scored coins
 *  outperform) on data it never trained on.
 *
 *  Negative control — the same samples with outcomes shuffled (any pattern is now pure
 *  luck): the learner must find nothing (AUC ≈ 0.5) and the go-live gate must refuse.
 */
import { Engine } from "../core/engine.js";
import { auc, evaluate, fitStage, type TrainRow } from "../core/learn.js";
import { priorModel } from "../core/model.js";
import type { Sample } from "../core/outcomes.js";
import { buildReport } from "../core/report.js";
import { rng } from "../core/util.js";
import { MarketSim } from "../sim/market.js";
import { linear, standardize } from "../core/model.js";
import { DEFAULT_SETTINGS } from "../core/settings.js";

export interface SelfTestResult {
  samples: number;
  positive: { priorAuc: number; trainedAuc: number; topDecileRet: number; bottomHalfRet: number };
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

function rowsOf(samples: Sample[]): TrainRow[] {
  return samples.filter((s) => s.kind === "checkpoint" && s.stage === "curve").map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
}

export async function pipelineSelfTest(opts: { hours?: number; seed?: number; log?: (m: string) => void } = {}): Promise<SelfTestResult> {
  const log = opts.log ?? (() => {});
  const hours = opts.hours ?? 4;
  const notes: string[] = [];
  log(`simulating ${hours}h of an "edge" world…`);
  const samples = collectSamples(hours, 0.9, opts.seed ?? 5).filter((s) => s.stage === "curve");
  const cps = samples.filter((s) => s.kind === "checkpoint").sort((a, b) => a.ts - b.ts);
  const cut = Math.floor(cps.length * 0.7);
  const train = rowsOf(cps.slice(0, cut));
  const test = cps.slice(cut);
  const testRows = rowsOf(test);
  const prior = priorModel().stages.curve;
  const priorAuc = evaluate(prior, testRows).auc;
  const trained = fitStage(prior, train);
  const trainedAuc = evaluate(trained, testRows).auc;
  const preds = test.map((s) => linear(trained, standardize(trained, s.x)));
  const order = preds.map((p, i) => i).sort((a, b) => preds[b]! - preds[a]!);
  const top = order.slice(0, Math.max(1, Math.floor(order.length / 10))).map((i) => test[i]!.ret);
  const bottom = order.slice(Math.floor(order.length / 2)).map((i) => test[i]!.ret);
  const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  log(`positive control: prior AUC ${priorAuc.toFixed(3)}, trained AUC ${trainedAuc.toFixed(3)} on unseen data`);

  // negative control: shuffle outcomes across samples
  const r = rng(99);
  const shuffled = cps.map((s) => ({ ...s }));
  const outcomes = shuffled.map((s) => ({ y: s.y, ret: s.ret, grid: s.grid }));
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j]!, outcomes[i]!];
  }
  shuffled.forEach((s, i) => Object.assign(s, outcomes[i]));
  const nTrain = rowsOf(shuffled.slice(0, cut));
  const nTest = rowsOf(shuffled.slice(cut));
  const nTrained = fitStage(prior, nTrain);
  const nAuc = evaluate(nTrained, nTest).auc;
  // re-score shuffled test samples with the shuffled-trained model and ask the gate
  const rescored = shuffled.slice(cut).map((s) => ({ ...s, kind: "signal" as const, score: 50 + (linear(nTrained, standardize(nTrained, s.x)) - Math.log(nTrained.pRef / (1 - nTrained.pRef))) * 18.03 }));
  const report = buildReport(rescored, { ...DEFAULT_SETTINGS, minScore: 60 }, priorModel(), [], Date.now());
  log(`negative control: trained AUC ${nAuc.toFixed(3)}; gate: ${report.gate.verdict}`);

  const passed = trainedAuc > 0.62 && trainedAuc >= priorAuc - 0.02 && avg(top) > avg(bottom) && Math.abs(nAuc - 0.5) < 0.06 && !report.gate.pass;
  if (!passed) notes.push("self-test did not meet all criteria — inspect the numbers above");
  void auc;
  return {
    samples: samples.length,
    positive: { priorAuc, trainedAuc, topDecileRet: avg(top), bottomHalfRet: avg(bottom) },
    negative: { trainedAuc: nAuc, gatePass: report.gate.pass, gateVerdict: report.gate.verdict },
    passed,
    notes,
  };
}
