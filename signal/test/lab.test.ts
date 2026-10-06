import { afterEach, describe, expect, it } from "vitest";
import { FEATURE_KEYS } from "../src/core/features.js";
import { LAB, addLabIdea, describeLab, emptyLab, labCode, labForward, labProofs, labSettings, labSummary, parseLabRule, runLab } from "../src/core/lab.js";
import { GRID, GRID_VERSION, PATH_MIN, type Sample } from "../src/core/outcomes.js";
import { condsHold } from "../src/core/settings.js";
import { normInv, rng } from "../src/core/util.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 1);
const K = (k: string) => FEATURE_KEYS.indexOf(k);

/**
 * A synthetic market: coins at two entries ("5 min after graduating" and "score 70"), each with
 * the 36 recorded facts. Every exit breaks even after costs — the target comes first exactly as
 * often as it must for that, (sl + 6) / (tp + sl) with 6% costs — unless `edge` says the coin is
 * good, which then hits its targets more often. Each market hour has its own mood, as real
 * markets do.
 */
function market(o: { days: number; perDay: number; seed: number; edge?: (x: number[]) => boolean; lift?: number }): Sample[] {
  const r = rng(o.seed);
  const out: Sample[] = [];
  const moods = Array.from({ length: o.days * 24 + 1 }, () => normInv(Math.min(Math.max(r(), 1e-6), 1 - 1e-6)) * 0.04);
  for (let i = 0; i < o.days * o.perDay; i++) {
    const ts = T0 + r() * o.days * DAY;
    const mood = moods[Math.floor((ts - T0) / HOUR)]!;
    for (const tag of ["mig300", "x70"]) {
      const x = FEATURE_KEYS.map(() => normInv(Math.min(Math.max(r(), 1e-6), 1 - 1e-6)));
      x[K("top10")] = 0.1 + r() * 0.5;
      x[K("smart")] = r() < 0.7 ? 0 : Math.log1p(1 + Math.floor(r() * 3));
      x[K("tweet")] = r() < 0.2 ? 1 : 0;
      const good = !!o.edge?.(x);
      const grid: number[] = [];
      const gridT: number[] = [];
      for (const g of GRID) {
        // break-even after costs, moved by the hour's mood, lifted for good coins
        const p = Math.min(0.97, Math.max(0.02, (g.sl + 6) / (g.tp + g.sl) + mood + (good ? (o.lift ?? 0.3) : 0)));
        const hit = r() < p;
        grid.push(hit ? g.tp / 100 - 0.06 : -g.sl / 100 - 0.06);
        gridT.push(60 + r() * 3 * 3600);
      }
      out.push({
        id: `${tag}-${i}`, kind: tag === "x70" ? "entry" : "checkpoint", tag, mint: `m${i}`, symbol: "X", ts, stage: tag === "x70" && r() < 0.5 ? "curve" : "amm",
        score: 70, p: 0.1, x, entryMcap: 60, tp: 100, sl: 50, y: 0, ret: 0, exit: "timeout", grid, gv: GRID_VERSION, gridT,
        path: PATH_MIN.map(() => (good ? 0.1 : -0.05) + (r() - 0.5) * 0.2), ov: 1, maxMult: 1, minMult: 1, secToMax: 0, resolvedAt: ts + 6 * HOUR,
      } as Sample);
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/**
 * Runs the Lab the way the bot does — every `everyH` hours on what had finished by then. Pauses
 * after each run, as the bot does between its runs: the test runner gives up on a worker that
 * computes for a minute without letting its messages through.
 */
async function runOver(samples: Sample[], days: number, everyH: number, startDay = 1.5) {
  let st = emptyLab();
  const proven: string[] = [];
  let added = 0;
  for (let t = T0 + startDay * DAY; t <= T0 + days * DAY + 6 * HOUR; t += everyH * HOUR) {
    const seen = samples.filter((s) => s.resolvedAt <= t);
    const res = runLab(seen, st, { now: t, horizonMs: 6 * HOUR });
    st = res.state;
    proven.push(...res.proven.map((i) => i.code));
    added += res.added.length;
    await new Promise<void>((r) => setImmediate(r));
  }
  return { st, proven, added };
}

describe("the Lab", () => {
  // each test computes for many seconds without pausing: let the test runner's messages through
  // between them, or it gives up on the worker after a minute of silence
  afterEach(() => new Promise<void>((r) => setImmediate(r)));

  it("writes and reads rules in words and as text", () => {
    const p = parseLabRule("mig300 top10<=25% smart>=1 tweet=1 tp100 sl30 hold30");
    expect("rule" in p).toBe(true);
    const rule = (p as { rule: Parameters<typeof labCode>[0] }).rule;
    expect(labCode(rule)).toBe("mig300 top10<=25% smart>=1 tweet=1 tp100 sl30 hold30");
    expect(describeLab(rule)).toBe("Lab: Buy every coin 5 min after graduating with top 10 holders ≤ 25% and smart wallets in ≥ 1 and tweet-linked · sell at +100% or −30%, or after 30 min");
    expect(labCode((parseLabRule("score80 stage=curve holders>=50 tp200 sl50") as { rule: Parameters<typeof labCode>[0] }).rule)).toBe("score80 stage=curve holders>=50 tp200 sl50");
    // the settings trade it exactly: conditions on the same facts, in the same units
    const s = labSettings(rule, 6 * HOUR);
    expect(s).toMatchObject({ entryAt: "mig300", minScore: 0, tpPct: 100, slPct: 30, maxHoldMin: 30, scoreOnly: true });
    const x = FEATURE_KEYS.map(() => 0);
    x[K("top10")] = 0.2;
    x[K("smart")] = Math.log1p(1);
    x[K("tweet")] = 1;
    expect(condsHold(s.conds!, x)).toBe(true);
    x[K("smart")] = 0;
    expect(condsHold(s.conds!, x)).toBe(false);
    // mistakes are explained
    expect(parseLabRule("mig301 tp100 sl30")).toMatchObject({ error: expect.stringMatching(/not an entry/) });
    expect(parseLabRule("mig300 moon>=1 tp100 sl30")).toMatchObject({ error: expect.stringMatching(/not a fact/) });
    expect(parseLabRule("mig300 tp123 sl30")).toMatchObject({ error: expect.stringMatching(/take profit/) });
    expect(parseLabRule("mig300 top10<=25%")).toMatchObject({ error: expect.stringMatching(/Give the exit/) });
  });

  it("invents a rule beyond the edge finder's menu and proves it on coins that came after it", async () => {
    // the edge lives in a combination the edge finder cannot express: few top holders AND smart wallets in
    const edge = (x: number[]) => x[K("top10")]! <= 0.25 && x[K("smart")]! >= Math.log1p(1) - 1e-9;
    const samples = market({ days: 10, perDay: 500, seed: 3, edge });
    const { st, proven } = await runOver(samples, 10, 12);
    expect(proven.length).toBeGreaterThan(0);
    // what it proved uses both facts of the planted edge
    const ideas = st.ideas.filter((i) => i.provenAt);
    expect(ideas.some((i) => i.conds.some((c) => c.k === "top10") && i.conds.some((c) => c.k === "smart"))).toBe(true);
    // only coins after each idea was invented counted, each once
    for (const i of ideas) expect(i.coins).toBe(samples.filter((s) => s.ts > i.from && s.ts <= st.seenTo && s.tag === i.at && condsHold(i.conds, s.x) && (!i.stage || s.stage === i.stage)).length);
    // …and it is offered to the autopilot while the Lab is fresh, as a rule the bot can trade
    const offers = labProofs(st, st.ranAt);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]!.holdout.lo).toBeGreaterThan(0);
    expect(offers[0]!.settings.conds!.length).toBeGreaterThan(0);
    expect(labProofs(st, st.ranAt + 7 * HOUR)).toHaveLength(0);
  });

  it("proves nothing where nothing works, however much it searches", async () => {
    const samples = market({ days: 10, perDay: 500, seed: 4 });
    const { st, proven, added } = await runOver(samples, 10, 12);
    // the search did find rules that looked good on past data, and tested them
    expect(added).toBeGreaterThan(5);
    expect(proven).toHaveLength(0);
    expect(st.ideas.some((i) => i.status === "retired")).toBe(true);
  });

  it("counts for an idea only the coins after it, each once, across restarts", () => {
    const samples = market({ days: 6, perDay: 300, seed: 5 });
    const now = T0 + 3 * DAY;
    const added = addLabIdea(emptyLab(), "mig300 tp100 sl50", now);
    expect(added.ok).toBe(true);
    const st0 = (added as { state: ReturnType<typeof emptyLab> }).state;
    // two runs, then the same data again (a restart reloading the same samples): nothing is counted twice
    const a = runLab(samples.filter((s) => s.resolvedAt <= now + DAY), st0, { now: now + DAY, horizonMs: 6 * HOUR }).state;
    const b = runLab(samples.filter((s) => s.resolvedAt <= now + 2 * DAY), JSON.parse(JSON.stringify(a)), { now: now + 2 * DAY, horizonMs: 6 * HOUR }).state;
    const c = runLab(samples.filter((s) => s.resolvedAt <= now + 2 * DAY), b, { now: now + 2 * DAY + HOUR, horizonMs: 6 * HOUR }).state;
    const idea = c.ideas.find((i) => i.code === "mig300 tp100 sl50")!;
    const expected = samples.filter((s) => s.tag === "mig300" && s.ts > now && s.ts <= b.seenTo).length;
    expect(idea.coins).toBe(expected);
    // a rule that only breaks even is not proven by its last look, and leaves with its results
    expect(idea.status).toBe("retired");
    expect(idea.last!.n).toBe(expected);
    expect(idea.why).toMatch(new RegExp(`not proven on ${expected} coins`));
    // the same rule is not tested twice at once (a retired one may be tried again), and your own ideas are limited
    let s = c;
    for (const tp of [200, 300, 500, 150, 100]) s = (addLabIdea(s, `mig300 tp${tp} sl50`, now) as { state: typeof s }).state;
    expect(addLabIdea(s, "mig300 tp200 sl50", now)).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
    expect(addLabIdea(s, "mig300 tp100 sl30", now)).toMatchObject({ ok: false, error: expect.stringMatching(/At most/) });
  });

  it("drops a proven idea when the coins after its proof clearly fall short, for the autopilot to see", async () => {
    // an edge that is real for four days, then gone
    const early = market({ days: 4, perDay: 500, seed: 6, edge: (x) => x[K("tweet")]! >= 1, lift: 0.35 });
    const late = market({ days: 10, perDay: 500, seed: 7 }).filter((s) => s.ts >= T0 + 4 * DAY);
    const samples = [...early, ...late].sort((a, b) => a.ts - b.ts);
    const { st, proven } = await runOver(samples, 10, 12);
    expect(proven.length).toBeGreaterThan(0);
    const gone = st.ideas.find((i) => i.provenAt && i.status === "retired" && /stopped working/.test(i.why ?? ""));
    expect(gone).toBeDefined();
    expect(labForward(st, gone!.text)!.hi).toBe(-Infinity);
    // one that only expired is no evidence against the rule in use
    const expired = { ...st, ideas: st.ideas.map((i) => (i.id === gone!.id ? { ...i, stopped: false, why: "proven two weeks ago" } : i)) };
    expect(labForward(expired, gone!.text)).toBeUndefined();
    expect(labSummary(st, { rule: "your rule" })).toMatch(/stopped working/);
  });

  it("keeps the Lab's limits", async () => {
    const samples = market({ days: 6, perDay: 500, seed: 8 });
    const { st } = await runOver(samples, 6, 6);
    expect(st.ideas.filter((i) => i.source === "search" && i.status === "testing").length).toBeLessThanOrEqual(LAB.maxActive);
    for (const i of st.ideas) expect(i.conds.length).toBeLessThanOrEqual(2);
  });
});
