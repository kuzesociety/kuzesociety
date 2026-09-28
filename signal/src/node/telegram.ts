/**
 * Telegram: push alerts to your phone (entries, exits, feed problems, daily summary) and
 * control the bot with commands — works with the dashboard closed. Only messages from
 * the configured chat id are obeyed.
 */
import type { EdgeReport } from "../core/edges.js";
import type { Engine } from "../core/engine.js";
import type { AutopilotView } from "../core/autopilot.js";
import type { LabView } from "../core/lab.js";
import type { Check } from "../core/selfcheck.js";
import type { LearningView } from "../core/insight.js";
import type { Position } from "../core/positions.js";
import { type Preset, followsPreset, ruleSummary } from "../core/presets.js";
import type { Settings } from "../core/settings.js";
import type { Logger } from "../core/util.js";
import { getJson, postJson } from "./http.js";

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
const sol = (lamports: number) => (lamports / 1e9).toFixed(3);

export class Telegram {
  private queue: string[] = [];
  private sending = false;
  private offset = 0;
  private stopped = false;
  private lastSendAt = 0;

  constructor(
    private o: {
      token: string;
      chatId: string;
      log: Logger;
      engine: () => Engine;
      publicUrl?: string;
      /** no chat yet: whoever sends this code to the bot becomes the owner chat */
      linkCode?: string;
      onLinked?: (chatId: string) => void;
      /** installs the newest version; returns the reply */
      update?: () => string;
      /** this bot's version, whether a newer one is ready, and where market data comes from */
      about?: () => { version: string | null; update: boolean; data: string };
      /** the strategies /strategy offers */
      strategies?: () => Preset[];
      /** dashboard links that open from the phone (home Wi-Fi, anywhere with Tailscale) */
      links?: () => { label: string; url: string }[];
      /** the edge finder's latest answer, and whether it is running now */
      edges?: () => { report: EdgeReport | null; running: boolean };
      /** what the scoring model learned */
      learning?: () => Promise<LearningView | null> | LearningView | null;
      /** the autopilot's state */
      autopilot?: () => AutopilotView | null;
      /** the self-check (core/selfcheck) */
      checks?: () => { checks: Check[]; summary: string } | null;
      /** the Lab (core/lab), and adding your own idea to it */
      lab?: () => LabView | null;
      labIdea?: (text: string) => { ok: true; note: string } | { ok: false; error: string };
    },
  ) {}

  get enabled() {
    return !!(this.o.token && this.o.token !== "off" && this.o.chatId);
  }

  /** Waiting for the owner to send the link code shown in the dashboard. */
  get linking() {
    return !!(this.o.token && this.o.token !== "off" && !this.o.chatId && this.o.linkCode);
  }

  start() {
    if (!this.enabled && !this.linking) return;
    this.stopped = false;
    void this.poll();
    if (this.enabled) this.send(this.startedMessage());
  }

  stop() {
    this.stopped = true;
  }

  send(html: string) {
    if (!this.enabled) return;
    this.queue.push(html);
    if (this.queue.length > 50) this.queue.splice(0, this.queue.length - 50);
    void this.drain();
  }

  private async drain() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const wait = 1_100 - (Date.now() - this.lastSendAt);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const text = this.queue.shift()!;
        const res = await postJson(`https://api.telegram.org/bot${this.o.token}/sendMessage`, {
          chat_id: this.o.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        this.lastSendAt = Date.now();
        if (!res.ok) this.o.log.warn("telegram send failed", { status: res.status });
      }
    } finally {
      this.sending = false;
    }
  }

  private async poll() {
    while (!this.stopped) {
      const r = await getJson<{ ok: boolean; result?: { update_id: number; message?: { chat?: { id?: number }; text?: string } }[] }>(
        `https://api.telegram.org/bot${this.o.token}/getUpdates?timeout=25&offset=${this.offset}`,
        { timeoutMs: 35_000 },
      );
      if (!r?.ok) {
        await new Promise((res) => setTimeout(res, 5_000));
        continue;
      }
      for (const u of r.result ?? []) {
        this.offset = Math.max(this.offset, u.update_id + 1);
        const chat = String(u.message?.chat?.id ?? "");
        const text = (u.message?.text ?? "").trim();
        if (!text || !chat) continue;
        if (!this.o.chatId) {
          this.link(chat, text);
          continue;
        }
        if (chat !== String(this.o.chatId)) continue;
        try {
          this.send(await this.reply(text));
        } catch (e) {
          this.send(`⚠️ ${esc(String(e))}`);
        }
      }
    }
  }

  /** Link mode: the first chat that sends the dashboard's code becomes the owner. */
  link(chat: string, text: string) {
    if (this.o.linkCode && text.includes(this.o.linkCode)) {
      this.o.chatId = chat;
      this.o.onLinked?.(chat);
      this.send("✅ <b>Linked.</b> SIGNAL will message you here about every trade.\nSend /help for commands.");
      return;
    }
    void postJson(`https://api.telegram.org/bot${this.o.token}/sendMessage`, {
      chat_id: chat,
      text: "To link this chat, send the 6-digit code shown in the SIGNAL dashboard (More → Setup).",
    });
  }

  /** The greeting after every start: after an update it shows the new version at once. */
  startedMessage(): string {
    const a = this.o.about?.();
    const s = this.o.engine().settings;
    return [
      `🟢 <b>SIGNAL started</b>${a?.version ? ` · v ${esc(a.version.slice(0, 7))}` : ""}`,
      a?.data ? `Market data: ${esc(a.data)}` : "",
      `${s.enabled ? "▶️ Trading" : "⏸ Paused"} · ${s.mode} · ${ruleSummary(s)}`,
      "Send /help for commands.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** The reply to a chat message: commands that need a moment of work (reading outcomes) are awaited. */
  async reply(text: string): Promise<string> {
    if (text.split(/\s+/)[0]!.toLowerCase().replace(/@.*/, "") === "/learn") {
      const v = await this.o.learning?.();
      return v ? learningMessage(v) : "Learning is not available here.";
    }
    return this.command(text);
  }

  /** Execute a chat command and return the reply (exported behaviour is tested). */
  command(text: string): string {
    const e = this.o.engine();
    const [cmd, arg, extra] = text.split(/\s+/) as [string, string | undefined, string | undefined];
    const n = arg !== undefined ? Number(arg) : NaN;
    /** A rule change by hand; says so when it turned the autopilot off. */
    const byHand = (patch: Partial<Settings>): string => {
      const was = e.settings.autopilot;
      e.updateSettings(patch);
      return was && !e.settings.autopilot ? "\n🤖 Autopilot off: you picked the rule. /autopilot on hands it back." : "";
    };
    switch (cmd.toLowerCase().replace(/@.*/, "")) {
      case "/start":
      case "/help":
        return [
          "<b>SIGNAL commands</b>",
          "/status — bot, P&amp;L, market data, version",
          "/strategy — list the strategies · /strategy 2 — switch to one",
          "/edges — has the bot found an edge? (checked every 2 h)",
          "/learn — what the score learned, and is it still working?",
          "/autopilot on|off — trade the best proven rule by itself",
          "/checks — is everything working as it should?",
          "/lab — rules the bot invented, proven only on coins after them",
          "/idea mig300 top10&lt;=25% smart&gt;=1 tp100 sl30 hold30 — test your own rule",
          "/positions — open trades",
          "/pause · /resume — auto-trading off/on",
          "/score 75 — minimum score",
          "/tp 100 · /sl 50 — take profit / stop loss %",
          "/hold 10 — sell after N minutes (0 = no limit)",
          "/size 0.1 — SOL per trade",
          "/scoreonly on|off — trade on score alone",
          "/kill — stop entries and sell everything · /unkill",
          "/update — install the newest version of SIGNAL",
          "/link — open the dashboard on this phone",
        ].join("\n");
      case "/status": {
        const a = e.account();
        const h = e.health();
        const s = e.settings;
        const about = this.o.about?.();
        const main = h.feeds.find((f) => f.critical && f.status !== "off");
        const data = h.feedDown
          ? `🔴 Market data down${main?.note ? `: ${esc(main.note)}` : ""} — no new trades until it is back`
          : `🟢 Market data${about?.data ? `: ${esc(about.data)}` : ""}${main?.lastMsgAt ? ` · last message ${Math.max(0, Math.round((Date.now() - main.lastMsgAt) / 1000))} s ago` : ""}`;
        return [
          `<b>${s.enabled ? "▶️ Trading" : "⏸ Paused"}</b> · ${s.mode.toUpperCase()}${e.killed ? " · KILL SWITCH" : ""}`,
          `Score ≥ ${s.minScore}${s.scoreOnly ? " (score only)" : ""} · TP ${s.tpPct}% · SL ${s.slPct}% · ${s.maxHoldMin > 0 ? `sell after ${s.maxHoldMin} min` : "no time limit"} · ${s.positionSol} SOL`,
          autopilotLine(this.o.autopilot?.() ?? null, s.autopilot),
          this.o.checks?.() ? `🩺 Self-check: ${this.o.checks()!.summary} (/checks)` : "",
          `Today ${sol(a.dayPnl)} SOL · total ${sol(a.realized)} SOL · ${a.wins}W/${a.losses}L`,
          `Open ${a.open.length}/${s.maxOpen}`,
          data,
          about?.version ? `v ${esc(about.version.slice(0, 7))}${about.update ? " · ⬆️ update ready — send /update" : ""}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }
      case "/lab": {
        const v = this.o.lab?.();
        if (!v) return "The Lab is not available here.";
        const pct = (x: number | null) => (x === null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
        const lines = [`🧪 <b>Lab</b> — ${esc(v.note)}`];
        for (const i of v.proven) lines.push(`✅ ${esc(i.text)}: ${pct(i.mean)} per trade on ${i.n} coins after it (worst case ${pct(i.proof?.lo ?? null)})`);
        for (const i of v.testing.slice(0, 8))
          lines.push(`🔬 ${esc(i.code)}: ${i.n ? `${i.n} coins, ${pct(i.mean)} per trade` : "waiting for coins"}${i.nextLook ? ` · judged at ${i.nextLook}` : ""}${i.source === "you" ? " · yours" : ""}`);
        if (v.retired.length) lines.push(`Retired lately: ${v.retired.length} (last: ${esc(v.retired[0]!.why ?? "")})`);
        lines.push("Add your own: /idea mig300 top10&lt;=25% smart&gt;=1 tp100 sl30 hold30");
        return lines.join("\n");
      }
      case "/idea": {
        if (!this.o.labIdea) return "The Lab is not available here.";
        const rule = text.trim().slice(cmd.length).trim();
        const r = this.o.labIdea(rule);
        return r.ok ? `🧪 ${esc(r.note)}` : `⚠️ ${esc(r.error)}`;
      }
      case "/checks": {
        const v = this.o.checks?.();
        if (!v || !v.checks.length) return "The self-check has not run yet (it runs every 10 minutes).";
        const icon = { ok: "✅", info: "ℹ️", warn: "⚠️", fail: "🛑" } as const;
        return [`🩺 <b>Self-check</b>: ${v.summary}`, ...v.checks.map((c) => `${icon[c.status]} <b>${esc(c.title)}</b> — ${esc(c.detail)}`)].join("\n");
      }
      case "/autopilot": {
        const want = arg?.toLowerCase();
        if (want === "on" || want === "off") {
          if (e.settings.mode === "live" && want === "on" && extra?.toLowerCase() !== "yes")
            return "You are trading LIVE. The autopilot switches the rule by itself (never the size or the limits) and waits while no rule is proven for real money. Send /autopilot on yes to turn it on.";
          e.updateSettings({ autopilot: want === "on" });
          return want === "on"
            ? "🤖 Autopilot is on: it trades the best rule proven on data the search never saw, and switches when a clearly better one is proven."
            : "Autopilot is off: the rule stays as it is now. Change it with /strategy or in the Bot tab.";
        }
        return autopilotMessage(this.o.autopilot?.() ?? null, e.settings.autopilot);
      }
      case "/strategy":
      case "/strategies": {
        const list = this.o.strategies?.() ?? [];
        if (!list.length) return "No strategies here.";
        if (arg === undefined) {
          return [
            "<b>Strategies</b> — each sets the whole rule. Send /strategy 1, /strategy 2… to switch:",
            ...list.map(
              (p, i) =>
                `${i + 1}. ${followsPreset(e.settings, p.settings) ? "✅ " : ""}<b>${esc(p.name)}</b>${p.proof === "unproven" ? " (unproven)" : ""} — ${ruleSummary({ ...e.settings, ...p.settings })}`,
            ),
          ].join("\n");
        }
        const pick = Number(arg);
        if (!Number.isInteger(pick) || pick < 1 || pick > list.length) return `Send a number from 1 to ${list.length}, or /strategy to see them.`;
        const p = list[pick - 1]!;
        if (e.settings.mode === "live" && extra?.toLowerCase() !== "yes") return `You are trading LIVE. Send /strategy ${pick} yes to switch to ${esc(p.name)}.`;
        const off = byHand(p.settings);
        return `${e.settings.enabled ? "▶️ Now trading" : "Strategy set (auto-trading is paused — /resume to start)"}: <b>${esc(p.name)}</b> · ${ruleSummary(e.settings)}${off}`;
      }
      case "/edges": {
        const x = this.o.edges?.();
        return edgesMessage(x?.report ?? null, x?.running ?? false);
      }
      case "/link": {
        const links = this.o.links?.() ?? [];
        if (!links.length) return "No dashboard link found on this computer's networks.";
        return links.map((l) => `${esc(l.label)}:\n${esc(l.url)}`).join("\n\n");
      }
      case "/positions": {
        const open = e.account().open;
        if (!open.length) return "No open positions.";
        return open.map((p) => this.posLine(p)).join("\n");
      }
      case "/pause":
        e.updateSettings({ enabled: false });
        return "⏸ Auto-trading paused (open positions still managed).";
      case "/resume":
        e.updateSettings({ enabled: true });
        return `▶️ Auto-trading on · score ≥ ${e.settings.minScore}`;
      case "/score": {
        if (!Number.isFinite(n)) return "Usage: /score 75";
        const off = byHand({ minScore: n });
        return `Minimum score set to ${e.settings.minScore}.${off}`;
      }
      case "/tp": {
        if (!Number.isFinite(n)) return "Usage: /tp 100";
        const off = byHand({ tpPct: n });
        return `Take profit ${e.settings.tpPct}% (new positions).${off}`;
      }
      case "/sl": {
        if (!Number.isFinite(n)) return "Usage: /sl 50";
        const off = byHand({ slPct: n });
        return `Stop loss ${e.settings.slPct}% (new positions).${off}`;
      }
      case "/hold": {
        if (!Number.isFinite(n)) return "Usage: /hold 10 (minutes, 0 = no limit)";
        const off = byHand({ maxHoldMin: n });
        return `${e.settings.maxHoldMin > 0 ? `New positions sell after ${e.settings.maxHoldMin} min if neither TP nor SL was hit.` : "No time limit for new positions."}${off}`;
      }
      case "/size":
        if (!Number.isFinite(n)) return "Usage: /size 0.1";
        e.updateSettings({ positionSol: n });
        return `Position size ${e.settings.positionSol} SOL.`;
      case "/scoreonly": {
        const on = arg === "on" || arg === "1" || arg === "true";
        const off = byHand({ scoreOnly: on });
        return `${on ? "Score only: ON — filters ignored, account limits still apply." : "Score only: OFF — filters active."}${off}`;
      }
      case "/kill":
        e.setKill(true, true);
        return "🛑 Kill switch ON: no new entries, selling open positions.";
      case "/unkill":
        e.setKill(false);
        return "Kill switch off.";
      case "/update":
        return this.o.update?.() ?? "This bot cannot update itself.";
      default:
        return "Unknown command. /help";
    }
  }

  posLine(p: Position): string {
    const mult = p.cost > 0 ? (p.proceeds + p.value) / p.cost : 0;
    return `${mult >= 1 ? "🟢" : "🔴"} <b>$${esc(p.symbol || p.mint.slice(0, 4))}</b> ${((mult - 1) * 100).toFixed(0)}% · ${sol(p.cost)} SOL · TP ${p.plan.tpPct}% SL ${p.plan.slPct}%`;
  }

  onPosition(p: Position, what: string) {
    if (!this.enabled) return;
    const link = `https://pump.fun/coin/${p.mint}`;
    const name = `<b>$${esc(p.symbol || p.mint.slice(0, 4))}</b>`;
    const tag = p.mode === "live" ? "LIVE" : "paper";
    if (what === "fill" && p.fills.length === 1) {
      this.send(`🟢 BUY ${name} (${tag})\nScore ${p.signalScore.toFixed(0)} · ${sol(p.cost)} SOL · mcap ${p.entryMcapSol.toFixed(0)} SOL\n<a href="${link}">pump.fun</a>`);
    } else if (what === "close") {
      const icon = (p.pnl ?? 0) > 0 ? "✅" : "❌";
      this.send(`${icon} SELL ${name} (${tag}) — ${p.exitReason}\n${(p.pnlPct ?? 0) >= 0 ? "+" : ""}${(p.pnlPct ?? 0).toFixed(1)}% · ${sol(p.pnl ?? 0)} SOL`);
    } else if (what === "fail") {
      this.send(`⚠️ Entry failed ${name}: ${esc(p.exitReason ?? "?")}`);
    }
  }
}

const signedPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/** The edge finder's latest answer, for the phone. */
export function edgesMessage(r: EdgeReport | null, running: boolean, now = Date.now()): string {
  if (!r) {
    return running
      ? "🔎 The edge finder is running for the first time — ask again in a few minutes."
      : "🔎 The edge finder has not run yet: it runs after the first learning round (20 min after start), then every 2 hours.";
  }
  const ago = Math.max(0, Math.round((now - r.generatedAt) / 60_000));
  const head = `🔎 <b>Edge finder</b> · checked ${ago < 120 ? `${ago} min` : `${Math.round(ago / 60)} h`} ago${running ? " · running again now" : ""}`;
  if (r.status === "not_enough_data") return `${head}\nStill collecting: ${esc(r.note)}`;
  const lines = [head, `${r.hours.toFixed(0)} h of market · ${r.samples.toLocaleString("en-US")} would-be trades · ${r.tested.toLocaleString("en-US")} rules tried`];
  if (r.survivors.length) {
    lines.push(`✅ <b>${r.survivors.length} rule${r.survivors.length > 1 ? "s" : ""} held up on data the search never saw:</b>`);
    r.survivors.slice(0, 3).forEach((x, i) =>
      lines.push(`${i + 1}. ${esc(x.text)}\n    ${signedPct(x.holdout.mean)} per trade on ${x.holdout.n} unseen trades · about ${x.tradesPerDay.toFixed(1)} a day`),
    );
    lines.push("Send /strategy to paper-trade one.");
  } else {
    lines.push("No rule has held up on unseen data yet. That is a real answer: it keeps the money out of rules that only looked good by luck.");
    const near = r.failed[0];
    if (near) lines.push(`Closest try: ${esc(near.text)} — ${signedPct(near.discovery.mean)} while searching, ${signedPct(near.holdout.mean)} on unseen data.`);
  }
  lines.push(`Luck check: on shuffled data the same search "finds" ${r.placebo.avgSurvivors.toFixed(1)} rules on average.`);
  return lines.join("\n");
}

const agoText = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 120 ? `${m} min ago` : m < 2_880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1_440)} days ago`;
};

/** What the score learned and whether it still works, for the phone. */
export function learningMessage(v: LearningView, now = Date.now()): string {
  const recipeText = (r?: string, trees?: number) =>
    r === "trees" ? `weighted sum + ${trees ?? 0} trees (learns combinations)` : r === "linear" ? "weighted sum, fitted to your data" : "starting assumptions";
  const lines = [
    `🧠 <b>What the score learned</b>`,
    v.model.source === "trained" ? `Trained ${agoText(v.model.createdAt, now)} on this bot's own outcomes.` : "Still on the starting assumptions: it learns once enough outcomes have finished (the first try is 20 min after start).",
    `Bonding curve: ${recipeText(v.model.recipe.curve, v.model.trees.curve)} · Graduated: ${recipeText(v.model.recipe.amm, v.model.trees.amm)}`,
  ];
  for (const f of v.fresh) {
    if (f.verdict === "not_enough") continue;
    const where = f.stage === "amm" ? "graduated" : "curve";
    const mark = f.verdict === "working" ? "🟢" : f.verdict === "slipping" ? "🟠" : "🔴";
    lines.push(`${mark} On ${f.n.toLocaleString("en-US")} ${where} coins it had not seen, it ranked winners above losers ${(f.auc * 100).toFixed(0)}% of the time (50% = a coin toss).`);
  }
  if (v.fresh.every((f) => f.verdict === "not_enough")) lines.push("⏳ Not enough finished outcomes of coins it has not seen yet to check it.");
  const d = v.drivers.curve ?? v.drivers.amm;
  if (d?.length) {
    const arrow = (x: string) => (x === "up" ? "↑" : x === "down" ? "↓" : "↕");
    lines.push(`Moves the score most: ${d
      .slice(0, 5)
      .map((x) => `${arrow(x.dir)} ${esc(x.label)}`)
      .join(" · ")}`);
  }
  const last = v.history[v.history.length - 1];
  if (last) lines.push(`Last learning run ${agoText(last.at, now)}: ${last.adopted ? "switched to a better score" : esc(last.stages.map((s) => s.reason).find(Boolean) ?? "kept the current score")}.`);
  if (v.status.running) lines.push("Learning right now…");
  else if (v.status.nextRun > now) lines.push(`Next run in ${Math.max(1, Math.round((v.status.nextRun - now) / 60_000))} min.`);
  return lines.join("\n");
}

/** One line for /status. */
function autopilotLine(v: AutopilotView | null, on: boolean): string {
  if (!on) return "🤖 Autopilot off (/autopilot on)";
  if (!v) return "🤖 Autopilot on";
  if (v.holding) return `🤖 Autopilot: holding new live entries — ${esc(v.holdReason)}`;
  return v.active ? "🤖 Autopilot: trading the best proven rule" : "🤖 Autopilot: on your own rule until one is proven";
}

/** The autopilot, for the phone. */
export function autopilotMessage(v: AutopilotView | null, on: boolean, now = Date.now()): string {
  if (!on) return "🤖 Autopilot is off. Send /autopilot on to let the bot trade the best proven rule by itself.";
  if (!v) return "🤖 Autopilot is on.";
  const lines = ["🤖 <b>Autopilot is on</b>"];
  if (v.holding) lines.push(`⏸ New live entries wait: ${esc(v.holdReason)}. Open positions are still managed.`);
  else if (v.active && v.proof)
    lines.push(
      `Trading since ${agoText(v.since, now)}: ${esc(v.active)}`,
      `It showed ${signedPct(v.proof.mean)} per trade on ${v.proof.n} trades the search never saw (worst case ${signedPct(v.proof.lo)}).`,
    );
  else lines.push(`On your own rule (${esc(v.rule)}) until a rule is proven on unseen data.`);
  const top = v.ranking.filter((r) => !r.active).slice(0, 2);
  if (top.length) lines.push("Next best:", ...top.map((r) => `• ${esc(r.text)} — worst case ~${r.worstSolPerDay.toFixed(2)} SOL/day at your limits`));
  const last = v.log[0];
  if (last) lines.push(`Last decision ${agoText(last.at, now)}: ${esc(last.what)}`);
  return lines.join("\n");
}
