/**
 * One plain-text picture of what the bot sees and why it trades what it trades — to read, or to
 * paste into a chat with Claude: the data (how much, how much of it was watched to the end), what
 * every entry looks like on all finished data before any proof, the last search and its closest
 * tries, the rule in use (on the recordings and by its own trades), the autopilot's decisions,
 * and the checks that can be made from the saved data. Nothing secret is in it: no keys, no wallet.
 */
import type { AutopilotState } from "./autopilot.js";
import { type EdgeReport, EXITS, HOLDS_MIN, exitReturn, measureRule, recordedRows } from "./edges.js";
import { GRID, type Sample } from "./outcomes.js";
import type { Position } from "./positions.js";
import { ruleSummary } from "./presets.js";
import { coverage, decisions, recordedVsReal } from "./selfcheck.js";
import { type Settings, entryLabel, ruleKey } from "./settings.js";

export interface DiagnosisInput {
  /** the recordings (samples) on disk */
  samples: Sample[];
  settings: Settings;
  /** closed trades */
  closed: Position[];
  autopilot: AutopilotState | null;
  /** the latest search (edges.json) */
  report: EdgeReport | null;
  now: number;
  /** how long would-be trades are followed */
  horizonMs: number;
  version?: string;
}

const HOUR = 3_600_000;
const at = (t: number) => (t ? `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC` : "—");
const p1 = (x: number) => {
  if (!Number.isFinite(x)) return "—";
  const v = Math.round(x * 1000) / 10;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;
};
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const share = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 120 ? `${m} min ago` : m < 2_880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1_440)} days ago`;
};
const entryName = (tag: string) => (/^x\d+$/.test(tag) ? `first reaching score ${tag.slice(1)}` : entryLabel(tag));
const exitName = (e: number) => {
  const g = GRID[Math.floor(e / HOLDS_MIN.length)]!;
  const hold = HOLDS_MIN[e % HOLDS_MIN.length]!;
  return `+${g.tp}% / −${g.sl}%${hold ? `, ${hold} min` : ""}`;
};

/** Trades in a few numbers: how many, how many won, the average, the total, how they ended. */
function trades(list: Position[]): string {
  if (!list.length) return "none";
  const wins = list.filter((p) => (p.pnl ?? 0) > 0).length;
  const mean = list.reduce((a, p) => a + (p.pnlPct ?? 0), 0) / list.length / 100;
  const sol = list.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
  const how = new Map<string, number>();
  for (const p of list) how.set(p.exitReason ?? "?", (how.get(p.exitReason ?? "?") ?? 0) + 1);
  const ends = [...how].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  const from = Math.min(...list.map((p) => p.openedAt));
  return `${list.length} (${wins} won) · ${p1(mean)} per trade on average · ${sol >= 0 ? "+" : ""}${sol.toFixed(3)} SOL in all · ended by: ${ends} · since ${at(from)}`;
}

function* steps(i: DiagnosisInput): Generator<void, string> {
  const s = i.settings;
  const out: string[] = [];
  out.push(`SIGNAL diagnosis · ${at(i.now)}${i.version ? ` · version ${i.version}` : ""}`);
  out.push(`Mode ${s.mode} · auto-trading ${s.enabled ? "on" : "off"} · autopilot ${s.autopilot ? "on" : "off"} · rule in use: ${ruleSummary(s)}${s.scoreOnly ? " · no filters" : " · with filters"}`);

  // 1. the data
  const all = i.samples;
  out.push("", "DATA (recordings on disk)");
  if (!all.length) out.push("- no recordings yet");
  else {
    let first = Infinity;
    let last = 0;
    const kinds = new Map<string, number>();
    for (const x of all) {
      if (x.ts < first) first = x.ts;
      if (x.ts > last) last = x.ts;
      kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
    }
    const named: Record<string, string> = { checkpoint: "at fixed moments", entry: "at score levels", signal: "of the rule in use", moment: "at your moments" };
    out.push(`- ${n0(all.length)} recordings over ${((last - first) / HOUR).toFixed(0)} h (${at(first)} → ${at(last)}): ${[...kinds].map(([k, v]) => `${n0(v)} ${named[k] ?? k}`).join(", ")}`);
    const rows = recordedRows(all, i.horizonMs);
    out.push(`- finished and usable by the search (followed for ${Math.round(i.horizonMs / HOUR)} h): ${n0(rows.length)}`);
    const amm = all.filter((x) => x.stage === "amm");
    const poolCut = amm.filter((x) => x.blind !== undefined && x.blindBy !== "feed" && x.blindBy !== "stop").length;
    const feedCut = all.filter((x) => x.blind !== undefined && x.blindBy === "feed").length;
    const stopCut = all.filter((x) => x.blind !== undefined && x.blindBy === "stop").length;
    const untrusted = amm.filter((x) => x.ov !== 1).length;
    out.push(`- graduated coins: ${share(amm.length, all.length)} of recordings; ${share(poolCut, amm.length)} of those stopped being watched before they ended (the bot follows at most 40 pools)`);
    out.push(`- cut by trade-feed outages: ${share(feedCut, all.length)} of all recordings`);
    if (stopCut) out.push(`- cut by the bot stopping (restarts, updates; kept as far as they were watched): ${share(stopCut, all.length)} of all recordings`);
    if (untrusted) out.push(`- graduated-coin recordings from before observation was tracked (not used): ${n0(untrusted)}`);
    const days = new Map<string, { n: number; amm: number; pool: number; feed: number }>();
    for (const x of all) {
      const d = new Date(x.ts).toISOString().slice(0, 10);
      let r = days.get(d);
      if (!r) days.set(d, (r = { n: 0, amm: 0, pool: 0, feed: 0 }));
      r.n++;
      if (x.stage === "amm") {
        r.amm++;
        if (x.blind !== undefined && x.blindBy !== "feed" && x.blindBy !== "stop") r.pool++;
      }
      if (x.blind !== undefined && x.blindBy === "feed") r.feed++;
    }
    out.push("- by day (UTC): recordings · graduated ones cut by pools · all cut by feed outages");
    for (const [d, r] of [...days].sort().slice(-8)) out.push(`  ${d} · ${n0(r.n)} · ${share(r.pool, r.amm)} · ${share(r.feed, r.n)}`);
    yield;

    // 2. every entry on all finished data, before any proof
    out.push("", "ENTRIES ON ALL FINISHED DATA (not proof: the best of 192 exits on everything recorded flatters every entry; each average leaves out its single largest recording, so no one coin can be the headline)");
    const byTag = new Map<string, Sample[]>();
    for (const x of rows) {
      let l = byTag.get(x.tag);
      if (!l) byTag.set(x.tag, (l = []));
      l.push(x);
    }
    const lines: { v: number; text: string }[] = [];
    for (const [tag, list] of byTag) {
      if (list.length < 30) continue;
      const sum = new Float64Array(EXITS);
      const cnt = new Float64Array(EXITS);
      // the biggest single return each exit has, so no one recording can define an entry's number
      const top = new Float64Array(EXITS).fill(-Infinity);
      for (let k = 0; k < list.length; k++) {
        for (let e = 0; e < EXITS; e++) {
          const v = exitReturn(list[k]!, Math.floor(e / HOLDS_MIN.length), e % HOLDS_MIN.length);
          if (Number.isNaN(v)) continue;
          sum[e] += v;
          cnt[e]++;
          if (v > top[e]!) top[e] = v;
        }
        if (k % 1_000 === 999) yield;
      }
      /** the average without the single largest recording: what the entry is worth without its luckiest coin */
      const less = (e: number) => (cnt[e]! > 1 ? (sum[e]! - top[e]!) / (cnt[e]! - 1) : sum[e]! / cnt[e]!);
      // Chosen on that average, not the plain one. One bad price print used to choose the exit and
      // then be the headline: a single tick on one coin made "15 min after graduating" read
      // +17,661% per trade, when the same entry without that one coin is −38%.
      let best = -1;
      for (let e = 0; e < EXITS; e++) if (cnt[e]! >= 30 && (best < 0 || less(e) > less(best))) best = e;
      const span = Math.max(1 / 24, (list[list.length - 1]!.ts - list[0]!.ts) / (24 * HOUR));
      const coins = new Set(list.map((x) => x.mint)).size;
      if (best < 0) lines.push({ v: -Infinity, text: `- ${entryName(tag)} · ${(coins / span).toFixed(0)}/day · too few watched to the end` });
      else {
        const mean = sum[best]! / cnt[best]!;
        const trimmed = less(best);
        // when one recording moves the average by more than 5 points, the reader is told
        const carried = Math.abs(mean - trimmed) > 0.05 ? ` — but ${p1(mean)} with its best single recording, which one coin carries` : "";
        lines.push({ v: trimmed, text: `- ${entryName(tag)} · ${(coins / span).toFixed(0)}/day · best: ${exitName(best)} → ${p1(trimmed)} per trade on ${n0(cnt[best]!)}${carried}` });
      }
    }
    lines.sort((a, b) => b.v - a.v);
    out.push(...(lines.length ? lines.map((l) => l.text) : ["- none with 30 finished recordings yet"]));
  }

  // 3. the last search
  const r = i.report;
  out.push("", "LAST SEARCH (the edge finder)");
  if (!r) out.push("- none yet");
  else {
    out.push(`- ${ago(r.generatedAt, i.now)} · method ${r.method ?? "old"} · ${r.status === "ok" ? "answered" : "not enough data"}: ${r.note}`);
    if (r.status === "ok") {
      out.push(`- ${r.hours.toFixed(0)} h of market · ${n0(r.samples)} recordings · ${n0(r.tested)} rules tried · ${r.candidates} candidates re-checked on data it never saw · ${r.survivors.length} held up`);
      out.push(`- luck check: on shuffled data the same search "found" ${r.placebo.avgSurvivors.toFixed(1)} rules per run (at most ${r.placebo.maxSurvivors})`);
      for (const x of r.survivors.slice(0, 5)) out.push(`  held up: ${x.text} · ${p1(x.holdout.mean)} per trade on ${x.holdout.n} unseen (worst case ${p1(x.holdout.lo)}) · ${x.tradesPerDay.toFixed(0)}/day`);
      for (const x of r.failed) out.push(`  closest try: ${x.text} · ${p1(x.discovery.mean)} while searching (${x.discovery.n}) → ${p1(x.holdout.mean)} on ${x.holdout.n} unseen (worst case ${p1(x.holdout.lo)})`);
    }
  }

  // 4. the rule in use
  out.push("", `THE RULE IN USE: ${ruleSummary(s)}`);
  if (all.length) {
    const m = measureRule(recordedRows(all, i.horizonMs), s, { horizonMs: i.horizonMs, tests: r?.status === "ok" ? r.candidates : undefined });
    out.push(
      m.ok
        ? `- on the newest recordings (as the search checks candidates): ${p1(m.mean)} per trade on ${n0(m.n)} coins (range ${p1(m.lo)} to ${p1(m.hi)}), ~${m.coinsPerDay.toFixed(0)} coins a day`
        : `- on the recordings: cannot be weighed — ${m.why}`,
    );
  }
  const mine = i.closed.filter((p) => p.status === "closed" && p.mode === s.mode);
  out.push(`- all ${s.mode} trades: ${trades(mine)}`);
  out.push(`- under this exact rule: ${trades(mine.filter((p) => p.rule === ruleKey(s)))}`);

  // 5. the autopilot
  const ap = i.autopilot;
  if (ap) {
    out.push("", `AUTOPILOT: ${!s.autopilot ? "off" : ap.holding ? `holding new live entries — ${ap.holdReason}` : ap.active ? `trading ${ap.active} (since ${at(ap.since)})` : "on your own rule"}`);
    for (const x of ap.log.slice(-6).reverse()) out.push(`- ${at(x.at)}: ${x.what}`);
  }

  // 6. the checks that can be made from the saved data
  out.push("", "CHECKS");
  const checks = [recordedVsReal(i.closed, all, i.now), coverage(all, i.now, false), ...(ap ? [decisions(ap, i.now)] : [])];
  for (const c of checks) out.push(`- ${c.status === "ok" ? "ok" : c.status} · ${c.title}: ${c.detail}`);
  return out.join("\n");
}

/** The diagnosis in one go (command line, tests). */
export function diagnosis(i: DiagnosisInput): string {
  const it = steps(i);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** The same, pausing now and then so a running bot keeps up with the market meanwhile. */
export async function diagnosisAsync(i: DiagnosisInput): Promise<string> {
  const it = steps(i);
  let t = Date.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > 15) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
}
