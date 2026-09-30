import { describe, expect, it } from "vitest";
import { Scenario, T0, key } from "./helpers.js";

const MIN = 60_000;

/** Graduates `n` coins, the oldest first, and returns their mints and pools. */
function graduate(s: Scenario, n: number, seed: number, gapMs: number) {
  const made: { mint: string; pool: string }[] = [];
  for (let i = 0; i < n; i++) {
    const mint = key(seed + i * 2);
    const pool = key(seed + i * 2 + 1);
    s.create(mint, key(seed + 900 + i));
    s.crowd(mint, 6, 0.2, seed + 3000 + i * 10, 200);
    const c = s.curves.get(mint)!;
    s.emit({ k: "migrate", ts: s.now, src: "pumpportal", sig: key(seed + 500 + i), mint });
    s.emit({ k: "pool", ts: s.now, src: "rpc", sig: key(seed + 500 + i), pool, mint, quoteIsSol: true, base: c.vTok, quote: c.vSol });
    made.push({ mint, pool });
    s.advance(gapMs);
  }
  return made;
}

describe("watching the older graduated coins too", () => {
  it("keeps a steady slice of them, not only the newest", () => {
    const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 6 * 3_600_000 });
    const made = graduate(s, 60, 41, 30_000);
    const followed = new Set(s.engine.poolsToFollow(40));
    expect(followed.size).toBe(40);
    // the newest are still followed
    const newest = made.slice(-10).map((m) => m.pool);
    expect(newest.filter((p) => followed.has(p)).length).toBeGreaterThanOrEqual(8);
    // and so are some of the oldest, which recency alone would never reach
    const oldest = made.slice(0, 20).map((m) => m.pool);
    expect(oldest.filter((p) => followed.has(p)).length).toBeGreaterThan(0);
  });

  it("chooses them by their address alone, so the choice cannot follow a price", () => {
    const run = (pump: boolean) => {
      const s = new Scenario({ enabled: false }, { outcomeHorizonMs: 6 * 3_600_000 });
      const made = graduate(s, 60, 41, 30_000);
      if (pump) {
        // the older half all double in price: a size-based choice would now prefer them
        for (const m of made.slice(0, 30)) s.buy(m.mint, key(7777), 30, 50);
      }
      return [...s.engine.poolsToFollow(40)].sort().join(",");
    };
    expect(run(true)).toBe(run(false));
  });

  it("still puts held coins and the ones the rule is about to buy first", () => {
    const s = new Scenario({ enabled: true, entryAt: "mig60", minScore: 0, scoreOnly: true, maxOpen: 5 }, { outcomeHorizonMs: 6 * 3_600_000 });
    const made = graduate(s, 50, 61, 20_000);
    s.advance(2 * MIN);
    const held = s.positions().filter((p) => p.status !== "closed" && p.status !== "failed");
    const followed = new Set(s.engine.poolsToFollow(40));
    for (const p of held) {
      const pool = made.find((m) => m.mint === p.mint)?.pool;
      if (pool) expect(followed.has(pool), `a held coin's pool must stay followed`).toBe(true);
    }
    expect(followed.size).toBeLessThanOrEqual(40);
  });
});
