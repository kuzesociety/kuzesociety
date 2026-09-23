import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { base58Decode } from "../src/core/codec.js";
import { encodeAmmSwap, encodeCreate, encodeMigration, encodeTrade, programDataLine } from "../src/core/encode.js";
import type { DecodedEvent } from "../src/core/decode.js";
import { Engine, type FeedHealth } from "../src/core/engine.js";
import { PUMP_AMM_PROGRAM, PUMP_PROGRAM } from "../src/core/types.js";
import { silentLogger } from "../src/core/util.js";
import { parsePumpPortal } from "../src/node/feeds/pumpportal.js";
import { pairToQuote } from "../src/node/feeds/dexscreener.js";
import { candidateUrls } from "../src/node/feeds/metadata.js";
import { parsePoolAccount } from "../src/node/feeds/pools.js";
import { RpcLogsFeed } from "../src/node/feeds/rpc.js";
import { redactKeys } from "../src/node/ws.js";
import { EventRouter } from "../src/node/router.js";
import { key } from "./helpers.js";

const MINT = key(501);
const USER = key(502);

function waitFor(cond: () => boolean, ms = 8000) {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error("timeout"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

let wss: WebSocketServer | null = null;
afterEach(() => {
  wss?.close();
  wss = null;
});

function notification(sub: number, sig: string, logs: string[], err: unknown = null) {
  return JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 123 }, value: { signature: sig, err, logs } }, subscription: sub } });
}

describe("Solana RPC firehose feed (mock websocket server)", () => {
  it("subscribes to the pump program, decodes events, skips failed/duplicate txs", async () => {
    const subs: unknown[] = [];
    let client: WebSocket | null = null;
    wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => {
      client = ws;
      ws.on("message", (m) => {
        const req = JSON.parse(m.toString());
        subs.push(req.params[0].mentions[0]);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: req.id * 10 }));
      });
    });
    const port = (wss.address() as AddressInfo).port;
    const events: DecodedEvent[] = [];
    // wired to the engine the way the server wires it
    const engine = new Engine({ now: Date.now() });
    const feed = new RpcLogsFeed({ url: `ws://127.0.0.1:${port}`, log: silentLogger, onEvent: (e) => events.push(e), onHealth: (h) => engine.setFeedHealth(h) });
    feed.start();
    await waitFor(() => subs.length === 1);
    // pump.fun only: the whole PumpSwap stream is about nine tenths of the data
    expect(subs).toEqual([PUMP_PROGRAM]);
    const create = programDataLine(
      encodeCreate({ name: "A", symbol: "A", uri: "", mint: MINT, bondingCurve: USER, user: USER, creator: USER, chainTs: 1, vTok: 1.073e15, vSol: 30e9, realTok: 7.931e14, supply: 1e15 }),
    );
    const trade = programDataLine(encodeTrade({ mint: MINT, sol: 1e9, tok: 3e13, buy: true, user: USER, chainTs: 1, vSol: 31e9, vTok: 1.04e15, realSol: 1e9, realTok: 7.6e14, fee: 1, creatorFee: 1, creator: USER }));
    client!.send(notification(10, "sigA", ["Program log: Instruction: Create", create, trade]));
    client!.send(notification(20, "sigA", ["Program log: Instruction: Create", create, trade])); // same tx on the other subscription
    client!.send(notification(10, "sigB", [trade], { InstructionError: [0, "Custom"] })); // failed tx
    const amm = programDataLine(encodeAmmSwap({ chainTs: 1, buy: true, base: 1e12, poolBase: 2e14, poolQuote: 85e9, quoteAmount: 4e8, lpFee: 1, protocolFee: 1, creatorFee: 1, pool: key(503), user: USER, coinCreator: USER, supply: 1e15 }));
    client!.send(notification(20, "sigC", [amm]));
    await waitFor(() => events.length >= 3);
    expect(events.map((e) => e.k)).toEqual(["create", "trade", "ammSwap"]);
    expect(feed.failedTx).toBe(1);
    expect((events[0] as { slot?: number }).slot).toBe(123);
    // messages arrive without a status change: the engine must still see them, or it calls the
    // feed down while trades are flowing and refuses to trade
    engine.advance(Date.now());
    const seen = engine.health().feeds.find((f) => f.name === "solana-rpc")!;
    expect(seen.status).toBe("open");
    expect(seen.msgs).toBeGreaterThanOrEqual(5);
    expect(seen.lastMsgAt).toBeGreaterThan(0);
    expect(engine.feedDown()).toBe(false);
    engine.advance(Date.now() + 60_000); // …and down again once it really goes quiet
    expect(engine.feedDown()).toBe(true);
    feed.stop();
  });

  it("streams every PumpSwap swap only when asked to", async () => {
    const subs: unknown[] = [];
    wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => ws.on("message", (m) => subs.push(JSON.parse(m.toString()).params[0].mentions[0])));
    const port = (wss.address() as AddressInfo).port;
    const feed = new RpcLogsFeed({ url: `ws://127.0.0.1:${port}`, ammFirehose: true, log: silentLogger, onEvent: () => {}, onHealth: () => {} });
    feed.start();
    await waitFor(() => subs.length === 2);
    expect(subs).toEqual([PUMP_PROGRAM, PUMP_AMM_PROGRAM]);
    feed.stop();
  });

  it("follows graduated and held pools one by one, and lets go of them", async () => {
    const calls: { method: string; params: unknown[] }[] = [];
    let client: WebSocket | null = null;
    let nextSub = 100;
    wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => {
      client = ws;
      ws.on("message", (m) => {
        const req = JSON.parse(m.toString());
        calls.push(req);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: req.method === "logsSubscribe" ? nextSub++ : true }));
      });
    });
    const port = (wss.address() as AddressInfo).port;
    const held: string[] = [];
    const feed = new RpcLogsFeed({ url: `ws://127.0.0.1:${port}`, followPools: () => held, poolCheckMs: 50, log: silentLogger, onEvent: () => {}, onHealth: () => {} });
    feed.start();
    const mentions = () => calls.filter((c) => c.method === "logsSubscribe").map((c) => (c.params[0] as { mentions: string[] }).mentions[0]);
    await waitFor(() => mentions().length === 1);
    // a coin graduates: its pool is followed
    const POOL = key(503);
    const migration = programDataLine(encodeMigration({ user: USER, mint: MINT, mintAmount: 2e14, solAmount: 85e9, bondingCurve: USER, chainTs: 1, pool: POOL }));
    client!.send(notification(100, "sigM", [migration]));
    await waitFor(() => mentions().includes(POOL));
    // a coin we hold on PumpSwap is followed while we hold it
    const HELD = key(504);
    held.push(HELD);
    await waitFor(() => mentions().includes(HELD) && feed.pools.includes(HELD));
    held.length = 0;
    await waitFor(() => calls.some((c) => c.method === "logsUnsubscribe") && !feed.pools.includes(HELD));
    expect(feed.pools).toEqual([POOL]);
    feed.stop();
  });

  it("keeps a metered key within its daily budget, then uses the free feed", async () => {
    const hits = { paid: 0, free: 0 };
    wss = new WebSocketServer({ port: 0 });
    const free = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => {
      hits.paid++;
      ws.on("message", () => {
        // a busy stream: 3 KB notifications until the cap is reached
        for (let i = 0; i < 5; i++) ws.send(notification(10, `sig${hits.paid}-${i}`, ["Program log: x".padEnd(3_000, "x")]));
      });
    });
    free.on("connection", () => hits.free++);
    const dir = mkdtempSync(join(tmpdir(), "signal-budget-"));
    try {
      let spent = 0;
      const feed = new RpcLogsFeed({
        url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`,
        fallbackUrl: `ws://127.0.0.1:${(free.address() as AddressInfo).port}`,
        budgetMb: 0.01,
        budgetFile: join(dir, "usage.json"),
        onBudgetSpent: () => spent++,
        log: silentLogger,
        onEvent: () => {},
        onHealth: () => {},
      });
      feed.start();
      await waitFor(() => hits.free === 1);
      expect(spent).toBe(1);
      expect(feed.health.budget).toMatchObject({ limitMb: 0.01, onFree: true });
      feed.stop();
      // a restart the same day stays on the free feed: the day's usage was saved
      const again = new RpcLogsFeed({
        url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`,
        fallbackUrl: `ws://127.0.0.1:${(free.address() as AddressInfo).port}`,
        budgetMb: 0.01,
        budgetFile: join(dir, "usage.json"),
        log: silentLogger,
        onEvent: () => {},
        onHealth: () => {},
      });
      again.start();
      await waitFor(() => hits.free === 2);
      expect(hits.paid).toBe(1);
      again.stop();
    } finally {
      free.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reconnects and resubscribes after the server drops the connection", async () => {
    let connections = 0;
    let subs = 0;
    wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => {
      connections++;
      ws.on("message", () => subs++);
      if (connections === 1) setTimeout(() => ws.terminate(), 100);
    });
    const port = (wss.address() as AddressInfo).port;
    const statuses: FeedHealth["status"][] = [];
    const feed = new RpcLogsFeed({ url: `ws://127.0.0.1:${port}`, log: silentLogger, onEvent: () => {}, onHealth: (h) => statuses.push(h.status) });
    feed.start();
    await waitFor(() => connections >= 2 && subs >= 2, 10_000);
    expect(feed.health.reconnects).toBeGreaterThanOrEqual(1);
    expect(statuses).toContain("down");
    expect(redactKeys("Invalid URL: wss://mainnet.helius-rpc.com/?api-key=1a2b3c4d-5e6f&x=1")).toBe("Invalid URL: wss://mainnet.helius-rpc.com/?api-key=***&x=1");
    feed.stop();
  });
});

describe("feed parsers", () => {
  it("parses PumpPortal create (with dev buy), trade and migration messages", () => {
    const evs = parsePumpPortal(
      { signature: "s1", mint: MINT, traderPublicKey: USER, txType: "create", initialBuy: 35_000_000, solAmount: 1.0125, vTokensInBondingCurve: 1_038_000_000, vSolInBondingCurve: 31, marketCapSol: 29.9, name: "Jean Phil", symbol: "JEANPHIL", uri: "https://ipfs.io/ipfs/Qm1", pool: "pump" },
      1000,
    );
    expect(evs.map((e) => e.k)).toEqual(["create", "trade"]);
    expect(evs[1]).toMatchObject({ buy: true, vSol: 31e9, vTok: 1.038e15, tok: 35e12 });
    expect(parsePumpPortal({ txType: "sell", mint: MINT, traderPublicKey: USER, tokenAmount: 1000, solAmount: 0.01, vSolInBondingCurve: 30.5, vTokensInBondingCurve: 1.05e9, pool: "pump" }, 1)[0]).toMatchObject({ k: "trade", buy: false });
    expect(parsePumpPortal({ txType: "migrate", mint: MINT }, 1)[0]).toMatchObject({ k: "migrate" });
    expect(parsePumpPortal({ txType: "create", mint: "not-a-mint" }, 1)).toEqual([]);
    expect(parsePumpPortal({ txType: "create", mint: MINT, pool: "bonk" }, 1)).toEqual([]);
  });

  it("parses DexScreener pairs, IPFS urls and PumpSwap pool accounts", () => {
    const q = pairToQuote(
      { chainId: "solana", dexId: "pumpswap", baseToken: { address: MINT, symbol: "X" }, quoteToken: { address: "So11111111111111111111111111111111111111112" }, priceNative: "0.0000004", priceUsd: "0.00008", liquidity: { usd: 30000 }, marketCap: 80000 },
      5,
    );
    expect(q).toMatchObject({ k: "quote", mint: MINT, priceSol: 4e-7, liqUsd: 30000, mcapUsd: 80000 });
    expect(pairToQuote({ chainId: "base", baseToken: { address: "0x1" } }, 1)).toBeNull();
    expect(candidateUrls("https://ipfs.io/ipfs/QmABC")[0]).toBe("https://ipfs.io/ipfs/QmABC");
    expect(candidateUrls("ipfs://QmXYZ")).toContain("https://dweb.link/ipfs/QmXYZ");
    const buf = new Uint8Array(8 + 1 + 2 + 32 * 5);
    const mintBytes = base58Decode(MINT);
    buf.set(mintBytes, 43);
    expect(parsePoolAccount(buf)?.baseMint).toBe(MINT);
  });

  it("router drops cross-feed duplicates and secondary trades when the firehose is healthy", () => {
    const out: unknown[] = [];
    let healthy = true;
    const r = new EventRouter((e) => out.push(e), () => healthy);
    const trade = { k: "trade", ts: 1, sig: "x", src: "rpc", mint: MINT, buy: true, sol: 1, tok: 5000, user: USER, venue: "curve", vSol: 1, vTok: 1 } as const;
    r.push(trade);
    r.push({ ...trade });
    r.push({ ...trade, src: "pumpportal", sig: "y" });
    healthy = false;
    r.push({ ...trade, src: "pumpportal", sig: "z" });
    expect(out).toHaveLength(2);
    expect(r.duplicates).toBe(1);
    expect(r.dropped).toBe(1);
  });
});
