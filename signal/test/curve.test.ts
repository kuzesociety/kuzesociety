import { describe, expect, it } from "vitest";
import {
  AMM_FEE_TIERS,
  CURVE,
  CURVE_COMPLETE_REAL_SOL,
  CURVE_FEES,
  LAMPORTS_PER_SOL,
  ammFeesForMcapSol,
  curveBuyQuote,
  curveBuyTokensBig,
  curveCostToComplete,
  curveFromVirtual,
  curveMcapSol,
  curveProgress,
  curveSellQuote,
  curveSellSolBig,
  newCurve,
  poolBuyBaseOutBig,
  poolBuyQuote,
  poolMcapSol,
  poolSellQuote,
  poolSellQuoteOutBig,
  totalBps,
} from "../src/core/curve.js";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("bonding curve", () => {
  it("starts at ~28 SOL market cap and completes near 85 real SOL / ~411 SOL mcap", () => {
    const c = newCurve();
    expect(curveMcapSol(c)).toBeCloseTo(27.958, 2);
    expect(CURVE_COMPLETE_REAL_SOL / LAMPORTS_PER_SOL).toBeCloseTo(85.0, 0);
    const end = { vSol: CURVE.initialVirtualSol + CURVE_COMPLETE_REAL_SOL, vTok: CURVE.initialVirtualTok - CURVE.initialRealTok, realTok: 0, supply: CURVE.supply };
    expect(curveMcapSol(end)).toBeGreaterThan(405);
    expect(curveMcapSol(end)).toBeLessThan(415);
    expect(curveProgress(end)).toBe(1);
  });

  it("charges 1.25% on each side: an immediate round trip loses ~2.5%", () => {
    const c = newCurve();
    const buy = curveBuyQuote(c, 1 * LAMPORTS_PER_SOL);
    expect(buy.solSpent).toBeLessThanOrEqual(LAMPORTS_PER_SOL);
    expect(buy.feeLamports / buy.solToCurve).toBeCloseTo(0.0125, 4);
    const sell = curveSellQuote(buy.after, buy.tokensOut);
    const loss = 1 - sell.solOut / buy.solSpent;
    expect(loss).toBeGreaterThan(0.024);
    expect(loss).toBeLessThan(0.026);
    expect(totalBps(CURVE_FEES)).toBe(125);
  });

  it("matches the SDK integer math (BigInt reference) on random states", () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const bought = Math.floor(r() * CURVE.initialRealTok * 0.98);
      const vTok = CURVE.initialVirtualTok - bought;
      const vSol = Math.floor((CURVE.initialVirtualSol * CURVE.initialVirtualTok) / vTok);
      const s = { vSol, vTok, realTok: CURVE.initialRealTok - bought, supply: CURVE.supply };
      const lamports = Math.floor(r() * 5 * LAMPORTS_PER_SOL) + 10_000;
      const q = curveBuyQuote(s, lamports);
      const ref = curveBuyTokensBig({ vSol: BigInt(vSol), vTok: BigInt(vTok), realTok: BigInt(s.realTok) }, BigInt(lamports), 125n);
      expect(Math.abs(q.tokensOut - Number(ref))).toBeLessThanOrEqual(1);
      expect(q.solSpent).toBeLessThanOrEqual(lamports + 1);
      const tokensIn = Math.floor(r() * 50_000_000 * 1e6) + 1;
      const sq = curveSellQuote(s, tokensIn);
      const sref = curveSellSolBig({ vSol: BigInt(vSol), vTok: BigInt(vTok) }, BigInt(tokensIn), 95n, 30n);
      expect(Math.abs(sq.solOut - Number(sref))).toBeLessThanOrEqual(1);
    }
  });

  it("caps a buy at the tokens left and completes the curve", () => {
    const s = curveFromVirtual(100 * LAMPORTS_PER_SOL, Math.floor((CURVE.initialVirtualSol * CURVE.initialVirtualTok) / (100 * LAMPORTS_PER_SOL)));
    const need = curveCostToComplete(s);
    const q = curveBuyQuote(s, need * 3);
    expect(q.tokensOut).toBe(s.realTok);
    expect(q.after.realTok).toBe(0);
    expect(q.solSpent).toBeLessThan(need * 1.01);
    expect(q.solSpent).toBeGreaterThan(need * 0.99);
  });

  it("returns zeros for degenerate input instead of NaN", () => {
    const c = newCurve();
    for (const v of [0, -5, NaN, 1]) {
      const q = curveBuyQuote(c, v);
      expect(q.tokensOut).toBe(0);
      const s = curveSellQuote(c, v);
      expect(Number.isFinite(s.solOut)).toBe(true);
    }
  });
});

describe("PumpSwap pools", () => {
  it("selects fee tiers by market cap like calculateFeeTier", () => {
    expect(totalBps(ammFeesForMcapSol(10))).toBe(125);
    expect(totalBps(ammFeesForMcapSol(420))).toBe(120);
    expect(totalBps(ammFeesForMcapSol(1469.99))).toBe(120);
    expect(totalBps(ammFeesForMcapSol(5000))).toBe(100);
    expect(totalBps(ammFeesForMcapSol(1e7))).toBe(30);
    for (let i = 1; i < AMM_FEE_TIERS.length; i++) expect(AMM_FEE_TIERS[i]!.mcapSol).toBeGreaterThan(AMM_FEE_TIERS[i - 1]!.mcapSol);
  });

  it("matches the swap SDK integer math", () => {
    const r = rng(11);
    for (let i = 0; i < 1000; i++) {
      const base = Math.floor((100 + r() * 700) * 1e6 * 1e6);
      const quote = Math.floor((80 + r() * 5000) * LAMPORTS_PER_SOL);
      const p = { base, quote, supply: CURVE.supply };
      const f = ammFeesForMcapSol(poolMcapSol(p));
      const fb = { lp: BigInt(f.lp), protocol: BigInt(f.protocol), creator: BigInt(f.creator) };
      const lamports = Math.floor(r() * 10 * LAMPORTS_PER_SOL) + 100_000;
      const q = poolBuyQuote(p, lamports);
      const ref = poolBuyBaseOutBig({ base: BigInt(base), quote: BigInt(quote) }, BigInt(lamports), fb);
      expect(Math.abs(q.tokensOut - Number(ref))).toBeLessThanOrEqual(2);
      expect(q.solSpent).toBeLessThanOrEqual(lamports + 2);
      const tokensIn = Math.floor(r() * 20_000_000 * 1e6) + 1;
      const s = poolSellQuote(p, tokensIn);
      const sref = poolSellQuoteOutBig({ base: BigInt(base), quote: BigInt(quote) }, BigInt(tokensIn), fb);
      expect(Math.abs(s.solOut - Number(sref))).toBeLessThanOrEqual(2);
    }
  });

  it("round trip on a fresh graduated pool costs ~2.5% (1.25% tier each side)", () => {
    const p = { base: 206_900_000 * 1e6, quote: 84.99 * LAMPORTS_PER_SOL, supply: CURVE.supply };
    const b = poolBuyQuote(p, 0.5 * LAMPORTS_PER_SOL);
    const s = poolSellQuote({ ...p, base: b.after.vTok, quote: b.after.vSol }, b.tokensOut);
    const loss = 1 - s.solOut / b.solSpent;
    expect(loss).toBeGreaterThan(0.024);
    expect(loss).toBeLessThan(0.027);
  });
});
