/**
 * Positions and valuation. A position's value is always what SELLING it would return
 * right now — exact curve/pool quote for its size, minus priority and venue fees — so
 * take-profit and stop-loss are measured NET of every cost.
 */
import { LAMPORTS_PER_SOL, RAW_PER_TOKEN, curveBuyQuote, curveSellQuote, poolBuyQuote, poolSellQuote } from "./curve.js";
import type { ExitPlan, Mode } from "./settings.js";
import type { TokenState } from "./token.js";

export type PositionStatus = "opening" | "open" | "closing" | "closed" | "failed";

export interface Fill {
  ts: number;
  side: "buy" | "sell";
  reason: string;
  /** buy: lamports spent all-in; sell: lamports received net */
  lamports: number;
  tokens: number;
  mcapSol: number;
  priceSol: number;
  fees: number;
  sig?: string;
}

export interface Position {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  mode: Mode;
  stageAtEntry: "curve" | "amm";
  status: PositionStatus;
  signalId: string;
  signalAt: number;
  signalScore: number;
  signalP: number;
  signalMcapSol: number;
  openedAt: number;
  plan: ExitPlan;
  /** lamports committed (all-in cost of the entry) */
  cost: number;
  tokens: number;
  tokensLeft: number;
  entryMcapSol: number;
  entryPriceSol: number;
  /** net lamports received from exits so far */
  proceeds: number;
  /** latest net liquidation value of tokensLeft, lamports */
  value: number;
  valueAt: number;
  peakValue: number;
  /** peak / trough of (proceeds + value) / cost */
  peakMult: number;
  lowMult: number;
  tpHit: boolean;
  fills: Fill[];
  pendingOrder?: string;
  exitReason?: string;
  closedAt?: number;
  pnl?: number;
  pnlPct?: number;
  retries: number;
  notes: string[];
}

export interface CostModel {
  priorityFeeSol: number;
  platformFeePct: number;
  /** rent for the token account created on first buy */
  ataRentSol: number;
  /** count the rent as refunded on a full exit (only if accounts are really closed) */
  refundRent: boolean;
}

/**
 * Token-account rent is paid on the first buy and recovered after a full exit (the live
 * executor closes empty accounts). Set `refundRent: false` to model it as lost.
 */
export const DEFAULT_COSTS: CostModel = { priorityFeeSol: 0.0005, platformFeePct: 0.5, ataRentSol: 0.00203928, refundRent: true };

export interface Quote {
  ok: boolean;
  error?: string;
  tokens: number;
  lamports: number;
  avgPriceSol: number;
  fees: number;
  mcapSol: number;
}

/** Tradability of a token's current state. */
export function venueOf(t: TokenState): "curve" | "amm" | "approx" | "none" {
  if (t.stage === "curve") return t.vTok > 0 && t.realTok > 0 ? "curve" : "none";
  if (t.stage === "migrating") return "none";
  if (t.poolBase > 0 && t.poolQuote > 0) return "amm";
  if (t.quote?.priceSol && t.quote.priceSol > 0) return "approx";
  return "none";
}

/** Pool-like reserves inferred from an off-chain quote (liquidity-only tokens). */
function approxPool(t: TokenState, solUsd: number) {
  const q = t.quote!;
  const liqSol = q.liqUsd && solUsd > 0 ? q.liqUsd / solUsd / 2 : 50;
  const quote = Math.max(1, liqSol) * LAMPORTS_PER_SOL;
  const base = (quote / (q.priceSol! * LAMPORTS_PER_SOL)) * RAW_PER_TOKEN;
  return { base, quote, supply: t.supply };
}

/** Buy with `lamportsAllIn` including priority + venue fee. */
export function quoteBuy(t: TokenState, lamportsAllIn: number, costs: CostModel, solUsd = 0, firstBuy = true): Quote {
  const venue = venueOf(t);
  const fixed = costs.priorityFeeSol * LAMPORTS_PER_SOL + (firstBuy ? costs.ataRentSol * LAMPORTS_PER_SOL : 0);
  const platform = lamportsAllIn * (costs.platformFeePct / 100);
  const swapIn = Math.floor(lamportsAllIn - fixed - platform);
  if (venue === "none") return { ok: false, error: t.stage === "migrating" ? "migrating" : "no_price", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  if (swapIn <= 10_000) return { ok: false, error: "size_too_small", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  let q;
  if (venue === "curve") q = curveBuyQuote(t, swapIn);
  else if (venue === "amm") q = poolBuyQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, swapIn);
  else q = poolBuyQuote(approxPool(t, solUsd), swapIn);
  if (q.tokensOut <= 0) return { ok: false, error: "no_liquidity", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  const lamports = q.solSpent + fixed + platform;
  return {
    ok: true,
    tokens: q.tokensOut,
    lamports,
    avgPriceSol: (lamports / LAMPORTS_PER_SOL) / (q.tokensOut / RAW_PER_TOKEN),
    fees: q.feeLamports + fixed + platform,
    mcapSol: t.mcapSol,
  };
}

/** Net lamports from selling `tokens` now (after pool fees, priority and venue fee). */
export function quoteSell(t: TokenState, tokens: number, costs: CostModel, solUsd = 0, closesAccount = false): Quote {
  const venue = venueOf(t);
  if (tokens <= 0) return { ok: true, tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  if (venue === "none") return { ok: false, error: t.stage === "migrating" ? "migrating" : "no_price", tokens, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  let q;
  if (venue === "curve") q = curveSellQuote(t, tokens);
  else if (venue === "amm") q = poolSellQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, tokens);
  else q = poolSellQuote(approxPool(t, solUsd), tokens);
  const platform = q.solOut * (costs.platformFeePct / 100);
  const refund = closesAccount && costs.refundRent ? costs.ataRentSol * LAMPORTS_PER_SOL : 0;
  const lamports = Math.max(0, q.solOut - platform - costs.priorityFeeSol * LAMPORTS_PER_SOL + refund);
  return {
    ok: true,
    tokens,
    lamports,
    avgPriceSol: tokens > 0 ? (lamports / LAMPORTS_PER_SOL) / (tokens / RAW_PER_TOKEN) : 0,
    fees: q.feeLamports + platform + costs.priorityFeeSol * LAMPORTS_PER_SOL,
    mcapSol: t.mcapSol,
  };
}

/** Multiple of cost the position is worth now (realized + liquidation value). */
export function positionMultiple(p: Position): number {
  return p.cost > 0 ? (p.proceeds + p.value) / p.cost : 0;
}

export type ExitReason = "tp" | "sl" | "trail" | "time" | "initials" | "manual" | "kill" | "dead";
export type ExitDecision = { action: "hold" } | { action: "arm" } | { action: "sell"; fraction: number; reason: ExitReason };

/** Trailing distance in effect after TP (take-initials without a trail uses 40%). */
export function effectiveTrail(plan: ExitPlan): number {
  return plan.takeInitials && plan.trailPct === 0 ? 40 : plan.trailPct;
}

/**
 * Exit rules (evaluated on every price update of a held token):
 *  - SL: total multiple ≤ 1 − sl  → sell all
 *  - TP: total multiple ≥ 1 + tp  → sell all, or recover the stake (take initials) and
 *        trail the rest, or arm the trailing stop when one is set
 *  - trailing: after TP, value falls trail% from its peak → sell all
 *  - time: held longer than maxHoldMin → sell all
 *  - dead: no trades for staleExitMin → sell (frees the slot for live setups)
 */
export function decideExit(p: Position, now: number, lastTradeAt = now): ExitDecision {
  const plan = p.plan;
  const mult = positionMultiple(p);
  if (p.tokensLeft <= 0) return { action: "hold" };
  if (!p.tpHit && mult <= 1 - plan.slPct / 100) return { action: "sell", fraction: 1, reason: "sl" };
  const trail = effectiveTrail(plan);
  if (!p.tpHit && mult >= 1 + plan.tpPct / 100) {
    if (plan.takeInitials && p.value > 0) {
      // sell just enough to get the stake back; the rest rides with a trailing stop
      const need = Math.max(0, p.cost - p.proceeds);
      const fraction = Math.min(1, need / p.value);
      if (fraction < 0.98) return { action: "sell", fraction, reason: "initials" };
      return { action: "sell", fraction: 1, reason: "tp" };
    }
    if (trail > 0) return { action: "arm" }; // TP reached: arm the trailing stop
    return { action: "sell", fraction: 1, reason: "tp" };
  }
  if (p.tpHit && trail > 0 && p.peakValue > 0 && p.value <= p.peakValue * (1 - trail / 100)) {
    return { action: "sell", fraction: 1, reason: "trail" };
  }
  if (p.tpHit && mult <= 1 - plan.slPct / 100) return { action: "sell", fraction: 1, reason: "sl" };
  if (plan.maxHoldMin > 0 && now - p.openedAt >= plan.maxHoldMin * 60_000) return { action: "sell", fraction: 1, reason: "time" };
  const stale = plan.staleExitMin ?? 0;
  if (stale > 0 && now - Math.max(lastTradeAt, p.openedAt) >= stale * 60_000) return { action: "sell", fraction: 1, reason: "dead" };
  return { action: "hold" };
}
