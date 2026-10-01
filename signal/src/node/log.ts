/** Structured console logger with an in-memory tail for the dashboard. */
import type { Logger, LogLevel } from "../core/util.js";
import { Ring } from "../core/util.js";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogLine {
  ts: number;
  level: LogLevel;
  msg: string;
  data?: unknown;
}

const SECRET_KEYS = /key|secret|token|password|private/i;

function redact(data: unknown, depth = 0): unknown {
  if (depth > 4 || data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.slice(0, 20).map((x) => redact(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

export class ServerLog implements Logger {
  tail = new Ring<LogLine>(400);
  constructor(
    private level: LogLevel = "info",
    private sink: (line: LogLine) => void = () => {},
  ) {}

  private write(level: LogLevel, msg: string, data?: unknown) {
    if (ORDER[level] < ORDER[this.level]) return;
    const line: LogLine = { ts: Date.now(), level, msg, data: data === undefined ? undefined : redact(data) };
    this.tail.push(line);
    const text = `${new Date(line.ts).toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${line.data !== undefined ? " " + safeJson(line.data) : ""}`;
    if (level === "error" || level === "warn") console.error(text);
    else console.log(text);
    try {
      this.sink(line);
    } catch {
      /* never let a log sink break the caller */
    }
  }
  debug(msg: string, data?: unknown) {
    this.write("debug", msg, data);
  }
  info(msg: string, data?: unknown) {
    this.write("info", msg, data);
  }
  warn(msg: string, data?: unknown) {
    this.write("warn", msg, data);
  }
  error(msg: string, data?: unknown) {
    this.write("error", msg, data);
  }
}

function safeJson(x: unknown) {
  try {
    const s = JSON.stringify(x);
    return s.length > 800 ? s.slice(0, 800) + "…" : s;
  } catch {
    return String(x);
  }
}
