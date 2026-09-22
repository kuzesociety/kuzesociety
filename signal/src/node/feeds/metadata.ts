/**
 * Token metadata (IPFS JSON behind each launch's `uri`): socials, description, image.
 * Bounded queue, limited concurrency, gateway fallbacks; stale requests are dropped so
 * a slow gateway can never build a backlog.
 */
import type { MarketEvent } from "../../core/types.js";
import type { Logger } from "../../core/util.js";
import { LRU } from "../../core/util.js";
import { getJson } from "../http.js";

interface Job {
  mint: string;
  uri: string;
  at: number;
}

const GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/"];

export function candidateUrls(uri: string): string[] {
  const out: string[] = [];
  if (/^https?:\/\//.test(uri)) out.push(uri);
  const cid = /\/ipfs\/([A-Za-z0-9]+)/.exec(uri)?.[1] ?? (/^ipfs:\/\/([A-Za-z0-9]+)/.exec(uri)?.[1] ?? null);
  if (cid) for (const g of GATEWAYS) if (!out.some((u) => u.startsWith(g))) out.push(g + cid);
  return out.slice(0, 3);
}

export class MetadataFetcher {
  private queue: Job[] = [];
  private active = 0;
  private done = new LRU<string, 1>(20_000);
  fetched = 0;
  failed = 0;

  constructor(private o: { log: Logger; onEvent: (ev: MarketEvent) => void; concurrency?: number; maxQueue?: number }) {}

  request(mint: string, uri: string) {
    if (!uri || this.done.has(mint)) return;
    this.done.set(mint, 1);
    this.queue.push({ mint, uri, at: Date.now() });
    const max = this.o.maxQueue ?? 400;
    if (this.queue.length > max) this.queue.splice(0, this.queue.length - max);
    this.pump();
  }

  private pump() {
    const limit = this.o.concurrency ?? 6;
    while (this.active < limit && this.queue.length) {
      const job = this.queue.shift()!;
      if (Date.now() - job.at > 120_000) continue;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async run(job: Job) {
    for (const url of candidateUrls(job.uri)) {
      const j = await getJson<Record<string, unknown>>(url, { timeoutMs: 4_000 });
      if (!j || typeof j !== "object") continue;
      const str = (x: unknown) => (typeof x === "string" && x.length < 500 ? x : undefined);
      this.fetched++;
      this.o.onEvent({
        k: "meta",
        ts: Date.now(),
        src: "pumpportal",
        mint: job.mint,
        twitter: str(j.twitter),
        telegram: str(j.telegram),
        website: str(j.website),
        description: str(j.description),
        image: str(j.image),
      });
      return;
    }
    this.failed++;
  }
}
