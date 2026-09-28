/**
 * Periodic learning: retrain the scorer on the outcomes recorded on disk, compare it with the
 * current model on newer coins neither has seen, switch only when the new one wins there, and
 * keep a history of every run. Training pauses every few milliseconds, so trading never waits
 * for it. Between runs, the current model is checked on coins it has never seen; when the
 * score clearly stops working, it retrains early instead of waiting for the schedule.
 */
import { type EdgeReport, findEdgesAsync } from "../core/edges.js";
import type { Engine } from "../core/engine.js";
import { type FreshCheck, type LearnRun, adoptionNote, freshCheckAsync, learnRunOf } from "../core/insight.js";
import { type TrainReport, trainAndSelectAsync, trainingRows } from "../core/learn.js";
import type { ModelSpec } from "../core/model.js";
import { buildReport } from "../core/report.js";
import type { Logger } from "../core/util.js";
import type { DataStore } from "./store.js";

export class Learner {
  lastRun = 0;
  /** when the next scheduled run starts (0 = learning is off) */
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
  private timer: NodeJS.Timeout | null = null;
  private edgeTimer: NodeJS.Timeout | null = null;
  private driftNoted = "";
  private stopped = false;

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
    },
  ) {}

  start() {
    this.lastEdges = (this.o.store.loadEdges() as EdgeReport | null) ?? null;
    this.history = this.o.store.loadLearnHistory() as LearnRun[];
    if (this.o.everyHours <= 0) return;
    // first attempt 20 minutes after start (enough fresh data to validate on)
    this.schedule(20 * 60_000, "start");
    // the edge search runs more often than learning: its answer is what people check
    this.edgeTimer = setInterval(() => void this.periodic(), 2 * 3_600_000);
    this.edgeTimer.unref?.();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.edgeTimer) clearInterval(this.edgeTimer);
    this.nextRun = 0;
  }

  private schedule(ms: number, trigger: LearnRun["trigger"] = "schedule") {
    if (this.timer) clearTimeout(this.timer);
    this.nextRun = Date.now() + ms;
    this.timer = setTimeout(() => void this.run(trigger), ms);
    this.timer.unref?.();
  }

  private horizonMs() {
    return this.o.engine().cfg.outcomeHorizonMs;
  }

  /** Every 2 hours: the edge search, then the check of the current model on coins it has not seen. */
  private async periodic() {
    const samples = await this.o.store.loadSamplesAsync(this.o.sampleDays);
    await this.findEdges(samples);
    await this.checkDrift(samples);
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
    void this.run("drift");
  }

  /** Searches the recorded outcomes for rules that made money on their own (see core/edges). */
  async findEdges(samples?: ReturnType<DataStore["loadSamples"]>): Promise<EdgeReport | null> {
    if (this.edgesRunning) return this.lastEdges;
    this.edgesRunning = true;
    try {
      const rep = await findEdgesAsync(samples ?? (await this.o.store.loadSamplesAsync(this.o.sampleDays)), { placeboRuns: 5 });
      const before = new Set(this.lastEdges?.survivors.map((x) => x.text) ?? []);
      const fresh = rep.survivors.filter((x) => !before.has(x.text));
      this.lastEdges = rep;
      if (fresh.length) {
        const lines = fresh.slice(0, 3).map((x) => `• ${x.text}: ${(x.holdout.mean * 100).toFixed(1)}% per trade on unseen data (${x.holdout.n} trades)`);
        this.o.onEdges?.(`🔎 Edge finder: ${fresh.length} new rule${fresh.length > 1 ? "s" : ""} held up on data the search never saw.\n${lines.join("\n")}\nPaper-trade it from the Learn tab.`);
      }
      this.o.store.saveEdges(rep);
      if (rep.survivors.length) this.o.log.info("edge search", { survivors: rep.survivors.map((x) => x.text), placebo: rep.placebo.avgSurvivors });
      return rep;
    } catch (e) {
      this.o.log.error("edge search failed", { err: String(e) });
      return this.lastEdges;
    } finally {
      this.edgesRunning = false;
    }
  }

  /** Paper mode + autoTune: adopt a robustly better TP/SL/score combination. */
  autoTune(samples: ReturnType<DataStore["loadSamples"]>) {
    const engine = this.o.engine();
    const s = engine.settings;
    if (!s.autoTune || s.mode !== "paper") return;
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

  async run(trigger: LearnRun["trigger"] = "manual"): Promise<TrainReport[]> {
    if (this.running) return this.lastReports;
    this.running = true;
    const started = Date.now();
    try {
      const engine = this.o.engine();
      const samples = await this.o.store.loadSamplesAsync(this.o.sampleDays);
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
      void this.findEdges(samples);
      return reports;
    } catch (e) {
      this.lastError = String(e);
      this.o.log.error("learning run failed", { err: String(e) });
      return [];
    } finally {
      this.running = false;
      if (this.o.everyHours > 0 && !this.stopped) this.schedule(this.o.everyHours * 3_600_000);
    }
  }
}
