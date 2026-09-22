import { useEffect, useState } from "preact/hooks";
import type { LearnReport } from "../../core/report";
import { pct } from "../format";
import { api, toast, useApp } from "../store";
import { Empty, Tag } from "../ui";

export function Learn() {
  const settings = useApp((s) => s.settings);
  const health = useApp((s) => s.health);
  const [r, setR] = useState<LearnReport | null>(null);
  const [err, setErr] = useState("");
  const [training, setTraining] = useState(false);
  const load = () =>
    api<LearnReport>("/api/learn?days=14")
      .then(setR)
      .catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [settings?.minScore, settings?.tpPct, settings?.slPct]);

  if (err) return <Empty>{err}</Empty>;
  if (!r) return <Empty>Loading evidence…</Empty>;
  const maxAbs = Math.max(0.05, ...r.grid.filter((c) => c.n > 0).map((c) => Math.abs(c.avgRet)));
  return (
    <div>
      <div class="section-title">
        <h2>Does the score make money?</h2>
        <span class="muted num">
          {r.samples.toLocaleString()} resolved outcomes · {r.spanHours.toFixed(1)} h of data
        </span>
      </div>

      <div class={`card ${r.gate.pass ? "" : ""}`} style={`border-color:${r.gate.pass ? "var(--good)" : "var(--line)"}`}>
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div class="faint" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Go-live check · score ≥ {r.settings.minScore}, TP {r.settings.tpPct}%, SL {r.settings.slPct}%</div>
            <div style="font-size:19px;font-weight:780;margin:4px 0">{r.gate.verdict}</div>
            <div class="muted">{r.gate.detail}</div>
          </div>
          <Tag tone={r.gate.pass ? "good" : "warn"}>{r.gate.pass ? "evidence ✓" : "paper first"}</Tag>
        </div>
        <p class="faint" style="font-size:12.5px;margin:10px 0 0">
          Every eligible coin is followed from fixed checkpoints and at every signal, as if bought with your size and delay, until the target or the stop is hit. Break-even win rate at these
          settings ≈ <b>{pct(r.breakEven)}</b> (fees, delay and stop slippage included).
        </p>
      </div>

      {r.suggestion && (
        <div class="card" style="margin-top:12px;border-color:var(--flare)">
          <h2>Better settings found</h2>
          <p style="margin:0 0 10px">
            <b>
              Score ≥ {r.suggestion.minScore} · TP {r.suggestion.tpPct}% · SL {r.suggestion.slPct}%
            </b>{" "}
            — {r.suggestion.why}.
          </p>
          <div class="row wrap">
            <button
              class="btn primary"
              onClick={async () => {
                try {
                  await api("/api/settings", { minScore: r.suggestion!.minScore, tpPct: r.suggestion!.tpPct, slPct: r.suggestion!.slPct });
                  toast("Applied — new trades use these settings");
                  void load();
                } catch (e) {
                  toast(String((e as Error).message));
                }
              }}
            >
              Apply
            </button>
            <span class="faint" style="font-size:12.5px">Past results can stop working. Auto-tune can do this for you in paper mode (Bot → Advanced).</span>
          </div>
        </div>
      )}

      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <h2>Score buckets → outcome</h2>
          {r.checkpoints === 0 ? (
            <Empty>Outcomes resolve as coins hit their targets or stops — first rows appear within minutes, solid numbers take a few days.</Empty>
          ) : (
            <div class="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Score</th>
                    <th class="r">n</th>
                    <th class="r">Profitable</th>
                    <th class="r">Avg result</th>
                    <th class="r">95% range</th>
                  </tr>
                </thead>
                <tbody>
                  {[...r.buckets].reverse().map((b) => (
                    <tr key={b.lo} style={b.lo >= (settings?.minScore ?? 75) - 9 && b.lo <= 90 && b.lo + 10 > (settings?.minScore ?? 75) ? "background:var(--flare-soft)" : ""}>
                      <td class="num">
                        {b.lo}–{b.hi}
                      </td>
                      <td class="r num">{b.n}</td>
                      <td class="r num">{b.n ? pct(b.winRate) : "—"}</td>
                      <td class={`r num ${b.avgRet > 0 ? "good" : b.avgRet < 0 ? "bad" : ""}`}>{b.n ? pct(b.avgRet, 1, true) : "—"}</td>
                      <td class="r num faint">{b.n > 1 ? `${pct(b.retLo, 0, true)} … ${pct(b.retHi, 0, true)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div class="card">
          <h2>Pick a threshold</h2>
          <p class="faint" style="margin:0 0 8px;font-size:12.5px">
            {r.thresholdSource === "entries"
              ? "What happened after coins first reached each score — the moment the bot buys — with your TP/SL, delay and costs."
              : "For now: snapshots of coins above each score. Buying the moment a coin reaches a score usually does worse; this switches to real entry outcomes after 200 of them."}
          </p>
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Score ≥</th>
                  <th class="r">Coins/hour</th>
                  <th class="r">Profitable</th>
                  <th class="r">Avg result</th>
                </tr>
              </thead>
              <tbody>
                {r.thresholds.map((t) => (
                  <tr key={t.min} style={t.min === settings?.minScore ? "background:var(--flare-soft)" : ""}>
                    <td class="num">{t.min}</td>
                    <td class="r num">{Number.isFinite(t.tokensPerHour) ? t.tokensPerHour.toFixed(1) : "—"}</td>
                    <td class="r num">{t.n ? pct(t.winRate) : "—"}</td>
                    <td class={`r num ${t.avgRet > 0 ? "good" : t.avgRet < 0 ? "bad" : ""}`}>{t.n ? pct(t.avgRet, 1, true) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h2>Take profit × stop loss · coins scoring ≥ {r.settings.minScore}</h2>
        <p class="faint" style="margin:0 0 8px;font-size:12.5px">
          Average result per trade for each exit combination, delay and costs included, from{" "}
          {r.gridSource === "signals" ? "your own signals" : r.gridSource === "entries" ? "coins at the moment they first reached your score" : "snapshots of coins above your score (until entry data builds up)"}. Darker green =
          better; cells with fewer than 30 outcomes are faded.
        </p>
        <div class="tablewrap">
          <table class="heat">
            <thead>
              <tr>
                <th>TP \ SL</th>
                {[...new Set(r.grid.map((c) => c.sl))].map((sl) => (
                  <th key={sl} style="text-align:center">
                    −{sl}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(r.grid.map((c) => c.tp))].map((tp) => (
                <tr key={tp}>
                  <th>+{tp}%</th>
                  {r.grid
                    .filter((c) => c.tp === tp)
                    .map((c) => {
                      const a = Number.isFinite(c.avgRet) ? Math.min(1, Math.abs(c.avgRet) / maxAbs) : 0;
                      const bg = c.avgRet >= 0 ? `color-mix(in srgb,var(--good) ${Math.round(a * 45)}%,transparent)` : `color-mix(in srgb,var(--bad) ${Math.round(a * 45)}%,transparent)`;
                      const mine = c.tp === settings?.tpPct && c.sl === settings?.slPct;
                      return (
                        <td key={c.sl} style={{ background: c.n ? bg : "transparent", opacity: c.n < 30 ? 0.45 : 1, outline: mine ? "2px solid var(--flare)" : "none" }} title={`n=${c.n}, 95% ${pct(c.retLo, 1)} … ${pct(c.retHi, 1)}`}>
                          {c.n ? pct(c.avgRet, 1, true) : "—"}
                        </td>
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.best && (
          <p style="margin:10px 0 0">
            Most robust so far: <b>TP {r.best.tp}% / SL {r.best.sl}%</b> — average {pct(r.best.avgRet, 1, true)}, worst-case (95%) {pct(r.best.retLo, 1, true)} over {r.best.n} outcomes.
          </p>
        )}
      </div>

      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <h2>Your paper results</h2>
          <dl class="kv">
            <dt>Closed trades</dt>
            <dd>{r.paper.trades}</dd>
            <dt>Win rate</dt>
            <dd>{pct(r.paper.winRate)}</dd>
            <dt>Profit</dt>
            <dd class={r.paper.pnlSol >= 0 ? "good" : "bad"}>{r.paper.pnlSol.toFixed(3)} SOL</dd>
            <dt>Average trade</dt>
            <dd>{Number.isFinite(r.paper.avgPct) ? `${r.paper.avgPct.toFixed(1)}%` : "—"}</dd>
            <dt>Profit factor</dt>
            <dd>{Number.isFinite(r.paper.profitFactor) ? r.paper.profitFactor.toFixed(2) : "—"}</dd>
            <dt>Worst drawdown</dt>
            <dd>{r.paper.maxDrawdownSol.toFixed(3)} SOL</dd>
          </dl>
        </div>
        <div class="card">
          <h2>Scoring model</h2>
          <dl class="kv">
            <dt>Version</dt>
            <dd>{r.model.version}</dd>
            <dt>Source</dt>
            <dd>{r.model.source === "trained" ? "trained on this server's data" : "prior (market mechanics), self-scaled"}</dd>
            {r.model.training && (
              <>
                <dt>Validation AUC</dt>
                <dd>
                  {r.model.training.valAuc?.toFixed(3)} (was {r.model.training.priorValAuc?.toFixed(3)})
                </dd>
                <dt>Trained on</dt>
                <dd>{r.model.training.rows.toLocaleString()} outcomes</dd>
              </>
            )}
            <dt>Last training</dt>
            <dd>{health?.learner?.lastRun ? new Date(health.learner.lastRun).toLocaleString() : "not yet"}</dd>
          </dl>
          {(health?.learner?.reports?.length ?? 0) > 0 && (
            <ul class="muted" style="font-size:12.5px;padding-left:18px">
              {health!.learner.reports.map((x: any) => (
                <li key={x.stage}>
                  {x.stage}: {x.reason}
                </li>
              ))}
            </ul>
          )}
          <button
            class="btn sm"
            disabled={training}
            onClick={async () => {
              setTraining(true);
              try {
                const res = await api<{ reports: any[] }>("/api/learn/run", {});
                toast(res.reports.some((x) => x.adopted) ? "New model adopted" : "Current model kept");
                void load();
              } catch (e) {
                toast(String((e as Error).message));
              } finally {
                setTraining(false);
              }
            }}
          >
            {training ? "Training…" : "Retrain now"}
          </button>
          <p class="faint" style="font-size:12px;margin-bottom:0">
            The model retrains every few hours on outcomes recorded here and is swapped only when it beats the current one on newer data it did not train on.
          </p>
        </div>
      </div>
    </div>
  );
}
