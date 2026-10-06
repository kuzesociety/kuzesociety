/**
 * Borsh encoders for pump / PumpSwap events. Used by the simulator (to emit the exact
 * `Program data:` log lines the live RPC feed sees) and by tests.
 */
import { base58Decode, base64Encode } from "./codec.js";
import { DISC } from "./decode.js";
import { DEFAULT_PUBKEY } from "./types.js";

class Writer {
  private buf = new Uint8Array(512);
  private view = new DataView(this.buf.buffer);
  len = 0;
  private grow(n: number) {
    if (this.len + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  bytes(b: ArrayLike<number>) {
    this.grow(b.length);
    this.buf.set(b as ArrayLike<number>, this.len);
    this.len += b.length;
  }
  u8(v: number) {
    this.grow(1);
    this.view.setUint8(this.len, v);
    this.len += 1;
  }
  bool(v: boolean) {
    this.u8(v ? 1 : 0);
  }
  u16(v: number) {
    this.grow(2);
    this.view.setUint16(this.len, v, true);
    this.len += 2;
  }
  u32(v: number) {
    this.grow(4);
    this.view.setUint32(this.len, v, true);
    this.len += 4;
  }
  u64(v: number) {
    this.grow(8);
    const big = BigInt(Math.round(v));
    this.view.setBigUint64(this.len, big < 0n ? 0n : big, true);
    this.len += 8;
  }
  i64(v: number) {
    this.grow(8);
    this.view.setBigInt64(this.len, BigInt(Math.round(v)), true);
    this.len += 8;
  }
  i128(v: number) {
    this.grow(16);
    let big = BigInt(Math.round(v));
    if (big < 0n) big += 1n << 128n;
    for (let i = 0; i < 16; i++) {
      this.buf[this.len + i] = Number(big & 0xffn);
      big >>= 8n;
    }
    this.len += 16;
  }
  pubkey(s: string) {
    const b = base58Decode(s);
    if (b.length !== 32) throw new Error(`not a pubkey: ${s}`);
    this.bytes(b);
  }
  string(s: string) {
    const b = new TextEncoder().encode(s);
    this.u32(b.length);
    this.bytes(b);
  }
  out(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export interface CreateFields {
  name: string;
  symbol: string;
  uri: string;
  mint: string;
  bondingCurve: string;
  user: string;
  creator: string;
  chainTs: number;
  vTok: number;
  vSol: number;
  realTok: number;
  supply: number;
}

export function encodeCreate(f: CreateFields): Uint8Array {
  const w = new Writer();
  w.bytes(DISC.create);
  w.string(f.name);
  w.string(f.symbol);
  w.string(f.uri);
  w.pubkey(f.mint);
  w.pubkey(f.bondingCurve);
  w.pubkey(f.user);
  w.pubkey(f.creator);
  w.i64(f.chainTs);
  w.u64(f.vTok);
  w.u64(f.vSol);
  w.u64(f.realTok);
  w.u64(f.supply);
  w.pubkey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  w.bool(false); // mayhem
  w.bool(false); // cashback
  w.pubkey(DEFAULT_PUBKEY);
  w.u64(f.vSol);
  w.u64(0);
  w.bool(false);
  return w.out();
}

export interface TradeFields {
  mint: string;
  sol: number;
  tok: number;
  buy: boolean;
  user: string;
  chainTs: number;
  vSol: number;
  vTok: number;
  realSol: number;
  realTok: number;
  fee: number;
  creatorFee: number;
  creator: string;
  ix?: string;
}

export function encodeTrade(f: TradeFields, opts: { truncateAfterReserves?: boolean } = {}): Uint8Array {
  const w = new Writer();
  w.bytes(DISC.trade);
  w.pubkey(f.mint);
  w.u64(f.sol);
  w.u64(f.tok);
  w.bool(f.buy);
  w.pubkey(f.user);
  w.i64(f.chainTs);
  w.u64(f.vSol);
  w.u64(f.vTok);
  w.u64(f.realSol);
  w.u64(f.realTok);
  if (opts.truncateAfterReserves) return w.out(); // an "old version" event
  w.pubkey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
  w.u64(95);
  w.u64(f.fee);
  w.pubkey(f.creator);
  w.u64(30);
  w.u64(f.creatorFee);
  w.bool(true);
  w.u64(0);
  w.u64(0);
  w.u64(0);
  w.i64(f.chainTs);
  w.string(f.ix ?? (f.buy ? "buy" : "sell"));
  w.bool(false); // mayhem
  w.u64(0);
  w.u64(0);
  w.u64(0);
  w.u64(0);
  w.u32(0); // shareholders
  w.pubkey(DEFAULT_PUBKEY);
  w.u64(f.sol);
  w.u64(f.vSol);
  w.u64(f.realSol);
  w.u64(0);
  w.u64(0);
  return w.out();
}

export function encodeComplete(user: string, mint: string, bondingCurve: string, chainTs: number): Uint8Array {
  const w = new Writer();
  w.bytes(DISC.complete);
  w.pubkey(user);
  w.pubkey(mint);
  w.pubkey(bondingCurve);
  w.i64(chainTs);
  w.pubkey(DEFAULT_PUBKEY);
  return w.out();
}

export function encodeMigration(f: {
  user: string;
  mint: string;
  mintAmount: number;
  solAmount: number;
  bondingCurve: string;
  chainTs: number;
  pool: string;
}): Uint8Array {
  const w = new Writer();
  w.bytes(DISC.migration);
  w.pubkey(f.user);
  w.pubkey(f.mint);
  w.u64(f.mintAmount);
  w.u64(f.solAmount);
  w.u64(15_000_001);
  w.pubkey(f.bondingCurve);
  w.i64(f.chainTs);
  w.pubkey(f.pool);
  w.pubkey(DEFAULT_PUBKEY);
  return w.out();
}

export function encodeCreatePool(f: {
  chainTs: number;
  creator: string;
  baseMint: string;
  quoteMint: string;
  poolBase: number;
  poolQuote: number;
  pool: string;
  lpMint: string;
  coinCreator: string;
}): Uint8Array {
  const w = new Writer();
  w.bytes(DISC.ammCreatePool);
  w.i64(f.chainTs);
  w.u16(0);
  w.pubkey(f.creator);
  w.pubkey(f.baseMint);
  w.pubkey(f.quoteMint);
  w.u8(6);
  w.u8(9);
  w.u64(f.poolBase);
  w.u64(f.poolQuote);
  w.u64(f.poolBase);
  w.u64(f.poolQuote);
  w.u64(100);
  w.u64(1000);
  w.u64(1000);
  w.u8(255);
  w.pubkey(f.pool);
  w.pubkey(f.lpMint);
  w.pubkey(f.creator);
  w.pubkey(f.creator);
  w.pubkey(f.coinCreator);
  w.bool(false);
  w.u64(0);
  w.bool(false);
  w.bool(false);
  return w.out();
}

export interface AmmSwapFields {
  chainTs: number;
  buy: boolean;
  base: number;
  poolBase: number;
  poolQuote: number;
  /** gross quote amount (buy: quote_amount_in, sell: quote_amount_out) */
  quoteAmount: number;
  lpFee: number;
  protocolFee: number;
  creatorFee: number;
  pool: string;
  user: string;
  coinCreator: string;
  supply: number;
}

export function encodeAmmSwap(f: AmmSwapFields): Uint8Array {
  const w = new Writer();
  w.bytes(f.buy ? DISC.ammBuy : DISC.ammSell);
  w.i64(f.chainTs);
  w.u64(f.base);
  w.u64(f.buy ? f.quoteAmount * 2 : 0);
  w.u64(0);
  w.u64(0);
  w.u64(f.poolBase);
  w.u64(f.poolQuote);
  w.u64(f.quoteAmount);
  w.u64(20);
  w.u64(f.lpFee);
  w.u64(5);
  w.u64(f.protocolFee);
  w.u64(f.buy ? f.quoteAmount + f.lpFee : f.quoteAmount - f.lpFee);
  w.u64(f.buy ? f.quoteAmount + f.lpFee + f.protocolFee + f.creatorFee : f.quoteAmount - f.lpFee - f.protocolFee - f.creatorFee);
  w.pubkey(f.pool);
  w.pubkey(f.user);
  w.pubkey(f.user);
  w.pubkey(f.user);
  w.pubkey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
  w.pubkey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
  w.pubkey(f.coinCreator);
  w.u64(30);
  w.u64(f.creatorFee);
  if (f.buy) {
    w.bool(true);
    w.u64(0);
    w.u64(0);
    w.u64(0);
    w.i64(f.chainTs);
    w.u64(0);
    w.string("buy");
  }
  w.u64(0);
  w.u64(0);
  w.u64(0);
  w.u64(0);
  w.i128(0);
  w.bool(false);
  w.u64(f.supply);
  w.u64(0);
  w.u64(0);
  return w.out();
}

export function programDataLine(bytes: Uint8Array): string {
  return "Program data: " + base64Encode(bytes);
}
