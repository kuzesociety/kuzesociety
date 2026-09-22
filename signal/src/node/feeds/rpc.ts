/**
 * Solana RPC firehose: `logsSubscribe` on the pump and PumpSwap programs, decoded
 * locally. Free with any Solana RPC websocket (Helius/QuickNode/… free tiers, or the
 * public endpoint with lower limits). Every create, trade, graduation and PumpSwap swap
 * arrives within ~a slot of landing on-chain.
 */
import { decodeLogs, type DecodedEvent } from "../../core/decode.js";
import type { FeedHealth } from "../../core/engine.js";
import { PUMP_AMM_PROGRAM, PUMP_PROGRAM } from "../../core/types.js";
import { LRU, type Logger } from "../../core/util.js";
import { ReconnectingWS } from "../ws.js";

export interface RpcFeedOptions {
  url: string;
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

export class RpcLogsFeed {
  private ws: ReconnectingWS;
  private seen = new LRU<string, 1>(50_000);
  truncated = 0;
  failedTx = 0;
  decoded = 0;

  constructor(private o: RpcFeedOptions) {
    this.ws = new ReconnectingWS({
      name: "solana-rpc",
      url: () => o.url,
      critical: true,
      staleMs: 45_000,
      pingMs: 15_000,
      log: o.log,
      onHealth: o.onHealth,
      onOpen: (send) => {
        const commitment = o.commitment ?? "processed";
        send({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [PUMP_PROGRAM] }, { commitment }] });
        send({ jsonrpc: "2.0", id: 2, method: "logsSubscribe", params: [{ mentions: [PUMP_AMM_PROGRAM] }, { commitment }] });
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

  private onMessage(text: string) {
    let msg: LogsNotification;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.error) {
      this.o.log.warn("solana-rpc: error from RPC", { code: msg.error.code, message: msg.error.message });
      this.ws.h.note = `RPC error: ${msg.error.message ?? msg.error.code}`;
      return;
    }
    if (msg.id !== undefined && msg.result !== undefined) {
      this.o.log.info(`solana-rpc: subscription ${msg.id} active`);
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
    // a transaction touching both programs arrives on both subscriptions
    if (this.seen.has(v.signature)) return;
    this.seen.set(v.signature, 1);
    if (v.logs.some((l) => l === "Log truncated")) this.truncated++;
    const evs = decodeLogs(v.logs, { ts: Date.now(), slot: res?.context?.slot, sig: v.signature, src: "rpc" });
    for (const ev of evs) {
      this.decoded++;
      this.o.onEvent(ev);
    }
  }

  get health() {
    return this.ws.h;
  }
}
