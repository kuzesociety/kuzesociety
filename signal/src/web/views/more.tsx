import { useEffect, useState } from "preact/hooks";
import { REASON_TEXT } from "../../core/funnel";
import { ago, clock, mcap, pct, short } from "../format";
import { ext } from "../ext";
import { api, useApp } from "../store";
import { Empty, Tag } from "../ui";
import { SetupView } from "./setup";

type Sub = "signals" | "narratives" | "wallets" | "health" | "setup";

const BASE: [Sub, string][] = [
  ["signals", "Signals log"],
  ["narratives", "Narratives"],
  ["wallets", "Smart wallets"],
  ["health", "Health"],
  ["setup", "Setup"],
];

export function More({ open }: { open: (mint: string) => void }) {
  const nav = useApp((s) => s.nav);
  const [sub, setSub] = useState<string>(nav?.tab === "more" && nav.sub ? nav.sub : ext.moreTabs[0]?.key ?? "signals");
  useEffect(() => {
    if (nav?.tab === "more" && nav.sub) setSub(nav.sub);
  }, [nav?.at]);
  const extra = ext.moreTabs.find((t) => t.key === sub);
  return (
    <div>
      <div class="chips" style="margin:14px 0">
        {[...ext.moreTabs.map((t) => [t.key, t.label] as [string, string]), ...BASE].map(([k, l]) => (
          <button key={k} class="chip" aria-pressed={sub === k} onClick={() => setSub(k)}>
            {l}
          </button>
        ))}
      </div>
      {extra && extra.render()}
      {sub === "signals" && <Signals open={open} />}
      {sub === "narratives" && <Narratives open={open} />}
      {sub === "wallets" && <Wallets />}
      {sub === "health" && <HealthView />}
      {sub === "setup" && (
        <>
          <SetupView />
          <Setup />
        </>
      )}
    </div>
  );
}

function Signals({ open }: { open: (m: string) => void }) {
  const signals = useApp((s) => s.signals);
  const solUsd = useApp((s) => s.solUsd);
  if (!signals.length) return <Empty>Every time a coin crosses your score it is logged here with what the bot did about it.</Empty>;
  return (
    <div class="card flat" style="padding:4px 8px">
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Coin</th>
              <th class="r">Score</th>
              <th class="r">Mcap</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.id} style="cursor:pointer" onClick={() => open(s.mint)}>
                <td class="faint num">{clock(s.ts)}</td>
                <td>
                  <b>${s.symbol || "?"}</b>
                </td>
                <td class="r num">{Math.round(s.score)}</td>
                <td class="r num">{mcap(s.mcapSol, solUsd)}</td>
                <td style="white-space:normal">
                  <Tag tone={s.decision === "entered" ? "good" : s.decision === "blocked" ? undefined : s.decision === "failed" ? "warn" : "flare"}>{s.decision}</Tag>{" "}
                  <span class="faint">{s.reason ? (REASON_TEXT[s.reason] ?? s.reason) : ""}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Narratives({ open }: { open: (m: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const solUsd = useApp((s) => s.solUsd);
  useEffect(() => {
    const load = () => api<{ clusters: any[] }>("/api/narratives").then((r) => setRows(r.clusters)).catch(() => setRows([]));
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!rows) return <Empty>Loading…</Empty>;
  if (!rows.length) return <Empty>No narrative clusters in the last hour yet. When several coins launch around the same name, ticker or tweet, they group here — and the market usually picks one winner.</Empty>;
  return (
    <div class="list">
      <p class="muted" style="margin:0 0 4px">Same idea, many coins: attention coordinates on one. Leaders (biggest market cap) tend to keep the flow; copies usually fade.</p>
      {rows.map((c) => (
        <button key={c.key} class="coin" onClick={() => c.leader && open(c.leader)}>
          <div class="score b2" style="font-size:15px">
            {c.size}
            <small>COINS</small>
          </div>
          <div class="body">
            <div class="title">
              <span class="sym">{c.key.replace(/^(t|w|tw|x):/, (m: string) => ({ "t:": "$", "w:": "", "tw:": "tweet ", "x:": "@" })[m] ?? "")}</span>
            </div>
            <div class="meta">
              <span>
                leader <b>${c.leaderSymbol ?? "?"}</b> {c.leaderName ? `· ${c.leaderName}` : ""}
              </span>
              <span>{mcap(c.leaderMcap, solUsd)}</span>
              {c.leaderScore !== undefined && <span>score {Math.round(c.leaderScore)}</span>}
              <span>first {ago(c.firstTs)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function Wallets() {
  const [d, setD] = useState<any | null>(null);
  useEffect(() => {
    api("/api/wallets").then(setD).catch(() => setD({ wallets: [] }));
  }, []);
  if (!d) return <Empty>Loading…</Empty>;
  return (
    <div class="card flat">
      <h3>Learned from the order flow</h3>
      <p class="muted" style="margin-top:0">
        {d.tracked?.toLocaleString()} wallets tracked · <b>{d.smart}</b> currently qualify as smart (≥8 closed coins, high win rate and ROI, not serial devs). They are a score input, never a
        copy-trade rule.
      </p>
      {d.wallets.length === 0 ? (
        <Empty>Needs a few hours of data before wallets have enough closed trades to judge.</Empty>
      ) : (
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Wallet</th>
                <th class="r">Coins</th>
                <th class="r">Win</th>
                <th class="r">Avg ROI</th>
                <th class="r">Profit</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {d.wallets.map((w: any) => (
                <tr key={w.address}>
                  <td class="mono">
                    {ext.demo ? (
                      <span class="mono">{short(w.address)}</span>
                    ) : (
                      <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noopener">
                        {short(w.address)}
                      </a>
                    )}
                  </td>
                  <td class="r num">{w.closed}</td>
                  <td class="r num">{pct(w.winRate)}</td>
                  <td class="r num">{pct(w.avgRoi)}</td>
                  <td class={`r num ${w.pnl >= 0 ? "good" : "bad"}`}>{w.pnl.toFixed(2)} SOL</td>
                  <td>
                    {w.tags.map((t: string) => (
                      <Tag key={t} tone={t === "smart" ? "good" : t === "serial-dev" || t === "bundler" ? "bad" : undefined}>
                        {t}
                      </Tag>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HealthView() {
  const h = useApp((s) => s.health);
  const connected = useApp((s) => s.connected);
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    api<{ lines: any[] }>("/api/logs").then((r) => setLogs(r.lines)).catch(() => {});
  }, []);
  if (!h) return <Empty>Loading…</Empty>;
  const now = Date.now();
  const trades = h.feeds.some((f: any) => f.critical && f.status === "open");
  return (
    <div class="grid">
      {!trades && (
        <div class="banner bad" style="margin:0">
          No live trade stream. The bot needs the Solana RPC firehose (free Helius key) or a PumpPortal API key to score coins — see Setup & help.
        </div>
      )}
      <div class="card">
        <h2>Data feeds</h2>
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Feed</th>
                <th>Status</th>
                <th class="r">Messages</th>
                <th class="r">Last</th>
                <th class="r">Reconnects</th>
              </tr>
            </thead>
            <tbody>
              {h.feeds.map((f: any) => (
                <tr key={f.name}>
                  <td>
                    {f.name} {f.critical && <Tag>primary</Tag>}
                  </td>
                  <td style="white-space:normal">
                    <span class={`dot ${f.status === "open" ? "on" : f.status === "connecting" ? "mid" : "off"}`} style="display:inline-block;margin-right:6px" />
                    {f.status}
                    {f.note ? <span class="faint"> · {f.note}</span> : null}
                  </td>
                  <td class="r num">{f.msgs.toLocaleString()}</td>
                  <td class="r num">{f.lastMsgAt ? `${Math.round((now - f.lastMsgAt) / 1000)}s` : "—"}</td>
                  <td class="r num">{f.reconnects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div class="grid two">
        <div class="card">
          <h2>Engine</h2>
          <dl class="kv">
            <dt>Dashboard link</dt>
            <dd>{connected ? "live" : "reconnecting…"}</dd>
            <dt>Uptime</dt>
            <dd>{(h.uptimeSec / 3600).toFixed(1)} h</dd>
            {h.dataDir && (
              <>
                <dt>Data folder</dt>
                <dd style="word-break:break-all">{h.dataDir}</dd>
              </>
            )}
            {h.saved && (
              <>
                <dt>Settings saved</dt>
                <dd class={h.saved.failures >= 3 ? "bad" : ""}>
                  {h.saved.at ? `${Math.max(0, Math.round((now - h.saved.at) / 1000))} s ago` : "nothing to save yet"}
                  {h.saved.failures > 0 && ` · ${h.saved.failures} failed in a row`}
                </dd>
              </>
            )}
            <dt>Events processed</dt>
            <dd>{h.events?.toLocaleString()}</dd>
            <dt>Coins in memory / scored</dt>
            <dd>
              {h.tokens} / {h.scored}
            </dd>
            <dt>Launches · trades seen</dt>
            <dd>
              {h.creates?.toLocaleString()} · {h.trades?.toLocaleString()}
            </dd>
            <dt>PumpSwap swaps (unmapped)</dt>
            <dd>
              {h.ammSwaps?.toLocaleString()} ({h.unmappedAmm})
            </dd>
            <dt>Reserve convention</dt>
            <dd>{h.ammReserveConvention}</dd>
            <dt>Wallets / smart</dt>
            <dd>
              {h.wallets?.toLocaleString()} / {h.smartWallets}
            </dd>
            <dt>Outcomes tracking / resolved</dt>
            <dd>
              {h.hypotheticalsOpen?.toLocaleString()} / {h.samplesResolved?.toLocaleString()}
            </dd>
            <dt>Errors · bad events</dt>
            <dd>
              {h.errors} · {h.badEvents}
            </dd>
            <dt>Event-loop lag</dt>
            <dd>{h.loopLagMs ?? 0} ms</dd>
            <dt>Memory · disk</dt>
            <dd>
              {h.memMb ?? "?"} MB · {h.diskMb ?? "?"} MB
            </dd>
          </dl>
        </div>
        <div class="card">
          <h2>Server configuration</h2>
          <dl class="kv">
            {Object.entries(h.config ?? {}).map(([k, v]) => (
              <>
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
              </>
            ))}
          </dl>
        </div>
      </div>
      <div class="card">
        <h2>Recent log</h2>
        <div class="tablewrap" style="max-height:340px;overflow-y:auto">
          <table>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td class="faint num">{clock(l.ts)}</td>
                  <td>
                    <Tag tone={l.level === "error" ? "bad" : l.level === "warn" ? "warn" : undefined}>{l.level}</Tag>
                  </td>
                  <td style="white-space:normal">{l.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Setup() {
  return (
    <div class="card" style="margin-top:12px">
      <h2>How it works</h2>
      <p style="margin-top:0">
        The bot runs on a computer that stays on — yours, a VPS or a cloud container — not in this page. Closing the browser or locking your phone does not stop it; Telegram keeps
        you posted when you are away.
      </p>
      <p class="muted" style="font-size:13px;margin-bottom:0">
        Live orders are built by PumpPortal's local API (0.5% fee), signed on your computer (the key never leaves it), sent through your RPC and confirmed; the real fill is read
        back from the chain. Four errors in a row or the daily limit pause live entries; exits always go through. A stop loss is a market sell, not a guarantee: in a rug the fill
        can land far below it.
      </p>
    </div>
  );
}
