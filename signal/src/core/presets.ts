/**
 * Ready-made strategies the user can switch to with one tap. Each is a full set of the
 * settings that define the rule (entry score, which coins, exits, time limit), so switching
 * never leaves a mix of the old and the new strategy behind.
 */
import type { EdgeReport } from "./edges.js";
import { ENTRY_POINTS, type Settings } from "./settings.js";

export interface Preset {
  key: string;
  name: string;
  note: string;
  /** "unproven": found in the simulator or untested — shown with a warning */
  proof: "yours" | "unproven" | "data";
  settings: Partial<Settings>;
}

/** Settings every strategy sets, so a switch replaces the whole rule. */
const BASE: Partial<Settings> = { entryAt: "score", trailPct: 0, takeInitials: false, reentry: false, tradeCurve: true, tradeAmm: true, scoreOnly: true };

export const PRESETS: Preset[] = [
  {
    key: "plan",
    name: "Your plan",
    note: "Buy when a coin reaches 75 · sell at 2× or −50% · time limit 4 hours. Score only.",
    proof: "yours",
    settings: { ...BASE, minScore: 75, tpPct: 100, slPct: 50, maxHoldMin: 240 },
  },
  {
    key: "sim-momentum",
    name: "Simulator finding: fast momentum",
    note: "Buy when a coin reaches 95 · sell at +500% or −20%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun — paper-test it before trusting it.",
    proof: "unproven",
    settings: { ...BASE, minScore: 95, tpPct: 500, slPct: 20, maxHoldMin: 10 },
  },
];

/** Whether the current settings already follow a strategy. */
export function followsPreset(s: Settings, p: Partial<Settings>): boolean {
  for (const [k, v] of Object.entries(p)) {
    if (k === "filters") {
      for (const [fk, fv] of Object.entries(v as Settings["filters"])) if (s.filters[fk as keyof Settings["filters"]] !== fv) return false;
    } else if (s[k as keyof Settings] !== v) return false;
  }
  return true;
}

/** "score ≥ 95 · +500% / −20% · 10 min", or "halfway to graduation · +50% / −30% · 30 min" */
export function ruleSummary(s: Pick<Settings, "minScore" | "tpPct" | "slPct" | "maxHoldMin"> & { entryAt?: string }): string {
  const time = s.maxHoldMin > 0 ? (s.maxHoldMin >= 120 && s.maxHoldMin % 60 === 0 ? `${s.maxHoldMin / 60} h` : `${s.maxHoldMin} min`) : "no time limit";
  const entry = s.entryAt && s.entryAt !== "score" ? (ENTRY_POINTS[s.entryAt] ?? s.entryAt) : `score ≥ ${s.minScore}`;
  return `${entry} · +${s.tpPct}% / −${s.slPct}% · ${time}`;
}

const signedPct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/** The strategies to choose from: the ready-made ones, then up to three rules the edge finder proved on data it never saw. */
export function strategyList(report: EdgeReport | null | undefined): Preset[] {
  const found = report?.survivors?.slice(0, 3) ?? [];
  return [
    ...PRESETS,
    ...found.map((e) => ({
      key: `edge:${e.text}`,
      name: "Found in your data",
      note: `${e.text}. ${signedPct(e.holdout.mean)} per trade on ${e.holdout.n} trades the search never saw.`,
      proof: "data" as const,
      settings: e.settings,
    })),
  ];
}
