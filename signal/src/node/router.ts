/**
 * Event router: dedupes the same on-chain event arriving from several feeds and applies
 * source priority (the RPC firehose is authoritative for trades when it is healthy).
 */
import type { DecodedEvent } from "../core/decode.js";
import type { MarketEvent } from "../core/types.js";
import { LRU } from "../core/util.js";

type Ev = MarketEvent | DecodedEvent;

export function dedupeKey(ev: Ev): string | null {
  const sig = (ev as { sig?: string }).sig;
  if (!sig) return null;
  switch (ev.k) {
    case "create":
    case "complete":
    case "migrate":
      return `${ev.k}:${sig}:${ev.mint}`;
    case "trade":
      return `t:${sig}:${ev.mint}:${ev.user}:${ev.buy ? 1 : 0}:${Math.round(ev.tok / 1000)}`;
    case "ammSwap":
      return `a:${sig}:${ev.pool}:${ev.user}:${ev.buy ? 1 : 0}:${Math.round(ev.base / 1000)}`;
    case "pool":
      return `p:${sig}:${ev.pool}`;
    default:
      return null;
  }
}

export class EventRouter {
  private seen = new LRU<string, 1>(200_000);
  duplicates = 0;
  dropped = 0;

  constructor(
    private deliver: (ev: Ev) => void,
    private rpcHealthy: () => boolean,
  ) {}

  push(ev: Ev) {
    // with a live firehose, secondary trade streams only add duplicates in other shapes
    if (ev.src === "pumpportal" && ev.k === "trade" && this.rpcHealthy()) {
      this.dropped++;
      return;
    }
    const k = dedupeKey(ev);
    if (k) {
      if (this.seen.has(k)) {
        this.duplicates++;
        return;
      }
      this.seen.set(k, 1);
    }
    this.deliver(ev);
  }
}
