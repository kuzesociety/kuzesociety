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
  insufficient_balance: "Not enough SOL in the wallet",
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

export class Funnel {
  recent = new Ring<SignalRecord>(500);
  private byId = new Map<string, SignalRecord>();
  /** per-hour counters: [hourStart, counts] */
  private hours: { t: number; scored: number; signals: number; entered: number; failed: number; blocked: Map<string, number>; hist: number[]; maxScore: number }[] = [];

  private hour(now: number) {
    const t = Math.floor(now / HOUR) * HOUR;
    let h = this.hours[this.hours.length - 1];
    if (!h || h.t !== t) {
      h = { t, scored: 0, signals: 0, entered: 0, failed: 0, blocked: new Map(), hist: new Array(10).fill(0), maxScore: 0 };
      this.hours.push(h);
      if (this.hours.length > 48) this.hours.shift();
    }
    return h;
  }

  /** Called for every scoring pass of a token (first score per token per minute). */
  noteScored(now: number, score: number) {
    const h = this.hour(now);
    h.scored++;
    h.hist[Math.min(9, Math.floor(score / 10))]++;
    if (score > h.maxScore) h.maxScore = score;
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
    this.count(h, rec.decision, rec.reason);
  }

  private count(h: ReturnType<Funnel["hour"]>, decision: Decision, reason?: string) {
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

  summary(now: number, windowHours = 1) {
    const from = now - windowHours * HOUR;
    let scored = 0;
    let signals = 0;
    let entered = 0;
    let failed = 0;
    let maxScore = 0;
    const hist = new Array(10).fill(0);
    const blocked = new Map<string, number>();
    for (const h of this.hours) {
      if (h.t + HOUR <= from) continue;
      scored += h.scored;
      signals += h.signals;
      entered += h.entered;
      failed += h.failed;
      if (h.maxScore > maxScore) maxScore = h.maxScore;
      h.hist.forEach((v, i) => (hist[i] += v));
      for (const [k, v] of h.blocked) blocked.set(k, (blocked.get(k) ?? 0) + v);
    }
    const reasons = [...blocked.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, n, text: REASON_TEXT[reason] ?? reason }));
    return { windowHours, scored, signals, entered, failed, maxScore, hist, reasons };
  }
}
