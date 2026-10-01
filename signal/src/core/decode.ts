/**
 * Decode pump.fun (pump + PumpSwap) Anchor events from transaction logs.
 *
 * Both programs emit events as `Program data: <base64>` log lines: an 8-byte event
 * discriminator followed by Borsh fields (layouts from pump-fun/pump-public-docs idl/).
 * Later program upgrades APPEND fields, so decoders read what they need and treat a
 * short buffer as an older event version. Anything malformed returns null — a bad
 * message must never throw into the engine.
 */
import { Reader, base64Decode, bytesEqualPrefix, OutOfData } from "./codec.js";
import {
  type AmmSwap,
  type CompleteEvent,
  type CreateEvent,
  type FeedSource,
  type MigrateEvent,
  type PoolEvent,
  type TradeEvent,
  DEFAULT_PUBKEY,
  WSOL_MINT,
} from "./types.js";

export const DISC = {
  create: [27, 114, 169, 77, 222, 235, 99, 118],
  trade: [189, 219, 127, 211, 78, 230, 97, 238],
  complete: [95, 114, 97, 156, 212, 46, 152, 8],
  migration: [189, 233, 93, 185, 92, 148, 234, 148],
  ammBuy: [103, 244, 82, 31, 44, 245, 119, 119],
  ammSell: [62, 47, 55, 10, 165, 3, 220, 42],
  ammCreatePool: [177, 49, 12, 210, 160, 118, 167, 116],
} as const;

export type DecodedEvent = CreateEvent | TradeEvent | CompleteEvent | MigrateEvent | PoolEvent | AmmSwap;

interface Ctx {
  ts: number;
  slot?: number;
  sig?: string;
  src: FeedSource;
}

const isSolQuote = (q: string | undefined) => q === undefined || q === DEFAULT_PUBKEY || q === WSOL_MINT;

function tryOptional<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof OutOfData) return fallback;
    throw e;
  }
}

export function decodeCreate(data: Uint8Array, ctx: Ctx): CreateEvent | null {
  try {
    const r = new Reader(data, 8);
    const name = r.string(256);
    const symbol = r.string(64);
    const uri = r.string(512);
    const mint = r.pubkey();
    r.pubkey(); // bonding_curve
    const user = r.pubkey();
    const creator = r.pubkey();
    const chainTs = r.i64();
    const vTok = r.u64();
    const vSol = r.u64();
    const realTok = r.u64();
    const supply = r.u64();
    const ev: CreateEvent = {
      k: "create",
      ts: ctx.ts,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      chainTs,
      mint,
      name,
      symbol,
      uri,
      creator,
      user,
      vSol,
      vTok,
      realTok,
      supply,
    };
    // appended fields (newer program versions)
    tryOptional(() => {
      r.pubkey(); // token_program
      ev.mayhem = r.bool();
      r.bool(); // is_cashback_enabled
      const quoteMint = r.pubkey();
      const vQuote = r.u64();
      if (!isSolQuote(quoteMint)) {
        ev.nonSolQuote = true;
        if (vQuote > 0) ev.vSol = vQuote;
      }
      r.u64(); // creator_fee_bps
      ev.holderReward = r.bool();
      return null;
    }, null);
    if (!(ev.vTok > 0) || !(ev.supply > 0)) return null;
    return ev;
  } catch {
    return null;
  }
}

export function decodeTrade(data: Uint8Array, ctx: Ctx): TradeEvent | null {
  try {
    const r = new Reader(data, 8);
    const mint = r.pubkey();
    const sol = r.u64();
    const tok = r.u64();
    const buy = r.bool();
    const user = r.pubkey();
    const chainTs = r.i64();
    const vSol = r.u64();
    const vTok = r.u64();
    const realSol = r.u64();
    const realTok = r.u64();
    const ev: TradeEvent = {
      k: "trade",
      ts: ctx.ts,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      chainTs,
      mint,
      buy,
      sol,
      tok,
      user,
      venue: "curve",
      vSol,
      vTok,
      realSol,
      realTok,
    };
    tryOptional(() => {
      r.pubkey(); // fee_recipient
      r.u64(); // fee_basis_points
      const fee = r.u64();
      r.pubkey(); // creator
      r.u64(); // creator_fee_basis_points
      const creatorFee = r.u64();
      ev.fee = fee + creatorFee;
      r.bool(); // track_volume
      r.u64(); // total_unclaimed_tokens
      r.u64(); // total_claimed_tokens
      r.u64(); // current_sol_volume
      r.i64(); // last_update_timestamp
      ev.ix = r.string(64);
      r.bool(); // mayhem_mode
      r.u64(); // cashback_fee_basis_points
      r.u64(); // cashback
      r.u64(); // buyback_fee_basis_points
      const buyback = r.u64();
      ev.fee += buyback;
      const holders = r.u32();
      if (holders > 64) throw new OutOfData();
      r.skip(holders * 34);
      const quoteMint = r.pubkey();
      if (!isSolQuote(quoteMint)) {
        // non-SOL quote: sol_* fields do not carry the quote side
        const quoteAmount = r.u64();
        const vQuote = r.u64();
        const realQuote = r.u64();
        ev.sol = quoteAmount;
        ev.vSol = vQuote;
        ev.realSol = realQuote;
        (ev as TradeEvent & { nonSolQuote?: boolean }).nonSolQuote = true;
      }
      return null;
    }, null);
    if (!(ev.vTok > 0) || !(ev.vSol > 0)) return null;
    return ev;
  } catch {
    return null;
  }
}

export function decodeComplete(data: Uint8Array, ctx: Ctx): CompleteEvent | null {
  try {
    const r = new Reader(data, 8);
    r.pubkey(); // user
    const mint = r.pubkey();
    return { k: "complete", ts: ctx.ts, slot: ctx.slot, sig: ctx.sig, src: ctx.src, mint };
  } catch {
    return null;
  }
}

export function decodeMigration(data: Uint8Array, ctx: Ctx): MigrateEvent | null {
  try {
    const r = new Reader(data, 8);
    r.pubkey(); // user
    const mint = r.pubkey();
    const mintAmount = r.u64();
    const solAmount = r.u64();
    r.u64(); // pool_migration_fee
    r.pubkey(); // bonding_curve
    r.i64(); // timestamp
    const pool = r.pubkey();
    return { k: "migrate", ts: ctx.ts, slot: ctx.slot, sig: ctx.sig, src: ctx.src, mint, pool, mintAmount, solAmount };
  } catch {
    return null;
  }
}

export function decodeCreatePool(data: Uint8Array, ctx: Ctx): PoolEvent | null {
  try {
    const r = new Reader(data, 8);
    r.i64(); // timestamp
    r.u16(); // index
    r.pubkey(); // creator
    const baseMint = r.pubkey();
    const quoteMint = r.pubkey();
    r.u8(); // base decimals
    r.u8(); // quote decimals
    r.u64(); // base_amount_in
    r.u64(); // quote_amount_in
    const poolBase = r.u64();
    const poolQuote = r.u64();
    r.u64(); // minimum_liquidity
    r.u64(); // initial_liquidity
    r.u64(); // lp_token_amount_out
    r.u8(); // pool_bump
    const pool = r.pubkey();
    const ev: PoolEvent = {
      k: "pool",
      ts: ctx.ts,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      pool,
      mint: baseMint,
      quoteIsSol: isSolQuote(quoteMint),
      base: poolBase,
      quote: poolQuote,
    };
    tryOptional(() => {
      r.pubkey(); // lp_mint
      r.pubkey(); // user_base_token_account
      r.pubkey(); // user_quote_token_account
      ev.coinCreator = r.pubkey();
      return null;
    }, null);
    return ev;
  } catch {
    return null;
  }
}

function decodeAmmSwap(data: Uint8Array, ctx: Ctx, buy: boolean): AmmSwap | null {
  try {
    const r = new Reader(data, 8);
    const chainTs = r.i64();
    const base = r.u64(); // base_amount_out (buy) | base_amount_in (sell)
    r.u64(); // max_quote_amount_in | min_quote_amount_out
    r.u64(); // user_base_token_reserves
    r.u64(); // user_quote_token_reserves
    const poolBase = r.u64();
    const poolQuote = r.u64();
    const quoteAmount = r.u64(); // quote_amount_in | quote_amount_out (gross)
    r.u64(); // lp_fee_basis_points
    const lpFee = r.u64();
    r.u64(); // protocol_fee_basis_points
    const protocolFee = r.u64();
    const vaultDelta = r.u64(); // quote_amount_in_with_lp_fee | quote_amount_out_without_lp_fee
    r.u64(); // user_quote_amount_in | user_quote_amount_out
    const pool = r.pubkey();
    const user = r.pubkey();
    r.pubkey(); // user_base_token_account
    r.pubkey(); // user_quote_token_account
    r.pubkey(); // protocol_fee_recipient
    r.pubkey(); // protocol_fee_recipient_token_account
    r.pubkey(); // coin_creator
    r.u64(); // coin_creator_fee_basis_points
    const creatorFee = r.u64();
    const ev: AmmSwap = {
      k: "ammSwap",
      ts: ctx.ts,
      chainTs,
      slot: ctx.slot,
      sig: ctx.sig,
      src: ctx.src,
      pool,
      buy,
      base,
      quoteDelta: vaultDelta > 0 ? vaultDelta : buy ? quoteAmount + lpFee : Math.max(0, quoteAmount - lpFee),
      fee: lpFee + protocolFee + creatorFee,
      user,
      poolBase,
      poolQuote,
      virtualQuote: 0,
    };
    tryOptional(() => {
      if (buy) {
        r.bool(); // track_volume
        r.u64();
        r.u64();
        r.u64();
        r.i64();
        r.u64(); // min_base_amount_out
        r.string(64); // ix_name
      }
      r.u64(); // cashback_fee_basis_points
      r.u64(); // cashback
      r.u64(); // buyback_fee_basis_points
      r.u64(); // buyback_fee
      ev.virtualQuote = Math.max(0, r.i128());
      r.bool(); // can_boost
      const supply = r.u64();
      if (supply > 0) ev.supply = supply;
      return null;
    }, null);
    if (!(ev.poolBase > 0) || !(ev.poolQuote > 0)) return null;
    return ev;
  } catch {
    return null;
  }
}

const PREFIX = "Program data: ";

/** Decode one base64 event payload (without the `Program data: ` prefix). */
export function decodeEventData(b64: string, ctx: Ctx): DecodedEvent | null {
  let data: Uint8Array;
  try {
    data = base64Decode(b64.trim());
  } catch {
    return null;
  }
  if (data.length < 8) return null;
  if (bytesEqualPrefix(data, DISC.trade)) return decodeTrade(data, ctx);
  if (bytesEqualPrefix(data, DISC.create)) return decodeCreate(data, ctx);
  if (bytesEqualPrefix(data, DISC.ammBuy)) return decodeAmmSwap(data, ctx, true);
  if (bytesEqualPrefix(data, DISC.ammSell)) return decodeAmmSwap(data, ctx, false);
  if (bytesEqualPrefix(data, DISC.complete)) return decodeComplete(data, ctx);
  if (bytesEqualPrefix(data, DISC.migration)) return decodeMigration(data, ctx);
  if (bytesEqualPrefix(data, DISC.ammCreatePool)) return decodeCreatePool(data, ctx);
  return null;
}

/** Decode all known events from a transaction's log lines, in order. */
export function decodeLogs(logs: readonly string[], ctx: Ctx): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const line of logs) {
    if (typeof line !== "string" || !line.startsWith(PREFIX)) continue;
    const ev = decodeEventData(line.slice(PREFIX.length), ctx);
    if (ev) out.push(ev);
  }
  return out;
}

/**
 * Post-trade pool reserves for a PumpSwap swap. Current programs report the reserves
 * the swap was priced on (pre-trade); `reservesArePreTrade=false` handles the other
 * convention. The engine measures which convention holds from reserve continuity.
 */
export function ammPostReserves(s: AmmSwap, reservesArePreTrade = true): { base: number; quote: number } {
  const vq = s.virtualQuote || 0;
  if (!reservesArePreTrade) return { base: s.poolBase, quote: s.poolQuote + vq };
  if (s.buy) return { base: s.poolBase - s.base, quote: s.poolQuote + s.quoteDelta + vq };
  return { base: s.poolBase + s.base, quote: Math.max(0, s.poolQuote - s.quoteDelta) + vq };
}
