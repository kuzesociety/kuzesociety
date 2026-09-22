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
import { LAMPORTS_PER_SOL } from "./curve.js";
import { type CostModel, quoteBuy } from "./positions.js";
import type { TokenState } from "./token.js";
import { newId } from "./util.js";

export const GRID_TP = [25, 50, 100, 200, 400] as const;
export const GRID_SL = [20, 35, 50, 70] as const;
export const GRID: ReadonlyArray<{ tp: number; sl: number }> = GRID_TP.flatMap((tp) => GRID_SL.map((sl) => ({ tp, sl })));

export interface Sample {
  id: string;
  kind: "checkpoint" | "signal";
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
  maxMult: number;
  minMult: number;
  secToMax: number;
  resolvedAt: number;
}

interface Combo {
  tp: number;
  sl: number;
  state: 0 | 1 | 2; // 0 open, 1 exit pending (latency), 2 resolved
  exitAt: number;
  kind: "tp" | "sl" | "timeout" | "dead";
  ret: number;
}

interface Hypo {
  id: string;
  kind: "checkpoint" | "signal";
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
  combos: Combo[]; // [custom, ...GRID]
  open: number;
}

export interface OutcomeOptions {
  latencyMs: number;
  sizeSol: number;
  horizonMs: number;
  maxOpen: number;
  costs: CostModel;
}

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

  add(
    t: TokenState,
    kind: "checkpoint" | "signal",
    tag: string,
    now: number,
    score: number,
    p: number,
    x: number[],
    custom: { tp: number; sl: number },
  ): boolean {
    if (this.openCount >= this.opts.maxOpen) {
      this.dropped++;
      return false;
    }
    const combos: Combo[] = [{ tp: custom.tp, sl: custom.sl, state: 0, exitAt: 0, kind: "timeout", ret: 0 }];
    for (const g of GRID) combos.push({ tp: g.tp, sl: g.sl, state: 0, exitAt: 0, kind: "timeout", ret: 0 });
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
      combos,
      open: combos.length,
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
    const sellFee = (t.stage === "amm" ? 0.0125 : 0.0125) + this.opts.costs.platformFeePct / 100;
    const tokensUi = q.tokens / 1e6;
    const pricePerMcap = 1e6 / t.supply; // SOL per whole token per 1 SOL of mcap
    h.a = (tokensUi * pricePerMcap * (1 - sellFee)) / this.opts.sizeSol;
    h.b = (this.opts.costs.priorityFeeSol - (this.opts.costs.refundRent ? this.opts.costs.ataRentSol : 0)) / this.opts.sizeSol;
    h.ts = now;
  }

  private mult(h: Hypo, mcap: number) {
    return h.a * mcap - h.b;
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
      if (m > h.maxMult) {
        h.maxMult = m;
        h.maxAt = now;
      }
      if (m < h.minMult) h.minMult = m;
      for (const c of h.combos) {
        if (c.state === 2) continue;
        if (c.state === 1) {
          if (now >= c.exitAt) this.resolveCombo(h, c, m);
          continue;
        }
        if (m >= 1 + c.tp / 100) this.trigger(h, c, "tp", now, m);
        else if (m <= 1 - c.sl / 100) this.trigger(h, c, "sl", now, m);
      }
      if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout");
      else if (h.open === 0) this.emit(h, now);
    }
  }

  private trigger(h: Hypo, c: Combo, kind: "tp" | "sl", now: number, m: number) {
    c.kind = kind;
    if (this.opts.latencyMs <= 0) this.resolveCombo(h, c, m);
    else {
      c.state = 1;
      c.exitAt = now + this.opts.latencyMs;
    }
  }

  private resolveCombo(h: Hypo, c: Combo, m: number) {
    if (c.state === 2) return;
    c.state = 2;
    c.ret = Math.max(-1, m - 1);
    h.open--;
  }

  private finish(h: Hypo, m: number, kind: "timeout" | "dead") {
    for (const c of h.combos) {
      if (c.state === 2) continue;
      if (c.state === 0) c.kind = kind;
      this.resolveCombo(h, c, m);
    }
    this.emit(h, h.ts + this.opts.horizonMs);
  }

  private emit(h: Hypo, now: number) {
    this.remove(h);
    if (!h.entered) return;
    const c0 = h.combos[0]!;
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
      tp: c0.tp,
      sl: c0.sl,
      y: c0.kind === "tp" ? 1 : 0,
      ret: c0.ret,
      exit: c0.kind,
      grid: h.combos.slice(1).map((c) => c.ret),
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
      this.finish(h, this.mult(h, t.mcapSol), "dead");
    }
    void now;
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
        // exits pending past their landing time resolve at the latest value
        for (const c of h.combos) if (c.state === 1 && now >= c.exitAt) this.resolveCombo(h, c, m);
        if (h.open === 0) this.emit(h, now);
        else if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout");
      }
    }
  }
}
