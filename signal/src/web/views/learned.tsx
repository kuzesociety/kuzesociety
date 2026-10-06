import { useEffect, useState } from "preact/hooks";
import { FEATURE_KEYS } from "../../core/features";
import type { FreshCheck, LearnRun, LearningView } from "../../core/insight";
import type { Driver } from "../../core/model";
import { ago, num, pct } from "../format";
import { api, toast } from "../store";
import { Tag } from "../ui";

type Stage = "curve" | "amm";
const STAGE_NAME: Record<Stage, string> = { curve: "Bonding curve", amm: "Graduated" };

function recipeText(recipe: string | undefined, trees: number | undefined): string {
  if (recipe === "trees") return `weighted sum + ${trees ?? 0} trees`;
  if (recipe === "linear") return "weighted sum";
  return "starting assumptions";
}

/** What the scoring model has learned, whether it still works, and what each learning run did. */
export function WhatItLearned() {
  const [v, setV] = useState<LearningView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("curve");
  const load = () =>
    api<{ view: LearningView | null }>("/api/learning")
      .then((x) => {
        setV(x.view);
        setErr("");
      })
      .catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  const retrain = async () => {
    setBusy(true);
    try {
      const res = await api<{ reports: { adopted: boolean }[] }>("/api/learn/run", {});
      toast(res.reports.some((x) => x.adopted) ? "The bot switched to a better score" : "Current score kept — see the history below");
      await load();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (!v) {
    return (
      <div class="card" style="margin-top:12px">
        <h2>What the bot learned</h2>
        <p class="faint note">{err || "Loading…"}</p>
      </div>
    );
  }
  const m = v.model;
  const trained = m.source === "trained";
  const rows = (m.rows.curve?.total ?? 0) + (m.rows.amm?.total ?? 0);
  const entries = (m.rows.curve?.entries ?? 0) + (m.rows.amm?.entries ?? 0);
  const stagesWithDrivers = (["curve", "amm"] as Stage[]).filter((s) => v.drivers[s]?.length);
  const shown: Stage = v.drivers[stage]?.length ? stage : (stagesWithDrivers[0] ?? "curve");
  return (
    <div class="card" style="margin-top:12px">
      <div class="row" style="align-items:flex-start">
        <div style="flex:1">
          <h2 style="margin-bottom:4px">What the bot learned</h2>
          <div class="learn-head">
            {trained ? (
              <>
                Score retrained {ago(m.createdAt)} on its own outcomes
                {rows > 0 && (
                  <>
                    {" "}
                    — {num(rows)} moments, {num(entries)} of them the moment a coin first reached a score (when the bot buys)
                  </>
                )}
                .
              </>
            ) : (
              <>
                Still on its starting assumptions.{" "}
                {v.status.everyHours > 0
                  ? `It learns once enough outcomes have finished: first try 20 min after start, then every ${v.status.everyHours} h.`
                  : "It learns when you tap Retrain now, once enough outcomes have finished (the server does this by itself every few hours)."}
              </>
            )}
          </div>
        </div>
        <button class="btn sm" disabled={busy || v.status.running} onClick={retrain}>
          {busy || v.status.running ? "Learning…" : "Retrain now"}
        </button>
      </div>
      <div class="chips" style="margin-top:10px">
        {(["curve", "amm"] as Stage[]).map((s) => (
          <Tag key={s} tone={m.recipe[s] === "trees" ? "good" : m.recipe[s] === "linear" ? "flare" : undefined}>
            {STAGE_NAME[s]}: {recipeText(m.recipe[s], m.trees[s])}
          </Tag>
        ))}
      </div>
      <p class="faint note">
        The score is a weighted sum of {FEATURE_KEYS.length} signals; with enough data, small decision trees are added on top to learn combinations a sum cannot (say, heavy buying <i>but</i> the dev already
        sold). A new score replaces the current one only if it predicts newer coins — that neither of them has seen — better. After every retrain, 50 is still a
        typical coin moment and 75 the top 5%, so your minimum score picks about the same share of coins — better ones as the ranking improves.
      </p>

      <h3 class="learn-sub">Is the score still working?</h3>
      {v.fresh.map((f) => (
        <Fresh key={f.stage} f={f} />
      ))}

      {stagesWithDrivers.length > 0 && (
        <>
          <div class="row" style="margin-top:14px;align-items:center">
            <h3 class="learn-sub" style="flex:1;margin:0">What moves the score now</h3>
            {stagesWithDrivers.length > 1 && (
              <div class="chips">
                {stagesWithDrivers.map((s) => (
                  <button key={s} class="chip" aria-pressed={shown === s} onClick={() => setStage(s)}>
                    {STAGE_NAME[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Drivers list={v.drivers[shown] ?? []} />
          <p class="faint note">
            Measured on the last {num(v.driverCoins[shown] ?? 0)} coins. ↑ more of it raises the score · ↓ lowers it · ↕ depends on the other signals.
            Bars: share of the score's movement; "at start" is the share the starting assumptions gave it.
          </p>
        </>
      )}

      <History runs={v.history} status={v.status} />
    </div>
  );
}

function Fresh({ f }: { f: FreshCheck }) {
  const where = STAGE_NAME[f.stage as Stage];
  if (f.verdict === "not_enough") {
    return (
      <div class="fresh">
        <div>
          <b>{where}</b> <span class="faint">· checking</span>
        </div>
        <div class="faint" style="font-size:12.5px">
          {num(f.n)} finished outcomes of coins this score has not seen ({num(f.wins)} wins). The check needs 150 with 10 wins; each outcome is followed until it resolves (up to 6 h).
        </div>
      </div>
    );
  }
  const tone = f.verdict === "working" ? "good" : f.verdict === "slipping" ? "warn" : "bad";
  const word = f.verdict === "working" ? "working" : f.verdict === "slipping" ? "weaker" : "not working";
  const bands = f.bands.filter((b) => b.n > 0);
  return (
    <div class="fresh">
      <div class="row" style="gap:8px">
        <b>{where}</b>
        <Tag tone={tone}>{word}</Tag>
      </div>
      <div style="font-size:13px">
        On <b class="num">{num(f.n)}</b> coins it had not seen, the score ranked a winner above a loser <b class="num">{pct(f.auc)}</b> of the time
        {Number.isFinite(f.expected) ? ` (${pct(f.expected)} when it was adopted)` : ""}; 50% would be a coin toss. The top fifth by score won {pct(f.topWinRate)}, all of them{" "}
        {pct(f.winRate)}.
      </div>
      {bands.length > 1 && (
        <details class="more">
          <summary>Promised vs. delivered, by score</summary>
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th class="r">Moments</th>
                  <th class="r">Win chance it gave</th>
                  <th class="r">Actually won</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.lo}>
                    <td class="num">
                      {b.lo}–{b.hi}
                    </td>
                    <td class="r num">{num(b.n)}</td>
                    <td class="r num">{pct(b.predicted, 1)}</td>
                    <td class={`r num ${b.n >= 30 && Math.abs(b.actual - b.predicted) > 0.1 ? "warn" : ""}`}>{pct(b.actual, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Drivers({ list }: { list: Driver[] }) {
  const max = Math.max(0.01, ...list.map((d) => d.share));
  return (
    <div class="drivers">
      {list.map((d) => {
        const arrow = d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "↕";
        const moved = d.priorShare !== undefined && Math.abs(d.share - d.priorShare) >= 0.04;
        return (
          <div class="driver" key={d.key}>
            <span class={`arrow ${d.dir === "up" ? "good" : d.dir === "down" ? "bad" : "muted"}`} aria-label={d.dir}>
              {arrow}
            </span>
            <span>{d.label}</span>
            <span class="num faint">{pct(d.share)}</span>
            <div class="bar">
              <i style={{ width: `${Math.round((d.share / max) * 100)}%` }} />
            </div>
            {moved && (
              <span class="was faint">
                {d.share > d.priorShare! ? "learned it matters more" : "learned it matters less"} · at start {pct(d.priorShare)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TRIGGER: Record<LearnRun["trigger"], string> = { schedule: "scheduled", manual: "by hand", drift: "score weakened", start: "after start" };

function History({ runs, status }: { runs: LearnRun[]; status: LearningView["status"] }) {
  const mins = Math.max(1, Math.round((status.nextRun - Date.now()) / 60_000));
  const next = status.nextRun > Date.now() ? ` · next run in ${mins >= 120 ? `${Math.round(mins / 60)} h` : `${mins} min`}` : "";
  return (
    <details class="more" style="margin-top:14px">
      <summary>
        Learning history ({runs.length}){next}
      </summary>
      {status.lastError && <p class="bad note">Last run failed: {status.lastError}</p>}
      {!runs.length && <p class="faint note">No learning run yet.</p>}
      {[...runs].reverse().map((r) => (
        <div class="edge" key={r.at}>
          <div class="row" style="gap:8px">
            <b>{new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</b>
            <Tag tone={r.adopted ? "good" : undefined}>{r.adopted ? "switched to a better score" : "kept the score"}</Tag>
            <span class="faint" style="font-size:12px">
              {TRIGGER[r.trigger] ?? r.trigger} · {num(r.rows)} moments · {(r.ms / 1000).toFixed(1)} s
            </span>
          </div>
          {r.stages.map((s) => (
            <div key={s.stage} class="faint" style="font-size:12.5px">
              {STAGE_NAME[s.stage as Stage]}: {s.reason}
              {s.fresh > 0 && Number.isFinite(s.after.auc) && (
                <>
                  {" "}
                  · ranking on unseen coins {pct(s.before.auc)} → {pct(s.after.auc)}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </details>
  );
}
