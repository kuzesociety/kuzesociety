/**
 * Learning: fit the scoring model on recorded outcomes, validate it out-of-sample
 * (walk-forward: train on the past, test on what came after) and decide whether it
 * should replace the current model. Pure TypeScript, no dependencies.
 */
import { FEATURE_KEYS } from "./features.js";
import { type ModelSpec, type StageKey, type StageModel, linear, standardize } from "./model.js";
import { clamp, logit, sigmoid } from "./util.js";

export interface TrainRow {
  ts: number;
  stage: StageKey;
  /** transformed (not standardized) feature vector, FEATURE_KEYS order */
  x: number[];
  y: 0 | 1;
  w?: number;
}

export interface Metrics {
  n: number;
  positives: number;
  auc: number;
  logLoss: number;
  brier: number;
  baseRate: number;
}

export function auc(scores: number[], labels: number[]): number {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a]! - scores[b]!);
  let rankSum = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]!] === scores[idx[i]!]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]!] === 1) {
      rankSum += avgRank;
      nPos++;
    }
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export function evaluate(stage: StageModel, rows: TrainRow[]): Metrics {
  const ps: number[] = [];
  const ys: number[] = [];
  let ll = 0;
  let br = 0;
  let pos = 0;
  for (const r of rows) {
    const lin = linear(stage, standardize(stage, r.x));
    const p = clamp(sigmoid(stage.calib ? stage.calib.a + stage.calib.b * lin : lin), 1e-6, 1 - 1e-6);
    ps.push(p);
    ys.push(r.y);
    ll += -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    br += (p - r.y) ** 2;
    pos += r.y;
  }
  const n = rows.length;
  return { n, positives: pos, auc: auc(ps, ys), logLoss: n ? ll / n : NaN, brier: n ? br / n : NaN, baseRate: n ? pos / n : NaN };
}

/** Solve A x = b for symmetric positive-definite A (Cholesky). Returns null if not SPD. */
export function choleskySolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i]![i] = Math.sqrt(s);
      } else L[i]![j] = s / L[j]![j]!;
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i]![k]! * y[k]!;
    y[i] = s / L[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k]![i]! * x[k]!;
    x[i] = s / L[i]![i]!;
  }
  return x;
}

/**
 * MAP logistic regression: L2 penalty pulls weights toward `prior` (Bayesian shrinkage),
 * so few rows ≈ prior, many rows ≈ data. Newton–Raphson with step halving.
 * Inputs Z are standardized; column 0 of the returned vector is the bias.
 */
export function fitLogistic(
  Z: number[][],
  y: number[],
  w: number[],
  prior: number[],
  lambda: number,
  maxIter = 30,
): { beta: number[]; converged: boolean } {
  const d = prior.length; // includes bias at 0
  let beta = prior.slice();
  const objective = (b: number[]) => {
    let f = 0;
    for (let i = 0; i < Z.length; i++) {
      let s = b[0]!;
      const z = Z[i]!;
      for (let j = 1; j < d; j++) s += b[j]! * z[j - 1]!;
      const p = clamp(sigmoid(s), 1e-9, 1 - 1e-9);
      f -= w[i]! * (y[i]! * Math.log(p) + (1 - y[i]!) * Math.log(1 - p));
    }
    for (let j = 1; j < d; j++) f += 0.5 * lambda * (b[j]! - prior[j]!) ** 2;
    f += 0.5 * 1e-4 * (b[0]! - prior[0]!) ** 2;
    return f;
  };
  let fPrev = objective(beta);
  let converged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    const g = new Array<number>(d).fill(0);
    const H = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i]!;
      let s = beta[0]!;
      for (let j = 1; j < d; j++) s += beta[j]! * z[j - 1]!;
      const p = sigmoid(s);
      const r = w[i]! * (p - y[i]!);
      const v = w[i]! * Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H[0]![0] += v;
      for (let j = 1; j < d; j++) {
        const zj = z[j - 1]!;
        g[j] += r * zj;
        H[0]![j] += v * zj;
        for (let k = 1; k <= j; k++) H[j]![k] += v * zj * z[k - 1]!;
      }
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * (beta[j]! - prior[j]!);
      H[j]![j] += lambda;
      H[j]![0] = H[0]![j]!;
      for (let k = 1; k < j; k++) H[k]![j] = H[j]![k]!;
    }
    g[0] += 1e-4 * (beta[0]! - prior[0]!);
    H[0]![0] += 1e-4;
    const step = choleskySolve(H, g);
    if (!step) break;
    let t = 1;
    let next = beta;
    let fNext = fPrev;
    for (let h = 0; h < 20; h++) {
      next = beta.map((b, j) => b - t * step[j]!);
      fNext = objective(next);
      if (fNext <= fPrev + 1e-12) break;
      t /= 2;
    }
    const moved = Math.max(...step.map((s) => Math.abs(s * t)));
    beta = next;
    const improvement = fPrev - fNext;
    fPrev = fNext;
    if (moved < 1e-7 || improvement < 1e-9) {
      converged = true;
      break;
    }
  }
  return { beta, converged };
}

function weightedMeanStd(rows: TrainRow[], j: number): { mean: number; std: number } {
  let sw = 0;
  let m = 0;
  for (const r of rows) {
    const w = r.w ?? 1;
    sw += w;
    m += w * r.x[j]!;
  }
  m /= sw || 1;
  let v = 0;
  for (const r of rows) v += (r.w ?? 1) * (r.x[j]! - m) ** 2;
  v /= sw || 1;
  return { mean: m, std: Math.sqrt(v) };
}

export interface FitOptions {
  lambda?: number;
  /** rows needed before data-driven standardization fully replaces the prior's */
  standardizeHalfRows?: number;
  calibrate?: boolean;
}

/** Fit one stage model starting from (and shrinking toward) `base`. */
export function fitStage(base: StageModel, rows: TrainRow[], opts: FitOptions = {}): StageModel {
  const lambda = opts.lambda ?? 8;
  const half = opts.standardizeHalfRows ?? 400;
  const n = rows.length;
  const blend = n / (n + half);
  const mean: Record<string, number> = {};
  const std: Record<string, number> = {};
  FEATURE_KEYS.forEach((k, j) => {
    const s = weightedMeanStd(rows, j);
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean[k] = (1 - blend) * pm + blend * s.mean;
    const sd = (1 - blend) * ps + blend * s.std;
    std[k] = sd > 1e-6 ? sd : ps;
  });
  const stage: StageModel = { ...base, mean, std, calib: undefined };
  // Re-express prior weights on the new standardization scale so the penalty is fair.
  const prior = [base.bias];
  FEATURE_KEYS.forEach((k) => {
    const w = base.weights[k] ?? 0;
    prior.push(w * ((std[k] ?? 1) / (base.std[k] ?? 1)));
  });
  let pos = 0;
  let sw = 0;
  for (const r of rows) {
    pos += (r.w ?? 1) * r.y;
    sw += r.w ?? 1;
  }
  const baseRate = clamp(sw > 0 ? pos / sw : base.pRef, 0.005, 0.95);
  prior[0] = logit(baseRate);
  const Z = rows.map((r) => standardize(stage, r.x));
  const { beta } = fitLogistic(
    Z,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    prior,
    lambda,
  );
  const weights: Record<string, number> = {};
  FEATURE_KEYS.forEach((k, j) => {
    weights[k] = clamp(beta[j + 1]!, -10, 10);
  });
  return { pRef: baseRate, bias: beta[0]!, weights, mean, std };
}

/** Platt scaling of an existing stage on a calibration set. */
export function calibrate(stage: StageModel, rows: TrainRow[]): StageModel {
  if (rows.length < 50) return stage;
  const lin = rows.map((r) => [linear(stage, standardize(stage, r.x))]);
  const { beta } = fitLogistic(
    lin,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    [0, 1],
    0.5,
  );
  if (!(beta[1]! > 0.05)) return stage; // a flipped/flat calibration means no signal
  return { ...stage, calib: { a: beta[0]!, b: beta[1]! } };
}

export interface TrainReport {
  adopted: boolean;
  reason: string;
  stage: StageKey;
  trainRows: number;
  valRows: number;
  current: Metrics;
  candidate: Metrics;
}

/**
 * Walk-forward champion/challenger: train on the older 75% of rows, validate on the
 * newest 25%; adopt only if the challenger beats the current model on unseen data.
 */
export function trainAndSelect(
  current: ModelSpec,
  rows: TrainRow[],
  opts: FitOptions & { minRows?: number; minPositives?: number; now?: number } = {},
): { model: ModelSpec; reports: TrainReport[] } {
  const minRows = opts.minRows ?? 300;
  const minPos = opts.minPositives ?? 25;
  const reports: TrainReport[] = [];
  let next: ModelSpec = JSON.parse(JSON.stringify(current));
  let adoptedAny = false;
  for (const stageKey of ["curve", "amm"] as StageKey[]) {
    const sr = rows.filter((r) => r.stage === stageKey).sort((a, b) => a.ts - b.ts);
    const cut = Math.floor(sr.length * 0.75);
    const train = sr.slice(0, cut);
    const val = sr.slice(cut);
    const cur = current.stages[stageKey];
    const empty: Metrics = { n: 0, positives: 0, auc: NaN, logLoss: NaN, brier: NaN, baseRate: NaN };
    const pos = sr.reduce((s, r) => s + r.y, 0);
    if (sr.length < minRows || pos < minPos || val.length < 50) {
      reports.push({ adopted: false, reason: `need ≥${minRows} resolved samples with ≥${minPos} wins (have ${sr.length}/${pos})`, stage: stageKey, trainRows: train.length, valRows: val.length, current: val.length ? evaluate(cur, val) : empty, candidate: empty });
      continue;
    }
    let cand = fitStage(cur, train, opts);
    if (opts.calibrate !== false) {
      const calCut = Math.floor(train.length * 0.8);
      const fitPart = fitStage(cur, train.slice(0, calCut), opts);
      const cal = calibrate(fitPart, train.slice(calCut));
      if (cal.calib) cand = { ...cand, calib: cal.calib };
    }
    const mCur = evaluate(cur, val);
    const mCand = evaluate(cand, val);
    const better =
      Number.isFinite(mCand.logLoss) &&
      (!Number.isFinite(mCur.logLoss) || mCand.logLoss < mCur.logLoss - 0.001) &&
      (!Number.isFinite(mCur.auc) || !Number.isFinite(mCand.auc) || mCand.auc >= mCur.auc - 0.005);
    if (better) {
      // deploy a model refit on everything, keeping the validated calibration shape
      const full = fitStage(cur, sr, opts);
      next.stages[stageKey] = cand.calib ? { ...full, calib: cand.calib } : full;
      adoptedAny = true;
    }
    reports.push({
      adopted: better,
      reason: better ? "challenger beat the current model on unseen (newer) data" : "current model still better on unseen data",
      stage: stageKey,
      trainRows: train.length,
      valRows: val.length,
      current: mCur,
      candidate: mCand,
    });
  }
  if (adoptedAny) {
    const now = opts.now ?? Date.now();
    next = {
      ...next,
      version: `trained-${new Date(now).toISOString().slice(0, 16)}`,
      createdAt: now,
      source: "trained",
      training: {
        rows: rows.length,
        positives: rows.reduce((s, r) => s + r.y, 0),
        from: rows.reduce((m, r) => Math.min(m, r.ts), Infinity),
        to: rows.reduce((m, r) => Math.max(m, r.ts), 0),
        valAuc: reports.find((r) => r.adopted)?.candidate.auc,
        valLogLoss: reports.find((r) => r.adopted)?.candidate.logLoss,
        priorValAuc: reports.find((r) => r.adopted)?.current.auc,
        priorValLogLoss: reports.find((r) => r.adopted)?.current.logLoss,
      },
    };
  }
  return { model: next, reports };
}
