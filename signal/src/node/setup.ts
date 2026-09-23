/**
 * Setup from the dashboard: the values a user would otherwise type into .env (data feed key,
 * Telegram, live wallet) are saved to DATA_DIR/config.json and applied at start, over .env and
 * the host's variables. Secrets are write-only: the API reports whether they are set, never
 * their value, and a wallet key is accepted only over a connection nobody else can read.
 */
import { exec } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./store.js";

export const SETUP_KEYS = [
  "RPC_URL",
  "RPC_WS_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_LINK_CODE",
  "LIVE_TRADING",
  "WALLET_PRIVATE_KEY",
  "LIVE_MAX_POSITION_SOL",
  "LIVE_MAX_DAILY_LOSS_SOL",
  "STREAM_SOURCE",
  "STREAM_BUDGET_MB_PER_DAY",
] as const;
export type SetupKey = (typeof SETUP_KEYS)[number];
export type SetupValues = Partial<Record<SetupKey, string>>;

/** The exact phrase that switches real-money trading on (same as LIVE_TRADING in .env). */
export const LIVE_PHRASE = "I_UNDERSTAND_THE_RISK";

export class SetupStore {
  readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, "config.json");
  }

  read(): SetupValues {
    if (!existsSync(this.path)) return {};
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Record<string, unknown>;
      const out: SetupValues = {};
      for (const k of SETUP_KEYS) if (typeof raw[k] === "string") out[k] = raw[k] as string;
      return out;
    } catch {
      return {};
    }
  }

  /** Merges `patch` in; an empty string removes a value (the .env / host value applies again). */
  write(patch: SetupValues) {
    const next: SetupValues = { ...this.read() };
    for (const [k, v] of Object.entries(patch) as [SetupKey, string | undefined][]) {
      if (!SETUP_KEYS.includes(k) || v === undefined) continue;
      if (v === "") delete next[k];
      else next[k] = v;
    }
    writeFileAtomic(this.path, JSON.stringify(next, null, 1));
    try {
      chmodSync(this.path, 0o600); // secrets: readable by the bot's user only
    } catch {
      /* not supported on every file system */
    }
  }

  /** Values chosen in the dashboard win over .env and the host's variables. */
  applyTo(env: NodeJS.ProcessEnv) {
    for (const [k, v] of Object.entries(this.read())) if (v) env[k] = v;
  }
}

/** A Helius API key, or any Solana RPC URL (http or websocket), as the two endpoints the bot uses. */
export function rpcFromInput(input: string): { http: string; ws: string } | null {
  const v = input.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return { http: `https://mainnet.helius-rpc.com/?api-key=${v}`, ws: `wss://mainnet.helius-rpc.com/?api-key=${v}` };
  }
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.protocol === "http:") return { http: u.toString(), ws: u.toString().replace(/^http/i, "ws") };
    if (u.protocol === "wss:" || u.protocol === "ws:") return { http: u.toString().replace(/^ws/i, "http"), ws: u.toString() };
  } catch {
    /* not a URL */
  }
  return null;
}

export function telegramTokenLooksValid(token: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token.trim());
}

export function newLinkCode(): string {
  return String(100_000 + Math.floor(Math.random() * 900_000));
}

/**
 * A request from a browser on this same computer: loopback address, no proxy in between, and
 * a Host header of localhost (a page on another domain that resolves to 127.0.0.1 — DNS
 * rebinding — carries its own host name and is not trusted).
 */
export function isLocalRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? "";
  if (!(addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1")) return false;
  if (req.headers["x-forwarded-for"] || req.headers.forwarded) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(req.headers.host ?? ""));
}

/** Nobody between the browser and the bot can read what is sent (same computer, or HTTPS). */
export function isPrivateChannel(req: IncomingMessage): boolean {
  return isLocalRequest(req) || req.headers["x-forwarded-proto"] === "https" || !!(req.socket as { encrypted?: boolean }).encrypted;
}

/** This computer's address on the home network, for opening the dashboard from a phone. */
export function lanAddress(): string | null {
  const all = Object.values(networkInterfaces()).flat();
  const v4 = all.filter((i): i is NonNullable<typeof i> => !!i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  return v4.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) ?? v4[0] ?? null;
}

/** Opens the dashboard in the default browser (desktop installs), at most once per 10 minutes. */
export function openBrowser(url: string, dataDir: string) {
  const stamp = join(dataDir, ".browser-opened");
  try {
    if (existsSync(stamp) && Date.now() - Number(readFileSync(stamp, "utf8")) < 10 * 60_000) return;
    writeFileSync(stamp, String(Date.now()));
  } catch {
    /* best effort */
  }
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
