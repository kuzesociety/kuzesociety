import { describe, expect, it } from "vitest";
import { LRU } from "../src/core/util.js";
import { WalletBook } from "../src/core/wallets.js";

describe("memory relief", () => {
  it("LRU.shrinkTo drops unprotected, least recent entries first", () => {
    const l = new LRU<string, number>(100);
    for (let i = 0; i < 10; i++) l.set(`k${i}`, i);
    const dropped = l.shrinkTo(4, (_k, v) => v % 2 === 0);
    expect(dropped).toBe(6);
    // all 5 unprotected go first, then the oldest protected one (k0) to reach the target
    expect([...l.entries()].map(([k]) => k)).toEqual(["k2", "k4", "k6", "k8"]);
    for (const [, v] of l.entries()) expect(v % 2).toBe(0);
  });

  it("WalletBook.trim keeps wallets with a track record", () => {
    const now = 1_700_000_000_000;
    const b = new WalletBook(now, { maxWallets: 10_000 });
    for (let i = 0; i < 1000; i++) b.touch(`w${i}`, now + i, true);
    // five wallets with real history, spread through the LRU order
    for (const i of [3, 250, 500, 750, 999]) for (let k = 0; k < 10; k++) b.closePosition(`w${i}`, 1, 2.5, 0);
    expect(b.smartCount()).toBe(5);
    const dropped = b.trim(0.1);
    expect(dropped).toBe(900);
    expect(b.size).toBe(100);
    for (const i of [3, 250, 500, 750, 999]) expect(b.peek(`w${i}`)).toBeDefined();
    expect(b.smartCount()).toBe(5);
  });
});
