import { useEffect, useState } from "preact/hooks";
import { signedSol } from "./format";
import { ext } from "./ext";
import { api, connectStream, getState, refreshState, stopStream, useApp } from "./store";
import { Icon } from "./ui";
import { Bot } from "./views/bot";
import { Learn } from "./views/learn";
import { More } from "./views/more";
import { Radar } from "./views/radar";
import { TokenSheet } from "./views/token";
import { Trades } from "./views/trades";

export type TabKey = "radar" | "trades" | "bot" | "learn" | "more";
const TABS: [TabKey, string][] = [
  ["radar", "Radar"],
  ["trades", "Trades"],
  ["bot", "Bot"],
  ["learn", "Learn"],
  ["more", "More"],
];

const isTab = (k: string): k is TabKey => TABS.some(([t]) => t === k);

function initialTab(): TabKey {
  const h = location.hash.replace("#", "");
  return isTab(h) ? h : "radar";
}

function Login() {
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/login", { token });
      await refreshState();
      connectStream();
    } catch (x) {
      setErr(String((x as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="login">
      <div class="brand" style="font-size:15px;margin-bottom:18px">
        <Logo /> SIGNAL
      </div>
      <form class="card" onSubmit={submit}>
        <h2>Unlock the dashboard</h2>
        <p class="muted" style="margin-top:0">Enter the access token printed in the server log on first start (or your DASHBOARD_TOKEN).</p>
        <input id="token" class="inp" style="max-width:none" type="password" autoComplete="current-password" placeholder="access token" value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
        {err && (
          <p class="bad" style="margin:8px 0 0">
            {err}
          </p>
        )}
        <button class="btn primary" style="margin-top:12px;width:100%" disabled={busy || !token}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <path d="M6 22 L12 14 L17 18 L26 8" stroke="var(--flare)" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function App() {
  const authed = useApp((s) => s.authed);
  const settings = useApp((s) => s.settings);
  const account = useApp((s) => s.account);
  const health = useApp((s) => s.health);
  const connected = useApp((s) => s.connected);
  const toast = useApp((s) => s.toast);
  const nav = useApp((s) => s.nav);
  const [tab, setTab] = useState<TabKey>(initialTab());
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    if (nav && isTab(nav.tab)) {
      setTab(nav.tab);
      setSheet(null);
      window.scrollTo({ top: 0 });
    }
  }, [nav?.at]);

  useEffect(() => {
    void refreshState().then(() => {
      if (getState().authed) connectStream();
    });
    const t = setInterval(() => void refreshState(), 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshState().then(() => getState().authed && connectStream());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      stopStream();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (authed === false && !ext.demo) return <Login />;
  if (authed !== true || !settings) return <div class="empty" style="margin-top:30vh">{ext.demo ? "Starting the simulated market…" : "Connecting to SIGNAL…"}</div>;

  const feedsOk = !health?.feedDown;
  const go = (k: TabKey) => {
    setTab(k);
    try {
      history.replaceState(null, "", `#${k}`);
    } catch {
      /* sandboxed frames may refuse history changes */
    }
    window.scrollTo({ top: 0 });
  };
  const day = account?.dayPnl ?? 0;
  return (
    <div class="app">
      <header class="top">
        <div class="top-row">
          <div class="brand">
            <Logo /> SIGNAL
          </div>
          <span class="pill" title={feedsOk ? "data feeds live" : "data feed down"}>
            <span class={`dot ${!connected ? "mid" : feedsOk ? "on" : "off"}`} />
            {settings.enabled ? "Trading" : "Paused"} · {settings.mode === "live" ? "LIVE" : "paper"}
          </span>
          <span class="spacer" />
          <span class={`top-pnl num ${day > 0 ? "good" : day < 0 ? "bad" : "muted"}`} title="today, SOL">
            {signedSol(day)} SOL
          </span>
        </div>
      </header>
      {health?.simulated && (
        <div class="banner sim">
          <span style="flex:1">{ext.demo ? "DEMO — the real engine on a simulated market in this page. Fake coins, fake money." : "SIMULATED MARKET — demo data, not real coins or prices."}</span>
          {ext.bannerAction?.()}
        </div>
      )}
      {account?.killed && <div class="banner bad">Kill switch is ON — no new entries.</div>}
      {health && health.feedDown && !health.simulated && <div class="banner bad">Live data feed is down — the bot will not open trades until it recovers.</div>}
      <nav class="tabs" aria-label="sections">
        {TABS.map(([k, label]) => (
          <button key={k} class="tab" aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>
            {Icon[k]}
            {label}
          </button>
        ))}
      </nav>
      <main class="main">
        {tab === "radar" && <Radar open={setSheet} />}
        {tab === "trades" && <Trades open={setSheet} />}
        {tab === "bot" && <Bot />}
        {tab === "learn" && <Learn />}
        {tab === "more" && <More open={setSheet} />}
      </main>
      {sheet && <TokenSheet mint={sheet} close={() => setSheet(null)} />}
      {toast && (
        <div class="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

