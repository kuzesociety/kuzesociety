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

describe("bounded sample loading", () => {
  it("keeps the newest samples up to the caps, oldest first, and survives multi-byte text", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DataStore } = await import("../src/node/store.js");
    const dir = mkdtempSync(join(tmpdir(), "signal-samples-"));
    mkdirSync(join(dir, "samples"), { recursive: true });
    const now = Date.UTC(2026, 8, 20, 12);
    const mk = (i: number, kind: string, tag: string, ts: number) =>
      JSON.stringify({ id: `s${i}`, kind, tag, mint: `m${i}`, symbol: "🐸ÉMOJI", ts, stage: "curve", score: 50, p: 0.1, x: [1, 2], y: i % 2, ret: 0.1, grid: [] });
    for (let d = 2; d >= 0; d--) {
      const date = new Date(now - d * 86_400_000).toISOString().slice(0, 10);
      const lines: string[] = [];
      for (let i = 0; i < 3000; i++) {
        const ts = now - d * 86_400_000 + i * 1000;
        // per file: 1000 entries, 200 structural checkpoints (halfway up the curve), 1800 age snapshots
        const [kind, tag] = i % 3 === 0 ? ["entry", "x75"] : i % 10 === 5 ? ["checkpoint", "prog50"] : ["checkpoint", "age180"];
        lines.push(mk(d * 10_000 + i, kind!, tag!, ts));
      }
      lines.push('{"id":"broken", "kind":"check'); // a torn last line must be skipped
      writeFileSync(join(dir, "samples", `${date}.jsonl`), lines.join("\n"));
    }
    const store = new DataStore(dir, { debug() {}, info() {}, warn() {}, error() {} });
    const out = store.loadSamples(7, now, { checkpoints: 2500, structural: 300, entries: 1200 });
    const cps = out.filter((s) => s.kind === "checkpoint" && s.tag === "age180");
    const st = out.filter((s) => s.tag === "prog50");
    const ens = out.filter((s) => s.kind === "entry");
    expect(cps).toHaveLength(2500);
    expect(st).toHaveLength(300);
    expect(ens).toHaveLength(1200);
    // today's file alone has 1800 age snapshots: the other 700 are the newest of yesterday
    expect(cps.filter((s) => s.ts >= now).length).toBe(1800);
    expect(Math.min(...cps.map((s) => s.ts))).toBeGreaterThan(now - 86_400_000);
    // the rare structural samples have their own room: not crowded out by the snapshots
    expect(st.filter((s) => s.ts >= now).length).toBe(200);
    for (let i = 1; i < out.length; i++) expect(out[i]!.ts).toBeGreaterThanOrEqual(out[i - 1]!.ts);
    expect(out.every((s) => s.symbol === "🐸ÉMOJI")).toBe(true);
    store.close();
  });
});
