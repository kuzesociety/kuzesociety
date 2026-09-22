/**
 * Scoring model.
 *
 * A per-stage logistic model predicts P(win) — the chance a position opened now hits
 * the target (default +100% net) before the stop (default −50% net). The SCORE is a
 * fixed log-odds scale, like a credit score:
 *
 *     score = 50 + 12.5 · log2( odds(p) / odds(pRef) )
 *
 * 50 = an average eligible token, +12.5 points = double the odds, 75 = 4× the odds,
 * 100 = 16× the odds. The scale does not drift with the market, so "75+" means the
 * same thing every day; how often tokens reach it does change with market heat.
 *
 * The shipped weights are a PRIOR built from pump.fun mechanics and known manipulation
 * patterns (bundles, dev dumps, serial launchers, wash volume). The engine re-fits them
 * on its own recorded outcomes (see learn.ts) and only swaps models when the new one
 * wins out-of-sample.
 */
import { FEATURE_DEFS, FEATURE_KEYS, featureVector, type RawFeatures } from "./features.js";
import { clamp, logit, sigmoid } from "./util.js";

export type StageKey = "curve" | "amm";

export interface StageModel {
  /** reference win probability of an average eligible token */
  pRef: number;
  bias: number;
  weights: Record<string, number>;
  mean: Record<string, number>;
  std: Record<string, number>;
  /** optional Platt calibration applied to the raw logit: p = σ(a + b·z) */
  calib?: { a: number; b: number };
}

export interface ModelSpec {
  version: string;
  createdAt: number;
  source: "prior" | "trained";
  /** when a prior was last re-scaled to the live market (entries wait for this) */
  scaledAt?: number;
  /** what "win" means for this model */
  target: { tpPct: number; slPct: number; horizonMin: number };
  stages: Record<StageKey, StageModel>;
  training?: {
    rows: number;
    positives: number;
    from: number;
    to: number;
    valAuc?: number;
    valLogLoss?: number;
    priorValAuc?: number;
    priorValLogLoss?: number;
  };
}

const PRIOR_MEAN: Record<string, number> = {
  age: 4.5, mcap: 3.6, progress: 0.08, net60: 0.3, net300: 0.6, accel: 0, buyRatio: 0.55, uniq60: 1.0, uniqTotal: 2.2,
  trades60: 1.3, avgBuy: -1.0, whale: 0.35, devShare: 0.04, devSold: 0.3, bundle: 0.05, early: 0.08, top10: 0.25,
  holders: 2.2, drawdown: 0.25, chg30: 0, chg120: 0, smart: 0.05, fresh: 0.3, socials: 0.35, tweet: 0.1, cluster: 0.3,
  leader: 0.1, copycat: 0.15, serial: 0.2, creatorBest: 0.1, heat: 0, hourSin: 0, hourCos: 0, liquidity: 3.5, sinceMig: 1,
  dex: 0.1,
};
const PRIOR_STD: Record<string, number> = {
  age: 1.2, mcap: 0.5, progress: 0.15, net60: 1.0, net300: 1.3, accel: 1, buyRatio: 0.2, uniq60: 1.0, uniqTotal: 1.2,
  trades60: 1.1, avgBuy: 1.0, whale: 0.25, devShare: 0.05, devSold: 0.4, bundle: 0.1, early: 0.1, top10: 0.12,
  holders: 1.1, drawdown: 0.25, chg30: 0.15, chg120: 0.3, smart: 0.3, fresh: 0.25, socials: 0.35, tweet: 0.3,
  cluster: 0.6, leader: 0.3, copycat: 0.35, serial: 0.5, creatorBest: 0.3, heat: 1, hourSin: 0.7, hourCos: 0.7,
  liquidity: 1.0, sinceMig: 2.5, dex: 0.3,
};

const CURVE_W: Record<string, number> = {
  age: -0.35, mcap: -0.15, progress: 0.05, net60: 0.45, net300: 0.25, accel: 0.2, buyRatio: 0.3, uniq60: 0.45,
  uniqTotal: 0.3, trades60: 0.1, avgBuy: -0.1, whale: -0.2, devShare: -0.35, devSold: -0.55, bundle: -0.45,
  early: -0.3, top10: -0.45, holders: 0.2, drawdown: -0.4, chg30: 0.15, chg120: 0.15, smart: 0.5, fresh: -0.3,
  socials: 0.15, tweet: 0.1, cluster: 0.1, leader: 0.2, copycat: -0.25, serial: -0.4, creatorBest: 0.1, heat: 0.15,
  hourSin: 0, hourCos: 0, liquidity: 0, sinceMig: 0, dex: 0.1,
};

const AMM_W: Record<string, number> = {
  ...CURVE_W,
  age: -0.2, mcap: -0.2, progress: 0, bundle: -0.2, early: -0.15, devSold: -0.3, liquidity: 0.2, sinceMig: -0.25,
  dex: 0.25, holders: 0.3,
};

export function priorModel(now = 0): ModelSpec {
  const soften = (w: Record<string, number>) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * 0.5]));
  const mk = (weights: Record<string, number>, pRef: number): StageModel => ({
    pRef,
    bias: logit(pRef),
    weights: soften(weights),
    mean: { ...PRIOR_MEAN },
    std: { ...PRIOR_STD },
  });
  return {
    version: "prior-2.0",
    createdAt: now,
    source: "prior",
    target: { tpPct: 100, slPct: 50, horizonMin: 360 },
    stages: { curve: mk(CURVE_W, 0.12), amm: { ...mk(AMM_W, 0.15), mean: { ...PRIOR_MEAN, liquidity: 4.6, sinceMig: 6, age: 7 } } },
  };
}

export interface Contribution {
  key: string;
  label: string;
  value: string;
  /** contribution to the score in points (positive helps) */
  points: number;
  note: string;
}

export interface ScoreResult {
  score: number;
  /** model probability of hitting target before stop */
  p: number;
  /** true when p comes from a model calibrated on recorded outcomes */
  calibrated: boolean;
  stage: StageKey;
  contributions: Contribution[];
}

const POINTS_PER_LOGIT = 12.5 / Math.LN2;

export function standardize(stage: StageModel, x: number[]): number[] {
  const z = new Array<number>(x.length);
  for (let i = 0; i < x.length; i++) {
    const k = FEATURE_KEYS[i]!;
    const sd = stage.std[k] ?? 1;
    z[i] = clamp((x[i]! - (stage.mean[k] ?? 0)) / (sd > 1e-9 ? sd : 1), -5, 5);
  }
  return z;
}

export function linear(stage: StageModel, z: number[]): number {
  let s = stage.bias;
  for (let i = 0; i < z.length; i++) s += (stage.weights[FEATURE_KEYS[i]!] ?? 0) * z[i]!;
  return s;
}

export function scoreFromLogit(stage: StageModel, zLogit: number): number {
  return clamp(50 + (zLogit - logit(stage.pRef)) * POINTS_PER_LOGIT, 0, 100);
}

export function scoreToken(model: ModelSpec, f: RawFeatures, explain = true): ScoreResult {
  const stageKey: StageKey = f.stage;
  const stage = model.stages[stageKey];
  const x = featureVector(f);
  const z = standardize(stage, x);
  const lin = linear(stage, z);
  const pLogit = stage.calib ? stage.calib.a + stage.calib.b * lin : lin;
  const p = sigmoid(pLogit);
  const score = scoreFromLogit(stage, pLogit);
  let contributions: Contribution[] = [];
  if (explain) {
    for (let i = 0; i < FEATURE_DEFS.length; i++) {
      const d = FEATURE_DEFS[i]!;
      const w = stage.weights[d.key] ?? 0;
      if (w === 0) continue;
      const pts = w * z[i]! * POINTS_PER_LOGIT;
      if (Math.abs(pts) < 0.5) continue;
      contributions.push({ key: d.key, label: d.label, value: d.show(f), points: pts, note: pts > 0 ? d.good : d.bad });
    }
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    contributions = contributions.slice(0, 10);
  }
  return { score, p, calibrated: !!stage.calib && model.source === "trained", stage: stageKey, contributions };
}

/** Break-even win probability for a TP/SL pair after round-trip costs (fractions). */
export function breakEvenP(tpPct: number, slPct: number, roundTripCost = 0.035, slSlippage = 0.1): number {
  const win = tpPct / 100 - roundTripCost;
  const loss = slPct / 100 + roundTripCost + slSlippage;
  return loss / (win + loss);
}

export function validateModel(m: unknown): m is ModelSpec {
  if (!m || typeof m !== "object") return false;
  const s = (m as ModelSpec).stages;
  if (!s || !s.curve || !s.amm) return false;
  for (const st of [s.curve, s.amm]) {
    if (typeof st.bias !== "number" || !Number.isFinite(st.bias)) return false;
    if (typeof st.pRef !== "number" || !(st.pRef > 0 && st.pRef < 1)) return false;
    for (const k of FEATURE_KEYS) {
      const w = st.weights[k] ?? 0;
      if (!Number.isFinite(w) || Math.abs(w) > 20) return false;
      if (!Number.isFinite(st.mean[k] ?? 0) || !Number.isFinite(st.std[k] ?? 1)) return false;
    }
  }
  return true;
}
