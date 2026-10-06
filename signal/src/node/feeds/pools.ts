/**
 * Resolves unknown PumpSwap pools to their token mint via RPC `getMultipleAccounts`
 * (Pool layout: 8-byte discriminator, bump u8, index u16, creator, base_mint, quote_mint…).
 */
import { base58Encode, base64Decode } from "../../core/codec.js";
import { WSOL_MINT } from "../../core/types.js";
import type { Logger } from "../../core/util.js";
import { postJson } from "../http.js";

export function parsePoolAccount(data: Uint8Array): { baseMint: string; quoteMint: string } | null {
  if (data.length < 8 + 1 + 2 + 32 * 3) return null;
  const base = data.subarray(43, 75);
  const quote = data.subarray(75, 107);
  return { baseMint: base58Encode(base), quoteMint: base58Encode(quote) };
}

export class PoolResolver {
  private pending = new Set<string>();
  private failed = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  resolved = 0;

  constructor(private o: { rpcHttp: string; log: Logger; onResolved: (pool: string, mint: string) => void }) {}

  request(pool: string) {
    if ((this.failed.get(pool) ?? 0) > Date.now()) return;
    this.pending.add(pool);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 1_500);
  }

  private async flush() {
    this.timer = null;
    const batch = [...this.pending].slice(0, 100);
    for (const p of batch) this.pending.delete(p);
    if (batch.length === 0) return;
    const res = await postJson<{ result?: { value?: ({ data?: [string, string] } | null)[] } }>(this.o.rpcHttp, {
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [batch, { encoding: "base64" }],
    });
    const vals = res.json?.result?.value;
    if (!Array.isArray(vals)) {
      for (const p of batch) this.failed.set(p, Date.now() + 60_000);
      return;
    }
    vals.forEach((acc, i) => {
      const pool = batch[i]!;
      if (!acc?.data?.[0]) {
        this.failed.set(pool, Date.now() + 10 * 60_000);
        return;
      }
      const parsed = parsePoolAccount(base64Decode(acc.data[0]));
      if (!parsed || parsed.quoteMint !== WSOL_MINT) {
        this.failed.set(pool, Date.now() + 24 * 3_600_000);
        return;
      }
      this.resolved++;
      this.o.onResolved(pool, parsed.baseMint);
    });
    if (this.pending.size && !this.timer) this.timer = setTimeout(() => void this.flush(), 1_500);
  }
}
