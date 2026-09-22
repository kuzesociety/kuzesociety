/**
 * Narrative heat: meme coins cluster around the same idea (a viral clip, a tweet, a
 * character). Many launches with the same ticker/name — or linking the same tweet —
 * within minutes means attention is racing; the market then coordinates on ONE
 * token (usually the first or the biggest). This index measures cluster size and
 * which token currently leads each cluster.
 */

const STOP = new Set([
  "the", "coin", "token", "official", "sol", "solana", "meme", "pump", "fun", "of", "and", "on", "in", "a", "an",
  "is", "to", "for", "my", "inu", "ai", "cto", "real", "new", "just", "by", "with", "com", "www",
]);

export function normalizeWord(s: string): string {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Cluster keys for a launch: ticker, meaningful name words, linked tweet/handle. */
export function narrativeKeys(name: string, symbol: string, twitter?: string): string[] {
  const keys = new Set<string>();
  const sym = normalizeWord(symbol);
  if (sym.length >= 2 && sym.length <= 14) keys.add(`t:${sym}`);
  const words = name.split(/[\s_\-.,!?/|]+/).map(normalizeWord).filter((w) => w.length >= 3 && !STOP.has(w));
  for (const w of words.slice(0, 4)) keys.add(`w:${w}`);
  const full = normalizeWord(name);
  if (full.length >= 4 && full.length <= 24 && words.length > 1) keys.add(`w:${full}`);
  if (twitter) {
    const status = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(twitter);
    if (status) keys.add(`tw:${status[2]}`);
    else {
      const handle = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?(?:$|\?)/i.exec(twitter);
      if (handle && !["home", "i", "search", "intent"].includes(handle[1]!.toLowerCase())) keys.add(`x:${handle[1]!.toLowerCase()}`);
    }
  }
  return [...keys];
}

interface Launch {
  ts: number;
  mint: string;
  keys: string[];
}

export interface ClusterInfo {
  key: string;
  size: number;
  leader: string | null;
  leaderMcap: number;
  firstMint: string | null;
  firstTs: number;
  mints: string[];
}

export interface TokenNarrative {
  clusterKey: string | null;
  clusterSize: number;
  isLeader: boolean;
  isFirst: boolean;
  tweetLinked: boolean;
}

export class NarrativeIndex {
  private launches: Launch[] = [];
  private byKey = new Map<string, Set<string>>();
  private firstByKey = new Map<string, { mint: string; ts: number }>();
  private keysByMint = new Map<string, string[]>();

  constructor(private windowMs = 60 * 60_000) {}

  add(mint: string, ts: number, name: string, symbol: string, twitter?: string) {
    const prev = this.keysByMint.get(mint);
    const keys = narrativeKeys(name, symbol, twitter);
    if (prev) {
      // metadata arrived later: add new keys only
      const extra = keys.filter((k) => !prev.includes(k));
      if (extra.length === 0) return;
      prev.push(...extra);
      for (const k of extra) this.link(k, mint, ts);
      return;
    }
    this.keysByMint.set(mint, keys);
    this.launches.push({ ts, mint, keys });
    for (const k of keys) this.link(k, mint, ts);
  }

  private link(k: string, mint: string, ts: number) {
    let set = this.byKey.get(k);
    if (!set) {
      set = new Set();
      this.byKey.set(k, set);
    }
    set.add(mint);
    const first = this.firstByKey.get(k);
    if (!first || ts < first.ts) this.firstByKey.set(k, { mint, ts });
  }

  prune(now: number) {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.launches.length && this.launches[i]!.ts < cutoff) {
      const l = this.launches[i]!;
      for (const k of this.keysByMint.get(l.mint) ?? l.keys) {
        const set = this.byKey.get(k);
        if (set) {
          set.delete(l.mint);
          if (set.size === 0) {
            this.byKey.delete(k);
            this.firstByKey.delete(k);
          } else if (this.firstByKey.get(k)?.mint === l.mint) {
            this.firstByKey.set(k, { mint: [...set][0]!, ts: cutoff });
          }
        }
      }
      this.keysByMint.delete(l.mint);
      i++;
    }
    if (i > 0) this.launches.splice(0, i);
  }

  /** Narrative facts for one token; `mcapOf` resolves current market caps. */
  describe(mint: string, mcapOf: (m: string) => number): TokenNarrative {
    const keys = this.keysByMint.get(mint);
    if (!keys || keys.length === 0) return { clusterKey: null, clusterSize: 1, isLeader: true, isFirst: true, tweetLinked: false };
    let bestKey: string | null = null;
    let bestSize = 1;
    for (const k of keys) {
      const n = this.byKey.get(k)?.size ?? 1;
      if (n > bestSize || (n === bestSize && bestKey === null)) {
        bestSize = n;
        bestKey = k;
      }
    }
    let isLeader = true;
    let isFirst = true;
    if (bestKey && bestSize > 1) {
      const myMcap = mcapOf(mint);
      for (const other of this.byKey.get(bestKey) ?? []) {
        if (other !== mint && mcapOf(other) > myMcap) {
          isLeader = false;
          break;
        }
      }
      isFirst = this.firstByKey.get(bestKey)?.mint === mint;
    }
    return { clusterKey: bestSize > 1 ? bestKey : null, clusterSize: bestSize, isLeader, isFirst, tweetLinked: keys.some((k) => k.startsWith("tw:")) };
  }

  /** Hottest clusters right now (≥ 2 launches), with their current leader. */
  hot(limit: number, mcapOf: (m: string) => number): ClusterInfo[] {
    const rows: ClusterInfo[] = [];
    for (const [key, set] of this.byKey) {
      if (set.size < 2) continue;
      let leader: string | null = null;
      let leaderMcap = 0;
      for (const m of set) {
        const mc = mcapOf(m);
        if (mc > leaderMcap) {
          leaderMcap = mc;
          leader = m;
        }
      }
      const first = this.firstByKey.get(key);
      rows.push({ key, size: set.size, leader, leaderMcap, firstMint: first?.mint ?? null, firstTs: first?.ts ?? 0, mints: [...set].slice(0, 20) });
    }
    rows.sort((a, b) => b.size - a.size || b.leaderMcap - a.leaderMcap);
    return rows.slice(0, limit);
  }

  get size() {
    return this.launches.length;
  }
}
