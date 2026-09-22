/**
 * Wallet intelligence learned from the trade stream: realized results per wallet
 * (closed token positions), sniper/bundler behaviour and creator track records.
 * "Smart" wallets are the ones with a statistically credible positive record —
 * a small, earned list, not a paid leaderboard.
 */
import { LRU, clamp } from "./util.js";

export interface WalletStats {
  first: number;
  last: number;
  buys: number;
  sells: number;
  tokens: number;
  closed: number;
  wins: number;
  /** realized SOL profit over closed positions */
  pnl: number;
  /** sum of per-position ROI, each clipped to [-1, 5] */
  roiSum: number;
  early: number;
  bundles: number;
  creates: number;
}

export interface CreatorStats {
  launches: number;
  lastLaunch: number;
  recent: number[];
  best: number;
  graduated: number;
}

export interface WalletView extends WalletStats {
  address: string;
  winRate: number;
  avgRoi: number;
  smart: boolean;
  tags: string[];
}

export class WalletBook {
  private wallets: LRU<string, WalletStats>;
  private creators: LRU<string, CreatorStats>;
  private smartSet = new Set<string>();
  /** first time the book started observing (for "fresh wallet" confidence) */
  readonly startedAt: number;

  constructor(now: number, opts: { maxWallets?: number; maxCreators?: number } = {}) {
    this.startedAt = now;
    this.wallets = new LRU(opts.maxWallets ?? 250_000);
    this.creators = new LRU(opts.maxCreators ?? 60_000);
  }

  get size() {
    return this.wallets.size;
  }

  peek(addr: string) {
    return this.wallets.peek(addr);
  }

  /** Records a buy/sell; returns whether the wallet was unknown before this trade. */
  touch(addr: string, ts: number, buy: boolean): { fresh: boolean; known: boolean } {
    let w = this.wallets.get(addr);
    const known = !!w && w.buys + w.sells > 0;
    if (!w) {
      w = { first: ts, last: ts, buys: 0, sells: 0, tokens: 0, closed: 0, wins: 0, pnl: 0, roiSum: 0, early: 0, bundles: 0, creates: 0 };
      this.wallets.set(addr, w);
    }
    // A wallet is only "fresh" once we have watched long enough to know it is new.
    const observedLongEnough = ts - this.startedAt > 45 * 60_000;
    const fresh = observedLongEnough && !known && ts - w.first < 10 * 60_000;
    w.last = ts;
    if (buy) w.buys++;
    else w.sells++;
    return { fresh, known };
  }

  noteNewPosition(addr: string, early: boolean, bundle: boolean) {
    const w = this.wallets.peek(addr);
    if (!w) return;
    w.tokens++;
    if (early) w.early++;
    if (bundle) w.bundles++;
  }

  /** Close a wallet's position in a token (sold out, or token evicted). */
  closePosition(addr: string, boughtSol: number, soldSol: number, remainingValueSol: number) {
    const w = this.wallets.peek(addr);
    if (!w || boughtSol <= 0) return;
    const proceeds = soldSol + Math.max(0, remainingValueSol);
    const pnl = proceeds - boughtSol;
    w.closed++;
    if (pnl > 0) w.wins++;
    w.pnl += pnl;
    w.roiSum += clamp(proceeds / boughtSol - 1, -1, 5);
    if (WalletBook.isSmart(w)) this.smartSet.add(addr);
    else this.smartSet.delete(addr);
  }

  noteCreate(creator: string, ts: number) {
    let c = this.creators.get(creator);
    if (!c) {
      c = { launches: 0, lastLaunch: 0, recent: [], best: 0, graduated: 0 };
      this.creators.set(creator, c);
    }
    c.launches++;
    c.lastLaunch = ts;
    c.recent.push(ts);
    if (c.recent.length > 50) c.recent.splice(0, c.recent.length - 50);
    const w = this.wallets.peek(creator);
    if (w) w.creates++;
  }

  noteCreatorResult(creator: string, peakMcapSol: number, graduated: boolean) {
    const c = this.creators.peek(creator);
    if (!c) return;
    if (peakMcapSol > c.best) c.best = peakMcapSol;
    if (graduated) c.graduated++;
  }

  creator(creator: string, now: number): { launches24h: number; launches: number; best: number; graduated: number } {
    const c = this.creators.peek(creator);
    if (!c) return { launches24h: 0, launches: 0, best: 0, graduated: 0 };
    let n = 0;
    for (const t of c.recent) if (now - t < 86_400_000) n++;
    return { launches24h: n, launches: c.launches, best: c.best, graduated: c.graduated };
  }

  static isSmart(w: WalletStats): boolean {
    if (w.closed < 8) return false;
    if (w.creates > 3) return false;
    // Bayesian win rate with a pessimistic prior (1 win in 4): luck across thousands of
    // wallets produces false "smart money", so the bar is deliberately high
    const winRate = (w.wins + 1) / (w.closed + 4);
    const avgRoi = w.roiSum / w.closed;
    return winRate >= 0.55 && avgRoi >= 0.3 && w.pnl >= 1;
  }

  isSmart(addr: string): boolean {
    if (!this.smartSet.has(addr)) return false;
    if (this.wallets.peek(addr)) return true;
    this.smartSet.delete(addr); // evicted from the book
    return false;
  }

  smartCount() {
    return this.smartSet.size;
  }

  /** Memory relief: forget the least recently active wallets, keeping ones with a track record. */
  trim(keepFraction: number): number {
    const target = Math.floor(this.wallets.size * clamp(keepFraction, 0, 1));
    const dropped = this.wallets.shrinkTo(target, (a, w) => w.closed >= 3 || w.creates >= 1 || this.smartSet.has(a));
    for (const a of this.smartSet) if (!this.wallets.peek(a)) this.smartSet.delete(a);
    return dropped;
  }

  view(addr: string, w: WalletStats): WalletView {
    const winRate = w.closed ? w.wins / w.closed : 0;
    const avgRoi = w.closed ? w.roiSum / w.closed : 0;
    const tags: string[] = [];
    const smart = WalletBook.isSmart(w);
    if (smart) tags.push("smart");
    if (w.tokens >= 5 && w.early / w.tokens > 0.6) tags.push("sniper");
    if (w.tokens >= 3 && w.bundles / w.tokens > 0.5) tags.push("bundler");
    if (w.creates >= 3) tags.push("serial-dev");
    return { address: addr, ...w, winRate, avgRoi, smart, tags };
  }

  /** Top wallets by realized profit among those with enough closed positions. */
  leaderboard(limit = 50, minClosed = 5): WalletView[] {
    const rows: WalletView[] = [];
    for (const [addr, w] of this.wallets.entries()) if (w.closed >= minClosed) rows.push(this.view(addr, w));
    rows.sort((a, b) => b.pnl - a.pnl);
    return rows.slice(0, limit);
  }

  /** Serializable snapshot of wallets worth keeping (enough history). */
  snapshot(): { wallets: [string, WalletStats][]; creators: [string, CreatorStats][] } {
    const wallets: [string, WalletStats][] = [];
    for (const [a, w] of this.wallets.entries()) if (w.closed >= 2 || w.creates >= 1) wallets.push([a, w]);
    const creators: [string, CreatorStats][] = [];
    for (const [a, c] of this.creators.entries()) creators.push([a, c]);
    return { wallets, creators };
  }

  restore(snap: { wallets?: [string, WalletStats][]; creators?: [string, CreatorStats][] }) {
    for (const [a, w] of snap.wallets ?? []) if (a && w && typeof w.closed === "number") this.wallets.set(a, w);
    for (const [a, c] of snap.creators ?? []) if (a && c && Array.isArray(c.recent)) this.creators.set(a, c);
    this.smartSet.clear();
    for (const [a, w] of this.wallets.entries()) if (WalletBook.isSmart(w)) this.smartSet.add(a);
  }
}
