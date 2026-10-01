import { describe, expect, it } from "vitest";
import { newCurve } from "../src/core/curve.js";
import { REASON_TEXT } from "../src/core/funnel.js";
import { Scenario, key } from "./helpers.js";

describe("only coins the bot watched from launch", () => {
  it("buys one it saw created", () => {
    const s = new Scenario({ enabled: true, minScore: 0, scoreOnly: true, maxOpen: 5 });
    const mint = key(201);
    s.create(mint, key(202));
    s.crowd(mint, 10, 0.3, 2100, 600);
    s.advance(30_000);
    expect(s.engine.tokens.get(mint)!.partial).toBe(false);
    expect(s.positions().some((p) => p.mint === mint)).toBe(true);
  });

  it("refuses one it only ever met through a trade, and says why", () => {
    const s = new Scenario({ enabled: true, minScore: 0, scoreOnly: true, maxOpen: 5 });
    // no create event for this mint: the bot meets it mid-life, exactly as it meets a PumpSwap
    // pool that never came from the pump.fun curve
    const stranger = key(221);
    s.curves.set(stranger, newCurve());
    s.crowd(stranger, 10, 0.3, 2300, 600);
    s.advance(30_000);

    const t = s.engine.tokens.get(stranger)!;
    expect(t.partial).toBe(true);
    expect(s.positions().some((p) => p.mint === stranger)).toBe(false);
    const recs = s.engine.funnel.recent.toArray().filter((r) => r.mint === stranger);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.map((r) => r.reason)).toContain("not_launched_here");
  });

  it("the reason reads as words, not a code", () => {
    expect(REASON_TEXT.not_launched_here).toMatch(/never saw this coin launch/);
  });
});
