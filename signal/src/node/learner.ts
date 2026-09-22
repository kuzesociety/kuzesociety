/**
 * Periodic learning: retrain the scorer on the samples recorded on disk, validate it on
 * the newest data, and switch models only when the new one wins out-of-sample.
 */
import type { Engine } from "../core/engine.js";
import { type TrainReport, trainAndSelect } from "../core/learn.js";
import type { Logger } from "../core/util.js";
import type { DataStore } from "./store.js";

export class Learner {
  lastRun = 0;
  lastReports: TrainReport[] = [];
  lastError = "";
  running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private o: { store: DataStore; engine: () => Engine; log: Logger; everyHours: number; sampleDays: number; onAdopt?: (version: string) => void },
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
