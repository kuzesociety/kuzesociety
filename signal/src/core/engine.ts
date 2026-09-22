/**
 * SIGNAL engine — the single place where market events become scores, signals,
 * positions and learning samples. Platform-agnostic: the Node server, the replay/
 * research tools and the tests all drive this same class.
 *
 * Robustness rules:
 *  - `ingest` and `advance` never throw; a bad event is counted and skipped.
 *  - Time comes from the caller (`advance(now)`), so replays are deterministic.
 *  - Positions persist on every change; the engine restores them after a restart and
 *    keeps managing exits.
 */
import { LAMPORTS_PER_SOL } from "./curve.js";
import { ammPostReserves } from "./decode.js";
import { type RawFeatures, MarketPulse, extractFeatures, featureVector } from "./features.js";
import { Funnel, type SignalRecord } from "./funnel.js";
import { type ModelSpec, type ScoreResult, type StageKey, priorModel, scoreToken, validateModel } from "./model.js";
import { NarrativeIndex } from "./narratives.js";
import { ENTRY_LEVELS, OutcomeTracker, type Sample } from "./outcomes.js";
import {
  type CostModel,
  DEFAULT_COSTS,
  type ExitReason,
  type Fill,
  type Position,
  decideExit,
  positionMultiple,
  quoteBuy,
  quoteSell,
} from "./positions.js";
import { DEFAULT_SETTINGS, type Settings, exitPlanFrom, sanitizeSettings } from "./settings.js";
import { type TokenState, TokenState as Token } from "./token.js";
import type { AmmSwap, MarketEvent, TradeEvent } from "./types.js";
import { FEATURE_KEYS } from "./features.js";
import { type Logger, Ring, clamp, newId, rng, silentLogger } from "./util.js";
import { WalletBook } from "./wallets.js";

export interface EngineConfig {
  maxTokens: number;
  /** evict tokens with no activity for this long (unless held) */
  idleEvictMs: number;
  minTradesToScore: number;
  rescoreMs: number;
  sweepMs: number;
  feedStaleMs: number;
  paperStartSol: number;
  outcomeLatencyMs: number;
  outcomeSizeSol: number;
  outcomeHorizonMs: number;
  outcomeMaxOpen: number;
  checkpointsCurveSec: number[];
  checkpointsProgress: number[];
  checkpointsAmmSec: number[];
  maxSamplesInMemory: number;
  /** wallets remembered by the wallet book (each ~0.5 KB of memory) */
  maxWallets: number;
  /** deterministic seed for paper-latency jitter */
  seed: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  maxTokens: 25_000,
  idleEvictMs: 25 * 60_000,
  minTradesToScore: 3,
  rescoreMs: 1_000,
  sweepMs: 5_000,
  feedStaleMs: 45_000,
  paperStartSol: 10,
  outcomeLatencyMs: 1_500,
  outcomeSizeSol: 0.1,
  outcomeHorizonMs: 6 * 3_600_000,
  outcomeMaxOpen: 60_000,
  checkpointsCurveSec: [20, 45, 90, 180, 360, 720],
  checkpointsProgress: [0.25, 0.5, 0.75],
  checkpointsAmmSec: [60, 300, 900, 3600],
  maxSamplesInMemory: 30_000,
  maxWallets: 150_000,
  seed: 1,
};

export interface OrderRequest {
  id: string;
  side: "buy" | "sell";
  mint: string;
  positionId: string;
  /** buy: lamports all-in; sell: raw tokens */
  amount: number;
  slippagePct: number;
  /** expected average price (SOL/token) when decided — slippage reference */
  expectedPrice: number;
  reason: string;
  submittedAt: number;
  attempt: number;
  /** paper: when the transaction lands */
  landAt?: number;
  closesAccount?: boolean;
}

export interface OrderResult {
  orderId: string;
  ok: boolean;
  error?: string;
  ts: number;
  /** buy: lamports spent all-in; sell: lamports received net */
  lamports: number;
  tokens: number;
  mcapSol?: number;
  fees?: number;
  sig?: string;
}

/** Live executor (Node only). Results come back through `engine.onOrderResult`. */
export interface Executor {
  readonly kind: "live";
  ready(): boolean;
  submit(order: OrderRequest): void;
  maxPositionSol(): number;
}

export interface FeedHealth {
  name: string;
  status: "connecting" | "open" | "down" | "off";
  lastMsgAt: number;
  msgs: number;
  reconnects: number;
  errors: number;
  note?: string;
  critical: boolean;
}

export interface EngineHooks {
  onSignal?(rec: SignalRecord): void;
  onPosition?(p: Position, what: "open" | "fill" | "update" | "close" | "fail"): void;
  onSample?(s: Sample): void;
  needMeta?(mint: string, uri: string): void;
  needPool?(pool: string): void;
  watchMint?(mint: string, on: boolean): void;
  persist?(state: PersistedState): void;
  journal?(entry: Record<string, unknown>): void;
  onSettings?(s: Settings): void;
  onModel?(m: ModelSpec): void;
}

export interface PersistedToken {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  stage: TokenState["stage"];
  vSol: number;
  vTok: number;
  realTok: number;
  supply: number;
  pool?: string;
  poolBase: number;
  poolQuote: number;
  mcapSol: number;
  athMcapSol: number;
}

export interface PersistedState {
  v: 1;
  savedAt: number;
  settings: Settings;
  positions: Position[];
  closed: Position[];
  tradedMints: string[];
  paperBalance: number;
  killed: boolean;
  stats: EngineStats;
  tokens: PersistedToken[];
  pools: [string, string][];
}

export interface EngineStats {
  startedAt: number;
  events: number;
  trades: number;
  creates: number;
  ammSwaps: number;
  unmappedAmm: number;
  errors: number;
  badEvents: number;
  lastEventAt: number;
  lastTradeAt: number;
  realized: number;
  wins: number;
  losses: number;
  entries: number;
  exits: number;
  fees: number;
  dayKey: string;
  dayPnl: number;
  entryTimes: number[];
  equity: { t: number; v: number }[];
}

interface ScoreEntry {
  res: ScoreResult;
  f: RawFeatures;
  x: number[];
  at: number;
  above: number;
  armed: boolean;
  lastFunnelAt: number;
  /** bit i set once the coin has reached ENTRY_LEVELS[i] */
  reached: number;
  /** consecutive evaluations at or above each entry level */
  held: Uint8Array;
}

const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export class Engine {
  readonly cfg: EngineConfig;
  settings: Settings;
  model: ModelSpec;
  costs: CostModel;
  tokens = new Map<string, TokenState>();
  pools = new Map<string, string>();
  wallets: WalletBook;
  narratives = new NarrativeIndex();
  pulse = new MarketPulse();
  funnel = new Funnel();
  outcomes: OutcomeTracker;
  positions = new Map<string, Position>();
  closed = new Ring<Position>(500);
  tradedMints = new Set<string>();
  samples: Ring<Sample>;
  feeds = new Map<string, FeedHealth>();
  stats: EngineStats;
  paperBalance: number;
  killed = false;
  executor?: Executor;
  solUsd = 0;
  log: Logger;
  hooks: EngineHooks;

  private scores = new Map<string, ScoreEntry>();
  private dirty = new Set<string>();
  private orders = new Map<string, OrderRequest>();
  private paperQueue: OrderRequest[] = [];
  /** delayed actions (order retries) so failures never spin in a tight loop */
  private later: { at: number; run: () => void }[] = [];
  private lastSweep = 0;
  private lastPersist = 0;
  private persistDirty = false;
  private now = 0;
  private rand: () => number;
  private ammLast = new Map<string, { base: number; quote: number; rb: number; rq: number }>();
  private ammPending = new Map<string, { ev: AmmSwap; post: { base: number; quote: number } }[]>();
  ammPreHits = 0;
  ammPostHits = 0;
  /** population sample of feature vectors (for self-normalizing the prior's scale) */
  private xRes: Record<StageKey, Ring<number[]>> = { curve: new Ring(3000), amm: new Ring(3000) };
  private priorBase: ModelSpec;
  private lastNormalize = 0;

  constructor(opts: { now: number; settings?: Partial<Settings>; model?: ModelSpec; config?: Partial<EngineConfig>; hooks?: EngineHooks; log?: Logger; costs?: CostModel }) {
    this.cfg = { ...DEFAULT_CONFIG, ...(opts.config ?? {}) };
    this.settings = sanitizeSettings(opts.settings ?? {}, DEFAULT_SETTINGS);
    this.model = opts.model && validateModel(opts.model) ? opts.model : priorModel(opts.now);
    this.priorBase = priorModel(opts.now);
    this.costs = opts.costs ?? { ...DEFAULT_COSTS, priorityFeeSol: this.settings.priorityFeeSol, platformFeePct: this.settings.platformFeePct };
    this.hooks = opts.hooks ?? {};
    this.log = opts.log ?? silentLogger;
    this.now = opts.now;
    this.rand = rng(this.cfg.seed);
    this.wallets = new WalletBook(opts.now, { maxWallets: this.cfg.maxWallets });
    this.samples = new Ring<Sample>(this.cfg.maxSamplesInMemory);
    this.paperBalance = this.cfg.paperStartSol * LAMPORTS_PER_SOL;
    this.stats = {
      startedAt: opts.now,
      events: 0,
      trades: 0,
      creates: 0,
      ammSwaps: 0,
      unmappedAmm: 0,
      errors: 0,
      badEvents: 0,
      lastEventAt: 0,
      lastTradeAt: 0,
      realized: 0,
      wins: 0,
      losses: 0,
      entries: 0,
      exits: 0,
      fees: 0,
      dayKey: dayKey(opts.now),
      dayPnl: 0,
      entryTimes: [],
      equity: [{ t: opts.now, v: this.paperBalance }],
    };
    this.outcomes = new OutcomeTracker(
      {
        latencyMs: this.cfg.outcomeLatencyMs,
        sizeSol: this.cfg.outcomeSizeSol,
        horizonMs: this.cfg.outcomeHorizonMs,
        maxOpen: this.cfg.outcomeMaxOpen,
        costs: this.costs,
      },
      (s) => {
        this.samples.push(s);
        this.hooks.onSample?.(s);
      },
    );
  }

  get clock() {
    return this.now;
  }

  // -------------------------------------------------------------------------
  // Ingestion
  // -------------------------------------------------------------------------

  ingest(ev: MarketEvent | AmmSwap): void {
    try {
      if (!ev || typeof ev !== "object" || typeof (ev as { k?: unknown }).k !== "string") {
        this.stats.badEvents++;
        return;
      }
      const ts = Number.isFinite(ev.ts) ? ev.ts : this.now;
      // run anything that was due before this event happened (paper order landings)
      if (ts > this.now) this.advance(ts - 1, true);
      this.stats.events++;
      this.stats.lastEventAt = Math.max(this.stats.lastEventAt, ts);
      switch (ev.k) {
        case "create":
          this.onCreate(ev);
          break;
        case "trade":
          this.onTrade(ev);
          break;
        case "ammSwap":
          this.onAmmSwap(ev);
          break;
        case "complete": {
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyComplete(ts);
            this.wallets.noteCreatorResult(t.creator, t.athMcapSol, true);
            this.dirty.add(t.mint);
          }
          break;
        }
        case "migrate": {
          const t = this.tokens.get(ev.mint);
          if (ev.pool) this.pools.set(ev.pool, ev.mint);
          if (t) {
            t.applyMigrate(ts, ev.pool);
            if (!t.poolBase && ev.mintAmount && ev.solAmount) {
              t.poolBase = ev.mintAmount;
              t.poolQuote = ev.solAmount;
              t.refreshPrice();
            }
            this.dirty.add(t.mint);
          }
          if (ev.pool) this.drainPool(ev.pool);
          break;
        }
        case "pool": {
          if (!ev.quoteIsSol) break;
          this.pools.set(ev.pool, ev.mint);
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyMigrate(ts, ev.pool, ev.base, ev.quote);
            this.ammLast.set(ev.pool, { base: ev.base, quote: ev.quote, rb: ev.base, rq: ev.quote });
            this.dirty.add(t.mint);
          }
          this.drainPool(ev.pool);
          break;
        }
        case "quote": {
          let t = this.tokens.get(ev.mint);
          if (!t && this.isWatched(ev.mint)) t = this.ensureToken(ev.mint, ts, true);
          if (t) {
            t.applyQuote(ev);
            if (t.tradeCount === 0) this.onPrice(t);
            this.dirty.add(t.mint);
          }
          break;
        }
        case "meta": {
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyMeta(ev);
            if (ev.twitter) this.narratives.add(t.mint, t.createdAt, t.name, t.symbol, ev.twitter);
            this.dirty.add(t.mint);
          }
          break;
        }
        default:
          this.stats.badEvents++;
      }
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errors < 20 || this.stats.errors % 1000 === 0) this.log.error("ingest failed", { err: String(e), k: (ev as { k?: string })?.k });
    }
  }

  private isWatched(mint: string) {
    for (const p of this.positions.values()) if (p.mint === mint) return true;
    return false;
  }

  private ensureToken(mint: string, ts: number, partial: boolean): TokenState {
    let t = this.tokens.get(mint);
    if (!t) {
      t = new Token(mint, ts);
      t.partial = partial;
      this.tokens.set(mint, t);
      if (this.tokens.size > this.cfg.maxTokens) this.evictOldest();
    }
    return t;
  }

  private onCreate(ev: Extract<MarketEvent, { k: "create" }>) {
    this.stats.creates++;
    let t = this.tokens.get(ev.mint);
    if (t) t.applyCreate(ev);
    else {
      t = Token.fromCreate(ev);
      this.tokens.set(ev.mint, t);
      if (this.tokens.size > this.cfg.maxTokens) this.evictOldest();
    }
    this.wallets.noteCreate(ev.creator, ev.ts);
    this.narratives.add(ev.mint, ev.ts, ev.name, ev.symbol);
    this.pulse.onLaunch(ev.ts);
    if (ev.uri) this.hooks.needMeta?.(ev.mint, ev.uri);
  }

  private onTrade(ev: TradeEvent) {
    if (!(ev.vSol > 0) || !(ev.vTok > 0) || !(ev.tok >= 0) || !(ev.sol >= 0) || typeof ev.mint !== "string") {
      this.stats.badEvents++;
      return;
    }
    this.stats.trades++;
    this.stats.lastTradeAt = Math.max(this.stats.lastTradeAt, ev.ts);
    const t = this.ensureToken(ev.mint, ev.ts, true);
    if (t.stage === "amm" && ev.venue === "curve") return; // stale curve event after migration
    const w = this.wallets.touch(ev.user, ev.ts, ev.buy);
    const before = t.holders.get(ev.user);
    const hadBal = before ? before.bal : 0;
    t.applyTrade(ev, { fresh: w.fresh, knownWallet: w.known });
    const after = t.holders.get(ev.user);
    if (!before && after) this.wallets.noteNewPosition(ev.user, after.early, after.bundle);
    if (after && !ev.buy && hadBal > 0 && after.bal <= after.maxBal * 0.02) {
      // wallet sold out of this token: realize its result
      this.wallets.closePosition(ev.user, after.boughtSol, after.soldSol, 0);
      after.boughtSol = 0;
      after.soldSol = 0;
      after.maxBal = after.bal;
    }
    this.pulse.onTrade(ev.ts, ev.buy, ev.sol / LAMPORTS_PER_SOL);
    this.dirty.add(t.mint);
    this.onPrice(t);
  }

  private onAmmSwap(ev: AmmSwap) {
    this.stats.ammSwaps++;
    // reserve-continuity check tells us which reserve convention the program uses
    const last = this.ammLast.get(ev.pool);
    if (last) {
      const tol = Math.max(2, last.base * 1e-9);
      if (Math.abs(ev.poolBase - last.base) <= tol) this.ammPreHits++;
      const prevReportedBase = ev.buy ? ev.poolBase + ev.base : ev.poolBase - ev.base;
      if (Math.abs(prevReportedBase - last.rb) <= tol) this.ammPostHits++;
    }
    const pre = this.ammPostHits <= this.ammPreHits || this.ammPreHits + this.ammPostHits < 20;
    const post = ammPostReserves(ev, pre);
    this.ammLast.set(ev.pool, { ...post, rb: ev.poolBase, rq: ev.poolQuote });
    if (this.ammLast.size > 50_000) this.ammLast.delete(this.ammLast.keys().next().value as string);
    const mint = this.pools.get(ev.pool);
    if (!mint) {
      // pool not mapped yet (events can arrive out of order): hold briefly, ask for it
      this.stats.unmappedAmm++;
      let q = this.ammPending.get(ev.pool);
      if (!q) {
        if (this.ammPending.size >= 5_000) return;
        q = [];
        this.ammPending.set(ev.pool, q);
        this.hooks.needPool?.(ev.pool);
      }
      if (q.length < 50) q.push({ ev, post });
      return;
    }
    this.applyAmm(ev, post, mint);
  }

  private applyAmm(ev: AmmSwap, post: { base: number; quote: number }, mint: string) {
    this.onTrade({
      k: "trade",
      ts: ev.ts,
      chainTs: ev.chainTs,
      slot: ev.slot,
      sig: ev.sig,
      src: ev.src,
      mint,
      buy: ev.buy,
      sol: ev.quoteDelta,
      tok: ev.base,
      user: ev.user,
      venue: "amm",
      vSol: post.quote,
      vTok: post.base,
      supply: ev.supply,
      fee: ev.fee,
      pool: ev.pool,
    });
  }

  private drainPool(pool: string) {
    const q = this.ammPending.get(pool);
    const mint = this.pools.get(pool);
    if (!q || !mint) return;
    this.ammPending.delete(pool);
    for (const { ev, post } of q) if (this.now - ev.ts < 60_000) this.applyAmm(ev, post, mint);
  }

  /** Register a pool → mint mapping discovered out of band (RPC lookup). */
  mapPool(pool: string, mint: string) {
    this.pools.set(pool, mint);
    this.drainPool(pool);
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  /** Advance engine time: land paper orders, rescore, open checkpoints, maintenance. */
  advance(now: number, fromIngest = false): void {
    try {
      if (now < this.now) now = this.now;
      this.now = now;
      this.landPaperOrders(now);
      if (this.later.length) {
        const due = this.later.filter((a) => a.at <= now);
        if (due.length) {
          this.later = this.later.filter((a) => a.at > now);
          for (const a of due) a.run();
        }
      }
      if (fromIngest) return;
      this.rescoreDirty(now);
      if (now - this.lastSweep >= this.cfg.sweepMs) {
        this.lastSweep = now;
        this.sweep(now);
      }
      if (this.persistDirty && now - this.lastPersist >= 250) this.persistNow();
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errors < 20 || this.stats.errors % 1000 === 0) this.log.error("advance failed", { err: String(e), stack: (e as Error)?.stack });
    }
  }

  private onPrice(t: TokenState) {
    const now = Math.max(this.now, t.lastEventAt);
    this.outcomes.onPrice(t, now);
    for (const p of this.positions.values()) if (p.mint === t.mint && (p.status === "open" || p.status === "closing")) this.evaluatePosition(p, t, now);
  }

  // -------------------------------------------------------------------------
  // Scoring and signals
  // -------------------------------------------------------------------------

  private scorable(t: TokenState): boolean {
    if (t.nonSol || t.stage === "migrating") return false;
    if (t.tradeCount < this.cfg.minTradesToScore && !(t.stage === "amm" && t.quote)) return false;
    return true;
  }

  private rescoreDirty(now: number) {
    if (this.dirty.size === 0) return;
    const todo: string[] = [];
    for (const mint of this.dirty) {
      const prev = this.scores.get(mint);
      if (prev && now - prev.at < this.cfg.rescoreMs) continue;
      todo.push(mint);
    }
    for (const mint of todo) {
      this.dirty.delete(mint);
      const t = this.tokens.get(mint);
      if (!t || !this.scorable(t)) continue;
      this.scoreOne(t, now);
    }
  }

  private scoreOne(t: TokenState, now: number): ScoreEntry {
    const f = extractFeatures(t, { now, wallets: this.wallets, narratives: this.narratives, pulse: this.pulse, mcapOf: (m) => this.tokens.get(m)?.mcapSol ?? 0 });
    const res = scoreToken(this.model, f, true);
    const x = featureVector(f);
    let e = this.scores.get(t.mint);
    if (!e) {
      e = { res, f, x, at: now, above: 0, armed: true, lastFunnelAt: 0, reached: 0, held: new Uint8Array(ENTRY_LEVELS.length) };
      this.scores.set(t.mint, e);
    } else {
      e.res = res;
      e.f = f;
      e.x = x;
      e.at = now;
    }
    this.funnel.noteScored(now, t.mint, res.score);
    if (now - e.lastFunnelAt >= 60_000) {
      e.lastFunnelAt = now;
      this.xRes[res.stage].push(x);
    }
    this.checkpoints(t, e, now);
    this.signalLogic(t, e, now);
    return e;
  }

  private checkpoints(t: TokenState, e: ScoreEntry, now: number) {
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    const add = (tag: string) => {
      if (!this.outcomes.has(t.mint, tag)) this.outcomes.add(t, "checkpoint", tag, now, e.res.score, e.res.p, e.x, custom);
    };
    if (t.stage === "curve") {
      const age = (now - t.createdAt) / 1000;
      if (t.partial) return; // unknown true age: keep samples clean
      let tag: string | null = null;
      for (const s of this.cfg.checkpointsCurveSec) if (age >= s && age < s * 1.6) tag = `age${s}`;
      if (tag) add(tag);
      for (const p of this.cfg.checkpointsProgress) if (t.progress >= p && t.progress < p + 0.1) add(`prog${Math.round(p * 100)}`);
    } else if (t.stage === "amm" && t.migrateAt) {
      const since = (now - t.migrateAt) / 1000;
      for (const s of this.cfg.checkpointsAmmSec) if (since >= s && since < s * 1.6) add(`mig${s}`);
    }
  }

  /**
   * Follows the first entry at every level the way the bot would have bought it: the score
   * reached the level and held it for the configured number of evaluations.
   */
  private entryLevels(t: TokenState, e: ScoreEntry, now: number) {
    if (!this.modelReady()) return; // scores before the prior is scaled are not comparable
    const score = e.res.score;
    const need = this.settings.confirmTicks;
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    for (let i = 0; i < ENTRY_LEVELS.length; i++) {
      const level = ENTRY_LEVELS[i]!;
      if (score < level) {
        e.held[i] = 0;
        continue;
      }
      if (e.held[i]! < 255) e.held[i]!++;
      const bit = 1 << i;
      if (e.reached & bit || e.held[i]! < need) continue;
      e.reached |= bit;
      this.outcomes.add(t, "entry", `x${level}`, now, score, e.res.p, e.x, custom);
    }
  }

  private signalLogic(t: TokenState, e: ScoreEntry, now: number) {
    this.entryLevels(t, e, now);
    const s = this.settings;
    const score = e.res.score;
    if (score >= s.minScore) e.above++;
    else {
      e.above = 0;
      // One entry moment per coin: the first time it reaches the line and holds. Coming back
      // after a dip is usually a fading coin whose running totals still look strong (in
      // simulation those re-signals lost ~40% per trade), so it only re-arms with re-entry on.
      if (s.reentry && score < s.minScore - 5) e.armed = true;
    }
    if (!e.armed || e.above < s.confirmTicks) return;
    e.armed = false;
    const rec: SignalRecord = {
      id: newId("s"),
      ts: now,
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      stage: e.res.stage,
      score,
      p: e.res.p,
      mcapSol: t.mcapSol,
      decision: "pending",
      why: e.res.contributions.slice(0, 4),
    };
    const custom = { tp: s.tpPct, sl: s.slPct };
    this.outcomes.add(t, "signal", `sig${Math.floor(now / 1000)}`, now, score, e.res.p, e.x, custom);
    const blocked = this.entryBlock(t, e);
    if (blocked) {
      rec.decision = "blocked";
      rec.reason = blocked;
      this.funnel.add(rec);
      this.hooks.onSignal?.(rec);
      return;
    }
    this.funnel.add(rec);
    this.enter(t, rec, now);
    this.hooks.onSignal?.(rec);
  }

  /** Account-level limits always apply; token filters only when "score only" is off. */
  private entryBlock(t: TokenState, e: ScoreEntry): string | null {
    const s = this.settings;
    if (!s.enabled) return "bot_off";
    if (this.killed) return "kill_switch";
    if (t.nonSol) return "non_sol_quote";
    if ((t.stage === "curve" && !s.tradeCurve) || (t.stage === "amm" && !s.tradeAmm)) return "stage_off";
    if (t.stage === "migrating") return "migrating";
    for (const p of this.positions.values()) if (p.mint === t.mint) return "pending";
    if (!s.reentry && this.tradedMints.has(t.mint)) return "already_traded";
    let open = 0;
    for (const p of this.positions.values()) if (p.status !== "closed" && p.status !== "failed") open++;
    if (open >= s.maxOpen) return "max_open";
    this.rollDay(this.now);
    if (s.maxDailyLossSol > 0 && -this.stats.dayPnl >= s.maxDailyLossSol * LAMPORTS_PER_SOL) return "daily_loss_limit";
    const hourAgo = this.now - 3_600_000;
    this.stats.entryTimes = this.stats.entryTimes.filter((x) => x > hourAgo);
    if (this.stats.entryTimes.length >= s.maxTradesPerHour) return "rate_limit";
    if (this.feedDown()) return "feed_down";
    if (!this.modelReady()) return "warming_up";
    if (s.mode === "live") {
      if (!this.executor || !this.executor.ready()) return "live_disabled";
    } else if (this.paperBalance < s.positionSol * LAMPORTS_PER_SOL) return "insufficient_balance";
    if (s.scoreOnly) return null;
    const f = s.filters;
    const raw = e.f;
    if (f.minMcapSol > 0 && t.mcapSol < f.minMcapSol) return "filter:mcap_min";
    if (f.maxMcapSol > 0 && t.mcapSol > f.maxMcapSol) return "filter:mcap_max";
    if (raw.devShare * 100 > f.maxDevPct) return "filter:dev";
    if (raw.top10 * 100 > f.maxTop10Pct) return "filter:top10";
    if (raw.bundleShare * 100 > f.maxBundlePct) return "filter:bundle";
    if (raw.uniqTotal < f.minBuyers) return "filter:buyers";
    if (f.minAgeSec > 0 && raw.ageSec < f.minAgeSec) return "filter:age_min";
    if (f.maxAgeMin > 0 && raw.ageSec > f.maxAgeMin * 60) return "filter:age_max";
    if (f.requireSocials && raw.socials === 0) return "filter:socials";
    if (f.maxDevLaunches24h > 0 && raw.creatorLaunches24h > f.maxDevLaunches24h) return "filter:serial_dev";
    if (f.maxDevSoldPct < 100 && raw.devSold * 100 > f.maxDevSoldPct) return "filter:dev_sold";
    return null;
  }

  /** A prior model trades only after it has been scaled to the live market once. */
  modelReady(): boolean {
    return this.model.source === "trained" || !!this.model.scaledAt;
  }

  /** True when the primary trade feed has gone quiet (no trading blind). */
  feedDown(): boolean {
    const critical = [...this.feeds.values()].filter((f) => f.critical && f.status !== "off");
    if (critical.length === 0) return false;
    const anyAlive = critical.some((f) => f.status === "open" && this.now - f.lastMsgAt < this.cfg.feedStaleMs);
    return !anyAlive;
  }

  setFeedHealth(h: FeedHealth) {
    this.feeds.set(h.name, h);
  }

  // -------------------------------------------------------------------------
  // Orders & positions
  // -------------------------------------------------------------------------

  private enter(t: TokenState, rec: SignalRecord, now: number) {
    const s = this.settings;
    const lamports = Math.floor(Math.min(s.positionSol, this.executorCap()) * LAMPORTS_PER_SOL);
    const q = quoteBuy(t, lamports, this.costs, this.solUsd, true);
    if (!q.ok) {
      rec.decision = "failed";
      rec.reason = q.error;
      this.funnel.update(rec.id, "failed", q.error);
      return;
    }
    const pos: Position = {
      id: newId("p"),
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      mode: s.mode,
      stageAtEntry: t.stage === "amm" ? "amm" : "curve",
      status: "opening",
      signalId: rec.id,
      signalAt: now,
      signalScore: rec.score,
      signalP: rec.p,
      signalMcapSol: t.mcapSol,
      openedAt: now,
      plan: exitPlanFrom(s),
      cost: 0,
      tokens: 0,
      tokensLeft: 0,
      entryMcapSol: 0,
      entryPriceSol: 0,
      proceeds: 0,
      value: 0,
      valueAt: now,
      peakValue: 0,
      peakMult: 1,
      lowMult: 1,
      tpHit: false,
      fills: [],
      retries: 0,
      notes: [],
    };
    this.positions.set(pos.id, pos);
    this.tradedMints.add(t.mint);
    rec.positionId = pos.id;
    rec.decision = "pending";
    this.stats.entryTimes.push(now);
    const order: OrderRequest = {
      id: newId("o"),
      side: "buy",
      mint: t.mint,
      positionId: pos.id,
      amount: lamports,
      slippagePct: s.slippagePct,
      expectedPrice: q.avgPriceSol,
      reason: "signal",
      submittedAt: now,
      attempt: 1,
    };
    this.submit(order, pos);
    this.hooks.watchMint?.(t.mint, true);
    this.hooks.onPosition?.(pos, "open");
    this.journal({ type: "entry_submitted", pos: pos.id, mint: t.mint, score: rec.score, lamports, mode: s.mode });
    this.markDirty();
  }

  private executorCap(): number {
    if (this.settings.mode === "live" && this.executor) return this.executor.maxPositionSol();
    return Infinity;
  }

  private submit(order: OrderRequest, pos: Position) {
    this.orders.set(order.id, order);
    pos.pendingOrder = order.id;
    if (pos.mode === "live") {
      // exits are always handed to the executor (it allows closing even when halted)
      const refuse = !this.executor || (order.side === "buy" && !this.executor.ready());
      if (refuse) {
        this.later.push({ at: this.now + 1, run: () => this.onOrderResult({ orderId: order.id, ok: false, error: "live_disabled", ts: this.now, lamports: 0, tokens: 0 }) });
        return;
      }
      try {
        this.executor!.submit(order);
      } catch (e) {
        this.later.push({ at: this.now + 1, run: () => this.onOrderResult({ orderId: order.id, ok: false, error: "live_error", ts: this.now, lamports: 0, tokens: 0 }) });
        this.log.error("executor.submit threw", { err: String(e) });
      }
      return;
    }
    const base = this.settings.paperLatencyMs;
    const jitter = base * (0.75 + 0.5 * this.rand());
    order.landAt = order.submittedAt + Math.round(jitter);
    this.paperQueue.push(order);
    this.paperQueue.sort((a, b) => (a.landAt ?? 0) - (b.landAt ?? 0));
  }

  private landPaperOrders(now: number) {
    while (this.paperQueue.length && (this.paperQueue[0]!.landAt ?? 0) <= now) {
      const o = this.paperQueue.shift()!;
      this.executePaper(o, o.landAt ?? now);
    }
  }

  /** Simulate an order landing on-chain against the state at landing time. */
  private executePaper(o: OrderRequest, ts: number) {
    const t = this.tokens.get(o.mint);
    const fail = (error: string) => this.onOrderResult({ orderId: o.id, ok: false, error, ts, lamports: 0, tokens: 0 });
    if (!t) return fail("no_price");
    if (o.side === "buy") {
      if (this.paperBalance < o.amount) return fail("insufficient_balance");
      const q = quoteBuy(t, o.amount, this.costs, this.solUsd, true);
      if (!q.ok) return fail(q.error ?? "no_price");
      // the transaction reverts if the price moved beyond the slippage tolerance
      if (o.expectedPrice > 0 && (q.avgPriceSol / o.expectedPrice - 1) * 100 > o.slippagePct) return fail("slippage");
      this.onOrderResult({ orderId: o.id, ok: true, ts, lamports: q.lamports, tokens: q.tokens, mcapSol: t.mcapSol, fees: q.fees });
    } else {
      const q = quoteSell(t, o.amount, this.costs, this.solUsd, o.closesAccount ?? false);
      if (!q.ok) return fail(q.error ?? "no_price");
      if (o.expectedPrice > 0 && (1 - q.avgPriceSol / o.expectedPrice) * 100 > o.slippagePct) return fail("slippage");
      this.onOrderResult({ orderId: o.id, ok: true, ts, lamports: q.lamports, tokens: o.amount, mcapSol: t.mcapSol, fees: q.fees });
    }
  }

  /** Apply an execution result (paper or live). Idempotent per order id. */
  onOrderResult(r: OrderResult): void {
    try {
      const o = this.orders.get(r.orderId);
      if (!o) return;
      this.orders.delete(r.orderId);
      const pos = this.positions.get(o.positionId);
      if (!pos) return;
      if (pos.pendingOrder === o.id) pos.pendingOrder = undefined;
      const t = this.tokens.get(o.mint);
      if (o.side === "buy") this.onBuyResult(pos, o, r, t);
      else this.onSellResult(pos, o, r, t);
      this.markDirty();
    } catch (e) {
      this.stats.errors++;
      this.log.error("onOrderResult failed", { err: String(e) });
    }
  }

  private onBuyResult(pos: Position, o: OrderRequest, r: OrderResult, t?: TokenState) {
    const rec = this.funnel.get(pos.signalId);
    if (!r.ok) {
      // keep trying while the setup is still valid (score holds, window open)
      const score = this.scores.get(pos.mint)?.res.score ?? 0;
      const retryable = r.error === "slippage" || r.error === "migrating" || r.error === "no_price" || r.error === "live_error";
      const inWindow = this.now - pos.signalAt <= this.settings.retryWindowSec * 1000;
      if (retryable && inWindow && score >= this.settings.minScore && t && !this.killed && this.settings.enabled) {
        pos.retries++;
        const lamports = o.amount;
        const q = quoteBuy(t, lamports, this.costs, this.solUsd, true);
        if (q.ok) {
          pos.notes.push(`retry ${pos.retries} after ${r.error}`);
          this.submit({ ...o, id: newId("o"), expectedPrice: q.avgPriceSol, submittedAt: this.now, attempt: o.attempt + 1, landAt: undefined }, pos);
          return;
        }
      }
      pos.status = "failed";
      pos.exitReason = r.error ?? "failed";
      pos.closedAt = r.ts;
      pos.pnl = 0;
      pos.pnlPct = 0;
      this.positions.delete(pos.id);
      this.closed.push(pos);
      if (!this.settings.reentry) this.tradedMints.delete(pos.mint); // never actually traded — allow a later entry
      if (rec) this.funnel.update(rec.id, "failed", r.error);
      this.hooks.watchMint?.(pos.mint, false);
      this.hooks.onPosition?.(pos, "fail");
      this.journal({ type: "entry_failed", pos: pos.id, mint: pos.mint, error: r.error, retries: pos.retries });
      return;
    }
    pos.status = "open";
    pos.cost = r.lamports;
    pos.tokens = r.tokens;
    pos.tokensLeft = r.tokens;
    pos.openedAt = r.ts;
    pos.entryMcapSol = r.mcapSol ?? t?.mcapSol ?? 0;
    pos.entryPriceSol = r.tokens > 0 ? r.lamports / LAMPORTS_PER_SOL / (r.tokens / 1e6) : 0;
    pos.value = r.lamports;
    pos.peakValue = 0;
    const fill: Fill = { ts: r.ts, side: "buy", reason: "entry", lamports: r.lamports, tokens: r.tokens, mcapSol: pos.entryMcapSol, priceSol: pos.entryPriceSol, fees: r.fees ?? 0, sig: r.sig };
    pos.fills.push(fill);
    if (pos.mode === "paper") this.paperBalance -= r.lamports;
    this.stats.entries++;
    this.stats.fees += r.fees ?? 0;
    if (rec) this.funnel.update(rec.id, "entered", undefined, pos.id);
    this.hooks.onPosition?.(pos, "fill");
    if (this.killed && t) {
      // the kill switch was hit while this buy was in flight: get out right away
      pos.notes.push("filled after the kill switch — selling");
      this.sell(pos, t, 1, "kill", r.ts);
    } else if (t) this.evaluatePosition(pos, t, r.ts);
    this.journal({ type: "entry_filled", pos: pos.id, mint: pos.mint, lamports: r.lamports, tokens: r.tokens, mcap: pos.entryMcapSol, sig: r.sig });
  }

  private onSellResult(pos: Position, o: OrderRequest, r: OrderResult, t?: TokenState) {
    if (!r.ok) {
      // exits must happen: escalate slippage and retry immediately
      pos.retries++;
      const nextSlip = Math.min(95, Math.max(o.slippagePct * 1.6, o.slippagePct + 10));
      pos.notes.push(`exit retry ${pos.retries} after ${r.error}`);
      if (r.error === "migrating" || r.error === "no_price") {
        pos.status = "open"; // wait for the pool; evaluate again on the next price
        return;
      }
      if (pos.retries % 10 === 0) this.log.warn("exit still failing", { pos: pos.id, mint: pos.mint, error: r.error, retries: pos.retries });
      const delay = Math.min(5_000, 500 * o.attempt);
      pos.pendingOrder = "retry";
      this.later.push({
        at: this.now + delay,
        run: () => {
          if (pos.status === "closed" || !this.positions.has(pos.id)) return;
          const tok = this.tokens.get(pos.mint);
          const q = tok ? quoteSell(tok, Math.min(o.amount, pos.tokensLeft), this.costs, this.solUsd, o.closesAccount) : null;
          pos.pendingOrder = undefined;
          this.submit({ ...o, id: newId("o"), amount: Math.min(o.amount, pos.tokensLeft), slippagePct: nextSlip, expectedPrice: q?.ok ? q.avgPriceSol : 0, submittedAt: this.now, attempt: o.attempt + 1, landAt: undefined }, pos);
        },
      });
      return;
    }
    const sold = Math.min(pos.tokensLeft, r.tokens);
    pos.tokensLeft -= sold;
    pos.proceeds += r.lamports;
    this.stats.fees += r.fees ?? 0;
    if (pos.mode === "paper") this.paperBalance += r.lamports;
    pos.fills.push({ ts: r.ts, side: "sell", reason: o.reason, lamports: r.lamports, tokens: sold, mcapSol: r.mcapSol ?? t?.mcapSol ?? 0, priceSol: sold > 0 ? r.lamports / LAMPORTS_PER_SOL / (sold / 1e6) : 0, fees: r.fees ?? 0, sig: r.sig });
    if (o.reason === "initials") {
      pos.tpHit = true;
      pos.status = "open";
    }
    if (pos.tokensLeft <= 0 || pos.tokensLeft < pos.tokens * 0.001) this.closePosition(pos, o.reason, r.ts);
    else {
      if (t) {
        const q = quoteSell(t, pos.tokensLeft, this.costs, this.solUsd);
        pos.value = q.ok ? q.lamports : 0;
        pos.peakValue = Math.max(pos.peakValue, pos.value);
      }
      if (pos.status === "closing") pos.status = "open";
      this.hooks.onPosition?.(pos, "update");
    }
    this.journal({ type: "exit_filled", pos: pos.id, mint: pos.mint, reason: o.reason, lamports: r.lamports, tokens: sold, sig: r.sig });
  }

  private closePosition(pos: Position, reason: string, ts: number) {
    pos.status = "closed";
    pos.tokensLeft = 0;
    pos.value = 0;
    pos.exitReason = reason;
    pos.closedAt = ts;
    pos.pnl = pos.proceeds - pos.cost;
    pos.pnlPct = pos.cost > 0 ? (pos.pnl / pos.cost) * 100 : 0;
    this.positions.delete(pos.id);
    this.closed.push(pos);
    this.rollDay(ts);
    this.stats.realized += pos.pnl;
    this.stats.dayPnl += pos.pnl;
    this.stats.exits++;
    if (pos.pnl > 0) this.stats.wins++;
    else this.stats.losses++;
    this.stats.equity.push({ t: ts, v: this.paperBalance });
    if (this.stats.equity.length > 2000) this.stats.equity.splice(0, this.stats.equity.length - 2000);
    this.hooks.watchMint?.(pos.mint, false);
    this.hooks.onPosition?.(pos, "close");
    this.journal({ type: "closed", pos: pos.id, mint: pos.mint, reason, pnl: pos.pnl, pnlPct: pos.pnlPct, cost: pos.cost, proceeds: pos.proceeds });
  }

  private rollDay(ts: number) {
    const k = dayKey(ts);
    if (k !== this.stats.dayKey) {
      this.stats.dayKey = k;
      this.stats.dayPnl = 0;
    }
  }

  /** Revalue a held position and act on its exit plan. */
  private evaluatePosition(pos: Position, t: TokenState, now: number) {
    if (pos.status !== "open") return;
    const q = quoteSell(t, pos.tokensLeft, this.costs, this.solUsd, true);
    if (!q.ok) return; // migrating / no price: hold until tradable
    pos.value = q.lamports;
    pos.valueAt = now;
    const mult = positionMultiple(pos);
    if (mult > pos.peakMult) pos.peakMult = mult;
    if (mult < pos.lowMult) pos.lowMult = mult;
    if (pos.tpHit) pos.peakValue = Math.max(pos.peakValue, pos.value);
    if (pos.pendingOrder) return;
    const d = decideExit(pos, now, t.lastTradeAt || pos.openedAt);
    if (d.action === "arm") {
      pos.tpHit = true;
      pos.peakValue = pos.value;
      pos.notes.push(`target reached at ${mult.toFixed(2)}×, trailing stop armed`);
      this.hooks.onPosition?.(pos, "update");
      return;
    }
    if (d.action === "sell") this.sell(pos, t, d.fraction, d.reason, now);
  }

  private sell(pos: Position, t: TokenState, fraction: number, reason: ExitReason, now: number) {
    const tokens = fraction >= 0.999 ? pos.tokensLeft : Math.floor(pos.tokensLeft * fraction);
    if (tokens <= 0) return;
    const full = tokens >= pos.tokensLeft;
    const q = quoteSell(t, tokens, this.costs, this.solUsd, full);
    pos.status = "closing";
    const slip = reason === "sl" || reason === "kill" || reason === "dead" ? Math.max(pos.plan.exitSlippagePct, 40) : pos.plan.exitSlippagePct;
    this.submit(
      {
        id: newId("o"),
        side: "sell",
        mint: pos.mint,
        positionId: pos.id,
        amount: tokens,
        slippagePct: slip,
        expectedPrice: q.ok ? q.avgPriceSol : 0,
        reason,
        submittedAt: now,
        attempt: 1,
        closesAccount: full,
      },
      pos,
    );
    this.journal({ type: "exit_submitted", pos: pos.id, mint: pos.mint, reason, tokens });
  }

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  updateSettings(patch: unknown): Settings {
    const prev = this.settings;
    const next = sanitizeSettings(patch, prev);
    this.settings = next;
    this.costs = { ...this.costs, priorityFeeSol: next.priorityFeeSol, platformFeePct: next.platformFeePct };
    this.outcomes.setOptions({ latencyMs: next.paperLatencyMs, costs: this.costs });
    // A moved threshold gives coins still below it a first crossing to come; coins already
    // above it had their moment earlier, and buying them now would be a late entry.
    const moved = next.minScore !== prev.minScore;
    for (const e of this.scores.values()) {
      e.above = 0;
      e.at = 0;
      if (next.reentry) e.armed = true;
      else if (moved) e.armed = e.res.score < next.minScore;
    }
    this.hooks.onSettings?.(next);
    this.journal({ type: "settings", settings: next });
    this.markDirty();
    return next;
  }

  setKill(on: boolean, sellAll = false) {
    this.killed = on;
    if (on && sellAll) for (const p of [...this.positions.values()]) this.closeManually(p.id, "kill");
    this.journal({ type: "kill", on, sellAll });
    this.markDirty();
  }

  closeManually(positionId: string, reason: ExitReason = "manual"): boolean {
    const p = this.positions.get(positionId);
    if (!p) return false;
    const t = this.tokens.get(p.mint);
    if (p.status === "opening") {
      p.notes.push("cancelled before fill");
      return false;
    }
    if (!t || p.tokensLeft <= 0 || p.pendingOrder) return false;
    this.sell(p, t, 1, reason, this.now);
    return true;
  }

  /**
   * Live reconciliation after a restart: align a position with what the wallet actually
   * holds (sold elsewhere, partially filled…).
   */
  reconcile(positionId: string, tokensInWallet: number) {
    const p = this.positions.get(positionId);
    if (!p) return;
    if (tokensInWallet <= 0) {
      // most likely an exit that landed while the server was down: book the last
      // marked value as an estimate rather than a total loss
      if (p.status === "open" || p.status === "closing") {
        p.proceeds += Math.max(0, p.value);
        p.notes.push("not in wallet after restart — booked at last marked value (estimate)");
      } else p.notes.push("entry never landed");
      p.tokensLeft = 0;
      this.closePosition(p, "external", this.now);
      return;
    }
    if (p.status === "opening") {
      p.status = "open";
      p.tokens = tokensInWallet;
      p.notes.push("entry confirmed from wallet after restart");
    }
    if (tokensInWallet < p.tokensLeft) {
      p.notes.push(`wallet holds ${tokensInWallet} of ${p.tokensLeft} tokens — adjusted`);
      p.tokensLeft = tokensInWallet;
    }
    this.markDirty();
  }

  setModel(m: ModelSpec): boolean {
    if (!validateModel(m)) return false;
    this.model = m;
    for (const e of this.scores.values()) e.at = 0; // rescore soon
    this.journal({ type: "model", version: m.version, source: m.source });
    return true;
  }

  /**
   * Keep the PRIOR model's scale honest for the market it is watching: learn feature
   * means/spreads from the live population (no outcomes needed) and set the weight
   * temperature so scores spread ~16 points around 50 (≈5% of scored coins reach 75).
   * A trained model keeps the scale its data gave it.
   */
  normalizePrior(minRows = 300) {
    if (this.model.source !== "prior") return;
    let changed = false;
    for (const stage of ["curve", "amm"] as StageKey[]) {
      const rows = this.xRes[stage].toArray();
      if (rows.length < minRows) continue;
      const base = this.priorBase.stages[stage];
      const cur = this.model.stages[stage];
      const n = rows.length;
      const blend = n / (n + 600);
      const mean: Record<string, number> = {};
      const std: Record<string, number> = {};
      FEATURE_KEYS.forEach((k, j) => {
        let m = 0;
        for (const r of rows) m += r[j]!;
        m /= n;
        let v = 0;
        for (const r of rows) v += (r[j]! - m) ** 2;
        const sd = Math.sqrt(v / Math.max(1, n - 1));
        const pm = base.mean[k] ?? 0;
        const ps = base.std[k] ?? 1;
        mean[k] = (1 - blend) * pm + blend * m;
        // never let a rare feature's tiny spread blow its z-scores up
        std[k] = Math.max((1 - blend) * ps + blend * sd, 0.5 * ps, 1e-6);
      });
      // spread of the linear predictor under the base weights
      const lin: number[] = [];
      for (const r of rows) {
        let s2 = 0;
        FEATURE_KEYS.forEach((k, j) => {
          s2 += (base.weights[k] ?? 0) * clamp((r[j]! - mean[k]!) / std[k]!, -5, 5);
        });
        lin.push(s2);
      }
      const lm = lin.reduce((a, b) => a + b, 0) / lin.length;
      const lsd = Math.sqrt(lin.reduce((a, b) => a + (b - lm) ** 2, 0) / Math.max(1, lin.length - 1));
      const k = lsd > 1e-6 ? clamp(0.85 / lsd, 0.15, 3) : 1;
      const weights: Record<string, number> = {};
      for (const key of FEATURE_KEYS) weights[key] = (base.weights[key] ?? 0) * k;
      // centre: the average scored coin lands at 50
      const bias = base.bias - lm * k;
      this.model.stages[stage] = { ...cur, mean, std, weights, bias, pRef: base.pRef };
      changed = true;
    }
    if (changed) {
      const first = !this.model.scaledAt;
      this.model = { ...this.model, scaledAt: this.now, version: `prior-2.0 · auto-scaled ${new Date(this.now).toISOString().slice(0, 16)}Z` };
      for (const e of this.scores.values()) {
        e.at = 0;
        if (first) {
          e.armed = true;
          e.above = 0;
        }
      }
      this.hooks.onModel?.(this.model);
      if (first) this.log.info("score scale learned from the live market — entries enabled");
    }
  }

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------

  private sweep(now: number) {
    // periodic rescore of recently active tokens so time-based features stay fresh
    for (const [mint, e] of this.scores) {
      if (now - e.at > 10_000) {
        const t = this.tokens.get(mint);
        if (t && now - t.lastEventAt < 10 * 60_000 && this.scorable(t)) this.scoreOne(t, now);
      }
    }
    // time-based exits for positions whose token stopped trading
    for (const p of this.positions.values()) {
      const t = this.tokens.get(p.mint);
      if (t && p.status === "open") this.evaluatePosition(p, t, now);
    }
    this.outcomes.sweep(now, (m) => this.tokens.get(m));
    const every = this.modelReady() ? 5 * 60_000 : 30_000;
    if (now - this.lastNormalize >= every) {
      this.lastNormalize = now;
      this.normalizePrior(this.modelReady() ? 300 : 150);
    }
    // unmapped PumpSwap swaps are only held for a short while
    for (const [pool, q] of this.ammPending) if (q.length === 0 || now - q[q.length - 1]!.ev.ts > 60_000) this.ammPending.delete(pool);
    this.narratives.prune(now);
    this.evictIdle(now);
    this.rollDay(now);
  }

  private held(mint: string) {
    for (const p of this.positions.values()) if (p.mint === mint) return true;
    return false;
  }

  private evictIdle(now: number) {
    for (const [mint, t] of this.tokens) {
      if (!t.isIdle(now, this.cfg.idleEvictMs) || this.held(mint)) continue;
      this.forget(t, now);
    }
    for (const mint of this.scores.keys()) if (!this.tokens.has(mint)) this.scores.delete(mint);
  }

  private evictOldest() {
    let oldest: TokenState | undefined;
    for (const t of this.tokens.values()) {
      if (this.held(t.mint)) continue;
      if (!oldest || t.lastEventAt < oldest.lastEventAt) oldest = t;
    }
    if (oldest) this.forget(oldest, this.now);
  }

  private forget(t: TokenState, now: number) {
    // realize holders' results at the last price (feeds wallet intelligence)
    const price = t.priceSol;
    for (const [addr, h] of t.holders) {
      if (h.boughtSol > 0) this.wallets.closePosition(addr, h.boughtSol, h.soldSol, (h.bal / 1e6) * price * 0.97);
    }
    this.wallets.noteCreatorResult(t.creator, t.athMcapSol, t.stage !== "curve");
    this.outcomes.onTokenGone(t, now);
    this.tokens.delete(t.mint);
    this.scores.delete(t.mint);
    this.dirty.delete(t.mint);
    if (t.pool) this.pools.delete(t.pool);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private markDirty() {
    this.persistDirty = true;
  }

  private journal(entry: Record<string, unknown>) {
    try {
      this.hooks.journal?.({ ts: this.now, ...entry });
    } catch {
      /* journal errors must not stop trading */
    }
  }

  persistNow() {
    this.persistDirty = false;
    this.lastPersist = this.now;
    try {
      this.hooks.persist?.(this.exportState());
    } catch (e) {
      this.log.error("persist failed", { err: String(e) });
      this.persistDirty = true;
    }
  }

  exportState(): PersistedState {
    const heldMints = new Set([...this.positions.values()].map((p) => p.mint));
    const tokens: PersistedToken[] = [];
    for (const m of heldMints) {
      const t = this.tokens.get(m);
      if (!t) continue;
      tokens.push({
        mint: t.mint, name: t.name, symbol: t.symbol, creator: t.creator, createdAt: t.createdAt, stage: t.stage,
        vSol: t.vSol, vTok: t.vTok, realTok: t.realTok, supply: t.supply, pool: t.pool, poolBase: t.poolBase,
        poolQuote: t.poolQuote, mcapSol: t.mcapSol, athMcapSol: t.athMcapSol,
      });
    }
    const pools: [string, string][] = [];
    for (const [pool, mint] of this.pools) if (heldMints.has(mint)) pools.push([pool, mint]);
    return {
      v: 1,
      savedAt: this.now,
      settings: this.settings,
      positions: [...this.positions.values()],
      closed: this.closed.toArray().slice(-200),
      tradedMints: [...this.tradedMints].slice(-5000),
      paperBalance: this.paperBalance,
      killed: this.killed,
      stats: this.stats,
      tokens,
      pools,
    };
  }

  /** Restore after a restart. Open positions resume exit management immediately. */
  restore(s: PersistedState) {
    if (!s || s.v !== 1) return;
    this.settings = sanitizeSettings(s.settings ?? {}, DEFAULT_SETTINGS);
    this.costs = { ...this.costs, priorityFeeSol: this.settings.priorityFeeSol, platformFeePct: this.settings.platformFeePct };
    this.paperBalance = Number.isFinite(s.paperBalance) ? s.paperBalance : this.paperBalance;
    this.killed = !!s.killed;
    for (const m of s.tradedMints ?? []) this.tradedMints.add(m);
    for (const p of s.closed ?? []) this.closed.push(p);
    if (s.stats) this.stats = { ...this.stats, ...s.stats, startedAt: this.stats.startedAt, lastEventAt: 0, lastTradeAt: 0 };
    for (const [pool, mint] of s.pools ?? []) this.pools.set(pool, mint);
    for (const pt of s.tokens ?? []) {
      const t = new Token(pt.mint, pt.createdAt);
      t.name = pt.name;
      t.symbol = pt.symbol;
      t.creator = pt.creator;
      t.stage = pt.stage;
      t.vSol = pt.vSol;
      t.vTok = pt.vTok;
      t.realTok = pt.realTok;
      t.supply = pt.supply;
      t.pool = pt.pool;
      t.poolBase = pt.poolBase;
      t.poolQuote = pt.poolQuote;
      t.partial = true;
      t.refreshPrice();
      t.athMcapSol = Math.max(pt.athMcapSol, t.mcapSol);
      t.lastEventAt = this.now;
      this.tokens.set(t.mint, t);
    }
    for (const p of s.positions ?? []) {
      if (p.status === "opening") {
        // the entry never confirmed before shutdown: in paper mode it is dropped;
        // live mode reconciles it against the wallet (see live executor)
        if (p.mode === "paper") {
          p.status = "failed";
          p.exitReason = "restart_before_fill";
          p.closedAt = this.now;
          this.closed.push(p);
          continue;
        }
      }
      if (p.status === "closing") p.status = "open"; // re-evaluate exits
      p.pendingOrder = undefined;
      this.positions.set(p.id, p);
      this.hooks.watchMint?.(p.mint, true);
    }
    this.log.info("state restored", { open: this.positions.size, closed: this.closed.length });
  }

  // -------------------------------------------------------------------------
  // Views (dashboard)
  // -------------------------------------------------------------------------

  scoreOf(mint: string) {
    return this.scores.get(mint);
  }

  radar(opts: { limit?: number; minScore?: number; stage?: "curve" | "amm" | "all"; sort?: "score" | "new" | "mcap" } = {}) {
    const limit = clamp(opts.limit ?? 60, 1, 500);
    const rows: RadarRow[] = [];
    const held = new Set([...this.positions.values()].map((p) => p.mint));
    for (const [mint, e] of this.scores) {
      const t = this.tokens.get(mint);
      if (!t) continue;
      if (opts.stage && opts.stage !== "all" && e.res.stage !== opts.stage) continue;
      if (opts.minScore && e.res.score < opts.minScore) continue;
      rows.push(this.radarRow(t, e, held.has(mint)));
    }
    const sort = opts.sort ?? "score";
    rows.sort((a, b) => (sort === "new" ? b.createdAt - a.createdAt : sort === "mcap" ? b.mcapSol - a.mcapSol : b.score - a.score));
    return rows.slice(0, limit);
  }

  radarRow(t: TokenState, e: ScoreEntry, held: boolean): RadarRow {
    const f = e.f;
    const flags: string[] = [];
    if (f.bundleShare > 0.15) flags.push("bundled");
    if (f.devSold > 0.5) flags.push("dev sold");
    if (f.creatorLaunches24h > 3) flags.push("serial dev");
    if (f.smartBuyers > 0) flags.push(`${f.smartBuyers} smart`);
    if (f.top10 > 0.5) flags.push("concentrated");
    if (f.isLeader) flags.push("narrative leader");
    else if (f.clusterSize > 1) flags.push("copycat");
    return {
      mint: t.mint,
      name: t.name,
      symbol: t.symbol,
      stage: e.res.stage,
      score: Math.round(e.res.score * 10) / 10,
      p: e.res.p,
      calibrated: e.res.calibrated,
      mcapSol: t.mcapSol,
      athMcapSol: t.athMcapSol,
      ageSec: f.ageSec,
      progress: t.progress,
      net60: f.net60,
      buyers: f.uniqTotal,
      holders: f.holders,
      top10: f.top10,
      devShare: f.devShare,
      cluster: f.clusterSize,
      flags,
      held,
      spent: !e.armed,
      createdAt: t.createdAt,
      lastTradeAt: t.lastTradeAt,
      image: t.meta.image,
      twitter: t.meta.twitter,
      telegram: t.meta.telegram,
      website: t.meta.website,
      why: e.res.contributions.slice(0, 3),
    };
  }

  tokenDetail(mint: string) {
    const t = this.tokens.get(mint);
    if (!t) return null;
    const e = this.scores.get(mint);
    const conc = t.concentration(this.now);
    const narrative = this.narratives.describe(mint, (m) => this.tokens.get(m)?.mcapSol ?? 0);
    const holders = [...t.holders.entries()]
      .filter(([, h]) => h.bal > 0)
      .sort((a, b) => b[1].bal - a[1].bal)
      .slice(0, 15)
      .map(([addr, h]) => ({
        addr,
        pct: (h.bal / t.supply) * 100,
        dev: addr === t.creator,
        early: h.early,
        bundle: h.bundle,
        smart: this.wallets.isSmart(addr),
      }));
    return {
      mint,
      name: t.name,
      symbol: t.symbol,
      creator: t.creator,
      stage: t.stage,
      createdAt: t.createdAt,
      partial: t.partial,
      mcapSol: t.mcapSol,
      athMcapSol: t.athMcapSol,
      progress: t.progress,
      pool: t.pool,
      meta: t.meta,
      quote: t.quote,
      score: e?.res ?? null,
      features: e?.f ?? null,
      concentration: conc,
      narrative,
      holders,
      creatorStats: t.creator ? this.wallets.creator(t.creator, this.now) : null,
      trades: t.trades.toArray().slice(-60).reverse(),
      positions: [...this.positions.values(), ...this.closed.toArray()].filter((p) => p.mint === mint),
      // the coin's entry moment: whether it came, and what the bot did about it
      entry: {
        spent: e ? !e.armed : false,
        above: e?.above ?? 0,
        need: this.settings.confirmTicks,
        signals: this.funnel.recent.toArray().filter((r) => r.mint === mint),
      },
    };
  }

  health() {
    const now = this.now;
    const mem = typeof process !== "undefined" && process.memoryUsage ? process.memoryUsage().rss : 0;
    return {
      now,
      uptimeSec: Math.round((now - this.stats.startedAt) / 1000),
      feeds: [...this.feeds.values()],
      feedDown: this.feedDown(),
      tokens: this.tokens.size,
      scored: this.scores.size,
      wallets: this.wallets.size,
      smartWallets: this.wallets.smartCount(),
      pools: this.pools.size,
      events: this.stats.events,
      trades: this.stats.trades,
      creates: this.stats.creates,
      ammSwaps: this.stats.ammSwaps,
      unmappedAmm: this.stats.unmappedAmm,
      errors: this.stats.errors,
      badEvents: this.stats.badEvents,
      lagMs: this.stats.lastEventAt ? Math.max(0, now - this.stats.lastEventAt) : null,
      hypotheticalsOpen: this.outcomes.open,
      samples: this.samples.length,
      samplesResolved: this.outcomes.resolvedCount,
      ammReserveConvention: this.ammPreHits + this.ammPostHits < 20 ? "learning" : this.ammPreHits >= this.ammPostHits ? "pre-trade" : "post-trade",
      memMb: mem ? Math.round(mem / 1e6) : null,
      model: { version: this.model.version, source: this.model.source, training: this.model.training ?? null },
    };
  }

  account() {
    const open = [...this.positions.values()];
    const openValue = open.reduce((s, p) => s + p.value, 0);
    const exposure = open.reduce((s, p) => s + p.cost - p.proceeds, 0);
    return {
      mode: this.settings.mode,
      enabled: this.settings.enabled,
      killed: this.killed,
      paperBalance: this.paperBalance,
      equity: this.paperBalance + openValue,
      openValue,
      exposure,
      realized: this.stats.realized,
      dayPnl: this.stats.dayPnl,
      wins: this.stats.wins,
      losses: this.stats.losses,
      entries: this.stats.entries,
      fees: this.stats.fees,
      open,
      closed: this.closed.toArray().slice(-100).reverse(),
      equityCurve: this.stats.equity,
    };
  }
}

export interface RadarRow {
  mint: string;
  name: string;
  symbol: string;
  stage: "curve" | "amm";
  score: number;
  p: number;
  calibrated: boolean;
  mcapSol: number;
  athMcapSol: number;
  ageSec: number;
  progress: number;
  net60: number;
  buyers: number;
  holders: number;
  top10: number;
  devShare: number;
  cluster: number;
  flags: string[];
  held: boolean;
  /** already had its entry moment (bought, blocked, or crossed before trading was on) */
  spent: boolean;
  createdAt: number;
  lastTradeAt: number;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  why: ScoreResult["contributions"];
}
