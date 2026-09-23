/**
 * Telegram: push alerts to your phone (entries, exits, feed problems, daily summary) and
 * control the bot with commands — works with the dashboard closed. Only messages from
 * the configured chat id are obeyed.
 */
import type { EdgeReport } from "../core/edges.js";
import type { Engine } from "../core/engine.js";
import type { Position } from "../core/positions.js";
import { type Preset, followsPreset, ruleSummary } from "../core/presets.js";
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
          this.send(this.command(text));
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

  /** Execute a chat command and return the reply (exported behaviour is tested). */
  command(text: string): string {
    const e = this.o.engine();
    const [cmd, arg, extra] = text.split(/\s+/) as [string, string | undefined, string | undefined];
    const n = arg !== undefined ? Number(arg) : NaN;
    switch (cmd.toLowerCase().replace(/@.*/, "")) {
      case "/start":
      case "/help":
        return [
          "<b>SIGNAL commands</b>",
          "/status — bot, P&amp;L, market data, version",
          "/strategy — list the strategies · /strategy 2 — switch to one",
          "/edges — has the bot found an edge? (checked every 2 h)",
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
          `Today ${sol(a.dayPnl)} SOL · total ${sol(a.realized)} SOL · ${a.wins}W/${a.losses}L`,
          `Open ${a.open.length}/${s.maxOpen}`,
          data,
          about?.version ? `v ${esc(about.version.slice(0, 7))}${about.update ? " · ⬆️ update ready — send /update" : ""}` : "",
        ]
          .filter(Boolean)
          .join("\n");
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
        e.updateSettings(p.settings);
        return `${e.settings.enabled ? "▶️ Now trading" : "Strategy set (auto-trading is paused — /resume to start)"}: <b>${esc(p.name)}</b> · ${ruleSummary(e.settings)}`;
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
      case "/score":
        if (!Number.isFinite(n)) return "Usage: /score 75";
        e.updateSettings({ minScore: n });
        return `Minimum score set to ${e.settings.minScore}.`;
      case "/tp":
        if (!Number.isFinite(n)) return "Usage: /tp 100";
        e.updateSettings({ tpPct: n });
        return `Take profit ${e.settings.tpPct}% (new positions).`;
      case "/sl":
        if (!Number.isFinite(n)) return "Usage: /sl 50";
        e.updateSettings({ slPct: n });
        return `Stop loss ${e.settings.slPct}% (new positions).`;
      case "/hold":
        if (!Number.isFinite(n)) return "Usage: /hold 10 (minutes, 0 = no limit)";
        e.updateSettings({ maxHoldMin: n });
        return e.settings.maxHoldMin > 0 ? `New positions sell after ${e.settings.maxHoldMin} min if neither TP nor SL was hit.` : "No time limit for new positions.";
      case "/size":
        if (!Number.isFinite(n)) return "Usage: /size 0.1";
        e.updateSettings({ positionSol: n });
        return `Position size ${e.settings.positionSol} SOL.`;
      case "/scoreonly": {
        const on = arg === "on" || arg === "1" || arg === "true";
        e.updateSettings({ scoreOnly: on });
        return on ? "Score only: ON — filters ignored, account limits still apply." : "Score only: OFF — filters active.";
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
