/**
 * Periodic learning: retrain the scorer on the samples recorded on disk, validate it on
 * the newest data, and switch models only when the new one wins out-of-sample.
 */
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
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private o: { store: DataStore; engine: () => Engine; log: Logger; everyHours: number; sampleDays: number; onAdopt?: (version: string) => void; onTune?: (msg: string) => void },
  ) {}

  start() {
    if (this.o.everyHours <= 0) return;
    this.timer = setInterval(() => void this.run(), this.o.everyHours * 3_600_000);
    this.timer.unref?.();
    // first attempt 20 minutes after start (enough fresh data to validate on)
    setTimeout(() => void this.run(), 20 * 60_000).unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
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
