import { useEffect, useState } from "preact/hooks";
import { age, clock, mcap, pct, short, sol } from "../format";
import { REASON_TEXT } from "../../core/funnel";
import { api, useApp } from "../store";
import { ext } from "../ext";
import { Empty, Score, Tag } from "../ui";

export function TokenSheet({ mint, close }: { mint: string; close: () => void }) {
  const solUsd = useApp((s) => s.solUsd);
  const settings = useApp((s) => s.settings);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () =>
      api(`/api/token/${encodeURIComponent(mint)}`)
        .then((x) => alive && setD(x))
        .catch((e) => alive && setErr(String(e.message ?? e)));
    load();
    const t = setInterval(load, 3000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("keydown", esc);
    };
  }, [mint]);

  const score = d?.score;
  const maxPts = Math.max(8, ...(score?.contributions ?? []).map((c: any) => Math.abs(c.points)));
  return (
    <div class="sheet-bg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="coin details">
        <div class="grab" />
        {!d && !err && <Empty>Loading…</Empty>}
        {err && <Empty>{err}</Empty>}
        {d && (
          <div class="grid">
            <div class="row" style="align-items:flex-start">
              {score && <Score value={score.score} small={d.stage === "amm" ? "DEX" : "CURVE"} />}
              <div style="flex:1;min-width:0">
                <div style="font-size:19px;font-weight:780">${d.symbol || "?"}</div>
                <div class="muted" style="overflow:hidden;text-overflow:ellipsis">{d.name}</div>
                <div class="chips" style="margin-top:6px">
                  <Tag>{d.stage === "curve" ? `curve ${pct(d.progress)}` : d.stage === "amm" ? "graduated · PumpSwap" : "migrating"}</Tag>
                  {score?.calibrated && <Tag tone="good">P(win) {pct(score.p)}</Tag>}
                  {d.narrative?.clusterSize > 1 && <Tag tone={d.narrative.isLeader ? "good" : "bad"}>{d.narrative.isLeader ? "leads" : "follows"} a {d.narrative.clusterSize}-coin narrative</Tag>}
                  {d.partial && <Tag tone="warn">joined late</Tag>}
                </div>
              </div>
              <button class="btn ghost" onClick={close} aria-label="close">
                ✕
              </button>
            </div>

            <EntryMoment d={d} threshold={settings?.minScore ?? 75} enabled={!!settings?.enabled} />

            <div class="stats">
              <div class="stat">
                <div class="k">Market cap</div>
                <div class="v num">{mcap(d.mcapSol, solUsd)}</div>
                {solUsd > 0 && <div class="s num">{d.mcapSol.toFixed(1)} SOL</div>}
              </div>
              <div class="stat">
                <div class="k">Peak</div>
                <div class="v num">{mcap(d.athMcapSol, solUsd)}</div>
                <div class="s num">{d.mcapSol > 0 ? `${((d.mcapSol / d.athMcapSol - 1) * 100).toFixed(0)}% from peak` : ""}</div>
              </div>
              <div class="stat">
                <div class="k">Age</div>
                <div class="v num">{age((Date.now() - d.createdAt) / 1000)}</div>
              </div>
              <div class="stat">
                <div class="k">Holders</div>
                <div class="v num">{d.concentration?.holders ?? "—"}</div>
                <div class="s">top10 {pct(d.concentration?.top10)}</div>
              </div>
            </div>

            <div class="row wrap" style="gap:8px">
              {ext.demo ? (
                <span class="faint" style="font-size:12.5px">Simulated coin — no explorer links in the demo.</span>
              ) : (
                <>
                  <a class="btn sm" href={`https://pump.fun/coin/${d.mint}`} target="_blank" rel="noopener">
                    pump.fun
                  </a>
                  <a class="btn sm" href={`https://dexscreener.com/solana/${d.mint}`} target="_blank" rel="noopener">
                    DexScreener
                  </a>
                  <a class="btn sm" href={`https://solscan.io/token/${d.mint}`} target="_blank" rel="noopener">
                    Solscan
                  </a>
                  {d.meta?.twitter && (
                    <a class="btn sm" href={d.meta.twitter} target="_blank" rel="noopener">
                      X / Twitter
                    </a>
                  )}
                  {d.meta?.telegram && (
                    <a class="btn sm" href={d.meta.telegram} target="_blank" rel="noopener">
                      Telegram
                    </a>
                  )}
                </>
              )}
              <button
                class="btn sm"
                onClick={() => {
                  navigator.clipboard?.writeText(d.mint).catch(() => {});
                }}
              >
                Copy address
              </button>
            </div>

            {score && (
              <div class="card flat">
                <h3>Why this score</h3>
                <div class="contrib">
                  {score.contributions.map((c: any) => (
                    <>
                      <div>
                        <div style="font-weight:650">
                          {c.label} <span class="faint num">· {c.value}</span>
                        </div>
                        <div class="cbar" aria-hidden="true">
                          <span class="mid" />
                          <i
                            style={{
                              left: c.points >= 0 ? "50%" : `${50 - (Math.abs(c.points) / maxPts) * 50}%`,
                              width: `${(Math.abs(c.points) / maxPts) * 50}%`,
                              background: c.points >= 0 ? "var(--good)" : "var(--bad)",
                            }}
                          />
                        </div>
                      </div>
                      <div class={`num ${c.points >= 0 ? "good" : "bad"}`} style="text-align:right">
                        {c.points >= 0 ? "+" : ""}
                        {c.points.toFixed(1)} pts
                        <div class="faint" style="font-size:11px">{c.note}</div>
                      </div>
                    </>
                  ))}
                </div>
              </div>
            )}

            <div class="grid two">
              <div class="card flat">
                <h3>Top holders</h3>
                {d.holders.length === 0 ? (
                  <Empty>No holders tracked yet.</Empty>
                ) : (
                  <div class="tablewrap">
                    <table>
                      <tbody>
                        {d.holders.map((h: any) => (
                          <tr key={h.addr}>
                            <td class="mono">
                              <a href={ext.demo ? undefined : `https://solscan.io/account/${h.addr}`} target="_blank" rel="noopener">
                                {short(h.addr)}
                              </a>
                            </td>
                            <td>
                              {h.dev && <Tag tone="bad">dev</Tag>} {h.bundle && <Tag tone="bad">bundle</Tag>} {h.early && !h.bundle && <Tag tone="warn">sniper</Tag>} {h.smart && <Tag tone="good">smart</Tag>}
                            </td>
                            <td class="r num">{h.pct.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div class="card flat">
                <h3>Latest trades</h3>
                <div class="tablewrap" style="max-height:320px;overflow-y:auto">
                  <table>
                    <tbody>
                      {d.trades.map((t: any, i: number) => (
                        <tr key={i}>
                          <td class="faint num">{clock(t.ts)}</td>
                          <td class={t.buy ? "good" : "bad"}>{t.buy ? "buy" : "sell"}</td>
                          <td class="r num">{t.sol.toFixed(3)} SOL</td>
                          <td class="mono faint">{short(t.user)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {d.creatorStats && (
              <div class="card flat">
                <h3>Dev</h3>
                <dl class="kv">
                  <dt>Wallet</dt>
                  <dd class="mono">
                    <a href={ext.demo ? undefined : `https://solscan.io/account/${d.creator}`} target="_blank" rel="noopener">
                      {short(d.creator)}
                    </a>
                  </dd>
                  <dt>Launches (24h / seen)</dt>
                  <dd>
                    {d.creatorStats.launches24h} / {d.creatorStats.launches}
                  </dd>
                  <dt>Best previous coin</dt>
                  <dd>{d.creatorStats.best ? `${d.creatorStats.best.toFixed(0)} SOL mcap` : "—"}</dd>
                  <dt>Dev holds / sold</dt>
                  <dd>
                    {pct(d.features?.devShare, 1)} / {pct(d.features?.devSold)}
                  </dd>
                </dl>
              </div>
            )}

            {d.positions?.length > 0 && (
              <div class="card flat">
                <h3>Your trades on this coin</h3>
                {d.positions.map((p: any) => (
                  <div key={p.id} class="row" style="justify-content:space-between;padding:6px 0">
                    <span>
                      {p.mode} · {p.status} {p.exitReason ? `· ${p.exitReason}` : ""}
                    </span>
                    <span class={`num ${(p.pnl ?? p.proceeds + p.value - p.cost) >= 0 ? "good" : "bad"}`}>{sol((p.pnl ?? p.proceeds + p.value - p.cost) || 0)} SOL</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** When the coin reached the user's score and what the bot did — answers "why didn't it buy?". */
function EntryMoment({ d, threshold, enabled }: { d: any; threshold: number; enabled: boolean }) {
  const en = d.entry;
  if (!en) return null;
  const sig = en.signals?.[en.signals.length - 1]; // latest (the score scale can re-arm coins once, after calibration)
  const score = d.score?.score ?? 0;
  let tone = "";
  let text: string;
  if (sig) {
    const what =
      sig.decision === "entered"
        ? "the bot bought it"
        : sig.decision === "pending"
          ? "the bot is buying it"
          : sig.decision === "failed"
          ? `the buy failed (${sig.reason ?? "no fill"})`
          : `not bought — ${REASON_TEXT[sig.reason] ?? sig.reason}`;
    tone = sig.decision === "entered" || sig.decision === "pending" ? "good" : "warn";
    text = `Entry moment at ${clock(sig.ts)}, score ${Math.round(sig.score)}: ${what}. Each coin gets one entry moment.`;
  } else if (en.spent) {
    text = "Its entry moment has passed (before the current settings, or before this session). Each coin gets one.";
  } else if (score >= threshold) {
    tone = "good";
    text = enabled ? `At your score — buying once it holds ${en.need} evaluations in a row (${en.above}/${en.need}).` : "At your score, but auto-trading is paused.";
  } else {
    text = `Below your score of ${threshold}. If it gets there and holds, that is its entry moment.`;
  }
  return (
    <div class={`entrymoment ${tone}`} role="status">
      {text}
    </div>
  );
}
