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
