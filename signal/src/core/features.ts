/**
 * Feature extraction: turns a live TokenState (+ wallet, narrative and market context)
 * into the numbers the scorer uses. Raw values stay in human units for display; the
 * model applies the transforms defined in FEATURE_DEFS.
 */
import type { NarrativeIndex } from "./narratives.js";
import type { TokenState } from "./token.js";
import type { WalletBook } from "./wallets.js";
import { clamp, DecayRate } from "./util.js";

export interface RawFeatures {
  stage: "curve" | "amm";
  ageSec: number;
  mcapSol: number;
  progress: number;
  net60: number;
  net300: number;
  netPrev60: number;
  buys60: number;
  sells60: number;
  uniq60: number;
  uniqTotal: number;
  trades60: number;
  avgBuy300: number;
  whale300: number;
  devShare: number;
  devSold: number;
  bundleShare: number;
  earlyShare: number;
  top10: number;
  top1: number;
  holders: number;
  drawdown: number;
  chg30: number;
  chg120: number;
  smartBuyers: number;
  freshShare: number;
  socials: number;
  tweetLink: number;
  clusterSize: number;
  isLeader: number;
  isFirst: number;
  creatorLaunches24h: number;
  creatorBest: number;
  heat: number;
  hourUtc: number;
  sinceMigrateSec: number;
  liquiditySol: number;
  dexSignal: number;
}

/** Market-wide pulse: global buy/sell flow and launch rate (regime feature). */
export class MarketPulse {
  private buys = new DecayRate(5 * 60_000);
  private sells = new DecayRate(5 * 60_000);
  private launches = new DecayRate(10 * 60_000);
  private history: number[] = [];
  private lastSample = 0;

  onTrade(ts: number, buy: boolean, sol: number) {
    if (buy) this.buys.add(ts, sol);
    else this.sells.add(ts, sol);
  }
  onLaunch(ts: number) {
    this.launches.add(ts);
  }
  /** SOL per minute of net buying across all tracked tokens. */
  netPerMin(ts: number) {
    return this.buys.perMinute(ts) - this.sells.perMinute(ts);
  }
  launchesPerMin(ts: number) {
    return this.launches.perMinute(ts);
  }
  buyPerMin(ts: number) {
    return this.buys.perMinute(ts);
  }
  /** z-score of current buy volume vs the last ~24h of samples. */
  heat(ts: number): number {
    const v = this.buys.perMinute(ts);
    if (ts - this.lastSample > 60_000) {
      this.history.push(v);
      if (this.history.length > 1440) this.history.shift();
      this.lastSample = ts;
    }
    if (this.history.length < 10) return 0;
    let m = 0;
    for (const x of this.history) m += x;
    m /= this.history.length;
    let s = 0;
    for (const x of this.history) s += (x - m) ** 2;
    const sd = Math.sqrt(s / (this.history.length - 1));
    return sd > 0 ? clamp((v - m) / sd, -3, 3) : 0;
  }
}

export interface FeatureContext {
  now: number;
  wallets: WalletBook;
  narratives: NarrativeIndex;
  pulse: MarketPulse;
  mcapOf: (mint: string) => number;
}

export function extractFeatures(t: TokenState, ctx: FeatureContext): RawFeatures {
  const now = ctx.now;
  const w60 = t.window(now, 60_000);
  const w300 = t.window(now, 300_000);
  const prev60 = t.window(now, 60_000, 60_000);
  const scan = t.scanHolders(now, 60_000, (a) => ctx.wallets.isSmart(a));
  const conc = scan;

  let whaleMax = 0;
  for (let i = t.trades.length - 1; i >= 0; i--) {
    const r = t.trades.at(i)!;
    if (now - r.ts > 300_000) break;
    if (r.buy && r.sol > whaleMax) whaleMax = r.sol;
  }
  const smart = scan.smart;

  const observed = now - ctx.wallets.startedAt > 45 * 60_000;
  const freshShare = observed && t.uniqueBuyers > 0 ? t.freshBuys / t.uniqueBuyers : NaN;
  const narrative = ctx.narratives.describe(t.mint, ctx.mcapOf);
  const creator = t.creator ? ctx.wallets.creator(t.creator, now) : { launches24h: 0, best: 0, graduated: 0, launches: 0 };
  const m = t.meta;
  const socials = (m.twitter ? 1 : 0) + (m.telegram ? 1 : 0) + (m.website ? 1 : 0);
  const mcap = t.mcapSol > 0 ? t.mcapSol : 1e-9;
  const ago30 = t.mcapAgo(now, 30_000);
  const ago120 = t.mcapAgo(now, 120_000);
  const hour = new Date(now).getUTCHours() + new Date(now).getUTCMinutes() / 60;

  return {
    stage: t.stage === "amm" ? "amm" : "curve",
    ageSec: Math.max(0, (now - t.createdAt) / 1000),
    mcapSol: t.mcapSol,
    progress: t.progress,
    net60: w60.net,
    net300: w300.net,
    netPrev60: prev60.net,
    buys60: w60.buyN,
    sells60: w60.sellN,
    uniq60: scan.uniqRecent,
    uniqTotal: t.uniqueBuyers,
    trades60: w60.n,
    avgBuy300: w300.buyN > 0 ? w300.buySol / w300.buyN : 0,
    whale300: w300.buySol > 0 ? clamp(whaleMax / w300.buySol, 0, 1) : 0,
    devShare: t.devBal / t.supply,
    devSold: t.devMaxBal > 0 ? clamp(t.devSoldTok / t.devMaxBal, 0, 1) : t.devSoldTok > 0 ? 1 : 0,
    bundleShare: t.bundleTok / t.supply,
    earlyShare: t.earlyTok / t.supply,
    top10: conc.top10,
    top1: conc.top1,
    holders: conc.holders,
    drawdown: t.athMcapSol > 0 ? clamp(1 - t.mcapSol / t.athMcapSol, 0, 1) : 0,
    chg30: ago30 > 0 ? Math.log(mcap / ago30) : 0,
    chg120: ago120 > 0 ? Math.log(mcap / ago120) : 0,
    smartBuyers: smart,
    freshShare,
    socials,
    tweetLink: narrative.tweetLinked ? 1 : 0,
    clusterSize: narrative.clusterSize,
    isLeader: narrative.clusterSize > 1 && narrative.isLeader ? 1 : 0,
    isFirst: narrative.clusterSize > 1 && narrative.isFirst ? 1 : 0,
    creatorLaunches24h: creator.launches24h,
    creatorBest: creator.best,
    heat: ctx.pulse.heat(now),
    hourUtc: hour,
    sinceMigrateSec: t.migrateAt ? Math.max(0, (now - t.migrateAt) / 1000) : 0,
    liquiditySol: t.stage === "amm" ? t.poolQuote / 1e9 : t.realSol / 1e9,
    dexSignal: (m.dexProfile ? 1 : 0) + ((m.boosts ?? 0) > 0 ? 1 : 0),
  };
}

export interface FeatureDef {
  key: string;
  label: string;
  /** model input from raw features */
  x: (f: RawFeatures) => number;
  /** short human description of the raw value */
  show: (f: RawFeatures) => string;
  good: string;
  bad: string;
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const s2 = (x: number) => (Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2));

export const FEATURE_DEFS: FeatureDef[] = [
  { key: "age", label: "Age", x: (f) => Math.log1p(f.ageSec), show: (f) => fmtAge(f.ageSec), good: "young", bad: "old for its stage" },
  { key: "mcap", label: "Market cap", x: (f) => Math.log(Math.max(f.mcapSol, 1)), show: (f) => `${f.mcapSol.toFixed(0)} SOL`, good: "room to run", bad: "already big" },
  { key: "progress", label: "Curve progress", x: (f) => f.progress, show: (f) => pct(f.progress), good: "curve filling", bad: "curve nearly done" },
  { key: "net60", label: "Net inflow 60s", x: (f) => Math.asinh(f.net60), show: (f) => `${s2(f.net60)} SOL`, good: "buyers pouring in", bad: "net selling" },
  { key: "net300", label: "Net inflow 5m", x: (f) => Math.asinh(f.net300), show: (f) => `${s2(f.net300)} SOL`, good: "sustained demand", bad: "demand fading" },
  { key: "accel", label: "Acceleration", x: (f) => clamp((f.net60 - f.netPrev60) / (Math.abs(f.netPrev60) + 1), -3, 3), show: (f) => `${s2(f.net60 - f.netPrev60)} SOL vs prior min`, good: "speeding up", bad: "slowing down" },
  { key: "buyRatio", label: "Buy share 60s", x: (f) => (f.buys60 + 1) / (f.buys60 + f.sells60 + 2), show: (f) => `${f.buys60}B/${f.sells60}S`, good: "mostly buys", bad: "mostly sells" },
  { key: "uniq60", label: "New buyers 60s", x: (f) => Math.log1p(f.uniq60), show: (f) => `${f.uniq60}`, good: "many distinct buyers", bad: "few buyers" },
  { key: "uniqTotal", label: "Buyers total", x: (f) => Math.log1p(f.uniqTotal), show: (f) => `${f.uniqTotal}`, good: "broad participation", bad: "thin participation" },
  { key: "trades60", label: "Trades 60s", x: (f) => Math.log1p(f.trades60), show: (f) => `${f.trades60}`, good: "active", bad: "quiet" },
  { key: "avgBuy", label: "Avg buy 5m", x: (f) => Math.log(0.01 + f.avgBuy300), show: (f) => `${s2(f.avgBuy300)} SOL`, good: "retail-sized buys", bad: "whale-sized buys" },
  { key: "whale", label: "Largest buy share", x: (f) => f.whale300, show: (f) => pct(f.whale300), good: "no single whale", bad: "one whale dominates" },
  { key: "devShare", label: "Dev holds", x: (f) => f.devShare, show: (f) => pct(f.devShare), good: "dev holds little", bad: "dev holds a lot" },
  { key: "devSold", label: "Dev sold", x: (f) => f.devSold, show: (f) => pct(f.devSold), good: "dev holding", bad: "dev dumping" },
  { key: "bundle", label: "Bundled supply", x: (f) => f.bundleShare, show: (f) => pct(f.bundleShare), good: "no bundle", bad: "bundled at launch" },
  { key: "early", label: "Sniper supply", x: (f) => f.earlyShare, show: (f) => pct(f.earlyShare), good: "snipers gone", bad: "snipers holding" },
  { key: "top10", label: "Top 10 holders", x: (f) => f.top10, show: (f) => pct(f.top10), good: "spread out", bad: "concentrated" },
  { key: "holders", label: "Holders", x: (f) => Math.log1p(f.holders), show: (f) => `${f.holders}`, good: "many holders", bad: "few holders" },
  { key: "drawdown", label: "Below peak", x: (f) => f.drawdown, show: (f) => pct(f.drawdown), good: "near highs", bad: "far below peak" },
  { key: "chg30", label: "Move 30s", x: (f) => clamp(f.chg30, -2, 2), show: (f) => pct(Math.exp(f.chg30) - 1), good: "rising", bad: "falling" },
  { key: "chg120", label: "Move 2m", x: (f) => clamp(f.chg120, -2, 2), show: (f) => pct(Math.exp(f.chg120) - 1), good: "trending up", bad: "trending down" },
  { key: "smart", label: "Smart wallets in", x: (f) => Math.log1p(f.smartBuyers), show: (f) => `${f.smartBuyers}`, good: "proven wallets buying", bad: "" },
  { key: "fresh", label: "Fresh wallets", x: (f) => (Number.isFinite(f.freshShare) ? f.freshShare : 0.3), show: (f) => (Number.isFinite(f.freshShare) ? pct(f.freshShare) : "learning"), good: "real wallets", bad: "brand-new wallets (alts)" },
  { key: "socials", label: "Socials", x: (f) => f.socials / 3, show: (f) => `${f.socials}/3`, good: "has socials", bad: "no socials" },
  { key: "tweet", label: "Tweet-linked", x: (f) => f.tweetLink, show: (f) => (f.tweetLink ? "yes" : "no"), good: "anchored to a tweet", bad: "" },
  { key: "cluster", label: "Narrative heat", x: (f) => Math.log(Math.max(1, f.clusterSize)), show: (f) => `${f.clusterSize} similar`, good: "hot narrative", bad: "" },
  { key: "leader", label: "Narrative leader", x: (f) => f.isLeader, show: (f) => (f.isLeader ? "leads" : "—"), good: "leads its narrative", bad: "" },
  { key: "copycat", label: "Copycat", x: (f) => (f.clusterSize > 1 && !f.isLeader ? 1 : 0), show: (f) => (f.clusterSize > 1 && !f.isLeader ? "yes" : "no"), good: "", bad: "copy of a bigger coin" },
  { key: "serial", label: "Serial launcher", x: (f) => Math.log1p(Math.max(0, f.creatorLaunches24h - 1)), show: (f) => `${f.creatorLaunches24h} launches/24h`, good: "", bad: "dev launches many coins" },
  { key: "creatorBest", label: "Dev track record", x: (f) => Math.log1p(f.creatorBest / 100), show: (f) => `best ${f.creatorBest.toFixed(0)} SOL`, good: "dev had a winner", bad: "" },
  { key: "heat", label: "Market heat", x: (f) => f.heat, show: (f) => s2(f.heat), good: "hot market", bad: "cold market" },
  { key: "hourSin", label: "Hour (sin)", x: (f) => Math.sin((2 * Math.PI * f.hourUtc) / 24), show: (f) => `${f.hourUtc.toFixed(0)}h UTC`, good: "", bad: "" },
  { key: "hourCos", label: "Hour (cos)", x: (f) => Math.cos((2 * Math.PI * f.hourUtc) / 24), show: (f) => `${f.hourUtc.toFixed(0)}h UTC`, good: "", bad: "" },
  { key: "liquidity", label: "Liquidity", x: (f) => Math.log1p(f.liquiditySol), show: (f) => `${f.liquiditySol.toFixed(1)} SOL`, good: "deep pool", bad: "thin pool" },
  { key: "sinceMig", label: "Since migration", x: (f) => (f.stage === "amm" ? Math.log1p(f.sinceMigrateSec) : 0), show: (f) => (f.stage === "amm" ? fmtAge(f.sinceMigrateSec) : "—"), good: "just graduated", bad: "stale after graduation" },
  { key: "dex", label: "DEX listing paid", x: (f) => f.dexSignal, show: (f) => `${f.dexSignal}/2`, good: "paid profile/boost", bad: "" },
];

export const FEATURE_KEYS = FEATURE_DEFS.map((d) => d.key);

export function featureVector(f: RawFeatures): number[] {
  const out = new Array<number>(FEATURE_DEFS.length);
  for (let i = 0; i < FEATURE_DEFS.length; i++) {
    const v = FEATURE_DEFS[i]!.x(f);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

export function fmtAge(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}
