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

describe("storage never fills the disk", () => {
  const silent = { debug() {}, info() {}, warn() {}, error() {} };

  it("deletes the oldest raw recordings first, then old outcomes, never the state, models or the Lab", async () => {
    const { mkdtempSync, writeFileSync, existsSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DataStore } = await import("../src/node/store.js");
    const dir = mkdtempSync(join(tmpdir(), "signal-budget-"));
    const store = new DataStore(dir, silent);
    const now = Date.UTC(2026, 8, 28, 12);
    const day = (d: number) => new Date(now - d * 86_400_000).toISOString().slice(0, 10);
    const mb = (n: number) => Buffer.alloc(n * 1_000_000, 97);
    for (let d = 4; d >= 0; d--) writeFileSync(join(dir, "record", `${day(d)}T10.jsonl.gz`), mb(1));
    for (let d = 9; d >= 0; d--) writeFileSync(join(dir, "samples", `${day(d)}.jsonl`), mb(1));
    for (let d = 20; d >= 0; d -= 5) writeFileSync(join(dir, "journal", `${day(d)}.jsonl`), mb(1));
    for (const f of ["state.json", "lab.json", "autopilot.json"]) writeFileSync(join(dir, f), mb(1));
    writeFileSync(join(dir, "models", "current.json"), mb(1));
    // 5 + 10 + 5 + 4 MB of data; a 14 MB budget must free 10 MB: all 5 recordings, then the 5 oldest outcome days
    const r = store.enforceBudget({ maxMb: 14, minFreeMb: 0, keepSampleDays: 3 }, now);
    expect(readdirSync(join(dir, "record"))).toHaveLength(0);
    expect(readdirSync(join(dir, "samples")).sort()).toEqual([day(4), day(3), day(2), day(1), day(0)].map((d) => `${d}.jsonl`));
    expect(r.samplesPruned).toBe(true);
    expect(r.freedMb).toBeGreaterThanOrEqual(10);
    for (const f of ["state.json", "lab.json", "autopilot.json", join("models", "current.json")]) expect(existsSync(join(dir, f))).toBe(true);
    // however tight the budget, the newest 3 days of outcomes and a week of journal stay
    store.enforceBudget({ maxMb: 1, minFreeMb: 0, keepSampleDays: 3 }, now);
    expect(readdirSync(join(dir, "samples")).sort()).toEqual([day(2), day(1), day(0)].map((d) => `${d}.jsonl`));
    expect(readdirSync(join(dir, "journal")).sort()).toEqual([day(5), day(0)].map((d) => `${d}.jsonl`));
    const rep = store.storageReport();
    expect(rep.byDir.samples).toBe(3);
    expect(rep.freeMb === null || rep.freeMb > 0).toBe(true);
  });

  it("pauses raw recording while the disk is too full, and resumes when there is room", async () => {
    const { mkdtempSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DataStore } = await import("../src/node/store.js");
    const dir = mkdtempSync(join(tmpdir(), "signal-full-"));
    const store = new DataStore(dir, silent);
    const r = store.enforceBudget({ maxMb: 1e9, minFreeMb: 1e12, keepSampleDays: 3 });
    expect(r.paused).toBe(true);
    store.record({ k: "trade" }, Date.now());
    expect(readdirSync(join(dir, "record"))).toHaveLength(0);
    const back = store.enforceBudget({ maxMb: 1e9, minFreeMb: 0, keepSampleDays: 3 });
    expect(back.resumed).toBe(true);
    store.record({ k: "trade" }, Date.now());
    store.closeRecorder();
    await new Promise((r) => setTimeout(r, 50));
    expect(readdirSync(join(dir, "record"))).toHaveLength(1);
  });

  it("a crash cannot make later recordings unreadable: every start writes a file of its own", async () => {
    const { mkdtempSync, readdirSync, readFileSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { gzipSync } = await import("node:zlib");
    const { DataStore, readRecording } = await import("../src/node/store.js");
    const dir = mkdtempSync(join(tmpdir(), "signal-crash-"));
    const ts = Date.UTC(2026, 8, 28, 17, 5);
    const store = new DataStore(dir, silent);
    // this hour's file from before a crash, cut short (its gzip stream never finished)
    const whole = gzipSync(Buffer.from(Array.from({ length: 200 }, (_, i) => JSON.stringify({ k: "trade", i })).join("\n") + "\n"));
    writeFileSync(join(dir, "record", "2026-09-28T17.jsonl.gz"), whole.subarray(0, Math.floor(whole.length * 0.7)), { flag: "w" });
    for (let i = 0; i < 50; i++) store.record({ k: "trade", after: i }, ts);
    store.closeRecorder();
    await new Promise((r) => setTimeout(r, 50));
    const files = readdirSync(join(dir, "record")).sort();
    expect(files).toEqual(["2026-09-28T17.jsonl.gz", "2026-09-28T17_02.jsonl.gz"]);
    // the broken file yields what it holds; the new one is whole
    const read = async (f: string) => {
      const out: unknown[] = [];
      for await (const ev of readRecording(join(dir, "record", f))) out.push(ev);
      return out;
    };
    const first = await read(files[0]!);
    expect(first.length).toBeGreaterThan(50);
    expect(first.length).toBeLessThan(200);
    expect(await read(files[1]!)).toHaveLength(50);
    expect(readFileSync(join(dir, "record", files[1]!)).length).toBeGreaterThan(0);
  });
});

describe("how much history learning uses, and how much the data may take", () => {
  it("scales with the machine: more outcomes where memory allows, a fifth of the disk for the data", async () => {
    const { SAMPLE_LIMITS, autoDataMaxMb, sampleLimits, sampleScale } = await import("../src/node/store.js");
    // a 512 MB server keeps the base caps; a desktop's Node (2–4 GB heap) loads two or three times as many
    expect(sampleScale(0.5e9)).toBe(1);
    expect(sampleScale(1.5e9)).toBe(2);
    expect(sampleScale(2.2e9)).toBe(2);
    expect(sampleScale(4.3e9)).toBe(3);
    expect(sampleScale(16e9)).toBe(3);
    expect(sampleLimits(3)).toEqual({ checkpoints: SAMPLE_LIMITS.checkpoints * 3, structural: SAMPLE_LIMITS.structural * 3, entries: SAMPLE_LIMITS.entries * 3 });
    // a fifth of what the bot can use (its data + the free space), between 10 and 100 GB
    expect(autoDataMaxMb(7_700, 338_600)).toBe(69_260);
    expect(autoDataMaxMb(500, 20_000)).toBe(10_000);
    expect(autoDataMaxMb(1_000, 2_000_000)).toBe(100_000);
    expect(autoDataMaxMb(1_000, null)).toBe(10_000);
  });
});
