/**
 * Simulated market in real time (DEMO / testing only — clearly labelled in the UI).
 * Runs the agent simulator and releases its events on the wall clock, optionally sped up.
 */
import type { FeedHealth } from "../../core/engine.js";
import type { AmmSwap, MarketEvent } from "../../core/types.js";
import type { Logger } from "../../core/util.js";
import { MarketSim } from "../../sim/market.js";

export class SimFeed {
  private timer: NodeJS.Timeout | null = null;
  readonly h: FeedHealth = { name: "simulator", status: "off", lastMsgAt: 0, msgs: 0, reconnects: 0, errors: 0, critical: true, note: "SIMULATED MARKET — not real coins" };

  constructor(private o: { log: Logger; speed: number; predictability: number; seed?: number; onEvent: (ev: MarketEvent | AmmSwap) => void; onHealth: (h: FeedHealth) => void }) {}

  start() {
    const speed = Math.max(0.1, this.o.speed);
    let seed = this.o.seed ?? Math.floor(Math.random() * 1e9);
    const startReal = Date.now();
    const newSim = (from: number) =>
      new MarketSim({ seed: seed++, startTs: from, durationMs: 24 * 3_600_000, predictability: this.o.predictability, launchesPerMin: 6 });
    let sim = newSim(startReal);
    let gen = sim.run();
    let pending: (MarketEvent | AmmSwap) | null = null;
    this.h.status = "open";
    this.o.log.warn("SIMULATOR feed running — events are synthetic, not real coins");
    this.timer = setInterval(() => {
      const virtualNow = startReal + (Date.now() - startReal) * speed;
      for (let i = 0; i < 20_000; i++) {
        if (!pending) {
          const n = gen.next();
          if (n.done) {
            sim = newSim(virtualNow);
            gen = sim.run();
            continue;
          }
          pending = n.value;
        }
        if (pending.ts > virtualNow) break;
        const realTs = startReal + (pending.ts - startReal) / speed;
        this.o.onEvent({ ...pending, ts: Math.round(realTs) } as MarketEvent | AmmSwap);
        this.h.msgs++;
        this.h.lastMsgAt = Date.now();
        pending = null;
      }
      this.o.onHealth({ ...this.h });
    }, 100);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.h.status = "off";
  }
}
