/**
 * Periodic learning: retrain the scorer on the samples recorded on disk, validate it on
 * the newest data, and switch models only when the new one wins out-of-sample.
 */
import { type EdgeReport, findEdgesAsync } from "../core/edges.js";
import type { Engine } from "../core/engine.js";
import { type TrainReport, trainAndSelect } from "../core/learn.js";
import { buildReport } from "../core/report.js";
import type { Logger } from "../core/util.js";
import type { DataStore } from "./store.js";

export class Learner {
  lastRun = 0;
  lastReports: TrainReport[] = [];
  lastError = "";
  running = false;
  lastEdges: EdgeReport | null = null;
  edgesRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private o: {
      store: DataStore;
      engine: () => Engine;
      log: Logger;
      everyHours: number;
      sampleDays: number;
      onAdopt?: (version: string) => void;
      onTune?: (msg: string) => void;
      /** a rule held up on data the search never saw (only when the set of rules changes) */
      onEdges?: (msg: string) => void;
    },
  ) {}

  start() {
    this.lastEdges = (this.o.store.loadEdges() as EdgeReport | null) ?? null;
    if (this.o.everyHours <= 0) return;
    this.timer = setInterval(() => void this.run(), this.o.everyHours * 3_600_000);
    this.timer.unref?.();
    // first attempt 20 minutes after start (enough fresh data to validate on)
    setTimeout(() => void this.run(), 20 * 60_000).unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Searches the recorded outcomes for rules that made money on their own (see core/edges). */
  async findEdges(samples?: ReturnType<DataStore["loadSamples"]>): Promise<EdgeReport | null> {
    if (this.edgesRunning) return this.lastEdges;
    this.edgesRunning = true;
    try {
      const rep = await findEdgesAsync(samples ?? this.o.store.loadSamples(this.o.sampleDays), { placeboRuns: 5 });
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

  async run(): Promise<TrainReport[]> {
    if (this.running) return this.lastReports;
    this.running = true;
    try {
      const engine = this.o.engine();
      const samples = this.o.store.loadSamples(this.o.sampleDays);
      const rows = samples
        .filter((s) => s.kind === "checkpoint")
        .map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
      const { model, reports } = trainAndSelect(engine.model, rows, { now: Date.now() });
      this.lastReports = reports;
      this.lastRun = Date.now();
      this.lastError = "";
      if (reports.some((r) => r.adopted)) {
        engine.setModel(model);
        this.o.store.saveModel(model);
        this.o.log.info("new scoring model adopted", { version: model.version, reports: reports.map((r) => ({ stage: r.stage, auc: r.candidate.auc, was: r.current.auc })) });
        this.o.onAdopt?.(model.version);
      } else this.o.log.info("model kept", { reasons: reports.map((r) => `${r.stage}: ${r.reason}`) });
      this.autoTune(samples);
      void this.findEdges(samples);
      return reports;
    } catch (e) {
      this.lastError = String(e);
      this.o.log.error("learning run failed", { err: String(e) });
      return [];
    } finally {
      this.running = false;
    }
  }
}
