/**
 * "Why no trade?" — every score signal is recorded with what happened to it, so it is
 * always visible whether the bot is quiet because nothing scored high enough, because
 * a filter or limit blocked it, or because an entry failed on-chain (slippage…).
 */
import type { Contribution } from "./model.js";
import { Ring } from "./util.js";

export type Decision = "entered" | "pending" | "blocked" | "failed" | "watch";

export interface SignalRecord {
  id: string;
  ts: number;
  mint: string;
  symbol: string;
  name: string;
  stage: "curve" | "amm";
  score: number;
  p: number;
  mcapSol: number;
  decision: Decision;
  reason?: string;
  positionId?: string;
  why: Contribution[];
}

export const REASON_TEXT: Record<string, string> = {
  bot_off: "Auto-trading is paused",
  kill_switch: "Kill switch is on",
  stage_off: "This stage is turned off in settings",
  non_sol_quote: "Coin is not paired with SOL",
  already_traded: "Already traded this coin (re-entry off)",
  max_open: "Max open positions reached",
  pending: "An order for this coin is already in flight",
  daily_loss_limit: "Daily loss limit reached",
  rate_limit: "Max trades per hour reached",
  feed_down: "Live data feed is down — not trading blind",
  warming_up: "Learning this market's score scale (first minutes after install)",
  insufficient_balance: "Not enough SOL — paper: Trades tab → Add paper SOL; live: fund the wallet",
  slippage: "Price moved more than your slippage before the buy landed",
  migrating: "Coin is migrating to PumpSwap (not tradable for a moment)",
  no_price: "No tradable price yet",
  no_liquidity: "Not enough liquidity",
  size_too_small: "Position size too small after fees",
  live_error: "Live order error",
  live_disabled: "Live trading is not enabled on the server",
  "filter:mcap_min": "Market cap below your minimum",
  "filter:mcap_max": "Market cap above your maximum",
  "filter:dev": "Dev holds more than your limit",
  "filter:top10": "Top 10 holders above your limit",
  "filter:bundle": "Launch bundle above your limit",
  "filter:buyers": "Fewer buyers than your minimum",
  "filter:age_min": "Coin younger than your minimum age",
  "filter:age_max": "Coin older than your maximum age",
  "filter:socials": "No socials (you require them)",
  "filter:serial_dev": "Dev launched too many coins today",
  "filter:dev_sold": "Dev already sold more than your limit",
};

const HOUR = 3_600_000;

interface HourStats {
  t: number;
  /** scoring passes */
  passes: number;
  signals: number;
  entered: number;
  failed: number;
  blocked: Map<string, number>;
  /** best score per coin this hour (live hour only) */
  tokMax: Map<string, number> | null;
  /** 101-bin histogram of per-coin best scores (finalized hours) */
  hist100: number[] | null;
  coins: number;
  maxScore: number;
}

export class Funnel {
  recent = new Ring<SignalRecord>(500);
  private byId = new Map<string, SignalRecord>();
  private hours: HourStats[] = [];

  private hour(now: number): HourStats {
    const t = Math.floor(now / HOUR) * HOUR;
    let h = this.hours[this.hours.length - 1];
    if (!h || h.t !== t) {
      if (h) this.finalize(h);
      h = { t, passes: 0, signals: 0, entered: 0, failed: 0, blocked: new Map(), tokMax: new Map(), hist100: null, coins: 0, maxScore: 0 };
      this.hours.push(h);
      if (this.hours.length > 48) this.hours.shift();
    }
    return h;
  }

  private finalize(h: HourStats) {
    if (!h.tokMax) return;
    h.hist100 = Funnel.toHist(h.tokMax);
    h.coins = h.tokMax.size;
    h.tokMax = null;
  }

  private static toHist(m: Map<string, number>): number[] {
    const hist = new Array<number>(101).fill(0);
    for (const v of m.values()) hist[Math.max(0, Math.min(100, Math.floor(v)))]!++;
    return hist;
  }

  /** Every scoring pass: tracks each coin's best score of the hour. */
  noteScored(now: number, mint: string, score: number) {
    const h = this.hour(now);
    h.passes++;
    if (score > h.maxScore) h.maxScore = score;
    const m = h.tokMax!;
    const prev = m.get(mint);
    if (prev === undefined || score > prev) m.set(mint, score);
  }

  add(rec: SignalRecord) {
    this.recent.push(rec);
    this.byId.set(rec.id, rec);
    if (this.byId.size > 1500) {
      const keep = new Set(this.recent.toArray().map((r) => r.id));
      for (const id of this.byId.keys()) if (!keep.has(id)) this.byId.delete(id);
    }
    const h = this.hour(rec.ts);
    h.signals++;
    if (rec.score > h.maxScore) h.maxScore = rec.score;
    this.count(h, rec.decision, rec.reason);
  }

  private count(h: HourStats, decision: Decision, reason?: string) {
    if (decision === "entered") h.entered++;
    else if (decision === "failed") h.failed++;
    else if (decision === "blocked" && reason) h.blocked.set(reason, (h.blocked.get(reason) ?? 0) + 1);
  }

  update(id: string, decision: Decision, reason?: string, positionId?: string) {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.decision = decision;
    rec.reason = reason;
    if (positionId) rec.positionId = positionId;
    this.count(this.hour(rec.ts), decision, reason);
  }

  get(id: string) {
    return this.byId.get(id);
  }

  /**
   * Summary over the trailing window. `hist` has 10 bins of per-coin best scores;
   * `coinsAbove[t]` = coins whose best score reached ≥ t (t = 0…100) in the window.
   */
  summary(now: number, windowHours = 1) {
    this.hour(now);
    const from = now - windowHours * HOUR;
    let scored = 0;
    let signals = 0;
    let entered = 0;
    let failed = 0;
    let maxScore = 0;
    let hours = 0;
    const hist100 = new Array<number>(101).fill(0);
    const blocked = new Map<string, number>();
    for (const h of this.hours) {
      if (h.t + HOUR <= from) continue;
      hours++;
      const hh = h.tokMax ? Funnel.toHist(h.tokMax) : (h.hist100 ?? []);
      hh.forEach((v, i) => (hist100[i] += v));
      scored += h.tokMax ? h.tokMax.size : h.coins;
      signals += h.signals;
      entered += h.entered;
      failed += h.failed;
      if (h.maxScore > maxScore) maxScore = h.maxScore;
      for (const [k, v] of h.blocked) blocked.set(k, (blocked.get(k) ?? 0) + v);
    }
    const hist = new Array<number>(10).fill(0);
    hist100.forEach((v, i) => (hist[Math.min(9, Math.floor(i / 10))] += v));
    const coinsAbove = new Array<number>(101).fill(0);
    let acc = 0;
    for (let i = 100; i >= 0; i--) {
      acc += hist100[i]!;
      coinsAbove[i] = acc;
    }
    const reasons = [...blocked.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, n, text: REASON_TEXT[reason] ?? reason }));
    return { windowHours, hours: Math.max(1, hours), scored, signals, entered, failed, maxScore, hist, coinsAbove, reasons };
  }
}
