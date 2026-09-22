import { describe, expect, it } from "vitest";
import { Engine, type PersistedState } from "../src/core/engine.js";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/core/settings.js";
import { MarketSim } from "../src/sim/market.js";
import { Scenario, T0, key } from "./helpers.js";

const MINT = key(1);
const DEV = key(2);

describe("entries", () => {
  it("score-only mode enters on the score alone; filters block it otherwise", () => {
    const strict = { maxTop10Pct: 1, maxDevPct: 0.01, minBuyers: 50 };
    const blocked = new Scenario({ scoreOnly: false, filters: { ...DEFAULT_SETTINGS.filters, ...strict } });
    blocked.create(MINT, DEV);
    blocked.buy(MINT, DEV, 1);
    blocked.crowd(MINT, 6, 0.4, 100);
    blocked.advance(3000);
    expect(blocked.positions()).toHaveLength(0);
    const recs = blocked.engine.funnel.recent.toArray();
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.decision).toBe("blocked");
    expect(recs[0]!.reason).toMatch(/^filter:/);

    const scoreOnly = new Scenario({ scoreOnly: true, filters: { ...DEFAULT_SETTINGS.filters, ...strict } });
    scoreOnly.create(MINT, DEV);
    scoreOnly.buy(MINT, DEV, 1);
    scoreOnly.crowd(MINT, 6, 0.4, 100);
    scoreOnly.advance(3000);
    const pos = [...scoreOnly.positions(), ...scoreOnly.closed()];
    expect(pos).toHaveLength(1);
    expect(pos[0]!.status).toBe("open");
    expect(pos[0]!.cost).toBeGreaterThan(0.099e9);
    expect(pos[0]!.cost).toBeLessThanOrEqual(0.1e9 + 1);
  });

  it("buys a coin only at its first crossing, not late after switching on", () => {
    const s = new Scenario({ scoreOnly: true, enabled: false });
    s.create(MINT, DEV);
    s.buy(MINT, DEV, 1);
    s.crowd(MINT, 6, 0.4, 100);
    s.advance(3000);
    const first = s.engine.funnel.recent.toArray();
    expect(first.length).toBe(1);
    expect(first[0]!.reason).toBe("bot_off");
    // switching on later does not buy the coin that already crossed…
    s.engine.updateSettings({ enabled: true });
    s.crowd(MINT, 4, 0.3, 100, 700);
    s.advance(3000);
    expect(s.positions()).toHaveLength(0);
    expect(s.engine.funnel.recent.toArray()).toHaveLength(1);
    expect(s.engine.radar({ limit: 5 })[0]!.spent).toBe(true);
    // …but a new coin that crosses while trading is on is bought
    const OTHER = key(77);
    s.create(OTHER, key(78));
    s.buy(OTHER, key(78), 1);
    s.crowd(OTHER, 6, 0.4, 100, 300);
    s.advance(3000);
    expect(s.positions().map((p) => p.mint)).toEqual([OTHER]);
  });

  it("fills at the price when the order LANDS (latency), not when it was decided", () => {
    const s = new Scenario({ scoreOnly: true, paperLatencyMs: 2000, slippagePct: 50 });
    s.create(MINT, DEV);
    s.crowd(MINT, 4, 0.3, 200);
    s.advance(300); // scored → signal → buy submitted
    const pos = s.positions()[0]!;
    expect(pos.status).toBe("opening");
    const decidedMcap = pos.signalMcapSol;
    s.buy(MINT, key(999), 5, 400); // a whale lands before our transaction
    s.advance(3000);
    expect(pos.status).toBe("open");
    expect(pos.entryMcapSol).toBeGreaterThan(decidedMcap * 1.2);
  });

  it("a price jump beyond slippage fails the buy, then retries while the score holds", () => {
    const s = new Scenario({ scoreOnly: true, paperLatencyMs: 1500, slippagePct: 5, retryWindowSec: 20 });
    s.create(MINT, DEV);
    s.crowd(MINT, 4, 0.3, 300);
    s.advance(300);
    const pos = s.positions()[0]!;
    s.buy(MINT, key(998), 8, 300); // +big move before landing
    s.advance(1500);
    expect(pos.notes.some((n) => n.includes("slippage"))).toBe(true);
    s.advance(3000);
    expect(pos.status).toBe("open"); // retry landed at the new price
    expect(pos.retries).toBeGreaterThanOrEqual(1);
  });

  it("account limits always apply: max open, already traded, bot off, kill switch", () => {
    const s = new Scenario({ scoreOnly: true, maxOpen: 1 });
    const a = key(10);
    const b = key(11);
    s.create(a, key(12));
    s.crowd(a, 4, 0.3, 400);
    s.advance(3000);
    s.create(b, key(13));
    s.crowd(b, 4, 0.3, 500);
    s.advance(3000);
    expect(s.positions()).toHaveLength(1);
    const reasons = s.engine.funnel.recent.toArray().map((r) => r.reason);
    expect(reasons).toContain("max_open");

    const off = new Scenario({ enabled: false });
    off.create(a, key(12));
    off.crowd(a, 4, 0.3, 600);
    off.advance(2000);
    expect(off.positions()).toHaveLength(0);
    expect(off.engine.funnel.recent.toArray()[0]!.reason).toBe("bot_off");

    const k = new Scenario({ scoreOnly: true });
    k.engine.setKill(true);
    k.create(a, key(12));
    k.crowd(a, 4, 0.3, 700);
    k.advance(2000);
    expect(k.positions()).toHaveLength(0);
    expect(k.engine.funnel.recent.toArray()[0]!.reason).toBe("kill_switch");
  });
});

describe("exits (net of all costs)", () => {
  function opened(settings = {}) {
    const s = new Scenario({ scoreOnly: true, paperLatencyMs: 500, ...settings });
    s.create(MINT, DEV);
    s.buy(MINT, DEV, 1.5);
    s.crowd(MINT, 4, 0.3, 800);
    s.advance(2000);
    const pos = s.positions()[0]!;
    expect(pos.status).toBe("open");
    return { s, pos };
  }

  it("takes profit at +100% net", () => {
    const { s, pos } = opened({ tpPct: 100, slPct: 50 });
    for (let i = 0; i < 40 && pos.status === "open"; i++) s.buy(MINT, key(900 + i), 1.5, 300);
    s.advance(3000);
    const c = s.closed().find((p) => p.id === pos.id)!;
    expect(c.exitReason).toBe("tp");
    expect(c.pnlPct!).toBeGreaterThan(95);
    expect(c.pnl!).toBeCloseTo(c.proceeds - c.cost, 6);
  });

  it("stops out at −50% (and a gap fills below the stop, like real life)", () => {
    // pump first with the bot off, then switch it on with re-entry (which re-arms coins that
    // already had their moment) so it buys near the top
    const s = new Scenario({ scoreOnly: true, paperLatencyMs: 500, enabled: false, tpPct: 100, slPct: 50 });
    s.create(MINT, DEV);
    s.buy(MINT, DEV, 1.5);
    s.crowd(MINT, 14, 1, 850);
    s.engine.updateSettings({ enabled: true, reentry: true });
    s.buy(MINT, key(870), 0.2, 300);
    s.advance(2000);
    const pos = s.positions()[0]!;
    expect(pos.status).toBe("open");
    s.sell(MINT, DEV, 1, 300); // dev dumps
    for (let i = 0; i < 14; i++) s.sell(MINT, key(850 + i), 1, 150);
    s.advance(3000);
    const c = s.closed().find((p) => p.id === pos.id)!;
    expect(c.exitReason).toBe("sl");
    expect(c.pnlPct!).toBeLessThanOrEqual(-50);
  });

  it("exits a dead coin so the slot is not stuck forever", () => {
    const { s, pos } = opened({ staleExitMin: 5, maxHoldMin: 0 });
    s.advance(6 * 60_000);
    const c = s.closed().find((p) => p.id === pos.id)!;
    expect(c.exitReason).toBe("dead");
  });

  it("take-initials sells the stake at TP and trails the rest", () => {
    const { s, pos } = opened({ tpPct: 100, takeInitials: true, trailPct: 30 });
    for (let i = 0; i < 40 && !pos.tpHit; i++) s.buy(MINT, key(1000 + i), 1.5, 300);
    s.advance(2000);
    expect(pos.tpHit).toBe(true);
    expect(pos.proceeds).toBeGreaterThan(pos.cost * 0.95);
    expect(pos.tokensLeft).toBeGreaterThan(0);
    for (let i = 0; i < 25; i++) s.buy(MINT, key(1100 + i), 1.5, 300);
    for (let i = 0; i < 40; i++) s.sell(MINT, key(1000 + i), 1, 150);
    s.advance(3000);
    const c = s.closed().find((p) => p.id === pos.id)!;
    expect(c.exitReason).toBe("trail");
    expect(c.pnl!).toBeGreaterThan(0);
  });

  it("new settings never change the exits of open positions", () => {
    const { s, pos } = opened({ tpPct: 100, slPct: 50 });
    s.engine.updateSettings({ tpPct: 10, slPct: 5 });
    s.buy(MINT, key(1200), 0.5, 300);
    s.advance(2000);
    expect(pos.status).toBe("open");
    expect(pos.plan.tpPct).toBe(100);
  });
});

describe("persistence & recovery", () => {
  it("restores open positions after a restart and keeps managing exits", () => {
    const s = new Scenario({ scoreOnly: true, paperLatencyMs: 500 });
    let saved: PersistedState | null = null;
    s.engine.hooks.persist = (st) => {
      saved = JSON.parse(JSON.stringify(st));
    };
    s.create(MINT, DEV);
    s.crowd(MINT, 5, 0.4, 1300);
    s.advance(3000);
    expect(saved).not.toBeNull();
    const before = s.positions()[0]!;
    // "crash": a brand-new engine loads the saved state
    const e2 = new Engine({ now: s.now, config: { seed: 3 }, model: s.engine.model });
    e2.restore(saved!);
    expect(e2.positions.size).toBe(1);
    const restored = [...e2.positions.values()][0]!;
    expect(restored.id).toBe(before.id);
    expect(restored.cost).toBe(before.cost);
    expect(e2.settings.scoreOnly).toBe(true);
    s.engine = e2;
    for (let i = 0; i < 40 && restored.status === "open"; i++) s.buy(MINT, key(1400 + i), 1.5, 300);
    s.advance(3000);
    expect(e2.closed.toArray().some((p) => p.id === before.id && p.exitReason === "tp")).toBe(true);
  });
});

describe("robustness", () => {
  it("survives garbage, duplicates and out-of-order events without throwing", () => {
    const s = new Scenario({ scoreOnly: true });
    const junk: unknown[] = [
      null, undefined, 42, "x", {}, { k: 5 }, { k: "trade" }, { k: "trade", mint: MINT, vSol: NaN, vTok: 1, sol: 1, tok: 1 },
      { k: "trade", mint: MINT, vSol: -1, vTok: -1, sol: -5, tok: -5, ts: T0 }, { k: "create" }, { k: "ammSwap" },
      { k: "quote", mint: 5 }, { k: "meta" }, { k: "migrate" }, { k: "pool", pool: 1 }, { k: "nope" },
    ];
    for (const j of junk) expect(() => s.engine.ingest(j as never)).not.toThrow();
    s.create(MINT, DEV);
    s.crowd(MINT, 5, 0.4, 1500);
    // replay the same events again (duplicates) and an out-of-order old event
    for (const ev of [...s.events]) expect(() => s.engine.ingest({ ...ev })).not.toThrow();
    expect(() => s.engine.ingest({ ...s.events[1]!, ts: T0 - 60_000 })).not.toThrow();
    s.advance(3000);
    expect(s.engine.health().badEvents).toBeGreaterThan(0);
    expect(s.positions().length + s.closed().length).toBeGreaterThanOrEqual(1);
  });

  it("settings sanitizer turns nonsense into safe values", () => {
    const x = sanitizeSettings({ minScore: 900, tpPct: -5, slPct: 500, positionSol: "abc", maxOpen: 1e9, mode: "yolo", filters: { maxDevPct: -1 } });
    expect(x.minScore).toBe(100);
    expect(x.tpPct).toBeGreaterThanOrEqual(1);
    expect(x.slPct).toBeLessThanOrEqual(99);
    expect(x.positionSol).toBe(DEFAULT_SETTINGS.positionSol);
    expect(x.maxOpen).toBeLessThanOrEqual(50);
    expect(x.mode).toBe("paper");
    expect(x.filters.maxDevPct).toBe(0);
  });

  it("paper accounting reconciles: balance + open cost − proceeds = start + realized", () => {
    const sim = new MarketSim({ durationMs: 45 * 60_000, launchesPerMin: 8, seed: 21 });
    const e = new Engine({ now: sim.opts.startTs, settings: { enabled: true, scoreOnly: true, minScore: 60, maxOpen: 4, maxTradesPerHour: 200 }, config: { seed: 5 } });
    let last = 0;
    for (const ev of sim.run()) {
      e.ingest(ev);
      if (ev.ts - last >= 250) {
        e.advance(ev.ts);
        last = ev.ts;
      }
    }
    const acc = e.account();
    expect(e.stats.entries).toBeGreaterThan(3);
    const openCost = acc.open.filter((p) => p.status !== "opening").reduce((s, p) => s + p.cost - p.proceeds, 0);
    const start = e.cfg.paperStartSol * 1e9;
    expect(Math.abs(acc.paperBalance + openCost - (start + acc.realized))).toBeLessThan(10);
    expect(e.stats.errors).toBe(0);
  });
});
