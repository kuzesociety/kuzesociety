/**
 * Learning: fit the scoring model on recorded outcomes, check it on newer coins, and decide
 * whether it replaces the current model. Pure TypeScript, no dependencies.
 *
 * It learns from
 *   - checkpoints: every coin at fixed points in its life (the whole population), and
 *   - entry moments: the first time a coin reached each score level, which is exactly when the
 *     bot buys. Snapshots alone flatter those moments (a crossing often comes on a burst of
 *     buying that then fades), so the model also sees what happened right after them.
 * Rows of one coin a few seconds apart describe one moment and count once.
 *
 * It predicts that a would-be trade at the model's target (default +100% / −50%, delay and
 * every cost included) ends in profit. The label is read from each outcome's exit grid, so it
 * means the same thing whatever take profit and stop loss the bot used while it recorded.
 *
 * It decides per stage (bonding curve, graduated): two recipes are fitted on the older rows —
 * the weighted sum (logistic regression shrunk toward the current weights) and the same plus
 * boosted trees (boost.ts). The better one on newer rows is compared with the current model on
 * rows that NEITHER has seen, and replaces it only if it predicts them better. The winner is
 * refitted on every row, newest included, before it goes live.
 */
import { type BoostData, type BoostParams, boostSteps } from "./boost.js";
import { FEATURE_KEYS } from "./features.js";
import { type ModelInsight, type ModelSpec, type Recipe, type StageKey, type StageModel, linear, rawLogit, standardize, stageLogit } from "./model.js";
import { GRID, GRID_VERSION, type Sample, comboCounts } from "./outcomes.js";
import { clamp, logit, runSteps, runStepsAsync, sigmoid } from "./util.js";

export interface TrainRow {
  ts: number;
  stage: StageKey;
  /** transformed (not standardized) feature vector, FEATURE_KEYS order */
  x: ArrayLike<number>;
  y: 0 | 1;
  w?: number;
  /** the coin: all its rows stay on the same side of every split */
  mint?: string;
  /** entry: a moment the bot would have bought (the first time the coin reached a score level) */
  kind?: "checkpoint" | "entry";
}

export interface Metrics {
  n: number;
  positives: number;
  auc: number;
  logLoss: number;
  brier: number;
  baseRate: number;
}

/** Rows of one coin closer together than this are one moment (e.g. several score levels crossed at once). */
export const SAME_MOMENT_MS = 3_000;

/**
 * The model's label for a sample: whether a trade at the target take profit / stop loss ended
 * in profit. Read from the exit grid, so it does not depend on the settings the bot had while
 * recording; older samples without that grid count only when they were recorded at the target.
 * No label when it does not count as evidence (see counts): the trade had not ended before the
 * coin's price stopped being observed, or, for a graduated coin, it was not watched to the end.
 */
export function labelOf(s: Sample, target: { tpPct: number; slPct: number }): 0 | 1 | null {
  const gi = GRID.findIndex((g) => g.tp === target.tpPct && g.sl === target.slPct);
  if (gi >= 0 && s.gv === GRID_VERSION && s.grid?.length === GRID.length) {
    if (!comboCounts(s, gi)) return null;
    const r = s.grid[gi]!;
    return Number.isFinite(r) ? (r > 0 ? 1 : 0) : null;
  }
  if (s.blind !== undefined || (s.ov === undefined && s.stage === "amm")) return null;
  if (s.tp === target.tpPct && s.sl === target.slPct && Number.isFinite(s.ret)) return s.ret > 0 ? 1 : 0;
  return null;
}

/**
 * Rows to learn from: checkpoints and entry moments of the current feature layout, one per coin
 * moment, labelled for `target`. With `horizonMs` (how long outcomes are followed), only moments
 * whose whole cohort has finished are kept: a sample is written once every exit it is followed
 * for has resolved, so among the newest moments quick crashes are already in and slow winners
 * are not yet — they would look worse than they are.
 */
export function trainingRows(samples: Sample[], target: { tpPct: number; slPct: number }, opts: { horizonMs?: number } = {}): TrainRow[] {
  const d = FEATURE_KEYS.length;
  let cutoff = Infinity;
  if (opts.horizonMs && opts.horizonMs > 0) {
    let last = 0;
    for (const s of samples) if (s.resolvedAt > last) last = s.resolvedAt;
    cutoff = last - opts.horizonMs;
  }
  const list = samples.filter((s) => (s.kind === "checkpoint" || s.kind === "entry") && s.x?.length === d && s.ts <= cutoff).sort((a, b) => a.ts - b.ts);
  const lastKept = new Map<string, number>();
  const out: TrainRow[] = [];
  for (const s of list) {
    const y = labelOf(s, target);
    if (y === null) continue;
    const prev = lastKept.get(s.mint);
    if (prev !== undefined && s.ts - prev < SAME_MOMENT_MS) continue;
    lastKept.set(s.mint, s.ts);
    out.push({ ts: s.ts, stage: s.stage, x: s.x, y, mint: s.mint, kind: s.kind === "entry" ? "entry" : "checkpoint" });
  }
  return out;
}

export function auc(scores: ArrayLike<number>, labels: ArrayLike<number>): number {
  const idx = Array.from({ length: scores.length }, (_, i) => i).sort((a, b) => scores[a]! - scores[b]!);
  let rankSum = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]!] === scores[idx[i]!]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++)
      if (labels[idx[k]!] === 1) {
        rankSum += avgRank;
        nPos++;
      }
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/** Unweighted quality of a stage model on rows it predicts: ranking (AUC) and probabilities (log-loss). */
function* evaluateSteps(stage: StageModel, rows: TrainRow[]): Generator<void, Metrics> {
  return (yield* scoreRowsSteps(stage, rows)).metrics;
}

/** The metrics, plus each row's log-loss (to compare two models row by row). */
function* scoreRowsSteps(stage: StageModel, rows: TrainRow[]): Generator<void, { metrics: Metrics; losses: Float64Array }> {
  const n = rows.length;
  const ps = new Float64Array(n);
  const ys = new Uint8Array(n);
  const losses = new Float64Array(n);
  let ll = 0;
  let br = 0;
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    const p = clamp(sigmoid(stageLogit(stage, r.x)), 1e-6, 1 - 1e-6);
    ps[i] = p;
    ys[i] = r.y;
    losses[i] = -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    ll += losses[i]!;
    br += (p - r.y) ** 2;
    pos += r.y;
    if ((i & 2047) === 2047) yield;
  }
  return { metrics: { n, positives: pos, auc: auc(ps, ys), logLoss: n ? ll / n : NaN, brier: n ? br / n : NaN, baseRate: n ? pos / n : NaN }, losses };
}

export function evaluate(stage: StageModel, rows: TrainRow[]): Metrics {
  return runSteps(evaluateSteps(stage, rows));
}

/**
 * How many standard errors model B's average log-loss is below model A's on the same rows —
 * how sure it is that B predicts better, not just luckier. Rows of one coin move together, so
 * the error is counted per coin (a cluster-robust ratio estimate), not per row.
 */
export function lossGainZ(a: Float64Array, b: Float64Array, rows: TrainRow[]): { gain: number; z: number } {
  const n = rows.length;
  if (!n) return { gain: NaN, z: 0 };
  const byCoin = new Map<string, { d: number; n: number }>();
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    total += d;
    const key = rows[i]!.mint ?? `row:${i}`;
    const c = byCoin.get(key);
    if (c) {
      c.d += d;
      c.n++;
    } else byCoin.set(key, { d, n: 1 });
  }
  const gain = total / n;
  let v = 0;
  for (const c of byCoin.values()) v += (c.d - gain * c.n) ** 2;
  const k = byCoin.size;
  const se = k > 1 ? (Math.sqrt(v * (k / (k - 1))) / n) : Infinity;
  return { gain, z: se > 0 ? gain / se : gain > 0 ? Infinity : 0 };
}

/** Solve A x = b for symmetric positive-definite A (Cholesky). Returns null if not SPD. */
export function choleskySolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const flat = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) flat[i * n + j] = A[i]![j]!;
  const x = choleskyFlat(flat, Float64Array.from(b), n);
  return x ? Array.from(x) : null;
}

function choleskyFlat(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j]!;
      for (let k = 0; k < j; k++) s -= L[i * n + k]! * L[j * n + k]!;
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j]!;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i * n + k]! * y[k]!;
    y[i] = s / L[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k * n + i]! * x[k]!;
    x[i] = s / L[i * n + i]!;
  }
  return x;
}

/**
 * MAP logistic regression by Newton–Raphson with step halving: an L2 penalty pulls weights
 * toward `prior` (Bayesian shrinkage), so few rows ≈ prior, many rows ≈ data. `Z` holds n rows
 * of k standardized inputs; element 0 of `prior` and of the result is the bias. Pauses every few
 * thousand rows (see runSteps).
 */
function* newtonSteps(Z: Float64Array, n: number, k: number, y: ArrayLike<number>, w: ArrayLike<number>, prior: ArrayLike<number>, lambda: number, maxIter = 30): Generator<void, { beta: number[]; converged: boolean }> {
  const d = k + 1;
  let beta = Float64Array.from(prior);
  const objective = (b: Float64Array) => {
    let f = 0;
    for (let i = 0; i < n; i++) {
      let s = b[0]!;
      const o = i * k;
      for (let j = 0; j < k; j++) s += b[j + 1]! * Z[o + j]!;
      const p = clamp(sigmoid(s), 1e-9, 1 - 1e-9);
      f -= w[i]! * (y[i]! * Math.log(p) + (1 - y[i]!) * Math.log(1 - p));
    }
    for (let j = 1; j < d; j++) f += 0.5 * lambda * (b[j]! - prior[j]!) ** 2;
    f += 0.5 * 1e-4 * (b[0]! - prior[0]!) ** 2;
    return f;
  };
  let fPrev = objective(beta);
  let converged = false;
  const g = new Float64Array(d);
  const H = new Float64Array(d * d);
  for (let iter = 0; iter < maxIter; iter++) {
    g.fill(0);
    H.fill(0);
    for (let i = 0; i < n; i++) {
      const o = i * k;
      let s = beta[0]!;
      for (let j = 0; j < k; j++) s += beta[j + 1]! * Z[o + j]!;
      const p = sigmoid(s);
      const r = w[i]! * (p - y[i]!);
      const v = w[i]! * Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H[0] += v;
      for (let j = 0; j < k; j++) {
        const zj = Z[o + j]!;
        g[j + 1] += r * zj;
        H[j + 1] += v * zj;
        const vz = v * zj;
        const row = (j + 1) * d + 1;
        for (let m = 0; m <= j; m++) H[row + m] += vz * Z[o + m]!;
      }
      if ((i & 4095) === 4095) yield;
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * (beta[j]! - prior[j]!);
      H[j * d + j] += lambda;
      H[j * d] = H[j]!;
      for (let m = 1; m < j; m++) H[m * d + j] = H[j * d + m]!;
    }
    g[0] += 1e-4 * (beta[0]! - prior[0]!);
    H[0] += 1e-4;
    const step = choleskyFlat(H, g, d);
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
    let moved = 0;
    for (let j = 0; j < d; j++) moved = Math.max(moved, Math.abs(step[j]! * t));
    beta = next;
    const improvement = fPrev - fNext;
    fPrev = fNext;
    yield;
    if (moved < 1e-7 || improvement < 1e-9) {
      converged = true;
      break;
    }
  }
  return { beta: Array.from(beta), converged };
}

/** Logistic regression on rows of inputs `Z` (see newtonSteps), in one go. */
export function fitLogistic(Z: number[][], y: number[], w: number[], prior: number[], lambda: number, maxIter = 30): { beta: number[]; converged: boolean } {
  const k = prior.length - 1;
  const flat = new Float64Array(Z.length * k);
  Z.forEach((row, i) => {
    for (let j = 0; j < k; j++) flat[i * k + j] = row[j]!;
  });
  return runSteps(newtonSteps(flat, Z.length, k, y, w, prior, lambda, maxIter));
}

export interface FitOptions {
  lambda?: number;
  /** rows needed before data-driven standardization fully replaces the prior's */
  standardizeHalfRows?: number;
  calibrate?: boolean;
  /** inputs held at weight 0 (see REDUNDANT) */
  zero?: readonly string[];
}

/**
 * Inputs that carry nothing new in a stage. On the bonding curve, market cap, curve progress
 * and the SOL in the curve are all one number seen three ways (how many tokens have been sold),
 * so a weighted sum can give two of them large opposite weights that cancel — and the "why this
 * score" reasons would then show both. Only market cap is used there (trees split on it just as
 * well). On a graduated coin, curve progress is always 100%.
 */
export const REDUNDANT: Record<StageKey, readonly string[]> = { curve: ["progress", "liquidity", "sinceMig"], amm: ["progress"] };

/** Fit one stage's weighted sum from (and shrinking toward) `base`, with a weight per row. */
function* fitStageSteps(base: StageModel, rows: TrainRow[], weights: ArrayLike<number>, opts: FitOptions = {}): Generator<void, StageModel> {
  const lambda = opts.lambda ?? 8;
  const half = opts.standardizeHalfRows ?? 400;
  const n = rows.length;
  const d = FEATURE_KEYS.length;
  const blend = n / (n + half);
  let sw = 0;
  for (let i = 0; i < n; i++) sw += weights[i]!;
  const mean: Record<string, number> = {};
  const std: Record<string, number> = {};
  for (let j = 0; j < d; j++) {
    const k = FEATURE_KEYS[j]!;
    let m = 0;
    for (let i = 0; i < n; i++) m += weights[i]! * rows[i]!.x[j]!;
    m /= sw || 1;
    let v = 0;
    for (let i = 0; i < n; i++) v += weights[i]! * (rows[i]!.x[j]! - m) ** 2;
    v /= sw || 1;
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean[k] = (1 - blend) * pm + blend * m;
    const sd = (1 - blend) * ps + blend * Math.sqrt(v);
    std[k] = sd > 1e-6 ? sd : ps;
    if ((j & 3) === 3) yield;
  }
  const shape: StageModel = { pRef: base.pRef, bias: 0, weights: {}, mean, std };
  // prior weights re-expressed on the new standardization scale so the penalty is fair
  const zero = new Set(opts.zero ?? []);
  const prior = [base.bias];
  FEATURE_KEYS.forEach((k) => prior.push(zero.has(k) ? 0 : (base.weights[k] ?? 0) * ((std[k] ?? 1) / (base.std[k] ?? 1))));
  let pos = 0;
  for (let i = 0; i < n; i++) pos += weights[i]! * rows[i]!.y;
  const baseRate = clamp(sw > 0 ? pos / sw : base.pRef, 0.005, 0.95);
  prior[0] = logit(baseRate);
  const Z = new Float64Array(n * d);
  const y = new Uint8Array(n);
  const zeroAt = FEATURE_KEYS.flatMap((k, j) => (zero.has(k) ? [j] : []));
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    Z.set(standardize(shape, r.x), i * d);
    for (const j of zeroAt) Z[i * d + j] = 0; // no data: the penalty holds the weight at 0
    y[i] = r.y;
    if ((i & 4095) === 4095) yield;
  }
  yield;
  const { beta } = yield* newtonSteps(Z, n, d, y, weights, prior, lambda);
  const out: Record<string, number> = {};
  FEATURE_KEYS.forEach((k, j) => (out[k] = clamp(beta[j + 1]!, -10, 10)));
  return { pRef: baseRate, bias: beta[0]!, weights: out, mean, std };
}

/** Fit one stage model starting from (and shrinking toward) `base`. */
export function fitStage(base: StageModel, rows: TrainRow[], opts: FitOptions = {}): StageModel {
  return runSteps(
    fitStageSteps(
      base,
      rows,
      rows.map((r) => r.w ?? 1),
      opts,
    ),
  );
}

/** Platt scaling of an existing stage (weighted sum and trees) on a calibration set. */
function* calibrateSteps(stage: StageModel, rows: TrainRow[]): Generator<void, StageModel> {
  if (rows.length < 50) return stage;
  const plain = { ...stage, calib: undefined };
  const z = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    z[i] = rawLogit(plain, rows[i]!.x);
    if ((i & 2047) === 2047) yield;
  }
  const { beta } = yield* newtonSteps(
    z,
    rows.length,
    1,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    [0, 1],
    0.5,
  );
  if (!(beta[1]! > 0.05)) return stage; // a flipped/flat calibration means no signal
  return { ...stage, calib: { a: beta[0]!, b: beta[1]! } };
}

export function calibrate(stage: StageModel, rows: TrainRow[]): StageModel {
  return runSteps(calibrateSteps(stage, rows));
}

export interface TrainReport {
  adopted: boolean;
  reason: string;
  stage: StageKey;
  trainRows: number;
  valRows: number;
  /** newer rows that neither the current model nor the challenger had seen: where they were compared */
  freshRows: number;
  /** the current model and the challenger on those rows */
  current: Metrics;
  candidate: Metrics;
  /** the recipe that did better on the newer rows, and how both did there */
  recipe?: Exclude<Recipe, "prior">;
  linear?: Metrics;
  trees?: Metrics;
  /** trees in the challenger (0: the weighted sum alone) */
  treeCount?: number;
  /** how many standard errors the trees beat the weighted sum by on the newer rows (see lossGainZ) */
  treesZ?: number;
  /** ... and the challenger the current model on rows neither had seen */
  replaceZ?: number;
  /** rows that were moments the bot would have bought */
  entryRows?: number;
}

export interface TrainOptions extends FitOptions {
  minRows?: number;
  minPositives?: number;
  now?: number;
  /** recency: a row this many days older than the newest counts half (0 = every row the same) */
  halfLifeDays?: number;
  /** try boosted trees on top of the weighted sum */
  trees?: boolean;
  /** rows the trees need in the training part before they are tried */
  treesMinRows?: number;
  boost?: Partial<BoostParams>;
  /** newer rows (and wins among them) that neither model has seen, needed to replace the current one */
  minFreshRows?: number;
  minFreshPositives?: number;
  /** standard errors by which the trees must beat the weighted sum (see lossGainZ) */
  treesZ?: number;
  /** ... and the challenger the current model */
  replaceZ?: number;
  /** ... by at least this much average log-loss per row */
  replaceMinGain?: number;
}

const TRAIN_DEFAULTS = {
  minRows: 300,
  minPositives: 25,
  halfLifeDays: 3,
  trees: true,
  treesMinRows: 2_000,
  minFreshRows: 200,
  minFreshPositives: 10,
  treesZ: 1.65,
  replaceZ: 1.5,
  replaceMinGain: 0.001,
};

export interface TrainResult {
  model: ModelSpec;
  reports: TrainReport[];
}

const EMPTY: Metrics = { n: 0, positives: 0, auc: NaN, logLoss: NaN, brier: NaN, baseRate: NaN };

function* boostDataSteps(rows: TrainRow[], w: ArrayLike<number>, lin: StageModel): Generator<void, BoostData> {
  const n = rows.length;
  const d = FEATURE_KEYS.length;
  const X = new Float32Array(n * d);
  const y = new Uint8Array(n);
  const wf = new Float32Array(n);
  const base = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    for (let j = 0; j < d; j++) X[i * d + j] = r.x[j]!;
    y[i] = r.y;
    wf[i] = w[i]!;
    base[i] = linear(lin, standardize(lin, r.x));
    if ((i & 4095) === 4095) yield;
  }
  return { n, d, X, y, w: wf, base };
}

/**
 * Score anchors for a trained stage (see StageModel.scale): its calibrated logit at the median
 * and at the 95th percentile of coin moments — checkpoints, every coin and not just its surges.
 */
function* scaleSteps(stage: StageModel, rows: TrainRow[]): Generator<void, StageModel["scale"]> {
  const pop = rows.filter((r) => r.kind !== "entry");
  const use = pop.length >= 100 ? pop : rows;
  const L = new Float64Array(use.length);
  for (let i = 0; i < use.length; i++) {
    L[i] = stageLogit(stage, use[i]!.x);
    if ((i & 2047) === 2047) yield;
  }
  L.sort();
  const q = (f: number) => L[Math.min(L.length - 1, Math.round(f * (L.length - 1)))]!;
  const at50 = q(0.5);
  const at75 = q(0.95);
  return use.length >= 50 && at75 - at50 > 0.05 ? { at50, at75 } : undefined;
}

/** Win rate of the population the score is scaled to (checkpoints: every coin, not just surges). */
function populationRate(rows: TrainRow[], w: ArrayLike<number>): number | null {
  let pos = 0;
  let sw = 0;
  rows.forEach((r, i) => {
    if (r.kind === "entry") return;
    pos += w[i]! * r.y;
    sw += w[i]!;
  });
  let count = 0;
  for (const r of rows) if (r.kind !== "entry") count++;
  return count >= 100 && sw > 0 ? clamp(pos / sw, 0.005, 0.95) : null;
}

interface StageResult {
  report: TrainReport;
  deploy?: StageModel;
  rows: { total: number; entries: number };
}

function* stageSteps(stageKey: StageKey, cur: StageModel, seenTo: number, input: TrainRow[], o: TrainOptions & typeof TRAIN_DEFAULTS): Generator<void, StageResult> {
  // coins in order of first appearance; a coin's rows stay together, so no coin is on both sides of a split
  const n = input.length;
  const coinIds = new Map<string, number>();
  const coin = new Int32Array(n);
  input.forEach((r, i) => {
    const k = r.mint ?? `row:${i}`;
    let id = coinIds.get(k);
    if (id === undefined) coinIds.set(k, (id = coinIds.size));
    coin[i] = id;
  });
  const first = new Float64Array(coinIds.size).fill(Infinity);
  input.forEach((r, i) => {
    if (r.ts < first[coin[i]!]!) first[coin[i]!] = r.ts;
  });
  yield;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => first[coin[a]!]! - first[coin[b]!]! || coin[a]! - coin[b]! || input[a]!.ts - input[b]!.ts);
  yield;
  const sr = order.map((i) => input[i]!);
  const keys = order.map((i) => coin[i]!);
  const cutAt = (frac: number, hi: number) => {
    let c = Math.floor(hi * frac);
    while (c > 0 && c < hi && keys[c] === keys[c - 1]) c++;
    return c;
  };
  const cut = cutAt(0.75, n);
  const train = sr.slice(0, cut);
  const val = sr.slice(cut);
  const cutA = cutAt(0.8, cut);
  const partA = sr.slice(0, cutA);
  const partB = sr.slice(cutA, cut);
  const pos = sr.reduce((s, r) => s + r.y, 0);
  const entries = sr.filter((r) => r.kind === "entry").length;
  const rows = { total: n, entries };
  const base = { stage: stageKey, trainRows: train.length, valRows: val.length, entryRows: entries };
  if (n < o.minRows || pos < o.minPositives || val.length < 50 || partB.length < 30) {
    return {
      rows,
      report: {
        ...base,
        adopted: false,
        reason: `need ≥${o.minRows} resolved moments with ≥${o.minPositives} wins (have ${n}/${pos})`,
        freshRows: 0,
        current: val.length ? yield* evaluateSteps(cur, val) : EMPTY,
        candidate: EMPTY,
      },
    };
  }

  const halfMs = o.halfLifeDays > 0 ? o.halfLifeDays * 86_400_000 : 0;
  const weigh = (list: TrainRow[]) => {
    let tMax = -Infinity;
    for (const r of list) if (r.ts > tMax) tMax = r.ts;
    return list.map((r) => (r.w ?? 1) * (halfMs ? Math.pow(0.5, (tMax - r.ts) / halfMs) : 1));
  };

  // recipe 1: the weighted sum
  const fit = { ...o, zero: REDUNDANT[stageKey] };
  const boost = { ...o.boost, skip: REDUNDANT[stageKey].map((k) => FEATURE_KEYS.indexOf(k)) };
  const wA = weigh(partA);
  const lin = yield* fitStageSteps(cur, partA, wA, fit);
  const L = o.calibrate === false ? lin : yield* calibrateSteps(lin, partB);
  const sL = yield* scoreRowsSteps(L, val);
  const mL = sL.metrics;

  // recipe 2: the weighted sum plus trees fitted on what it gets wrong
  let H: StageModel | null = null;
  let mH: Metrics | null = null;
  let treesZ = 0;
  let treeCount = 0;
  if (o.trees && partA.length >= o.treesMinRows && partB.reduce((s, r) => s + r.y, 0) >= 10) {
    const dataA = yield* boostDataSteps(partA, wA, lin);
    const dataB = yield* boostDataSteps(partB, new Float32Array(partB.length).fill(1), lin);
    const res = yield* boostSteps(dataA, dataB, FEATURE_KEYS, boost);
    if (res.ens.trees.length) {
      const withTrees: StageModel = { ...lin, trees: res.ens };
      H = o.calibrate === false ? withTrees : yield* calibrateSteps(withTrees, partB);
      const sH = yield* scoreRowsSteps(H, val);
      mH = sH.metrics;
      treesZ = lossGainZ(sL.losses, sH.losses, val).z;
      treeCount = res.ens.trees.length;
    }
  }
  // the simpler recipe wins unless the trees are clearly better on the newer rows, not by luck
  const treesWin = !!(H && mH && treesZ >= o.treesZ && !(mH.auc < mL.auc - 0.003));
  const cand = treesWin ? H! : L;
  const recipe = treesWin ? "trees" : "linear";

  // the current model against the challenger, on newer rows neither has seen
  const fresh = val.filter((r) => r.ts > seenTo);
  const freshPos = fresh.reduce((s, r) => s + r.y, 0);
  const common = { ...base, freshRows: fresh.length, recipe, linear: mL, trees: mH ?? undefined, treeCount: treesWin ? treeCount : 0, treesZ: H ? treesZ : undefined } as const;
  if (fresh.length < o.minFreshRows || freshPos < o.minFreshPositives) {
    return {
      rows,
      report: {
        ...common,
        adopted: false,
        reason: `waiting for newer coins that neither model has seen (${fresh.length}/${o.minFreshRows} moments, ${freshPos}/${o.minFreshPositives} wins)`,
        current: yield* evaluateSteps(cur, fresh),
        candidate: yield* evaluateSteps(cand, fresh),
      },
    };
  }
  const sCur = yield* scoreRowsSteps(cur, fresh);
  const sCand = yield* scoreRowsSteps(cand, fresh);
  const mCur = sCur.metrics;
  const mCand = sCand.metrics;
  const gain = lossGainZ(sCur.losses, sCand.losses, fresh);
  const better =
    Number.isFinite(mCand.logLoss) &&
    gain.gain > o.replaceMinGain &&
    gain.z >= o.replaceZ &&
    (!Number.isFinite(mCur.auc) || !Number.isFinite(mCand.auc) || mCand.auc >= mCur.auc - 0.005);
  const what = treesWin ? `weighted sum + ${treeCount} trees` : "weighted sum";
  const report: TrainReport = {
    ...common,
    replaceZ: gain.z,
    adopted: better,
    reason: better
      ? `the new model (${what}) predicted ${fresh.length.toLocaleString("en-US")} newer moments better than the current one; neither had seen them`
      : `the current model still predicts newer moments (${fresh.length.toLocaleString("en-US")}) at least as well`,
    current: mCur,
    candidate: mCand,
  };
  if (!better) return { rows, report };

  // deploy the winning recipe refitted on every row, newest included, with the validated calibration
  const wAll = weigh(sr);
  const linAll = yield* fitStageSteps(cur, sr, wAll, fit);
  let deploy: StageModel = linAll;
  if (treesWin) {
    const res = yield* boostSteps(yield* boostDataSteps(sr, wAll, linAll), null, FEATURE_KEYS, { ...boost, rounds: treeCount });
    if (res.ens.trees.length) deploy = { ...deploy, trees: res.ens };
  }
  if (cand.calib) deploy = { ...deploy, calib: cand.calib };
  deploy.pRef = populationRate(sr, wAll) ?? deploy.pRef;
  deploy.scale = yield* scaleSteps(deploy, sr);
  deploy.trainedTo = sr.reduce((m, r) => Math.max(m, r.ts), 0);
  return { rows, report, deploy };
}

/**
 * The whole learning step for both stages, as a generator that pauses often (see
 * trainAndSelectAsync). Returns the model to use (the current one when nothing won) and a
 * report per stage.
 */
export function* trainSteps(current: ModelSpec, rows: TrainRow[], opts: TrainOptions = {}): Generator<void, TrainResult> {
  const o = { ...TRAIN_DEFAULTS, ...opts };
  const reports: TrainReport[] = [];
  let next: ModelSpec = JSON.parse(JSON.stringify(current));
  const insight: ModelInsight = {
    recipe: { ...(current.insight?.recipe ?? {}) },
    trees: { ...(current.insight?.trees ?? {}) },
    rows: { ...(current.insight?.rows ?? {}) },
    auc: { ...(current.insight?.auc ?? {}) },
  };
  let adoptedAny = false;
  for (const stageKey of ["curve", "amm"] as StageKey[]) {
    const cur = current.stages[stageKey];
    // the newest row the current stage model learned from: only rows after it are unseen
    const seenTo = cur.trainedTo ?? (current.source === "trained" ? (current.training?.to ?? -Infinity) : -Infinity);
    const res = yield* stageSteps(
      stageKey,
      cur,
      seenTo,
      rows.filter((r) => r.stage === stageKey),
      o,
    );
    reports.push(res.report);
    if (res.deploy) {
      next.stages[stageKey] = res.deploy;
      insight.recipe[stageKey] = res.report.recipe;
      insight.trees[stageKey] = res.deploy.trees?.trees.length ?? 0;
      insight.rows[stageKey] = res.rows;
      insight.auc![stageKey] = res.report.candidate.auc;
      adoptedAny = true;
    }
  }
  if (adoptedAny) {
    const now = o.now ?? Date.now();
    const won = reports.find((r) => r.adopted);
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
        valAuc: won?.candidate.auc,
        valLogLoss: won?.candidate.logLoss,
        priorValAuc: won?.current.auc,
        priorValLogLoss: won?.current.logLoss,
      },
      insight,
    };
  }
  return { model: next, reports };
}

/** Train and pick in one go (tests, command line). */
export function trainAndSelect(current: ModelSpec, rows: TrainRow[], opts: TrainOptions = {}): TrainResult {
  return runSteps(trainSteps(current, rows, opts));
}

/** The same, pausing every ~15 ms so a live bot keeps trading while it learns. */
export function trainAndSelectAsync(current: ModelSpec, rows: TrainRow[], opts: TrainOptions = {}): Promise<TrainResult> {
  return runStepsAsync(trainSteps(current, rows, opts));
}
