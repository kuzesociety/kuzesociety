/**
 * Agent-based pump.fun market simulator.
 *
 * Produces the same events the live feeds produce (create / curve trades / complete /
 * migrate / PumpSwap swaps / metadata), priced with the exact curve + pool math, so the
 * whole engine can be exercised end-to-end without network access.
 *
 * It is a TEST WORLD, not a forecast: its purpose is to prove the machinery works —
 * that the bot enters and exits correctly under stress, that learning finds an edge
 * when one exists (`predictability` > 0) and refuses to invent one when it does not
 * (`predictability` = 0). Nothing measured here says anything about real profits.
 *
 * Agents: devs (honest / rug / slow-rug, some serial), launch bundlers, block-1
 * snipers, retail buyers (log-normal size), take-profit and panic sellers, and "smart"
 * wallets that see a token's hidden quality early (only when predictability > 0).
 */
import {
  CURVE,
  LAMPORTS_PER_SOL,
  curveBuyQuote,
  curveMcapSol,
  curveSellQuote,
  newCurve,
  poolBuyQuote,
  poolSellQuote,
  type CurveState,
  type PoolState,
} from "../core/curve.js";
import { base58Encode } from "../core/codec.js";
import type { AmmSwap, MarketEvent } from "../core/types.js";
import { rng as mkRng } from "../core/util.js";

export interface SimOptions {
  seed: number;
  startTs: number;
  durationMs: number;
  launchesPerMin: number;
  /** 0 = early data says nothing about the future; 1 = early flow and smart money reveal quality */
  predictability: number;
  smartWallets: number;
  retailWallets: number;
  stepMs: number;
}

export const DEFAULT_SIM: SimOptions = {
  seed: 42,
  startTs: Date.UTC(2026, 8, 1, 14, 0, 0),
  durationMs: 60 * 60_000,
  launchesPerMin: 6,
  predictability: 0.7,
  smartWallets: 40,
  retailWallets: 4000,
  stepMs: 250,
};

type DevType = "honest" | "rug" | "slow";

interface Bag {
  tokens: number;
  costSol: number;
  boughtAt: number;
  kind: "retail" | "sniper" | "bundle" | "smart" | "dev";
  target: number;
}

interface SimToken {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  bondingCurve: string;
  pool?: string;
  createdAt: number;
  q: number;
  qEarly: number;
  devType: DevType;
  devSellAt: number;
  curve: CurveState;
  poolState?: PoolState;
  stage: "curve" | "amm";
  bags: Map<string, Bag>;
  excitation: number;
  peakMcap: number;
  dead: boolean;
  smartChecked: boolean;
  lastTradeAt: number;
  poolOpenAt?: number;
}

export interface TruthRow {
  mint: string;
  q: number;
  qEarly: number;
  devType: DevType;
  graduated: boolean;
  peakMcapSol: number;
}

const WORDS = [
  "pepe", "doge", "cat", "frog", "moon", "chad", "wojak", "bonk", "milady", "jeet", "sigma", "based", "goat", "pnut",
  "hawk", "tuah", "jean", "phil", "dance", "grok", "neiro", "shib", "floki", "kitty", "bull", "bear", "pump", "wif",
  "hat", "gigachad", "retard", "fartcoin", "ai", "agent", "trump", "elon", "zerebro", "luna", "banana", "monkey", "ape",
  "penguin", "pengu", "turbo", "brett", "andy", "landwolf", "mog", "popcat", "michi", "mew", "slerf", "ponke", "giga",
  "spx", "ansem", "orca", "fish", "whale", "dragon", "tiger", "panda", "duck", "chicken", "hamster", "capybara", "otter",
];

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}

function lognormal(r: () => number, mu: number, sigma: number) {
  const u = Math.max(1e-12, r());
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(mu + sigma * z);
}

function poisson(r: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= r();
    } while (p > L);
    return k - 1;
  }
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

export class MarketSim {
  readonly opts: SimOptions;
  private r: () => number;
  private tokens: SimToken[] = [];
  private active: SimToken[] = [];
  private retail: string[] = [];
  private smart: string[] = [];
  private devs: string[] = [];
  private recentNames: { ts: number; name: string; symbol: string }[] = [];
  private now: number;
  private slot0 = 300_000_000;
  truth = new Map<string, TruthRow>();

  constructor(opts: Partial<SimOptions> = {}) {
    this.opts = { ...DEFAULT_SIM, ...opts };
    this.r = mkRng(this.opts.seed);
    this.now = this.opts.startTs;
    for (let i = 0; i < this.opts.retailWallets; i++) this.retail.push(this.key());
    for (let i = 0; i < this.opts.smartWallets; i++) this.smart.push(this.key());
    for (let i = 0; i < 300; i++) this.devs.push(this.key());
  }

  private key(): string {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = Math.floor(this.r() * 256);
    b[0] = 1 + (b[0]! % 250); // never the all-zero default key
    return base58Encode(b);
  }

  private slot(ts: number) {
    return this.slot0 + Math.floor((ts - this.opts.startTs) / 400);
  }

  /** Generate the full event stream in time order. */
  *run(): Generator<MarketEvent | AmmSwap> {
    const end = this.opts.startTs + this.opts.durationMs;
    const step = this.opts.stepMs;
    const launchP = (this.opts.launchesPerMin * step) / 60_000;
    for (let ts = this.opts.startTs; ts < end; ts += step) {
      this.now = ts;
      const batch: (MarketEvent | AmmSwap)[] = [];
      let n = poisson(this.r, launchP);
      while (n-- > 0) this.launch(ts + Math.floor(this.r() * step), batch);
      for (const t of this.active) if (!t.dead) this.stepToken(t, ts, step, batch);
      if (this.active.length > 400 || ts % 10_000 < step) this.active = this.active.filter((t) => !t.dead);
      batch.sort((a, b) => a.ts - b.ts);
      for (const ev of batch) yield ev;
    }
  }

  private newName(ts: number): { name: string; symbol: string } {
    this.recentNames = this.recentNames.filter((x) => ts - x.ts < 15 * 60_000);
    if (this.recentNames.length > 0 && this.r() < 0.22) {
      const c = pick(this.r, this.recentNames);
      return { name: c.name + (this.r() < 0.5 ? "" : " " + pick(this.r, ["2.0", "CTO", "official", "sol"])), symbol: c.symbol };
    }
    const w1 = pick(this.r, WORDS);
    const w2 = this.r() < 0.5 ? pick(this.r, WORDS) : "";
    const name = (w1[0]!.toUpperCase() + w1.slice(1) + (w2 ? " " + w2 : "")).slice(0, 30);
    const symbol = (w1 + (w2 ? w2.slice(0, 3) : "")).toUpperCase().slice(0, 10);
    return { name, symbol };
  }

  private launch(ts: number, out: (MarketEvent | AmmSwap)[]) {
    const r = this.r;
    const { name, symbol } = this.newName(ts);
    // hidden quality: heavy-tailed attention
    const q = Math.min(40, lognormal(r, -2.4, 1.45));
    const pr = this.opts.predictability;
    const noise = Math.min(40, lognormal(r, -2.4, 1.45));
    const qEarly = pr * q + (1 - pr) * noise;
    const serial = r() < 0.25;
    const creator = serial ? this.devs[Math.floor(r() * 20)]! : pick(r, this.devs);
    const devType: DevType = r() < (serial ? 0.7 : 0.35) ? "rug" : r() < 0.5 ? "slow" : "honest";
    const t: SimToken = {
      mint: this.key(),
      name,
      symbol,
      creator,
      bondingCurve: this.key(),
      createdAt: ts,
      q,
      qEarly,
      devType,
      devSellAt: ts + (devType === "rug" ? 20_000 + r() * 300_000 : 600_000 + r() * 3_600_000),
      curve: newCurve(),
      stage: "curve",
      bags: new Map(),
      excitation: 0,
      peakMcap: 28,
      dead: false,
      smartChecked: false,
      lastTradeAt: ts,
    };
    this.tokens.push(t);
    this.active.push(t);
    this.recentNames.push({ ts, name, symbol });
    this.truth.set(t.mint, { mint: t.mint, q, qEarly, devType, graduated: false, peakMcapSol: 28 });
    const slot = this.slot(ts);
    out.push({
      k: "create",
      ts,
      slot,
      sig: this.key(),
      src: "sim",
      chainTs: Math.floor(ts / 1000),
      mint: t.mint,
      name,
      symbol,
      uri: `https://ipfs.io/ipfs/sim${t.mint.slice(0, 10)}`,
      creator,
      user: creator,
      vSol: CURVE.initialVirtualSol,
      vTok: CURVE.initialVirtualTok,
      realTok: CURVE.initialRealTok,
      supply: CURVE.supply,
    });
    // dev buy in the create transaction
    const devSol = r() < 0.15 ? 0 : Math.min(4, lognormal(r, -0.7, 0.8));
    if (devSol > 0.01) this.buy(t, creator, devSol, ts, slot, "dev", out);
    // launch bundle (same slot)
    if (r() < (devType === "rug" ? 0.55 : 0.2)) {
      const n = 2 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) this.buy(t, this.key(), 0.3 + r() * 2, ts, slot, "bundle", out);
    }
    // metadata (socials correlate weakly with quality)
    const socialP = Math.min(0.9, 0.2 + 0.25 * qEarly);
    out.push({
      k: "meta",
      ts: ts + 800 + Math.floor(r() * 1500),
      mint: t.mint,
      src: "sim",
      twitter: r() < socialP ? (r() < 0.4 ? `https://x.com/${symbol.toLowerCase()}/status/${1800000000000000000 + Math.floor(r() * 1e15)}` : `https://x.com/${symbol.toLowerCase()}`) : undefined,
      telegram: r() < socialP * 0.6 ? `https://t.me/${symbol.toLowerCase()}` : undefined,
      website: r() < socialP * 0.4 ? `https://${symbol.toLowerCase()}.fun` : undefined,
      description: `${name} to the moon`,
    });
  }

  private mcap(t: SimToken): number {
    if (t.stage === "amm" && t.poolState) return (t.poolState.quote * t.poolState.supply) / t.poolState.base / LAMPORTS_PER_SOL;
    return curveMcapSol(t.curve);
  }

  private priceOf(t: SimToken): number {
    if (t.stage === "amm" && t.poolState) return t.poolState.quote / t.poolState.base;
    return t.curve.vSol / t.curve.vTok;
  }

  private stepToken(t: SimToken, ts: number, step: number, out: (MarketEvent | AmmSwap)[]) {
    const r = this.r;
    const age = (ts - t.createdAt) / 1000;
    const dt = step / 1000;
    const qPhase = age < 90 ? t.qEarly : t.q;
    const life = 60 + 900 * Math.min(1, t.q / 4);
    let attention = qPhase * Math.exp(-age / life);
    if (t.stage === "amm") attention *= 0.6;
    t.excitation *= Math.pow(0.5, dt / 20);
    // self-exciting demand (Hawkes, branching ratio ≈ 0.6 so it cannot explode)
    const buyRate = 0.9 * attention + t.excitation;
    const nBuys = Math.min(40, poisson(r, buyRate * dt));
    const slot = this.slot(ts);
    // snipers in the first slots
    if (age < 1.2 && r() < 0.35) this.buy(t, this.key(), 0.2 + r() * 1.5, ts + Math.floor(r() * step), slot + 1, "sniper", out);
    for (let i = 0; i < nBuys; i++) {
      const size = Math.min(25, lognormal(r, -1.6, 1.0));
      this.buy(t, pick(r, this.retail), size, ts + Math.floor(r() * step), slot, "retail", out);
      t.excitation += 0.02;
    }
    // smart money: sees true quality early (edge world only)
    if (!t.smartChecked && age > 8 && age < 60) {
      t.smartChecked = true;
      const pr = this.opts.predictability;
      const informed = Math.min(0.95, 0.03 + pr * 0.35 * Math.max(0, Math.log(t.q + 1)));
      const p = pr > 0 ? informed : 0.06;
      const k = poisson(r, p * 3);
      for (let i = 0; i < k; i++) this.buy(t, pick(r, this.smart), 0.5 + r() * 2.5, ts + Math.floor(r() * step), slot, "smart", out);
    }
    // holders decide once per second
    if (Math.floor(ts / 1000) !== Math.floor((ts - step) / 1000)) {
      const price = this.priceOf(t);
      const m = this.mcap(t);
      if (m > t.peakMcap) t.peakMcap = m;
      const dd = 1 - m / t.peakMcap;
      for (const [wallet, bag] of t.bags) {
        if (bag.tokens <= 0) continue;
        const mult = bag.costSol > 0 ? (price * bag.tokens * 0.975) / (bag.costSol * LAMPORTS_PER_SOL) : 1;
        let hazard = 1 / 900;
        if (bag.kind === "sniper") hazard = mult > bag.target || age > 90 ? 0.3 : 1 / 120;
        else if (bag.kind === "bundle") hazard = mult > 1.4 || age > 120 ? 0.25 : 1 / 200;
        else if (bag.kind === "smart") hazard = mult > bag.target ? 0.2 : dd > 0.45 ? 0.08 : 1 / 1200;
        else if (bag.kind === "dev") {
          if (t.devType === "rug" && ts >= t.devSellAt) hazard = 1;
          else if (t.devType === "slow" && mult > 1.5) hazard = 1 / 60;
          else hazard = ts >= t.devSellAt ? 0.05 : 0;
        } else {
          hazard *= 1 + 2.5 * Math.max(0, mult - 1) + 6 * dd * dd;
          if (mult > bag.target) hazard += 0.05;
        }
        if (r() < 1 - Math.exp(-hazard)) {
          const frac = bag.kind === "dev" || bag.kind === "bundle" || r() < 0.6 ? 1 : 0.3 + r() * 0.5;
          this.sell(t, wallet, Math.floor(bag.tokens * frac), ts + Math.floor(r() * step), slot, out);
        }
      }
    }
    // death: attention gone and nobody trading
    const idle = ts - t.lastTradeAt;
    if ((buyRate < 0.01 && idle > 180_000) || idle > 1_800_000 || age > 6 * 3600) t.dead = true;
  }

  private valueOf(t: SimToken, tokens: number): number {
    if (t.stage === "amm" && t.poolState) return poolSellQuote(t.poolState, tokens).solOut / LAMPORTS_PER_SOL;
    return curveSellQuote(t.curve, tokens).solOut / LAMPORTS_PER_SOL;
  }

  private buy(t: SimToken, wallet: string, sol: number, ts: number, slot: number, kind: Bag["kind"], out: (MarketEvent | AmmSwap)[]) {
    const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
    if (t.stage === "curve") {
      const q = curveBuyQuote(t.curve, lamports);
      if (q.tokensOut <= 0) return;
      t.curve = q.after;
      this.addBag(t, wallet, q.tokensOut, q.solSpent / LAMPORTS_PER_SOL, ts, kind);
      out.push({
        k: "trade",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1000),
        mint: t.mint,
        buy: true,
        sol: q.solToCurve,
        tok: q.tokensOut,
        user: wallet,
        venue: "curve",
        vSol: t.curve.vSol,
        vTok: t.curve.vTok,
        realSol: t.curve.vSol - CURVE.initialVirtualSol,
        realTok: t.curve.realTok,
        supply: t.curve.supply,
        fee: q.feeLamports,
      });
      t.lastTradeAt = ts;
      if (t.curve.realTok <= 0) this.graduate(t, ts, slot, out);
    } else if (t.poolState) {
      if (ts < (t.poolOpenAt ?? 0)) ts = t.poolOpenAt!;
      const pre = { ...t.poolState };
      const q = poolBuyQuote(t.poolState, lamports);
      if (q.tokensOut <= 0) return;
      t.poolState = { ...t.poolState, base: q.after.vTok, quote: q.after.vSol };
      this.addBag(t, wallet, q.tokensOut, q.solSpent / LAMPORTS_PER_SOL, ts, kind);
      out.push({
        k: "ammSwap",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1000),
        pool: t.pool!,
        buy: true,
        base: q.tokensOut,
        quoteDelta: q.solToCurve,
        fee: q.feeLamports,
        user: wallet,
        poolBase: pre.base,
        poolQuote: pre.quote,
        virtualQuote: 0,
        supply: t.poolState.supply,
      });
      t.lastTradeAt = ts;
    }
    const m = this.mcap(t);
    const tr = this.truth.get(t.mint)!;
    if (m > tr.peakMcapSol) tr.peakMcapSol = m;
  }

  private addBag(t: SimToken, wallet: string, tokens: number, costSol: number, ts: number, kind: Bag["kind"]) {
    const b = t.bags.get(wallet);
    const r = this.r;
    const target = kind === "sniper" ? 1.5 + r() * 2 : kind === "smart" ? 2 + r() * 4 : kind === "retail" ? 1.5 + lognormal(r, 0, 0.8) : 99;
    if (b) {
      b.tokens += tokens;
      b.costSol += costSol;
    } else t.bags.set(wallet, { tokens, costSol, boughtAt: ts, kind, target });
  }

  private sell(t: SimToken, wallet: string, tokens: number, ts: number, slot: number, out: (MarketEvent | AmmSwap)[]) {
    const bag = t.bags.get(wallet);
    if (!bag || tokens <= 0) return;
    tokens = Math.min(tokens, bag.tokens);
    if (t.stage === "curve") {
      const q = curveSellQuote(t.curve, tokens);
      if (q.solFromCurve <= 0) return;
      t.curve = q.after;
      bag.costSol *= 1 - tokens / bag.tokens;
      bag.tokens -= tokens;
      out.push({
        k: "trade",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1000),
        mint: t.mint,
        buy: false,
        sol: q.solFromCurve,
        tok: tokens,
        user: wallet,
        venue: "curve",
        vSol: t.curve.vSol,
        vTok: t.curve.vTok,
        realSol: t.curve.vSol - CURVE.initialVirtualSol,
        realTok: t.curve.realTok,
        supply: t.curve.supply,
        fee: q.feeLamports,
      });
    } else if (t.poolState) {
      if (ts < (t.poolOpenAt ?? 0)) ts = t.poolOpenAt!;
      const pre = { ...t.poolState };
      const q = poolSellQuote(t.poolState, tokens);
      if (q.solOut <= 0) return;
      t.poolState = { ...t.poolState, base: q.after.vTok, quote: q.after.vSol };
      bag.costSol *= 1 - tokens / bag.tokens;
      bag.tokens -= tokens;
      out.push({
        k: "ammSwap",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1000),
        pool: t.pool!,
        buy: false,
        base: tokens,
        quoteDelta: q.solFromCurve,
        fee: q.feeLamports,
        user: wallet,
        poolBase: pre.base,
        poolQuote: pre.quote,
        virtualQuote: 0,
        supply: t.poolState.supply,
      });
    }
    if (bag.tokens <= 0) t.bags.delete(wallet);
    t.lastTradeAt = ts;
  }

  private graduate(t: SimToken, ts: number, slot: number, out: (MarketEvent | AmmSwap)[]) {
    t.stage = "amm";
    t.pool = this.key();
    const realSol = t.curve.vSol - CURVE.initialVirtualSol;
    const quote = Math.max(1, realSol - 15_000_001);
    const base = CURVE.supply - CURVE.initialRealTok;
    t.poolState = { base, quote, supply: CURVE.supply, hasCreator: true };
    const tr = this.truth.get(t.mint)!;
    tr.graduated = true;
    t.excitation += 0.6; // graduation brings visibility
    out.push({ k: "complete", ts: ts + 1, slot, sig: this.key(), src: "sim", mint: t.mint });
    out.push({ k: "migrate", ts: ts + 2, slot, sig: this.key(), src: "sim", mint: t.mint, pool: t.pool, solAmount: quote, mintAmount: base });
    out.push({ k: "pool", ts: ts + 2, slot, sig: this.key(), src: "sim", pool: t.pool, mint: t.mint, quoteIsSol: true, base, quote, coinCreator: t.creator });
    t.poolOpenAt = ts + 3;
  }

  get launched() {
    return this.tokens.length;
  }
}
