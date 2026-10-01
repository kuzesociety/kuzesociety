/** SOL/USD with fallbacks (Jupiter → Coinbase → Kraken). Only used for display/USD. */
import type { Logger } from "../../core/util.js";
import { getJson } from "../http.js";

const WSOL = "So11111111111111111111111111111111111111112";

export async function fetchSolUsd(): Promise<number | null> {
  const jup = await getJson<Record<string, { usdPrice?: number }>>(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`, { timeoutMs: 5_000 });
  const a = jup?.[WSOL]?.usdPrice;
  if (a && a > 1) return a;
  const cb = await getJson<{ data?: { amount?: string } }>("https://api.coinbase.com/v2/prices/SOL-USD/spot", { timeoutMs: 5_000 });
  const b = Number(cb?.data?.amount);
  if (b > 1) return b;
  const kr = await getJson<{ result?: Record<string, { c?: string[] }> }>("https://api.kraken.com/0/public/Ticker?pair=SOLUSD", { timeoutMs: 5_000 });
  const c = Number(Object.values(kr?.result ?? {})[0]?.c?.[0]);
  if (c > 1) return c;
  return null;
}

export class SolPrice {
  value = 0;
  updatedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(private log: Logger, private onPrice: (usd: number) => void) {}
  start() {
    const tick = async () => {
      const v = await fetchSolUsd();
      if (v) {
        this.value = v;
        this.updatedAt = Date.now();
        this.onPrice(v);
      } else if (Date.now() - this.updatedAt > 10 * 60_000) this.log.warn("SOL/USD price unavailable (showing SOL values only)");
    };
    void tick();
    this.timer = setInterval(() => void tick(), 30_000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
