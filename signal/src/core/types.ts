/** Normalized market events shared by every feed, the engine, the recorder and replays. */

export type Venue = "curve" | "amm";
export type FeedSource = "rpc" | "pumpportal" | "dexscreener" | "sim" | "replay" | "test";

interface Base {
  /** local receive time, ms since epoch (engine clock) */
  ts: number;
  slot?: number;
  sig?: string;
  src: FeedSource;
}

export interface CreateEvent extends Base {
  k: "create";
  chainTs?: number;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  creator: string;
  /** transaction signer (usually the creator) */
  user: string;
  vSol: number;
  vTok: number;
  realTok: number;
  supply: number;
  mayhem?: boolean;
  /** true when the coin is quoted in something other than SOL (skipped for trading) */
  nonSolQuote?: boolean;
  holderReward?: boolean;
}

export interface TradeEvent extends Base {
  k: "trade";
  chainTs?: number;
  mint: string;
  buy: boolean;
  /** lamports that moved into/out of the reserves, fees excluded */
  sol: number;
  /** raw token units */
  tok: number;
  user: string;
  venue: Venue;
  /** reserves AFTER this trade: curve virtual reserves, or effective pool reserves */
  vSol: number;
  vTok: number;
  realSol?: number;
  realTok?: number;
  supply?: number;
  /** lamports paid in fees (all kinds) */
  fee?: number;
  pool?: string;
  ix?: string;
}

export interface CompleteEvent extends Base {
  k: "complete";
  mint: string;
}

export interface MigrateEvent extends Base {
  k: "migrate";
  mint: string;
  pool?: string;
  /** lamports and raw tokens seeded into the pool */
  solAmount?: number;
  mintAmount?: number;
}

/** PumpSwap pool creation (gives the pool → mint mapping and opening reserves). */
export interface PoolEvent extends Base {
  k: "pool";
  pool: string;
  mint: string;
  quoteIsSol: boolean;
  base: number;
  quote: number;
  coinCreator?: string;
}

/** Periodic quote from an off-chain aggregator (DexScreener). */
export interface QuoteEvent extends Base {
  k: "quote";
  mint: string;
  priceUsd?: number;
  priceSol?: number;
  mcapUsd?: number;
  liqUsd?: number;
  vol5mUsd?: number;
  vol1hUsd?: number;
  buys5m?: number;
  sells5m?: number;
  chg5m?: number;
  chg1h?: number;
  pairAddress?: string;
  dexId?: string;
  pairCreatedAt?: number;
  name?: string;
  symbol?: string;
}

export interface MetaEvent extends Base {
  k: "meta";
  mint: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  image?: string;
  dexProfile?: boolean;
  boosts?: number;
}

export type MarketEvent = CreateEvent | TradeEvent | CompleteEvent | MigrateEvent | PoolEvent | QuoteEvent | MetaEvent;

/** Raw PumpSwap swap before the pool has been mapped to its mint. */
export interface AmmSwap {
  k: "ammSwap";
  ts: number;
  chainTs?: number;
  slot?: number;
  sig?: string;
  pool: string;
  buy: boolean;
  /** raw base tokens bought or sold */
  base: number;
  /** lamports into (buy) or out of (sell) the pool vault */
  quoteDelta: number;
  /** lamports paid in fees */
  fee: number;
  user: string;
  /** pool reserves reported by the event (pre-trade on current programs) */
  poolBase: number;
  poolQuote: number;
  virtualQuote: number;
  supply?: number;
  src: FeedSource;
}

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const DEFAULT_PUBKEY = "11111111111111111111111111111111";
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
