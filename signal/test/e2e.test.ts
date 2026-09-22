/**
 * End-to-end: the BUILT server (dist/engine.mjs) against a mock Solana RPC websocket that
 * streams simulated pump.fun activity as real `Program data:` logs. Exercises the bundle,
 * websocket client, decoders, engine, persistence, auth, API and SSE together.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { encodeAmmSwap, encodeComplete, encodeCreate, encodeCreatePool, encodeMigration, encodeTrade, programDataLine } from "../src/core/encode.js";
import type { AmmSwap, MarketEvent } from "../src/core/types.js";
import { MarketSim } from "../src/sim/market.js";

const ROOT = join(__dirname, "..");
const TOKEN = "e2e-token-123456";

function toLogs(ev: MarketEvent | AmmSwap): string[] | null {
  const t = Math.floor(ev.ts / 1000);
  switch (ev.k) {
    case "create":
      return [programDataLine(encodeCreate({ name: ev.name, symbol: ev.symbol, uri: ev.uri, mint: ev.mint, bondingCurve: ev.creator, user: ev.user, creator: ev.creator, chainTs: t, vTok: ev.vTok, vSol: ev.vSol, realTok: ev.realTok, supply: ev.supply }))];
    case "trade":
      return [programDataLine(encodeTrade({ mint: ev.mint, sol: ev.sol, tok: ev.tok, buy: ev.buy, user: ev.user, chainTs: t, vSol: ev.vSol, vTok: ev.vTok, realSol: ev.realSol ?? 0, realTok: ev.realTok ?? 0, fee: ev.fee ?? 0, creatorFee: 0, creator: ev.user }))];
    case "complete":
      return [programDataLine(encodeComplete(ev.mint, ev.mint, ev.mint, t))];
    case "migrate":
      return [programDataLine(encodeMigration({ user: ev.mint, mint: ev.mint, mintAmount: ev.mintAmount ?? 0, solAmount: ev.solAmount ?? 0, bondingCurve: ev.mint, chainTs: t, pool: ev.pool! }))];
    case "pool":
      return [programDataLine(encodeCreatePool({ chainTs: t, creator: ev.mint, baseMint: ev.mint, quoteMint: "So11111111111111111111111111111111111111112", poolBase: ev.base, poolQuote: ev.quote, pool: ev.pool, lpMint: ev.pool, coinCreator: ev.coinCreator ?? ev.mint }))];
    case "ammSwap":
      return [programDataLine(encodeAmmSwap({ chainTs: t, buy: ev.buy, base: ev.base, poolBase: ev.poolBase, poolQuote: ev.poolQuote, quoteAmount: ev.quoteDelta, lpFee: 0, protocolFee: ev.fee, creatorFee: 0, pool: ev.pool, user: ev.user, coinCreator: ev.user, supply: ev.supply ?? 1e15 }))];
    default:
      return null;
  }
}

let proc: ChildProcess | null = null;
let wss: WebSocketServer | null = null;
let rpcHttp: ReturnType<typeof createServer> | null = null;
let dataDir = "";
let port = 0;
let output = "";

const api = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });

async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 30_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch {
      /* not ready */
    }
    if (Date.now() - t0 > ms) throw new Error(`timeout; server output:\n${output.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

beforeAll(async () => {
  if (!existsSync(join(ROOT, "dist/engine.mjs"))) throw new Error("run `npm run build` first");
  dataDir = mkdtempSync(join(tmpdir(), "signal-e2e-"));
  // mock RPC HTTP (pool lookups etc. → empty answers)
  rpcHttp = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: [] } })));
  });
  await new Promise<void>((r) => rpcHttp!.listen(0, "127.0.0.1", () => r()));
  // mock RPC websocket streaming simulated activity as logs
  wss = new WebSocketServer({ port: 0 });
  const sim = new MarketSim({ durationMs: 40 * 60_000, launchesPerMin: 10, seed: 77 });
  const events = [...sim.run()];
  wss.on("connection", (ws) => {
    let subs = 0;
    let i = 0;
    ws.on("message", (m) => {
      const req = JSON.parse(m.toString());
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: 100 + req.id }));
      if (++subs === 2) {
        const timer = setInterval(() => {
          for (let n = 0; n < 400 && i < events.length; n++, i++) {
            const logs = toLogs(events[i]!);
            if (!logs) continue;
            ws.send(JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 1000 + i }, value: { signature: `sig${i}`, err: null, logs } }, subscription: 101 } }));
          }
          if (i >= events.length) clearInterval(timer);
        }, 50);
        ws.on("close", () => clearInterval(timer));
      }
    });
  });
  const wsPort = (wss.address() as AddressInfo).port;
  const httpPort = (rpcHttp.address() as AddressInfo).port;
  port = 20000 + Math.floor(Math.random() * 20000);
  proc = spawn(process.execPath, [join(ROOT, "dist/engine.mjs")], {
    cwd: dataDir,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: "127.0.0.1",
      DASHBOARD_TOKEN: TOKEN,
      FEEDS: "rpc",
      RPC_WS_URL: `ws://127.0.0.1:${wsPort}`,
      RPC_URL: `http://127.0.0.1:${httpPort}`,
      LEARN_EVERY_HOURS: "0",
      FETCH_METADATA: "0",
      HTTPS_PROXY: "",
      https_proxy: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout!.on("data", (d) => (output += d.toString()));
  proc.stderr!.on("data", (d) => (output += d.toString()));
  await until(async () => (await fetch(`http://127.0.0.1:${port}/healthz`)).ok);
}, 60_000);

afterAll(() => {
  proc?.kill("SIGKILL");
  wss?.close();
  rpcHttp?.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("built server end-to-end", () => {
  it("rejects requests without the token and serves the dashboard with a strict CSP", async () => {
    expect((await fetch(`http://127.0.0.1:${port}/api/state`)).status).toBe(401);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toMatch(/script-src 'self' 'sha256-/);
    expect(await page.text()).toContain("<div id=\"root\">");
    const post = await api("/api/settings", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(post.status).toBe(403); // missing CSRF header
  });

  it("ingests the firehose, scores coins and serves them", async () => {
    const st = await until(async () => {
      const s = await (await api("/api/state")).json();
      return s.health.events > 3000 && s.health.scored > 10 ? s : null;
    }, 45_000);
    expect(st.health.errors).toBe(0);
    expect(st.health.feeds.find((f: { name: string }) => f.name === "solana-rpc").status).toBe("open");
    const radar = await (await api("/api/radar?limit=10")).json();
    expect(radar.rows.length).toBeGreaterThan(0);
    const detail = await (await api(`/api/token/${radar.rows[0].mint}`)).json();
    expect(detail.mint).toBe(radar.rows[0].mint);
    expect(detail.score.contributions.length).toBeGreaterThan(0);
    expect(detail.entry).toMatchObject({ need: expect.any(Number) });
    // the edge finder answers honestly when there is too little data
    const run = await (await api("/api/edges/run", { method: "POST", headers: { "content-type": "application/json", "x-signal": "1" }, body: "{}" })).json();
    expect(run.report.status).toBe("not_enough_data");
    expect((await (await api("/api/edges")).json()).report.status).toBe("not_enough_data");
  }, 60_000);

  it("applies settings over the API (score-only) and streams server-sent events", async () => {
    const res = await api("/api/settings", { method: "POST", headers: { "content-type": "application/json", "x-signal": "1" }, body: JSON.stringify({ enabled: true, scoreOnly: true, minScore: 70 }) });
    const body = await res.json();
    expect(body.settings.scoreOnly).toBe(true);
    expect(body.settings.minScore).toBe(70);
    const ctrl = new AbortController();
    const sse = await api("/api/stream", { signal: ctrl.signal });
    const reader = sse.body!.getReader();
    let text = "";
    while (!text.includes("event: hello")) text += new TextDecoder().decode((await reader.read()).value);
    ctrl.abort();
    expect(text).toContain('"scoreOnly":true');
  });

  it("shuts down cleanly on SIGTERM and leaves a valid state file", async () => {
    proc!.kill("SIGTERM");
    await until(async () => (proc!.exitCode !== null ? true : null), 10_000);
    expect(proc!.exitCode).toBe(0);
    const state = JSON.parse(readFileSync(join(dataDir, "state.json"), "utf8"));
    expect(state.v).toBe(1);
    expect(state.settings.scoreOnly).toBe(true);
  });
});
