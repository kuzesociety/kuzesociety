/** Tiny global store + API client + live stream for the dashboard. */
import { useEffect, useState } from "preact/hooks";
import type { RadarRow } from "../core/engine";
import type { SignalRecord } from "../core/funnel";
import type { Position } from "../core/positions";
import type { Settings } from "../core/settings";

export type Account = {
  mode: string;
  enabled: boolean;
  killed: boolean;
  paperBalance: number;
  equity: number;
  openValue: number;
  exposure: number;
  realized: number;
  dayPnl: number;
  wins: number;
  losses: number;
  entries: number;
  fees: number;
  open: Position[];
  closed: Position[];
  equityCurve: { t: number; v: number }[];
};

export type FunnelSummary = {
  windowHours: number;
  hours: number;
  coinsAbove: number[];
  scored: number;
  signals: number;
  entered: number;
  failed: number;
  maxScore: number;
  hist: number[];
  reasons: { reason: string; n: number; text: string }[];
};

export type Health = Record<string, any> & {
  feeds: { name: string; status: string; lastMsgAt: number; msgs: number; reconnects: number; errors: number; note?: string; critical: boolean; host?: string }[];
  feedDown: boolean;
  simulated?: boolean;
  uptimeSec: number;
  /** when settings and positions last reached the disk, and failed saves in a row */
  saved?: { at: number; failures: number; error: string };
  dataDir?: string;
  /** one-tap updates (real bot only) */
  update?: { current: string | null; available: boolean; can: boolean } | null;
};

export interface AppState {
  authed: boolean | null;
  settings: Settings | null;
  account: Account | null;
  rows: RadarRow[];
  health: Health | null;
  funnelHour: FunnelSummary | null;
  funnelDay: FunnelSummary | null;
  signals: SignalRecord[];
  connected: boolean;
  solUsd: number;
  lastUpdate: number;
  skew: number;
  toast: string;
  /** a navigation request from outside the tab bar (tab, optional More section) */
  nav: { tab: string; sub?: string; at: number } | null;
}

let state: AppState = {
  authed: null,
  settings: null,
  account: null,
  rows: [],
  health: null,
  funnelHour: null,
  funnelDay: null,
  signals: [],
  connected: false,
  solUsd: 0,
  lastUpdate: 0,
  skew: 0,
  toast: "",
  nav: null,
};
const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useApp<T>(sel: (s: AppState) => T): T {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return sel(state);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string) {
  setState({ toast: msg });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: "" }), 3200);
}

export function navigate(tab: string, sub?: string) {
  setState({ nav: { tab, sub, at: Date.now() } });
}

/** How the dashboard talks to an engine: HTTP to the server, or an in-page engine (demo). */
export interface Transport {
  request(path: string, body?: unknown): Promise<{ status: number; json: any }>;
  stream(on: (event: string, data: any) => void, onOpen: () => void, onError: () => void): () => void;
}

const httpTransport: Transport = {
  async request(path, body) {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", "x-signal": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  },
  stream(on, onOpen, onError) {
    const es = new EventSource("/api/stream");
    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    for (const ev of ["hello", "radar", "health", "settings", "signal", "position"]) es.addEventListener(ev, (e) => on(ev, JSON.parse((e as MessageEvent).data)));
    return () => es.close();
  },
};

let transport: Transport = httpTransport;
export function setTransport(t: Transport) {
  transport = t;
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const { status, json } = await transport.request(path, body);
  if (status === 401) {
    setState({ authed: false });
    throw new Error("login required");
  }
  if (status >= 400) throw new Error(json?.error ?? `HTTP ${status}`);
  return json as T;
}

export async function refreshState() {
  try {
    const s = await api<any>("/api/state");
    setState({
      authed: true,
      settings: s.settings,
      account: s.account,
      health: s.health,
      funnelHour: s.funnel.hour,
      funnelDay: s.funnel.day,
      signals: s.signals,
      solUsd: s.solUsd || state.solUsd,
      skew: Date.now() - s.serverTime,
      lastUpdate: Date.now(),
    });
  } catch {
    /* authed flag already set on 401; network errors keep the last state */
  }
}

let closeStream: (() => void) | null = null;
export function connectStream() {
  closeStream?.();
  closeStream = transport.stream(
    (event, d) => {
      switch (event) {
        case "hello":
          setState({ settings: d.settings, account: d.account, rows: d.rows, connected: true, lastUpdate: Date.now(), skew: Date.now() - d.serverTime });
          break;
        case "radar":
          setState({ rows: d.rows, account: d.account, lastUpdate: Date.now(), connected: true });
          break;
        case "health":
          setState({ health: d });
          break;
        case "settings":
          setState({ settings: d });
          break;
        case "signal":
          setState({ signals: [d, ...state.signals.filter((s) => s.id !== d.id)].slice(0, 200) });
          break;
        case "position": {
          const { position, what } = d;
          if (what === "fill" && position.fills?.length === 1) toast(`Bought $${position.symbol || "coin"} · score ${Math.round(position.signalScore)}`);
          if (what === "close") toast(`Sold $${position.symbol || "coin"} · ${position.exitReason} · ${(position.pnlPct ?? 0).toFixed(1)}%`);
          break;
        }
      }
    },
    () => setState({ connected: true }),
    () => setState({ connected: false }),
  );
}

export function stopStream() {
  closeStream?.();
  closeStream = null;
}
