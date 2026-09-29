import { describe, expect, it } from "vitest";
import { diagnosis } from "../src/core/diagnose.js";
import { findEdges } from "../src/core/edges.js";
import { GRID, GRID_VERSION, PATH_MIN, type Sample } from "../src/core/outcomes.js";
import type { Position } from "../src/core/positions.js";
import { ruleKey, sanitizeSettings } from "../src/core/settings.js";
import { rng } from "../src/core/util.js";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 20, 12);

/** Graduated coins at 5 min after graduating over 3 days; a quarter stopped being watched early. */
function recordings(): Sample[] {
  const r = rng(4);
  return Array.from({ length: 3000 }, (_, i) => {
    const ts = NOW - 7 * HOUR - r() * 3 * 24 * HOUR;
    const grid = GRID.map((g) => (r() < 0.3 ? g.tp / 100 - 0.03 : -g.sl / 100 - 0.03));
    return {
      id: `s${i}`, kind: "checkpoint", tag: "mig300", mint: `m${i}`, symbol: "X", ts, stage: "amm", score: 60, p: 0.1, x: [], entryMcap: 300, tp: 100, sl: 50, y: 0, ret: 0,
      exit: "timeout", grid, gv: GRID_VERSION, gridT: GRID.map(() => 60 + r() * 3600), path: PATH_MIN.map(() => 0), ov: 1, maxMult: 1, minMult: 1, secToMax: 0, resolvedAt: ts + 6 * HOUR,
      ...(i % 4 === 0 ? { blind: 600, blindBy: "pool" as const } : {}),
      f: { mcap: 300, age: 5000, buyers: 200, top10: 0.2, bundle: 0.05, devShare: 0.01, devSold: 0, socials: 1, launches24h: 1 },
    } as Sample;
  });
}

describe("the diagnosis", () => {
  it("puts everything the bot sees on one page, without secrets", () => {
    const samples = recordings();
    const settings = sanitizeSettings({ entryAt: "mig300", tpPct: 50, slPct: 20, maxHoldMin: 30, scoreOnly: true, autopilot: true });
    const closed = [30, -20, 45, -20].map((pnlPct, i) => ({ id: `p${i}`, status: "closed", mode: "paper", openedAt: NOW - (10 - i) * HOUR, pnlPct, pnl: pnlPct * 1e6, exitReason: pnlPct > 0 ? "tp" : "sl", rule: ruleKey(settings) }) as unknown as Position);
    const report = findEdges(samples, { now: NOW, minHours: 12, minSamples: 500 });
    const text = diagnosis({ samples, settings, closed, autopilot: null, report, now: NOW, horizonMs: 6 * HOUR, version: "abc123" });
    expect(text).toMatch(/^SIGNAL diagnosis · 2026-09-20 12:00 UTC · version abc123/);
    expect(text).toMatch(/rule in use: 5 min after graduating · \+50% \/ −20% · 30 min/);
    // the data: how much, and how much of the graduated coins was watched to the end
    expect(text).toMatch(/- 3,000 recordings over \d+ h/);
    expect(text).toMatch(/graduated coins: 100% of recordings; 25% of those stopped being watched before they ended/);
    // each entry before any proof, the search, the rule in use and its own trades
    expect(text).toMatch(/ENTRIES ON ALL FINISHED DATA[\s\S]*- 5 min after graduating · \d+\/day · best: \+\d+% \/ −\d+%/);
    expect(text).toMatch(/LAST SEARCH[\s\S]*rules tried/);
    expect(text).toMatch(/THE RULE IN USE[\s\S]*on the newest recordings \(as the search checks candidates\): [+-]?\d/);
    expect(text).toMatch(/under this exact rule: 4 \(2 won\) · \+8\.8% per trade on average/);
    expect(text).toMatch(/CHECKS\n- /);
    expect(text).not.toMatch(/key|secret|wallet/i);
  });

  it("says so when there is nothing yet", () => {
    const text = diagnosis({ samples: [], settings: sanitizeSettings({}), closed: [], autopilot: null, report: null, now: NOW, horizonMs: 6 * HOUR });
    expect(text).toMatch(/- no recordings yet/);
    expect(text).toMatch(/LAST SEARCH \(the edge finder\)\n- none yet/);
    expect(text).toMatch(/all paper trades: none/);
  });
});
