/**
 * Live state of one token, rebuilt from the event stream: reserves, market cap, flow
 * windows, holder balances (reconstructed from curve/pool trades), dev, bundle and
 * early-buyer behaviour. Everything the scorer needs is derived from here.
 */
import { CURVE, LAMPORTS_PER_SOL, curveMcapSol, curvePriceSol, curveProgress, poolMcapSol, poolPriceSol } from "./curve.js";
import type { CreateEvent, MetaEvent, QuoteEvent, TradeEvent, Venue } from "./types.js";
import { Ring } from "./util.js";

export type Stage = "curve" | "migrating" | "amm";

export interface Holder {
  /** raw token balance reconstructed from observed trades */
  bal: number;
  maxBal: number;
  boughtSol: number;
  soldSol: number;
  firstBuy: number;
  lastBuy: number;
  early: boolean;
  bundle: boolean;
  fresh: boolean;
}

export interface TradeRow {
  ts: number;
  buy: boolean;
  sol: number;
  user: string;
  mcap: number;
}

const BUCKET_MS = 5_000;
const BUCKETS = 144; // 12 minutes

interface Bucket {
  t: number;
  buySol: number;
  sellSol: number;
  buyN: number;
  sellN: number;
  close: number;
  high: number;
  low: number;
}

export const MAX_HOLDERS_TRACKED = 6_000;

export interface TokenMeta {
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  image?: string;
  dexProfile?: boolean;
  boosts?: number;
  fetchedAt?: number;
}

export class TokenState {
  readonly mint: string;
  name = "";
  symbol = "";
  uri = "";
  creator = "";
  createdAt: number;
  createSlot?: number;
  createSig?: string;
  /** true when first seen through a trade, not the create event */
  partial = false;
  nonSol = false;
  stage: Stage = "curve";

  vSol: number = CURVE.initialVirtualSol;
  vTok: number = CURVE.initialVirtualTok;
  realTok: number = CURVE.initialRealTok;
  supply: number = CURVE.supply;
  pool?: string;
  poolBase = 0;
  poolQuote = 0;

  mcapSol = 0;
  priceSol = 0;
  firstMcapSol = 0;
  athMcapSol = 0;
  athAt = 0;
  lastTradeAt = 0;
  lastEventAt = 0;
  completeAt?: number;
  migrateAt?: number;

  tradeCount = 0;
  buyCount = 0;
  sellCount = 0;
  buySolTotal = 0;
  sellSolTotal = 0;
  uniqueBuyers = 0;

  holders = new Map<string, Holder>();
  devBal = 0;
  devMaxBal = 0;
  devSoldTok = 0;
  devBoughtSol = 0;
  bundleTok = 0;
  bundleBuyers = 0;
  earlyTok = 0;
  earlyBuyers = 0;
  freshBuys = 0;
  knownBuys = 0;
  maxBuySol = 0;

  meta: TokenMeta = {};
  quote?: QuoteEvent;
  trades = new Ring<TradeRow>(120);
  private buckets: Bucket[] = Array.from({ length: BUCKETS }, () => ({ t: -1, buySol: 0, sellSol: 0, buyN: 0, sellN: 0, close: 0, high: 0, low: 0 }));

  constructor(mint: string, ts: number) {
    this.mint = mint;
    this.createdAt = ts;
    this.lastEventAt = ts;
    this.refreshPrice();
    this.firstMcapSol = this.mcapSol;
    this.athMcapSol = this.mcapSol;
    this.athAt = ts;
  }

  static fromCreate(ev: CreateEvent): TokenState {
    const t = new TokenState(ev.mint, ev.ts);
    t.applyCreate(ev);
    return t;
  }

  applyCreate(ev: CreateEvent) {
    this.name = ev.name;
    this.symbol = ev.symbol;
    this.uri = ev.uri;
    this.creator = ev.creator;
    this.createdAt = ev.ts;
    this.createSlot = ev.slot;
    this.createSig = ev.sig;
    this.nonSol = !!ev.nonSolQuote;
    this.partial = false;
    if (ev.vTok > 0) {
      this.vSol = ev.vSol;
      this.vTok = ev.vTok;
      this.realTok = ev.realTok;
      this.supply = ev.supply;
    }
    this.refreshPrice();
    this.firstMcapSol = this.mcapSol;
    this.athMcapSol = Math.max(this.athMcapSol, this.mcapSol);
  }

  get ageMs() {
    return this.lastEventAt - this.createdAt;
  }

  get progress() {
    return this.stage === "curve" ? curveProgress(this) : 1;
  }

  /** lamports of real SOL in the curve (derived from virtual reserves) */
  get realSol() {
    return Math.max(0, this.vSol - CURVE.initialVirtualSol);
  }

  refreshPrice() {
    if (this.stage === "amm" && this.poolBase > 0) {
      const p = { base: this.poolBase, quote: this.poolQuote, supply: this.supply };
      this.mcapSol = poolMcapSol(p);
      this.priceSol = poolPriceSol(p);
    } else {
      this.mcapSol = curveMcapSol(this);
      this.priceSol = curvePriceSol(this);
    }
  }

  private bucketFor(ts: number): Bucket {
    const t0 = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
    const b = this.buckets[Math.floor(ts / BUCKET_MS) % BUCKETS]!;
    if (b.t !== t0) {
      b.t = t0;
      b.buySol = b.sellSol = b.buyN = b.sellN = 0;
      b.close = b.high = b.low = this.mcapSol;
    }
    return b;
  }

  /**
   * Apply a trade. `ctx.fresh` marks wallets never seen before (bundled alts);
   * `ctx.isDev` marks the creator's own trades.
   */
  applyTrade(ev: TradeEvent, ctx: { fresh: boolean; knownWallet: boolean }) {
    const ts = ev.ts;
    this.lastEventAt = Math.max(this.lastEventAt, ts);
    this.lastTradeAt = ts;
    this.tradeCount++;
    if (ev.venue === "amm") {
      if (this.stage !== "amm") {
        this.stage = "amm";
        this.migrateAt ??= ts;
      }
      if (ev.pool) this.pool = ev.pool;
      this.poolBase = ev.vTok;
      this.poolQuote = ev.vSol;
      if (ev.supply && ev.supply > 0) this.supply = ev.supply;
    } else if (this.stage === "curve") {
      this.vSol = ev.vSol;
      this.vTok = ev.vTok;
      if (ev.realTok !== undefined) this.realTok = ev.realTok;
      else this.realTok = Math.max(0, ev.vTok - (CURVE.initialVirtualTok - CURVE.initialRealTok));
      if (ev.supply && ev.supply > 0) this.supply = ev.supply;
    }
    this.refreshPrice();
    const m = this.mcapSol;
    if (this.firstMcapSol === 0) this.firstMcapSol = m;
    if (m > this.athMcapSol) {
      this.athMcapSol = m;
      this.athAt = ts;
    }

    const solAmt = ev.sol / LAMPORTS_PER_SOL;
    const b = this.bucketFor(ts);
    if (ev.buy) {
      this.buyCount++;
      this.buySolTotal += solAmt;
      b.buySol += solAmt;
      b.buyN++;
      if (solAmt > this.maxBuySol) this.maxBuySol = solAmt;
    } else {
      this.sellCount++;
      this.sellSolTotal += solAmt;
      b.sellSol += solAmt;
      b.sellN++;
    }
    b.close = m;
    if (m > b.high) b.high = m;
    if (m < b.low || b.low === 0) b.low = m;

    this.trades.push({ ts, buy: ev.buy, sol: solAmt, user: ev.user, mcap: m });
    this.applyHolder(ev, ctx);
  }

  private applyHolder(ev: TradeEvent, ctx: { fresh: boolean; knownWallet: boolean }) {
    const isDev = ev.user === this.creator;
    let h = this.holders.get(ev.user);
    if (!h) {
      if (!ev.buy) {
        // a seller we never saw buy (transfer or pre-history) — nothing to track
        if (isDev) this.devSoldTok += ev.tok;
        return;
      }
      this.uniqueBuyers++;
      if (ctx.fresh) this.freshBuys++;
      else if (ctx.knownWallet) this.knownBuys++;
      if (this.holders.size >= MAX_HOLDERS_TRACKED) return;
      const sinceCreate = ev.ts - this.createdAt;
      const bundle =
        !isDev &&
        !this.partial &&
        ((ev.slot !== undefined && this.createSlot !== undefined && ev.slot <= this.createSlot) ||
          ((ev.slot === undefined || this.createSlot === undefined) && sinceCreate <= 1_000));
      const early =
        !this.partial &&
        ((ev.slot !== undefined && this.createSlot !== undefined && ev.slot <= this.createSlot + 2) ||
          ((ev.slot === undefined || this.createSlot === undefined) && sinceCreate <= 3_000));
      h = { bal: 0, maxBal: 0, boughtSol: 0, soldSol: 0, firstBuy: ev.ts, lastBuy: ev.ts, early, bundle, fresh: ctx.fresh };
      this.holders.set(ev.user, h);
      if (bundle) this.bundleBuyers++;
      if (early && !isDev) this.earlyBuyers++;
    }
    const solAmt = ev.sol / LAMPORTS_PER_SOL;
    if (ev.buy) {
      h.bal += ev.tok;
      h.boughtSol += solAmt;
      h.lastBuy = ev.ts;
      if (h.bal > h.maxBal) h.maxBal = h.bal;
      if (h.bundle) this.bundleTok += ev.tok;
      if (h.early && !isDev) this.earlyTok += ev.tok;
      if (isDev) {
        this.devBal += ev.tok;
        this.devBoughtSol += solAmt;
        if (this.devBal > this.devMaxBal) this.devMaxBal = this.devBal;
      }
    } else {
      const sold = Math.min(h.bal, ev.tok);
      h.bal -= sold;
      h.soldSol += solAmt;
      if (h.bundle) this.bundleTok = Math.max(0, this.bundleTok - sold);
      if (h.early && !isDev) this.earlyTok = Math.max(0, this.earlyTok - sold);
      if (isDev) {
        this.devBal = Math.max(0, this.devBal - ev.tok);
        this.devSoldTok += ev.tok;
      }
    }
  }

  applyComplete(ts: number) {
    if (this.stage === "curve") this.stage = "migrating";
    this.completeAt ??= ts;
    this.realTok = 0;
    this.lastEventAt = Math.max(this.lastEventAt, ts);
  }

  applyMigrate(ts: number, pool?: string, base?: number, quote?: number) {
    this.stage = "amm";
    this.completeAt ??= ts;
    this.migrateAt ??= ts;
    if (pool) this.pool = pool;
    if (base && quote && base > 0 && quote > 0) {
      this.poolBase = base;
      this.poolQuote = quote;
      this.refreshPrice();
    }
    this.lastEventAt = Math.max(this.lastEventAt, ts);
  }

  applyMeta(ev: MetaEvent) {
    const m = this.meta;
    if (ev.twitter) m.twitter = ev.twitter;
    if (ev.telegram) m.telegram = ev.telegram;
    if (ev.website) m.website = ev.website;
    if (ev.description) m.description = ev.description.slice(0, 400);
    if (ev.image) m.image = ev.image;
    if (ev.dexProfile !== undefined) m.dexProfile = ev.dexProfile || m.dexProfile;
    if (ev.boosts !== undefined) m.boosts = Math.max(m.boosts ?? 0, ev.boosts);
    m.fetchedAt = ev.ts;
  }

  applyQuote(ev: QuoteEvent) {
    this.quote = ev;
    if (!this.name && ev.name) this.name = ev.name;
    if (!this.symbol && ev.symbol) this.symbol = ev.symbol;
    this.lastEventAt = Math.max(this.lastEventAt, ev.ts);
    // Off-chain quotes only drive price when no on-chain stream covers this token.
    if (ev.priceSol && ev.priceSol > 0 && this.tradeCount === 0) {
      this.priceSol = ev.priceSol;
      this.mcapSol = (ev.priceSol * this.supply) / 1e6;
      if (this.firstMcapSol === 0) this.firstMcapSol = this.mcapSol;
      if (this.mcapSol > this.athMcapSol) {
        this.athMcapSol = this.mcapSol;
        this.athAt = ev.ts;
      }
    }
  }

  /** Aggregate flow over the trailing window (ms). */
  window(now: number, ms: number, endAgoMs = 0) {
    const from = now - ms - endAgoMs;
    const to = now - endAgoMs;
    let buySol = 0;
    let sellSol = 0;
    let buyN = 0;
    let sellN = 0;
    for (const b of this.buckets) {
      if (b.t < 0 || b.t + BUCKET_MS <= from || b.t > to) continue;
      buySol += b.buySol;
      sellSol += b.sellSol;
      buyN += b.buyN;
      sellN += b.sellN;
    }
    return { buySol, sellSol, buyN, sellN, net: buySol - sellSol, n: buyN + sellN };
  }

  /** Market cap (SOL) as of `agoMs` before `now`, from bucket closes. */
  mcapAgo(now: number, agoMs: number): number {
    const target = now - agoMs;
    let best: Bucket | undefined;
    for (const b of this.buckets) {
      if (b.t < 0 || b.t > target) continue;
      if (!best || b.t > best.t) best = b;
    }
    if (best) return best.close;
    return target <= this.createdAt ? this.firstMcapSol || this.mcapSol : this.mcapSol;
  }

  /** Unique buyers whose latest buy is within the window. */
  uniqueBuyersSince(since: number): number {
    let n = 0;
    for (const h of this.holders.values()) if (h.lastBuy >= since) n++;
    return n;
  }

  private scanCache = { at: -1, recentMs: 0, withSmart: false, uniqRecent: 0, smart: 0, top10: 0, top1: 0, holders: 0 };

  /**
   * One pass over holders: recent unique buyers, smart holders, top-1/top-10 share of
   * supply (curve/pool excluded) and live holder count. Cached for `maxAgeMs`.
   */
  scanHolders(now: number, recentMs: number, isSmart: ((addr: string) => boolean) | null, maxAgeMs = 1_000) {
    const c = this.scanCache;
    if (c.at >= 0 && now - c.at < maxAgeMs && c.recentMs === recentMs && (c.withSmart || !isSmart)) return c;
    const since = now - recentMs;
    let uniq = 0;
    let smart = 0;
    let holders = 0;
    // top-10 by balance via a tiny sorted buffer (O(n), no full sort)
    const top: number[] = [];
    for (const [addr, h] of this.holders) {
      if (h.lastBuy >= since) uniq++;
      if (h.bal <= 0) continue;
      holders++;
      if (isSmart && isSmart(addr)) smart++;
      if (top.length < 10) {
        top.push(h.bal);
        if (top.length === 10) top.sort((a, b) => a - b);
      } else if (h.bal > top[0]!) {
        top[0] = h.bal;
        // restore ascending order (bubble the new element up)
        for (let i = 0; i < 9 && top[i]! > top[i + 1]!; i++) {
          const tmp = top[i]!;
          top[i] = top[i + 1]!;
          top[i + 1] = tmp;
        }
      }
    }
    let sum = 0;
    let max = 0;
    for (const b of top) {
      sum += b;
      if (b > max) max = b;
    }
    this.scanCache = { at: now, recentMs, withSmart: !!isSmart, uniqRecent: uniq, smart, top10: sum / this.supply, top1: max / this.supply, holders };
    return this.scanCache;
  }

  /** Top-1/top-10 holder share of total supply (curve/pool excluded); cached ~2 s. */
  concentration(now: number) {
    const c = this.scanHolders(now, 60_000, null, 2_000);
    return { at: c.at, top10: c.top10, top1: c.top1, holders: c.holders };
  }

  venue(): Venue {
    return this.stage === "amm" ? "amm" : "curve";
  }

  /** True when the token has had no activity for `idleMs`. */
  isIdle(now: number, idleMs: number) {
    return now - this.lastEventAt > idleMs;
  }

  toJSON() {
    return {
      mint: this.mint,
      name: this.name,
      symbol: this.symbol,
      creator: this.creator,
      stage: this.stage,
      createdAt: this.createdAt,
      mcapSol: this.mcapSol,
      athMcapSol: this.athMcapSol,
      progress: this.progress,
      trades: this.tradeCount,
      uniqueBuyers: this.uniqueBuyers,
      meta: this.meta,
    };
  }
}
