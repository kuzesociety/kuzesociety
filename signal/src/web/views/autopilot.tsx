import { useEffect, useState } from "preact/hooks";
import type { AutopilotView } from "../../core/autopilot";
import type { Settings } from "../../core/settings";
import { ago, pct } from "../format";
import { api, refreshState, toast } from "../store";
import { Switch, Tag } from "../ui";

/** The autopilot: on/off, the rule it trades and why, the ranking, and its decisions. */
export function Autopilot({ settings }: { settings: Settings }) {
  const [v, setV] = useState<AutopilotView | null | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<{ view: AutopilotView | null }>("/api/autopilot")
      .then((x) => setV(x.view))
      .catch(() => setV(null));
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [settings.autopilot, settings.mode, settings.minScore, settings.entryAt, settings.tpPct]);
  const live = settings.mode === "live";
  const toggle = async (on: boolean) => {
    if (on && live && !confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await api("/api/settings", { autopilot: on });
      setConfirm(false);
      toast(on ? "Autopilot on — it trades the best proven rule" : "Autopilot off — the rule stays as it is");
      void refreshState();
      void load();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  // the in-page demo has no autopilot (it runs with the learning loop on the server)
  if (v === null) return null;
  return (
    <div class={`card ${settings.autopilot ? "autopilot-on" : ""}`} style="margin-top:12px">
      <div class="row" style="align-items:flex-start">
        <Switch id="autopilot" checked={settings.autopilot} label="Autopilot" disabled={busy} onChange={toggle} />
        <div style="flex:1">
          <div style="font-weight:760;font-size:16px">{settings.autopilot ? "Autopilot is on" : "Autopilot is off"}</div>
          <div class="muted" style="font-size:13px">
            Trades the best rule the edge finder proved on data it never saw, switches as soon as a clearly better one is proven, and drops a rule that stops working in
            practice. It changes the rule only — never your trade size, limits or mode.
          </div>
        </div>
        <Tag tone={settings.autopilot ? "good" : undefined}>{settings.autopilot ? "ON" : "OFF"}</Tag>
      </div>
      {confirm && (
        <div class="note" style="margin-top:10px">
          <b>You are trading real money.</b> With real money the autopilot only uses rules proven at the go-live bar and otherwise holds new entries.{" "}
          <button class="btn sm danger" disabled={busy} onClick={() => toggle(true)}>
            Turn on — real money
          </button>
        </div>
      )}
      {settings.autopilot && v && <Status v={v} />}
      {!settings.autopilot && <p class="faint note">Off: the bot trades the rule set below. Turning it on lets it pick the best proven rule by itself.</p>}
    </div>
  );
}

function Status({ v }: { v: AutopilotView }) {
  return (
    <div style="margin-top:10px">
      {v.holding ? (
        <div class="entrymoment warn">
          ⏸ <b>New live entries wait:</b> {v.holdReason}. Open positions are still managed.
        </div>
      ) : v.active && v.proof ? (
        <div class="entrymoment good">
          <b>Trading:</b> {v.active}
          <div style="font-size:12.5px;margin-top:2px">
            Since {ago(v.since)} · it showed {pct(v.proof.mean, 1, true)} per trade on {v.proof.n} trades the search never saw (worst case {pct(v.proof.lo, 1, true)}). Checked against its own
            trades as they close.
          </div>
        </div>
      ) : (
        <div class="entrymoment">
          <b>On your own rule</b> ({v.rule}) until a rule is proven on unseen data{v.reportAt ? ` — last search ${ago(v.reportAt)}` : ""}.
        </div>
      )}
      {v.ranking.length > 0 && (
        <details class="more">
          <summary>Proven rules, best first ({v.ranking.length})</summary>
          <p class="faint" style="font-size:12.5px;margin:0 0 6px">
            Ranked by what each would earn per day at your size and limits, counted from its worst case on unseen data.{!v.trusted && " The last search is not used right now: it is too old, was made by an older version of the bot, or its luck check found rules on shuffled data."}
          </p>
          {v.ranking.map((r) => (
            <div class="edge" key={r.text}>
              <div class="row wrap" style="gap:6px">
                <span class="edge-rule" style="flex:1;min-width:0">{r.text}</span>
                {r.active && <Tag tone="flare">in use</Tag>}
                {v.live && (r.liveGrade ? <Tag tone="good">real-money grade</Tag> : <Tag>paper only</Tag>)}
                {r.benchedUntil > Date.now() && <Tag tone="bad">benched</Tag>}
              </div>
              <div class="num faint" style="font-size:12.5px">
                worst case ~{r.worstSolPerDay.toFixed(2)} SOL/day · {pct(r.perTrade, 1, true)} per trade (worst {pct(r.worstPerTrade, 1, true)}) · {r.unseenTrades} unseen trades · ~
                {r.tradesPerDay.toFixed(0)} trades/day your limits allow
              </div>
            </div>
          ))}
        </details>
      )}
      {v.log.length > 0 && (
        <details class="more">
          <summary>Decisions ({v.log.length})</summary>
          {v.log.map((x) => (
            <div class="edge" key={x.at + x.what}>
              <div class="faint" style="font-size:12px">{new Date(x.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div style="font-size:13px">{x.what}</div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
