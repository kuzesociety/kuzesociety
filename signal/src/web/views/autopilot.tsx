import { useEffect, useState } from "preact/hooks";
import type { AutopilotView } from "../../core/autopilot";
import type { Settings } from "../../core/settings";
import { ago, pct } from "../format";
import { api, refreshState, toast } from "../store";
import { Switch, Tag } from "../ui";

type Rule = AutopilotView["log"][number]["rules"][number];

/** The autopilot: on/off, the rule it trades and why, the ranking, your own rule's evidence, and its decisions — each rule one click away. */
export function Autopilot({ settings }: { settings: Settings }) {
  const [v, setV] = useState<AutopilotView | null | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  /** the rule waiting for a second tap (real money) */
  const [confirmRule, setConfirmRule] = useState<string | null>(null);
  const load = () =>
    api<{ view: AutopilotView | null }>("/api/autopilot")
      .then((x) => setV(x.view))
      .catch(() => setV(null));
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [settings.autopilot, settings.mode, settings.minScore, settings.entryAt, settings.tpPct, settings.slPct, settings.maxHoldMin]);
  // your pick is being measured on the recordings: look again shortly
  useEffect(() => {
    if (!v?.own || !("measuring" in v.own)) return;
    const t = setTimeout(load, 4_000);
    return () => clearTimeout(t);
  }, [v]);
  const live = settings.mode === "live";
  const useRule = async (r: Pick<Rule, "text" | "settings">, key: string) => {
    if (live && confirmRule !== key) {
      setConfirmRule(key);
      return;
    }
    setBusy(true);
    try {
      await api("/api/settings", r.settings);
      setConfirmRule(null);
      toast(
        settings.autopilot
          ? "Using it. The autopilot stays on: it keeps this rule unless a proven rule does clearly better."
          : settings.enabled
            ? "Using it for new trades."
            : "Rule set. Switch Auto-trading on to start.",
      );
      void refreshState();
      void load();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
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
            practice. A rule you pick yourself competes too: it stays unless a proven rule does clearly better. It changes the rule only — never your trade size, limits or mode.
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
      {v && (settings.autopilot || v.log.length > 0) && <Status v={v} on={settings.autopilot} use={useRule} busy={busy} confirmRule={confirmRule} />}
      {!settings.autopilot && <p class="faint note">Off: the bot trades the rule set below. Turning it on lets it pick the best proven rule by itself — your own rule competes with them.</p>}
    </div>
  );
}

/** A button that puts a rule in use (or says it is). */
function UseButton({ r, id, use, busy, confirmRule }: { r: Pick<Rule, "text" | "settings" | "inUse">; id: string; use: (r: Pick<Rule, "text" | "settings">, key: string) => void; busy: boolean; confirmRule: string | null }) {
  if (r.inUse) return <Tag tone="flare">in use</Tag>;
  return (
    <button class={`btn sm ${confirmRule === id ? "danger" : ""}`} disabled={busy} onClick={() => use(r, id)} title={r.text}>
      {confirmRule === id ? "Tap again — real money" : "Use this rule"}
    </button>
  );
}

function Status({ v, on, use, busy, confirmRule }: { v: AutopilotView; on: boolean; use: (r: Pick<Rule, "text" | "settings">, key: string) => void; busy: boolean; confirmRule: string | null }) {
  const own = v.own;
  return (
    <div style="margin-top:10px">
      {!on ? null : v.holding ? (
        <div class="entrymoment warn">
          ⏸ <b>New live entries wait:</b> {v.holdReason}. Open positions are still managed.
        </div>
      ) : v.active && v.proof ? (
        <div class="entrymoment good">
          <b>Trading:</b> {v.active}
          <div style="font-size:12.5px;margin-top:2px">
            Since {ago(v.since)} · it showed {pct(v.proof.mean, 1, true)} per trade on {v.proof.n} trades the search never saw (worst case {pct(v.proof.lo, 1, true)}).
            {v.forward
              ? ` On the ${v.forward.n} coins that qualified since: ${pct(v.forward.mean, 1, true)} per trade.`
              : " Judged on its own trades and on the coins that qualify after it, as they finish."}
            {!v.relisted && v.reportAt > v.since && " The last search did not list it again — that alone is not evidence against it, so it stays until its results say otherwise."}
          </div>
        </div>
      ) : (
        <div class="entrymoment">
          <b>On your own rule</b> ({v.rule}) — a proven rule replaces it only when it does clearly better{v.reportAt ? ` · last search ${ago(v.reportAt)}` : ""}.
          <div style="font-size:12.5px;margin-top:2px">
            {!own
              ? null
              : "measuring" in own
                ? "Measuring your rule on the recordings…"
                : "why" in own
                  ? `Nothing to weigh it by yet: ${own.why}. Until then any proven rule replaces it; its own trades count once it has 30.`
                  : own.from === "trades"
                    ? `Weighed by its own ${own.n} trades: ${pct(own.mean, 1, true)} each (at least ${pct(own.lo, 1, true)}), ~${own.perDay.toFixed(0)} a day — at least ~${own.worstSolPerDay.toFixed(2)} SOL a day at your size.`
                    : `Weighed on the newest recordings, the part the search checks its candidates on: ${pct(own.mean, 1, true)} per trade on ${own.n} coins (at least ${pct(own.lo, 1, true)}), ~${own.perDay.toFixed(0)} trades a day at your limits — at least ~${own.worstSolPerDay.toFixed(2)} SOL a day at your size.`}
          </div>
        </div>
      )}
      {on && v.ranking.length > 0 && (
        <details class="more">
          <summary>Proven rules, best first ({v.ranking.length})</summary>
          <p class="faint" style="font-size:12.5px;margin:0 0 6px">
            Ranked by what each would earn per day at your size and limits, counted from its worst case on unseen data.{!v.trusted && " The last search is not used right now: it is too old, was made by an older version of the bot, or its luck check found rules on shuffled data."}
          </p>
          {v.ranking.map((r) => (
            <div class="edge" key={r.text}>
              <div class="row wrap" style="gap:6px">
                <span class="edge-rule" style="flex:1;min-width:0">{r.text}</span>
                {v.live && (r.liveGrade ? <Tag tone="good">real-money grade</Tag> : <Tag>paper only</Tag>)}
                {r.benchedUntil > Date.now() && <Tag tone="bad">benched</Tag>}
                <UseButton r={r} id={`rank:${r.text}`} use={use} busy={busy} confirmRule={confirmRule} />
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
          <p class="faint" style="font-size:12.5px;margin:0 0 6px">
            One click puts a rule back in use.{on ? " The autopilot stays on: it keeps your pick unless a proven rule does clearly better." : ""} The numbers in a decision are what was known then.
          </p>
          {v.log.map((x) => (
            <div class="edge" key={x.at + x.what}>
              <div class="faint" style="font-size:12px">{new Date(x.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div style="font-size:13px">{x.what}</div>
              {x.rules.map((r, i) => (
                <div class="row wrap" style="gap:6px;margin-top:4px" key={i}>
                  {x.rules.length > 1 && <span class="faint" style="font-size:12.5px;flex:1;min-width:0">{r.text}</span>}
                  <UseButton r={r} id={`log:${x.at}:${i}`} use={use} busy={busy} confirmRule={confirmRule} />
                </div>
              ))}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
