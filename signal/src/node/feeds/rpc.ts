/**
 * Solana RPC stream: `logsSubscribe` on the pump program (every create, trade and
 * graduation), decoded locally. By default it runs on the free public Solana feed.
 *
 * PumpSwap is not streamed whole: every swap on every PumpSwap pool is about nine tenths
 * of the data (most of those pools never came from pump.fun), which is what made a metered
 * key run out in hours. Instead the pools that matter are followed one by one: coins we
 * hold, coins that just graduated (for an hour), and graduated coins whose would-be trades
 * are still being measured. `ammFirehose` restores the whole stream.
 *
 * Through a metered key (Helius and others charge per MB) the stream stays within a daily
 * budget; past it, the free public feed takes over until 00:00 UTC.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { decodeLogs, type DecodedEvent } from "../../core/decode.js";
import type { FeedHealth } from "../../core/engine.js";
import { PUMP_AMM_PROGRAM, PUMP_PROGRAM } from "../../core/types.js";
import { LRU, type Logger } from "../../core/util.js";
import { ReconnectingWS } from "../ws.js";

/** How long a newly graduated coin's pool is followed, and how many at once. */
export const GRADUATE_WATCH_MS = 60 * 60_000;
export const MAX_GRADUATES = 10;

export interface RpcFeedOptions {
  url: string;
  /** used once the daily budget of a metered `url` is spent */
  fallbackUrl?: string;
  /** daily cap for a metered `url`, in MB (0 = none) */
  budgetMb?: number;
  /** remembers today's usage across restarts */
  budgetFile?: string;
  onBudgetSpent?: (limitMb: number) => void;
  /** stream every PumpSwap swap instead of following pools one by one */
  ammFirehose?: boolean;
  /** pools the engine needs: coins held, and graduates whose would-be trades are still followed
   * (asked every `poolCheckMs`, 5 s by default) */
  followPools?: () => string[];
  poolCheckMs?: number;
  commitment?: "processed" | "confirmed";
  log: Logger;
  onEvent: (ev: DecodedEvent) => void;
  onHealth: (h: FeedHealth) => void;
}

interface LogsNotification {
  method?: string;
  params?: { result?: { context?: { slot?: number }; value?: { signature?: string; err?: unknown; logs?: string[] } }; subscription?: number };
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export class RpcLogsFeed {
  private ws: ReconnectingWS;
  private seen = new LRU<string, 1>(50_000);
  private nextId = 10;
  /** pool subscriptions: request id → pool while waiting, pool → subscription id once active */
  private pending = new Map<number, string>();
  private active = new Map<string, number>();
  private graduates = new Map<string, number>();
  /** pools the server would not let us follow, and when to try again */
  private refused = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private day = utcDay();
  private usedToday = 0;
  private savedUsage = 0;
  private onFree = false;
  truncated = 0;
  failedTx = 0;
  decoded = 0;

  constructor(private o: RpcFeedOptions) {
    this.loadUsage();
    this.ws = new ReconnectingWS({
      name: "solana-rpc",
      url: () => (this.onFree && o.fallbackUrl ? o.fallbackUrl : o.url),
      critical: true,
      staleMs: 45_000,
      pingMs: 15_000,
      log: o.log,
      onHealth: o.onHealth,
      onOpen: (send) => {
        this.pending.clear();
        this.active.clear();
        const commitment = o.commitment ?? "processed";
        send({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [PUMP_PROGRAM] }, { commitment }] });
        if (o.ammFirehose) send({ jsonrpc: "2.0", id: 2, method: "logsSubscribe", params: [{ mentions: [PUMP_AMM_PROGRAM] }, { commitment }] });
        this.reconcile();
      },
      onMessage: (text) => this.onMessage(text),
    });
    this.showBudget();
  }

  start() {
    this.ws.start();
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.rollDay();
        this.reconcile();
        this.saveUsage();
      }, this.o.poolCheckMs ?? 5_000);
      this.timer.unref?.();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.saveUsage();
    this.ws.stop();
  }

  /** Pools followed right now (held coins and recent graduates). */
  get pools(): string[] {
    return [...this.active.keys()];
  }

  // ---- pools, one by one --------------------------------------------------------------

  /** A coin we followed graduated: follow its pool for a while (unless the whole stream runs). */
  graduated(pool: string) {
    if (this.o.ammFirehose) return;
    this.graduates.delete(pool);
    this.graduates.set(pool, Date.now() + GRADUATE_WATCH_MS);
    while (this.graduates.size > MAX_GRADUATES) this.graduates.delete(this.graduates.keys().next().value as string);
    this.reconcile();
  }

  private wanted(): Set<string> {
    const now = Date.now();
    for (const [pool, until] of this.graduates) if (until < now) this.graduates.delete(pool);
    let held: string[] = [];
    try {
      held = this.o.followPools?.() ?? [];
    } catch {
      held = [];
    }
    return new Set([...held, ...this.graduates.keys()]);
  }

  /** Subscribes to pools newly wanted and drops the ones no longer wanted. */
  private reconcile() {
    if (this.o.ammFirehose || !this.ws.open) return;
    const want = this.wanted();
    for (const [pool, sub] of this.active) {
      if (want.has(pool)) continue;
      this.active.delete(pool);
      this.ws.send({ jsonrpc: "2.0", id: this.nextId++, method: "logsUnsubscribe", params: [sub] });
    }
    const waiting = new Set(this.pending.values());
    const now = Date.now();
    for (const pool of want) {
      if (this.active.has(pool) || waiting.has(pool) || (this.refused.get(pool) ?? 0) > now) continue;
      const id = this.nextId++;
      this.pending.set(id, pool);
      this.ws.send({ jsonrpc: "2.0", id, method: "logsSubscribe", params: [{ mentions: [pool] }, { commitment: this.o.commitment ?? "processed" }] });
    }
  }

  // ---- daily budget on a metered key ----------------------------------------------------

  private get metered() {
    return !!this.o.budgetMb && !!this.o.fallbackUrl;
  }

  private loadUsage() {
    if (!this.o.budgetFile || !existsSync(this.o.budgetFile)) return;
    try {
      const u = JSON.parse(readFileSync(this.o.budgetFile, "utf8")) as { day?: string; bytes?: number };
      if (u.day === this.day && Number.isFinite(u.bytes)) this.usedToday = this.savedUsage = Number(u.bytes);
    } catch {
      /* start the day's count again */
    }
    if (this.metered && this.usedToday > this.o.budgetMb! * 1e6) this.onFree = true;
  }

  private saveUsage() {
    if (!this.o.budgetFile || !this.metered || this.usedToday === this.savedUsage) return;
    try {
      writeFileSync(this.o.budgetFile, JSON.stringify({ day: this.day, bytes: this.usedToday }));
      this.savedUsage = this.usedToday;
    } catch {
      /* best effort */
    }
  }

  private rollDay() {
    const d = utcDay();
    if (d === this.day) return;
    this.day = d;
    this.usedToday = 0;
    if (this.onFree) {
      this.onFree = false;
      this.o.log.info("solana-rpc: new day — back to the stream through your key");
      this.ws.reconnect();
    }
    this.showBudget();
  }

  private count(bytes: number) {
    if (!this.metered || this.onFree) return;
    this.usedToday += bytes;
    if (this.usedToday > this.o.budgetMb! * 1e6) {
      this.onFree = true;
      this.o.log.warn(`solana-rpc: today's ${this.o.budgetMb} MB for your key is used — on the free public feed until 00:00 UTC`);
      this.saveUsage();
      this.o.onBudgetSpent?.(this.o.budgetMb!);
      this.ws.reconnect();
    }
    this.showBudget();
  }

  private showBudget() {
    if (!this.metered) return;
    this.ws.h.budget = { usedMb: Math.round(this.usedToday / 1e5) / 10, limitMb: this.o.budgetMb!, onFree: this.onFree };
  }

  // ---- messages -----------------------------------------------------------------------

  private onMessage(text: string) {
    this.rollDay();
    this.count(text.length);
    let msg: LogsNotification;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const pool = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (typeof msg.result === "number") {
        this.active.set(pool, msg.result);
        this.refused.delete(pool);
      } else {
        this.refused.set(pool, Date.now() + 5 * 60_000);
        this.o.log.warn("solana-rpc: could not follow a pool — trying again in 5 min", { pool, error: msg.error?.message });
      }
      return;
    }
    if (msg.error) {
      this.o.log.warn("solana-rpc: error from RPC", { code: msg.error.code, message: msg.error.message });
      this.ws.h.note = `RPC error: ${msg.error.message ?? msg.error.code}`;
      return;
    }
    if (msg.id !== undefined && msg.result !== undefined) {
      if (msg.id === 1 || msg.id === 2) this.o.log.info(`solana-rpc: subscription ${msg.id} active`);
      return;
    }
    if (msg.method !== "logsNotification") return;
    const res = msg.params?.result;
    const v = res?.value;
    if (!v || !Array.isArray(v.logs) || typeof v.signature !== "string") return;
    if (v.err) {
      this.failedTx++;
      return;
    }
    // a transaction touching several followed accounts arrives once per subscription
    if (this.seen.has(v.signature)) return;
    this.seen.set(v.signature, 1);
    if (v.logs.some((l) => l === "Log truncated")) this.truncated++;
    const evs = decodeLogs(v.logs, { ts: Date.now(), slot: res?.context?.slot, sig: v.signature, src: "rpc" });
    for (const ev of evs) {
      this.decoded++;
      const pool = ev.k === "migrate" ? ev.pool : ev.k === "pool" && ev.quoteIsSol ? ev.pool : undefined;
      if (pool) this.graduated(pool);
      this.o.onEvent(ev);
    }
  }

  get health() {
    return this.ws.h;
  }
}
