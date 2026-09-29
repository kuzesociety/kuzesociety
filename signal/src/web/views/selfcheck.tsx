import { useEffect, useState } from "preact/hooks";
import type { Check } from "../../core/selfcheck";
import { ago } from "../format";
import { api, toast } from "../store";
import { Tag } from "../ui";

type View = { checks: Check[]; at: number; summary: string };

const TONE = { ok: "good", info: undefined, warn: "warn", fail: "bad" } as const;
const ICON = { ok: "✓", info: "i", warn: "!", fail: "✕" } as const;

/** The bot watching itself: every check with its status, problems first (core/selfcheck). */
export function SelfCheck() {
  const [v, setV] = useState<View | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  /** everything the bot sees, in one page to paste into a chat with Claude (core/diagnose) */
  const copy = async () => {
    setBusy(true);
    try {
      const r = await api<{ text: string }>("/api/diagnosis");
      try {
        await navigator.clipboard.writeText(r.text);
        setText("");
        toast("Copied. Paste it into your chat with Claude.");
      } catch {
        // the clipboard needs a secure page (localhost or https): show it to copy by hand
        setText(r.text);
      }
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const load = () =>
      api<{ view: View | null }>("/api/checks")
        .then((x) => setV(x.view))
        .catch(() => setV(null));
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  // the in-page demo has no learning loop, so nothing to check
  if (!v) return null;
  const order = { fail: 0, warn: 1, info: 2, ok: 3 } as const;
  const list = [...v.checks].sort((a, b) => order[a.status] - order[b.status]);
  const worst = list[0]?.status ?? "ok";
  return (
    <div class="card" style="margin-top:12px">
      <div class="row" style="align-items:flex-start">
        <div style="flex:1">
          <h2 style="margin-bottom:2px">Self-check</h2>
          <div class="muted" style="font-size:13px">
            The bot watching itself: do its recordings match its real trades, does the rule in use keep its promise, are its decisions steady, does it see what it records. Anything that
            turns bad is sent to Telegram at once, and once a day a check-up.
          </div>
        </div>
        <Tag tone={TONE[worst]}>{v.checks.length ? v.summary.replace(/^\S+\s/, "") : "not run yet"}</Tag>
      </div>
      {list.map((c) => (
        <div class="edge" key={c.key}>
          <div class="row" style="gap:8px;align-items:flex-start">
            <Tag tone={TONE[c.status]}>{ICON[c.status]}</Tag>
            <div style="flex:1;min-width:0">
              <b style="font-size:13.5px">{c.title}</b>
              <div class="faint" style="font-size:12.5px">{c.detail}</div>
            </div>
          </div>
        </div>
      ))}
      {v.at > 0 && <p class="faint note">Checked {ago(v.at)} · every 10 minutes, and in full every 2 hours. Telegram: /checks</p>}
      <div class="row wrap" style="gap:8px;margin-top:8px">
        <button class="btn sm" disabled={busy} onClick={copy}>
          {busy ? "Preparing…" : "Copy a diagnosis for Claude"}
        </button>
        <span class="faint" style="font-size:12.5px">
          Everything the bot sees in one page — its data, the search's closest tries, how your rule does — to paste into a chat. No keys or wallet in it.
        </span>
      </div>
      {text && <textarea class="inp wide" readOnly rows={10} value={text} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} aria-label="diagnosis" />}
    </div>
  );
}
