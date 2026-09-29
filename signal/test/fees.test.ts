import { describe, expect, it } from "vitest";
import { AMM_FEE_TIERS, LAMPORTS_PER_SOL, ammFeesForMcapSol, poolSellQuote } from "../src/core/curve.js";
import { OutcomeTracker } from "../src/core/outcomes.js";
import { DEFAULT_COSTS } from "../src/core/positions.js";
import { TokenState } from "../src/core/token.js";

/** A graduated coin sitting at a given market cap, with a pool holding ~12% of it in SOL. */
function ammAt(mcapSol: number): TokenState {
  const t = new TokenState("m", 0);
  t.stage = "amm";
  t.supply = 1e15;
  t.poolQuote = Math.round(mcapSol * 0.12 * LAMPORTS_PER_SOL);
  t.poolBase = Math.round((t.poolQuote * t.supply) / (mcapSol * LAMPORTS_PER_SOL));
  t.refreshPrice();
  return t;
}

describe("a would-be trade pays the fee its venue really charges", () => {
  it("PumpSwap's fee falls with market cap, and the sell quote follows it", () => {
    const small = ammFeesForMcapSol(100);
    const large = ammFeesForMcapSol(98_240);
    expect(small.creator + small.protocol + small.lp).toBe(125); // 1.25%
    expect(large.creator + large.protocol + large.lp).toBe(30); // 0.30%
    // the quote itself charges the tier, so a sale of the same size keeps more at a big cap
    const keep = (mcap: number) => {
      const t = ammAt(mcap);
      const tokens = Math.round(t.poolBase * 1e-6);
      const q = poolSellQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, tokens);
      return q.solOut / (q.solOut + q.feeLamports);
    };
    expect(keep(98_240)).toBeGreaterThan(keep(100));
  });

  it("a recording of a big graduated coin is not charged the small-coin fee", () => {
    // Recorded value is m = a·mcap − b; at entry m ≈ 1 − the round trip. The sell side used to
    // assume 1.25% for every graduated coin, which is the tier only below 420 SOL.
    const entryAt = (mcapSol: number) => {
      const tr = new OutcomeTracker({ sizeSol: 0.1, costs: { ...DEFAULT_COSTS }, latencyMs: 0, horizonMs: 60_000, maxOpen: 100 }, () => {});
      const t = ammAt(mcapSol);
      tr.add(t, "checkpoint", "age20", 0, 50, 0.05, [], { tp: 100, sl: 50 });
      tr.onPrice(t, 1); // enters
      let got = NaN;
      tr.onPrice(t, 2);
      // the value now, with the price unchanged, is 1 − the round trip
      const open = (tr as unknown as { byMint: Map<string, { lastM: number }[]> }).byMint.get(t.mint);
      got = open?.[0]?.lastM ?? NaN;
      return 1 - got;
    };
    const small = entryAt(300);
    const big = entryAt(98_240);
    expect(small).toBeGreaterThan(0.03);
    // The big coin's round trip is cheaper: 0.95 points of it is the sell-side tier this fixes
    // (1.25% → 0.30%), the rest is the buy side's own tier and the smaller price impact of the
    // same 0.1 SOL in a far deeper pool. Before the fix the two were within 1.2 points.
    expect(small - big).toBeGreaterThan(0.015);
    expect(small - big).toBeLessThan(0.03);
  });

  it("a coin on the curve still pays the flat 1.25% a side", () => {
    expect(AMM_FEE_TIERS[0]!.fees.creator + AMM_FEE_TIERS[0]!.fees.protocol + AMM_FEE_TIERS[0]!.fees.lp).toBe(125);
  });
});
