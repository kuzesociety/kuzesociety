import { useEffect, useState } from "preact/hooks";
import type { EdgeReport } from "../../core/edges";
import { type Preset, followsPreset, ruleSummary, strategyList } from "../../core/presets";
import { ENTRY_POINTS, type Settings, rebaseSettings, settingsChanges } from "../../core/settings";
import { ext } from "../ext";
import { api, refreshState, toast, useApp } from "../store";
import { Field, Hist, NumInput, Switch, Tag } from "../ui";

type Filters = Settings["filters"];

/**
 * Edits not saved yet, and the saved settings they started from. Kept when you switch tabs,
 * so edits are never dropped silently; saving sends only what you changed, so a switch made
 * meanwhile (auto-trading, a strategy, a Telegram command) is not undone.
 */
let kept: { draft: Settings; base: Settings } | null = null;

export function Bot() {
  const settings = useApp((s) => s.settings);
  const funnel = useApp((s) => s.funnelHour);
  const day = useApp((s) => s.funnelDay);
  const health = useApp((s) => s.health);
  const account = useApp((s) => s.account);
  const [draft, setDraft] = useState<Settings | null>(kept?.draft ?? settings);
  const [dirty, setDirty] = useState(kept !== null);
  const [busy, setBusy] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);

  useEffect(() => {
    if (!settings) return;
    if (!kept) {
      setDraft(settings);
      return;
    }
    // changed elsewhere while you were editing: keep your edits, take the rest
    const next = rebaseSettings(kept.draft, kept.base, settings);
    kept = { draft: next, base: settings };
    setDraft(next);
  }, [settings]);
  // leaving the page with unsaved edits asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!draft || !settings) return null;

  const edit = (next: Settings) => {
    kept = { draft: next, base: kept?.base ?? settings };
    setDraft(next);
    setDirty(true);
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => edit({ ...draft, [k]: v });
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => edit({ ...draft, filters: { ...draft.filters, [k]: v } });
  const discard = () => {
    kept = null;
    setDraft(settings);
    setDirty(false);
  };
  /** A quick switch (`patch`), or the edited form: only the fields you changed are sent. */
  const save = async (patch?: Partial<Settings>) => {
    setBusy(true);
    try {
      const body = patch ?? settingsChanges(draft, kept?.base ?? settings);
      const r = await api<{ settings: Settings }>("/api/settings", body);
      if (!patch) {
        kept = null;
        setDraft(r.settings);
        setDirty(false);
      }
      toast(patch ? "Updated" : "Saved — applies to new trades");
      void refreshState();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const liveAllowed = !!health?.live && !health.live.halted;
  // how many distinct coins reached a threshold, from the last 24h of per-coin best scores
  const coins = day?.scored ?? 0;
  const above = day?.coinsAbove?.[Math.round(draft.minScore)] ?? 0;
  const share = coins > 0 ? above / coins : NaN;
  const hours = Math.max(1 / 6, Math.min(day?.hours ?? 1, (health?.uptimeSec ?? 3600) / 3600));
  const perHour = coins > 0 ? above / hours : NaN;

  return (
    <div>
      <div class={`bigswitch ${settings.enabled ? "on" : ""}`}>
        <Switch id="enabled" checked={settings.enabled} label="Auto-trading" onChange={(v) => save({ enabled: v })} />
        <div style="flex:1">
          <div style="font-weight:760;font-size:16px">{settings.enabled ? "Auto-trading is ON" : "Auto-trading is paused"}</div>
          <div class="muted" style="font-size:13px">
            {settings.enabled
              ? `${ruleSummary(settings)}${settings.scoreOnly ? " · score only" : " · with filters"} · ${settings.mode === "live" ? "LIVE money" : "paper"} · ${ext.demo ? "demo: runs while this page is open (the real bot runs on a server 24/7)" : "runs on the server even with this page closed"}`
              : "The radar keeps scoring; no new trades. Open positions are still managed."}
          </div>
        </div>
        <Tag tone={settings.mode === "live" ? "bad" : "flare"}>{settings.mode === "live" ? "LIVE" : "PAPER"}</Tag>
      </div>

      <Strategies settings={settings} onApplied={() => void refreshState()} />

      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <h2>Entry</h2>
          {draft.entryAt !== "score" && (
            <div class="note" style="margin:0 0 10px;padding:10px 12px;border-radius:var(--r-sm);background:var(--flare-soft)">
              <b>Buying every coin {ENTRY_POINTS[draft.entryAt] ?? draft.entryAt}</b> (a rule the edge finder proved), filters below applied — the score is not used.{" "}
              <button class="btn sm" disabled={busy} onClick={() => save({ entryAt: "score" })}>
                Enter by score instead
              </button>
            </div>
          )}
          <Field
            label={`Minimum score: ${draft.minScore}`}
            htmlFor="minScore"
            help={
              <>
                {Number.isFinite(share) ? (
                  <>
                    Recently <b>{perHour.toFixed(1)}</b> coins/hour reached this ({(share * 100).toFixed(1)}% of scored coins) — that is roughly how many chances to buy you get.
                  </>
                ) : (
                  "Collecting data on how often coins reach each score…"
                )}{" "}
                75 ≈ 4× the odds of an average coin; each +12.5 doubles the odds again.
              </>
            }
          >
            <span />
          </Field>
          <input id="minScore" type="range" min={0} max={100} step={1} value={draft.minScore} onInput={(e) => set("minScore", Number((e.target as HTMLInputElement).value))} style="width:100%" aria-label="minimum score" />

          <div class="field" style={draft.scoreOnly ? "background:var(--flare-soft);border-radius:10px;padding:12px;margin:8px 0;border:0" : ""}>
            <div class="row">
              <label for="scoreOnly" style="flex:1;font-weight:700">
                Score only
              </label>
              <Switch id="scoreOnly" checked={draft.scoreOnly} label="Score only" onChange={(v) => set("scoreOnly", v)} />
            </div>
            <div class="help">
              When on, the bot buys on the score alone and ignores every filter below. Your budget limits still apply (size, max open positions, daily loss, one entry per coin) — they protect the wallet, they don't judge the coin.
            </div>
          </div>

          <Field label="Take profit" htmlFor="tp" help="Net of all fees and slippage. 100 = sell at 2×.">
            <NumInput id="tp" value={draft.tpPct} onChange={(v) => set("tpPct", v)} min={1} suffix="%" />
          </Field>
          <Field label="Stop loss" htmlFor="sl" help="From your entry cost, fixed (not trailing). In a crash the fill can land below this — the bot always sells.">
            <NumInput id="sl" value={draft.slPct} onChange={(v) => set("slPct", v)} min={1} max={99} suffix="%" />
          </Field>
          <Field label="Sell after" htmlFor="hold" help="Time limit for each trade: sells at market if neither the target nor the stop was hit by then. 0 = no limit.">
            <NumInput id="hold" value={draft.maxHoldMin} onChange={(v) => set("maxHoldMin", v)} min={0} suffix="min" />
          </Field>
          <Field label="Size per trade" htmlFor="size" help={settings.mode === "live" && health?.live ? `Server cap: ${health.live.maxPositionSol} SOL per live trade.` : "Fees included."}>
            <NumInput id="size" value={draft.positionSol} onChange={(v) => set("positionSol", v)} step={0.01} min={0.001} suffix="SOL" />
          </Field>
          <Field label="Max open positions" htmlFor="maxOpen">
            <NumInput id="maxOpen" value={draft.maxOpen} onChange={(v) => set("maxOpen", v)} min={1} max={50} />
          </Field>
          <Field label="Trade stage" help="Bonding curve = before graduation (fast, cheap entry). Graduated = PumpSwap after migration.">
            <div class="chips">
              <button class="chip" aria-pressed={draft.tradeCurve} onClick={() => set("tradeCurve", !draft.tradeCurve)}>
                Curve
              </button>
              <button class="chip" aria-pressed={draft.tradeAmm} onClick={() => set("tradeAmm", !draft.tradeAmm)}>
                Graduated
              </button>
            </div>
          </Field>
          <div class="row" style="margin-top:12px;gap:8px">
            <button class="btn primary" disabled={!dirty || busy} onClick={() => save()}>
              {busy ? "Saving…" : dirty ? "Save settings" : "Saved"}
            </button>
            {dirty && (
              <button class="btn ghost" onClick={discard}>
                Discard
              </button>
            )}
          </div>
          <p class="faint" style="font-size:12px;margin:10px 0 0">Open positions keep the exit settings they were bought with.</p>
        </div>

        <WhyNot funnel={funnel} threshold={settings.minScore} scoreOnly={settings.scoreOnly} enabled={settings.enabled} open={account?.open.length ?? 0} maxOpen={settings.maxOpen} />
      </div>

      <div class="card" style="margin-top:12px">
        <h2>Filters {draft.scoreOnly && <Tag tone="flare">ignored — score only is on</Tag>}</h2>
        <fieldset disabled={draft.scoreOnly} style="border:0;padding:0;margin:0;opacity:1">
          <div style={draft.scoreOnly ? "opacity:.45" : ""}>
            <Field label="Max dev holding" htmlFor="fDev">
              <NumInput id="fDev" value={draft.filters.maxDevPct} onChange={(v) => setF("maxDevPct", v)} suffix="%" />
            </Field>
            <Field label="Max top-10 holders" htmlFor="fTop">
              <NumInput id="fTop" value={draft.filters.maxTop10Pct} onChange={(v) => setF("maxTop10Pct", v)} suffix="%" />
            </Field>
            <Field label="Max launch bundle" htmlFor="fBundle" help="Supply bought by other wallets in the launch block.">
              <NumInput id="fBundle" value={draft.filters.maxBundlePct} onChange={(v) => setF("maxBundlePct", v)} suffix="%" />
            </Field>
            <Field label="Min distinct buyers" htmlFor="fBuyers">
              <NumInput id="fBuyers" value={draft.filters.minBuyers} onChange={(v) => setF("minBuyers", v)} />
            </Field>
            <Field label="Market cap window" help="SOL, 0 = no limit">
              <span class="row" style="gap:6px">
                <NumInput id="fMin" value={draft.filters.minMcapSol} onChange={(v) => setF("minMcapSol", v)} />
                <span class="faint">to</span>
                <NumInput id="fMax" value={draft.filters.maxMcapSol} onChange={(v) => setF("maxMcapSol", v)} />
              </span>
            </Field>
            <Field label="Skip serial launchers" htmlFor="fSerial" help="Devs with more than this many launches in 24h (0 = off).">
              <NumInput id="fSerial" value={draft.filters.maxDevLaunches24h} onChange={(v) => setF("maxDevLaunches24h", v)} />
            </Field>
            <Field label="Skip if dev sold more than" htmlFor="fDevSold" help="100 = off">
              <NumInput id="fDevSold" value={draft.filters.maxDevSoldPct} onChange={(v) => setF("maxDevSoldPct", v)} suffix="%" />
            </Field>
            <Field label="Require socials" htmlFor="fSocial">
              <Switch id="fSocial" checked={draft.filters.requireSocials} label="Require socials" onChange={(v) => setF("requireSocials", v)} />
            </Field>
          </div>
        </fieldset>

        <details class="more">
          <summary>Advanced execution</summary>
          <Field label="Entry slippage" htmlFor="slip" help="How far the price may move before your buy lands. Too tight = missed entries on fast coins; the bot retries while the score holds.">
            <NumInput id="slip" value={draft.slippagePct} onChange={(v) => set("slippagePct", v)} suffix="%" />
          </Field>
          <Field label="Keep retrying a missed entry for" htmlFor="retry">
            <NumInput id="retry" value={draft.retryWindowSec} onChange={(v) => set("retryWindowSec", v)} suffix="s" />
          </Field>
          <Field
            label="Score must hold for"
            htmlFor="confirm"
            help="Evaluations in a row at or above your score before buying — about one per second while the coin trades. 5 skips one-off spikes and costs a few seconds; 1 buys on the first."
          >
            <NumInput id="confirm" value={draft.confirmTicks} onChange={(v) => set("confirmTicks", v)} min={1} max={20} />
          </Field>
          <Field label="Exit slippage (starts at)" htmlFor="xslip" help="Escalates automatically on retries — exits always go through.">
            <NumInput id="xslip" value={draft.exitSlippagePct} onChange={(v) => set("exitSlippagePct", v)} suffix="%" />
          </Field>
          <Field label="Sell a coin that went quiet after" htmlFor="stale" help="No trades for this long frees the slot (0 = never).">
            <NumInput id="stale" value={draft.staleExitMin} onChange={(v) => set("staleExitMin", v)} suffix="min" />
          </Field>
          <Field label="Trailing stop after target" htmlFor="trail" help="When TP is reached, keep riding and sell if the value drops this much from its peak (0 = sell at TP).">
            <NumInput id="trail" value={draft.trailPct} onChange={(v) => set("trailPct", v)} suffix="%" />
          </Field>
          <Field label="Take initials at target" htmlFor="initials" help="At TP sell just enough to get your stake back; the rest rides with the trailing stop (40% if none set).">
            <Switch id="initials" checked={draft.takeInitials} label="Take initials" onChange={(v) => set("takeInitials", v)} />
          </Field>
          <Field label="Priority fee" htmlFor="prio">
            <NumInput id="prio" value={draft.priorityFeeSol} onChange={(v) => set("priorityFeeSol", v)} step={0.0001} suffix="SOL" />
          </Field>
          <Field label="Daily loss limit" htmlFor="dll" help="Stops new entries for the rest of the UTC day (0 = off).">
            <NumInput id="dll" value={draft.maxDailyLossSol} onChange={(v) => set("maxDailyLossSol", v)} step={0.05} suffix="SOL" />
          </Field>
          <Field label="Max trades per hour" htmlFor="tph">
            <NumInput id="tph" value={draft.maxTradesPerHour} onChange={(v) => set("maxTradesPerHour", v)} />
          </Field>
          <Field
            label="Buy the same coin again"
            htmlFor="reentry"
            help="Off: each coin gets one entry moment — the first time it reaches your score. On: it can be bought again after dipping and coming back, which in simulation lost about 40% per trade."
          >
            <Switch id="reentry" checked={draft.reentry} label="Re-entry" onChange={(v) => set("reentry", v)} />
          </Field>
          <Field label="Auto-tune (paper only)" htmlFor="autotune" help="After each learning run, switch score/TP/SL to the combination with the best proven results (95% worst case must beat the current one). Never touches live settings.">
            <Switch id="autotune" checked={draft.autoTune} label="Auto-tune" onChange={(v) => set("autoTune", v)} />
          </Field>
          <Field label="Paper delay" htmlFor="lat" help="Simulated time from decision to landing on-chain. Honest paper results need a realistic delay.">
            <NumInput id="lat" value={draft.paperLatencyMs} onChange={(v) => set("paperLatencyMs", v)} step={100} suffix="ms" />
          </Field>
        </details>
      </div>

      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <h2>Mode</h2>
          <div class="chips">
            <button class="chip" aria-pressed={settings.mode === "paper"} onClick={() => save({ mode: "paper" })}>
              Paper
            </button>
            <button class="chip" aria-pressed={settings.mode === "live"} disabled={!liveAllowed} onClick={() => save({ mode: "live" })}>
              Live
            </button>
          </div>
          <p class="muted" style="font-size:13px">
            {liveAllowed
              ? `Live wallet ${health?.live?.address?.slice(0, 4)}…${health?.live?.address?.slice(-4)} · balance ${health?.live?.balanceSol?.toFixed(3) ?? "?"} SOL · cap ${health?.live?.maxPositionSol} SOL/trade.`
              : health?.live?.halted
                ? `Live trading halted: ${health.live.halted}.`
                : "Live is locked. It unlocks only when the server owner sets LIVE_TRADING and a dedicated wallet — see Setup."}
          </p>
          {health?.live?.halted && (
            <button class="btn sm" onClick={() => api("/api/live/resume", {}).then(() => toast("Live resumed"))}>
              Resume live
            </button>
          )}
        </div>
        <div class="card">
          <h2>Emergency</h2>
          {!confirmKill ? (
            <div class="row wrap">
              <button class="btn danger" onClick={() => setConfirmKill(true)}>
                Kill switch
              </button>
              <span class="muted" style="font-size:13px">Stops all new entries and sells every open position.</span>
            </div>
          ) : (
            <div class="row wrap">
              <b>Sell everything now?</b>
              <button
                class="btn danger"
                onClick={async () => {
                  await api("/api/kill", { on: true, sellAll: true });
                  setConfirmKill(false);
                  toast("Kill switch ON — selling");
                  void refreshState();
                }}
              >
                Yes, sell all
              </button>
              <button class="btn" onClick={() => setConfirmKill(false)}>
                Cancel
              </button>
            </div>
          )}
          {account?.killed && (
            <button class="btn sm" style="margin-top:8px" onClick={() => api("/api/kill", { on: false }).then(() => refreshState())}>
              Turn kill switch off
            </button>
          )}
        </div>
      </div>

      {dirty && (
        <div class="savebar" role="status">
          <span style="flex:1">Not saved yet — the bot still trades on the saved settings.</span>
          <button class="btn sm ghost" onClick={discard}>
            Discard
          </button>
          <button class="btn sm primary" disabled={busy} onClick={() => save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function WhyNot({ funnel, threshold, scoreOnly, enabled, open, maxOpen }: { funnel: any; threshold: number; scoreOnly: boolean; enabled: boolean; open: number; maxOpen: number }) {
  if (!funnel) return <div class="card">Loading…</div>;
  const quietReason = !enabled
    ? "Auto-trading is paused."
    : funnel.scored === 0
      ? "No coins scored yet — check that the data feeds are green (More → Health)."
      : funnel.maxScore < threshold
        ? `No coin reached ${threshold} this hour (best was ${Math.round(funnel.maxScore)}). Lower the score to trade more often.`
        : funnel.signals === 0
          ? `Coins reached ${threshold}, but none crossed it since the bot was switched on or the threshold changed.`
        : open >= maxOpen
          ? `All ${maxOpen} position slots are in use.`
          : funnel.entered > 0
            ? "Trading normally."
            : "Signals were blocked — see the reasons below.";
  return (
    <div class="card">
      <h2>Why no trade? · last hour</h2>
      <p style="margin:0 0 10px;font-weight:650">{quietReason}</p>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat">
          <div class="k">Coins scored</div>
          <div class="v num">{funnel.scored}</div>
        </div>
        <div class="stat">
          <div class="k">Reached {threshold}</div>
          <div class="v num">{funnel.coinsAbove?.[Math.round(threshold)] ?? funnel.signals}</div>
        </div>
        <div class="stat">
          <div class="k">Bought</div>
          <div class="v num good">{funnel.entered}</div>
        </div>
        <div class="stat">
          <div class="k">Missed</div>
          <div class="v num warn">{funnel.failed}</div>
        </div>
      </div>
      <div style="margin:12px 0 4px" class="faint">
        Best score of each coin this hour (highest {Math.round(funnel.maxScore)}):
      </div>
      <Hist bins={funnel.hist} threshold={threshold} />
      {funnel.reasons.length > 0 && (
        <div style="margin-top:12px">
          <div class="faint" style="margin-bottom:6px">
            Blocked because… {scoreOnly && <Tag tone="flare">score only: filters skipped</Tag>}
          </div>
          <table>
            <tbody>
              {funnel.reasons.slice(0, 8).map((r: any) => (
                <tr key={r.reason}>
                  <td>{r.text}</td>
                  <td class="r num">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One tap switches the whole rule: your plan, a simulator finding, or a rule proven on your data. */
function Strategies({ settings, onApplied }: { settings: Settings; onApplied: () => void }) {
  const [report, setReport] = useState<EdgeReport | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api<{ report: EdgeReport | null }>("/api/edges")
      .then((r) => setReport(r.report))
      .catch(() => {});
  }, []);
  const rows: Preset[] = strategyList(report);
  const live = settings.mode === "live";
  const use = async (p: Preset) => {
    if (live && confirm !== p.key) {
      setConfirm(p.key);
      return;
    }
    setBusy(p.key);
    try {
      await api("/api/settings", p.settings);
      toast(settings.enabled ? `Now trading: ${p.name}` : `Strategy set: ${p.name}. Switch Auto-trading on to start.`);
      setConfirm(null);
      onApplied();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };
  const custom = !rows.some((p) => followsPreset(settings, p.settings));
  return (
    <div class="card" style="margin-top:12px">
      <h2>Strategy</h2>
      <p class="faint" style="margin:0 0 4px;font-size:12.5px">
        One tap sets the whole rule — entry score, which coins, take profit, stop loss and time limit. Fine-tune it below afterwards.
      </p>
      {custom && (
        <div class="strat active">
          <div style="flex:1;min-width:0">
            <div class="row wrap" style="gap:6px">
              <b>Custom</b>
              <Tag tone="flare">active</Tag>
            </div>
            <div class="num" style="font-size:13px">
              {ruleSummary(settings)} · {settings.scoreOnly ? "score only" : "with filters"}
            </div>
          </div>
        </div>
      )}
      {rows.map((p) => {
        const on = followsPreset(settings, p.settings);
        return (
          <div class={`strat ${on ? "active" : ""}`} key={p.key}>
            <div style="flex:1;min-width:0">
              <div class="row wrap" style="gap:6px">
                <b>{p.name}</b>
                {p.proof === "unproven" && <Tag tone="warn">unproven</Tag>}
                {p.proof === "data" && <Tag tone="good">held up on unseen data</Tag>}
                {on && <Tag tone="flare">active</Tag>}
              </div>
              <div class="num" style="font-size:13px">{ruleSummary(p.settings as Settings)}</div>
              <div class="faint" style="font-size:12.5px">{p.note}</div>
            </div>
            {!on && (
              <button class={`btn sm ${confirm === p.key ? "danger" : "primary"}`} disabled={!!busy} onClick={() => use(p)}>
                {busy === p.key ? "…" : confirm === p.key ? "Tap again — real money" : "Use this"}
              </button>
            )}
          </div>
        );
      })}
      {live && <p class="faint note">You are live: switching asks for a second tap. Open positions keep the rule they were bought with.</p>}
    </div>
  );
}
