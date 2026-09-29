/**
 * Outcome tracker — the honest scorekeeper.
 *
 * For every eligible token it opens HYPOTHETICAL positions at fixed checkpoints (age,
 * curve progress, time since graduation) and at every score signal, then follows the
 * real price path to see which target/stop combination would have been hit first,
 * including execution delay on both entry and exit. Resolved hypotheticals become
 * labelled samples: they train the model and power the "does score 75+ actually win?"
 * tables. Checkpoints sample tokens regardless of score, so the calibration by score
 * bucket is not biased by the bot's own choices.
 */
import { LAMPORTS_PER_SOL, ammFeesForMcapSol } from "./curve.js";
import { type CostModel, quoteBuy } from "./positions.js";
import type { TokenState } from "./token.js";
import { newId } from "./util.js";

/** Exit alternatives every would-be trade is followed for (take profit × stop loss, %). */
/** A PumpSwap fee tier as a fraction (creator + protocol + LP, in basis points). */
function sumBps(f: { creator: number; protocol: number; lp: number }): number {
  return (f.creator + f.protocol + f.lp) / 10_000;
}

export const GRID_TP = [25, 50, 75, 100, 150, 200, 300, 500] as const;
export const GRID_SL = [10, 20, 30, 40, 50, 70] as const;
export const GRID: ReadonlyArray<{ tp: number; sl: number }> = GRID_TP.flatMap((tp) => GRID_SL.map((sl) => ({ tp, sl })));
/** Layout of `grid`/`gridT` in stored samples (v1 was 5 × 4 and had no timing). */
export const GRID_VERSION = 2;
/** Minutes after entry at which a would-be position's value is recorded, for time exits. */
export const PATH_MIN = [5, 10, 30, 60, 120] as const;

/** Conditions at the moment of the signal, in the units the bot's filters use. */
export interface EntryFacts {
  mcap: number;
  age: number;
  buyers: number;
  top10: number;
  bundle: number;
  devShare: number;
  devSold: number;
  socials: number;
  launches24h: number;
}

/** Score levels at which every coin's first crossing is followed as a would-be entry. */
export const ENTRY_LEVELS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95] as const;

/**
 * checkpoint: a snapshot at a fixed age or curve progress (what the model trains on)
 * signal:     the moment the coin crossed the user's own threshold (exact settings)
 * entry:      the first moment the coin reached one of ENTRY_LEVELS (tag `x75` …) — how the
 *             bot would have entered at that threshold, used to compare thresholds honestly
 * moment:     a point in the coin's life you chose (Settings.moments: some time after launch or
 *             after graduating), recorded like a checkpoint for rules at it; the score does not
 *             train on it, so what it learns does not depend on the moments you pick
 */
export type SampleKind = "checkpoint" | "signal" | "entry" | "moment";

/**
 * Why a recording stopped being watched: "pool" — its PumpSwap pool was no longer followed;
 * "feed" — the trade feed went quiet; "stop" — the bot stopped (a restart, an update), and the
 * recording was written as far as it had been watched instead of being lost (OutcomeTracker.endAll).
 */
export type BlindBy = "pool" | "feed" | "stop";

export interface Sample {
  id: string;
  kind: SampleKind;
  tag: string;
  mint: string;
  symbol: string;
  ts: number;
  stage: "curve" | "amm";
  score: number;
  p: number;
  x: number[];
  entryMcap: number;
  /** result for the custom (settings) combo at creation */
  tp: number;
  sl: number;
  /** 1 = target hit before stop for the custom combo */
  y: 0 | 1;
  /** net return (fraction) for the custom combo, execution delay included */
  ret: number;
  exit: "tp" | "sl" | "timeout" | "dead";
  /** net returns for GRID combos, same order as GRID */
  grid: number[];
  /** GRID layout version; samples from another layout are not compared */
  gv?: number;
  /** seconds from entry until each GRID combo exited (target/stop hit, or the coin died/timed out) */
  gridT?: number[];
  /** net return if sold at each PATH_MIN horizon; null once every combo had exited */
  path?: (number | null)[];
  /** entry conditions (signal and entry samples) */
  f?: EntryFacts;
  /**
   * seconds after entry at which the coin's price stopped reaching us (its PumpSwap pool was no
   * longer followed, the trade feed went quiet, or the bot stopped); exits after that were not
   * observed and are unknown (comboObserved). Missing: observed to the end.
   */
  blind?: number;
  /** why `blind` (see BlindBy) */
  blindBy?: BlindBy;
  /**
   * 1: recorded while `blind` was tracked. Older graduated-coin samples froze at their last price
   * once their pool stopped being followed, without saying when, so none of their exits is trusted.
   */
  ov?: number;
  maxMult: number;
  minMult: number;
  secToMax: number;
  resolvedAt: number;
}

/**
 * Exit alternatives are tracked in one packed array per would-be trade (thousands are open
 * at once): combo i occupies SLOT numbers from i·SLOT. Combo 0 is the user's own TP/SL,
 * combo i > 0 is GRID[i − 1].
 */
const SLOT = 5;
const STATE = 0; // 0 open, 1 exit pending (landing delay), 2 resolved
const KIND = 1; // index into KINDS
const EXIT_AT = 2;
const TIME = 3; // seconds from entry to the exit trigger
const RET = 4;
const KINDS = ["timeout", "tp", "sl", "dead"] as const;
const K_TP = 1;
const K_SL = 2;
const COMBOS = 1 + GRID.length;
const TP_UP = Float64Array.from(GRID, (g) => 1 + g.tp / 100);
const SL_DOWN = Float64Array.from(GRID, (g) => 1 - g.sl / 100);

interface Hypo {
  id: string;
  kind: SampleKind;
  tag: string;
  mint: string;
  symbol: string;
  ts: number;
  stage: "curve" | "amm";
  score: number;
  p: number;
  x: number[];
  entryAt: number;
  entered: boolean;
  entryMcap: number;
  a: number;
  b: number;
  maxMult: number;
  minMult: number;
  maxAt: number;
  /** the user's own TP/SL (combo 0) */
  ctp: number;
  csl: number;
  c: Float64Array;
  open: number;
  path: (number | null)[];
  pathNext: number;
  f?: EntryFacts;
  /** when the price stopped being observed (ms), and why */
  blind?: number;
  blindBy?: BlindBy;
  /** the latest net multiple seen */
  lastM: number;
}

/**
 * Whether GRID combo `gi` of a sample ended (target, stop, or the coin's end) while its price was
 * still observed. A stop that was never seen because nobody was watching is not a win.
 */
export function comboObserved(s: Pick<Sample, "blind" | "gridT" | "ov" | "stage">, gi: number): boolean {
  const t = s.gridT?.[gi];
  return seenAt(s, t ?? Infinity);
}

/**
 * Whether a sample's result for an exit counts as evidence about a rule: the exit came `exitSec`
 * after entry, and the rule holds at most `windowSec` (its time limit; Infinity when it holds
 * until the target, the stop or the end of the recording).
 *
 * Seen is not enough. Keeping every exit seen before the price stopped reaching us keeps the quick
 * ones and leaves out the slow ones — and quick exits are mostly targets when the target is near
 * and the stop far — so the rule would look better than it is. When watching stopped for reasons
 * that have nothing to do with the coin's price (a graduated coin's pool made way for newer ones,
 * the feed went quiet), a sample therefore counts only if it was watched for the rule's whole
 * window, however it ended: which samples count is then a matter of luck, not of their results.
 * A coin bought on the bonding curve can only lose its price by graduating — itself a result, the
 * curve's biggest one — so leaving those out would leave out the winners; for them the exit only
 * needs to have been seen (see comboObserved).
 */
export function counts(s: Pick<Sample, "blind" | "blindBy" | "ov" | "stage">, exitSec: number, windowSec = Infinity): boolean {
  if (s.ov === undefined && s.stage === "amm") return false;
  if (s.blind === undefined) return true;
  if (s.stage === "amm" || s.blindBy === "feed" || s.blindBy === "stop") return windowSec <= s.blind;
  return Math.min(exitSec, windowSec) <= s.blind;
}

/** Whether GRID combo `gi` (held until its target, stop or the end of the recording) counts as evidence (see counts). */
export function comboCounts(s: Pick<Sample, "blind" | "blindBy" | "gridT" | "ov" | "stage">, gi: number): boolean {
  return counts(s, s.gridT?.[gi] ?? Infinity);
}

/** Whether the sample's price was still observed `sec` seconds after entry (see Sample.blind, Sample.ov). */
export function seenAt(s: Pick<Sample, "blind" | "ov" | "stage">, sec: number): boolean {
  if (s.ov === undefined && s.stage === "amm") return false;
  return s.blind === undefined || sec <= s.blind;
}

export interface OutcomeOptions {
  latencyMs: number;
  sizeSol: number;
  horizonMs: number;
  maxOpen: number;
  costs: CostModel;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export class OutcomeTracker {
  private byMint = new Map<string, Hypo[]>();
  private openCount = 0;
  dropped = 0;
  resolvedCount = 0;

  constructor(
    private opts: OutcomeOptions,
    private sink: (s: Sample) => void,
  ) {}

  setOptions(o: Partial<OutcomeOptions>) {
    this.opts = { ...this.opts, ...o };
  }

  get open() {
    return this.openCount;
  }

  has(mint: string, tag: string) {
    return this.byMint.get(mint)?.some((h) => h.tag === tag) ?? false;
  }

  /** Coins with would-be trades still being followed. */
  openMints(): IterableIterator<string> {
    return this.byMint.keys();
  }

  /**
   * The coin's price no longer reaches us (its pool is not followed any more): its would-be
   * trades keep their exits up to `at`; what happens after is unknown. Not yet entered ones are
   * dropped — their entry could not be seen.
   */
  blindMint(mint: string, at: number, by: BlindBy = "pool") {
    const list = this.byMint.get(mint);
    if (!list) return;
    for (const h of [...list]) {
      if (!h.entered) {
        this.remove(h);
        continue;
      }
      if (h.blind !== undefined) continue;
      h.blind = Math.max(at, h.ts);
      h.blindBy = by;
      // exits already triggered and landing: at the last price seen, not one seen later
      for (let i = 0; i < COMBOS; i++) if (h.c[i * SLOT + STATE] === 1) this.resolveCombo(h, i, h.lastM);
      if (h.open === 0) this.emit(h, at);
    }
  }

  /** The trade feed went quiet at `at`: nothing open is observed from then on. */
  blindAll(at: number) {
    for (const mint of [...this.byMint.keys()]) this.blindMint(mint, at, "feed");
  }

  /**
   * The bot is stopping (a restart, an update): every open would-be trade is written now, as
   * watched up to `at`, instead of being lost with the process. Like a trade-feed outage, each then
   * counts only for rules whose whole window it was watched through (counts); exits it had not
   * reached are written past any window (at the horizon), so they are never taken for results.
   * Losing them instead would drop mostly the coins still alive at the stop — a bias.
   */
  endAll(at: number) {
    const timeout = KINDS.indexOf("timeout");
    for (const list of [...this.byMint.values()]) {
      for (const h of [...list]) {
        if (!h.entered) {
          this.remove(h);
          continue;
        }
        if (h.blind === undefined) {
          h.blind = Math.max(at, h.ts);
          h.blindBy = "stop";
        }
        for (let i = 0; i < COMBOS; i++) {
          const o = i * SLOT;
          if (h.c[o + STATE] === 2) continue;
          // exits already triggered and landing: at the last price seen
          if (h.c[o + STATE] !== 1) {
            h.c[o + KIND] = timeout;
            h.c[o + TIME] = this.opts.horizonMs / 1000;
          }
          this.resolveCombo(h, i, h.lastM);
        }
        this.emit(h, at);
      }
    }
  }

  add(
    t: TokenState,
    kind: SampleKind,
    tag: string,
    now: number,
    score: number,
    p: number,
    x: number[],
    custom: { tp: number; sl: number },
    facts?: EntryFacts,
  ): boolean {
    if (this.openCount >= this.opts.maxOpen) {
      this.dropped++;
      return false;
    }
    const h: Hypo = {
      id: newId("h"),
      kind,
      tag,
      mint: t.mint,
      symbol: t.symbol,
      ts: now,
      stage: t.stage === "amm" ? "amm" : "curve",
      score,
      p,
      x,
      entryAt: now + this.opts.latencyMs,
      entered: false,
      entryMcap: 0,
      a: 0,
      b: 0,
      maxMult: 1,
      minMult: 1,
      maxAt: now,
      ctp: custom.tp,
      csl: custom.sl,
      c: new Float64Array(COMBOS * SLOT),
      open: COMBOS,
      path: PATH_MIN.map(() => null),
      pathNext: 0,
      f: facts,
      lastM: 1,
    };
    let list = this.byMint.get(t.mint);
    if (!list) {
      list = [];
      this.byMint.set(t.mint, list);
    }
    list.push(h);
    this.openCount++;
    if (this.opts.latencyMs === 0) this.enter(h, t, now);
    return true;
  }

  private enter(h: Hypo, t: TokenState, now: number) {
    const size = this.opts.sizeSol * LAMPORTS_PER_SOL;
    const q = quoteBuy(t, size, this.opts.costs, 0, true);
    if (!q.ok || q.tokens <= 0 || t.mcapSol <= 0) {
      // could not have bought (e.g. migrating) — drop silently
      this.remove(h);
      return;
    }
    h.entered = true;
    h.entryMcap = t.mcapSol;
    // Net liquidation multiple is ~linear in market cap: mult = a·mcap − b
    // PumpSwap charges by market cap — 1.25% a side under 420 SOL, falling to 0.30% above
    // ~98,000 (AMM_FEE_TIERS, matched to the official SDK). The buy side already pays the right
    // tier, because it is priced through poolBuyQuote; the sell side used to assume 1.25% for
    // every graduated coin, so every recording of a large one was up to 0.95 points too harsh.
    // On the curve the fee really is a flat 1.25%.
    const venueFee = t.stage === "amm" ? sumBps(ammFeesForMcapSol(t.mcapSol)) : 0.0125;
    const sellFee = venueFee + this.opts.costs.platformFeePct / 100;
    const tokensUi = q.tokens / 1e6;
    const pricePerMcap = 1e6 / t.supply; // SOL per whole token per 1 SOL of mcap
    h.a = (tokensUi * pricePerMcap * (1 - sellFee)) / this.opts.sizeSol;
    h.b = (this.opts.costs.priorityFeeSol - (this.opts.costs.refundRent ? this.opts.costs.ataRentSol : 0)) / this.opts.sizeSol;
    h.ts = now;
    h.lastM = this.mult(h, t.mcapSol);
  }

  private mult(h: Hypo, mcap: number) {
    return h.a * mcap - h.b;
  }

  /** Records the value at each time-exit horizon that has passed (and keeps the extremes in step). */
  private capturePath(h: Hypo, now: number, m: number) {
    if (m > h.maxMult) {
      h.maxMult = m;
      h.maxAt = now;
    }
    if (m < h.minMult) h.minMult = m;
    while (h.pathNext < PATH_MIN.length && now - h.ts >= PATH_MIN[h.pathNext]! * 60_000) h.path[h.pathNext++] = Math.max(-1, m - 1);
  }

  /** Price update for a token (call after every applied trade / quote). */
  onPrice(t: TokenState, now: number) {
    const list = this.byMint.get(t.mint);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i]!;
      if (!h.entered) {
        if (now >= h.entryAt) this.enter(h, t, now);
        continue;
      }
      if (t.stage === "migrating") continue; // untradeable while migrating
      const m = this.mult(h, t.mcapSol);
      if (h.blind === undefined) h.lastM = m;
      if (m > h.maxMult) {
        h.maxMult = m;
        h.maxAt = now;
      }
      if (m < h.minMult) h.minMult = m;
      this.capturePath(h, now, m);
      const c = h.c;
      for (let i = 0; i < COMBOS; i++) {
        const o = i * SLOT;
        const state = c[o + STATE];
        if (state === 2) continue;
        if (state === 1) {
          if (now >= c[o + EXIT_AT]!) this.resolveCombo(h, i, m);
          continue;
        }
        if (m >= (i === 0 ? 1 + h.ctp / 100 : TP_UP[i - 1]!)) this.trigger(h, i, K_TP, now, m);
        else if (m <= (i === 0 ? 1 - h.csl / 100 : SL_DOWN[i - 1]!)) this.trigger(h, i, K_SL, now, m);
      }
      if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout", now);
      else if (h.open === 0) this.emit(h, now);
    }
  }

  private trigger(h: Hypo, i: number, kind: number, now: number, m: number) {
    const o = i * SLOT;
    h.c[o + KIND] = kind;
    h.c[o + TIME] = (now - h.ts) / 1000;
    if (this.opts.latencyMs <= 0) this.resolveCombo(h, i, m);
    else {
      h.c[o + STATE] = 1;
      h.c[o + EXIT_AT] = now + this.opts.latencyMs;
    }
  }

  private resolveCombo(h: Hypo, i: number, m: number) {
    const o = i * SLOT;
    if (h.c[o + STATE] === 2) return;
    h.c[o + STATE] = 2;
    h.c[o + RET] = Math.max(-1, m - 1);
    h.open--;
  }

  private finish(h: Hypo, m: number, kind: "timeout" | "dead", now: number) {
    const end = Math.min(now, h.ts + this.opts.horizonMs);
    this.capturePath(h, end, m);
    for (let i = 0; i < COMBOS; i++) {
      const o = i * SLOT;
      const state = h.c[o + STATE];
      if (state === 2) continue;
      if (state === 0) {
        h.c[o + KIND] = KINDS.indexOf(kind);
        h.c[o + TIME] = (end - h.ts) / 1000;
      }
      this.resolveCombo(h, i, m);
    }
    this.emit(h, h.ts + this.opts.horizonMs);
  }

  private emit(h: Hypo, now: number) {
    this.remove(h);
    if (!h.entered) return;
    const c = h.c;
    const kind0 = KINDS[c[KIND]!]!;
    const grid: number[] = [];
    const gridT: number[] = [];
    for (let i = 1; i < COMBOS; i++) {
      grid.push(r4(c[i * SLOT + RET]!));
      gridT.push(Math.round(Math.max(0, c[i * SLOT + TIME]!) * 10) / 10);
    }
    this.resolvedCount++;
    this.sink({
      id: h.id,
      kind: h.kind,
      tag: h.tag,
      mint: h.mint,
      symbol: h.symbol,
      ts: h.ts,
      stage: h.stage,
      score: h.score,
      p: h.p,
      x: h.x,
      entryMcap: h.entryMcap,
      tp: h.ctp,
      sl: h.csl,
      y: kind0 === "tp" ? 1 : 0,
      ret: c[RET]!,
      exit: kind0,
      grid,
      gv: GRID_VERSION,
      gridT,
      path: h.path.map((v) => (v === null ? null : r4(v))),
      f: h.f,
      ...(h.blind !== undefined ? { blind: Math.round((h.blind - h.ts) / 100) / 10, blindBy: h.blindBy } : {}),
      ov: 1,
      maxMult: h.maxMult,
      minMult: h.minMult,
      secToMax: Math.max(0, (h.maxAt - h.ts) / 1000),
      resolvedAt: now,
    });
  }

  private remove(h: Hypo) {
    const list = this.byMint.get(h.mint);
    if (!list) return;
    const i = list.indexOf(h);
    if (i >= 0) {
      list.splice(i, 1);
      this.openCount--;
    }
    if (list.length === 0) this.byMint.delete(h.mint);
  }

  /** Token left memory (idle/dead): resolve everything at its last value. */
  onTokenGone(t: TokenState, now: number) {
    const list = this.byMint.get(t.mint);
    if (!list) return;
    for (const h of [...list]) {
      if (!h.entered) {
        this.remove(h);
        continue;
      }
      this.finish(h, this.mult(h, t.mcapSol), "dead", now);
    }
  }

  /** Periodic sweep: time out hypotheticals of tokens that stopped trading. */
  sweep(now: number, tokenOf: (mint: string) => TokenState | undefined) {
    for (const [mint, list] of [...this.byMint]) {
      const t = tokenOf(mint);
      for (const h of [...list]) {
        if (!h.entered) {
          if (t && now >= h.entryAt) this.enter(h, t, now);
          else if (!t) this.remove(h);
          continue;
        }
        const m = t ? this.mult(h, t.mcapSol) : h.minMult;
        this.capturePath(h, now, m);
        // exits pending past their landing time resolve at the latest value
        for (let i = 0; i < COMBOS; i++) if (h.c[i * SLOT + STATE] === 1 && now >= h.c[i * SLOT + EXIT_AT]!) this.resolveCombo(h, i, m);
        if (h.open === 0) this.emit(h, now);
        else if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout", now);
      }
    }
  }
}
