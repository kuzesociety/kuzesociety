import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { base58Decode } from "../src/core/codec.js";
import { encodeAmmSwap, encodeCreate, encodeTrade, programDataLine } from "../src/core/encode.js";
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
  it("subscribes to both programs, decodes events, skips failed/duplicate txs", async () => {
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
    await waitFor(() => subs.length === 2);
    expect(subs).toEqual([PUMP_PROGRAM, PUMP_AMM_PROGRAM]);
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
    expect(seen.msgs).toBeGreaterThanOrEqual(6);
    expect(seen.lastMsgAt).toBeGreaterThan(0);
    expect(engine.feedDown()).toBe(false);
    engine.advance(Date.now() + 60_000); // …and down again once it really goes quiet
    expect(engine.feedDown()).toBe(true);
    feed.stop();
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
    await waitFor(() => connections >= 2 && subs >= 4, 10_000);
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
