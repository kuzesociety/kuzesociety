/** Small shared helpers (isomorphic). */

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
export const num = (x: unknown, fallback = 0): number => {
  const n = typeof x === "string" ? Number(x) : (x as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
export const logit = (p: number) => {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
};
export const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
export const round = (x: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

let idCounter = 0;
/** Short unique-enough id: time + counter + random suffix. */
export function newId(prefix = ""): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return prefix + Date.now().toString(36) + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Runs a step generator (long work that pauses now and then) to completion in one go. */
export function runSteps<T>(it: Generator<void, T>): T {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Runs a step generator, handing control back every ~15 ms so a live bot keeps up with the market. */
export async function runStepsAsync<T>(it: Generator<void, T>, sliceMs = 15): Promise<T> {
  let t = Date.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > sliceMs) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}

/** Deterministic PRNG (mulberry32) for simulations and tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map with least-recently-used eviction. */
export class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(public max: number) {}
  get size() {
    return this.map.size;
  }
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  peek(k: K): V | undefined {
    return this.map.get(k);
  }
  has(k: K) {
    return this.map.has(k);
  }
  set(k: K, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }
  delete(k: K) {
    return this.map.delete(k);
  }
  /** Drops least-recently-used entries until `target` remain, sparing those `keep` accepts while possible. */
  shrinkTo(target: number, keep?: (k: K, v: V) => boolean): number {
    let dropped = 0;
    if (keep) {
      for (const [k, v] of this.map) {
        if (this.map.size <= target) break;
        if (!keep(k, v)) {
          this.map.delete(k);
          dropped++;
        }
      }
    }
    while (this.map.size > target) {
      this.map.delete(this.map.keys().next().value as K);
      dropped++;
    }
    return dropped;
  }
  entries() {
    return this.map.entries();
  }
  values() {
    return this.map.values();
  }
  clear() {
    this.map.clear();
  }
}

/** Fixed-capacity ring buffer. */
export class Ring<T> {
  private buf: (T | undefined)[];
  private start = 0;
  private len = 0;
  constructor(public readonly cap: number) {
    this.buf = new Array(cap);
  }
  get length() {
    return this.len;
  }
  push(v: T) {
    if (this.len < this.cap) {
      this.buf[(this.start + this.len) % this.cap] = v;
      this.len++;
    } else {
      this.buf[this.start] = v;
      this.start = (this.start + 1) % this.cap;
    }
  }
  at(i: number): T | undefined {
    if (i < 0) i += this.len;
    if (i < 0 || i >= this.len) return undefined;
    return this.buf[(this.start + i) % this.cap];
  }
  last(): T | undefined {
    return this.at(this.len - 1);
  }
  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.len; i++) out.push(this.buf[(this.start + i) % this.cap] as T);
    return out;
  }
  clear() {
    this.start = 0;
    this.len = 0;
  }
}

/** Welford running mean / variance. */
export class RunningStat {
  n = 0;
  mean = 0;
  m2 = 0;
  push(x: number) {
    if (!Number.isFinite(x)) return;
    this.n++;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
  }
  get variance() {
    return this.n > 1 ? this.m2 / (this.n - 1) : 0;
  }
  get std() {
    return Math.sqrt(this.variance);
  }
}

/** Exponentially-decayed rate counter (events per minute). */
export class DecayRate {
  private value = 0;
  private last = 0;
  constructor(private halfLifeMs = 60_000) {}
  add(ts: number, amount = 1) {
    this.decay(ts);
    this.value += amount;
  }
  private decay(ts: number) {
    if (this.last === 0) {
      this.last = ts;
      return;
    }
    const dt = ts - this.last;
    if (dt > 0) {
      this.value *= Math.pow(0.5, dt / this.halfLifeMs);
      this.last = ts;
    }
  }
  /** Approximate events per minute at `ts`. */
  perMinute(ts: number) {
    this.decay(ts);
    return (this.value * Math.LN2 * 60_000) / this.halfLifeMs;
  }
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * clamp(q, 0, 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.96): { lo: number; hi: number; p: number } {
  if (n === 0) return { lo: 0, hi: 1, p: NaN };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), p };
}

/** Mean with a normal-approximation 95% interval. */
export function meanCI(xs: number[]): { mean: number; lo: number; hi: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, n };
  const m = mean(xs);
  if (n === 1) return { mean: m, lo: -Infinity, hi: Infinity, n };
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  const se = Math.sqrt(v / (n - 1) / n);
  return { mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se, n };
}

/** The hour a moment falls in: coins bought in the same hour share the market's mood. */
export const hourOf = (ts: number) => Math.floor(ts / 3_600_000);

/**
 * Mean with a two-sided range at `level`, counting the evidence per cluster (for outcomes: the
 * hour the coin was bought — one hot hour of the market lifts every coin in it, so it is one
 * piece of evidence, not dozens). The range is the wider of trade by trade (Student's t) and
 * hour by hour (cluster-robust standard error, Student's t for the number of hours), so it is
 * never more confident than either. Fewer than 2 clusters: no range.
 */
export function clusteredMeanCI(xs: ArrayLike<number>, cluster: ArrayLike<number>, level = 0.95): { mean: number; lo: number; hi: number; n: number; clusters: number } {
  const n = xs.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, n, clusters: 0 };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += xs[i]!;
  const m = sum / n;
  const by = new Map<number, number>();
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i]! - m;
    sq += d * d;
    by.set(cluster[i]!, (by.get(cluster[i]!) ?? 0) + d);
  }
  const c = by.size;
  if (n < 2 || c < 2) return { mean: m, lo: -Infinity, hi: Infinity, n, clusters: c };
  const q = 1 - (1 - level) / 2;
  let cs = 0;
  for (const v of by.values()) cs += v * v;
  const half = Math.max(tInv(q, n - 1) * Math.sqrt(sq / (n - 1) / n), tInv(q, c - 1) * Math.sqrt((cs / (n * n)) * (c / (c - 1))));
  return { mean: m, lo: m - half, hi: m + half, n, clusters: c };
}

/** Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  if (q < 0.02425) {
    const t = Math.sqrt(-2 * Math.log(q));
    return (((((c[0]! * t + c[1]!) * t + c[2]!) * t + c[3]!) * t + c[4]!) * t + c[5]!) / ((((d[0]! * t + d[1]!) * t + d[2]!) * t + d[3]!) * t + 1);
  }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const t = q - 0.5;
  const r = t * t;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * t) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/**
 * Student's t quantile for `df` degrees of freedom and p ≥ 0.5: exact for 1 and 2, otherwise the
 * Cornish–Fisher expansion around the normal quantile (within 0.5% from 4 degrees of freedom at
 * the levels used here; at 3 it errs on the cautious side).
 */
export function tInv(p: number, df: number): number {
  if (!(df >= 1)) return Infinity;
  if (df === 1) return Math.tan(Math.PI * (p - 0.5));
  if (df === 2) {
    const a = 2 * p - 1;
    return a * Math.sqrt(2 / (1 - a * a));
  }
  const z = normInv(p);
  const z2 = z * z;
  const g1 = (z * (z2 + 1)) / 4;
  const g2 = (z * ((5 * z2 + 16) * z2 + 3)) / 96;
  const g3 = (z * (((3 * z2 + 19) * z2 + 17) * z2 - 15)) / 384;
  const g4 = (z * ((((79 * z2 + 776) * z2 + 1482) * z2 - 1920) * z2 - 945)) / 92_160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

/** Format lamports as SOL with sensible precision. */
export function sol(lamports: number, digits = 3): string {
  return (lamports / 1e9).toFixed(digits);
}

export function shortAddr(a: string | undefined): string {
  if (!a) return "?";
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
