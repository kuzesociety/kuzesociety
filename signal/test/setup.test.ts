import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { priorModel } from "../src/core/model.js";
import { PRESETS, followsPreset, ruleSummary } from "../src/core/presets.js";
import { DEFAULT_SETTINGS, rebaseSettings, sanitizeSettings, settingsChanges } from "../src/core/settings.js";
import { SetupStore, isLocalRequest, isPrivateChannel, rpcFromInput, telegramTokenLooksValid } from "../src/node/setup.js";
import { Telegram } from "../src/node/telegram.js";
import { Engine } from "../src/core/engine.js";
import { PUBLIC_RPC_WS, loadConfig } from "../src/node/config.js";

const req = (remote: string, headers: Record<string, string>, encrypted = false) => ({ socket: { remoteAddress: remote, encrypted }, headers }) as unknown as IncomingMessage;

describe("setup from the dashboard", () => {
  it("stores values, removes them with an empty string, and wins over .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "signal-setup-"));
    const s = new SetupStore(dir);
    expect(s.read()).toEqual({});
    s.write({ RPC_URL: "https://a", TELEGRAM_CHAT_ID: "none" });
    s.write({ TELEGRAM_CHAT_ID: "12345", RPC_URL: "" });
    expect(s.read()).toEqual({ TELEGRAM_CHAT_ID: "12345" });
    const env: NodeJS.ProcessEnv = { TELEGRAM_CHAT_ID: "from-env", RPC_URL: "from-env" };
    s.applyTo(env);
    expect(env).toEqual({ TELEGRAM_CHAT_ID: "12345", RPC_URL: "from-env" });
    // unknown keys are ignored, and the file is private where the OS supports it
    s.write({ NOT_A_KEY: "x" } as never);
    expect(Object.keys(JSON.parse(readFileSync(s.path, "utf8")))).toEqual(["TELEGRAM_CHAT_ID"]);
    if (process.platform !== "win32") expect(statSync(s.path).mode & 0o077).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("turns a Helius key or an RPC address into both endpoints", () => {
    expect(rpcFromInput(" 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d ")).toEqual({
      http: "https://mainnet.helius-rpc.com/?api-key=1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      ws: "wss://mainnet.helius-rpc.com/?api-key=1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    });
    expect(rpcFromInput("https://rpc.example.com/x?k=1")).toEqual({ http: "https://rpc.example.com/x?k=1", ws: "wss://rpc.example.com/x?k=1" });
    expect(rpcFromInput("wss://rpc.example.com/")).toEqual({ http: "https://rpc.example.com/", ws: "wss://rpc.example.com/" });
    expect(rpcFromInput("hello")).toBeNull();
    expect(rpcFromInput("ftp://x")).toBeNull();
    expect(telegramTokenLooksValid("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
    expect(telegramTokenLooksValid("123:abc")).toBe(false);
  });

  it("trusts only real same-computer requests (not proxies or DNS rebinding)", () => {
    expect(isLocalRequest(req("127.0.0.1", { host: "localhost:8787" }))).toBe(true);
    expect(isLocalRequest(req("::1", { host: "127.0.0.1:8787" }))).toBe(true);
    expect(isLocalRequest(req("127.0.0.1", { host: "evil.example:8787" }))).toBe(false); // rebinding
    expect(isLocalRequest(req("127.0.0.1", { host: "localhost:8787", "x-forwarded-for": "1.2.3.4" }))).toBe(false); // proxy
    expect(isLocalRequest(req("192.168.1.20", { host: "localhost:8787" }))).toBe(false);
    expect(isPrivateChannel(req("10.0.0.5", { host: "bot.example", "x-forwarded-proto": "https" }))).toBe(true);
    expect(isPrivateChannel(req("192.168.1.20", { host: "192.168.1.10:8787" }))).toBe(false); // phone on Wi-Fi, plain http
  });

  const silent = { debug() {}, info() {}, warn() {}, error() {} };

  it("streams from the free public feed unless the owner chooses the key, and then within a cap", () => {
    const helius = { RPC_URL: "https://mainnet.helius-rpc.com/?api-key=k", RPC_WS_URL: "wss://mainnet.helius-rpc.com/?api-key=k" };
    // a saved key alone does not stream: that is what spent a free plan in hours
    const plain = loadConfig(helius, []);
    expect(plain).toMatchObject({ streamSource: "public", streamWs: PUBLIC_RPC_WS, rpcHttp: helius.RPC_URL, ammFirehose: false, streamBudgetMb: 1500 });
    const chosen = loadConfig({ ...helius, STREAM_SOURCE: "rpc", STREAM_BUDGET_MB_PER_DAY: "800" }, []);
    expect(chosen).toMatchObject({ streamSource: "rpc", streamWs: helius.RPC_WS_URL, streamBudgetMb: 800 });
    // choosing "my key" without one stays on the free feed
    expect(loadConfig({ STREAM_SOURCE: "rpc" }, []).streamSource).toBe("public");
    expect(loadConfig({ STREAM_WS_URL: "ws://127.0.0.1:9" }, []).streamWs).toBe("ws://127.0.0.1:9");
    expect(loadConfig({ AMM_FIREHOSE: "1" }, []).ammFirehose).toBe(true);
  });

  it("saves only the edited fields, so a switch made meanwhile is not undone", () => {
    const base = { ...DEFAULT_SETTINGS, filters: { ...DEFAULT_SETTINGS.filters } };
    const draft = { ...base, tpPct: 300, filters: { ...base.filters, maxDevPct: 10 } };
    expect(settingsChanges(draft, base)).toEqual({ tpPct: 300, filters: { maxDevPct: 10 } });
    // meanwhile auto-trading was switched on and a strategy moved the score
    const latest = { ...base, enabled: true, minScore: 95 };
    const rebased = rebaseSettings(draft, base, latest);
    expect(rebased).toMatchObject({ enabled: true, minScore: 95, tpPct: 300 });
    expect(rebased.filters.maxDevPct).toBe(10);
    expect(settingsChanges(rebased, latest)).toEqual({ tpPct: 300, filters: { maxDevPct: 10 } });
    // the server merges a partial patch over what it has, filters included
    const merged = sanitizeSettings(settingsChanges(rebased, latest), latest);
    expect(merged).toMatchObject({ enabled: true, minScore: 95, tpPct: 300 });
    expect(merged.filters).toEqual({ ...latest.filters, maxDevPct: 10 });
  });

  it("links Telegram to whoever sends the dashboard's code", () => {
    let linked = "";
    const e = new Engine({ now: Date.now(), model: priorModel() });
    const t = new Telegram({ token: "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw", chatId: "", linkCode: "482913", onLinked: (c) => (linked = c), log: { debug() {}, info() {}, warn() {}, error() {} }, engine: () => e });
    expect(t.enabled).toBe(false);
    expect(t.linking).toBe(true);
    (t as unknown as { send: () => void }).send = () => {}; // no network in tests
    t.link("777", "my code is 482913");
    expect(linked).toBe("777");
    expect(t.enabled).toBe(true);
    expect(t.linking).toBe(false);
    expect(new Telegram({ token: "off", chatId: "1", log: { debug() {}, info() {}, warn() {}, error() {} }, engine: () => e }).enabled).toBe(false);
    // /update from the phone: handed to the updater, or a plain refusal where there is none
    let asked = 0;
    const withUpdate = new Telegram({ token: "t", chatId: "1", log: silent, engine: () => e, update: () => (++asked, "⬇️ Downloading the update") });
    expect(withUpdate.command("/update")).toMatch(/Downloading/);
    expect(asked).toBe(1);
    expect(new Telegram({ token: "t", chatId: "1", log: silent, engine: () => e }).command("/update")).toMatch(/cannot update/);
    expect(withUpdate.command("/help")).toContain("/update");
  });

  it("switches the whole rule with a preset, time limit included", () => {
    const e = new Engine({ now: Date.now(), model: priorModel() });
    const momentum = PRESETS.find((p) => p.key === "sim-momentum")!;
    e.updateSettings({ minScore: 60, tpPct: 35, slPct: 15, maxHoldMin: 0, scoreOnly: false, tradeAmm: false });
    expect(followsPreset(e.settings, momentum.settings)).toBe(false);
    e.updateSettings(momentum.settings);
    expect(followsPreset(e.settings, momentum.settings)).toBe(true);
    expect(e.settings).toMatchObject({ minScore: 95, tpPct: 500, slPct: 20, maxHoldMin: 10, scoreOnly: true, tradeCurve: true, tradeAmm: true });
    expect(ruleSummary(e.settings)).toBe("score ≥ 95 · +500% / −20% · 10 min");
    expect(ruleSummary(sanitizeSettings({ ...DEFAULT_SETTINGS, maxHoldMin: 240 }))).toBe("score ≥ 75 · +100% / −50% · 4 h");
    // every preset survives the settings sanitizer unchanged (no silent clamping)
    for (const p of PRESETS) expect(followsPreset(sanitizeSettings(p.settings, DEFAULT_SETTINGS), p.settings)).toBe(true);
  });
});
