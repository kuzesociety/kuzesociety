/**
 * Server configuration from environment variables (see .env.example). Secrets are
 * never logged; `describe()` returns a redacted view for the dashboard.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dashboardToken: string;
  /** the RPC key's endpoints: orders, lookups, and the stream only when streamSource is "rpc" */
  rpcWs: string;
  rpcHttp: string;
  /** where live trades stream from */
  streamWs: string;
  /** "public": the free public Solana feed (default); "rpc": the RPC key's websocket, metered by the provider */
  streamSource: "public" | "rpc";
  /** daily cap on data streamed through a metered key, in MB; then the free feed until 00:00 UTC */
  streamBudgetMb: number;
  /** also stream every PumpSwap swap on every pool — about nine tenths of the whole stream */
  ammFirehose: boolean;
  feeds: Set<"rpc" | "pumpportal" | "dexscreener" | "sim">;
  pumpPortalApiKey: string;
  telegramToken: string;
  telegramChatId: string;
  /** live trading gate: must equal "I_UNDERSTAND_THE_RISK" */
  liveTrading: boolean;
  walletSecret: string;
  liveMaxPositionSol: number;
  liveMaxDailyLossSol: number;
  jitoTipSol: number;
  record: boolean;
  recordDays: number;
  sampleDays: number;
  learnEveryHours: number;
  simSpeed: number;
  simPredictability: number;
  githubToken: string;
  githubRepo: string;
  githubBranch: string;
  logLevel: "debug" | "info" | "warn" | "error";
  metadata: boolean;
}

/** Minimal .env loader (KEY=VALUE lines) so no dependency is needed. */
export function loadDotEnv(path = ".env") {
  const p = resolve(path);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

/** The free public Solana endpoints (Solana Foundation): no key, 100 MB per 30 s per connection. */
export const PUBLIC_RPC_HTTP = "https://api.mainnet-beta.solana.com";
export const PUBLIC_RPC_WS = "wss://api.mainnet-beta.solana.com";
export const isPublicRpc = (u: string) => /api\.mainnet(-beta)?\.solana\.com/i.test(u);

function n(v: string | undefined, d: number) {
  const x = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(x) ? x : d;
}

export function loadConfig(env = process.env, argv = process.argv): Config {
  const sim = argv.includes("--sim") || env.SIM === "1" || env.SIM === "true";
  const feedList = (env.FEEDS ?? (sim ? "sim" : "rpc,pumpportal,dexscreener"))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const feeds = new Set<Config["feeds"] extends Set<infer T> ? T : never>();
  for (const f of feedList) if (f === "rpc" || f === "pumpportal" || f === "dexscreener" || f === "sim") feeds.add(f);
  if (sim) {
    feeds.clear();
    feeds.add("sim");
  }
  const rpcHttp = env.RPC_URL ?? env.RPC_HTTP_URL ?? PUBLIC_RPC_HTTP;
  const rpcWs = env.RPC_WS_URL ?? rpcHttp.replace(/^http/, "ws");
  // Streaming every pump.fun trade through a metered key costs far more than its free plan
  // (Helius meters 20 credits per MB), so the stream uses the free public feed unless the
  // owner chooses the key — and then only up to a daily budget.
  const streamSource = env.STREAM_SOURCE === "rpc" && !isPublicRpc(rpcWs) ? "rpc" : "public";
  const streamWs = streamSource === "rpc" ? rpcWs : env.STREAM_WS_URL || PUBLIC_RPC_WS;
  const level = (env.LOG_LEVEL ?? "info") as Config["logLevel"];
  return {
    port: n(env.PORT, 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: resolve(env.DATA_DIR ?? "./data"),
    dashboardToken: env.DASHBOARD_TOKEN ?? "",
    rpcWs,
    rpcHttp,
    streamWs,
    streamSource,
    streamBudgetMb: Math.max(0, n(env.STREAM_BUDGET_MB_PER_DAY, 1500)),
    ammFirehose: env.AMM_FIREHOSE === "1" || env.AMM_FIREHOSE === "true",
    feeds,
    pumpPortalApiKey: env.PUMPPORTAL_API_KEY ?? "",
    telegramToken: env.TELEGRAM_BOT_TOKEN ?? "",
    telegramChatId: env.TELEGRAM_CHAT_ID ?? "",
    liveTrading: env.LIVE_TRADING === "I_UNDERSTAND_THE_RISK",
    walletSecret: env.WALLET_PRIVATE_KEY ?? "",
    liveMaxPositionSol: n(env.LIVE_MAX_POSITION_SOL, 0.05),
    liveMaxDailyLossSol: n(env.LIVE_MAX_DAILY_LOSS_SOL, 0.25),
    jitoTipSol: n(env.JITO_TIP_SOL, 0),
    record: env.RECORD !== "0" && env.RECORD !== "false",
    recordDays: n(env.RECORD_DAYS, 5),
    sampleDays: n(env.SAMPLE_DAYS, 30),
    learnEveryHours: n(env.LEARN_EVERY_HOURS, 6),
    simSpeed: n(env.SIM_SPEED, 1),
    simPredictability: n(env.SIM_PREDICTABILITY, 0.7),
    githubToken: env.GITHUB_TOKEN ?? "",
    githubRepo: env.GITHUB_SYNC_REPO ?? "",
    githubBranch: env.GITHUB_SYNC_BRANCH ?? "signal-data",
    logLevel: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
    metadata: env.FETCH_METADATA !== "0",
  };
}

const hide = (s: string) => (s ? `set (${s.length} chars)` : "not set");

/** Redacted, human-readable configuration for the Health view. */
export function describeConfig(c: Config) {
  const host = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return "invalid url";
    }
  };
  return {
    feeds: [...c.feeds],
    rpc: host(c.rpcHttp),
    rpcIsPublic: isPublicRpc(c.rpcHttp),
    stream: host(c.streamWs),
    streamSource: c.streamSource,
    ammFirehose: c.ammFirehose,
    pumpPortalApiKey: hide(c.pumpPortalApiKey),
    telegram: c.telegramToken && c.telegramChatId ? "on" : "off",
    liveTrading: c.liveTrading ? "enabled by server" : "disabled by server",
    wallet: c.walletSecret ? "configured" : "none",
    liveMaxPositionSol: c.liveMaxPositionSol,
    liveMaxDailyLossSol: c.liveMaxDailyLossSol,
    recording: c.record ? `on (${c.recordDays} days kept)` : "off",
    learnEveryHours: c.learnEveryHours,
    dataDir: c.dataDir,
    githubSync: c.githubRepo ? `${c.githubRepo}@${c.githubBranch}` : "off",
  };
}
