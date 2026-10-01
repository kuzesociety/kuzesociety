import { describe, expect, it } from "vitest";
import { MIN_QUOTE_LIQ_SOL, TokenState, quoteLiquiditySol, quoteTradable } from "../src/core/token.js";
import type { QuoteEvent } from "../src/core/types.js";
import { Scenario, T0, key } from "./helpers.js";

const MIN = 60_000;

/** The real quotes DexScreener sent for one pump.fun coin on 2026-09-29, before and after its pool was drained. */
const GOOD = { liqUsd: 25581.67, priceUsd: 1.281e-5, priceSol: 1.084e-7 };
const DRAINED = { liqUsd: 7.92, priceUsd: 7894.74, priceSol: 66.9727 };

describe("a quoted price needs a pool behind it", () => {
  it("reads the liquidity behind a quote in SOL, at the quote's own SOL price", () => {
    expect(quoteLiquiditySol(GOOD)).toBeCloseTo(216.4, 0);
    expect(quoteLiquiditySol(DRAINED)).toBeCloseTo(0.0672, 3);
    expect(quoteLiquiditySol({ priceUsd: 1, priceSol: 1 })).toBe(null);
  });

  it("takes a quote with a real pool behind it and refuses one from a drained pool", () => {
    expect(quoteTradable(GOOD)).toBe(true);
    expect(quoteTradable(DRAINED)).toBe(false);
    // a quote that does not say is not second-guessed
    expect(quoteTradable({ priceUsd: 1, priceSol: 1 })).toBe(true);
    expect(quoteTradable({ liqUsd: 1000, priceUsd: 200, priceSol: 1 })).toBe(MIN_QUOTE_LIQ_SOL <= 5);
  });

  it("does not let a drained pool's quote move a coin's price", () => {
    const t = new TokenState(key(1), T0);
    const quote = (q: typeof GOOD, ts: number): QuoteEvent => ({ k: "quote", ts, src: "test", mint: t.mint, ...q });
    t.applyQuote(quote(GOOD, T0));
    const priced = t.mcapSol;
    expect(priced).toBeGreaterThan(50);
    expect(t.quoteUntradable).toBe(false);

    t.applyQuote(quote(DRAINED, T0 + 15_000));
    // without the guard this is 66.97 SOL a token: a market cap ~700,000x the one before
    expect(t.mcapSol).toBe(priced);
    expect(t.quoteUntradable).toBe(true);

    t.applyQuote(quote(GOOD, T0 + 30_000));
    expect(t.quoteUntradable).toBe(false);
  });
});

describe("a coin whose pool is drained stops being watched", () => {
  it("marks its would-be trades unobserved instead of freezing them at the last good price", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 20 * MIN });
    const mint = key(81);
    const quote = (q: typeof GOOD) => s.emit({ k: "quote", ts: s.now, src: "test", mint, ...q });
    s.create(mint, key(82));
    quote(GOOD);
    // it graduates without the bot ever seeing one of its trades, so quotes are its only price
    const c = s.curves.get(mint)!;
    s.emit({ k: "migrate", ts: s.now, src: "pumpportal", sig: key(8400), mint });
    s.emit({ k: "pool", ts: s.now, src: "rpc", sig: key(8400), pool: key(8401), mint, quoteIsSol: true, base: c.vTok, quote: c.vSol });
    const gradAt = s.now;
    for (let i = 0; i < 12; i++) {
      s.advance(15_000);
      quote(GOOD);
    }
    expect(s.engine.tokens.get(mint)!.tradeCount).toBe(0);
    const openAt = s.now;
    quote(DRAINED); // the pool is drained; the quote turns to nonsense
    s.advance(25 * MIN);

    const mine = s.engine.samples.toArray().filter((x) => x.mint === mint && x.ts <= openAt);
    expect(mine.length).toBeGreaterThan(0);
    for (const x of mine) {
      expect(x.blind, `${x.tag} should have stopped being watched`).not.toBeUndefined();
      expect(x.blind!).toBeLessThanOrEqual((openAt - x.ts) / 1000 + 1);
      expect(x.maxMult).toBeLessThan(100); // nothing was recorded at the nonsense price
    }
    expect(gradAt).toBeLessThan(openAt);
  });
});
