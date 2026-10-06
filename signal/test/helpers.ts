import { base58Encode } from "../src/core/codec.js";
import { CURVE, LAMPORTS_PER_SOL, curveBuyQuote, curveSellQuote, newCurve, type CurveState } from "../src/core/curve.js";
import { Engine, type EngineConfig } from "../src/core/engine.js";
import { priorModel } from "../src/core/model.js";
import type { Settings } from "../src/core/settings.js";
import type { MarketEvent } from "../src/core/types.js";

export function key(seed: number): string {
  const b = new Uint8Array(32);
  let s = seed * 2654435761 + 12345;
  for (let i = 0; i < 32; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    b[i] = (s >>> 16) & 0xff;
  }
  b[0] = 1 + (b[0]! % 200);
  return base58Encode(b);
}

export const T0 = Date.UTC(2026, 8, 20, 15, 0, 0);

/** Drives an Engine with hand-built, exactly-priced curve events. */
export class Scenario {
  engine: Engine;
  now = T0;
  curves = new Map<string, CurveState>();
  bags = new Map<string, number>();
  slot = 1000;
  events: MarketEvent[] = [];

  constructor(settings: Partial<Settings> = {}, config: Partial<EngineConfig> = {}) {
    this.engine = new Engine({
      now: this.now,
      model: { ...priorModel(T0), scaledAt: T0 },
      // confirmTicks 1: these scenarios test execution mechanics on the first signal
      settings: { enabled: true, minScore: 0, positionSol: 0.1, maxOpen: 5, maxTradesPerHour: 100, paperLatencyMs: 1000, confirmTicks: 1, ...settings },
      config: { seed: 3, ...config },
    });
  }

  emit(ev: MarketEvent) {
    this.events.push(ev);
    this.engine.ingest(ev);
  }

  advance(ms: number) {
    const end = this.now + ms;
    while (this.now < end) {
      this.now = Math.min(end, this.now + 250);
      this.engine.advance(this.now);
    }
  }

  create(mint: string, creator: string, name = "Test Coin", symbol = "TEST") {
    this.curves.set(mint, newCurve());
    this.emit({
      k: "create",
      ts: this.now,
      slot: this.slot,
      sig: key(this.slot * 7),
      src: "test",
      mint,
      name,
      symbol,
      uri: "",
      creator,
      user: creator,
      vSol: CURVE.initialVirtualSol,
      vTok: CURVE.initialVirtualTok,
      realTok: CURVE.initialRealTok,
      supply: CURVE.supply,
    });
  }

  buy(mint: string, wallet: string, sol: number, dtMs = 300) {
    this.advance(dtMs);
    this.slot += 1;
    const c = this.curves.get(mint)!;
    const q = curveBuyQuote(c, Math.floor(sol * LAMPORTS_PER_SOL));
    this.curves.set(mint, q.after);
    this.bags.set(`${mint}:${wallet}`, (this.bags.get(`${mint}:${wallet}`) ?? 0) + q.tokensOut);
    this.emit({
      k: "trade",
      ts: this.now,
      slot: this.slot,
      sig: key(this.slot * 13),
      src: "test",
      mint,
      buy: true,
      sol: q.solToCurve,
      tok: q.tokensOut,
      user: wallet,
      venue: "curve",
      vSol: q.after.vSol,
      vTok: q.after.vTok,
      realTok: q.after.realTok,
      supply: q.after.supply,
    });
    return q;
  }

  sell(mint: string, wallet: string, fraction = 1, dtMs = 300) {
    this.advance(dtMs);
    this.slot += 1;
    const k = `${mint}:${wallet}`;
    const bal = this.bags.get(k) ?? 0;
    const tokens = Math.floor(bal * fraction);
    if (tokens <= 0) return null;
    const c = this.curves.get(mint)!;
    const q = curveSellQuote(c, tokens);
    this.curves.set(mint, q.after);
    this.bags.set(k, bal - tokens);
    this.emit({
      k: "trade",
      ts: this.now,
      slot: this.slot,
      sig: key(this.slot * 17),
      src: "test",
      mint,
      buy: false,
      sol: q.solFromCurve,
      tok: tokens,
      user: wallet,
      venue: "curve",
      vSol: q.after.vSol,
      vTok: q.after.vTok,
      realTok: q.after.realTok,
      supply: q.after.supply,
    });
    return q;
  }

  /** Several distinct wallets buying — enough activity for the token to be scored. */
  crowd(mint: string, n: number, sol: number, seed: number, dtMs = 200) {
    for (let i = 0; i < n; i++) this.buy(mint, key(seed + i), sol, dtMs);
  }

  positions() {
    return [...this.engine.positions.values()];
  }

  closed() {
    return this.engine.closed.toArray();
  }
}
