import { describe, expect, it } from "vitest";
import { base58Decode, base58Encode, base64Encode, isAddress } from "../src/core/codec.js";
import { ammPostReserves, decodeEventData, decodeLogs } from "../src/core/decode.js";
import {
  encodeAmmSwap,
  encodeComplete,
  encodeCreate,
  encodeCreatePool,
  encodeMigration,
  encodeTrade,
  programDataLine,
} from "../src/core/encode.js";
import { PUMP_PROGRAM, WSOL_MINT } from "../src/core/types.js";

const ctx = { ts: 1_000, slot: 5, sig: "sig1", src: "test" as const };
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const USER = "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q";
const POOL = "GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J";

describe("base58", () => {
  it("round-trips known keys", () => {
    expect(base58Encode(new Uint8Array(32))).toBe("11111111111111111111111111111111");
    for (const k of [PUMP_PROGRAM, WSOL_MINT, MINT, USER, POOL]) {
      const b = base58Decode(k);
      expect(b.length).toBe(32);
      expect(base58Encode(b)).toBe(k);
      expect(isAddress(k)).toBe(true);
    }
    expect(isAddress("not-an-address")).toBe(false);
    expect(isAddress("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl")).toBe(false);
  });
  it("round-trips random bytes", () => {
    for (let i = 0; i < 300; i++) {
      const b = new Uint8Array(1 + (i % 70));
      for (let j = 0; j < b.length; j++) b[j] = (i * 31 + j * 17) & 0xff;
      if (i % 5 === 0) b[0] = 0;
      expect(Array.from(base58Decode(base58Encode(b)))).toEqual(Array.from(b));
    }
  });
});

describe("pump event decoding", () => {
  it("decodes CreateEvent", () => {
    const bytes = encodeCreate({
      name: "Jean Phil", symbol: "JEANPHIL", uri: "https://ipfs.io/ipfs/Qm", mint: MINT, bondingCurve: POOL,
      user: USER, creator: USER, chainTs: 1_790_000_000, vTok: 1_073_000_000_000_000, vSol: 30_000_000_000,
      realTok: 793_100_000_000_000, supply: 1_000_000_000_000_000,
    });
    const ev = decodeEventData(base64Encode(bytes), ctx);
    expect(ev).toMatchObject({ k: "create", name: "Jean Phil", symbol: "JEANPHIL", mint: MINT, creator: USER, vSol: 30e9, supply: 1e15 });
  });

  it("decodes TradeEvent (current and older, shorter versions)", () => {
    const f = { mint: MINT, sol: 1e9, tok: 3.4e13, buy: true, user: USER, chainTs: 1, vSol: 31e9, vTok: 1.038e15, realSol: 1e9, realTok: 7.59e14, fee: 9.5e6, creatorFee: 3e6, creator: USER };
    const full = decodeEventData(base64Encode(encodeTrade(f)), ctx);
    expect(full).toMatchObject({ k: "trade", mint: MINT, buy: true, sol: 1e9, tok: 3.4e13, vSol: 31e9, venue: "curve", ix: "buy" });
    expect((full as { fee: number }).fee).toBe(12.5e6);
    const old = decodeEventData(base64Encode(encodeTrade(f, { truncateAfterReserves: true })), ctx);
    expect(old).toMatchObject({ k: "trade", mint: MINT, sol: 1e9, realTok: 7.59e14 });
  });

  it("decodes complete, migration, pool creation and PumpSwap swaps", () => {
    expect(decodeEventData(base64Encode(encodeComplete(USER, MINT, POOL, 1)), ctx)).toMatchObject({ k: "complete", mint: MINT });
    expect(
      decodeEventData(base64Encode(encodeMigration({ user: USER, mint: MINT, mintAmount: 2e14, solAmount: 84e9, bondingCurve: POOL, chainTs: 1, pool: POOL })), ctx),
    ).toMatchObject({ k: "migrate", mint: MINT, pool: POOL, solAmount: 84e9 });
    expect(
      decodeEventData(base64Encode(encodeCreatePool({ chainTs: 1, creator: USER, baseMint: MINT, quoteMint: WSOL_MINT, poolBase: 2e14, poolQuote: 84e9, pool: POOL, lpMint: USER, coinCreator: USER })), ctx),
    ).toMatchObject({ k: "pool", pool: POOL, mint: MINT, quoteIsSol: true, base: 2e14, quote: 84e9, coinCreator: USER });
    const buy = decodeEventData(
      base64Encode(encodeAmmSwap({ chainTs: 1, buy: true, base: 1e12, poolBase: 2e14, poolQuote: 84e9, quoteAmount: 4.3e8, lpFee: 1e5, protocolFee: 3e6, creatorFee: 1e6, pool: POOL, user: USER, coinCreator: USER, supply: 1e15 })),
      ctx,
    );
    expect(buy).toMatchObject({ k: "ammSwap", buy: true, base: 1e12, poolBase: 2e14, poolQuote: 84e9, pool: POOL, user: USER, supply: 1e15 });
    const post = ammPostReserves(buy as never);
    expect(post.base).toBe(2e14 - 1e12);
    expect(post.quote).toBe(84e9 + 4.3e8 + 1e5);
    const sell = decodeEventData(
      base64Encode(encodeAmmSwap({ chainTs: 1, buy: false, base: 1e12, poolBase: 2e14, poolQuote: 84e9, quoteAmount: 4.1e8, lpFee: 1e5, protocolFee: 3e6, creatorFee: 1e6, pool: POOL, user: USER, coinCreator: USER, supply: 1e15 })),
      ctx,
    );
    expect(sell).toMatchObject({ k: "ammSwap", buy: false });
    expect(ammPostReserves(sell as never).quote).toBe(84e9 - (4.1e8 - 1e5));
  });

  it("extracts events from mixed log lines and ignores noise", () => {
    const logs = [
      `Program ${PUMP_PROGRAM} invoke [1]`,
      "Program log: Instruction: Buy",
      programDataLine(encodeTrade({ mint: MINT, sol: 5, tok: 7, buy: false, user: USER, chainTs: 1, vSol: 31e9, vTok: 1e15, realSol: 1, realTok: 7e14, fee: 1, creatorFee: 1, creator: USER })),
      "Program data: !!!notbase64!!!",
      "Program data: AAAA",
      `Program ${PUMP_PROGRAM} success`,
    ];
    const evs = decodeLogs(logs, ctx);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ k: "trade", buy: false });
  });

  it("never throws on random garbage", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const discs = [[189, 219, 127, 211, 78, 230, 97, 238], [27, 114, 169, 77, 222, 235, 99, 118], [103, 244, 82, 31, 44, 245, 119, 119], [62, 47, 55, 10, 165, 3, 220, 42]];
    for (let i = 0; i < 5000; i++) {
      const len = Math.floor(rnd() * 400);
      const b = new Uint8Array(len);
      for (let j = 0; j < len; j++) b[j] = Math.floor(rnd() * 256);
      if (len >= 8 && i % 2 === 0) b.set(discs[i % discs.length]!, 0);
      expect(() => decodeEventData(base64Encode(b), ctx)).not.toThrow();
    }
  });
});
