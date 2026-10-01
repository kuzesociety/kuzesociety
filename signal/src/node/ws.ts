/**
 * Self-healing WebSocket: exponential backoff with full jitter, heartbeat pings, a
 * silence watchdog (no data for `staleMs` → reconnect) and automatic resubscribe on
 * every reconnect. It never throws into the caller.
 */
import WebSocket from "ws";
import type { FeedHealth } from "../core/engine.js";
import type { Logger } from "../core/util.js";

export interface ReconnectingOptions {
  name: string;
  url: () => string;
  critical: boolean;
  /** called after every (re)connect — send subscriptions here */
  onOpen: (send: (msg: unknown) => boolean) => void;
  onMessage: (text: string) => void;
  /** reconnect if no message arrives for this long */
  staleMs?: number;
  pingMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  log: Logger;
  onHealth?: (h: FeedHealth) => void;
}

/** Hides API keys in URLs (Helius puts the key in the address) before text is shown or logged. */
export const redactKeys = (s: string) => s.replace(/(api[-_]?key=)[^&\s"']+/gi, "$1***");

export class ReconnectingWS {
  private ws: WebSocket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private attempts = 0;
  private stopped = true;
  private lastAliveAt = 0;
  /** the socket's last error, shown with the next "closed" (e.g. the server refused the key) */
  private lastError = "";
  /** network bytes of the sockets before the current one */
  private wireBase = 0;
  readonly h: FeedHealth;

  constructor(private o: ReconnectingOptions) {
    this.h = { name: o.name, status: "off", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: o.critical };
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = null;
    this.heartbeat = null;
    try {
      this.ws?.removeAllListeners();
      this.ws?.terminate();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus("off");
  }

  send(msg: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      return true;
    } catch (e) {
      this.h.errors++;
      this.o.log.warn(`${this.o.name}: send failed`, { err: String(e) });
      return false;
    }
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Drops the connection and connects again right away (to pick up a new address). */
  reconnect() {
    if (this.stopped) return;
    this.attempts = 0;
    const ws = this.ws;
    if (!ws) return;
    try {
      ws.terminate();
    } catch {
      /* the close handler reconnects */
    }
  }

  private setStatus(s: FeedHealth["status"], note?: string) {
    this.h.status = s;
    if (note !== undefined) this.h.note = redactKeys(note);
    try {
      // the live record, not a copy: message counts and the last-message time change on every
      // message without a status change, and the engine judges "feed down" by them
      this.o.onHealth?.(this.h);
    } catch {
      /* ignore */
    }
  }

  private connect() {
    if (this.stopped) return;
    let url: string;
    try {
      url = this.o.url();
    } catch (e) {
      this.setStatus("down", `bad url: ${String(e)}`);
      return;
    }
    try {
      this.h.host = new URL(url).host;
    } catch {
      this.h.host = "";
    }
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      // compression is offered; servers that support it send several times fewer bytes
      ws = new WebSocket(url, { handshakeTimeout: 15_000, perMessageDeflate: true, maxPayload: 16 * 1024 * 1024 });
    } catch (e) {
      this.h.errors++;
      this.schedule(`connect threw: ${String(e)}`);
      return;
    }
    this.ws = ws;
    ws.on("open", () => {
      this.attempts = 0;
      this.lastError = "";
      this.wireBase = this.h.wire ?? 0;
      this.lastAliveAt = Date.now();
      this.setStatus("open", "");
      this.o.log.info(`${this.o.name}: connected`);
      try {
        this.o.onOpen((m) => this.send(m));
      } catch (e) {
        this.o.log.error(`${this.o.name}: onOpen failed`, { err: String(e) });
      }
      this.startHeartbeat();
    });
    ws.on("message", (data) => {
      const now = Date.now();
      this.lastAliveAt = now;
      this.h.lastMsgAt = now;
      this.h.msgs++;
      this.h.bytes = (this.h.bytes ?? 0) + (Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : (data as Buffer).byteLength);
      const socket = (ws as unknown as { _socket?: { bytesRead?: number } })._socket;
      if (typeof socket?.bytesRead === "number") this.h.wire = this.wireBase + socket.bytesRead;
      try {
        this.o.onMessage(data.toString());
      } catch (e) {
        this.h.errors++;
        if (this.h.errors < 20 || this.h.errors % 500 === 0) this.o.log.warn(`${this.o.name}: message handler error`, { err: String(e) });
      }
    });
    ws.on("pong", () => {
      this.lastAliveAt = Date.now();
    });
    ws.on("error", (e) => {
      this.h.errors++;
      this.lastError = redactKeys(String((e as Error).message ?? e)).slice(0, 120);
      this.o.log.warn(`${this.o.name}: socket error`, { err: this.lastError });
    });
    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      const why = reason?.length ? reason.toString().slice(0, 80) : this.lastError;
      this.schedule(`closed ${code}${why ? ` — ${why}` : ""}`);
    });
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    const ping = this.o.pingMs ?? 15_000;
    const stale = this.o.staleMs ?? 60_000;
    this.heartbeat = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      const now = Date.now();
      const silentFor = now - Math.max(this.h.lastMsgAt, this.lastAliveAt - ping * 2);
      if (now - this.lastAliveAt > ping * 3 || now - (this.h.lastMsgAt || this.lastAliveAt) > stale) {
        this.o.log.warn(`${this.o.name}: no data for ${Math.round(silentFor / 1000)}s — reconnecting`);
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }, ping);
    this.heartbeat.unref?.();
  }

  private schedule(why: string) {
    if (this.stopped) return;
    this.h.reconnects++;
    const min = this.o.minBackoffMs ?? 1_000;
    const max = this.o.maxBackoffMs ?? 30_000;
    const ceil = Math.min(max, min * 2 ** Math.min(this.attempts, 10));
    const delay = Math.round(ceil / 2 + Math.random() * (ceil / 2));
    this.attempts++;
    this.setStatus("down", why);
    this.o.log.warn(`${this.o.name}: ${redactKeys(why)}; retry in ${(delay / 1000).toFixed(1)}s`);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
