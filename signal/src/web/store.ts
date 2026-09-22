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
  feeds: { name: string; status: string; lastMsgAt: number; msgs: number; reconnects: number; errors: number; note?: string; critical: boolean }[];
  feedDown: boolean;
  simulated?: boolean;
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

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", "x-signal": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    setState({ authed: false });
    throw new Error("login required");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
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

let es: EventSource | null = null;
export function connectStream() {
  if (es) es.close();
  es = new EventSource("/api/stream");
  es.addEventListener("open", () => setState({ connected: true }));
  es.addEventListener("error", () => {
    setState({ connected: false });
    // EventSource reconnects by itself; a 401 shows up on the next state refresh
  });
  es.addEventListener("hello", (e) => {
    const d = JSON.parse((e as MessageEvent).data);
    setState({ settings: d.settings, account: d.account, rows: d.rows, connected: true, lastUpdate: Date.now(), skew: Date.now() - d.serverTime });
  });
  es.addEventListener("radar", (e) => {
    const d = JSON.parse((e as MessageEvent).data);
    setState({ rows: d.rows, account: d.account, lastUpdate: Date.now(), connected: true });
  });
  es.addEventListener("health", (e) => setState({ health: JSON.parse((e as MessageEvent).data) }));
  es.addEventListener("settings", (e) => setState({ settings: JSON.parse((e as MessageEvent).data) }));
  es.addEventListener("signal", (e) => {
    const rec = JSON.parse((e as MessageEvent).data) as SignalRecord;
    setState({ signals: [rec, ...state.signals.filter((s) => s.id !== rec.id)].slice(0, 200) });
  });
  es.addEventListener("position", (e) => {
    const { position, what } = JSON.parse((e as MessageEvent).data);
    if (what === "fill" && position.fills?.length === 1) toast(`Bought $${position.symbol || "coin"} · score ${Math.round(position.signalScore)}`);
    if (what === "close") toast(`Sold $${position.symbol || "coin"} · ${position.exitReason} · ${(position.pnlPct ?? 0).toFixed(1)}%`);
  });
}

export function stopStream() {
  es?.close();
  es = null;
}
