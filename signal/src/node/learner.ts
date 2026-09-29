/**
 * The bot's learning loop, every 2 hours (the first 20 minutes after start):
 *   1. retrain the scorer on the outcomes recorded on disk (when due: LEARN_EVERY_HOURS) and
 *      switch models only when the new one predicts coins neither has seen better;
 *   2. search for rules that made money on data the search never saw (core/edges);
 *   3. autopilot: trade the best proven rule, at once (core/autopilot) — and every 10 minutes,
 *      check the rule in use against its own trades;
 *   4. check the score on coins it has never seen, and retrain early if it clearly stopped working;
 *   2b. the Lab (core/lab): invent rules beyond the edge finder's menu, each proven only on coins
 *      that came after it was invented; proven ones go to the autopilot too;
 *   5. self-check (core/selfcheck): the bot watching itself — recordings against real trades, the
 *      rule in use against its promise, steady decisions, what it can see, the loop and the engine
 *      (the full check each cycle, the quick ones every 10 minutes). A check that turns bad, or
 *      recovers, is sent to Telegram at once, and once a day a check-up.
 * Everything pauses every few milliseconds, so trading never waits for it.
 */
import { AUTOPILOT, type AutopilotState, type OwnMeasure, autopilotView, decideAutopilot, emptyAutopilot, pickRule, trackRecord } from "../core/autopilot.js";
import { type EdgeReport, findEdgesAsync, measureRule, recordedRows } from "../core/edges.js";
import type { Engine } from "../core/engine.js";
import { type FreshCheck, type LearnRun, adoptionNote, freshCheckAsync, learnRunOf } from "../core/insight.js";
import { LAB, type LabState, addLabIdea, emptyLab, labForward, labProofs, labSummary, labView, parseLabRule, restoreLab, runLabAsync } from "../core/lab.js";
import { type TrainReport, trainAndSelectAsync, trainingRows } from "../core/learn.js";
import type { ModelSpec } from "../core/model.js";
import type { Sample } from "../core/outcomes.js";
import { ruleSummary } from "../core/presets.js";
import { buildReport } from "../core/report.js";
import { type Check, type CheckStatus, checkChanges, checksSummary, runChecks } from "../core/selfcheck.js";
import { type Settings, ruleChanged, ruleKey } from "../core/settings.js";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../core/util.js";
import type { DataStore } from "./store.js";

const CYCLE_MS = 2 * 3_600_000;

export class Learner {
  lastRun = 0;
  /** when the scorer next retrains (0 = learning is off) */
  nextRun = 0;
  lastReports: TrainReport[] = [];
  lastError = "";
  running = false;
  lastEdges: EdgeReport | null = null;
  edgesRunning = false;
  /** past runs, oldest first */
  history: LearnRun[] = [];
  /** the current model on finished outcomes of coins it has not seen */
  lastFresh: FreshCheck[] = [];
  autopilot: AutopilotState = emptyAutopilot();
  /** the Lab (core/lab) */
  lab: LabState = emptyLab();
  labRunning = false;
  /** your ideas typed while the Lab was running, added once it is done */
  private labPending: string[] = [];
  /** the latest self-check (core/selfcheck) and when it ran */
  checks: Check[] = [];
  checksAt = 0;
  private checkState = new Map<string, CheckStatus>();
  /** the full comparison of recordings and real trades, from the last cycle's samples on disk */
  private recordedCheck: Check | null = null;
  private startedAt = Date.now();
  private lastDaily = 0;
  private timer: NodeJS.Timeout | null = null;
  /** the autopilot checks the rule in use against its own trades between searches too */
  private watch: NodeJS.Timeout | null = null;
  private nextCycle = 0;
  private driftNoted = "";
  private stopped = false;
  private piloting = false;
  private seen: Pick<Settings, "autopilot" | "mode"> | null = null;
  /** your own rule measured on the recordings (core/edges measureRule): at every search, and right after you pick one */
  ownMeasure: OwnMeasure | null = null;
  /** your pick is being measured: the autopilot does not replace it before that is known */
  measuring = false;
  private measureAgain = false;
  /** a learning cycle holds the samples: a pick made meanwhile is measured with them at its end */
  private cycling = false;

  constructor(
    private o: {
      store: DataStore;
      engine: () => Engine;
      log: Logger;
      everyHours: number;
      sampleDays: number;
      onAdopt?: (msg: string, model: ModelSpec) => void;
      onTune?: (msg: string) => void;
      /** a rule held up on data the search never saw (only when the set of rules changes) */
      onEdges?: (msg: string) => void;
      /** the score stopped working on new coins and an early retrain started */
      onDrift?: (msg: string) => void;
      /** the autopilot switched rules, held or released live entries, or benched a rule */
      onAutopilot?: (msg: string) => void;
      /** a self-check turned bad or recovered, and the daily check-up */
      onCheck?: (msg: string) => void;
      /** the Lab proved an idea, or a proven one stopped working */
      onLab?: (msg: string) => void;
      /** the data folder against its budget, and the disk's free space (for the self-check) */
      storage?: () => { usedMb: number; maxMb: number; freeMb: number | null; minFreeMb: number; recordingPaused: boolean };
      /** delay of the first self-check after start (default a minute) */
      firstCheckMs?: number;
    },
  ) {}

  start() {
    this.lastEdges = (this.o.store.loadEdges() as EdgeReport | null) ?? null;
    if (this.lastEdges?.own) this.ownMeasure = { ...this.lastEdges.own, at: this.lastEdges.generatedAt };
    this.history = this.o.store.loadLearnHistory() as LearnRun[];
    this.autopilot = { ...emptyAutopilot(), ...((this.o.store.loadAutopilot() as Partial<AutopilotState> | null) ?? {}) };
    this.lab = restoreLab(this.o.store.loadLab());
    this.seen = { autopilot: this.o.engine().settings.autopilot, mode: this.o.engine().settings.mode };
    this.startedAt = Date.now();
    this.lastDaily = ((this.o.store.loadSelfCheck() as { lastDaily?: number } | null)?.lastDaily ?? 0) || Date.now();
    // your own rule is weighed before a proven rule may replace it (an answer from before this
    // version has no measure of it, and the rule may have changed since the last search)
    const s = this.o.engine().settings;
    if (s.autopilot && s.mode === "paper" && !this.autopilot.active && this.ownMeasure?.key !== ruleKey(s) && (this.lastEdges?.survivors.length ?? 0) > 0) void this.measureOwn();
    // with real money and nothing proven, entries wait from the first second — not after the first search
    this.pilot();
    this.watch = setInterval(() => {
      this.pilot();
      this.selfCheck();
    }, 10 * 60_000);
    this.watch.unref?.();
    // the first self-check once the feeds had a minute to connect (no false alarm at every restart)
    setTimeout(() => this.selfCheck(), this.o.firstCheckMs ?? 60_000).unref?.();
    if (this.o.everyHours <= 0) return;
    this.schedule(20 * 60_000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.watch) clearInterval(this.watch);
    this.nextRun = 0;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.nextCycle = Date.now() + ms;
    this.nextRun = this.learnDueAfter(this.nextCycle);
    this.timer = setTimeout(() => void this.cycle(), ms);
    this.timer.unref?.();
  }

  /** The first cycle at or after `from` at which the scorer is due to retrain. */
  private learnDueAfter(from: number): number {
    const due = this.lastRun ? this.lastRun + this.o.everyHours * 3_600_000 - 5 * 60_000 : 0;
    let t = from;
    while (t < due) t += CYCLE_MS;
    return t;
  }

  private horizonMs() {
    return this.o.engine().cfg.outcomeHorizonMs;
  }

  /** One pass of the loop (see the top of the file). */
  private async cycle() {
    this.cycling = true;
    try {
      const samples = await this.o.store.loadSamplesAsync(this.o.sampleDays);
      if (Date.now() >= this.learnDueAfter(Date.now() - 1)) await this.learn(samples, this.lastRun ? "schedule" : "start");
      await this.findEdges(samples);
      await this.runLab(samples);
      await this.checkDrift(samples);
      this.selfCheck(samples);
      // a rule picked while the cycle ran is measured with its samples
      this.cycling = false;
      if (this.measureAgain) await this.measureOwn(samples);
    } catch (e) {
      this.o.log.error("learning cycle failed", { err: String(e) });
    } finally {
      this.cycling = false;
      if (this.measureAgain && !this.measuring) void this.measureOwn();
      if (!this.stopped) this.schedule(CYCLE_MS);
    }
  }

  /**
   * Measures the rule in use on the recordings (core/edges measureRule) for the autopilot, then
   * lets it decide. Loads the samples unless given; while a cycle holds them, waits for its end.
   */
  async measureOwn(samples?: Sample[]): Promise<OwnMeasure | null> {
    if (this.measuring || (this.cycling && !samples)) {
      this.measureAgain = true;
      return this.ownMeasure;
    }
    this.measuring = true;
    try {
      let rows = samples ? recordedRows(samples, this.horizonMs()) : null;
      do {
        this.measureAgain = false;
        if (!rows) rows = recordedRows(await this.o.store.loadSamplesAsync(this.o.sampleDays), this.horizonMs());
        const s = this.o.engine().settings;
        // the same correction as the candidates of the latest search
        const tests = this.lastEdges?.status === "ok" ? this.lastEdges.candidates : undefined;
        this.ownMeasure = { ...measureRule(rows, s, { horizonMs: this.horizonMs(), tests }), at: Date.now() };
      } while (this.measureAgain);
    } catch (e) {
      this.o.log.warn("measuring your rule failed", { err: String(e) });
    } finally {
      this.measuring = false;
    }
    this.pilot();
    return this.ownMeasure;
  }

  /** You changed the rule by hand with the autopilot on: it stays on, and your pick competes (core/autopilot pickRule). */
  private picked(s: Settings, prev: Settings) {
    const now = Date.now();
    this.autopilot = pickRule({ state: this.autopilot, settings: s, prev, report: this.lastEdges, extra: labProofs(this.lab, now), now });
    try {
      this.o.store.saveAutopilot(this.autopilot);
    } catch (e) {
      this.o.log.warn("autopilot state save failed", { err: String(e) });
    }
    // a rule the autopilot had proven needs no measuring; yours is measured before it decides
    if (this.autopilot.active) this.pilot();
    else void this.measureOwn();
  }

  /** Retrains early when a trained model clearly stopped ranking new coins (once per model). */
  async checkDrift(samples: ReturnType<DataStore["loadSamples"]>) {
    const engine = this.o.engine();
    const model = engine.model;
    this.lastFresh = await freshCheckAsync(model, samples, { horizonMs: this.horizonMs() });
    if (model.source !== "trained" || this.running || this.driftNoted === model.version) return;
    const bad = this.lastFresh.find((f) => (f.verdict === "slipping" || f.verdict === "lost") && f.n >= 300);
    if (!bad || Date.now() - this.lastRun < 3 * 3_600_000) return;
    this.driftNoted = model.version;
    const where = bad.stage === "amm" ? "graduated" : "bonding-curve";
    const was = Number.isFinite(bad.expected) ? ` (when it was adopted: ${(bad.expected * 100).toFixed(0)}%)` : "";
    const msg = `📉 The score ${bad.verdict === "lost" ? "stopped working" : "got clearly weaker"} on ${bad.n} ${where} coins it has not seen: it ranked winners above losers ${(bad.auc * 100).toFixed(0)}% of the time${was}. The market may have changed — retraining now instead of waiting for the schedule.`;
    this.o.log.warn(msg);
    this.o.onDrift?.(msg);
    await this.learn(samples, "drift");
    await this.findEdges(samples);
  }

  /** Searches the recorded outcomes for rules that made money on their own (see core/edges), then lets the autopilot act on the answer. */
  async findEdges(samples?: ReturnType<DataStore["loadSamples"]>): Promise<EdgeReport | null> {
    if (this.edgesRunning) return this.lastEdges;
    this.edgesRunning = true;
    try {
      const ap = this.autopilot;
      const incumbent = ap.active && ap.rule ? { rule: ap.rule, after: ap.proofTo ?? 0 } : undefined;
      const own = this.o.engine().settings;
      const rep = await findEdgesAsync(samples ?? (await this.o.store.loadSamplesAsync(this.o.sampleDays)), { placeboRuns: 5, horizonMs: this.horizonMs(), incumbent, own });
      if (rep.own) this.ownMeasure = { ...rep.own, at: rep.generatedAt };
      const before = new Set(this.lastEdges?.survivors.map((x) => x.text) ?? []);
      const fresh = rep.survivors.filter((x) => !before.has(x.text));
      this.lastEdges = rep;
      if (fresh.length) {
        const lines = fresh.slice(0, 3).map((x) => `• ${x.text}: ${(x.holdout.mean * 100).toFixed(1)}% per trade on unseen data (${x.holdout.n} trades)`);
        const trusted = rep.placebo.avgSurvivors <= AUTOPILOT.maxPlacebo;
        const next = !this.o.engine().settings.autopilot
          ? "Paper-trade it from the Learn tab, or turn the autopilot on (Bot tab)."
          : trusted
            ? "The autopilot picks the best one by itself (with real money, only one at the go-live bar)."
            : `The autopilot is not using them: on shuffled data the same search "found" ${rep.placebo.avgSurvivors.toFixed(1)} rules per run, so these may be luck.`;
        this.o.onEdges?.(`🔎 Edge finder: ${fresh.length} new rule${fresh.length > 1 ? "s" : ""} held up on data the search never saw.\n${lines.join("\n")}\n${next}`);
      }
      this.o.store.saveEdges(rep);
      if (rep.survivors.length) this.o.log.info("edge search", { survivors: rep.survivors.map((x) => x.text), placebo: rep.placebo.avgSurvivors });
      this.pilot();
      return rep;
    } catch (e) {
      this.o.log.error("edge search failed", { err: String(e) });
      return this.lastEdges;
    } finally {
      this.edgesRunning = false;
    }
  }

  /**
   * One Lab run (core/lab): the ideas' coins since the last run, the looks that are due, and new
   * ideas from the finished data; then the autopilot sees what it proved.
   */
  async runLab(samples?: Sample[]): Promise<LabState> {
    if (this.labRunning) return this.lab;
    this.labRunning = true;
    try {
      const before = new Map(this.lab.ideas.map((i) => [i.id, i.status]));
      const res = await runLabAsync(samples ?? (await this.o.store.loadSamplesAsync(this.o.sampleDays)), this.lab, { now: Date.now(), horizonMs: this.horizonMs() });
      this.lab = res.state;
      for (const text of this.labPending.splice(0)) {
        const r = addLabIdea(this.lab, text);
        if (r.ok) this.lab = r.state;
        else this.o.log.warn("lab idea not added", { text, error: r.error });
      }
      this.takeLabInbox();
      this.saveLab();
      const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
      for (const i of res.proven)
        this.o.onLab?.(
          `🧪 Lab: an idea ${i.source === "you" ? "of yours" : "it invented"} held up on ${i.proof!.n} coins that came after it — ${i.text}. ${pct(i.proof!.mean)} per trade (worst case ${pct(i.proof!.lo)}). ${this.o.engine().settings.autopilot ? "The autopilot weighs it like any proven rule." : "Turn the autopilot on to let it be used."}`,
        );
      for (const i of this.lab.ideas)
        if (i.provenAt && i.status === "retired" && before.get(i.id) === "proven") this.o.onLab?.(`🧪 Lab: "${i.text}" ${i.why}.`);
      if (res.proven.length || res.added.length) this.o.log.info("lab", { proven: res.proven.map((i) => i.code), added: res.added.map((i) => i.code) });
      this.pilot();
      return this.lab;
    } catch (e) {
      this.o.log.error("lab run failed", { err: String(e) });
      return this.lab;
    } finally {
      this.labRunning = false;
    }
  }

  /**
   * Ideas left in data/lab-inbox.txt — one rule per line in the Lab's format, lines starting with
   * # skipped — join the Lab at its next run like ideas typed in the dashboard: a session working
   * on this computer can hand the bot rules to prove on the coins that come after them. What
   * became of each line is appended to data/lab-inbox.done.txt.
   */
  takeLabInbox(now = Date.now()): string[] {
    const file = join(this.o.store.dir, "lab-inbox.txt");
    if (!existsSync(file)) return [];
    let lines: string[];
    try {
      lines = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      rmSync(file);
    } catch (e) {
      this.o.log.warn("lab inbox unreadable", { err: String(e) });
      return [];
    }
    const at = new Date(now).toISOString().slice(0, 16).replace("T", " ");
    const done = lines.map((text) => {
      const r = addLabIdea(this.lab, text, now);
      if (!r.ok) return `${at} not added: ${text} — ${r.error}`;
      this.lab = r.state;
      return `${at} added: ${r.idea.code}`;
    });
    try {
      if (done.length) appendFileSync(join(this.o.store.dir, "lab-inbox.done.txt"), `${done.join("\n")}\n`);
    } catch (e) {
      this.o.log.warn("lab inbox log failed", { err: String(e) });
    }
    return done;
  }

  private saveLab() {
    try {
      this.o.store.saveLab(this.lab);
    } catch (e) {
      this.o.log.warn("lab save failed", { err: String(e) });
    }
  }

  /** Adds your own idea to the Lab (text, see core/lab parseLabRule). */
  addLabIdea(text: string): { ok: true; note: string } | { ok: false; error: string } {
    const p = parseLabRule(text);
    if ("error" in p) return { ok: false, error: p.error };
    if (this.labRunning) {
      this.labPending.push(text);
      return { ok: true, note: "Added — the Lab is running right now; it joins the tests in a moment. Only coins from now on count for it." };
    }
    const r = addLabIdea(this.lab, text);
    if (!r.ok) return r;
    this.lab = r.state;
    this.saveLab();
    return { ok: true, note: `Testing: ${r.idea.text}. Only coins from now on count for it; it is first judged after ${LAB.looks[0]} finished coins (the first ones finish about ${Math.round(this.horizonMs() / 3_600_000)} hours from now).` };
  }

  /** What the dashboard shows about the Lab. */
  labView() {
    return labView(this.lab);
  }

  /** The Lab's summary to paste into a chat with Claude. */
  labSummary() {
    const engine = this.o.engine();
    const s = engine.settings;
    const own = trackRecord(s, engine.closed.toArray(), Date.now());
    const record = own ? `its last ${own.n} ${s.mode} trades made ${(own.mean * 100).toFixed(1)}% each on average` : undefined;
    return labSummary(this.lab, { rule: ruleSummary(s), record });
  }

  /** The autopilot's decision for this moment, applied (after every search, every 10 minutes, at start, and when the mode or the autopilot switch changes). */
  pilot() {
    if (this.piloting) return;
    this.piloting = true;
    try {
      const engine = this.o.engine();
      const now = Date.now();
      const d = decideAutopilot({
        report: this.lastEdges,
        settings: engine.settings,
        state: this.autopilot,
        closed: engine.closed.toArray(),
        now,
        extra: labProofs(this.lab, now),
        forward: this.autopilot.active ? labForward(this.lab, this.autopilot.active) : undefined,
        measured: this.ownMeasure,
        measuring: this.measuring || this.measureAgain,
      });
      this.autopilot = d.state;
      if (d.settings) {
        engine.updateSettings(d.settings, "autopilot");
        engine.persistNow();
      }
      engine.autoHold = d.state.holding ? d.state.holdReason || "no rule proven for real money" : null;
      if (d.note) {
        this.o.log.info(`autopilot: ${d.note}`);
        this.o.onAutopilot?.(`🤖 Autopilot: ${d.note}`);
      }
      if (d.note || d.action !== "none") {
        try {
          this.o.store.saveAutopilot(this.autopilot);
        } catch (e) {
          this.o.log.warn("autopilot state save failed", { err: String(e) });
        }
      }
    } finally {
      this.piloting = false;
    }
  }

  /**
   * The engine's settings changed: turning the autopilot on or off, or a new mode, is acted on at
   * once; a rule you pick by hand with the autopilot on competes with the proven ones (picked).
   */
  onSettings(s: Settings, why?: { by: "user" | "autopilot"; prev: Settings }) {
    const was = this.seen;
    this.seen = { autopilot: s.autopilot, mode: s.mode };
    if (why?.by === "user" && why.prev.autopilot && s.autopilot && ruleChanged(why.prev, s)) return this.picked(s, why.prev);
    if (!was || was.autopilot !== s.autopilot || was.mode !== s.mode) this.pilot();
  }

  /**
   * Runs the self-check. With `samples` (the cycle's, from disk) recordings are compared with the
   * last 7 days of real trades; without, the latest such comparison is kept and the quick checks
   * are redone. A check that turns bad, or recovers, is sent at once.
   */
  selfCheck(samples?: Sample[]) {
    try {
      const engine = this.o.engine();
      const now = Date.now();
      let checks = runChecks({
        now,
        closed: engine.closed.toArray(),
        samples: samples ?? engine.samples.toArray(),
        mode: engine.settings.mode,
        autopilotOn: engine.settings.autopilot,
        autopilot: this.autopilot,
        learning: { everyHours: this.o.everyHours, lastRun: this.lastRun, lastError: this.lastError, edgesAt: this.lastEdges?.generatedAt ?? 0, startedAt: this.startedAt },
        engine: { errors: engine.stats.errors, saveFailures: engine.saved.failures, saveError: engine.saved.error, feedDown: engine.feedOutage() },
        storage: this.o.storage?.(),
      });
      if (samples) this.recordedCheck = checks.find((c) => c.key === "recorded") ?? null;
      else if (this.recordedCheck) checks = checks.map((c) => (c.key === "recorded" ? this.recordedCheck! : c));
      for (const msg of checkChanges(this.checkState, checks)) {
        this.o.log.warn(msg);
        this.o.onCheck?.(msg);
      }
      this.checkState = new Map(checks.map((c) => [c.key, c.status]));
      this.checks = checks;
      this.checksAt = now;
      if (now - this.lastDaily >= 24 * 3_600_000) this.daily(now);
    } catch (e) {
      this.o.log.error("self-check failed", { err: String(e) });
    }
  }

  /** Once a day: what the bot did, the rule it trades and how that goes, and every check. */
  private daily(now: number) {
    const engine = this.o.engine();
    const s = engine.settings;
    const day = engine.closed.toArray().filter((p) => p.status === "closed" && p.mode === s.mode && (p.closedAt ?? 0) >= now - 24 * 3_600_000);
    const wins = day.filter((p) => (p.pnl ?? 0) > 0).length;
    const pnl = day.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
    const rule = this.checks.find((c) => c.key === "rule");
    const lines = [
      `🩺 <b>Daily check-up</b> (${s.mode})`,
      `Last 24 h: ${day.length} trades, ${wins} won, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} SOL.`,
      s.autopilot && this.autopilot.active ? `Autopilot trades: ${this.autopilot.active}` : `Rule: your own${s.autopilot ? " (autopilot on, nothing proven to switch to)" : ""}.`,
      rule ? rule.detail : "",
      `Self-check: ${checksSummary(this.checks)}`,
      ...this.checks.filter((c) => c.status === "warn" || c.status === "fail").map((c) => `• ${c.title}: ${c.detail}`),
    ].filter(Boolean);
    this.o.onCheck?.(lines.join("\n"));
    this.lastDaily = now;
    try {
      this.o.store.saveSelfCheck({ lastDaily: now });
    } catch (e) {
      this.o.log.warn("self-check state save failed", { err: String(e) });
    }
  }

  /** What the dashboard shows about the self-check. */
  checksView() {
    return { checks: this.checks, at: this.checksAt, summary: checksSummary(this.checks) };
  }

  /** What the dashboard shows about the autopilot. */
  autopilotView() {
    const now = Date.now();
    const engine = this.o.engine();
    return autopilotView({
      report: this.lastEdges,
      settings: engine.settings,
      state: this.autopilot,
      now,
      extra: labProofs(this.lab, now),
      forward: this.autopilot.active ? labForward(this.lab, this.autopilot.active) : undefined,
      closed: engine.closed.toArray(),
      measured: this.ownMeasure,
      measuring: this.measuring || this.measureAgain,
      horizonMs: this.horizonMs(),
    });
  }

  /** Paper mode + autoTune (and the autopilot off): adopt a robustly better TP/SL/score combination. */
  autoTune(samples: ReturnType<DataStore["loadSamples"]>) {
    const engine = this.o.engine();
    const s = engine.settings;
    if (!s.autoTune || s.mode !== "paper" || s.autopilot) return;
    const r = buildReport(samples, s, engine.model, engine.closed.toArray(), Date.now());
    if (!r.suggestion) return;
    const g = r.suggestion;
    if (g.minScore === s.minScore && g.tpPct === s.tpPct && g.slPct === s.slPct) return;
    engine.updateSettings({ minScore: g.minScore, tpPct: g.tpPct, slPct: g.slPct });
    engine.persistNow();
    const msg = `🎯 Auto-tune (paper): now score ≥ ${g.minScore}, TP ${g.tpPct}%, SL ${g.slPct}% — ${g.why}`;
    this.o.log.info(msg);
    this.o.onTune?.(msg);
  }

  /** Retrain now (the dashboard's button), then search for rules and let the autopilot act. */
  async run(trigger: LearnRun["trigger"] = "manual"): Promise<TrainReport[]> {
    if (this.running) return this.lastReports;
    const samples = await this.o.store.loadSamplesAsync(this.o.sampleDays);
    const reports = await this.learn(samples, trigger);
    void this.findEdges(samples);
    return reports;
  }

  /** Retrains the scorer on `samples` and switches models when the new one wins on coins neither has seen. */
  private async learn(samples: ReturnType<DataStore["loadSamples"]>, trigger: LearnRun["trigger"]): Promise<TrainReport[]> {
    if (this.running) return this.lastReports;
    this.running = true;
    const started = Date.now();
    try {
      const engine = this.o.engine();
      const current = engine.model;
      const rows = trainingRows(samples, current.target, { horizonMs: this.horizonMs() });
      const { model, reports } = await trainAndSelectAsync(current, rows, { now: Date.now() });
      this.lastReports = reports;
      this.lastRun = Date.now();
      this.lastError = "";
      if (reports.some((r) => r.adopted) && !engine.setModel(model)) {
        // never expected: a model the engine refuses is not saved or announced
        this.o.log.error("trained model failed validation — kept the current one", { version: model.version });
      } else if (reports.some((r) => r.adopted)) {
        this.o.store.saveModel(model);
        this.o.log.info("new scoring model adopted", {
          version: model.version,
          reports: reports.map((r) => ({ stage: r.stage, recipe: r.recipe, trees: r.treeCount, auc: r.candidate.auc, was: r.current.auc, fresh: r.freshRows })),
        });
        const anchored = reports.some((r) => r.adopted && !current.stages[r.stage].scale);
        this.o.onAdopt?.(adoptionNote(reports, { anchored }), model);
      } else this.o.log.info("model kept", { reasons: reports.map((r) => `${r.stage}: ${r.reason}`) });
      this.lastFresh = await freshCheckAsync(engine.model, samples, { horizonMs: this.horizonMs() });
      this.history = [...this.history, learnRunOf(reports, { at: this.lastRun, trigger, version: engine.model.version, rows: rows.length, ms: Date.now() - started })].slice(-50);
      try {
        this.o.store.saveLearnHistory(this.history);
      } catch (e) {
        this.o.log.warn("learning history save failed", { err: String(e) });
      }
      this.autoTune(samples);
      return reports;
    } catch (e) {
      this.lastError = String(e);
      this.o.log.error("learning run failed", { err: String(e) });
      return [];
    } finally {
      this.running = false;
      if (this.nextCycle) this.nextRun = this.learnDueAfter(this.nextCycle);
    }
  }
}
