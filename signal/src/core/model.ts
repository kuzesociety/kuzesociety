/**
 * Scoring model.
 *
 * A per-stage model predicts P(win) — the chance that a position opened now, sold at the
 * target (default +100% net) or the stop (default −50% net), ends in profit. It is a
 * weighted sum of the inputs (logistic), plus, once the data supports them, small boosted
 * trees that learn combinations of inputs (boost.ts). The SCORE ranks coins on a fixed
 * log-odds scale:
 *
 *     prior:    score = 50 + 12.5 · log2( odds(p) / odds(pRef) ), scaled so the average coin
 *               moment scores 50 and about 5% of moments reach 75
 *     trained:  the same kind of straight line in log-odds, anchored when the model is trained
 *               so the median coin moment scores 50 and the top 5% of moments 75 (see
 *               StageModel.scale)
 *
 * So "75" keeps meaning roughly "the top 5% of coin moments" when a sharper model replaces a
 * duller one: the bot becomes pickier within the same share of coins, rather than letting
 * more of them past the user's minimum. How often coins reach it still changes with market
 * heat between trainings. p (the win chance) is shown next to the score.
 *
 * The shipped weights are a PRIOR built from pump.fun mechanics and known manipulation
 * patterns (bundles, dev dumps, serial launchers, wash volume). The engine re-fits them
 * on its own recorded outcomes (see learn.ts) and only swaps models when the new one
 * wins out-of-sample.
 */
import { type TreeEnsemble, ensembleContrib, ensembleMargin, validEnsemble } from "./boost.js";
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
  /**
   * optional boosted trees added to the linear logit (see boost.ts): they learn combinations
   * of signals and thresholds that a weighted sum cannot
   */
  trees?: TreeEnsemble;
  /** time of the newest row this stage was fitted on (only newer rows are unseen by it) */
  trainedTo?: number;
  /**
   * Where a trained stage puts the score, in calibrated logits: the typical coin moment (the
   * median) scores 50 and the top 5% of moments 75 — the spread the prior is scaled to. A score
   * then says how a coin ranks, and a sharper model makes the bot pickier within the same share
   * of coins instead of letting more of them past the user's minimum. Without it (the prior,
   * models trained before), the odds scale below applies.
   */
  scale?: { at50: number; at75: number };
}

/** How a model was built, per stage: the shipped prior, a refitted weighted sum, or that plus trees. */
export type Recipe = "prior" | "linear" | "trees";

/** One input's part in the score, measured on recent coins. */
export interface Driver {
  key: string;
  label: string;
  /** how far this input moves the score from one coin to the next: average points from its average part */
  points: number;
  /** up: more of it raises the score · down: lowers it · mixed: depends on the other inputs */
  dir: "up" | "down" | "mixed";
  /** share of all inputs' movement, and the same share for the starting (prior) model on the same coins */
  share: number;
  priorShare?: number;
}

/** How the learner built each stage, kept with the model for the dashboard. */
export interface ModelInsight {
  recipe: Partial<Record<StageKey, Recipe>>;
  /** trees per stage (0 = the weighted sum alone) */
  trees: Partial<Record<StageKey, number>>;
  /** rows each stage was trained on, and how many were the moments a bot would buy */
  rows: Partial<Record<StageKey, { total: number; entries: number }>>;
  /** when adopted: how often a winner outscored a loser among newer coins it had not seen */
  auc?: Partial<Record<StageKey, number>>;
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
  insight?: ModelInsight;
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

/**
 * The prior fitted to the market it watches, without any outcomes: feature means and spreads
 * from a population of feature vectors (blended with the shipped ones while few are in), and
 * one temperature on all weights so scores spread ~16 points around 50 (≈5% of scored coins
 * reach 75), centred so the average coin lands at 50. See Engine.normalizePrior.
 */
export function scalePrior(base: StageModel, rows: ArrayLike<number>[]): Pick<StageModel, "mean" | "std" | "weights" | "bias"> {
  const n = rows.length;
  const blend = n / (n + 600);
  const mean: Record<string, number> = {};
  const std: Record<string, number> = {};
  FEATURE_KEYS.forEach((k, j) => {
    let m = 0;
    for (const r of rows) m += r[j]!;
    m /= n;
    let v = 0;
    for (const r of rows) v += (r[j]! - m) ** 2;
    const sd = Math.sqrt(v / Math.max(1, n - 1));
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean[k] = (1 - blend) * pm + blend * m;
    // never let a rare feature's tiny spread blow its z-scores up
    std[k] = Math.max((1 - blend) * ps + blend * sd, 0.5 * ps, 1e-6);
  });
  // spread of the linear predictor under the base weights
  const lin: number[] = [];
  for (const r of rows) {
    let s2 = 0;
    FEATURE_KEYS.forEach((k, j) => {
      s2 += (base.weights[k] ?? 0) * clamp((r[j]! - mean[k]!) / std[k]!, -5, 5);
    });
    lin.push(s2);
  }
  const lm = lin.reduce((a, b) => a + b, 0) / lin.length;
  const lsd = Math.sqrt(lin.reduce((a, b) => a + (b - lm) ** 2, 0) / Math.max(1, lin.length - 1));
  const k = lsd > 1e-6 ? clamp(0.85 / lsd, 0.15, 3) : 1;
  const weights: Record<string, number> = {};
  for (const key of FEATURE_KEYS) weights[key] = (base.weights[key] ?? 0) * k;
  // centre: the average scored coin lands at 50
  return { mean, std, weights, bias: base.bias - lm * k };
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

export function standardize(stage: StageModel, x: ArrayLike<number>): number[] {
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
  const sc = stage.scale;
  if (sc) return clamp(50 + (25 * (zLogit - sc.at50)) / (sc.at75 - sc.at50), 0, 100);
  return clamp(50 + (zLogit - logit(stage.pRef)) * POINTS_PER_LOGIT, 0, 100);
}

/** Score points per unit of calibrated logit. */
export function pointsPerLogit(stage: StageModel): number {
  return stage.scale ? 25 / (stage.scale.at75 - stage.scale.at50) : POINTS_PER_LOGIT;
}

/** Where each of an ensemble's feature keys sits in this build's feature vector. */
const keyMaps = new WeakMap<TreeEnsemble, Int32Array>();
export function treeMap(ens: TreeEnsemble): Int32Array {
  let m = keyMaps.get(ens);
  if (!m) {
    m = Int32Array.from(ens.keys, (k) => FEATURE_KEYS.indexOf(k));
    keyMaps.set(ens, m);
  }
  return m;
}

/** Uncalibrated logit of a feature vector: the weighted sum plus the trees. */
export function rawLogit(stage: StageModel, x: ArrayLike<number>): number {
  const lin = linear(stage, standardize(stage, x));
  return stage.trees?.trees.length ? lin + ensembleMargin(stage.trees, x, treeMap(stage.trees)) : lin;
}

/** Calibrated logit of a feature vector (what the score and p come from). */
export function stageLogit(stage: StageModel, x: ArrayLike<number>): number {
  const raw = rawLogit(stage, x);
  return stage.calib ? stage.calib.a + stage.calib.b * raw : raw;
}

/**
 * Each input's share of the score for one feature vector, in points (positive helps): the
 * weighted sum's terms plus the trees' splits credited to the feature they split on.
 */
export function contributionPoints(stage: StageModel, x: ArrayLike<number>, z = standardize(stage, x)): Float64Array {
  const out = new Float64Array(FEATURE_KEYS.length);
  for (let i = 0; i < out.length; i++) out[i] = (stage.weights[FEATURE_KEYS[i]!] ?? 0) * z[i]!;
  if (stage.trees?.trees.length) ensembleContrib(stage.trees, x, out, treeMap(stage.trees));
  const k = (stage.calib?.b ?? 1) * pointsPerLogit(stage);
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}

export function scoreToken(model: ModelSpec, f: RawFeatures, explain = true): ScoreResult {
  const stageKey: StageKey = f.stage;
  const stage = model.stages[stageKey];
  const x = featureVector(f);
  const z = standardize(stage, x);
  let raw = linear(stage, z);
  if (stage.trees?.trees.length) raw += ensembleMargin(stage.trees, x, treeMap(stage.trees));
  const pLogit = stage.calib ? stage.calib.a + stage.calib.b * raw : raw;
  const p = sigmoid(pLogit);
  const score = scoreFromLogit(stage, pLogit);
  let contributions: Contribution[] = [];
  if (explain) {
    const pts = contributionPoints(stage, x, z);
    for (let i = 0; i < FEATURE_DEFS.length; i++) {
      const d = FEATURE_DEFS[i]!;
      const v = pts[i]!;
      if (Math.abs(v) < 0.5) continue;
      contributions.push({ key: d.key, label: d.label, value: d.show(f), points: v, note: v > 0 ? d.good : d.bad });
    }
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    contributions = contributions.slice(0, 10);
  }
  return { score, p, calibrated: !!stage.calib && model.source === "trained", stage: stageKey, contributions };
}

/** Score and probability of a stored feature vector (samples keep theirs), for checks on past coins. */
export function scoreVector(model: ModelSpec, stage: StageKey, x: ArrayLike<number>): { score: number; p: number } {
  const st = model.stages[stage];
  const l = stageLogit(st, x);
  return { score: scoreFromLogit(st, l), p: sigmoid(l) };
}

/**
 * Win rate needed to break even. TP and SL are measured on the net position value (buy costs
 * in, sell costs out), so fees are already inside them; the extra is the stop's fill landing
 * below the line in a fast dump (`slSlippage`, as a fraction of the stake).
 */
export function breakEvenP(tpPct: number, slPct: number, slSlippage = 0.1): number {
  const win = tpPct / 100;
  const loss = slPct / 100 + slSlippage;
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
    if (st.calib && !(Number.isFinite(st.calib.a) && Number.isFinite(st.calib.b))) return false;
    if (st.scale && !(Number.isFinite(st.scale.at50) && Number.isFinite(st.scale.at75) && st.scale.at75 - st.scale.at50 > 1e-3)) return false;
    // trees from a build with other inputs cannot be read: the model is refused (the prior takes over)
    if (st.trees !== undefined && !validEnsemble(st.trees, FEATURE_KEYS)) return false;
  }
  return true;
}
