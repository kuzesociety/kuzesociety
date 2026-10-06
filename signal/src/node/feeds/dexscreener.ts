/**
 * DexScreener REST (free, no key): paid profiles/boosts as a "dev is paying for
 * attention" signal, plus USD quotes/liquidity for coins we hold or rank highly.
 * Limits: 300 req/min for pairs/tokens, 60 req/min for profiles/boosts.
 */
import type { FeedHealth } from "../../core/engine.js";
import type { MarketEvent } from "../../core/types.js";
import type { Logger } from "../../core/util.js";
import { RateLimiter, getJson } from "../http.js";

interface Pair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceNative?: string;
  priceUsd?: string;
  txns?: { m5?: { buys?: number; sells?: number } };
  volume?: { m5?: number; h1?: number };
  priceChange?: { m5?: number; h1?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { socials?: { type?: string; url?: string }[]; websites?: { url?: string }[]; imageUrl?: string };
  boosts?: { active?: number };
}

interface ProfileRow {
  chainId?: string;
  tokenAddress?: string;
  amount?: number;
  totalAmount?: number;
  links?: { type?: string; label?: string; url?: string }[];
  icon?: string;
  description?: string;
}

const BASE = "https://api.dexscreener.com";
const WSOL = "So11111111111111111111111111111111111111112";

/** Normalize a DexScreener pair into a quote event (exported for tests). */
export function pairToQuote(p: Pair, ts: number): MarketEvent | null {
  const mint = p.baseToken?.address;
  if (p.chainId !== "solana" || !mint) return null;
  const priceSol = p.quoteToken?.address === WSOL ? Number(p.priceNative) : undefined;
  return {
    k: "quote",
    ts,
    src: "dexscreener",
    mint,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : undefined,
    priceSol: priceSol && Number.isFinite(priceSol) ? priceSol : undefined,
    mcapUsd: p.marketCap ?? p.fdv,
    liqUsd: p.liquidity?.usd,
    vol5mUsd: p.volume?.m5,
    vol1hUsd: p.volume?.h1,
    buys5m: p.txns?.m5?.buys,
    sells5m: p.txns?.m5?.sells,
    chg5m: p.priceChange?.m5,
    chg1h: p.priceChange?.h1,
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    pairCreatedAt: p.pairCreatedAt,
    name: p.baseToken?.name,
    symbol: p.baseToken?.symbol,
  };
}

export class DexScreenerFeed {
  private timers: NodeJS.Timeout[] = [];
  private tokenLimiter = new RateLimiter(240, 20);
  private profileLimiter = new RateLimiter(40, 4);
  readonly h: FeedHealth = { name: "dexscreener", status: "off", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: false };

  constructor(
    private o: {
      log: Logger;
      onEvent: (ev: MarketEvent) => void;
      onHealth: (h: FeedHealth) => void;
      /** mints that need USD quotes right now (held positions, top AMM coins) */
      watchlist: () => string[];
    },
  ) {}

  start() {
    this.h.status = "open";
    this.o.onHealth({ ...this.h });
    this.timers.push(setInterval(() => void this.pollProfiles(), 60_000));
    this.timers.push(setInterval(() => void this.pollQuotes(), 15_000));
    void this.pollProfiles();
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.h.status = "off";
  }

  private ok() {
    this.h.lastMsgAt = Date.now();
    this.h.msgs++;
    this.h.status = "open";
    this.o.onHealth({ ...this.h });
  }

  private fail(what: string) {
    this.h.errors++;
    this.h.note = `${what} failed`;
    this.o.onHealth({ ...this.h });
  }

  private async pollProfiles() {
    for (const [path, kind] of [
      ["/token-profiles/latest/v1", "profile"],
      ["/token-boosts/latest/v1", "boost"],
    ] as const) {
      if (!this.profileLimiter.tryTake()) continue;
      const rows = await getJson<ProfileRow[]>(BASE + path);
      if (!Array.isArray(rows)) {
        this.fail(path);
        continue;
      }
      this.ok();
      const ts = Date.now();
      for (const r of rows) {
        if (r.chainId !== "solana" || !r.tokenAddress) continue;
        const links = r.links ?? [];
        const find = (t: string) => links.find((l) => (l.type ?? l.label ?? "").toLowerCase().includes(t))?.url;
        this.o.onEvent({
          k: "meta",
          ts,
          src: "dexscreener",
          mint: r.tokenAddress,
          dexProfile: kind === "profile" ? true : undefined,
          boosts: kind === "boost" ? (r.totalAmount ?? r.amount ?? 1) : undefined,
          twitter: find("twitter") ?? find("x"),
          telegram: find("telegram"),
          website: links.find((l) => (l.label ?? "").toLowerCase() === "website")?.url,
          description: r.description,
          image: r.icon,
        });
      }
    }
  }

  private async pollQuotes() {
    const list = [...new Set(this.o.watchlist())].slice(0, 300);
    for (let i = 0; i < list.length; i += 30) {
      if (!this.tokenLimiter.tryTake()) break;
      const chunk = list.slice(i, i + 30);
      const pairs = await getJson<Pair[]>(`${BASE}/tokens/v1/solana/${chunk.join(",")}`);
      if (!Array.isArray(pairs)) {
        this.fail("tokens");
        continue;
      }
      this.ok();
      const ts = Date.now();
      // keep the most liquid pair per token
      const best = new Map<string, Pair>();
      for (const p of pairs) {
        const m = p.baseToken?.address;
        if (!m) continue;
        const cur = best.get(m);
        if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(m, p);
      }
      for (const p of best.values()) {
        const q = pairToQuote(p, ts);
        if (q) this.o.onEvent(q);
      }
    }
  }
}
