import type { Position } from "../../core/positions";
import { ago, age, mcap, sol } from "../format";
import { api, toast, useApp } from "../store";
import { Empty, Spark, Stat, Tag } from "../ui";

const REASON: Record<string, string> = {
  tp: "take profit",
  sl: "stop loss",
  trail: "trailing stop",
  initials: "stake back",
  time: "max hold time",
  dead: "coin went quiet",
  manual: "closed by you",
  kill: "kill switch",
  external: "not in wallet",
};

export function Trades({ open }: { open: (mint: string) => void }) {
  const a = useApp((s) => s.account);
  const solUsd = useApp((s) => s.solUsd);
  if (!a) return <Empty>Loading…</Empty>;
  const closedDone = a.closed.filter((p) => p.status === "closed");
  const winRate = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : NaN;
  return (
    <div>
      <div class="section-title">
        <h2>{a.mode === "live" ? "Live trading" : "Paper trading"}</h2>
        <span class="muted">{a.mode === "live" ? "real SOL" : "simulated fills on the real order flow"}</span>
      </div>
      <div class="card">
        <div class="stats">
          <Stat k={a.mode === "live" ? "Realized" : "Paper equity"} v={a.mode === "live" ? `${sol(a.realized)} SOL` : `${sol(a.equity)} SOL`} s={a.mode === "live" ? undefined : `cash ${sol(a.paperBalance)} + open ${sol(a.openValue)}`} />
          <Stat k="Today" v={`${a.dayPnl >= 0 ? "+" : ""}${sol(a.dayPnl)} SOL`} tone={a.dayPnl > 0 ? "good" : a.dayPnl < 0 ? "bad" : ""} />
          <Stat k="All time" v={`${a.realized >= 0 ? "+" : ""}${sol(a.realized)} SOL`} tone={a.realized > 0 ? "good" : a.realized < 0 ? "bad" : ""} s={`fees paid ${sol(a.fees)} SOL`} />
          <Stat k="Win rate" v={Number.isFinite(winRate) ? `${(winRate * 100).toFixed(0)}%` : "—"} s={`${a.wins} won · ${a.losses} lost`} />
        </div>
        <div style="margin-top:10px">
          <Spark points={a.equityCurve} />
        </div>
      </div>

      <div class="section-title">
        <h2>Open positions</h2>
        <span class="muted num">{a.open.length}</span>
      </div>
      {a.open.length === 0 ? (
        <Empty>No open positions. When a coin reaches your score, the bot buys it here.</Empty>
      ) : (
        <div class="list">
          {a.open.map((p) => (
            <OpenCard key={p.id} p={p} solUsd={solUsd} open={open} />
          ))}
        </div>
      )}

      <div class="section-title">
        <h2>Closed</h2>
        <span class="muted num">{closedDone.length} recent</span>
      </div>
      {a.closed.length === 0 ? (
        <Empty>Closed trades appear here with their exit reason and result after fees.</Empty>
      ) : (
        <div class="card flat" style="padding:4px 8px">
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Exit</th>
                  <th class="r">Score</th>
                  <th class="r">Held</th>
                  <th class="r">Result</th>
                </tr>
              </thead>
              <tbody>
                {a.closed.map((p) => (
                  <tr key={p.id} style="cursor:pointer" onClick={() => open(p.mint)}>
                    <td>
                      <b>${p.symbol || "?"}</b> <span class="faint">{p.mode === "live" ? "live" : ""}</span>
                    </td>
                    <td>{p.status === "failed" ? <Tag tone="warn">not filled · {p.exitReason}</Tag> : REASON[p.exitReason ?? ""] ?? p.exitReason}</td>
                    <td class="r num">{Math.round(p.signalScore)}</td>
                    <td class="r num">{p.closedAt ? age((p.closedAt - p.openedAt) / 1000) : "—"}</td>
                    <td class={`r num ${(p.pnl ?? 0) > 0 ? "good" : (p.pnl ?? 0) < 0 ? "bad" : ""}`}>
                      {p.status === "failed" ? "—" : `${(p.pnlPct ?? 0) >= 0 ? "+" : ""}${(p.pnlPct ?? 0).toFixed(1)}%`}
                      <div class="faint" style="font-size:11px">{p.status === "failed" ? "" : `${sol(p.pnl ?? 0)} SOL`}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OpenCard({ p, solUsd, open }: { p: Position; solUsd: number; open: (m: string) => void }) {
  const mult = p.cost > 0 ? (p.proceeds + p.value) / p.cost : 1;
  const pnl = (mult - 1) * 100;
  const tp = p.plan.tpPct;
  const sl = p.plan.slPct;
  // position of the current result between the stop (left) and the target (right)
  const span = tp + sl;
  const at = Math.min(1, Math.max(0, (pnl + sl) / span));
  const close = async () => {
    try {
      await api(`/api/positions/${encodeURIComponent(p.id)}/close`, {});
      toast("Sell order sent");
    } catch (e) {
      toast(String((e as Error).message));
    }
  };
  return (
    <div class="card flat">
      <div class="row">
        <button class="btn ghost" style="padding:0;min-height:0;text-align:left;flex:1" onClick={() => open(p.mint)}>
          <div style="font-weight:760;font-size:15px">
            ${p.symbol || "?"} <span class="faint" style="font-weight:500;font-size:12.5px">{p.name}</span>
          </div>
          <div class="muted num" style="font-size:12.5px">
            {p.status === "opening" ? "buying…" : p.status === "closing" ? "selling…" : `held ${age((Date.now() - p.openedAt) / 1000)}`} · score {Math.round(p.signalScore)} · in at {mcap(p.entryMcapSol || p.signalMcapSol, solUsd)}
            {p.tpHit ? " · trailing" : ""}
          </div>
        </button>
        <div style="text-align:right">
          <div class={`num ${pnl >= 0 ? "good" : "bad"}`} style="font-size:19px;font-weight:780">
            {p.status === "opening" ? "…" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`}
          </div>
          <div class="faint num" style="font-size:12px">{sol(p.cost)} SOL in</div>
        </div>
      </div>
      <div style="margin-top:10px">
        <div class="row faint num" style="justify-content:space-between;font-size:11.5px">
          <span>SL −{sl}%</span>
          <span>entry</span>
          <span>TP +{tp}%</span>
        </div>
        <div class="cbar" style="margin-top:4px;height:10px">
          <span class="mid" style={{ left: `${(sl / span) * 100}%` }} />
          <i style={{ left: `calc(${at * 100}% - 5px)`, width: "10px", background: pnl >= 0 ? "var(--good)" : "var(--bad)", borderRadius: "5px" }} />
        </div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <span class="faint" style="font-size:12px">
          {p.notes.slice(-1)[0] ?? `opened ${ago(p.openedAt)}`}
        </span>
        <button class="btn sm" disabled={p.status !== "open"} onClick={close}>
          Sell now
        </button>
      </div>
    </div>
  );
}
