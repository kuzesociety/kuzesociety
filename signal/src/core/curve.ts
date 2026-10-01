/**
 * Exact pump.fun trade math.
 *
 * Mirrors the official SDKs (@pump-fun/pump-sdk 2.0.0 `bondingCurve.ts` / `fees.ts`
 * and @pump-fun/pump-swap-sdk 1.20.0 `buy.ts` / `sell.ts`) so paper fills match what
 * the programs would do on-chain. Two flavours:
 *  - `*Big` functions use BigInt and reproduce the SDK integer rounding exactly;
 *  - the plain functions use doubles (fast path used by the engine). All reserve values
 *    stay below 2^53 so doubles are exact for inputs; products are rounded, which moves
 *    results by < 1e-12 relative — irrelevant for simulation, and tests pin the gap.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const RAW_PER_TOKEN = 1_000_000; // pump.fun tokens have 6 decimals

/** Global defaults of the pump program (Global account, docs/PUMP_PROGRAM_README.md). */
export const CURVE = {
  initialVirtualTok: 1_073_000_000_000_000,
  initialVirtualSol: 30_000_000_000,
  initialRealTok: 793_100_000_000_000,
  supply: 1_000_000_000_000_000,
} as const;

/** Real SOL a standard curve holds when it completes (≈ 85 SOL). */
export const CURVE_COMPLETE_REAL_SOL = (() => {
  const k = CURVE.initialVirtualSol * CURVE.initialVirtualTok;
  const vTokEnd = CURVE.initialVirtualTok - CURVE.initialRealTok;
  return k / vTokEnd - CURVE.initialVirtualSol;
})();

export interface FeeBps {
  protocol: number;
  creator: number;
  lp: number;
}

/** Bonding-curve fee: 0.95% protocol + 0.30% creator = 1.25% (official fee table). */
export const CURVE_FEES: FeeBps = { protocol: 95, creator: 30, lp: 0 };

/**
 * PumpSwap canonical-pool fee tiers keyed by pool market cap in SOL (docs/fees.png).
 * The table prints a few creator rates with a half basis point (0.275% …); on-chain
 * fees are integer bps, so those are rounded up here (difference ≤ 0.005%).
 */
export const AMM_FEE_TIERS: ReadonlyArray<{ mcapSol: number; fees: FeeBps }> = [
  { mcapSol: 0, fees: { creator: 30, protocol: 93, lp: 2 } },
  { mcapSol: 420, fees: { creator: 95, protocol: 5, lp: 20 } },
  { mcapSol: 1470, fees: { creator: 90, protocol: 5, lp: 20 } },
  { mcapSol: 2460, fees: { creator: 85, protocol: 5, lp: 20 } },
  { mcapSol: 3440, fees: { creator: 80, protocol: 5, lp: 20 } },
  { mcapSol: 4420, fees: { creator: 75, protocol: 5, lp: 20 } },
  { mcapSol: 9820, fees: { creator: 70, protocol: 5, lp: 20 } },
  { mcapSol: 14740, fees: { creator: 65, protocol: 5, lp: 20 } },
  { mcapSol: 19650, fees: { creator: 60, protocol: 5, lp: 20 } },
  { mcapSol: 24560, fees: { creator: 55, protocol: 5, lp: 20 } },
  { mcapSol: 29470, fees: { creator: 50, protocol: 5, lp: 20 } },
  { mcapSol: 34380, fees: { creator: 45, protocol: 5, lp: 20 } },
  { mcapSol: 39300, fees: { creator: 40, protocol: 5, lp: 20 } },
  { mcapSol: 44210, fees: { creator: 35, protocol: 5, lp: 20 } },
  { mcapSol: 49120, fees: { creator: 30, protocol: 5, lp: 20 } },
  { mcapSol: 54030, fees: { creator: 28, protocol: 5, lp: 20 } },
  { mcapSol: 58940, fees: { creator: 25, protocol: 5, lp: 20 } },
  { mcapSol: 63860, fees: { creator: 23, protocol: 5, lp: 20 } },
  { mcapSol: 68770, fees: { creator: 20, protocol: 5, lp: 20 } },
  { mcapSol: 73681, fees: { creator: 18, protocol: 5, lp: 20 } },
  { mcapSol: 78590, fees: { creator: 15, protocol: 5, lp: 20 } },
  { mcapSol: 83500, fees: { creator: 13, protocol: 5, lp: 20 } },
  { mcapSol: 88400, fees: { creator: 10, protocol: 5, lp: 20 } },
  { mcapSol: 93330, fees: { creator: 8, protocol: 5, lp: 20 } },
  { mcapSol: 98240, fees: { creator: 5, protocol: 5, lp: 20 } },
];

export function totalBps(f: FeeBps): number {
  return f.protocol + f.creator + f.lp;
}

/** Fee tier for a canonical PumpSwap pool, same selection rule as `calculateFeeTier`. */
export function ammFeesForMcapSol(mcapSol: number): FeeBps {
  let chosen = AMM_FEE_TIERS[0]!.fees;
  for (const tier of AMM_FEE_TIERS) {
    if (mcapSol >= tier.mcapSol) chosen = tier.fees;
    else break;
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Bonding curve state helpers
// ---------------------------------------------------------------------------

export interface CurveState {
  /** virtual quote (SOL) reserves, lamports */
  vSol: number;
  /** virtual token reserves, raw units */
  vTok: number;
  /** real token reserves left on the curve, raw units */
  realTok: number;
  /** total mint supply, raw units */
  supply: number;
}

export function newCurve(): CurveState {
  return {
    vSol: CURVE.initialVirtualSol,
    vTok: CURVE.initialVirtualTok,
    realTok: CURVE.initialRealTok,
    supply: CURVE.supply,
  };
}

/** Market cap in lamports, the program's own definition (vSol * supply / vTok). */
export function curveMcapLamports(s: Pick<CurveState, "vSol" | "vTok" | "supply">): number {
  if (s.vTok <= 0) return 0;
  return (s.vSol * s.supply) / s.vTok;
}

export function curveMcapSol(s: Pick<CurveState, "vSol" | "vTok" | "supply">): number {
  return curveMcapLamports(s) / LAMPORTS_PER_SOL;
}

/** Spot price in SOL per whole token (1e6 raw units). */
export function curvePriceSol(s: Pick<CurveState, "vSol" | "vTok">): number {
  if (s.vTok <= 0) return 0;
  return (s.vSol / s.vTok) * (RAW_PER_TOKEN / LAMPORTS_PER_SOL);
}

/** Share of the sellable curve supply already bought, 0..1. */
export function curveProgress(s: Pick<CurveState, "realTok">): number {
  const p = 1 - s.realTok / CURVE.initialRealTok;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

function feeCeil(amount: number, bps: number): number {
  return Math.ceil((amount * bps) / 10_000);
}

export interface BuyQuote {
  /** tokens received, raw units */
  tokensOut: number;
  /** lamports entering the curve reserves (after fees) */
  solToCurve: number;
  /** lamports paid in fees */
  feeLamports: number;
  /** lamports actually spent (≤ requested; less when the curve completes) */
  solSpent: number;
  /** average fill price, SOL per whole token */
  avgPriceSol: number;
  /** curve state after the buy */
  after: CurveState;
}

/**
 * Spend `lamportsIn` (fees included) on the curve — `getBuyTokenAmountFromSolAmount`.
 */
export function curveBuyQuote(s: CurveState, lamportsIn: number, fees: FeeBps = CURVE_FEES): BuyQuote {
  const zero: BuyQuote = { tokensOut: 0, solToCurve: 0, feeLamports: 0, solSpent: 0, avgPriceSol: 0, after: { ...s } };
  if (!(lamportsIn > 1) || s.vTok <= 0 || s.realTok <= 0) return zero;
  const bps = totalBps(fees);
  // SDK: tokens for a SOL budget (fees included) …
  const input = Math.floor(((lamportsIn - 1) * 10_000) / (10_000 + bps));
  let tokens = Math.floor((input * s.vTok) / (s.vSol + input));
  if (tokens > s.realTok) tokens = s.realTok; // curve completes on this buy
  if (tokens <= 0) return zero;
  // … then the program charges the exact cost of those tokens plus fees.
  const cost = Math.floor((tokens * s.vSol) / (s.vTok - tokens)) + 1;
  const fee = feeCeil(cost, fees.protocol) + feeCeil(cost, fees.creator);
  const spent = cost + fee;
  return {
    tokensOut: tokens,
    solToCurve: cost,
    feeLamports: fee,
    solSpent: spent,
    avgPriceSol: (spent / LAMPORTS_PER_SOL) / (tokens / RAW_PER_TOKEN),
    after: { vSol: s.vSol + cost, vTok: s.vTok - tokens, realTok: s.realTok - tokens, supply: s.supply },
  };
}

export interface SellQuote {
  /** lamports received after fees */
  solOut: number;
  /** gross lamports leaving the curve */
  solFromCurve: number;
  feeLamports: number;
  avgPriceSol: number;
  after: CurveState;
}

/** Sell `tokensIn` raw units — `getSellSolAmountFromTokenAmount`. */
export function curveSellQuote(s: CurveState, tokensIn: number, fees: FeeBps = CURVE_FEES): SellQuote {
  if (!(tokensIn > 0) || s.vTok <= 0) {
    return { solOut: 0, solFromCurve: 0, feeLamports: 0, avgPriceSol: 0, after: { ...s } };
  }
  const gross = Math.floor((tokensIn * s.vSol) / (s.vTok + tokensIn));
  const fee = feeCeil(gross, fees.protocol) + feeCeil(gross, fees.creator);
  const out = Math.max(0, gross - fee);
  return {
    solOut: out,
    solFromCurve: gross,
    feeLamports: fee,
    avgPriceSol: (out / LAMPORTS_PER_SOL) / (tokensIn / RAW_PER_TOKEN),
    after: { vSol: s.vSol - gross, vTok: s.vTok + tokensIn, realTok: s.realTok + tokensIn, supply: s.supply },
  };
}

/** Lamports (fees included) needed to buy every token left on the curve. */
export function curveCostToComplete(s: CurveState, fees: FeeBps = CURVE_FEES): number {
  if (s.realTok <= 0) return 0;
  const input = Math.floor((s.realTok * s.vSol) / (s.vTok - s.realTok)) + 1;
  return input + feeCeil(input, fees.protocol) + feeCeil(input, fees.creator);
}

/** Recover curve reserves from reported virtual reserves (PumpPortal omits real reserves). */
export function curveFromVirtual(vSol: number, vTok: number, supply: number = CURVE.supply): CurveState {
  const realTok = Math.max(0, vTok - (CURVE.initialVirtualTok - CURVE.initialRealTok));
  return { vSol, vTok, realTok, supply };
}

// ---------------------------------------------------------------------------
// PumpSwap (constant product) — effective quote reserves = vault + virtual (0 today)
// ---------------------------------------------------------------------------

export interface PoolState {
  /** base (token) reserves, raw units */
  base: number;
  /** effective quote reserves, lamports */
  quote: number;
  /** base mint supply, raw units */
  supply: number;
  /** false for pools that predate creator fees (coin_creator == default) */
  hasCreator?: boolean;
}

export function poolMcapSol(p: PoolState): number {
  if (p.base <= 0) return 0;
  return (p.quote * p.supply) / p.base / LAMPORTS_PER_SOL;
}

export function poolPriceSol(p: Pick<PoolState, "base" | "quote">): number {
  if (p.base <= 0) return 0;
  return (p.quote / p.base) * (RAW_PER_TOKEN / LAMPORTS_PER_SOL);
}

function ammFees(p: PoolState): FeeBps {
  const f = ammFeesForMcapSol(poolMcapSol(p));
  return p.hasCreator === false ? { ...f, creator: 0 } : f;
}

/** `buyQuoteInput`: spend `lamportsIn` (fees included). */
export function poolBuyQuote(p: PoolState, lamportsIn: number): BuyQuote {
  const zeroAfter = { vSol: p.quote, vTok: p.base, realTok: p.base, supply: p.supply };
  const zero: BuyQuote = { tokensOut: 0, solToCurve: 0, feeLamports: 0, solSpent: 0, avgPriceSol: 0, after: zeroAfter };
  if (!(lamportsIn > 1) || p.base <= 0 || p.quote <= 0) return zero;
  const f = ammFees(p);
  let effective = Math.floor((lamportsIn * 10_000) / (10_000 + totalBps(f)));
  const lpFee = feeCeil(effective, f.lp);
  const protocolFee = feeCeil(effective, f.protocol);
  const creatorFee = feeCeil(effective, f.creator);
  const total = effective + lpFee + protocolFee + creatorFee;
  if (total > lamportsIn) effective -= total - lamportsIn;
  const input = effective - 1;
  if (input <= 0) return zero;
  const out = Math.floor((p.base * input) / (p.quote + input));
  if (out <= 0 || out >= p.base) return zero;
  // `buy(base_out, max_quote_in)`: the program charges ceil(quote * out / (base - out)) + fees.
  const quoteIn = Math.ceil((p.quote * out) / (p.base - out));
  const fLp = feeCeil(quoteIn, f.lp);
  const fee = fLp + feeCeil(quoteIn, f.protocol) + feeCeil(quoteIn, f.creator);
  const spent = quoteIn + fee;
  return {
    tokensOut: out,
    solToCurve: quoteIn + fLp,
    feeLamports: fee,
    solSpent: spent,
    avgPriceSol: (spent / LAMPORTS_PER_SOL) / (out / RAW_PER_TOKEN),
    after: { vSol: p.quote + quoteIn + fLp, vTok: p.base - out, realTok: p.base - out, supply: p.supply },
  };
}

/** `sellBaseInput`: sell `tokensIn` raw units. */
export function poolSellQuote(p: PoolState, tokensIn: number): SellQuote {
  const same = { vSol: p.quote, vTok: p.base, realTok: p.base, supply: p.supply };
  if (!(tokensIn > 0) || p.base <= 0 || p.quote <= 0) {
    return { solOut: 0, solFromCurve: 0, feeLamports: 0, avgPriceSol: 0, after: same };
  }
  const f = ammFees(p);
  const gross = Math.floor((p.quote * tokensIn) / (p.base + tokensIn));
  const lpFee = feeCeil(gross, f.lp);
  const fee = lpFee + feeCeil(gross, f.protocol) + feeCeil(gross, f.creator);
  const out = Math.max(0, gross - fee);
  return {
    solOut: out,
    solFromCurve: gross - lpFee,
    feeLamports: fee,
    avgPriceSol: (out / LAMPORTS_PER_SOL) / (tokensIn / RAW_PER_TOKEN),
    after: { vSol: p.quote - (gross - lpFee), vTok: p.base + tokensIn, realTok: p.base + tokensIn, supply: p.supply },
  };
}

// ---------------------------------------------------------------------------
// BigInt reference implementations (exact SDK rounding) — used by tests.
// ---------------------------------------------------------------------------

function ceilDivBig(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export function curveBuyTokensBig(
  s: { vSol: bigint; vTok: bigint; realTok: bigint },
  lamportsIn: bigint,
  feeBps: bigint,
): bigint {
  if (lamportsIn === 0n) return 0n;
  const input = ((lamportsIn - 1n) * 10_000n) / (feeBps + 10_000n);
  const tokens = (input * s.vTok) / (s.vSol + input);
  return tokens < s.realTok ? tokens : s.realTok;
}

export function curveSellSolBig(
  s: { vSol: bigint; vTok: bigint },
  tokensIn: bigint,
  protocolBps: bigint,
  creatorBps: bigint,
): bigint {
  if (tokensIn === 0n) return 0n;
  const gross = (tokensIn * s.vSol) / (s.vTok + tokensIn);
  const fee = ceilDivBig(gross * protocolBps, 10_000n) + ceilDivBig(gross * creatorBps, 10_000n);
  return gross - fee;
}

export function poolBuyBaseOutBig(
  p: { base: bigint; quote: bigint },
  quoteIn: bigint,
  f: { lp: bigint; protocol: bigint; creator: bigint },
): bigint {
  const totalFee = f.lp + f.protocol + f.creator;
  let effective = (quoteIn * 10_000n) / (10_000n + totalFee);
  const withFees =
    effective + ceilDivBig(effective * f.lp, 10_000n) + ceilDivBig(effective * f.protocol, 10_000n) + ceilDivBig(effective * f.creator, 10_000n);
  if (withFees > quoteIn) effective -= withFees - quoteIn;
  const input = effective - 1n;
  return (p.base * input) / (p.quote + input);
}

export function poolSellQuoteOutBig(
  p: { base: bigint; quote: bigint },
  baseIn: bigint,
  f: { lp: bigint; protocol: bigint; creator: bigint },
): bigint {
  const gross = (p.quote * baseIn) / (p.base + baseIn);
  return gross - ceilDivBig(gross * f.lp, 10_000n) - ceilDivBig(gross * f.protocol, 10_000n) - ceilDivBig(gross * f.creator, 10_000n);
}
