/**
 * PumpPortal data websocket. Free: new-token and migration events. With an API key
 * (linked wallet funded with ≥0.02 SOL, ~0.01 SOL per 10k messages) it also streams
 * trades for the coins we watch (held positions) — useful when no RPC firehose runs.
 */
import { CURVE, LAMPORTS_PER_SOL, RAW_PER_TOKEN } from "../../core/curve.js";
import type { FeedHealth } from "../../core/engine.js";
import type { CreateEvent, MarketEvent, TradeEvent } from "../../core/types.js";
import { isAddress } from "../../core/codec.js";
import type { Logger } from "../../core/util.js";
import { ReconnectingWS } from "../ws.js";

export interface PumpPortalOptions {
  apiKey?: string;
  critical: boolean;
  log: Logger;
  onEvent: (ev: MarketEvent) => void;
  onHealth: (h: FeedHealth) => void;
}

type Msg = Record<string, unknown>;

const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN);

/** Convert one PumpPortal message into normalized events (exported for tests). */
export function parsePumpPortal(m: Msg, ts: number): MarketEvent[] {
  const tx = m.txType;
  const mint = m.mint;
  if (typeof mint !== "string" || !isAddress(mint)) return [];
  const pool = typeof m.pool === "string" ? m.pool : "pump";
  if (tx === "create") {
    if (pool !== "pump") return [];
    const creator = typeof m.traderPublicKey === "string" ? m.traderPublicKey : "";
    const create: CreateEvent = {
      k: "create",
      ts,
      sig: typeof m.signature === "string" ? m.signature : undefined,
      src: "pumpportal",
      mint,
      name: String(m.name ?? "").slice(0, 64),
      symbol: String(m.symbol ?? "").slice(0, 24),
      uri: String(m.uri ?? ""),
      creator,
      user: creator,
      vSol: CURVE.initialVirtualSol,
      vTok: CURVE.initialVirtualTok,
      realTok: CURVE.initialRealTok,
      supply: CURVE.supply,
    };
    const out: MarketEvent[] = [create];
    const vSol = num(m.vSolInBondingCurve) * LAMPORTS_PER_SOL;
    const vTok = num(m.vTokensInBondingCurve) * RAW_PER_TOKEN;
    const tok = num(m.initialBuy) * RAW_PER_TOKEN;
    const sol = num(m.solAmount) * LAMPORTS_PER_SOL;
    if (tok > 0 && vSol > 0 && vTok > 0) {
      out.push({ k: "trade", ts, sig: create.sig, src: "pumpportal", mint, buy: true, sol: Math.round(sol / 1.0125), tok, user: creator, venue: "curve", vSol, vTok });
    }
    return out;
  }
  if (tx === "buy" || tx === "sell") {
    const vSol = num(m.vSolInBondingCurve) * LAMPORTS_PER_SOL;
    const vTok = num(m.vTokensInBondingCurve) * RAW_PER_TOKEN;
    const tok = num(m.tokenAmount) * RAW_PER_TOKEN;
    const sol = num(m.solAmount) * LAMPORTS_PER_SOL;
    if (!(vSol > 0) || !(vTok > 0) || !(tok >= 0) || !(sol >= 0)) return [];
    const trade: TradeEvent = {
      k: "trade",
      ts,
      sig: typeof m.signature === "string" ? m.signature : undefined,
      src: "pumpportal",
      mint,
      buy: tx === "buy",
      sol,
      tok,
      user: typeof m.traderPublicKey === "string" ? m.traderPublicKey : "unknown",
      venue: pool === "pump" ? "curve" : "amm",
      vSol,
      vTok,
    };
    return [trade];
  }
  if (tx === "migrate") return [{ k: "migrate", ts, src: "pumpportal", mint, sig: typeof m.signature === "string" ? m.signature : undefined }];
  return [];
}

export class PumpPortalFeed {
  private ws: ReconnectingWS;
  private watched = new Set<string>();

  constructor(private o: PumpPortalOptions) {
    const base = "wss://pumpportal.fun/api/data";
    this.ws = new ReconnectingWS({
      name: "pumpportal",
      url: () => (o.apiKey ? `${base}?api-key=${encodeURIComponent(o.apiKey)}` : base),
      critical: o.critical,
      staleMs: 120_000,
      pingMs: 20_000,
      log: o.log,
      onHealth: o.onHealth,
      onOpen: (send) => {
        send({ method: "subscribeNewToken" });
        send({ method: "subscribeMigration" });
        if (o.apiKey && this.watched.size) send({ method: "subscribeTokenTrade", keys: [...this.watched].slice(0, 5000) });
      },
      onMessage: (text) => this.onMessage(text),
    });
  }

  start() {
    this.ws.start();
  }
  stop() {
    this.ws.stop();
  }

  /** Stream trades for a coin (API key only; free tier ignores this). */
  watch(mint: string, on: boolean) {
    if (!this.o.apiKey) return;
    if (on) {
      if (this.watched.has(mint)) return;
      this.watched.add(mint);
      this.ws.send({ method: "subscribeTokenTrade", keys: [mint] });
    } else if (this.watched.delete(mint)) {
      this.ws.send({ method: "unsubscribeTokenTrade", keys: [mint] });
    }
  }

  private onMessage(text: string) {
    let m: Msg;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof m.message === "string") {
      this.o.log.info(`pumpportal: ${m.message.slice(0, 160)}`);
      return;
    }
    if (typeof m.errors === "string" || typeof m.error === "string") {
      this.o.log.warn("pumpportal: error", { error: m.errors ?? m.error });
      return;
    }
    for (const ev of parsePumpPortal(m, Date.now())) this.o.onEvent(ev);
  }

  get health() {
    return this.ws.h;
  }
}
