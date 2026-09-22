import { useState } from "preact/hooks";
import type { RadarRow } from "../../core/engine";
import { age, mcap, pct } from "../format";
import { useApp } from "../store";
import { Empty, Score, Tag } from "../ui";

function loadPref<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(`signal.${k}`);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function savePref(k: string, v: unknown) {
  try {
    localStorage.setItem(`signal.${k}`, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

export function Radar({ open }: { open: (mint: string) => void }) {
  const rows = useApp((s) => s.rows);
  const solUsd = useApp((s) => s.solUsd);
  const settings = useApp((s) => s.settings);
  const [stage, setStage] = useState<"all" | "curve" | "amm">(loadPref("stage", "all"));
  const [sort, setSort] = useState<"score" | "new" | "mcap">(loadPref("sort", "score"));
  const [min, setMin] = useState<number>(loadPref("minview", 0));
  const threshold = settings?.minScore ?? 75;

  let list = rows.filter((r) => (stage === "all" || r.stage === stage) && r.score >= min);
  list = [...list].sort((a, b) => (sort === "new" ? b.createdAt - a.createdAt : sort === "mcap" ? b.mcapSol - a.mcapSol : b.score - a.score));
  const hot = rows.filter((r) => r.score >= threshold).length;

  const chip = <T extends string>(val: T, cur: T, set: (v: T) => void, key: string, label: string) => (
    <button
      class="chip"
      aria-pressed={cur === val}
      onClick={() => {
        set(val);
        savePref(key, val);
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div class="section-title">
        <h2>Live radar</h2>
        <span class="muted num">
          {rows.length} coins scored · <b class="flare">{hot}</b> at ≥ {threshold}
        </span>
      </div>
      <div class="row wrap" style="gap:8px;margin-bottom:12px">
        <div class="chips">
          {chip("all", stage, setStage, "stage", "All")}
          {chip("curve", stage, setStage, "stage", "Bonding curve")}
          {chip("amm", stage, setStage, "stage", "Graduated")}
        </div>
        <div class="chips">
          {chip("score", sort, setSort, "sort", "Top score")}
          {chip("new", sort, setSort, "sort", "Newest")}
          {chip("mcap", sort, setSort, "sort", "Market cap")}
        </div>
        <div class="chips">
          {[0, 50, threshold].map((m) => (
            <button
              key={m}
              class="chip"
              aria-pressed={min === m}
              onClick={() => {
                setMin(m);
                savePref("minview", m);
              }}
            >
              {m === 0 ? "Any score" : `≥ ${m}`}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <Empty>{rows.length === 0 ? "Waiting for coins… the radar fills as launches and trades stream in." : "No coins match these filters right now."}</Empty>
      ) : (
        <div class="list">
          {list.map((r) => (
            <CoinRow key={r.mint} r={r} solUsd={solUsd} threshold={threshold} onOpen={() => open(r.mint)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoinRow({ r, solUsd, threshold, onOpen }: { r: RadarRow; solUsd: number; threshold: number; onOpen: () => void }) {
  const up = r.why.filter((w) => w.points > 0).slice(0, 2);
  const down = r.why.filter((w) => w.points < 0).slice(0, 1);
  return (
    <button class={`coin ${r.held ? "held" : ""}`} onClick={onOpen}>
      <Score value={r.score} small={r.stage === "amm" ? "DEX" : "CURVE"} />
      <div class="body">
        <div class="title">
          <span class="sym">${r.symbol || "?"}</span>
          <span class="name">{r.name}</span>
          {r.held && <Tag tone="flare">holding</Tag>}
          {r.score >= threshold && !r.held && (r.spent ? <Tag>passed</Tag> : <Tag tone="good">signal</Tag>)}
        </div>
        <div class="meta num">
          <span>{mcap(r.mcapSol, solUsd)}</span>
          <span>{age(r.ageSec)} old</span>
          <span class={r.net60 >= 0 ? "good" : "bad"}>
            {r.net60 >= 0 ? "+" : ""}
            {r.net60.toFixed(2)} SOL/1m
          </span>
          <span>{r.buyers} buyers</span>
          <span>top10 {pct(r.top10)}</span>
        </div>
        {r.stage === "curve" && (
          <div class="bar" title={`bonding curve ${pct(r.progress)}`}>
            <i style={{ width: `${Math.max(2, r.progress * 100)}%` }} />
          </div>
        )}
        <div class="why">
          {up.map((w) => `▲ ${w.note || w.label}`).join("  ")}
          {down.length > 0 && `  ▼ ${down[0]!.note || down[0]!.label}`}
        </div>
        {r.flags.length > 0 && (
          <div class="chips" style="margin-top:6px">
            {r.flags.slice(0, 4).map((f) => (
              <Tag key={f} tone={/smart|leader/.test(f) ? "good" : /bundled|dev sold|serial|concentrated|copycat/.test(f) ? "bad" : undefined}>
                {f}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
