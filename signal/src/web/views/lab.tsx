import { useEffect, useState } from "preact/hooks";
import { LAB, LAB_FACTS, type LabView } from "../../core/lab";
import { pct } from "../format";
import { api, toast } from "../store";
import { Tag } from "../ui";

type Idea = LabView["testing"][number];

/** The Lab (core/lab): rules the bot invents beyond the edge finder's menu, each proven only on coins that came after it. */
export function Lab() {
  const [v, setV] = useState<LabView | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const load = () =>
    api<{ view: LabView | null }>("/api/lab")
      .then((x) => setV(x.view))
      .catch(() => {});
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!v) return null;

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ note: string }>("/api/lab/idea", { text });
      toast(r.note);
      setText("");
      void load();
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      const r = await api<{ text: string }>("/api/lab/summary");
      try {
        await navigator.clipboard.writeText(r.text);
        setSummary("");
        toast("Copied. Paste it into a chat with Claude, then paste the rules it suggests back here, one at a time.");
      } catch {
        // the clipboard needs a secure page (localhost or https): show it to copy by hand
        setSummary(r.text);
      }
    } catch (e) {
      toast(String((e as Error).message));
    }
  };

  return (
    <div class="card" style="margin-top:12px">
      <h2 style="margin-bottom:4px">Lab</h2>
      <div class="muted" style="font-size:13px">
        Invents rules the edge finder cannot try — one or two conditions on any of the {LAB_FACTS.length} facts the bot records about a coin (money flowing in, smart wallets, holders,
        narrative and market heat…) — and proves each one only on coins that came after it was invented. An idea is judged at {LAB.looks.join(", ")} coins; one without an edge
        passes by luck at most about once in {Math.round(1 / (LAB.alpha * LAB.looks.length))}. Proven ideas go to the autopilot like any proven rule.
      </div>
      <p class="edge-meta">{v.note}</p>
      {v.proven.map((i) => (
        <IdeaRow key={i.id} i={i} />
      ))}
      {v.testing.map((i) => (
        <IdeaRow key={i.id} i={i} />
      ))}
      {!v.proven.length && !v.testing.length && <p class="faint note">No ideas being tested yet.</p>}
      {v.retired.length > 0 && (
        <details class="more">
          <summary>Did not hold up ({v.retired.length})</summary>
          {v.retired.map((i) => (
            <IdeaRow key={i.id} i={i} />
          ))}
        </details>
      )}
      <div style="margin-top:12px">
        <b style="font-size:13.5px">Test your own idea</b>
        <div class="row" style="gap:8px;margin-top:6px">
          <input
            class="inp wide"
            placeholder="mig300 top10<=25% smart>=1 tp100 sl30 hold30"
            value={text}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            aria-label="rule to test"
          />
          <button class="btn sm primary" disabled={busy || !text.trim()} onClick={add}>
            Test it
          </button>
        </div>
        <p class="faint note">
          Your ideas: {v.slots.mine} of {v.slots.mineMax} at a time.
        </p>
        <details class="more">
          <summary>How to write a rule</summary>
          <p class="faint note">{v.format}</p>
        </details>
        <button class="btn sm" onClick={copy}>
          Copy a summary for Claude
        </button>
        <p class="faint note">
          Free with the Claude plan you already have: paste the summary into a chat, ask for new rules, and test the ones you like here. They are judged like any other — only on coins after
          you add them.
        </p>
        {summary && <textarea class="inp wide" readOnly rows={8} value={summary} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} aria-label="summary for Claude" />}
      </div>
    </div>
  );
}

function IdeaRow({ i }: { i: Idea }) {
  const tone = i.status === "proven" ? "good" : i.status === "retired" ? "bad" : undefined;
  return (
    <div class="edge">
      <div class="row" style="gap:8px;align-items:flex-start">
        <div class="edge-rule" style="flex:1">{i.text}</div>
        <Tag tone={tone}>{i.status === "proven" ? "proven" : i.status === "retired" ? "retired" : i.source === "you" ? "yours · testing" : "testing"}</Tag>
      </div>
      <div class="num" style="font-size:13px">
        {i.n ? (
          <>
            <b class={i.mean > 0 ? "good" : "bad"}>{pct(i.mean, 1, true)}</b> per trade on {i.n} coins after it · 95% range {pct(i.lo, 1, true)} to {pct(i.hi, 1, true)}
            {i.coinsPerDay !== null && ` · ~${i.coinsPerDay.toFixed(0)} coins/day`}
          </>
        ) : (
          <span class="faint">Waiting for coins that come after it (each finishes about 6 hours after entry).</span>
        )}
      </div>
      {i.status === "testing" && i.nextLook && <div class="faint num" style="font-size:12.5px">Next judged at {i.nextLook} coins.</div>}
      {i.status === "proven" && i.proof && (
        <div class="faint num" style="font-size:12.5px">
          Proven on {i.proof.n} coins: worst case {pct(i.proof.lo, 1, true)} per trade{i.post && i.post.n > 0 ? ` · since then ${pct(i.post.mean, 1, true)} on ${i.post.n}` : ""}.
        </div>
      )}
      {i.why && <div class="faint" style="font-size:12.5px">{i.why}</div>}
      {i.seen && <div class="faint num" style="font-size:12px">When invented, on past data: {pct(i.seen.mean, 1, true)} per trade on {i.seen.n} (not proof).</div>}
      <div class="faint" style="font-size:12px;font-family:var(--mono, monospace)">{i.code}</div>
    </div>
  );
}
