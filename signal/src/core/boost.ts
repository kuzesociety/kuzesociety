/**
 * Gradient-boosted decision trees (logistic loss), pure TypeScript, no dependencies.
 *
 * The scorer's non-linear half. A weighted sum of signals cannot learn combinations — "heavy
 * buying is good, unless the dev already sold" — or thresholds ("a few smart wallets matter,
 * more add nothing"). Small trees can: each one is fitted to what the model before it still
 * gets wrong. Training starts from the linear model's logit, so with little data the score
 * stays the linear one, and it stops as soon as another tree no longer improves the log-loss
 * on newer rows it did not train on (early stopping).
 *
 * Trees read the transformed feature vector (`featureVector`, FEATURE_KEYS order); splits are
 * found on per-feature quantile histograms, the standard fast method.
 */
import { rng } from "./util.js";

/** One tree, as parallel arrays (compact in JSON). Node 0 is the root. */
export interface Tree {
  /** split feature per node (index into the ensemble's `keys`), −1 for a leaf */
  f: number[];
  /** split threshold: a row goes left when x[f] <= t */
  t: number[];
  l: number[];
  r: number[];
  /**
   * node value in logit units: the output for a leaf; for an inner node, what the node alone
   * would output (used to attribute each split's effect to its feature)
   */
  v: number[];
}

export interface TreeEnsemble {
  /** feature keys the split indices refer to (checked against the running build's features) */
  keys: string[];
  trees: Tree[];
  /** total split gain per feature key: how much each signal the trees used helped */
  gain: Record<string, number>;
}

export interface BoostParams {
  /** most trees */
  rounds: number;
  /** shrinkage applied to every tree's output */
  lr: number;
  depth: number;
  /** L2 penalty on leaf values */
  lambda: number;
  /** a child needs at least this much hessian (≈ rows × p(1−p)); also scaled with the data below */
  minHess: number;
  /** ... and at least this share of the total hessian */
  minHessShare: number;
  minGain: number;
  /** share of rows each tree sees */
  subsample: number;
  /** share of features each tree may split on */
  colsample: number;
  /** histogram bins per feature (≤ 255) */
  bins: number;
  /** stop after this many trees without a better validation log-loss */
  patience: number;
  seed: number;
  /** feature indices never split on (e.g. a feature that is only another view of one already used) */
  skip?: number[];
}

export const BOOST_DEFAULTS: BoostParams = {
  rounds: 300,
  lr: 0.08,
  depth: 3,
  lambda: 5,
  minHess: 8,
  minHessShare: 0.002,
  minGain: 0,
  subsample: 0.8,
  colsample: 0.8,
  bins: 32,
  patience: 25,
  seed: 17,
};

/** Rows for boosting, row-major. `base` is the starting logit of each row (the linear model's). */
export interface BoostData {
  n: number;
  d: number;
  X: Float32Array;
  y: Uint8Array;
  w: Float32Array;
  base: Float64Array;
}

export interface BoostResult {
  ens: TreeEnsemble;
  /** validation log-loss before any tree, then after each tree kept or tried */
  curve: number[];
  /** trees kept (the best validation round) */
  rounds: number;
}

const sig = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** Weighted mean log-loss of margins `m` against labels. */
export function logLossOf(m: Float64Array, y: Uint8Array, w: Float32Array, n = m.length): number {
  let ll = 0;
  let sw = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, sig(m[i]!)));
    ll -= w[i]! * (y[i] ? Math.log(p) : Math.log(1 - p));
    sw += w[i]!;
  }
  return sw > 0 ? ll / sw : NaN;
}

/** Quantile cut points per feature: bin k holds x <= cuts[k] (after the cuts before it). */
function* makeCuts(X: Float32Array, n: number, d: number, bins: number, rand: () => number): Generator<void, Float64Array[]> {
  const take = Math.min(n, 20_000);
  const pick = new Int32Array(take);
  for (let k = 0; k < take; k++) pick[k] = n <= take ? k : Math.floor(rand() * n);
  const cuts: Float64Array[] = [];
  const vals = new Float64Array(take);
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < take; k++) vals[k] = X[pick[k]! * d + j]!;
    vals.sort();
    const out: number[] = [];
    for (let b = 1; b < bins; b++) {
      const v = vals[Math.min(take - 1, Math.floor((b / bins) * take))]!;
      if (v < vals[take - 1]! && (out.length === 0 || v > out[out.length - 1]!)) out.push(v);
    }
    cuts.push(Float64Array.from(out));
    yield;
  }
  return cuts;
}

function binOf(cuts: Float64Array, x: number): number {
  let lo = 0;
  let hi = cuts.length; // bin = number of cuts strictly below x
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cuts[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Output of one tree on a feature row. Rows are compared in single precision, as they were
 * when the tree was trained, so a value sitting exactly on a threshold goes the same way.
 */
function treeOut(t: Tree, x: ArrayLike<number>, map: ArrayLike<number>): number {
  let i = 0;
  while (t.f[i]! >= 0) i = Math.fround(x[map[t.f[i]!]!]!) <= t.t[i]! ? t.l[i]! : t.r[i]!;
  return t.v[i]!;
}

const identity = new Map<number, Int32Array>();
function identityMap(d: number): Int32Array {
  let m = identity.get(d);
  if (!m) {
    m = Int32Array.from({ length: d }, (_, i) => i);
    identity.set(d, m);
  }
  return m;
}

/** Sum of all trees' outputs for one row. `map[k]` is where the ensemble's key k sits in `x`. */
export function ensembleMargin(ens: TreeEnsemble, x: ArrayLike<number>, map: ArrayLike<number> = identityMap(ens.keys.length)): number {
  let s = 0;
  for (const t of ens.trees) s += treeOut(t, x, map);
  return s;
}

/**
 * Per-feature attribution of the trees' output for one row (Saabas): along each tree's path,
 * the change in node value at every split is credited to the split's feature. Adds into
 * `out` (indexed like `x`) and returns the part no feature explains (the roots' values).
 */
export function ensembleContrib(ens: TreeEnsemble, x: ArrayLike<number>, out: Float64Array, map: ArrayLike<number> = identityMap(ens.keys.length)): number {
  let bias = 0;
  for (const t of ens.trees) {
    let i = 0;
    bias += t.v[0]!;
    while (t.f[i]! >= 0) {
      const at = map[t.f[i]!]!;
      const next = Math.fround(x[at]!) <= t.t[i]! ? t.l[i]! : t.r[i]!;
      out[at] += t.v[next]! - t.v[i]!;
      i = next;
    }
  }
  return bias;
}

/**
 * Fits trees on `train`, starting from each row's `base` logit, with early stopping on
 * `valid`. A generator: it pauses after every tree so a live server can keep trading while
 * it learns (see `runSteps` in util.ts).
 */
export function* boostSteps(train: BoostData, valid: BoostData | null, keys: string[], params: Partial<BoostParams> = {}): Generator<void, BoostResult> {
  const p = { ...BOOST_DEFAULTS, ...params };
  const { n, d, X, y, w } = train;
  const rand = rng(p.seed);
  const B = Math.max(2, Math.min(255, p.bins));
  const cuts = yield* makeCuts(X, n, d, B, rand);
  const nb = cuts.map((c) => c.length + 1);
  const skip = new Set(p.skip ?? []);
  // binned rows, row-major
  const bins = new Uint8Array(n * d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) bins[i * d + j] = binOf(cuts[j]!, X[i * d + j]!);
    if ((i & 4095) === 4095) yield;
  }
  yield;

  const m = Float64Array.from(train.base);
  const g = new Float64Array(n);
  const h = new Float64Array(n);
  const vm = valid ? Float64Array.from(valid.base) : null;
  const curve: number[] = [valid ? logLossOf(vm!, valid.y, valid.w) : logLossOf(m, y, w)];
  let best = curve[0]!;
  let bestRounds = 0;
  const trees: Tree[] = [];
  const gains: number[][] = [];
  const hist = (rows: Int32Array, feats: Int32Array) => {
    // [feature][bin] → (G, H) interleaved
    const hs = new Float64Array(d * B * 2);
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r]!;
      const gi = g[i]!;
      const hi = h[i]!;
      const o = i * d;
      for (let k = 0; k < feats.length; k++) {
        const j = feats[k]!;
        const at = (j * B + bins[o + j]!) * 2;
        hs[at] += gi;
        hs[at + 1] += hi;
      }
    }
    return hs;
  };

  for (let round = 0; round < p.rounds; round++) {
    let Htot = 0;
    for (let i = 0; i < n; i++) {
      const q = sig(m[i]!);
      g[i] = w[i]! * (q - y[i]!);
      h[i] = w[i]! * Math.max(q * (1 - q), 1e-6);
      Htot += h[i]!;
    }
    const minH = Math.max(p.minHess, p.minHessShare * Htot);
    // rows and features this tree may use
    const rowList: number[] = [];
    for (let i = 0; i < n; i++) if (p.subsample >= 1 || rand() < p.subsample) rowList.push(i);
    const featList: number[] = [];
    for (let j = 0; j < d; j++) if (nb[j]! > 1 && !skip.has(j) && (p.colsample >= 1 || rand() < p.colsample)) featList.push(j);
    if (featList.length === 0 || rowList.length < 2) break;
    const feats = Int32Array.from(featList);

    const tree: Tree = { f: [], t: [], l: [], r: [], v: [] };
    const splitBin: number[] = [];
    const gain = new Array<number>(keys.length).fill(0);
    const leafOf = (G: number, H: number) => (-G / (H + p.lambda)) * p.lr;
    const newNode = (G: number, H: number) => {
      tree.f.push(-1);
      tree.t.push(0);
      tree.l.push(-1);
      tree.r.push(-1);
      tree.v.push(leafOf(G, H));
      splitBin.push(-1);
      return tree.f.length - 1;
    };
    interface Open {
      id: number;
      rows: Int32Array;
      hs: Float64Array;
      G: number;
      H: number;
      depth: number;
    }
    const rootRows = Int32Array.from(rowList);
    let G0 = 0;
    let H0 = 0;
    for (const i of rootRows) {
      G0 += g[i]!;
      H0 += h[i]!;
    }
    const open: Open[] = [{ id: newNode(G0, H0), rows: rootRows, hs: hist(rootRows, feats), G: G0, H: H0, depth: 0 }];
    while (open.length) {
      const node = open.pop()!;
      if (node.depth >= p.depth || node.H < 2 * minH) continue;
      const parentScore = (node.G * node.G) / (node.H + p.lambda);
      let bestGain = p.minGain;
      let bj = -1;
      let bb = -1;
      for (let k = 0; k < feats.length; k++) {
        const j = feats[k]!;
        let GL = 0;
        let HL = 0;
        for (let b = 0; b < nb[j]! - 1; b++) {
          const at = (j * B + b) * 2;
          GL += node.hs[at]!;
          HL += node.hs[at + 1]!;
          const HR = node.H - HL;
          if (HL < minH) continue;
          if (HR < minH) break;
          const GR = node.G - GL;
          const gn = (GL * GL) / (HL + p.lambda) + (GR * GR) / (HR + p.lambda) - parentScore;
          if (gn > bestGain) {
            bestGain = gn;
            bj = j;
            bb = b;
          }
        }
      }
      if (bj < 0) continue;
      const left: number[] = [];
      const right: number[] = [];
      for (const i of node.rows) (bins[i * d + bj]! <= bb ? left : right).push(i);
      const L = Int32Array.from(left);
      const R = Int32Array.from(right);
      // histogram of the smaller child directly; the larger is the parent minus it
      const small = L.length <= R.length ? L : R;
      const hsSmall = hist(small, feats);
      const hsLarge = new Float64Array(node.hs.length);
      for (let q = 0; q < hsLarge.length; q++) hsLarge[q] = node.hs[q]! - hsSmall[q]!;
      const hsL = small === L ? hsSmall : hsLarge;
      const hsR = small === L ? hsLarge : hsSmall;
      let GL = 0;
      let HL = 0;
      for (const i of L) {
        GL += g[i]!;
        HL += h[i]!;
      }
      const li = newNode(GL, HL);
      const ri = newNode(node.G - GL, node.H - HL);
      tree.f[node.id] = bj;
      tree.t[node.id] = cuts[bj]![bb]!;
      tree.l[node.id] = li;
      tree.r[node.id] = ri;
      splitBin[node.id] = bb;
      gain[bj] += bestGain;
      open.push({ id: li, rows: L, hs: hsL, G: GL, H: HL, depth: node.depth + 1 });
      open.push({ id: ri, rows: R, hs: hsR, G: node.G - GL, H: node.H - HL, depth: node.depth + 1 });
    }
    if (tree.f[0]! < 0) break; // nothing left worth splitting
    // update every training row's margin (binned traversal, exact same routing as the split)
    for (let i = 0; i < n; i++) {
      let k = 0;
      while (tree.f[k]! >= 0) k = bins[i * d + tree.f[k]!]! <= splitBin[k]! ? tree.l[k]! : tree.r[k]!;
      m[i] += tree.v[k]!;
    }
    trees.push(tree);
    gains.push(gain);
    let score: number;
    if (valid && vm) {
      const vx = valid.X;
      for (let i = 0; i < valid.n; i++) {
        let k = 0;
        while (tree.f[k]! >= 0) k = vx[i * d + tree.f[k]!]! <= tree.t[k]! ? tree.l[k]! : tree.r[k]!;
        vm[i] += tree.v[k]!;
      }
      score = logLossOf(vm, valid.y, valid.w);
    } else score = logLossOf(m, y, w);
    curve.push(score);
    if (!valid) bestRounds = trees.length; // no check data: keep every tree asked for
    else if (score < best - 1e-7) {
      best = score;
      bestRounds = trees.length;
    } else if (trees.length - bestRounds >= p.patience) break;
    yield;
  }

  const kept = trees.slice(0, bestRounds).map((t) => ({
    f: t.f,
    t: t.t.map((v) => Math.fround(v)),
    l: t.l,
    r: t.r,
    v: t.v.map((v) => Math.round(v * 1e6) / 1e6),
  }));
  const gainByKey: Record<string, number> = {};
  for (let r = 0; r < bestRounds; r++) gains[r]!.forEach((gv, j) => gv > 0 && (gainByKey[keys[j]!] = (gainByKey[keys[j]!] ?? 0) + gv));
  return { ens: { keys: [...keys], trees: kept, gain: gainByKey }, curve, rounds: bestRounds };
}

/** Structural check of a stored ensemble against the running build's feature keys. */
export function validEnsemble(ens: unknown, featureKeys: readonly string[]): ens is TreeEnsemble {
  if (!ens || typeof ens !== "object") return false;
  const e = ens as TreeEnsemble;
  if (!Array.isArray(e.keys) || !Array.isArray(e.trees) || e.trees.length > 5_000) return false;
  if (!e.keys.every((k) => typeof k === "string" && featureKeys.includes(k))) return false;
  for (const t of e.trees) {
    if (!t || !Array.isArray(t.f)) return false;
    const n = t.f.length;
    if (n < 1 || n > 1_023 || t.t?.length !== n || t.l?.length !== n || t.r?.length !== n || t.v?.length !== n) return false;
    for (let i = 0; i < n; i++) {
      const f = t.f[i]!;
      if (!Number.isInteger(f) || f >= e.keys.length || !Number.isFinite(t.v[i]) || Math.abs(t.v[i]!) > 20) return false;
      if (f >= 0) {
        // children always come after their parent, so every path ends
        if (!Number.isFinite(t.t[i]) || !(t.l[i]! > i && t.l[i]! < n) || !(t.r[i]! > i && t.r[i]! < n)) return false;
      }
    }
  }
  return true;
}
