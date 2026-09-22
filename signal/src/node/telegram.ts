/**
 * Telegram: push alerts to your phone (entries, exits, feed problems, daily summary) and
 * control the bot with commands — works with the dashboard closed. Only messages from
 * the configured chat id are obeyed.
 */
import type { Engine } from "../core/engine.js";
import type { Position } from "../core/positions.js";
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
    private o: { token: string; chatId: string; log: Logger; engine: () => Engine; publicUrl?: string },
  ) {}

  get enabled() {
    return !!(this.o.token && this.o.chatId);
  }

  start() {
    if (!this.enabled) return;
    this.stopped = false;
    void this.poll();
    this.send("🟢 <b>SIGNAL started</b>\nSend /help for commands.");
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
        if (!text || chat !== String(this.o.chatId)) continue;
        try {
          this.send(this.command(text));
        } catch (e) {
          this.send(`⚠️ ${esc(String(e))}`);
        }
      }
    }
  }

  /** Execute a chat command and return the reply (exported behaviour is tested). */
  command(text: string): string {
    const e = this.o.engine();
    const [cmd, arg] = text.split(/\s+/, 2) as [string, string | undefined];
    const n = arg !== undefined ? Number(arg) : NaN;
    switch (cmd.toLowerCase().replace(/@.*/, "")) {
      case "/start":
      case "/help":
        return [
          "<b>SIGNAL commands</b>",
          "/status — bot, P&amp;L, feeds",
          "/positions — open trades",
          "/pause · /resume — auto-trading off/on",
          "/score 75 — minimum score",
          "/tp 100 · /sl 50 — take profit / stop loss %",
          "/size 0.1 — SOL per trade",
          "/scoreonly on|off — trade on score alone",
          "/kill — stop entries and sell everything · /unkill",
        ].join("\n");
      case "/status": {
        const a = e.account();
        const h = e.health();
        const s = e.settings;
        const feeds = h.feeds.map((f) => `${f.status === "open" ? "🟢" : "🔴"} ${f.name}`).join("  ");
        return [
          `<b>${s.enabled ? "▶️ Trading" : "⏸ Paused"}</b> · ${s.mode.toUpperCase()}${e.killed ? " · KILL SWITCH" : ""}`,
          `Score ≥ ${s.minScore}${s.scoreOnly ? " (score only)" : ""} · TP ${s.tpPct}% · SL ${s.slPct}% · ${s.positionSol} SOL`,
          `Today ${sol(a.dayPnl)} SOL · total ${sol(a.realized)} SOL · ${a.wins}W/${a.losses}L`,
          `Open ${a.open.length}/${s.maxOpen}`,
          feeds,
        ].join("\n");
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
