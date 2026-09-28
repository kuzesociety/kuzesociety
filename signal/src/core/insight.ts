/**
 * What the scoring model has learned, in plain terms, for the dashboard and Telegram:
 *   - drivers: which inputs move the score on recent coins, and how that differs from the
 *     starting assumptions (the shipped prior);
 *   - the fresh check: whether the score still ranks and prices coins it has never seen;
 *   - the learning history: what each training run tried, and what it decided and why.
 */
import { FEATURE_DEFS, FEATURE_KEYS } from "./features.js";
import { type TrainReport, auc, trainingRows } from "./learn.js";
import { type Driver, type ModelSpec, type StageKey, type StageModel, contributionPoints, priorModel, scalePrior, scoreVector } from "./model.js";
import type { Sample } from "./outcomes.js";
import { runSteps, runStepsAsync } from "./util.js";

/** Inputs shown as one: the hour of day is fed to the model as a sine and a cosine. */
const HOUR_KEYS = new Set(["hourSin", "hourCos"]);

/**
 * How much each input moves the score from one coin to the next over `xs` (feature vectors of
 * recent coins): the average distance, in points, between its part of a coin's score and its
 * average part. An input that shifts every coin by the same amount decides nothing and scores 0.
 * Also its direction, its share of all inputs' movement, and the same share for the starting
 * assumptions (the prior, scaled to these coins as the bot scales it before it has outcomes) —
 * so the dashboard can show what the bot learned against what it was told at the start.
 */
export function driversOf(model: ModelSpec, stage: StageKey, xs: ArrayLike<number>[], limit = 10): Driver[] {
  return runSteps(driversSteps(model, stage, xs, limit));
}

function* driversSteps(model: ModelSpec, stage: StageKey, xs: ArrayLike<number>[], limit = 10): Generator<void, Driver[]> {
  const n = xs.length;
  if (!n) return [];
  const d = FEATURE_KEYS.length;
  const w = d + 1; // last slot: time of day (its sine and cosine together)
  function* measure(st: StageModel) {
    const P = new Float64Array(n * w);
    for (let i = 0; i < n; i++) {
      const pts = contributionPoints(st, xs[i]!);
      for (let j = 0; j < d; j++) {
        if (HOUR_KEYS.has(FEATURE_KEYS[j]!)) P[i * w + d] += pts[j]!;
        else P[i * w + j] = pts[j]!;
      }
      if ((i & 255) === 255) yield;
    }
    const spread = new Float64Array(w);
    const dir = new Float64Array(w);
    for (let j = 0; j < w; j++) {
      let mp = 0;
      let mx = 0;
      for (let i = 0; i < n; i++) {
        mp += P[i * w + j]!;
        if (j < d) mx += xs[i]![j]!;
      }
      mp /= n;
      mx /= n;
      let dev = 0;
      let cxp = 0;
      let vx = 0;
      let vp = 0;
      for (let i = 0; i < n; i++) {
        const dp = P[i * w + j]! - mp;
        dev += Math.abs(dp);
        if (j < d) {
          const dx = xs[i]![j]! - mx;
          cxp += dx * dp;
          vx += dx * dx;
          vp += dp * dp;
        }
      }
      spread[j] = dev / n;
      dir[j] = vx > 1e-12 && vp > 1e-12 ? cxp / Math.sqrt(vx * vp) : 0;
    }
    let total = 0;
    for (let j = 0; j < w; j++) if (j >= d || !HOUR_KEYS.has(FEATURE_KEYS[j]!)) total += spread[j]!;
    return { spread, dir, total };
  }
  const mine = yield* measure(model.stages[stage]);
  const base = priorModel().stages[stage];
  const start = yield* measure({ ...base, ...scalePrior(base, xs) });
  const out: Driver[] = [];
  for (let j = 0; j < w; j++) {
    if (j < d && HOUR_KEYS.has(FEATURE_KEYS[j]!)) continue;
    const points = mine.spread[j]!;
    if (!(points > 0.05)) continue;
    const c = mine.dir[j]!;
    out.push({
      key: j < d ? FEATURE_KEYS[j]! : "hour",
      label: j < d ? FEATURE_DEFS[j]!.label : "Time of day",
      points,
      dir: j === d ? "mixed" : c >= 0.4 ? "up" : c <= -0.4 ? "down" : "mixed",
      share: mine.total > 0 ? points / mine.total : 0,
      priorShare: start.total > 0 ? start.spread[j]! / start.total : undefined,
    });
  }
  return out.sort((a, b) => b.points - a.points).slice(0, limit);
}

export interface FreshBand {
  lo: number;
  hi: number;
  n: number;
  /** average win chance the score gave these moments */
  predicted: number;
  /** share that actually won */
  actual: number;
}

export interface FreshCheck {
  stage: StageKey;
  /** moments after this were never seen by the model */
  since: number;
  n: number;
  wins: number;
  /** how often a winner scored above a loser (0.5 = a coin toss) */
  auc: number;
  /** the same measure when the model was adopted, on newer data it had not seen then */
  expected: number;
  winRate: number;
  /** win rate of the fifth that scored highest */
  topWinRate: number;
  bands: FreshBand[];
  /**
   * working: ranks coins about as well as when adopted · slipping: clearly worse ·
   * lost: no better than chance · not_enough: too few finished outcomes yet
   */
  verdict: "not_enough" | "working" | "slipping" | "lost";
}

const BANDS: [number, number][] = [
  [0, 25],
  [25, 50],
  [50, 65],
  [65, 75],
  [75, 85],
  [85, 101],
];

/** The newest row a stage learned from (earlier-trained models only record it for the whole model). */
export function seenTo(model: ModelSpec, stage: StageKey): number {
  return model.stages[stage].trainedTo ?? (model.source === "trained" ? (model.training?.to ?? -Infinity) : -Infinity);
}

/**
 * How the current model does on finished outcomes of coins it has never seen (see
 * trainingRows for why only finished ones count).
 */
export function freshCheck(model: ModelSpec, samples: Sample[], opts: FreshOptions = {}): FreshCheck[] {
  return runSteps(freshSteps(model, samples, opts));
}

/** The same, pausing every few milliseconds (a live bot scores thousands of past moments here). */
export function freshCheckAsync(model: ModelSpec, samples: Sample[], opts: FreshOptions = {}): Promise<FreshCheck[]> {
  return runStepsAsync(freshSteps(model, samples, opts));
}

export interface FreshOptions {
  horizonMs?: number;
  minRows?: number;
  minWins?: number;
}

function* freshSteps(model: ModelSpec, samples: Sample[], opts: FreshOptions): Generator<void, FreshCheck[]> {
  const rows = trainingRows(samples, model.target, { horizonMs: opts.horizonMs });
  yield;
  const minRows = opts.minRows ?? 150;
  const minWins = opts.minWins ?? 10;
  const out: FreshCheck[] = [];
  for (const stage of ["curve", "amm"] as StageKey[]) {
    const since = seenTo(model, stage);
    const mine = rows.filter((r) => r.stage === stage && r.ts > since);
    const scored: { score: number; p: number; y: number }[] = [];
    for (const r of mine) {
      scored.push({ ...scoreVector(model, stage, r.x), y: r.y });
      if ((scored.length & 1023) === 1023) yield;
    }
    const wins = scored.reduce((s, r) => s + r.y, 0);
    const a = auc(
      scored.map((r) => r.p),
      scored.map((r) => r.y),
    );
    const byScore = [...scored].sort((x, y) => y.score - x.score);
    const top = byScore.slice(0, Math.max(1, Math.floor(byScore.length / 5)));
    const expected = model.insight?.auc?.[stage] ?? NaN;
    const bands = BANDS.map(([lo, hi]) => {
      const inBand = scored.filter((r) => r.score >= lo && r.score < hi);
      const n = inBand.length;
      return {
        lo,
        hi: Math.min(hi, 100),
        n,
        predicted: n ? inBand.reduce((s, r) => s + r.p, 0) / n : NaN,
        actual: n ? inBand.reduce((s, r) => s + r.y, 0) / n : NaN,
      };
    });
    let verdict: FreshCheck["verdict"] = "working";
    if (mine.length < minRows || wins < minWins || !Number.isFinite(a)) verdict = "not_enough";
    else if (a < 0.55) verdict = "lost";
    else if (Number.isFinite(expected) && a < expected - 0.08) verdict = "slipping";
    out.push({
      stage,
      since,
      n: mine.length,
      wins,
      auc: a,
      expected,
      winRate: mine.length ? wins / mine.length : NaN,
      topWinRate: top.length ? top.reduce((s, r) => s + r.y, 0) / top.length : NaN,
      bands,
      verdict,
    });
  }
  return out;
}

/** One training run, as kept in the learning history. */
export interface LearnRun {
  at: number;
  /** what started it */
  trigger: "schedule" | "manual" | "drift" | "start";
  adopted: boolean;
  /** model in use after the run */
  version: string;
  rows: number;
  ms: number;
  stages: {
    stage: StageKey;
    adopted: boolean;
    recipe?: string;
    trees?: number;
    /** newer moments neither model had seen, where they were compared */
    fresh: number;
    before: { auc: number; logLoss: number };
    after: { auc: number; logLoss: number };
    reason: string;
  }[];
}

const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : NaN);

export function learnRunOf(reports: TrainReport[], o: { at: number; trigger: LearnRun["trigger"]; version: string; rows: number; ms: number }): LearnRun {
  return {
    ...o,
    adopted: reports.some((r) => r.adopted),
    stages: reports.map((r) => ({
      stage: r.stage,
      adopted: r.adopted,
      recipe: r.recipe,
      trees: r.treeCount,
      fresh: r.freshRows,
      before: { auc: r4(r.current.auc), logLoss: r4(r.current.logLoss) },
      after: { auc: r4(r.candidate.auc), logLoss: r4(r.candidate.logLoss) },
      reason: r.reason,
    })),
  };
}

const pct0 = (x: number) => `${(x * 100).toFixed(0)}%`;

/**
 * A short message about a newly adopted model, for Telegram. `anchored`: the previous score was
 * not anchored yet (see StageModel.scale), so the same minimum score now lets fewer coins through.
 */
export function adoptionNote(reports: TrainReport[], o: { anchored?: boolean } = {}): string {
  const lines = reports
    .filter((r) => r.adopted)
    .map((r) => {
      const where = r.stage === "amm" ? "Graduated coins" : "Bonding-curve coins";
      const how = r.recipe === "trees" ? `weighted sum + ${r.treeCount} trees, so it also learns combinations of signals` : "weighted sum";
      const was = Number.isFinite(r.current.auc) ? `, the old score ${pct0(r.current.auc)}` : "";
      return `• ${where}: on ${r.freshRows.toLocaleString("en-US")} newer moments neither score had seen, the new one ranked winners above losers ${pct0(r.candidate.auc)} of the time${was} (${how}).`;
    });
  const scale = o.anchored
    ? "\nThe score is anchored from now on: a typical coin scores 50 and the top 5% of coin moments 75, after every retrain. Your minimum score may let through fewer coins than before, and better ones."
    : "";
  return `🧠 The bot learned from its newest outcomes and switched to a better score.\n${lines.join("\n")}${scale}\nDetails: Learn tab → What the bot learned.`;
}

export interface LearningView {
  model: {
    version: string;
    source: ModelSpec["source"];
    createdAt: number;
    target: ModelSpec["target"];
    recipe: Partial<Record<StageKey, string>>;
    trees: Partial<Record<StageKey, number>>;
    rows: Partial<Record<StageKey, { total: number; entries: number }>>;
    training: ModelSpec["training"] | null;
  };
  drivers: Partial<Record<StageKey, Driver[]>>;
  /** coins of each stage the drivers were measured on */
  driverCoins: Partial<Record<StageKey, number>>;
  fresh: FreshCheck[];
  history: LearnRun[];
  status: { running: boolean; lastRun: number; nextRun: number; lastError: string; everyHours: number };
}

/**
 * Everything the dashboard shows about learning. `recent`: resolved outcomes, newest last —
 * their feature vectors describe recent coins (for the drivers), and the finished ones feed the
 * check on coins the model has not seen (see freshCheck; finished cohorts live on disk).
 */
export function learningView(model: ModelSpec, o: ViewOptions): LearningView {
  return runSteps(viewSteps(model, o));
}

/** The same, pausing every few milliseconds so trading goes on meanwhile. */
export function learningViewAsync(model: ModelSpec, o: ViewOptions): Promise<LearningView> {
  return runStepsAsync(viewSteps(model, o));
}

export interface ViewOptions {
  recent: Sample[];
  /** how long outcomes are followed (only finished cohorts are checked; 0 = all) */
  horizonMs?: number;
  history: LearnRun[];
  status: LearningView["status"];
}

function* viewSteps(model: ModelSpec, o: ViewOptions): Generator<void, LearningView> {
  const drivers: LearningView["drivers"] = {};
  const driverCoins: LearningView["driverCoins"] = {};
  for (const stage of ["curve", "amm"] as StageKey[]) {
    // fixed points in coins' lives: the whole population, not just the surges that trigger entries
    const xs: ArrayLike<number>[] = [];
    for (let i = o.recent.length - 1; i >= 0 && xs.length < 3_000; i--) {
      const s = o.recent[i]!;
      if (s.stage === stage && s.kind === "checkpoint" && s.x?.length === FEATURE_KEYS.length) xs.push(s.x);
    }
    if (xs.length >= 30) {
      drivers[stage] = yield* driversSteps(model, stage, xs);
      driverCoins[stage] = xs.length;
    }
  }
  const fresh = yield* freshSteps(model, o.recent, { horizonMs: o.horizonMs });
  const recipe: Partial<Record<StageKey, string>> = {};
  // models trained before the learner kept this record were weighted sums
  for (const stage of ["curve", "amm"] as StageKey[]) recipe[stage] = model.insight?.recipe?.[stage] ?? (!model.insight && model.source === "trained" ? "linear" : "prior");
  return {
    model: {
      version: model.version,
      source: model.source,
      createdAt: model.createdAt,
      target: model.target,
      recipe,
      trees: model.insight?.trees ?? {},
      rows: model.insight?.rows ?? {},
      training: model.training ?? null,
    },
    drivers,
    driverCoins,
    fresh,
    history: o.history,
    status: o.status,
  };
}
