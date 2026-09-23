import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// src/core/curve.ts
var LAMPORTS_PER_SOL = 1e9;
var RAW_PER_TOKEN = 1e6;
var CURVE = {
  initialVirtualTok: 1073e12,
  initialVirtualSol: 3e10,
  initialRealTok: 7931e11,
  supply: 1e15
};
var CURVE_COMPLETE_REAL_SOL = (() => {
  const k = CURVE.initialVirtualSol * CURVE.initialVirtualTok;
  const vTokEnd = CURVE.initialVirtualTok - CURVE.initialRealTok;
  return k / vTokEnd - CURVE.initialVirtualSol;
})();
var CURVE_FEES = { protocol: 95, creator: 30, lp: 0 };
var AMM_FEE_TIERS = [
  { mcapSol: 0, fees: { creator: 30, protocol: 93, lp: 2 } },
  { mcapSol: 420, fees: { creator: 95, protocol: 5, lp: 20 } },
  { mcapSol: 1470, fees: { creator: 90, protocol: 5, lp: 20 } },
  { mcapSol: 2460, fees: { creator: 85, protocol: 5, lp: 20 } },
  { mcapSol: 3440, fees: { creator: 80, protocol: 5, lp: 20 } },
  { mcapSol: 4420, fees: { creator: 75, protocol: 5, lp: 20 } },
  { mcapSol: 9820, fees: { creator: 70, protocol: 5, lp: 20 } },
  { mcapSol: 14740, fees: { creator: 65, protocol: 5, lp: 20 } },
  { mcapSol: 19650, fees: { creator: 60, protocol: 5, lp: 20 } },
  { mcapSol: 24560, fees: { creator: 55, protocol: 5, lp: 20 } },
  { mcapSol: 29470, fees: { creator: 50, protocol: 5, lp: 20 } },
  { mcapSol: 34380, fees: { creator: 45, protocol: 5, lp: 20 } },
  { mcapSol: 39300, fees: { creator: 40, protocol: 5, lp: 20 } },
  { mcapSol: 44210, fees: { creator: 35, protocol: 5, lp: 20 } },
  { mcapSol: 49120, fees: { creator: 30, protocol: 5, lp: 20 } },
  { mcapSol: 54030, fees: { creator: 28, protocol: 5, lp: 20 } },
  { mcapSol: 58940, fees: { creator: 25, protocol: 5, lp: 20 } },
  { mcapSol: 63860, fees: { creator: 23, protocol: 5, lp: 20 } },
  { mcapSol: 68770, fees: { creator: 20, protocol: 5, lp: 20 } },
  { mcapSol: 73681, fees: { creator: 18, protocol: 5, lp: 20 } },
  { mcapSol: 78590, fees: { creator: 15, protocol: 5, lp: 20 } },
  { mcapSol: 83500, fees: { creator: 13, protocol: 5, lp: 20 } },
  { mcapSol: 88400, fees: { creator: 10, protocol: 5, lp: 20 } },
  { mcapSol: 93330, fees: { creator: 8, protocol: 5, lp: 20 } },
  { mcapSol: 98240, fees: { creator: 5, protocol: 5, lp: 20 } }
];
function totalBps(f2) {
  return f2.protocol + f2.creator + f2.lp;
}
function ammFeesForMcapSol(mcapSol) {
  let chosen = AMM_FEE_TIERS[0].fees;
  for (const tier of AMM_FEE_TIERS) {
    if (mcapSol >= tier.mcapSol) chosen = tier.fees;
    else break;
  }
  return chosen;
}
function newCurve() {
  return {
    vSol: CURVE.initialVirtualSol,
    vTok: CURVE.initialVirtualTok,
    realTok: CURVE.initialRealTok,
    supply: CURVE.supply
  };
}
function curveMcapLamports(s) {
  if (s.vTok <= 0) return 0;
  return s.vSol * s.supply / s.vTok;
}
function curveMcapSol(s) {
  return curveMcapLamports(s) / LAMPORTS_PER_SOL;
}
function curvePriceSol(s) {
  if (s.vTok <= 0) return 0;
  return s.vSol / s.vTok * (RAW_PER_TOKEN / LAMPORTS_PER_SOL);
}
function curveProgress(s) {
  const p = 1 - s.realTok / CURVE.initialRealTok;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
function feeCeil(amount, bps) {
  return Math.ceil(amount * bps / 1e4);
}
function curveBuyQuote(s, lamportsIn, fees = CURVE_FEES) {
  const zero = { tokensOut: 0, solToCurve: 0, feeLamports: 0, solSpent: 0, avgPriceSol: 0, after: { ...s } };
  if (!(lamportsIn > 1) || s.vTok <= 0 || s.realTok <= 0) return zero;
  const bps = totalBps(fees);
  const input = Math.floor((lamportsIn - 1) * 1e4 / (1e4 + bps));
  let tokens = Math.floor(input * s.vTok / (s.vSol + input));
  if (tokens > s.realTok) tokens = s.realTok;
  if (tokens <= 0) return zero;
  const cost = Math.floor(tokens * s.vSol / (s.vTok - tokens)) + 1;
  const fee = feeCeil(cost, fees.protocol) + feeCeil(cost, fees.creator);
  const spent = cost + fee;
  return {
    tokensOut: tokens,
    solToCurve: cost,
    feeLamports: fee,
    solSpent: spent,
    avgPriceSol: spent / LAMPORTS_PER_SOL / (tokens / RAW_PER_TOKEN),
    after: { vSol: s.vSol + cost, vTok: s.vTok - tokens, realTok: s.realTok - tokens, supply: s.supply }
  };
}
function curveSellQuote(s, tokensIn, fees = CURVE_FEES) {
  if (!(tokensIn > 0) || s.vTok <= 0) {
    return { solOut: 0, solFromCurve: 0, feeLamports: 0, avgPriceSol: 0, after: { ...s } };
  }
  const gross = Math.floor(tokensIn * s.vSol / (s.vTok + tokensIn));
  const fee = feeCeil(gross, fees.protocol) + feeCeil(gross, fees.creator);
  const out = Math.max(0, gross - fee);
  return {
    solOut: out,
    solFromCurve: gross,
    feeLamports: fee,
    avgPriceSol: out / LAMPORTS_PER_SOL / (tokensIn / RAW_PER_TOKEN),
    after: { vSol: s.vSol - gross, vTok: s.vTok + tokensIn, realTok: s.realTok + tokensIn, supply: s.supply }
  };
}
function poolMcapSol(p) {
  if (p.base <= 0) return 0;
  return p.quote * p.supply / p.base / LAMPORTS_PER_SOL;
}
function poolPriceSol(p) {
  if (p.base <= 0) return 0;
  return p.quote / p.base * (RAW_PER_TOKEN / LAMPORTS_PER_SOL);
}
function ammFees(p) {
  const f2 = ammFeesForMcapSol(poolMcapSol(p));
  return p.hasCreator === false ? { ...f2, creator: 0 } : f2;
}
function poolBuyQuote(p, lamportsIn) {
  const zeroAfter = { vSol: p.quote, vTok: p.base, realTok: p.base, supply: p.supply };
  const zero = { tokensOut: 0, solToCurve: 0, feeLamports: 0, solSpent: 0, avgPriceSol: 0, after: zeroAfter };
  if (!(lamportsIn > 1) || p.base <= 0 || p.quote <= 0) return zero;
  const f2 = ammFees(p);
  let effective = Math.floor(lamportsIn * 1e4 / (1e4 + totalBps(f2)));
  const lpFee = feeCeil(effective, f2.lp);
  const protocolFee = feeCeil(effective, f2.protocol);
  const creatorFee = feeCeil(effective, f2.creator);
  const total = effective + lpFee + protocolFee + creatorFee;
  if (total > lamportsIn) effective -= total - lamportsIn;
  const input = effective - 1;
  if (input <= 0) return zero;
  const out = Math.floor(p.base * input / (p.quote + input));
  if (out <= 0 || out >= p.base) return zero;
  const quoteIn = Math.ceil(p.quote * out / (p.base - out));
  const fLp = feeCeil(quoteIn, f2.lp);
  const fee = fLp + feeCeil(quoteIn, f2.protocol) + feeCeil(quoteIn, f2.creator);
  const spent = quoteIn + fee;
  return {
    tokensOut: out,
    solToCurve: quoteIn + fLp,
    feeLamports: fee,
    solSpent: spent,
    avgPriceSol: spent / LAMPORTS_PER_SOL / (out / RAW_PER_TOKEN),
    after: { vSol: p.quote + quoteIn + fLp, vTok: p.base - out, realTok: p.base - out, supply: p.supply }
  };
}
function poolSellQuote(p, tokensIn) {
  const same = { vSol: p.quote, vTok: p.base, realTok: p.base, supply: p.supply };
  if (!(tokensIn > 0) || p.base <= 0 || p.quote <= 0) {
    return { solOut: 0, solFromCurve: 0, feeLamports: 0, avgPriceSol: 0, after: same };
  }
  const f2 = ammFees(p);
  const gross = Math.floor(p.quote * tokensIn / (p.base + tokensIn));
  const lpFee = feeCeil(gross, f2.lp);
  const fee = lpFee + feeCeil(gross, f2.protocol) + feeCeil(gross, f2.creator);
  const out = Math.max(0, gross - fee);
  return {
    solOut: out,
    solFromCurve: gross - lpFee,
    feeLamports: fee,
    avgPriceSol: out / LAMPORTS_PER_SOL / (tokensIn / RAW_PER_TOKEN),
    after: { vSol: p.quote - (gross - lpFee), vTok: p.base + tokensIn, realTok: p.base + tokensIn, supply: p.supply }
  };
}

// src/core/positions.ts
var DEFAULT_COSTS = { priorityFeeSol: 5e-4, platformFeePct: 0.5, ataRentSol: 203928e-8, refundRent: true };
function venueOf(t) {
  if (t.stage === "curve") return t.vTok > 0 && t.realTok > 0 ? "curve" : "none";
  if (t.stage === "migrating") return "none";
  if (t.poolBase > 0 && t.poolQuote > 0) return "amm";
  if (t.quote?.priceSol && t.quote.priceSol > 0) return "approx";
  return "none";
}
function approxPool(t, solUsd) {
  const q = t.quote;
  const liqSol = q.liqUsd && solUsd > 0 ? q.liqUsd / solUsd / 2 : 50;
  const quote = Math.max(1, liqSol) * LAMPORTS_PER_SOL;
  const base = quote / (q.priceSol * LAMPORTS_PER_SOL) * RAW_PER_TOKEN;
  return { base, quote, supply: t.supply };
}
function quoteBuy(t, lamportsAllIn, costs, solUsd = 0, firstBuy = true) {
  const venue = venueOf(t);
  const fixed = costs.priorityFeeSol * LAMPORTS_PER_SOL + (firstBuy ? costs.ataRentSol * LAMPORTS_PER_SOL : 0);
  const platform = lamportsAllIn * (costs.platformFeePct / 100);
  const swapIn = Math.floor(lamportsAllIn - fixed - platform);
  if (venue === "none") return { ok: false, error: t.stage === "migrating" ? "migrating" : "no_price", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  if (swapIn <= 1e4) return { ok: false, error: "size_too_small", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  let q;
  if (venue === "curve") q = curveBuyQuote(t, swapIn);
  else if (venue === "amm") q = poolBuyQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, swapIn);
  else q = poolBuyQuote(approxPool(t, solUsd), swapIn);
  if (q.tokensOut <= 0) return { ok: false, error: "no_liquidity", tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  const lamports = q.solSpent + fixed + platform;
  return {
    ok: true,
    tokens: q.tokensOut,
    lamports,
    avgPriceSol: lamports / LAMPORTS_PER_SOL / (q.tokensOut / RAW_PER_TOKEN),
    fees: q.feeLamports + fixed + platform,
    mcapSol: t.mcapSol
  };
}
function quoteSell(t, tokens, costs, solUsd = 0, closesAccount = false) {
  const venue = venueOf(t);
  if (tokens <= 0) return { ok: true, tokens: 0, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  if (venue === "none") return { ok: false, error: t.stage === "migrating" ? "migrating" : "no_price", tokens, lamports: 0, avgPriceSol: 0, fees: 0, mcapSol: t.mcapSol };
  let q;
  if (venue === "curve") q = curveSellQuote(t, tokens);
  else if (venue === "amm") q = poolSellQuote({ base: t.poolBase, quote: t.poolQuote, supply: t.supply }, tokens);
  else q = poolSellQuote(approxPool(t, solUsd), tokens);
  const platform = q.solOut * (costs.platformFeePct / 100);
  const refund = closesAccount && costs.refundRent ? costs.ataRentSol * LAMPORTS_PER_SOL : 0;
  const lamports = Math.max(0, q.solOut - platform - costs.priorityFeeSol * LAMPORTS_PER_SOL + refund);
  return {
    ok: true,
    tokens,
    lamports,
    avgPriceSol: tokens > 0 ? lamports / LAMPORTS_PER_SOL / (tokens / RAW_PER_TOKEN) : 0,
    fees: q.feeLamports + platform + costs.priorityFeeSol * LAMPORTS_PER_SOL,
    mcapSol: t.mcapSol
  };
}
function positionMultiple(p) {
  return p.cost > 0 ? (p.proceeds + p.value) / p.cost : 0;
}
function effectiveTrail(plan) {
  return plan.takeInitials && plan.trailPct === 0 ? 40 : plan.trailPct;
}
function decideExit(p, now, lastTradeAt = now) {
  const plan = p.plan;
  const mult = positionMultiple(p);
  if (p.tokensLeft <= 0) return { action: "hold" };
  if (!p.tpHit && mult <= 1 - plan.slPct / 100) return { action: "sell", fraction: 1, reason: "sl" };
  const trail = effectiveTrail(plan);
  if (!p.tpHit && mult >= 1 + plan.tpPct / 100) {
    if (plan.takeInitials && p.value > 0) {
      const need = Math.max(0, p.cost - p.proceeds);
      const fraction = Math.min(1, need / p.value);
      if (fraction < 0.98) return { action: "sell", fraction, reason: "initials" };
      return { action: "sell", fraction: 1, reason: "tp" };
    }
    if (trail > 0) return { action: "arm" };
    return { action: "sell", fraction: 1, reason: "tp" };
  }
  if (p.tpHit && trail > 0 && p.peakValue > 0 && p.value <= p.peakValue * (1 - trail / 100)) {
    return { action: "sell", fraction: 1, reason: "trail" };
  }
  if (p.tpHit && mult <= 1 - plan.slPct / 100) return { action: "sell", fraction: 1, reason: "sl" };
  if (plan.maxHoldMin > 0 && now - p.openedAt >= plan.maxHoldMin * 6e4) return { action: "sell", fraction: 1, reason: "time" };
  const stale = plan.staleExitMin ?? 0;
  if (stale > 0 && now - Math.max(lastTradeAt, p.openedAt) >= stale * 6e4) return { action: "sell", fraction: 1, reason: "dead" };
  return { action: "hold" };
}

// src/core/util.ts
var clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
var num = (x, fallback = 0) => {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
var logit = (p) => {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
};
var sigmoid = (z) => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
var idCounter = 0;
function newId(prefix = "") {
  idCounter = (idCounter + 1) % 1e6;
  return prefix + Date.now().toString(36) + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var LRU = class {
  constructor(max) {
    this.max = max;
  }
  map = /* @__PURE__ */ new Map();
  get size() {
    return this.map.size;
  }
  get(k) {
    const v = this.map.get(k);
    if (v !== void 0) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  peek(k) {
    return this.map.get(k);
  }
  has(k) {
    return this.map.has(k);
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
  delete(k) {
    return this.map.delete(k);
  }
  /** Drops least-recently-used entries until `target` remain, sparing those `keep` accepts while possible. */
  shrinkTo(target, keep) {
    let dropped = 0;
    if (keep) {
      for (const [k, v] of this.map) {
        if (this.map.size <= target) break;
        if (!keep(k, v)) {
          this.map.delete(k);
          dropped++;
        }
      }
    }
    while (this.map.size > target) {
      this.map.delete(this.map.keys().next().value);
      dropped++;
    }
    return dropped;
  }
  entries() {
    return this.map.entries();
  }
  values() {
    return this.map.values();
  }
  clear() {
    this.map.clear();
  }
};
var Ring = class {
  constructor(cap) {
    this.cap = cap;
    this.buf = new Array(cap);
  }
  buf;
  start = 0;
  len = 0;
  get length() {
    return this.len;
  }
  push(v) {
    if (this.len < this.cap) {
      this.buf[(this.start + this.len) % this.cap] = v;
      this.len++;
    } else {
      this.buf[this.start] = v;
      this.start = (this.start + 1) % this.cap;
    }
  }
  at(i) {
    if (i < 0) i += this.len;
    if (i < 0 || i >= this.len) return void 0;
    return this.buf[(this.start + i) % this.cap];
  }
  last() {
    return this.at(this.len - 1);
  }
  toArray() {
    const out = [];
    for (let i = 0; i < this.len; i++) out.push(this.buf[(this.start + i) % this.cap]);
    return out;
  }
  clear() {
    this.start = 0;
    this.len = 0;
  }
};
var DecayRate = class {
  constructor(halfLifeMs = 6e4) {
    this.halfLifeMs = halfLifeMs;
  }
  value = 0;
  last = 0;
  add(ts, amount = 1) {
    this.decay(ts);
    this.value += amount;
  }
  decay(ts) {
    if (this.last === 0) {
      this.last = ts;
      return;
    }
    const dt = ts - this.last;
    if (dt > 0) {
      this.value *= Math.pow(0.5, dt / this.halfLifeMs);
      this.last = ts;
    }
  }
  /** Approximate events per minute at `ts`. */
  perMinute(ts) {
    this.decay(ts);
    return this.value * Math.LN2 * 6e4 / this.halfLifeMs;
  }
};
function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * clamp(q, 0, 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function mean(xs) {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function wilson(successes, n, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 1, p: NaN };
  const p = successes / n;
  const denom = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), p };
}
function meanCI(xs) {
  const n = xs.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, n };
  const m = mean(xs);
  if (n === 1) return { mean: m, lo: -Infinity, hi: Infinity, n };
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  const se = Math.sqrt(v / (n - 1) / n);
  return { mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se, n };
}
var silentLogger = { debug() {
}, info() {
}, warn() {
}, error() {
} };

// src/core/outcomes.ts
var GRID_TP = [25, 50, 75, 100, 150, 200, 300, 500];
var GRID_SL = [10, 20, 30, 40, 50, 70];
var GRID = GRID_TP.flatMap((tp) => GRID_SL.map((sl) => ({ tp, sl })));
var GRID_VERSION = 2;
var PATH_MIN = [5, 10, 30, 60, 120];
var ENTRY_LEVELS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
var SLOT = 5;
var STATE = 0;
var KIND = 1;
var EXIT_AT = 2;
var TIME = 3;
var RET = 4;
var KINDS = ["timeout", "tp", "sl", "dead"];
var K_TP = 1;
var K_SL = 2;
var COMBOS = 1 + GRID.length;
var TP_UP = Float64Array.from(GRID, (g) => 1 + g.tp / 100);
var SL_DOWN = Float64Array.from(GRID, (g) => 1 - g.sl / 100);
var r4 = (v) => Math.round(v * 1e4) / 1e4;
var OutcomeTracker = class {
  constructor(opts, sink) {
    this.opts = opts;
    this.sink = sink;
  }
  byMint = /* @__PURE__ */ new Map();
  openCount = 0;
  dropped = 0;
  resolvedCount = 0;
  setOptions(o) {
    this.opts = { ...this.opts, ...o };
  }
  get open() {
    return this.openCount;
  }
  has(mint, tag) {
    return this.byMint.get(mint)?.some((h) => h.tag === tag) ?? false;
  }
  add(t, kind, tag, now, score, p, x, custom, facts) {
    if (this.openCount >= this.opts.maxOpen) {
      this.dropped++;
      return false;
    }
    const h = {
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
      f: facts
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
  enter(h, t, now) {
    const size = this.opts.sizeSol * LAMPORTS_PER_SOL;
    const q = quoteBuy(t, size, this.opts.costs, 0, true);
    if (!q.ok || q.tokens <= 0 || t.mcapSol <= 0) {
      this.remove(h);
      return;
    }
    h.entered = true;
    h.entryMcap = t.mcapSol;
    const sellFee = (t.stage === "amm" ? 0.0125 : 0.0125) + this.opts.costs.platformFeePct / 100;
    const tokensUi = q.tokens / 1e6;
    const pricePerMcap = 1e6 / t.supply;
    h.a = tokensUi * pricePerMcap * (1 - sellFee) / this.opts.sizeSol;
    h.b = (this.opts.costs.priorityFeeSol - (this.opts.costs.refundRent ? this.opts.costs.ataRentSol : 0)) / this.opts.sizeSol;
    h.ts = now;
  }
  mult(h, mcap) {
    return h.a * mcap - h.b;
  }
  /** Records the value at each time-exit horizon that has passed (and keeps the extremes in step). */
  capturePath(h, now, m) {
    if (m > h.maxMult) {
      h.maxMult = m;
      h.maxAt = now;
    }
    if (m < h.minMult) h.minMult = m;
    while (h.pathNext < PATH_MIN.length && now - h.ts >= PATH_MIN[h.pathNext] * 6e4) h.path[h.pathNext++] = Math.max(-1, m - 1);
  }
  /** Price update for a token (call after every applied trade / quote). */
  onPrice(t, now) {
    const list = this.byMint.get(t.mint);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (!h.entered) {
        if (now >= h.entryAt) this.enter(h, t, now);
        continue;
      }
      if (t.stage === "migrating") continue;
      const m = this.mult(h, t.mcapSol);
      if (m > h.maxMult) {
        h.maxMult = m;
        h.maxAt = now;
      }
      if (m < h.minMult) h.minMult = m;
      this.capturePath(h, now, m);
      const c = h.c;
      for (let i2 = 0; i2 < COMBOS; i2++) {
        const o = i2 * SLOT;
        const state = c[o + STATE];
        if (state === 2) continue;
        if (state === 1) {
          if (now >= c[o + EXIT_AT]) this.resolveCombo(h, i2, m);
          continue;
        }
        if (m >= (i2 === 0 ? 1 + h.ctp / 100 : TP_UP[i2 - 1])) this.trigger(h, i2, K_TP, now, m);
        else if (m <= (i2 === 0 ? 1 - h.csl / 100 : SL_DOWN[i2 - 1])) this.trigger(h, i2, K_SL, now, m);
      }
      if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout", now);
      else if (h.open === 0) this.emit(h, now);
    }
  }
  trigger(h, i, kind, now, m) {
    const o = i * SLOT;
    h.c[o + KIND] = kind;
    h.c[o + TIME] = (now - h.ts) / 1e3;
    if (this.opts.latencyMs <= 0) this.resolveCombo(h, i, m);
    else {
      h.c[o + STATE] = 1;
      h.c[o + EXIT_AT] = now + this.opts.latencyMs;
    }
  }
  resolveCombo(h, i, m) {
    const o = i * SLOT;
    if (h.c[o + STATE] === 2) return;
    h.c[o + STATE] = 2;
    h.c[o + RET] = Math.max(-1, m - 1);
    h.open--;
  }
  finish(h, m, kind, now) {
    const end = Math.min(now, h.ts + this.opts.horizonMs);
    this.capturePath(h, end, m);
    for (let i = 0; i < COMBOS; i++) {
      const o = i * SLOT;
      const state = h.c[o + STATE];
      if (state === 2) continue;
      if (state === 0) {
        h.c[o + KIND] = KINDS.indexOf(kind);
        h.c[o + TIME] = (end - h.ts) / 1e3;
      }
      this.resolveCombo(h, i, m);
    }
    this.emit(h, h.ts + this.opts.horizonMs);
  }
  emit(h, now) {
    this.remove(h);
    if (!h.entered) return;
    const c = h.c;
    const kind0 = KINDS[c[KIND]];
    const grid = [];
    const gridT = [];
    for (let i = 1; i < COMBOS; i++) {
      grid.push(r4(c[i * SLOT + RET]));
      gridT.push(Math.round(Math.max(0, c[i * SLOT + TIME]) * 10) / 10);
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
      ret: c[RET],
      exit: kind0,
      grid,
      gv: GRID_VERSION,
      gridT,
      path: h.path.map((v) => v === null ? null : r4(v)),
      f: h.f,
      maxMult: h.maxMult,
      minMult: h.minMult,
      secToMax: Math.max(0, (h.maxAt - h.ts) / 1e3),
      resolvedAt: now
    });
  }
  remove(h) {
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
  onTokenGone(t, now) {
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
  sweep(now, tokenOf) {
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
        for (let i = 0; i < COMBOS; i++) if (h.c[i * SLOT + STATE] === 1 && now >= h.c[i * SLOT + EXIT_AT]) this.resolveCombo(h, i, m);
        if (h.open === 0) this.emit(h, now);
        else if (now - h.ts >= this.opts.horizonMs) this.finish(h, m, "timeout", now);
      }
    }
  }
};

// src/core/edges.ts
var HOLDS_MIN = [0, 10, 30, 60];
var EXITS = GRID.length * HOLDS_MIN.length;
var f = (s) => s.f;
var CONDITIONS = [
  { key: "any", label: "any coin", test: () => true },
  { key: "curve", label: "still on the bonding curve", test: (s) => s.stage === "curve", stage: "curve" },
  { key: "amm", label: "already graduated", test: (s) => s.stage === "amm", stage: "amm" },
  ...[40, 80, 150].map((v) => ({ key: `mcap<=${v}`, label: `market cap \u2264 ${v} SOL`, test: (s) => f(s).mcap <= v, filters: { maxMcapSol: v } })),
  ...[80, 150, 300].map((v) => ({ key: `mcap>=${v}`, label: `market cap \u2265 ${v} SOL`, test: (s) => f(s).mcap >= v, filters: { minMcapSol: v } })),
  ...[1, 3, 10].map((m) => ({ key: `age<=${m}m`, label: `younger than ${m} min`, test: (s) => f(s).age <= m * 60, filters: { maxAgeMin: m } })),
  ...[3, 10].map((m) => ({ key: `age>=${m}m`, label: `older than ${m} min`, test: (s) => f(s).age >= m * 60, filters: { minAgeSec: m * 60 } })),
  { key: "bundle<=10", label: "\u2264 10% bundled at launch", test: (s) => f(s).bundle * 100 <= 10, filters: { maxBundlePct: 10 } },
  { key: "top10<=30", label: "top 10 holders own \u2264 30%", test: (s) => f(s).top10 * 100 <= 30, filters: { maxTop10Pct: 30 } },
  ...[30, 100].map((n) => ({ key: `buyers>=${n}`, label: `${n}+ buyers`, test: (s) => f(s).buyers >= n, filters: { minBuyers: n } })),
  { key: "socials", label: "has socials", test: (s) => f(s).socials > 0, filters: { requireSocials: true } },
  { key: "dev<=5", label: "dev holds \u2264 5%", test: (s) => f(s).devShare * 100 <= 5, filters: { maxDevPct: 5 } },
  { key: "devheld", label: "dev hasn't sold", test: (s) => f(s).devSold <= 0, filters: { maxDevSoldPct: 0 } },
  { key: "onelaunch", label: "dev's only launch today", test: (s) => f(s).launches24h <= 1, filters: { maxDevLaunches24h: 1 } }
];
var OPEN_FILTERS = {
  minMcapSol: 0,
  maxMcapSol: 0,
  maxDevPct: 100,
  maxTop10Pct: 100,
  maxBundlePct: 100,
  minBuyers: 0,
  minAgeSec: 0,
  maxAgeMin: 0,
  requireSocials: false,
  maxDevLaunches24h: 0,
  maxDevSoldPct: 100
};
var DEFAULTS = {
  horizonMs: 6 * 36e5,
  minHours: 24,
  minSamples: 1e3,
  minDiscovery: 80,
  minHoldout: 40,
  candidates: 20,
  minWins: 10,
  placeboRuns: 3,
  seed: 7
};
function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  if (q < 0.02425) {
    const t2 = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * t2 + c[1]) * t2 + c[2]) * t2 + c[3]) * t2 + c[4]) * t2 + c[5]) / ((((d[0] * t2 + d[1]) * t2 + d[2]) * t2 + d[3]) * t2 + 1);
  }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const t = q - 0.5;
  const r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
function exitReturn(s, c, h) {
  const ret = s.grid[c];
  const hold = HOLDS_MIN[h];
  if (hold === 0 || (s.gridT?.[c] ?? 0) <= hold * 60) return ret;
  const v = s.path?.[PATH_MIN.indexOf(hold)];
  return v ?? ret;
}
function describe(r) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const when = r.cond === "any" ? "" : ` \xB7 ${cond.label}`;
  const time = r.hold ? `, or after ${r.hold} min` : "";
  return `Buy when a coin first reaches ${r.level}${when} \xB7 sell at +${r.tp}% or \u2212${r.sl}%${time}`;
}
function settingsFor(r) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const out = {
    minScore: r.level,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || 360,
    trailPct: 0,
    takeInitials: false,
    reentry: false,
    tradeCurve: cond.stage !== "amm",
    tradeAmm: cond.stage !== "curve",
    scoreOnly: !cond.filters
  };
  if (cond.filters) out.filters = { ...OPEN_FILTERS, ...cond.filters };
  return out;
}
function stats(d, idx, e, z) {
  let n = 0;
  let sum = 0;
  let sq = 0;
  let w = 0;
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]) * EXITS + e] - d.shift[e];
    n++;
    sum += v;
    sq += v * v;
    if (d.wins(v)) w++;
  }
  if (n < 2) return { n, mean: n ? sum : NaN, lo: -Infinity, winRate: n ? w / n : NaN };
  const mean2 = sum / n;
  const variance = Math.max(0, (sq - n * mean2 * mean2) / (n - 1));
  return { n, mean: mean2, lo: mean2 - z * Math.sqrt(variance / n), winRate: w / n };
}
var wins = (st) => Math.round(st.winRate * st.n);
function* search(d, groups, o) {
  let tested = 0;
  const best = [];
  for (const g of groups) {
    if (g.disc.length < o.minDiscovery) continue;
    let top = null;
    for (let e = 0; e < EXITS; e++) {
      tested++;
      const st = stats(d, g.disc, e, 2);
      if (wins(st) < o.minWins) continue;
      if (!top || st.lo > top.disc.lo) top = { g, e, disc: st };
    }
    if (top && top.disc.mean > 0 && top.disc.lo > 0) best.push(top);
    yield;
  }
  best.sort((a, b) => b.disc.lo - a.disc.lo);
  const cands = best.slice(0, o.candidates);
  const z = normInv(1 - 0.05 / Math.max(1, cands.length));
  const checked = cands.map((c) => ({ c, hold: stats(d, c.g.hold, c.e, z) }));
  const passed = checked.filter((x) => x.hold.n >= o.minHoldout && wins(x.hold) >= o.minWins && x.hold.lo > 0);
  return { tested, cands: checked, passed };
}
function findEdges(samples, opts = {}) {
  const it = steps(samples, opts);
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
function* steps(samples, opts) {
  const o = { ...DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();
  const base = {
    generatedAt: now,
    status: "not_enough_data",
    note: "",
    samples: 0,
    hours: 0,
    discoveryHours: 0,
    holdoutHours: 0,
    tested: 0,
    candidates: 0,
    survivors: [],
    failed: [],
    placebo: { runs: 0, avgSurvivors: 0, maxSurvivors: 0 }
  };
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - o.horizonMs;
  const rows = samples.filter(
    (s) => s.kind === "entry" && s.gv === GRID_VERSION && s.f && s.gridT?.length === GRID.length && s.path?.length === PATH_MIN.length && s.ts <= cutoff
  );
  rows.sort((a, b) => a.ts - b.ts);
  const n = rows.length;
  const t0 = n ? rows[0].ts : 0;
  const t1 = n ? rows[n - 1].ts : 0;
  const hours = n ? (t1 - t0) / 36e5 : 0;
  base.samples = n;
  base.hours = hours;
  if (n < o.minSamples || hours < o.minHours) {
    base.note = `Needs at least ${o.minHours} hours of recorded market and ${o.minSamples.toLocaleString("en-US")} finished entry outcomes (so far: ${hours.toFixed(1)} h, ${n.toLocaleString("en-US")}). Each outcome finishes ${Math.round(o.horizonMs / 36e5)} hours after its entry.`;
    return base;
  }
  const R = new Float32Array(n * EXITS);
  for (let i = 0; i < n; i++) {
    const s = rows[i];
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < HOLDS_MIN.length; h++) R[i * EXITS + c * HOLDS_MIN.length + h] = exitReturn(s, c, h);
    if (i % 2e3 === 0) yield;
  }
  const split = t0 + (t1 - t0) * 2 / 3;
  const groups = [];
  const byLevel = /* @__PURE__ */ new Map();
  rows.forEach((s, i) => {
    const level = Number(s.tag.slice(1));
    let list = byLevel.get(level);
    if (!list) byLevel.set(level, list = []);
    list.push(i);
  });
  for (const level of ENTRY_LEVELS) {
    const idx = byLevel.get(level) ?? [];
    CONDITIONS.forEach((cond, ci) => {
      const disc = [];
      const hold = [];
      for (const i of idx) if (cond.test(rows[i])) (rows[i].ts < split ? disc : hold).push(i);
      groups.push({ level, cond: ci, disc: Int32Array.from(disc), hold: Int32Array.from(hold) });
    });
  }
  const zero = new Float64Array(EXITS);
  const real = { R, row: (i) => i, shift: zero, wins: (v) => v > 0 };
  const run = yield* search(real, groups, o);
  const holdDays = Math.max(1 / 24, (t1 - split) / 864e5);
  const toFound = (c, holdSt) => {
    const combo = Math.floor(c.e / HOLDS_MIN.length);
    const rule = { level: c.g.level, cond: CONDITIONS[c.g.cond].key, tp: GRID[combo].tp, sl: GRID[combo].sl, hold: HOLDS_MIN[c.e % HOLDS_MIN.length] };
    const all = groups.find((g) => g.level === c.g.level && g.cond === 0);
    return {
      ...rule,
      text: describe(rule),
      discovery: c.disc,
      holdout: holdSt,
      baseline: stats(real, all.hold, c.e, 0).mean,
      tradesPerDay: new Set(Array.from(c.g.hold, (i) => rows[i].mint)).size / holdDays,
      settings: settingsFor(rule)
    };
  };
  const survivors = run.passed.map((x) => toFound(x.c, x.hold)).sort((a, b) => b.holdout.lo - a.holdout.lo);
  const failed = run.cands.filter((x) => !run.passed.includes(x)).slice(0, 3).map((x) => toFound(x.c, x.hold));
  const colMean = new Float64Array(EXITS);
  for (let i = 0; i < n; i++) for (let e = 0; e < EXITS; e++) colMean[e] += R[i * EXITS + e];
  for (let e = 0; e < EXITS; e++) colMean[e] /= n;
  const rand = rng(o.seed);
  const counts = [];
  for (let r = 0; r < o.placeboRuns; r++) {
    const perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    counts.push((yield* search({ R, row: (i) => perm[i], shift: colMean, wins: (v) => v > 0 }, groups, o)).passed.length);
  }
  const discHours = (split - t0) / 36e5;
  return {
    ...base,
    status: "ok",
    note: survivors.length ? `${survivors.length} rule${survivors.length > 1 ? "s" : ""} held up on the newest data the search never saw.` : "No rule held up on the newest data yet. That is a real answer: keep recording, the search runs again every few hours.",
    discoveryHours: discHours,
    holdoutHours: hours - discHours,
    tested: run.tested,
    candidates: run.cands.length,
    survivors,
    failed,
    placebo: {
      runs: counts.length,
      avgSurvivors: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
      maxSurvivors: counts.length ? Math.max(...counts) : 0
    }
  };
}

// src/research/cli.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";

// src/core/features.ts
var MarketPulse = class {
  buys = new DecayRate(5 * 6e4);
  sells = new DecayRate(5 * 6e4);
  launches = new DecayRate(10 * 6e4);
  history = [];
  lastSample = 0;
  onTrade(ts, buy, sol) {
    if (buy) this.buys.add(ts, sol);
    else this.sells.add(ts, sol);
  }
  onLaunch(ts) {
    this.launches.add(ts);
  }
  /** SOL per minute of net buying across all tracked tokens. */
  netPerMin(ts) {
    return this.buys.perMinute(ts) - this.sells.perMinute(ts);
  }
  launchesPerMin(ts) {
    return this.launches.perMinute(ts);
  }
  buyPerMin(ts) {
    return this.buys.perMinute(ts);
  }
  /** z-score of current buy volume vs the last ~24h of samples. */
  heat(ts) {
    const v = this.buys.perMinute(ts);
    if (ts - this.lastSample > 6e4) {
      this.history.push(v);
      if (this.history.length > 1440) this.history.shift();
      this.lastSample = ts;
    }
    if (this.history.length < 10) return 0;
    let m = 0;
    for (const x of this.history) m += x;
    m /= this.history.length;
    let s = 0;
    for (const x of this.history) s += (x - m) ** 2;
    const sd = Math.sqrt(s / (this.history.length - 1));
    return sd > 0 ? clamp((v - m) / sd, -3, 3) : 0;
  }
};
function extractFeatures(t, ctx) {
  const now = ctx.now;
  const w60 = t.window(now, 6e4);
  const w300 = t.window(now, 3e5);
  const prev60 = t.window(now, 6e4, 6e4);
  const scan = t.scanHolders(now, 6e4, (a) => ctx.wallets.isSmart(a));
  const conc = scan;
  let whaleMax = 0;
  for (let i = t.trades.length - 1; i >= 0; i--) {
    const r = t.trades.at(i);
    if (now - r.ts > 3e5) break;
    if (r.buy && r.sol > whaleMax) whaleMax = r.sol;
  }
  const smart = scan.smart;
  const observed = now - ctx.wallets.startedAt > 45 * 6e4;
  const freshShare = observed && t.uniqueBuyers > 0 ? t.freshBuys / t.uniqueBuyers : NaN;
  const narrative = ctx.narratives.describe(t.mint, ctx.mcapOf);
  const creator = t.creator ? ctx.wallets.creator(t.creator, now) : { launches24h: 0, best: 0, graduated: 0, launches: 0 };
  const m = t.meta;
  const socials = (m.twitter ? 1 : 0) + (m.telegram ? 1 : 0) + (m.website ? 1 : 0);
  const mcap = t.mcapSol > 0 ? t.mcapSol : 1e-9;
  const ago30 = t.mcapAgo(now, 3e4);
  const ago120 = t.mcapAgo(now, 12e4);
  const hour2 = new Date(now).getUTCHours() + new Date(now).getUTCMinutes() / 60;
  return {
    stage: t.stage === "amm" ? "amm" : "curve",
    ageSec: Math.max(0, (now - t.createdAt) / 1e3),
    mcapSol: t.mcapSol,
    progress: t.progress,
    net60: w60.net,
    net300: w300.net,
    netPrev60: prev60.net,
    buys60: w60.buyN,
    sells60: w60.sellN,
    uniq60: scan.uniqRecent,
    uniqTotal: t.uniqueBuyers,
    trades60: w60.n,
    avgBuy300: w300.buyN > 0 ? w300.buySol / w300.buyN : 0,
    whale300: w300.buySol > 0 ? clamp(whaleMax / w300.buySol, 0, 1) : 0,
    devShare: t.devBal / t.supply,
    devSold: t.devMaxBal > 0 ? clamp(t.devSoldTok / t.devMaxBal, 0, 1) : t.devSoldTok > 0 ? 1 : 0,
    bundleShare: t.bundleTok / t.supply,
    earlyShare: t.earlyTok / t.supply,
    top10: conc.top10,
    top1: conc.top1,
    holders: conc.holders,
    drawdown: t.athMcapSol > 0 ? clamp(1 - t.mcapSol / t.athMcapSol, 0, 1) : 0,
    chg30: ago30 > 0 ? Math.log(mcap / ago30) : 0,
    chg120: ago120 > 0 ? Math.log(mcap / ago120) : 0,
    smartBuyers: smart,
    freshShare,
    socials,
    tweetLink: narrative.tweetLinked ? 1 : 0,
    clusterSize: narrative.clusterSize,
    isLeader: narrative.clusterSize > 1 && narrative.isLeader ? 1 : 0,
    isFirst: narrative.clusterSize > 1 && narrative.isFirst ? 1 : 0,
    creatorLaunches24h: creator.launches24h,
    creatorBest: creator.best,
    heat: ctx.pulse.heat(now),
    hourUtc: hour2,
    sinceMigrateSec: t.migrateAt ? Math.max(0, (now - t.migrateAt) / 1e3) : 0,
    liquiditySol: t.stage === "amm" ? t.poolQuote / 1e9 : t.realSol / 1e9,
    dexSignal: (m.dexProfile ? 1 : 0) + ((m.boosts ?? 0) > 0 ? 1 : 0)
  };
}
var pct = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
var s2 = (x) => Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2);
var FEATURE_DEFS = [
  { key: "age", label: "Age", x: (f2) => Math.log1p(f2.ageSec), show: (f2) => fmtAge(f2.ageSec), good: "young", bad: "old for its stage" },
  { key: "mcap", label: "Market cap", x: (f2) => Math.log(Math.max(f2.mcapSol, 1)), show: (f2) => `${f2.mcapSol.toFixed(0)} SOL`, good: "room to run", bad: "already big" },
  { key: "progress", label: "Curve progress", x: (f2) => f2.progress, show: (f2) => pct(f2.progress), good: "curve filling", bad: "curve nearly done" },
  { key: "net60", label: "Net inflow 60s", x: (f2) => Math.asinh(f2.net60), show: (f2) => `${s2(f2.net60)} SOL`, good: "buyers pouring in", bad: "net selling" },
  { key: "net300", label: "Net inflow 5m", x: (f2) => Math.asinh(f2.net300), show: (f2) => `${s2(f2.net300)} SOL`, good: "sustained demand", bad: "demand fading" },
  { key: "accel", label: "Acceleration", x: (f2) => clamp((f2.net60 - f2.netPrev60) / (Math.abs(f2.netPrev60) + 1), -3, 3), show: (f2) => `${s2(f2.net60 - f2.netPrev60)} SOL vs prior min`, good: "speeding up", bad: "slowing down" },
  { key: "buyRatio", label: "Buy share 60s", x: (f2) => (f2.buys60 + 1) / (f2.buys60 + f2.sells60 + 2), show: (f2) => `${f2.buys60}B/${f2.sells60}S`, good: "mostly buys", bad: "mostly sells" },
  { key: "uniq60", label: "New buyers 60s", x: (f2) => Math.log1p(f2.uniq60), show: (f2) => `${f2.uniq60}`, good: "many distinct buyers", bad: "few buyers" },
  { key: "uniqTotal", label: "Buyers total", x: (f2) => Math.log1p(f2.uniqTotal), show: (f2) => `${f2.uniqTotal}`, good: "broad participation", bad: "thin participation" },
  { key: "trades60", label: "Trades 60s", x: (f2) => Math.log1p(f2.trades60), show: (f2) => `${f2.trades60}`, good: "active", bad: "quiet" },
  { key: "avgBuy", label: "Avg buy 5m", x: (f2) => Math.log(0.01 + f2.avgBuy300), show: (f2) => `${s2(f2.avgBuy300)} SOL`, good: "retail-sized buys", bad: "whale-sized buys" },
  { key: "whale", label: "Largest buy share", x: (f2) => f2.whale300, show: (f2) => pct(f2.whale300), good: "no single whale", bad: "one whale dominates" },
  { key: "devShare", label: "Dev holds", x: (f2) => f2.devShare, show: (f2) => pct(f2.devShare), good: "dev holds little", bad: "dev holds a lot" },
  { key: "devSold", label: "Dev sold", x: (f2) => f2.devSold, show: (f2) => pct(f2.devSold), good: "dev holding", bad: "dev dumping" },
  { key: "bundle", label: "Bundled supply", x: (f2) => f2.bundleShare, show: (f2) => pct(f2.bundleShare), good: "no bundle", bad: "bundled at launch" },
  { key: "early", label: "Sniper supply", x: (f2) => f2.earlyShare, show: (f2) => pct(f2.earlyShare), good: "snipers gone", bad: "snipers holding" },
  { key: "top10", label: "Top 10 holders", x: (f2) => f2.top10, show: (f2) => pct(f2.top10), good: "spread out", bad: "concentrated" },
  { key: "holders", label: "Holders", x: (f2) => Math.log1p(f2.holders), show: (f2) => `${f2.holders}`, good: "many holders", bad: "few holders" },
  { key: "drawdown", label: "Below peak", x: (f2) => f2.drawdown, show: (f2) => pct(f2.drawdown), good: "near highs", bad: "far below peak" },
  { key: "chg30", label: "Move 30s", x: (f2) => clamp(f2.chg30, -2, 2), show: (f2) => pct(Math.exp(f2.chg30) - 1), good: "rising", bad: "falling" },
  { key: "chg120", label: "Move 2m", x: (f2) => clamp(f2.chg120, -2, 2), show: (f2) => pct(Math.exp(f2.chg120) - 1), good: "trending up", bad: "trending down" },
  { key: "smart", label: "Smart wallets in", x: (f2) => Math.log1p(f2.smartBuyers), show: (f2) => `${f2.smartBuyers}`, good: "proven wallets buying", bad: "" },
  { key: "fresh", label: "Fresh wallets", x: (f2) => Number.isFinite(f2.freshShare) ? f2.freshShare : 0.3, show: (f2) => Number.isFinite(f2.freshShare) ? pct(f2.freshShare) : "learning", good: "real wallets", bad: "brand-new wallets (alts)" },
  { key: "socials", label: "Socials", x: (f2) => f2.socials / 3, show: (f2) => `${f2.socials}/3`, good: "has socials", bad: "no socials" },
  { key: "tweet", label: "Tweet-linked", x: (f2) => f2.tweetLink, show: (f2) => f2.tweetLink ? "yes" : "no", good: "anchored to a tweet", bad: "" },
  { key: "cluster", label: "Narrative heat", x: (f2) => Math.log(Math.max(1, f2.clusterSize)), show: (f2) => `${f2.clusterSize} similar`, good: "hot narrative", bad: "" },
  { key: "leader", label: "Narrative leader", x: (f2) => f2.isLeader, show: (f2) => f2.isLeader ? "leads" : "\u2014", good: "leads its narrative", bad: "" },
  { key: "copycat", label: "Copycat", x: (f2) => f2.clusterSize > 1 && !f2.isLeader ? 1 : 0, show: (f2) => f2.clusterSize > 1 && !f2.isLeader ? "yes" : "no", good: "", bad: "copy of a bigger coin" },
  { key: "serial", label: "Serial launcher", x: (f2) => Math.log1p(Math.max(0, f2.creatorLaunches24h - 1)), show: (f2) => `${f2.creatorLaunches24h} launches/24h`, good: "", bad: "dev launches many coins" },
  { key: "creatorBest", label: "Dev track record", x: (f2) => Math.log1p(f2.creatorBest / 100), show: (f2) => `best ${f2.creatorBest.toFixed(0)} SOL`, good: "dev had a winner", bad: "" },
  { key: "heat", label: "Market heat", x: (f2) => f2.heat, show: (f2) => s2(f2.heat), good: "hot market", bad: "cold market" },
  { key: "hourSin", label: "Hour (sin)", x: (f2) => Math.sin(2 * Math.PI * f2.hourUtc / 24), show: (f2) => `${f2.hourUtc.toFixed(0)}h UTC`, good: "", bad: "" },
  { key: "hourCos", label: "Hour (cos)", x: (f2) => Math.cos(2 * Math.PI * f2.hourUtc / 24), show: (f2) => `${f2.hourUtc.toFixed(0)}h UTC`, good: "", bad: "" },
  { key: "liquidity", label: "Liquidity", x: (f2) => Math.log1p(f2.liquiditySol), show: (f2) => `${f2.liquiditySol.toFixed(1)} SOL`, good: "deep pool", bad: "thin pool" },
  { key: "sinceMig", label: "Since migration", x: (f2) => f2.stage === "amm" ? Math.log1p(f2.sinceMigrateSec) : 0, show: (f2) => f2.stage === "amm" ? fmtAge(f2.sinceMigrateSec) : "\u2014", good: "just graduated", bad: "stale after graduation" },
  { key: "dex", label: "DEX listing paid", x: (f2) => f2.dexSignal, show: (f2) => `${f2.dexSignal}/2`, good: "paid profile/boost", bad: "" }
];
var FEATURE_KEYS = FEATURE_DEFS.map((d) => d.key);
function featureVector(f2) {
  const out = new Array(FEATURE_DEFS.length);
  for (let i = 0; i < FEATURE_DEFS.length; i++) {
    const v = FEATURE_DEFS[i].x(f2);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}
function fmtAge(sec) {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

// src/core/model.ts
var PRIOR_MEAN = {
  age: 4.5,
  mcap: 3.6,
  progress: 0.08,
  net60: 0.3,
  net300: 0.6,
  accel: 0,
  buyRatio: 0.55,
  uniq60: 1,
  uniqTotal: 2.2,
  trades60: 1.3,
  avgBuy: -1,
  whale: 0.35,
  devShare: 0.04,
  devSold: 0.3,
  bundle: 0.05,
  early: 0.08,
  top10: 0.25,
  holders: 2.2,
  drawdown: 0.25,
  chg30: 0,
  chg120: 0,
  smart: 0.05,
  fresh: 0.3,
  socials: 0.35,
  tweet: 0.1,
  cluster: 0.3,
  leader: 0.1,
  copycat: 0.15,
  serial: 0.2,
  creatorBest: 0.1,
  heat: 0,
  hourSin: 0,
  hourCos: 0,
  liquidity: 3.5,
  sinceMig: 1,
  dex: 0.1
};
var PRIOR_STD = {
  age: 1.2,
  mcap: 0.5,
  progress: 0.15,
  net60: 1,
  net300: 1.3,
  accel: 1,
  buyRatio: 0.2,
  uniq60: 1,
  uniqTotal: 1.2,
  trades60: 1.1,
  avgBuy: 1,
  whale: 0.25,
  devShare: 0.05,
  devSold: 0.4,
  bundle: 0.1,
  early: 0.1,
  top10: 0.12,
  holders: 1.1,
  drawdown: 0.25,
  chg30: 0.15,
  chg120: 0.3,
  smart: 0.3,
  fresh: 0.25,
  socials: 0.35,
  tweet: 0.3,
  cluster: 0.6,
  leader: 0.3,
  copycat: 0.35,
  serial: 0.5,
  creatorBest: 0.3,
  heat: 1,
  hourSin: 0.7,
  hourCos: 0.7,
  liquidity: 1,
  sinceMig: 2.5,
  dex: 0.3
};
var CURVE_W = {
  age: -0.35,
  mcap: -0.15,
  progress: 0.05,
  net60: 0.45,
  net300: 0.25,
  accel: 0.2,
  buyRatio: 0.3,
  uniq60: 0.45,
  uniqTotal: 0.3,
  trades60: 0.1,
  avgBuy: -0.1,
  whale: -0.2,
  devShare: -0.35,
  devSold: -0.55,
  bundle: -0.45,
  early: -0.3,
  top10: -0.45,
  holders: 0.2,
  drawdown: -0.4,
  chg30: 0.15,
  chg120: 0.15,
  smart: 0.5,
  fresh: -0.3,
  socials: 0.15,
  tweet: 0.1,
  cluster: 0.1,
  leader: 0.2,
  copycat: -0.25,
  serial: -0.4,
  creatorBest: 0.1,
  heat: 0.15,
  hourSin: 0,
  hourCos: 0,
  liquidity: 0,
  sinceMig: 0,
  dex: 0.1
};
var AMM_W = {
  ...CURVE_W,
  age: -0.2,
  mcap: -0.2,
  progress: 0,
  bundle: -0.2,
  early: -0.15,
  devSold: -0.3,
  liquidity: 0.2,
  sinceMig: -0.25,
  dex: 0.25,
  holders: 0.3
};
function priorModel(now = 0) {
  const soften = (w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * 0.5]));
  const mk = (weights, pRef) => ({
    pRef,
    bias: logit(pRef),
    weights: soften(weights),
    mean: { ...PRIOR_MEAN },
    std: { ...PRIOR_STD }
  });
  return {
    version: "prior-2.0",
    createdAt: now,
    source: "prior",
    target: { tpPct: 100, slPct: 50, horizonMin: 360 },
    stages: { curve: mk(CURVE_W, 0.12), amm: { ...mk(AMM_W, 0.15), mean: { ...PRIOR_MEAN, liquidity: 4.6, sinceMig: 6, age: 7 } } }
  };
}
var POINTS_PER_LOGIT = 12.5 / Math.LN2;
function standardize(stage, x) {
  const z = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const k = FEATURE_KEYS[i];
    const sd = stage.std[k] ?? 1;
    z[i] = clamp((x[i] - (stage.mean[k] ?? 0)) / (sd > 1e-9 ? sd : 1), -5, 5);
  }
  return z;
}
function linear(stage, z) {
  let s = stage.bias;
  for (let i = 0; i < z.length; i++) s += (stage.weights[FEATURE_KEYS[i]] ?? 0) * z[i];
  return s;
}
function scoreFromLogit(stage, zLogit) {
  return clamp(50 + (zLogit - logit(stage.pRef)) * POINTS_PER_LOGIT, 0, 100);
}
function scoreToken(model, f2, explain = true) {
  const stageKey = f2.stage;
  const stage = model.stages[stageKey];
  const x = featureVector(f2);
  const z = standardize(stage, x);
  const lin = linear(stage, z);
  const pLogit = stage.calib ? stage.calib.a + stage.calib.b * lin : lin;
  const p = sigmoid(pLogit);
  const score = scoreFromLogit(stage, pLogit);
  let contributions = [];
  if (explain) {
    for (let i = 0; i < FEATURE_DEFS.length; i++) {
      const d = FEATURE_DEFS[i];
      const w = stage.weights[d.key] ?? 0;
      if (w === 0) continue;
      const pts = w * z[i] * POINTS_PER_LOGIT;
      if (Math.abs(pts) < 0.5) continue;
      contributions.push({ key: d.key, label: d.label, value: d.show(f2), points: pts, note: pts > 0 ? d.good : d.bad });
    }
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    contributions = contributions.slice(0, 10);
  }
  return { score, p, calibrated: !!stage.calib && model.source === "trained", stage: stageKey, contributions };
}
function breakEvenP(tpPct, slPct, slSlippage = 0.1) {
  const win = tpPct / 100;
  const loss = slPct / 100 + slSlippage;
  return loss / (win + loss);
}
function validateModel(m) {
  if (!m || typeof m !== "object") return false;
  const s = m.stages;
  if (!s || !s.curve || !s.amm) return false;
  for (const st of [s.curve, s.amm]) {
    if (typeof st.bias !== "number" || !Number.isFinite(st.bias)) return false;
    if (typeof st.pRef !== "number" || !(st.pRef > 0 && st.pRef < 1)) return false;
    for (const k of FEATURE_KEYS) {
      const w = st.weights[k] ?? 0;
      if (!Number.isFinite(w) || Math.abs(w) > 20) return false;
      if (!Number.isFinite(st.mean[k] ?? 0) || !Number.isFinite(st.std[k] ?? 1)) return false;
    }
  }
  return true;
}

// src/core/learn.ts
function auc(scores, labels) {
  const idx = scores.map((s, i2) => i2).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]] === 1) {
      rankSum += avgRank;
      nPos++;
    }
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}
function evaluate(stage, rows) {
  const ps = [];
  const ys = [];
  let ll = 0;
  let br = 0;
  let pos = 0;
  for (const r of rows) {
    const lin = linear(stage, standardize(stage, r.x));
    const p = clamp(sigmoid(stage.calib ? stage.calib.a + stage.calib.b * lin : lin), 1e-6, 1 - 1e-6);
    ps.push(p);
    ys.push(r.y);
    ll += -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    br += (p - r.y) ** 2;
    pos += r.y;
  }
  const n = rows.length;
  return { n, positives: pos, auc: auc(ps, ys), logLoss: n ? ll / n : NaN, brier: n ? br / n : NaN, baseRate: n ? pos / n : NaN };
}
function choleskySolve(A, b) {
  const n = b.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
function fitLogistic(Z, y, w, prior, lambda, maxIter = 30) {
  const d = prior.length;
  let beta = prior.slice();
  const objective = (b) => {
    let f2 = 0;
    for (let i = 0; i < Z.length; i++) {
      let s = b[0];
      const z = Z[i];
      for (let j = 1; j < d; j++) s += b[j] * z[j - 1];
      const p = clamp(sigmoid(s), 1e-9, 1 - 1e-9);
      f2 -= w[i] * (y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
    }
    for (let j = 1; j < d; j++) f2 += 0.5 * lambda * (b[j] - prior[j]) ** 2;
    f2 += 0.5 * 1e-4 * (b[0] - prior[0]) ** 2;
    return f2;
  };
  let fPrev = objective(beta);
  let converged = false;
  for (let iter = 0; iter < maxIter; iter++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      let s = beta[0];
      for (let j = 1; j < d; j++) s += beta[j] * z[j - 1];
      const p = sigmoid(s);
      const r = w[i] * (p - y[i]);
      const v = w[i] * Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H[0][0] += v;
      for (let j = 1; j < d; j++) {
        const zj = z[j - 1];
        g[j] += r * zj;
        H[0][j] += v * zj;
        for (let k = 1; k <= j; k++) H[j][k] += v * zj * z[k - 1];
      }
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * (beta[j] - prior[j]);
      H[j][j] += lambda;
      H[j][0] = H[0][j];
      for (let k = 1; k < j; k++) H[k][j] = H[j][k];
    }
    g[0] += 1e-4 * (beta[0] - prior[0]);
    H[0][0] += 1e-4;
    const step = choleskySolve(H, g);
    if (!step) break;
    let t = 1;
    let next = beta;
    let fNext = fPrev;
    for (let h = 0; h < 20; h++) {
      next = beta.map((b, j) => b - t * step[j]);
      fNext = objective(next);
      if (fNext <= fPrev + 1e-12) break;
      t /= 2;
    }
    const moved = Math.max(...step.map((s) => Math.abs(s * t)));
    beta = next;
    const improvement = fPrev - fNext;
    fPrev = fNext;
    if (moved < 1e-7 || improvement < 1e-9) {
      converged = true;
      break;
    }
  }
  return { beta, converged };
}
function weightedMeanStd(rows, j) {
  let sw = 0;
  let m = 0;
  for (const r of rows) {
    const w = r.w ?? 1;
    sw += w;
    m += w * r.x[j];
  }
  m /= sw || 1;
  let v = 0;
  for (const r of rows) v += (r.w ?? 1) * (r.x[j] - m) ** 2;
  v /= sw || 1;
  return { mean: m, std: Math.sqrt(v) };
}
function fitStage(base, rows, opts = {}) {
  const lambda = opts.lambda ?? 8;
  const half = opts.standardizeHalfRows ?? 400;
  const n = rows.length;
  const blend = n / (n + half);
  const mean2 = {};
  const std = {};
  FEATURE_KEYS.forEach((k, j) => {
    const s = weightedMeanStd(rows, j);
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean2[k] = (1 - blend) * pm + blend * s.mean;
    const sd = (1 - blend) * ps + blend * s.std;
    std[k] = sd > 1e-6 ? sd : ps;
  });
  const stage = { ...base, mean: mean2, std, calib: void 0 };
  const prior = [base.bias];
  FEATURE_KEYS.forEach((k) => {
    const w = base.weights[k] ?? 0;
    prior.push(w * ((std[k] ?? 1) / (base.std[k] ?? 1)));
  });
  let pos = 0;
  let sw = 0;
  for (const r of rows) {
    pos += (r.w ?? 1) * r.y;
    sw += r.w ?? 1;
  }
  const baseRate = clamp(sw > 0 ? pos / sw : base.pRef, 5e-3, 0.95);
  prior[0] = logit(baseRate);
  const Z = rows.map((r) => standardize(stage, r.x));
  const { beta } = fitLogistic(
    Z,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    prior,
    lambda
  );
  const weights = {};
  FEATURE_KEYS.forEach((k, j) => {
    weights[k] = clamp(beta[j + 1], -10, 10);
  });
  return { pRef: baseRate, bias: beta[0], weights, mean: mean2, std };
}
function calibrate(stage, rows) {
  if (rows.length < 50) return stage;
  const lin = rows.map((r) => [linear(stage, standardize(stage, r.x))]);
  const { beta } = fitLogistic(
    lin,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    [0, 1],
    0.5
  );
  if (!(beta[1] > 0.05)) return stage;
  return { ...stage, calib: { a: beta[0], b: beta[1] } };
}
function trainAndSelect(current, rows, opts = {}) {
  const minRows = opts.minRows ?? 300;
  const minPos = opts.minPositives ?? 25;
  const reports = [];
  let next = JSON.parse(JSON.stringify(current));
  let adoptedAny = false;
  for (const stageKey of ["curve", "amm"]) {
    const sr = rows.filter((r) => r.stage === stageKey).sort((a, b) => a.ts - b.ts);
    const cut = Math.floor(sr.length * 0.75);
    const train = sr.slice(0, cut);
    const val = sr.slice(cut);
    const cur = current.stages[stageKey];
    const empty = { n: 0, positives: 0, auc: NaN, logLoss: NaN, brier: NaN, baseRate: NaN };
    const pos = sr.reduce((s, r) => s + r.y, 0);
    if (sr.length < minRows || pos < minPos || val.length < 50) {
      reports.push({ adopted: false, reason: `need \u2265${minRows} resolved samples with \u2265${minPos} wins (have ${sr.length}/${pos})`, stage: stageKey, trainRows: train.length, valRows: val.length, current: val.length ? evaluate(cur, val) : empty, candidate: empty });
      continue;
    }
    let cand = fitStage(cur, train, opts);
    if (opts.calibrate !== false) {
      const calCut = Math.floor(train.length * 0.8);
      const fitPart = fitStage(cur, train.slice(0, calCut), opts);
      const cal = calibrate(fitPart, train.slice(calCut));
      if (cal.calib) cand = { ...cand, calib: cal.calib };
    }
    const mCur = evaluate(cur, val);
    const mCand = evaluate(cand, val);
    const better = Number.isFinite(mCand.logLoss) && (!Number.isFinite(mCur.logLoss) || mCand.logLoss < mCur.logLoss - 1e-3) && (!Number.isFinite(mCur.auc) || !Number.isFinite(mCand.auc) || mCand.auc >= mCur.auc - 5e-3);
    if (better) {
      const full = fitStage(cur, sr, opts);
      next.stages[stageKey] = cand.calib ? { ...full, calib: cand.calib } : full;
      adoptedAny = true;
    }
    reports.push({
      adopted: better,
      reason: better ? "challenger beat the current model on unseen (newer) data" : "current model still better on unseen data",
      stage: stageKey,
      trainRows: train.length,
      valRows: val.length,
      current: mCur,
      candidate: mCand
    });
  }
  if (adoptedAny) {
    const now = opts.now ?? Date.now();
    next = {
      ...next,
      version: `trained-${new Date(now).toISOString().slice(0, 16)}`,
      createdAt: now,
      source: "trained",
      training: {
        rows: rows.length,
        positives: rows.reduce((s, r) => s + r.y, 0),
        from: rows.reduce((m, r) => Math.min(m, r.ts), Infinity),
        to: rows.reduce((m, r) => Math.max(m, r.ts), 0),
        valAuc: reports.find((r) => r.adopted)?.candidate.auc,
        valLogLoss: reports.find((r) => r.adopted)?.candidate.logLoss,
        priorValAuc: reports.find((r) => r.adopted)?.current.auc,
        priorValLogLoss: reports.find((r) => r.adopted)?.current.logLoss
      }
    };
  }
  return { model: next, reports };
}

// src/core/report.ts
function nearestGrid(tp, sl) {
  let best = 0;
  let bestD = Infinity;
  GRID.forEach((g, i) => {
    const d = Math.abs(Math.log(g.tp / tp)) + Math.abs(g.sl - sl) / 25;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
function gridOf(s) {
  return s.grid?.length === GRID.length ? s.grid : void 0;
}
function sampleReturn(s, tp, sl) {
  if (s.tp === tp && s.sl === sl) return { ret: s.ret, exact: true };
  const g = gridOf(s);
  const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
  if (g && gi >= 0 && Number.isFinite(g[gi])) return { ret: g[gi], exact: true };
  return { ret: g?.[nearestGrid(tp, sl)] ?? s.ret, exact: false };
}
function statsOf(rets) {
  const wins2 = rets.filter((r) => r > 0).length;
  const w = wilson(wins2, rets.length);
  const m = meanCI(rets);
  return { n: rets.length, winRate: rets.length ? wins2 / rets.length : NaN, winLo: w.lo, winHi: w.hi, avgRet: m.mean, retLo: m.lo, retHi: m.hi };
}
function paperStats(closed) {
  const done = closed.filter((p) => p.status === "closed" && Number.isFinite(p.pnl));
  const wins2 = done.filter((p) => (p.pnl ?? 0) > 0);
  const gross = wins2.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const loss = -done.filter((p) => (p.pnl ?? 0) <= 0).reduce((s, p) => s + (p.pnl ?? 0), 0);
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  for (const p of [...done].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))) {
    eq += p.pnl ?? 0;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, peak - eq);
  }
  return {
    trades: done.length,
    wins: wins2.length,
    winRate: done.length ? wins2.length / done.length : NaN,
    pnlSol: (gross - loss) / 1e9,
    avgPct: done.length ? done.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / done.length : NaN,
    profitFactor: loss > 0 ? gross / loss : gross > 0 ? Infinity : NaN,
    maxDrawdownSol: mdd / 1e9
  };
}
function buildReport(samples, settings, model, closed, now) {
  const tp = settings.tpPct;
  const sl = settings.slPct;
  const checkpoints = samples.filter((s) => s.kind === "checkpoint");
  const signals = samples.filter((s) => s.kind === "signal");
  const exactCombo = samples.length === 0 || sampleReturn(samples[0], tp, sl).exact;
  const retOf = (s) => sampleReturn(s, tp, sl).ret;
  const t0 = samples.reduce((m, s) => Math.min(m, s.ts), Infinity);
  const t1 = samples.reduce((m, s) => Math.max(m, s.ts), 0);
  const spanHours = samples.length ? Math.max(1 / 60, (t1 - t0) / 36e5) : 0;
  const buckets = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const rows = checkpoints.filter((s) => s.score >= lo && (s.score < hi || hi === 100 && s.score <= 100));
    const st = statsOf(rows.map(retOf));
    const mm = rows.map((s) => s.maxMult).sort((a, b) => a - b);
    buckets.push({ lo, hi, n: st.n, winRate: st.winRate, winLo: st.winLo, winHi: st.winHi, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, medMaxMult: quantile(mm, 0.5) });
  }
  const sigAbove = signals.filter((s) => s.score >= settings.minScore);
  const signalStats = statsOf(sigAbove.map(retOf));
  const entries = samples.filter((s) => s.kind === "entry");
  const thresholdSource = entries.length >= 200 ? "entries" : "checkpoints";
  const atLevel = (min) => thresholdSource === "entries" ? entries.filter((s) => s.tag === `x${min}`) : checkpoints.filter((s) => s.score >= min);
  const thresholds = [];
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    const st = statsOf(rows.map(retOf));
    const tokens = new Set(rows.map((s) => s.mint)).size;
    thresholds.push({ min, n: st.n, tokensPerHour: spanHours > 0 ? tokens / spanHours : NaN, winRate: st.winRate, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi });
  }
  const level = [...ENTRY_LEVELS].reverse().find((l) => l <= settings.minScore) ?? ENTRY_LEVELS[0];
  const levelEntries = entries.filter((s) => s.tag === `x${level}`);
  let gridSource;
  let pool;
  if (sigAbove.length >= 50) {
    gridSource = "signals";
    pool = sigAbove;
  } else if (levelEntries.length >= 50) {
    gridSource = "entries";
    pool = levelEntries;
  } else {
    gridSource = "checkpoints";
    pool = [...sigAbove, ...checkpoints.filter((s) => s.score >= settings.minScore)];
  }
  const grid = GRID.map((g, i) => {
    const rets = pool.map((s) => gridOf(s)?.[i]).filter((x) => Number.isFinite(x));
    const st = statsOf(rets);
    return { tp: g.tp, sl: g.sl, n: st.n, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, winRate: st.winRate };
  });
  const credible = grid.filter((c) => c.n >= 50 && Number.isFinite(c.retLo));
  const best = credible.length ? credible.reduce((a, b) => b.retLo > a.retLo ? b : a) : null;
  const minN = 150;
  let gate;
  if (signalStats.n < minN) {
    gate = {
      pass: false,
      verdict: "Not enough evidence yet",
      detail: `${signalStats.n}/${minN} resolved signals at score \u2265 ${settings.minScore} with TP ${tp}% / SL ${sl}%. Keep paper trading.`
    };
  } else if (!(signalStats.retLo > 0.02)) {
    gate = {
      pass: false,
      verdict: signalStats.avgRet > 0 ? "Positive but not proven" : "Losing at these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade (95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%) after fees, delay and slippage. The low end must clear +2% before risking real money.`
    };
  } else {
    gate = {
      pass: true,
      verdict: "Evidence supports these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade over ${signalStats.n} signals; 95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%. Past results in this market can still stop working \u2014 start small.`
    };
  }
  let suggestion = null;
  const zBound = (xs, z) => {
    const m = meanCI(xs);
    return Number.isFinite(m.lo) ? m.mean - (m.mean - m.lo) / 1.96 * z : -Infinity;
  };
  const cur = pool.map(retOf);
  let bestLo = cur.length >= 30 ? zBound(cur, 3.5) : -Infinity;
  const mid = t0 + (t1 - t0) / 2;
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    if (rows.length < 150) continue;
    GRID.forEach((g, i) => {
      const val = (s) => gridOf(s)?.[i];
      const all = rows.map(val).filter((x) => Number.isFinite(x));
      if (all.length < 150) return;
      const lo = zBound(all, 3.5);
      if (!(lo > 0) || lo <= bestLo + 5e-3) return;
      const older = rows.filter((s) => s.ts < mid).map(val).filter((x) => Number.isFinite(x));
      const newer = rows.filter((s) => s.ts >= mid).map(val).filter((x) => Number.isFinite(x));
      if (older.length < 50 || newer.length < 50 || !(zBound(older, 1.96) > 0) || !(zBound(newer, 1.96) > 0)) return;
      const m = meanCI(all);
      bestLo = lo;
      suggestion = {
        minScore: min,
        tpPct: g.tp,
        slPct: g.sl,
        avgRet: m.mean,
        retLo: lo,
        n: all.length,
        why: `${thresholdSource === "entries" ? "buying when coins first reached" : "coins scoring"} ${min}+ with TP ${g.tp}% / SL ${g.sl}% averaged ${(m.mean * 100).toFixed(1)}% per trade over ${all.length} outcomes, positive in both the older and newer half of the data (strict worst case ${(lo * 100).toFixed(1)}%)`
      };
    });
  }
  return {
    generatedAt: now,
    suggestion,
    samples: samples.length,
    checkpoints: checkpoints.length,
    signals: signals.length,
    entries: entries.length,
    spanHours,
    settings: { tpPct: tp, slPct: sl, minScore: settings.minScore },
    combo: { tp, sl, exact: exactCombo },
    breakEven: breakEvenP(tp, sl),
    buckets,
    signalStats,
    thresholds,
    thresholdSource,
    grid,
    gridSource,
    best,
    gate,
    paper: paperStats(closed),
    model: { version: model.version, source: model.source, training: model.training ?? null }
  };
}

// src/core/settings.ts
var DEFAULT_SETTINGS = {
  enabled: false,
  mode: "paper",
  minScore: 75,
  scoreOnly: false,
  tradeCurve: true,
  tradeAmm: true,
  tpPct: 100,
  slPct: 50,
  trailPct: 0,
  takeInitials: false,
  maxHoldMin: 240,
  staleExitMin: 10,
  positionSol: 0.1,
  maxOpen: 3,
  maxDailyLossSol: 0.5,
  maxTradesPerHour: 12,
  slippagePct: 20,
  exitSlippagePct: 25,
  priorityFeeSol: 5e-4,
  platformFeePct: 0.5,
  // hold ~5 s (one evaluation per second while the coin trades): in simulation, buying on the
  // first tick above the line caught more one-off spikes and did 2–6 points worse per trade
  confirmTicks: 5,
  retryWindowSec: 20,
  reentry: false,
  paperLatencyMs: 1500,
  autoTune: false,
  filters: {
    minMcapSol: 0,
    maxMcapSol: 0,
    maxDevPct: 20,
    maxTop10Pct: 60,
    maxBundlePct: 25,
    minBuyers: 5,
    minAgeSec: 0,
    maxAgeMin: 0,
    requireSocials: false,
    maxDevLaunches24h: 5,
    maxDevSoldPct: 100
  }
};
var LIMITS = {
  positionSol: [1e-3, 100],
  maxOpen: [1, 50],
  tpPct: [1, 1e4],
  slPct: [1, 99],
  slippagePct: [0.5, 99],
  exitSlippagePct: [1, 99],
  priorityFeeSol: [0, 0.1],
  platformFeePct: [0, 5],
  maxHoldMin: [0, 10080],
  paperLatencyMs: [0, 3e4]
};
function bool(v, d) {
  return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : d;
}
function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const i = input && typeof input === "object" ? input : {};
  const f2 = i.filters && typeof i.filters === "object" ? i.filters : {};
  const b = base;
  const bf = base.filters;
  const out = {
    enabled: bool(i.enabled, b.enabled),
    mode: i.mode === "live" || i.mode === "paper" ? i.mode : b.mode,
    minScore: clamp(num(i.minScore, b.minScore), 0, 100),
    scoreOnly: bool(i.scoreOnly, b.scoreOnly),
    tradeCurve: bool(i.tradeCurve, b.tradeCurve),
    tradeAmm: bool(i.tradeAmm, b.tradeAmm),
    tpPct: clamp(num(i.tpPct, b.tpPct), ...LIMITS.tpPct),
    slPct: clamp(num(i.slPct, b.slPct), ...LIMITS.slPct),
    trailPct: clamp(num(i.trailPct, b.trailPct), 0, 95),
    takeInitials: bool(i.takeInitials, b.takeInitials),
    maxHoldMin: clamp(num(i.maxHoldMin, b.maxHoldMin), ...LIMITS.maxHoldMin),
    staleExitMin: clamp(num(i.staleExitMin, b.staleExitMin), 0, 1440),
    positionSol: clamp(num(i.positionSol, b.positionSol), ...LIMITS.positionSol),
    maxOpen: Math.round(clamp(num(i.maxOpen, b.maxOpen), ...LIMITS.maxOpen)),
    maxDailyLossSol: clamp(num(i.maxDailyLossSol, b.maxDailyLossSol), 0, 1e3),
    maxTradesPerHour: Math.round(clamp(num(i.maxTradesPerHour, b.maxTradesPerHour), 1, 500)),
    slippagePct: clamp(num(i.slippagePct, b.slippagePct), ...LIMITS.slippagePct),
    exitSlippagePct: clamp(num(i.exitSlippagePct, b.exitSlippagePct), ...LIMITS.exitSlippagePct),
    priorityFeeSol: clamp(num(i.priorityFeeSol, b.priorityFeeSol), ...LIMITS.priorityFeeSol),
    platformFeePct: clamp(num(i.platformFeePct, b.platformFeePct), ...LIMITS.platformFeePct),
    confirmTicks: Math.round(clamp(num(i.confirmTicks, b.confirmTicks), 1, 20)),
    retryWindowSec: clamp(num(i.retryWindowSec, b.retryWindowSec), 0, 600),
    reentry: bool(i.reentry, b.reentry),
    paperLatencyMs: clamp(num(i.paperLatencyMs, b.paperLatencyMs), ...LIMITS.paperLatencyMs),
    autoTune: bool(i.autoTune, b.autoTune),
    filters: {
      minMcapSol: clamp(num(f2.minMcapSol, bf.minMcapSol), 0, 1e7),
      maxMcapSol: clamp(num(f2.maxMcapSol, bf.maxMcapSol), 0, 1e7),
      maxDevPct: clamp(num(f2.maxDevPct, bf.maxDevPct), 0, 100),
      maxTop10Pct: clamp(num(f2.maxTop10Pct, bf.maxTop10Pct), 0, 100),
      maxBundlePct: clamp(num(f2.maxBundlePct, bf.maxBundlePct), 0, 100),
      minBuyers: Math.round(clamp(num(f2.minBuyers, bf.minBuyers), 0, 1e4)),
      minAgeSec: clamp(num(f2.minAgeSec, bf.minAgeSec), 0, 86400),
      maxAgeMin: clamp(num(f2.maxAgeMin, bf.maxAgeMin), 0, 1e5),
      requireSocials: bool(f2.requireSocials, bf.requireSocials),
      maxDevLaunches24h: Math.round(clamp(num(f2.maxDevLaunches24h, bf.maxDevLaunches24h), 0, 1e3)),
      maxDevSoldPct: clamp(num(f2.maxDevSoldPct, bf.maxDevSoldPct), 0, 100)
    }
  };
  if (!out.tradeCurve && !out.tradeAmm) out.tradeCurve = true;
  return out;
}
function exitPlanFrom(s) {
  return {
    tpPct: s.tpPct,
    slPct: s.slPct,
    trailPct: s.trailPct,
    takeInitials: s.takeInitials,
    maxHoldMin: s.maxHoldMin,
    staleExitMin: s.staleExitMin,
    exitSlippagePct: s.exitSlippagePct
  };
}

// src/core/codec.ts
var B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var B58_MAP = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < B58_ALPHABET.length; i++) m[B58_ALPHABET.charCodeAt(i)] = i;
  return m;
})();
function base58Encode(bytes) {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.ceil((bytes.length - zeros) * 138 / 100) + 1;
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * buf[k];
      buf[k] = carry % 58;
      carry = carry / 58 | 0;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && buf[it] === 0) it++;
  let out = "1".repeat(zeros);
  for (; it < size; it++) out += B58_ALPHABET[buf[it]];
  return out;
}
var utf8 = new TextDecoder("utf-8", { fatal: false });

// src/sim/market.ts
var DEFAULT_SIM = {
  seed: 42,
  startTs: Date.UTC(2026, 8, 1, 14, 0, 0),
  durationMs: 60 * 6e4,
  launchesPerMin: 6,
  predictability: 0.7,
  smartWallets: 40,
  retailWallets: 4e3,
  stepMs: 250
};
var WORDS = [
  "pepe",
  "doge",
  "cat",
  "frog",
  "moon",
  "chad",
  "wojak",
  "bonk",
  "milady",
  "jeet",
  "sigma",
  "based",
  "goat",
  "pnut",
  "hawk",
  "tuah",
  "jean",
  "phil",
  "dance",
  "grok",
  "neiro",
  "shib",
  "floki",
  "kitty",
  "bull",
  "bear",
  "pump",
  "wif",
  "hat",
  "gigachad",
  "wagmi",
  "fartcoin",
  "ai",
  "agent",
  "trump",
  "elon",
  "zerebro",
  "luna",
  "banana",
  "monkey",
  "ape",
  "penguin",
  "pengu",
  "turbo",
  "brett",
  "andy",
  "landwolf",
  "mog",
  "popcat",
  "michi",
  "mew",
  "slerf",
  "ponke",
  "giga",
  "spx",
  "ansem",
  "orca",
  "fish",
  "whale",
  "dragon",
  "tiger",
  "panda",
  "duck",
  "chicken",
  "hamster",
  "capybara",
  "otter"
];
function pick(r, xs) {
  return xs[Math.floor(r() * xs.length)];
}
function lognormal(r, mu, sigma) {
  const u = Math.max(1e-12, r());
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(mu + sigma * z);
}
function poisson(r, lambda) {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= r();
    } while (p > L);
    return k - 1;
  }
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}
var MarketSim = class {
  opts;
  r;
  launchedCount = 0;
  active = [];
  retail = [];
  smart = [];
  devs = [];
  recentNames = [];
  now;
  slot0 = 3e8;
  truth = /* @__PURE__ */ new Map();
  constructor(opts = {}) {
    this.opts = { ...DEFAULT_SIM, ...opts };
    this.r = rng(this.opts.seed);
    this.now = this.opts.startTs;
    for (let i = 0; i < this.opts.retailWallets; i++) this.retail.push(this.key());
    for (let i = 0; i < this.opts.smartWallets; i++) this.smart.push(this.key());
    for (let i = 0; i < 300; i++) this.devs.push(this.key());
  }
  key() {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = Math.floor(this.r() * 256);
    b[0] = 1 + b[0] % 250;
    return base58Encode(b);
  }
  slot(ts) {
    return this.slot0 + Math.floor((ts - this.opts.startTs) / 400);
  }
  /** Generate the full event stream in time order. */
  *run() {
    const end = this.opts.startTs + this.opts.durationMs;
    const step = this.opts.stepMs;
    const launchP = this.opts.launchesPerMin * step / 6e4;
    for (let ts = this.opts.startTs; ts < end; ts += step) {
      this.now = ts;
      const batch = [];
      let n = poisson(this.r, launchP);
      while (n-- > 0) this.launch(ts + Math.floor(this.r() * step), batch);
      for (const t of this.active) if (!t.dead) this.stepToken(t, ts, step, batch);
      if (this.active.length > 400 || ts % 1e4 < step) {
        for (const t of this.active) if (t.dead) t.bags.clear();
        this.active = this.active.filter((t) => !t.dead);
      }
      batch.sort((a, b) => a.ts - b.ts);
      for (const ev of batch) yield ev;
    }
  }
  newName(ts) {
    this.recentNames = this.recentNames.filter((x) => ts - x.ts < 15 * 6e4);
    if (this.recentNames.length > 0 && this.r() < 0.22) {
      const c = pick(this.r, this.recentNames);
      return { name: c.name + (this.r() < 0.5 ? "" : " " + pick(this.r, ["2.0", "CTO", "official", "sol"])), symbol: c.symbol };
    }
    const w1 = pick(this.r, WORDS);
    const w2 = this.r() < 0.5 ? pick(this.r, WORDS) : "";
    const name = (w1[0].toUpperCase() + w1.slice(1) + (w2 ? " " + w2 : "")).slice(0, 30);
    const symbol = (w1 + (w2 ? w2.slice(0, 3) : "")).toUpperCase().slice(0, 10);
    return { name, symbol };
  }
  launch(ts, out) {
    const r = this.r;
    const { name, symbol } = this.newName(ts);
    const q = Math.min(40, lognormal(r, -2.4, 1.45));
    const pr = this.opts.predictability;
    const noise = Math.min(40, lognormal(r, -2.4, 1.45));
    const qEarly = pr * q + (1 - pr) * noise;
    const serial = r() < 0.25;
    const creator = serial ? this.devs[Math.floor(r() * 20)] : pick(r, this.devs);
    const devType = r() < (serial ? 0.7 : 0.35) ? "rug" : r() < 0.5 ? "slow" : "honest";
    const t = {
      mint: this.key(),
      name,
      symbol,
      creator,
      bondingCurve: this.key(),
      createdAt: ts,
      q,
      qEarly,
      devType,
      devSellAt: ts + (devType === "rug" ? 2e4 + r() * 3e5 : 6e5 + r() * 36e5),
      curve: newCurve(),
      stage: "curve",
      bags: /* @__PURE__ */ new Map(),
      excitation: 0,
      peakMcap: 28,
      dead: false,
      smartChecked: false,
      lastTradeAt: ts
    };
    this.launchedCount++;
    this.active.push(t);
    this.recentNames.push({ ts, name, symbol });
    this.truth.set(t.mint, { mint: t.mint, q, qEarly, devType, graduated: false, peakMcapSol: 28 });
    const slot = this.slot(ts);
    out.push({
      k: "create",
      ts,
      slot,
      sig: this.key(),
      src: "sim",
      chainTs: Math.floor(ts / 1e3),
      mint: t.mint,
      name,
      symbol,
      uri: `https://ipfs.io/ipfs/sim${t.mint.slice(0, 10)}`,
      creator,
      user: creator,
      vSol: CURVE.initialVirtualSol,
      vTok: CURVE.initialVirtualTok,
      realTok: CURVE.initialRealTok,
      supply: CURVE.supply
    });
    const devSol = r() < 0.15 ? 0 : Math.min(4, lognormal(r, -0.7, 0.8));
    if (devSol > 0.01) this.buy(t, creator, devSol, ts, slot, "dev", out);
    if (r() < (devType === "rug" ? 0.55 : 0.2)) {
      const n = 2 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) this.buy(t, this.key(), 0.3 + r() * 2, ts, slot, "bundle", out);
    }
    const socialP = Math.min(0.9, 0.2 + 0.25 * qEarly);
    out.push({
      k: "meta",
      ts: ts + 800 + Math.floor(r() * 1500),
      mint: t.mint,
      src: "sim",
      twitter: r() < socialP ? r() < 0.4 ? `https://x.com/${symbol.toLowerCase()}/status/${18e17 + Math.floor(r() * 1e15)}` : `https://x.com/${symbol.toLowerCase()}` : void 0,
      telegram: r() < socialP * 0.6 ? `https://t.me/${symbol.toLowerCase()}` : void 0,
      website: r() < socialP * 0.4 ? `https://${symbol.toLowerCase()}.fun` : void 0,
      description: `${name} to the moon`
    });
  }
  mcap(t) {
    if (t.stage === "amm" && t.poolState) return t.poolState.quote * t.poolState.supply / t.poolState.base / LAMPORTS_PER_SOL;
    return curveMcapSol(t.curve);
  }
  priceOf(t) {
    if (t.stage === "amm" && t.poolState) return t.poolState.quote / t.poolState.base;
    return t.curve.vSol / t.curve.vTok;
  }
  stepToken(t, ts, step, out) {
    const r = this.r;
    const age = (ts - t.createdAt) / 1e3;
    const dt = step / 1e3;
    const qPhase = age < 90 ? t.qEarly : t.q;
    const life = 60 + 900 * Math.min(1, t.q / 4);
    let attention = qPhase * Math.exp(-age / life);
    if (t.stage === "amm") attention *= 0.6;
    t.excitation *= Math.pow(0.5, dt / 20);
    const buyRate = 0.9 * attention + t.excitation;
    const nBuys = Math.min(40, poisson(r, buyRate * dt));
    const slot = this.slot(ts);
    if (age < 1.2 && r() < 0.35) this.buy(t, this.key(), 0.2 + r() * 1.5, ts + Math.floor(r() * step), slot + 1, "sniper", out);
    for (let i = 0; i < nBuys; i++) {
      const size = Math.min(25, lognormal(r, -1.6, 1));
      this.buy(t, pick(r, this.retail), size, ts + Math.floor(r() * step), slot, "retail", out);
      t.excitation += 0.02;
    }
    if (!t.smartChecked && age > 8 && age < 60) {
      t.smartChecked = true;
      const pr = this.opts.predictability;
      const informed = Math.min(0.95, 0.03 + pr * 0.35 * Math.max(0, Math.log(t.q + 1)));
      const p = pr > 0 ? informed : 0.06;
      const k = poisson(r, p * 3);
      for (let i = 0; i < k; i++) this.buy(t, pick(r, this.smart), 0.5 + r() * 2.5, ts + Math.floor(r() * step), slot, "smart", out);
    }
    if (Math.floor(ts / 1e3) !== Math.floor((ts - step) / 1e3)) {
      const price = this.priceOf(t);
      const m = this.mcap(t);
      if (m > t.peakMcap) t.peakMcap = m;
      const dd = 1 - m / t.peakMcap;
      for (const [wallet, bag] of t.bags) {
        if (bag.tokens <= 0) continue;
        const mult = bag.costSol > 0 ? price * bag.tokens * 0.975 / (bag.costSol * LAMPORTS_PER_SOL) : 1;
        let hazard = 1 / 900;
        if (bag.kind === "sniper") hazard = mult > bag.target || age > 90 ? 0.3 : 1 / 120;
        else if (bag.kind === "bundle") hazard = mult > 1.4 || age > 120 ? 0.25 : 1 / 200;
        else if (bag.kind === "smart") hazard = mult > bag.target ? 0.2 : dd > 0.45 ? 0.08 : 1 / 1200;
        else if (bag.kind === "dev") {
          if (t.devType === "rug" && ts >= t.devSellAt) hazard = 1;
          else if (t.devType === "slow" && mult > 1.5) hazard = 1 / 60;
          else hazard = ts >= t.devSellAt ? 0.05 : 0;
        } else {
          hazard *= 1 + 2.5 * Math.max(0, mult - 1) + 6 * dd * dd;
          if (mult > bag.target) hazard += 0.05;
        }
        if (r() < 1 - Math.exp(-hazard)) {
          const frac = bag.kind === "dev" || bag.kind === "bundle" || r() < 0.6 ? 1 : 0.3 + r() * 0.5;
          this.sell(t, wallet, Math.floor(bag.tokens * frac), ts + Math.floor(r() * step), slot, out);
        }
      }
    }
    const idle = ts - t.lastTradeAt;
    if (buyRate < 0.01 && idle > 18e4 || idle > 18e5 || age > 6 * 3600) t.dead = true;
  }
  valueOf(t, tokens) {
    if (t.stage === "amm" && t.poolState) return poolSellQuote(t.poolState, tokens).solOut / LAMPORTS_PER_SOL;
    return curveSellQuote(t.curve, tokens).solOut / LAMPORTS_PER_SOL;
  }
  buy(t, wallet, sol, ts, slot, kind, out) {
    const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
    if (t.stage === "curve") {
      const q = curveBuyQuote(t.curve, lamports);
      if (q.tokensOut <= 0) return;
      t.curve = q.after;
      this.addBag(t, wallet, q.tokensOut, q.solSpent / LAMPORTS_PER_SOL, ts, kind);
      out.push({
        k: "trade",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        mint: t.mint,
        buy: true,
        sol: q.solToCurve,
        tok: q.tokensOut,
        user: wallet,
        venue: "curve",
        vSol: t.curve.vSol,
        vTok: t.curve.vTok,
        realSol: t.curve.vSol - CURVE.initialVirtualSol,
        realTok: t.curve.realTok,
        supply: t.curve.supply,
        fee: q.feeLamports
      });
      t.lastTradeAt = ts;
      if (t.curve.realTok <= 0) this.graduate(t, ts, slot, out);
    } else if (t.poolState) {
      if (ts < (t.poolOpenAt ?? 0)) ts = t.poolOpenAt;
      const pre = { ...t.poolState };
      const q = poolBuyQuote(t.poolState, lamports);
      if (q.tokensOut <= 0) return;
      t.poolState = { ...t.poolState, base: q.after.vTok, quote: q.after.vSol };
      this.addBag(t, wallet, q.tokensOut, q.solSpent / LAMPORTS_PER_SOL, ts, kind);
      out.push({
        k: "ammSwap",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        pool: t.pool,
        buy: true,
        base: q.tokensOut,
        quoteDelta: q.solToCurve,
        fee: q.feeLamports,
        user: wallet,
        poolBase: pre.base,
        poolQuote: pre.quote,
        virtualQuote: 0,
        supply: t.poolState.supply
      });
      t.lastTradeAt = ts;
    }
    const m = this.mcap(t);
    const tr = this.truth.get(t.mint);
    if (m > tr.peakMcapSol) tr.peakMcapSol = m;
  }
  addBag(t, wallet, tokens, costSol, ts, kind) {
    const b = t.bags.get(wallet);
    const r = this.r;
    const target = kind === "sniper" ? 1.5 + r() * 2 : kind === "smart" ? 2 + r() * 4 : kind === "retail" ? 1.5 + lognormal(r, 0, 0.8) : 99;
    if (b) {
      b.tokens += tokens;
      b.costSol += costSol;
    } else t.bags.set(wallet, { tokens, costSol, boughtAt: ts, kind, target });
  }
  sell(t, wallet, tokens, ts, slot, out) {
    const bag = t.bags.get(wallet);
    if (!bag || tokens <= 0) return;
    tokens = Math.min(tokens, bag.tokens);
    if (t.stage === "curve") {
      const q = curveSellQuote(t.curve, tokens);
      if (q.solFromCurve <= 0) return;
      t.curve = q.after;
      bag.costSol *= 1 - tokens / bag.tokens;
      bag.tokens -= tokens;
      out.push({
        k: "trade",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        mint: t.mint,
        buy: false,
        sol: q.solFromCurve,
        tok: tokens,
        user: wallet,
        venue: "curve",
        vSol: t.curve.vSol,
        vTok: t.curve.vTok,
        realSol: t.curve.vSol - CURVE.initialVirtualSol,
        realTok: t.curve.realTok,
        supply: t.curve.supply,
        fee: q.feeLamports
      });
    } else if (t.poolState) {
      if (ts < (t.poolOpenAt ?? 0)) ts = t.poolOpenAt;
      const pre = { ...t.poolState };
      const q = poolSellQuote(t.poolState, tokens);
      if (q.solOut <= 0) return;
      t.poolState = { ...t.poolState, base: q.after.vTok, quote: q.after.vSol };
      bag.costSol *= 1 - tokens / bag.tokens;
      bag.tokens -= tokens;
      out.push({
        k: "ammSwap",
        ts,
        slot,
        sig: this.key(),
        src: "sim",
        chainTs: Math.floor(ts / 1e3),
        pool: t.pool,
        buy: false,
        base: tokens,
        quoteDelta: q.solFromCurve,
        fee: q.feeLamports,
        user: wallet,
        poolBase: pre.base,
        poolQuote: pre.quote,
        virtualQuote: 0,
        supply: t.poolState.supply
      });
    }
    if (bag.tokens <= 0) t.bags.delete(wallet);
    t.lastTradeAt = ts;
  }
  graduate(t, ts, slot, out) {
    t.stage = "amm";
    t.pool = this.key();
    const realSol = t.curve.vSol - CURVE.initialVirtualSol;
    const quote = Math.max(1, realSol - 15000001);
    const base = CURVE.supply - CURVE.initialRealTok;
    t.poolState = { base, quote, supply: CURVE.supply, hasCreator: true };
    const tr = this.truth.get(t.mint);
    tr.graduated = true;
    t.excitation += 0.6;
    out.push({ k: "complete", ts: ts + 1, slot, sig: this.key(), src: "sim", mint: t.mint });
    out.push({ k: "migrate", ts: ts + 2, slot, sig: this.key(), src: "sim", mint: t.mint, pool: t.pool, solAmount: quote, mintAmount: base });
    out.push({ k: "pool", ts: ts + 2, slot, sig: this.key(), src: "sim", pool: t.pool, mint: t.mint, quoteIsSol: true, base, quote, coinCreator: t.creator });
    t.poolOpenAt = ts + 3;
  }
  get launched() {
    return this.launchedCount;
  }
};

// src/node/store.ts
import {
  closeSync,
  createWriteStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync
} from "node:fs";
import { join } from "node:path";
import { createGzip, gunzipSync, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
var day = (ts) => new Date(ts).toISOString().slice(0, 10);
var SAMPLE_LIMITS = { checkpoints: 4e4, entries: 25e3 };
function forEachLine(path, fn) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    const dec = new StringDecoder("utf8");
    let rest = "";
    for (; ; ) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      const lines = (rest + dec.write(buf.subarray(0, n))).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (l) fn(l);
    }
    rest += dec.end();
    if (rest) fn(rest);
  } finally {
    closeSync(fd);
  }
}
var hour = (ts) => new Date(ts).toISOString().slice(0, 13);
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data) : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      const code = e.code;
      if (attempt >= 6 || !(code === "EPERM" || code === "EBUSY" || code === "EACCES")) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15 * attempt);
    }
  }
}
var DataStore = class {
  constructor(dir, log) {
    this.log = log;
    this.dir = dir;
    for (const sub of ["", "journal", "samples", "record", "models", "reports"]) mkdirSync(join(dir, sub), { recursive: true });
    this.flushTimer = setInterval(() => this.flush(), 1e3);
    this.flushTimer.unref?.();
  }
  dir;
  recStream = null;
  recorded = 0;
  journalLines = [];
  sampleLines = [];
  flushTimer = null;
  // ---- state -------------------------------------------------------------------
  saveState(s) {
    writeFileAtomic(join(this.dir, "state.json"), JSON.stringify(s));
  }
  loadState() {
    for (const name of ["state.json", "state.json.bak"]) {
      const p = join(this.dir, name);
      if (!existsSync(p)) continue;
      try {
        const s = JSON.parse(readFileSync(p, "utf8"));
        if (s && s.v === 1) return s;
      } catch (e) {
        this.log.error(`could not read ${name}`, { err: String(e) });
      }
    }
    return null;
  }
  /** Daily backup copy so a corrupted disk write can never lose everything. */
  backupState() {
    const p = join(this.dir, "state.json");
    if (existsSync(p)) {
      try {
        writeFileAtomic(join(this.dir, "state.json.bak"), readFileSync(p));
      } catch (e) {
        this.log.warn("state backup failed", { err: String(e) });
      }
    }
  }
  // ---- journal & samples (buffered, flushed every second) ------------------------
  journal(entry) {
    this.journalLines.push(JSON.stringify(entry));
  }
  sample(s) {
    this.sampleLines.push(JSON.stringify(s));
  }
  flush() {
    const now = Date.now();
    try {
      if (this.journalLines.length) {
        const lines = this.journalLines.splice(0);
        appendLines(join(this.dir, "journal", `${day(now)}.jsonl`), lines);
      }
      if (this.sampleLines.length) {
        const lines = this.sampleLines.splice(0);
        appendLines(join(this.dir, "samples", `${day(now)}.jsonl`), lines);
      }
    } catch (e) {
      this.log.error("journal/sample flush failed", { err: String(e) });
    }
  }
  /**
   * Labelled samples from the last `days`, oldest first. Files are read newest first and
   * line by line, keeping at most `limits` checkpoints and entries (signal + entry kinds),
   * so memory stays bounded however much has been recorded.
   */
  loadSamples(days, now = Date.now(), limits = SAMPLE_LIMITS) {
    const cutoff = day(now - days * 864e5);
    let files = [];
    try {
      files = readdirSync(join(this.dir, "samples")).filter((f2) => f2.endsWith(".jsonl") && f2.slice(0, 10) >= cutoff).sort().reverse();
    } catch {
      return [];
    }
    const perFile = [];
    let nCp = 0;
    let nEn = 0;
    for (const f2 of files) {
      const roomCp = limits.checkpoints - nCp;
      const roomEn = limits.entries - nEn;
      if (roomCp <= 0 && roomEn <= 0) break;
      const cps = [];
      const ens = [];
      try {
        forEachLine(join(this.dir, "samples", f2), (line) => {
          const isCp = line.includes('"kind":"checkpoint"');
          if (isCp ? roomCp <= 0 : roomEn <= 0) return;
          let s;
          try {
            s = JSON.parse(line);
          } catch {
            return;
          }
          if (!Array.isArray(s.x) || s.y !== 0 && s.y !== 1) return;
          const into = s.kind === "checkpoint" ? cps : ens;
          const room = s.kind === "checkpoint" ? roomCp : roomEn;
          into.push(s);
          if (into.length >= room * 2) into.splice(0, into.length - room);
        });
      } catch (e) {
        this.log.warn("could not read samples", { file: f2, err: String(e) });
        continue;
      }
      if (cps.length > roomCp) cps.splice(0, cps.length - Math.max(0, roomCp));
      if (ens.length > roomEn) ens.splice(0, ens.length - Math.max(0, roomEn));
      nCp += cps.length;
      nEn += ens.length;
      perFile.push(cps.concat(ens));
    }
    return perFile.reverse().flat().sort((a, b) => a.ts - b.ts);
  }
  // ---- market recorder (gzip, hourly files) ----------------------------------------
  record(ev, ts) {
    const key = hour(ts);
    if (!this.recStream || this.recStream.key !== key) {
      this.closeRecorder();
      const gz = createGzip({ level: 6 });
      const file = createWriteStream(join(this.dir, "record", `${key}.jsonl.gz`), { flags: "a" });
      file.on("error", (e) => this.log.error("recorder write failed", { err: String(e) }));
      gz.pipe(file);
      this.recStream = { key, gz, file };
    }
    this.recStream.gz.write(JSON.stringify(ev) + "\n");
    this.recorded++;
  }
  closeRecorder() {
    if (this.recStream) {
      this.recStream.gz.end();
      this.recStream = null;
    }
  }
  recordFiles() {
    try {
      return readdirSync(join(this.dir, "record")).filter((f2) => f2.endsWith(".jsonl.gz")).sort().map((f2) => join(this.dir, "record", f2));
    } catch {
      return [];
    }
  }
  // ---- models ----------------------------------------------------------------------
  saveModel(m) {
    writeFileAtomic(join(this.dir, "models", "current.json"), JSON.stringify(m, null, 1));
    const safe = m.version.replace(/[^A-Za-z0-9_.-]/g, "_");
    writeFileAtomic(join(this.dir, "models", `${safe}.json`), JSON.stringify(m));
  }
  loadModel() {
    const p = join(this.dir, "models", "current.json");
    if (!existsSync(p)) return null;
    try {
      const m = JSON.parse(readFileSync(p, "utf8"));
      return validateModel(m) ? m : null;
    } catch {
      return null;
    }
  }
  // ---- edge finder -----------------------------------------------------------------
  saveEdges(report) {
    writeFileAtomic(join(this.dir, "edges.json"), JSON.stringify(report));
  }
  loadEdges() {
    const p = join(this.dir, "edges.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }
  // ---- wallets ---------------------------------------------------------------------
  saveWallets(snap) {
    writeFileAtomic(join(this.dir, "wallets.json.gz"), gzipSync(JSON.stringify(snap)));
  }
  loadWallets() {
    const p = join(this.dir, "wallets.json.gz");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));
    } catch {
      return null;
    }
  }
  // ---- misc --------------------------------------------------------------------------
  readSecret() {
    const p = join(this.dir, "secret.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")).token ?? null;
    } catch {
      return null;
    }
  }
  writeSecret(token) {
    writeFileAtomic(join(this.dir, "secret.json"), JSON.stringify({ token }));
  }
  /** Delete recordings/samples/journals past their retention. */
  cleanup(recordDays, sampleDays, now = Date.now()) {
    const prune = (sub, days) => {
      const cutoff = day(now - days * 864e5);
      try {
        for (const f2 of readdirSync(join(this.dir, sub))) if (f2.slice(0, 10) < cutoff) rmSync(join(this.dir, sub, f2), { force: true });
      } catch {
      }
    };
    prune("record", recordDays);
    prune("samples", sampleDays);
    prune("journal", Math.max(sampleDays, 30));
  }
  diskUsageMb() {
    let total = 0;
    const walk = (d) => {
      try {
        for (const f2 of readdirSync(d)) {
          const p = join(d, f2);
          const st = statSync(p);
          if (st.isDirectory()) walk(p);
          else total += st.size;
        }
      } catch {
      }
    };
    walk(this.dir);
    return Math.round(total / 1e6);
  }
  close() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
    this.closeRecorder();
  }
};
function appendLines(path, lines) {
  const fd = openSync(path, "a");
  try {
    writeSync(fd, lines.join("\n") + "\n");
  } finally {
    closeSync(fd);
  }
}
async function* readRecording(path) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
      }
    }
  } catch {
  }
}

// src/core/decode.ts
function ammPostReserves(s, reservesArePreTrade = true) {
  const vq = s.virtualQuote || 0;
  if (!reservesArePreTrade) return { base: s.poolBase, quote: s.poolQuote + vq };
  if (s.buy) return { base: s.poolBase - s.base, quote: s.poolQuote + s.quoteDelta + vq };
  return { base: s.poolBase + s.base, quote: Math.max(0, s.poolQuote - s.quoteDelta) + vq };
}

// src/core/funnel.ts
var REASON_TEXT = {
  bot_off: "Auto-trading is paused",
  kill_switch: "Kill switch is on",
  stage_off: "This stage is turned off in settings",
  non_sol_quote: "Coin is not paired with SOL",
  already_traded: "Already traded this coin (re-entry off)",
  max_open: "Max open positions reached",
  pending: "An order for this coin is already in flight",
  daily_loss_limit: "Daily loss limit reached",
  rate_limit: "Max trades per hour reached",
  feed_down: "Live data feed is down \u2014 not trading blind",
  warming_up: "Learning this market's score scale (first minutes after install)",
  insufficient_balance: "Not enough SOL in the wallet",
  slippage: "Price moved more than your slippage before the buy landed",
  migrating: "Coin is migrating to PumpSwap (not tradable for a moment)",
  no_price: "No tradable price yet",
  no_liquidity: "Not enough liquidity",
  size_too_small: "Position size too small after fees",
  live_error: "Live order error",
  live_disabled: "Live trading is not enabled on the server",
  "filter:mcap_min": "Market cap below your minimum",
  "filter:mcap_max": "Market cap above your maximum",
  "filter:dev": "Dev holds more than your limit",
  "filter:top10": "Top 10 holders above your limit",
  "filter:bundle": "Launch bundle above your limit",
  "filter:buyers": "Fewer buyers than your minimum",
  "filter:age_min": "Coin younger than your minimum age",
  "filter:age_max": "Coin older than your maximum age",
  "filter:socials": "No socials (you require them)",
  "filter:serial_dev": "Dev launched too many coins today",
  "filter:dev_sold": "Dev already sold more than your limit"
};
var HOUR = 36e5;
var Funnel = class _Funnel {
  recent = new Ring(500);
  byId = /* @__PURE__ */ new Map();
  hours = [];
  hour(now) {
    const t = Math.floor(now / HOUR) * HOUR;
    let h = this.hours[this.hours.length - 1];
    if (!h || h.t !== t) {
      if (h) this.finalize(h);
      h = { t, passes: 0, signals: 0, entered: 0, failed: 0, blocked: /* @__PURE__ */ new Map(), tokMax: /* @__PURE__ */ new Map(), hist100: null, coins: 0, maxScore: 0 };
      this.hours.push(h);
      if (this.hours.length > 48) this.hours.shift();
    }
    return h;
  }
  finalize(h) {
    if (!h.tokMax) return;
    h.hist100 = _Funnel.toHist(h.tokMax);
    h.coins = h.tokMax.size;
    h.tokMax = null;
  }
  static toHist(m) {
    const hist = new Array(101).fill(0);
    for (const v of m.values()) hist[Math.max(0, Math.min(100, Math.floor(v)))]++;
    return hist;
  }
  /** Every scoring pass: tracks each coin's best score of the hour. */
  noteScored(now, mint, score) {
    const h = this.hour(now);
    h.passes++;
    if (score > h.maxScore) h.maxScore = score;
    const m = h.tokMax;
    const prev = m.get(mint);
    if (prev === void 0 || score > prev) m.set(mint, score);
  }
  add(rec) {
    this.recent.push(rec);
    this.byId.set(rec.id, rec);
    if (this.byId.size > 1500) {
      const keep = new Set(this.recent.toArray().map((r) => r.id));
      for (const id of this.byId.keys()) if (!keep.has(id)) this.byId.delete(id);
    }
    const h = this.hour(rec.ts);
    h.signals++;
    if (rec.score > h.maxScore) h.maxScore = rec.score;
    this.count(h, rec.decision, rec.reason);
  }
  count(h, decision, reason) {
    if (decision === "entered") h.entered++;
    else if (decision === "failed") h.failed++;
    else if (decision === "blocked" && reason) h.blocked.set(reason, (h.blocked.get(reason) ?? 0) + 1);
  }
  update(id, decision, reason, positionId) {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.decision = decision;
    rec.reason = reason;
    if (positionId) rec.positionId = positionId;
    this.count(this.hour(rec.ts), decision, reason);
  }
  get(id) {
    return this.byId.get(id);
  }
  /**
   * Summary over the trailing window. `hist` has 10 bins of per-coin best scores;
   * `coinsAbove[t]` = coins whose best score reached ≥ t (t = 0…100) in the window.
   */
  summary(now, windowHours = 1) {
    this.hour(now);
    const from = now - windowHours * HOUR;
    let scored = 0;
    let signals = 0;
    let entered = 0;
    let failed = 0;
    let maxScore = 0;
    let hours = 0;
    const hist100 = new Array(101).fill(0);
    const blocked = /* @__PURE__ */ new Map();
    for (const h of this.hours) {
      if (h.t + HOUR <= from) continue;
      hours++;
      const hh = h.tokMax ? _Funnel.toHist(h.tokMax) : h.hist100 ?? [];
      hh.forEach((v, i) => hist100[i] += v);
      scored += h.tokMax ? h.tokMax.size : h.coins;
      signals += h.signals;
      entered += h.entered;
      failed += h.failed;
      if (h.maxScore > maxScore) maxScore = h.maxScore;
      for (const [k, v] of h.blocked) blocked.set(k, (blocked.get(k) ?? 0) + v);
    }
    const hist = new Array(10).fill(0);
    hist100.forEach((v, i) => hist[Math.min(9, Math.floor(i / 10))] += v);
    const coinsAbove = new Array(101).fill(0);
    let acc = 0;
    for (let i = 100; i >= 0; i--) {
      acc += hist100[i];
      coinsAbove[i] = acc;
    }
    const reasons = [...blocked.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, n, text: REASON_TEXT[reason] ?? reason }));
    return { windowHours, hours: Math.max(1, hours), scored, signals, entered, failed, maxScore, hist, coinsAbove, reasons };
  }
};

// src/core/narratives.ts
var STOP = /* @__PURE__ */ new Set([
  "the",
  "coin",
  "token",
  "official",
  "sol",
  "solana",
  "meme",
  "pump",
  "fun",
  "of",
  "and",
  "on",
  "in",
  "a",
  "an",
  "is",
  "to",
  "for",
  "my",
  "inu",
  "ai",
  "cto",
  "real",
  "new",
  "just",
  "by",
  "with",
  "com",
  "www"
]);
function normalizeWord(s) {
  return s.normalize("NFKD").toLowerCase().replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function narrativeKeys(name, symbol, twitter) {
  const keys = /* @__PURE__ */ new Set();
  const sym = normalizeWord(symbol);
  if (sym.length >= 2 && sym.length <= 14) keys.add(`t:${sym}`);
  const words = name.split(/[\s_\-.,!?/|]+/).map(normalizeWord).filter((w) => w.length >= 3 && !STOP.has(w));
  for (const w of words.slice(0, 4)) keys.add(`w:${w}`);
  const full = normalizeWord(name);
  if (full.length >= 4 && full.length <= 24 && words.length > 1) keys.add(`w:${full}`);
  if (twitter) {
    const status = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(twitter);
    if (status) keys.add(`tw:${status[2]}`);
    else {
      const handle = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?(?:$|\?)/i.exec(twitter);
      if (handle && !["home", "i", "search", "intent"].includes(handle[1].toLowerCase())) keys.add(`x:${handle[1].toLowerCase()}`);
    }
  }
  return [...keys];
}
var NarrativeIndex = class {
  constructor(windowMs = 60 * 6e4) {
    this.windowMs = windowMs;
  }
  launches = [];
  byKey = /* @__PURE__ */ new Map();
  firstByKey = /* @__PURE__ */ new Map();
  keysByMint = /* @__PURE__ */ new Map();
  add(mint, ts, name, symbol, twitter) {
    const prev = this.keysByMint.get(mint);
    const keys = narrativeKeys(name, symbol, twitter);
    if (prev) {
      const extra = keys.filter((k) => !prev.includes(k));
      if (extra.length === 0) return;
      prev.push(...extra);
      for (const k of extra) this.link(k, mint, ts);
      return;
    }
    this.keysByMint.set(mint, keys);
    this.launches.push({ ts, mint, keys });
    for (const k of keys) this.link(k, mint, ts);
  }
  link(k, mint, ts) {
    let set = this.byKey.get(k);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.byKey.set(k, set);
    }
    set.add(mint);
    const first = this.firstByKey.get(k);
    if (!first || ts < first.ts) this.firstByKey.set(k, { mint, ts });
  }
  prune(now) {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.launches.length && this.launches[i].ts < cutoff) {
      const l = this.launches[i];
      for (const k of this.keysByMint.get(l.mint) ?? l.keys) {
        const set = this.byKey.get(k);
        if (set) {
          set.delete(l.mint);
          if (set.size === 0) {
            this.byKey.delete(k);
            this.firstByKey.delete(k);
          } else if (this.firstByKey.get(k)?.mint === l.mint) {
            this.firstByKey.set(k, { mint: [...set][0], ts: cutoff });
          }
        }
      }
      this.keysByMint.delete(l.mint);
      i++;
    }
    if (i > 0) this.launches.splice(0, i);
  }
  /** Narrative facts for one token; `mcapOf` resolves current market caps. */
  describe(mint, mcapOf) {
    const keys = this.keysByMint.get(mint);
    if (!keys || keys.length === 0) return { clusterKey: null, clusterSize: 1, isLeader: true, isFirst: true, tweetLinked: false };
    let bestKey = null;
    let bestSize = 1;
    for (const k of keys) {
      const n = this.byKey.get(k)?.size ?? 1;
      if (n > bestSize || n === bestSize && bestKey === null) {
        bestSize = n;
        bestKey = k;
      }
    }
    let isLeader = true;
    let isFirst = true;
    if (bestKey && bestSize > 1) {
      const myMcap = mcapOf(mint);
      for (const other of this.byKey.get(bestKey) ?? []) {
        if (other !== mint && mcapOf(other) > myMcap) {
          isLeader = false;
          break;
        }
      }
      isFirst = this.firstByKey.get(bestKey)?.mint === mint;
    }
    return { clusterKey: bestSize > 1 ? bestKey : null, clusterSize: bestSize, isLeader, isFirst, tweetLinked: keys.some((k) => k.startsWith("tw:")) };
  }
  /** Hottest clusters right now (≥ 2 launches), with their current leader. */
  hot(limit, mcapOf) {
    const rows = [];
    for (const [key, set] of this.byKey) {
      if (set.size < 2) continue;
      let leader = null;
      let leaderMcap = 0;
      for (const m of set) {
        const mc = mcapOf(m);
        if (mc > leaderMcap) {
          leaderMcap = mc;
          leader = m;
        }
      }
      const first = this.firstByKey.get(key);
      rows.push({ key, size: set.size, leader, leaderMcap, firstMint: first?.mint ?? null, firstTs: first?.ts ?? 0, mints: [...set].slice(0, 20) });
    }
    rows.sort((a, b) => b.size - a.size || b.leaderMcap - a.leaderMcap);
    return rows.slice(0, limit);
  }
  get size() {
    return this.launches.length;
  }
};

// src/core/token.ts
var BUCKET_MS = 5e3;
var BUCKETS = 144;
var MAX_HOLDERS_TRACKED = 6e3;
var TokenState = class _TokenState {
  mint;
  name = "";
  symbol = "";
  uri = "";
  creator = "";
  createdAt;
  createSlot;
  createSig;
  /** true when first seen through a trade, not the create event */
  partial = false;
  nonSol = false;
  stage = "curve";
  vSol = CURVE.initialVirtualSol;
  vTok = CURVE.initialVirtualTok;
  realTok = CURVE.initialRealTok;
  supply = CURVE.supply;
  pool;
  poolBase = 0;
  poolQuote = 0;
  mcapSol = 0;
  priceSol = 0;
  firstMcapSol = 0;
  athMcapSol = 0;
  athAt = 0;
  lastTradeAt = 0;
  lastEventAt = 0;
  completeAt;
  migrateAt;
  tradeCount = 0;
  buyCount = 0;
  sellCount = 0;
  buySolTotal = 0;
  sellSolTotal = 0;
  uniqueBuyers = 0;
  holders = /* @__PURE__ */ new Map();
  devBal = 0;
  devMaxBal = 0;
  devSoldTok = 0;
  devBoughtSol = 0;
  bundleTok = 0;
  bundleBuyers = 0;
  earlyTok = 0;
  earlyBuyers = 0;
  freshBuys = 0;
  knownBuys = 0;
  maxBuySol = 0;
  meta = {};
  quote;
  trades = new Ring(120);
  buckets = Array.from({ length: BUCKETS }, () => ({ t: -1, buySol: 0, sellSol: 0, buyN: 0, sellN: 0, close: 0, high: 0, low: 0 }));
  constructor(mint, ts) {
    this.mint = mint;
    this.createdAt = ts;
    this.lastEventAt = ts;
    this.refreshPrice();
    this.firstMcapSol = this.mcapSol;
    this.athMcapSol = this.mcapSol;
    this.athAt = ts;
  }
  static fromCreate(ev) {
    const t = new _TokenState(ev.mint, ev.ts);
    t.applyCreate(ev);
    return t;
  }
  applyCreate(ev) {
    this.name = ev.name;
    this.symbol = ev.symbol;
    this.uri = ev.uri;
    this.creator = ev.creator;
    this.createdAt = ev.ts;
    this.createSlot = ev.slot;
    this.createSig = ev.sig;
    this.nonSol = !!ev.nonSolQuote;
    this.partial = false;
    if (ev.vTok > 0) {
      this.vSol = ev.vSol;
      this.vTok = ev.vTok;
      this.realTok = ev.realTok;
      this.supply = ev.supply;
    }
    this.refreshPrice();
    this.firstMcapSol = this.mcapSol;
    this.athMcapSol = Math.max(this.athMcapSol, this.mcapSol);
  }
  get ageMs() {
    return this.lastEventAt - this.createdAt;
  }
  get progress() {
    return this.stage === "curve" ? curveProgress(this) : 1;
  }
  /** lamports of real SOL in the curve (derived from virtual reserves) */
  get realSol() {
    return Math.max(0, this.vSol - CURVE.initialVirtualSol);
  }
  refreshPrice() {
    if (this.stage === "amm" && this.poolBase > 0) {
      const p = { base: this.poolBase, quote: this.poolQuote, supply: this.supply };
      this.mcapSol = poolMcapSol(p);
      this.priceSol = poolPriceSol(p);
    } else {
      this.mcapSol = curveMcapSol(this);
      this.priceSol = curvePriceSol(this);
    }
  }
  bucketFor(ts) {
    const t0 = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
    const b = this.buckets[Math.floor(ts / BUCKET_MS) % BUCKETS];
    if (b.t !== t0) {
      b.t = t0;
      b.buySol = b.sellSol = b.buyN = b.sellN = 0;
      b.close = b.high = b.low = this.mcapSol;
    }
    return b;
  }
  /**
   * Apply a trade. `ctx.fresh` marks wallets never seen before (bundled alts);
   * `ctx.isDev` marks the creator's own trades.
   */
  applyTrade(ev, ctx) {
    const ts = ev.ts;
    this.lastEventAt = Math.max(this.lastEventAt, ts);
    this.lastTradeAt = ts;
    this.tradeCount++;
    if (ev.venue === "amm") {
      if (this.stage !== "amm") {
        this.stage = "amm";
        this.migrateAt ??= ts;
      }
      if (ev.pool) this.pool = ev.pool;
      this.poolBase = ev.vTok;
      this.poolQuote = ev.vSol;
      if (ev.supply && ev.supply > 0) this.supply = ev.supply;
    } else if (this.stage === "curve") {
      this.vSol = ev.vSol;
      this.vTok = ev.vTok;
      if (ev.realTok !== void 0) this.realTok = ev.realTok;
      else this.realTok = Math.max(0, ev.vTok - (CURVE.initialVirtualTok - CURVE.initialRealTok));
      if (ev.supply && ev.supply > 0) this.supply = ev.supply;
    }
    this.refreshPrice();
    const m = this.mcapSol;
    if (this.firstMcapSol === 0) this.firstMcapSol = m;
    if (m > this.athMcapSol) {
      this.athMcapSol = m;
      this.athAt = ts;
    }
    const solAmt = ev.sol / LAMPORTS_PER_SOL;
    const b = this.bucketFor(ts);
    if (ev.buy) {
      this.buyCount++;
      this.buySolTotal += solAmt;
      b.buySol += solAmt;
      b.buyN++;
      if (solAmt > this.maxBuySol) this.maxBuySol = solAmt;
    } else {
      this.sellCount++;
      this.sellSolTotal += solAmt;
      b.sellSol += solAmt;
      b.sellN++;
    }
    b.close = m;
    if (m > b.high) b.high = m;
    if (m < b.low || b.low === 0) b.low = m;
    this.trades.push({ ts, buy: ev.buy, sol: solAmt, user: ev.user, mcap: m });
    this.applyHolder(ev, ctx);
  }
  applyHolder(ev, ctx) {
    const isDev = ev.user === this.creator;
    let h = this.holders.get(ev.user);
    if (!h) {
      if (!ev.buy) {
        if (isDev) this.devSoldTok += ev.tok;
        return;
      }
      this.uniqueBuyers++;
      if (ctx.fresh) this.freshBuys++;
      else if (ctx.knownWallet) this.knownBuys++;
      if (this.holders.size >= MAX_HOLDERS_TRACKED) return;
      const sinceCreate = ev.ts - this.createdAt;
      const bundle = !isDev && !this.partial && (ev.slot !== void 0 && this.createSlot !== void 0 && ev.slot <= this.createSlot || (ev.slot === void 0 || this.createSlot === void 0) && sinceCreate <= 1e3);
      const early = !this.partial && (ev.slot !== void 0 && this.createSlot !== void 0 && ev.slot <= this.createSlot + 2 || (ev.slot === void 0 || this.createSlot === void 0) && sinceCreate <= 3e3);
      h = { bal: 0, maxBal: 0, boughtSol: 0, soldSol: 0, firstBuy: ev.ts, lastBuy: ev.ts, early, bundle, fresh: ctx.fresh };
      this.holders.set(ev.user, h);
      if (bundle) this.bundleBuyers++;
      if (early && !isDev) this.earlyBuyers++;
    }
    const solAmt = ev.sol / LAMPORTS_PER_SOL;
    if (ev.buy) {
      h.bal += ev.tok;
      h.boughtSol += solAmt;
      h.lastBuy = ev.ts;
      if (h.bal > h.maxBal) h.maxBal = h.bal;
      if (h.bundle) this.bundleTok += ev.tok;
      if (h.early && !isDev) this.earlyTok += ev.tok;
      if (isDev) {
        this.devBal += ev.tok;
        this.devBoughtSol += solAmt;
        if (this.devBal > this.devMaxBal) this.devMaxBal = this.devBal;
      }
    } else {
      const sold = Math.min(h.bal, ev.tok);
      h.bal -= sold;
      h.soldSol += solAmt;
      if (h.bundle) this.bundleTok = Math.max(0, this.bundleTok - sold);
      if (h.early && !isDev) this.earlyTok = Math.max(0, this.earlyTok - sold);
      if (isDev) {
        this.devBal = Math.max(0, this.devBal - ev.tok);
        this.devSoldTok += ev.tok;
      }
    }
  }
  applyComplete(ts) {
    if (this.stage === "curve") this.stage = "migrating";
    this.completeAt ??= ts;
    this.realTok = 0;
    this.lastEventAt = Math.max(this.lastEventAt, ts);
  }
  applyMigrate(ts, pool, base, quote) {
    this.stage = "amm";
    this.completeAt ??= ts;
    this.migrateAt ??= ts;
    if (pool) this.pool = pool;
    if (base && quote && base > 0 && quote > 0) {
      this.poolBase = base;
      this.poolQuote = quote;
      this.refreshPrice();
    }
    this.lastEventAt = Math.max(this.lastEventAt, ts);
  }
  applyMeta(ev) {
    const m = this.meta;
    if (ev.twitter) m.twitter = ev.twitter;
    if (ev.telegram) m.telegram = ev.telegram;
    if (ev.website) m.website = ev.website;
    if (ev.description) m.description = ev.description.slice(0, 400);
    if (ev.image) m.image = ev.image;
    if (ev.dexProfile !== void 0) m.dexProfile = ev.dexProfile || m.dexProfile;
    if (ev.boosts !== void 0) m.boosts = Math.max(m.boosts ?? 0, ev.boosts);
    m.fetchedAt = ev.ts;
  }
  applyQuote(ev) {
    this.quote = ev;
    if (!this.name && ev.name) this.name = ev.name;
    if (!this.symbol && ev.symbol) this.symbol = ev.symbol;
    this.lastEventAt = Math.max(this.lastEventAt, ev.ts);
    if (ev.priceSol && ev.priceSol > 0 && this.tradeCount === 0) {
      this.priceSol = ev.priceSol;
      this.mcapSol = ev.priceSol * this.supply / 1e6;
      if (this.firstMcapSol === 0) this.firstMcapSol = this.mcapSol;
      if (this.mcapSol > this.athMcapSol) {
        this.athMcapSol = this.mcapSol;
        this.athAt = ev.ts;
      }
    }
  }
  /** Aggregate flow over the trailing window (ms). */
  window(now, ms, endAgoMs = 0) {
    const from = now - ms - endAgoMs;
    const to = now - endAgoMs;
    let buySol = 0;
    let sellSol = 0;
    let buyN = 0;
    let sellN = 0;
    for (const b of this.buckets) {
      if (b.t < 0 || b.t + BUCKET_MS <= from || b.t > to) continue;
      buySol += b.buySol;
      sellSol += b.sellSol;
      buyN += b.buyN;
      sellN += b.sellN;
    }
    return { buySol, sellSol, buyN, sellN, net: buySol - sellSol, n: buyN + sellN };
  }
  /** Market cap (SOL) as of `agoMs` before `now`, from bucket closes. */
  mcapAgo(now, agoMs) {
    const target = now - agoMs;
    let best;
    for (const b of this.buckets) {
      if (b.t < 0 || b.t > target) continue;
      if (!best || b.t > best.t) best = b;
    }
    if (best) return best.close;
    return target <= this.createdAt ? this.firstMcapSol || this.mcapSol : this.mcapSol;
  }
  /** Unique buyers whose latest buy is within the window. */
  uniqueBuyersSince(since) {
    let n = 0;
    for (const h of this.holders.values()) if (h.lastBuy >= since) n++;
    return n;
  }
  scanCache = { at: -1, recentMs: 0, withSmart: false, uniqRecent: 0, smart: 0, top10: 0, top1: 0, holders: 0 };
  /**
   * One pass over holders: recent unique buyers, smart holders, top-1/top-10 share of
   * supply (curve/pool excluded) and live holder count. Cached for `maxAgeMs`.
   */
  scanHolders(now, recentMs, isSmart, maxAgeMs = 1e3) {
    const c = this.scanCache;
    if (c.at >= 0 && now - c.at < maxAgeMs && c.recentMs === recentMs && (c.withSmart || !isSmart)) return c;
    const since = now - recentMs;
    let uniq = 0;
    let smart = 0;
    let holders = 0;
    const top = [];
    for (const [addr, h] of this.holders) {
      if (h.lastBuy >= since) uniq++;
      if (h.bal <= 0) continue;
      holders++;
      if (isSmart && isSmart(addr)) smart++;
      if (top.length < 10) {
        top.push(h.bal);
        if (top.length === 10) top.sort((a, b) => a - b);
      } else if (h.bal > top[0]) {
        top[0] = h.bal;
        for (let i = 0; i < 9 && top[i] > top[i + 1]; i++) {
          const tmp = top[i];
          top[i] = top[i + 1];
          top[i + 1] = tmp;
        }
      }
    }
    let sum = 0;
    let max = 0;
    for (const b of top) {
      sum += b;
      if (b > max) max = b;
    }
    this.scanCache = { at: now, recentMs, withSmart: !!isSmart, uniqRecent: uniq, smart, top10: sum / this.supply, top1: max / this.supply, holders };
    return this.scanCache;
  }
  /** Top-1/top-10 holder share of total supply (curve/pool excluded); cached ~2 s. */
  concentration(now) {
    const c = this.scanHolders(now, 6e4, null, 2e3);
    return { at: c.at, top10: c.top10, top1: c.top1, holders: c.holders };
  }
  venue() {
    return this.stage === "amm" ? "amm" : "curve";
  }
  /** True when the token has had no activity for `idleMs`. */
  isIdle(now, idleMs) {
    return now - this.lastEventAt > idleMs;
  }
  toJSON() {
    return {
      mint: this.mint,
      name: this.name,
      symbol: this.symbol,
      creator: this.creator,
      stage: this.stage,
      createdAt: this.createdAt,
      mcapSol: this.mcapSol,
      athMcapSol: this.athMcapSol,
      progress: this.progress,
      trades: this.tradeCount,
      uniqueBuyers: this.uniqueBuyers,
      meta: this.meta
    };
  }
};

// src/core/wallets.ts
var WalletBook = class _WalletBook {
  wallets;
  creators;
  smartSet = /* @__PURE__ */ new Set();
  /** first time the book started observing (for "fresh wallet" confidence) */
  startedAt;
  constructor(now, opts = {}) {
    this.startedAt = now;
    this.wallets = new LRU(opts.maxWallets ?? 8e4);
    this.creators = new LRU(opts.maxCreators ?? 6e4);
  }
  get size() {
    return this.wallets.size;
  }
  peek(addr) {
    return this.wallets.peek(addr);
  }
  /** Records a buy/sell; returns whether the wallet was unknown before this trade. */
  touch(addr, ts, buy) {
    let w = this.wallets.get(addr);
    const known = !!w && w.buys + w.sells > 0;
    if (!w) {
      w = { first: ts, last: ts, buys: 0, sells: 0, tokens: 0, closed: 0, wins: 0, pnl: 0, roiSum: 0, early: 0, bundles: 0, creates: 0 };
      this.wallets.set(addr, w);
    }
    const observedLongEnough = ts - this.startedAt > 45 * 6e4;
    const fresh = observedLongEnough && !known && ts - w.first < 10 * 6e4;
    w.last = ts;
    if (buy) w.buys++;
    else w.sells++;
    return { fresh, known };
  }
  noteNewPosition(addr, early, bundle) {
    const w = this.wallets.peek(addr);
    if (!w) return;
    w.tokens++;
    if (early) w.early++;
    if (bundle) w.bundles++;
  }
  /** Close a wallet's position in a token (sold out, or token evicted). */
  closePosition(addr, boughtSol, soldSol, remainingValueSol) {
    const w = this.wallets.peek(addr);
    if (!w || boughtSol <= 0) return;
    const proceeds = soldSol + Math.max(0, remainingValueSol);
    const pnl = proceeds - boughtSol;
    w.closed++;
    if (pnl > 0) w.wins++;
    w.pnl += pnl;
    w.roiSum += clamp(proceeds / boughtSol - 1, -1, 5);
    if (_WalletBook.isSmart(w)) this.smartSet.add(addr);
    else this.smartSet.delete(addr);
  }
  noteCreate(creator, ts) {
    let c = this.creators.get(creator);
    if (!c) {
      c = { launches: 0, lastLaunch: 0, recent: [], best: 0, graduated: 0 };
      this.creators.set(creator, c);
    }
    c.launches++;
    c.lastLaunch = ts;
    c.recent.push(ts);
    if (c.recent.length > 50) c.recent.splice(0, c.recent.length - 50);
    const w = this.wallets.peek(creator);
    if (w) w.creates++;
  }
  noteCreatorResult(creator, peakMcapSol, graduated) {
    const c = this.creators.peek(creator);
    if (!c) return;
    if (peakMcapSol > c.best) c.best = peakMcapSol;
    if (graduated) c.graduated++;
  }
  creator(creator, now) {
    const c = this.creators.peek(creator);
    if (!c) return { launches24h: 0, launches: 0, best: 0, graduated: 0 };
    let n = 0;
    for (const t of c.recent) if (now - t < 864e5) n++;
    return { launches24h: n, launches: c.launches, best: c.best, graduated: c.graduated };
  }
  static isSmart(w) {
    if (w.closed < 8) return false;
    if (w.creates > 3) return false;
    const winRate = (w.wins + 1) / (w.closed + 4);
    const avgRoi = w.roiSum / w.closed;
    return winRate >= 0.55 && avgRoi >= 0.3 && w.pnl >= 1;
  }
  isSmart(addr) {
    if (!this.smartSet.has(addr)) return false;
    if (this.wallets.peek(addr)) return true;
    this.smartSet.delete(addr);
    return false;
  }
  smartCount() {
    return this.smartSet.size;
  }
  /** Memory relief: forget the least recently active wallets, keeping ones with a track record. */
  trim(keepFraction) {
    const target = Math.floor(this.wallets.size * clamp(keepFraction, 0, 1));
    const dropped = this.wallets.shrinkTo(target, (a, w) => w.closed >= 3 || w.creates >= 1 || this.smartSet.has(a));
    for (const a of this.smartSet) if (!this.wallets.peek(a)) this.smartSet.delete(a);
    return dropped;
  }
  view(addr, w) {
    const winRate = w.closed ? w.wins / w.closed : 0;
    const avgRoi = w.closed ? w.roiSum / w.closed : 0;
    const tags = [];
    const smart = _WalletBook.isSmart(w);
    if (smart) tags.push("smart");
    if (w.tokens >= 5 && w.early / w.tokens > 0.6) tags.push("sniper");
    if (w.tokens >= 3 && w.bundles / w.tokens > 0.5) tags.push("bundler");
    if (w.creates >= 3) tags.push("serial-dev");
    return { address: addr, ...w, winRate, avgRoi, smart, tags };
  }
  /** Top wallets by realized profit among those with enough closed positions. */
  leaderboard(limit = 50, minClosed = 5) {
    const rows = [];
    for (const [addr, w] of this.wallets.entries()) if (w.closed >= minClosed) rows.push(this.view(addr, w));
    rows.sort((a, b) => b.pnl - a.pnl);
    return rows.slice(0, limit);
  }
  /** Serializable snapshot of wallets worth keeping (enough history). */
  snapshot() {
    const wallets = [];
    for (const [a, w] of this.wallets.entries()) if (w.closed >= 2 || w.creates >= 1) wallets.push([a, w]);
    const creators = [];
    for (const [a, c] of this.creators.entries()) creators.push([a, c]);
    return { wallets, creators };
  }
  restore(snap) {
    for (const [a, w] of snap.wallets ?? []) if (a && w && typeof w.closed === "number") this.wallets.set(a, w);
    for (const [a, c] of snap.creators ?? []) if (a && c && Array.isArray(c.recent)) this.creators.set(a, c);
    this.smartSet.clear();
    for (const [a, w] of this.wallets.entries()) if (_WalletBook.isSmart(w)) this.smartSet.add(a);
  }
};

// src/core/engine.ts
var DEFAULT_CONFIG = {
  maxTokens: 25e3,
  idleEvictMs: 25 * 6e4,
  minTradesToScore: 3,
  rescoreMs: 1e3,
  sweepMs: 5e3,
  feedStaleMs: 45e3,
  paperStartSol: 10,
  outcomeLatencyMs: 1500,
  outcomeSizeSol: 0.1,
  outcomeHorizonMs: 6 * 36e5,
  outcomeMaxOpen: 3e4,
  checkpointsCurveSec: [20, 45, 90, 180, 360, 720],
  checkpointsProgress: [0.25, 0.5, 0.75],
  checkpointsAmmSec: [60, 300, 900, 3600],
  maxSamplesInMemory: 3e4,
  maxWallets: 8e4,
  seed: 1
};
var dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
function entryFacts(t, f2) {
  const r = (v, d = 4) => Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0;
  return {
    mcap: r(t.mcapSol, 2),
    age: Math.round(f2.ageSec),
    buyers: f2.uniqTotal,
    top10: r(f2.top10),
    bundle: r(f2.bundleShare),
    devShare: r(f2.devShare),
    devSold: r(f2.devSold),
    socials: f2.socials,
    launches24h: f2.creatorLaunches24h
  };
}
var Engine = class {
  cfg;
  settings;
  model;
  costs;
  tokens = /* @__PURE__ */ new Map();
  pools = /* @__PURE__ */ new Map();
  wallets;
  narratives = new NarrativeIndex();
  pulse = new MarketPulse();
  funnel = new Funnel();
  outcomes;
  positions = /* @__PURE__ */ new Map();
  closed = new Ring(500);
  tradedMints = /* @__PURE__ */ new Set();
  samples;
  feeds = /* @__PURE__ */ new Map();
  stats;
  paperBalance;
  killed = false;
  executor;
  solUsd = 0;
  log;
  hooks;
  scores = /* @__PURE__ */ new Map();
  dirty = /* @__PURE__ */ new Set();
  orders = /* @__PURE__ */ new Map();
  paperQueue = [];
  /** delayed actions (order retries) so failures never spin in a tight loop */
  later = [];
  lastSweep = 0;
  lastPersist = 0;
  persistDirty = false;
  now = 0;
  rand;
  ammLast = /* @__PURE__ */ new Map();
  ammPending = /* @__PURE__ */ new Map();
  ammPreHits = 0;
  ammPostHits = 0;
  /** population sample of feature vectors (for self-normalizing the prior's scale) */
  xRes = { curve: new Ring(3e3), amm: new Ring(3e3) };
  priorBase;
  lastNormalize = 0;
  constructor(opts) {
    this.cfg = { ...DEFAULT_CONFIG, ...opts.config ?? {} };
    this.settings = sanitizeSettings(opts.settings ?? {}, DEFAULT_SETTINGS);
    this.model = opts.model && validateModel(opts.model) ? opts.model : priorModel(opts.now);
    this.priorBase = priorModel(opts.now);
    this.costs = opts.costs ?? { ...DEFAULT_COSTS, priorityFeeSol: this.settings.priorityFeeSol, platformFeePct: this.settings.platformFeePct };
    this.hooks = opts.hooks ?? {};
    this.log = opts.log ?? silentLogger;
    this.now = opts.now;
    this.rand = rng(this.cfg.seed);
    this.wallets = new WalletBook(opts.now, { maxWallets: this.cfg.maxWallets });
    this.samples = new Ring(this.cfg.maxSamplesInMemory);
    this.paperBalance = this.cfg.paperStartSol * LAMPORTS_PER_SOL;
    this.stats = {
      startedAt: opts.now,
      events: 0,
      trades: 0,
      creates: 0,
      ammSwaps: 0,
      unmappedAmm: 0,
      errors: 0,
      badEvents: 0,
      lastEventAt: 0,
      lastTradeAt: 0,
      realized: 0,
      wins: 0,
      losses: 0,
      entries: 0,
      exits: 0,
      fees: 0,
      dayKey: dayKey(opts.now),
      dayPnl: 0,
      entryTimes: [],
      equity: [{ t: opts.now, v: this.paperBalance }]
    };
    this.outcomes = new OutcomeTracker(
      {
        latencyMs: this.cfg.outcomeLatencyMs,
        sizeSol: this.cfg.outcomeSizeSol,
        horizonMs: this.cfg.outcomeHorizonMs,
        maxOpen: this.cfg.outcomeMaxOpen,
        costs: this.costs
      },
      (s) => {
        this.samples.push(s);
        this.hooks.onSample?.(s);
      }
    );
  }
  get clock() {
    return this.now;
  }
  // -------------------------------------------------------------------------
  // Ingestion
  // -------------------------------------------------------------------------
  ingest(ev) {
    try {
      if (!ev || typeof ev !== "object" || typeof ev.k !== "string") {
        this.stats.badEvents++;
        return;
      }
      const ts = Number.isFinite(ev.ts) ? ev.ts : this.now;
      if (ts > this.now) this.advance(ts - 1, true);
      this.stats.events++;
      this.stats.lastEventAt = Math.max(this.stats.lastEventAt, ts);
      switch (ev.k) {
        case "create":
          this.onCreate(ev);
          break;
        case "trade":
          this.onTrade(ev);
          break;
        case "ammSwap":
          this.onAmmSwap(ev);
          break;
        case "complete": {
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyComplete(ts);
            this.wallets.noteCreatorResult(t.creator, t.athMcapSol, true);
            this.dirty.add(t.mint);
          }
          break;
        }
        case "migrate": {
          const t = this.tokens.get(ev.mint);
          if (ev.pool) this.pools.set(ev.pool, ev.mint);
          if (t) {
            t.applyMigrate(ts, ev.pool);
            if (!t.poolBase && ev.mintAmount && ev.solAmount) {
              t.poolBase = ev.mintAmount;
              t.poolQuote = ev.solAmount;
              t.refreshPrice();
            }
            this.dirty.add(t.mint);
          }
          if (ev.pool) this.drainPool(ev.pool);
          break;
        }
        case "pool": {
          if (!ev.quoteIsSol) break;
          this.pools.set(ev.pool, ev.mint);
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyMigrate(ts, ev.pool, ev.base, ev.quote);
            this.ammLast.set(ev.pool, { base: ev.base, quote: ev.quote, rb: ev.base, rq: ev.quote });
            this.dirty.add(t.mint);
          }
          this.drainPool(ev.pool);
          break;
        }
        case "quote": {
          let t = this.tokens.get(ev.mint);
          if (!t && this.isWatched(ev.mint)) t = this.ensureToken(ev.mint, ts, true);
          if (t) {
            t.applyQuote(ev);
            if (t.tradeCount === 0) this.onPrice(t);
            this.dirty.add(t.mint);
          }
          break;
        }
        case "meta": {
          const t = this.tokens.get(ev.mint);
          if (t) {
            t.applyMeta(ev);
            if (ev.twitter) this.narratives.add(t.mint, t.createdAt, t.name, t.symbol, ev.twitter);
            this.dirty.add(t.mint);
          }
          break;
        }
        default:
          this.stats.badEvents++;
      }
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errors < 20 || this.stats.errors % 1e3 === 0) this.log.error("ingest failed", { err: String(e), k: ev?.k });
    }
  }
  isWatched(mint) {
    for (const p of this.positions.values()) if (p.mint === mint) return true;
    return false;
  }
  ensureToken(mint, ts, partial) {
    let t = this.tokens.get(mint);
    if (!t) {
      t = new TokenState(mint, ts);
      t.partial = partial;
      this.tokens.set(mint, t);
      if (this.tokens.size > this.cfg.maxTokens) this.evictOldest();
    }
    return t;
  }
  onCreate(ev) {
    this.stats.creates++;
    let t = this.tokens.get(ev.mint);
    if (t) t.applyCreate(ev);
    else {
      t = TokenState.fromCreate(ev);
      this.tokens.set(ev.mint, t);
      if (this.tokens.size > this.cfg.maxTokens) this.evictOldest();
    }
    this.wallets.noteCreate(ev.creator, ev.ts);
    this.narratives.add(ev.mint, ev.ts, ev.name, ev.symbol);
    this.pulse.onLaunch(ev.ts);
    if (ev.uri) this.hooks.needMeta?.(ev.mint, ev.uri);
  }
  onTrade(ev) {
    if (!(ev.vSol > 0) || !(ev.vTok > 0) || !(ev.tok >= 0) || !(ev.sol >= 0) || typeof ev.mint !== "string") {
      this.stats.badEvents++;
      return;
    }
    this.stats.trades++;
    this.stats.lastTradeAt = Math.max(this.stats.lastTradeAt, ev.ts);
    const t = this.ensureToken(ev.mint, ev.ts, true);
    if (t.stage === "amm" && ev.venue === "curve") return;
    const w = this.wallets.touch(ev.user, ev.ts, ev.buy);
    const before = t.holders.get(ev.user);
    const hadBal = before ? before.bal : 0;
    t.applyTrade(ev, { fresh: w.fresh, knownWallet: w.known });
    const after = t.holders.get(ev.user);
    if (!before && after) this.wallets.noteNewPosition(ev.user, after.early, after.bundle);
    if (after && !ev.buy && hadBal > 0 && after.bal <= after.maxBal * 0.02) {
      this.wallets.closePosition(ev.user, after.boughtSol, after.soldSol, 0);
      after.boughtSol = 0;
      after.soldSol = 0;
      after.maxBal = after.bal;
    }
    this.pulse.onTrade(ev.ts, ev.buy, ev.sol / LAMPORTS_PER_SOL);
    this.dirty.add(t.mint);
    this.onPrice(t);
  }
  onAmmSwap(ev) {
    this.stats.ammSwaps++;
    const last = this.ammLast.get(ev.pool);
    if (last) {
      const tol = Math.max(2, last.base * 1e-9);
      if (Math.abs(ev.poolBase - last.base) <= tol) this.ammPreHits++;
      const prevReportedBase = ev.buy ? ev.poolBase + ev.base : ev.poolBase - ev.base;
      if (Math.abs(prevReportedBase - last.rb) <= tol) this.ammPostHits++;
    }
    const pre = this.ammPostHits <= this.ammPreHits || this.ammPreHits + this.ammPostHits < 20;
    const post = ammPostReserves(ev, pre);
    this.ammLast.set(ev.pool, { ...post, rb: ev.poolBase, rq: ev.poolQuote });
    if (this.ammLast.size > 5e4) this.ammLast.delete(this.ammLast.keys().next().value);
    const mint = this.pools.get(ev.pool);
    if (!mint) {
      this.stats.unmappedAmm++;
      let q = this.ammPending.get(ev.pool);
      if (!q) {
        if (this.ammPending.size >= 5e3) return;
        q = [];
        this.ammPending.set(ev.pool, q);
        this.hooks.needPool?.(ev.pool);
      }
      if (q.length < 50) q.push({ ev, post });
      return;
    }
    this.applyAmm(ev, post, mint);
  }
  applyAmm(ev, post, mint) {
    this.onTrade({
      k: "trade",
      ts: ev.ts,
      chainTs: ev.chainTs,
      slot: ev.slot,
      sig: ev.sig,
      src: ev.src,
      mint,
      buy: ev.buy,
      sol: ev.quoteDelta,
      tok: ev.base,
      user: ev.user,
      venue: "amm",
      vSol: post.quote,
      vTok: post.base,
      supply: ev.supply,
      fee: ev.fee,
      pool: ev.pool
    });
  }
  drainPool(pool) {
    const q = this.ammPending.get(pool);
    const mint = this.pools.get(pool);
    if (!q || !mint) return;
    this.ammPending.delete(pool);
    for (const { ev, post } of q) if (this.now - ev.ts < 6e4) this.applyAmm(ev, post, mint);
  }
  /** Register a pool → mint mapping discovered out of band (RPC lookup). */
  mapPool(pool, mint) {
    this.pools.set(pool, mint);
    this.drainPool(pool);
  }
  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------
  /** Advance engine time: land paper orders, rescore, open checkpoints, maintenance. */
  advance(now, fromIngest = false) {
    try {
      if (now < this.now) now = this.now;
      this.now = now;
      this.landPaperOrders(now);
      if (this.later.length) {
        const due = this.later.filter((a) => a.at <= now);
        if (due.length) {
          this.later = this.later.filter((a) => a.at > now);
          for (const a of due) a.run();
        }
      }
      if (fromIngest) return;
      this.rescoreDirty(now);
      if (now - this.lastSweep >= this.cfg.sweepMs) {
        this.lastSweep = now;
        this.sweep(now);
      }
      if (this.persistDirty && now - this.lastPersist >= 250) this.persistNow();
    } catch (e) {
      this.stats.errors++;
      if (this.stats.errors < 20 || this.stats.errors % 1e3 === 0) this.log.error("advance failed", { err: String(e), stack: e?.stack });
    }
  }
  onPrice(t) {
    const now = Math.max(this.now, t.lastEventAt);
    this.outcomes.onPrice(t, now);
    for (const p of this.positions.values()) if (p.mint === t.mint && (p.status === "open" || p.status === "closing")) this.evaluatePosition(p, t, now);
  }
  // -------------------------------------------------------------------------
  // Scoring and signals
  // -------------------------------------------------------------------------
  scorable(t) {
    if (t.nonSol || t.stage === "migrating") return false;
    if (t.tradeCount < this.cfg.minTradesToScore && !(t.stage === "amm" && t.quote)) return false;
    return true;
  }
  rescoreDirty(now) {
    if (this.dirty.size === 0) return;
    const todo = [];
    for (const mint of this.dirty) {
      const prev = this.scores.get(mint);
      if (prev && now - prev.at < this.cfg.rescoreMs) continue;
      todo.push(mint);
    }
    for (const mint of todo) {
      this.dirty.delete(mint);
      const t = this.tokens.get(mint);
      if (!t || !this.scorable(t)) continue;
      this.scoreOne(t, now);
    }
  }
  scoreOne(t, now) {
    const f2 = extractFeatures(t, { now, wallets: this.wallets, narratives: this.narratives, pulse: this.pulse, mcapOf: (m) => this.tokens.get(m)?.mcapSol ?? 0 });
    const res = scoreToken(this.model, f2, true);
    const x = featureVector(f2);
    let e = this.scores.get(t.mint);
    if (!e) {
      e = { res, f: f2, x, at: now, above: 0, armed: true, lastFunnelAt: 0, reached: 0, held: new Uint8Array(ENTRY_LEVELS.length) };
      this.scores.set(t.mint, e);
    } else {
      e.res = res;
      e.f = f2;
      e.x = x;
      e.at = now;
    }
    this.funnel.noteScored(now, t.mint, res.score);
    if (now - e.lastFunnelAt >= 6e4) {
      e.lastFunnelAt = now;
      this.xRes[res.stage].push(x);
    }
    this.checkpoints(t, e, now);
    this.signalLogic(t, e, now);
    return e;
  }
  checkpoints(t, e, now) {
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    const add = (tag) => {
      if (!this.outcomes.has(t.mint, tag)) this.outcomes.add(t, "checkpoint", tag, now, e.res.score, e.res.p, e.x, custom);
    };
    if (t.stage === "curve") {
      const age = (now - t.createdAt) / 1e3;
      if (t.partial) return;
      let tag = null;
      for (const s of this.cfg.checkpointsCurveSec) if (age >= s && age < s * 1.6) tag = `age${s}`;
      if (tag) add(tag);
      for (const p of this.cfg.checkpointsProgress) if (t.progress >= p && t.progress < p + 0.1) add(`prog${Math.round(p * 100)}`);
    } else if (t.stage === "amm" && t.migrateAt) {
      const since = (now - t.migrateAt) / 1e3;
      for (const s of this.cfg.checkpointsAmmSec) if (since >= s && since < s * 1.6) add(`mig${s}`);
    }
  }
  /**
   * Follows the first entry at every level the way the bot would have bought it: the score
   * reached the level and held it for the configured number of evaluations.
   */
  entryLevels(t, e, now) {
    if (!this.modelReady()) return;
    const score = e.res.score;
    const need = this.settings.confirmTicks;
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    for (let i = 0; i < ENTRY_LEVELS.length; i++) {
      const level = ENTRY_LEVELS[i];
      if (score < level) {
        e.held[i] = 0;
        continue;
      }
      if (e.held[i] < 255) e.held[i]++;
      const bit = 1 << i;
      if (e.reached & bit || e.held[i] < need) continue;
      e.reached |= bit;
      this.outcomes.add(t, "entry", `x${level}`, now, score, e.res.p, e.x, custom, entryFacts(t, e.f));
    }
  }
  signalLogic(t, e, now) {
    this.entryLevels(t, e, now);
    const s = this.settings;
    const score = e.res.score;
    if (score >= s.minScore) e.above++;
    else {
      e.above = 0;
      if (s.reentry && score < s.minScore - 5) e.armed = true;
    }
    if (!e.armed || e.above < s.confirmTicks) return;
    e.armed = false;
    const rec = {
      id: newId("s"),
      ts: now,
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      stage: e.res.stage,
      score,
      p: e.res.p,
      mcapSol: t.mcapSol,
      decision: "pending",
      why: e.res.contributions.slice(0, 4)
    };
    const custom = { tp: s.tpPct, sl: s.slPct };
    this.outcomes.add(t, "signal", `sig${Math.floor(now / 1e3)}`, now, score, e.res.p, e.x, custom, entryFacts(t, e.f));
    const blocked = this.entryBlock(t, e);
    if (blocked) {
      rec.decision = "blocked";
      rec.reason = blocked;
      this.funnel.add(rec);
      this.hooks.onSignal?.(rec);
      return;
    }
    this.funnel.add(rec);
    this.enter(t, rec, now);
    this.hooks.onSignal?.(rec);
  }
  /** Account-level limits always apply; token filters only when "score only" is off. */
  entryBlock(t, e) {
    const s = this.settings;
    if (!s.enabled) return "bot_off";
    if (this.killed) return "kill_switch";
    if (t.nonSol) return "non_sol_quote";
    if (t.stage === "curve" && !s.tradeCurve || t.stage === "amm" && !s.tradeAmm) return "stage_off";
    if (t.stage === "migrating") return "migrating";
    for (const p of this.positions.values()) if (p.mint === t.mint) return "pending";
    if (!s.reentry && this.tradedMints.has(t.mint)) return "already_traded";
    let open = 0;
    for (const p of this.positions.values()) if (p.status !== "closed" && p.status !== "failed") open++;
    if (open >= s.maxOpen) return "max_open";
    this.rollDay(this.now);
    if (s.maxDailyLossSol > 0 && -this.stats.dayPnl >= s.maxDailyLossSol * LAMPORTS_PER_SOL) return "daily_loss_limit";
    const hourAgo = this.now - 36e5;
    this.stats.entryTimes = this.stats.entryTimes.filter((x) => x > hourAgo);
    if (this.stats.entryTimes.length >= s.maxTradesPerHour) return "rate_limit";
    if (this.feedDown()) return "feed_down";
    if (!this.modelReady()) return "warming_up";
    if (s.mode === "live") {
      if (!this.executor || !this.executor.ready()) return "live_disabled";
    } else if (this.paperBalance < s.positionSol * LAMPORTS_PER_SOL) return "insufficient_balance";
    if (s.scoreOnly) return null;
    const f2 = s.filters;
    const raw = e.f;
    if (f2.minMcapSol > 0 && t.mcapSol < f2.minMcapSol) return "filter:mcap_min";
    if (f2.maxMcapSol > 0 && t.mcapSol > f2.maxMcapSol) return "filter:mcap_max";
    if (raw.devShare * 100 > f2.maxDevPct) return "filter:dev";
    if (raw.top10 * 100 > f2.maxTop10Pct) return "filter:top10";
    if (raw.bundleShare * 100 > f2.maxBundlePct) return "filter:bundle";
    if (raw.uniqTotal < f2.minBuyers) return "filter:buyers";
    if (f2.minAgeSec > 0 && raw.ageSec < f2.minAgeSec) return "filter:age_min";
    if (f2.maxAgeMin > 0 && raw.ageSec > f2.maxAgeMin * 60) return "filter:age_max";
    if (f2.requireSocials && raw.socials === 0) return "filter:socials";
    if (f2.maxDevLaunches24h > 0 && raw.creatorLaunches24h > f2.maxDevLaunches24h) return "filter:serial_dev";
    if (f2.maxDevSoldPct < 100 && raw.devSold * 100 > f2.maxDevSoldPct) return "filter:dev_sold";
    return null;
  }
  /** A prior model trades only after it has been scaled to the live market once. */
  modelReady() {
    return this.model.source === "trained" || !!this.model.scaledAt;
  }
  /** True when the primary trade feed has gone quiet (no trading blind). */
  feedDown() {
    const critical = [...this.feeds.values()].filter((f2) => f2.critical && f2.status !== "off");
    if (critical.length === 0) return false;
    const anyAlive = critical.some((f2) => f2.status === "open" && this.now - f2.lastMsgAt < this.cfg.feedStaleMs);
    return !anyAlive;
  }
  setFeedHealth(h) {
    this.feeds.set(h.name, h);
  }
  // -------------------------------------------------------------------------
  // Orders & positions
  // -------------------------------------------------------------------------
  enter(t, rec, now) {
    const s = this.settings;
    const lamports = Math.floor(Math.min(s.positionSol, this.executorCap()) * LAMPORTS_PER_SOL);
    const q = quoteBuy(t, lamports, this.costs, this.solUsd, true);
    if (!q.ok) {
      rec.decision = "failed";
      rec.reason = q.error;
      this.funnel.update(rec.id, "failed", q.error);
      return;
    }
    const pos = {
      id: newId("p"),
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      mode: s.mode,
      stageAtEntry: t.stage === "amm" ? "amm" : "curve",
      status: "opening",
      signalId: rec.id,
      signalAt: now,
      signalScore: rec.score,
      signalP: rec.p,
      signalMcapSol: t.mcapSol,
      openedAt: now,
      plan: exitPlanFrom(s),
      cost: 0,
      tokens: 0,
      tokensLeft: 0,
      entryMcapSol: 0,
      entryPriceSol: 0,
      proceeds: 0,
      value: 0,
      valueAt: now,
      peakValue: 0,
      peakMult: 1,
      lowMult: 1,
      tpHit: false,
      fills: [],
      retries: 0,
      notes: []
    };
    this.positions.set(pos.id, pos);
    this.tradedMints.add(t.mint);
    rec.positionId = pos.id;
    rec.decision = "pending";
    this.stats.entryTimes.push(now);
    const order = {
      id: newId("o"),
      side: "buy",
      mint: t.mint,
      positionId: pos.id,
      amount: lamports,
      slippagePct: s.slippagePct,
      expectedPrice: q.avgPriceSol,
      reason: "signal",
      submittedAt: now,
      attempt: 1
    };
    this.submit(order, pos);
    this.hooks.watchMint?.(t.mint, true);
    this.hooks.onPosition?.(pos, "open");
    this.journal({ type: "entry_submitted", pos: pos.id, mint: t.mint, score: rec.score, lamports, mode: s.mode });
    this.markDirty();
  }
  executorCap() {
    if (this.settings.mode === "live" && this.executor) return this.executor.maxPositionSol();
    return Infinity;
  }
  submit(order, pos) {
    this.orders.set(order.id, order);
    pos.pendingOrder = order.id;
    if (pos.mode === "live") {
      const refuse = !this.executor || order.side === "buy" && !this.executor.ready();
      if (refuse) {
        this.later.push({ at: this.now + 1, run: () => this.onOrderResult({ orderId: order.id, ok: false, error: "live_disabled", ts: this.now, lamports: 0, tokens: 0 }) });
        return;
      }
      try {
        this.executor.submit(order);
      } catch (e) {
        this.later.push({ at: this.now + 1, run: () => this.onOrderResult({ orderId: order.id, ok: false, error: "live_error", ts: this.now, lamports: 0, tokens: 0 }) });
        this.log.error("executor.submit threw", { err: String(e) });
      }
      return;
    }
    const base = this.settings.paperLatencyMs;
    const jitter = base * (0.75 + 0.5 * this.rand());
    order.landAt = order.submittedAt + Math.round(jitter);
    this.paperQueue.push(order);
    this.paperQueue.sort((a, b) => (a.landAt ?? 0) - (b.landAt ?? 0));
  }
  landPaperOrders(now) {
    while (this.paperQueue.length && (this.paperQueue[0].landAt ?? 0) <= now) {
      const o = this.paperQueue.shift();
      this.executePaper(o, o.landAt ?? now);
    }
  }
  /** Simulate an order landing on-chain against the state at landing time. */
  executePaper(o, ts) {
    const t = this.tokens.get(o.mint);
    const fail = (error) => this.onOrderResult({ orderId: o.id, ok: false, error, ts, lamports: 0, tokens: 0 });
    if (!t) return fail("no_price");
    if (o.side === "buy") {
      if (this.paperBalance < o.amount) return fail("insufficient_balance");
      const q = quoteBuy(t, o.amount, this.costs, this.solUsd, true);
      if (!q.ok) return fail(q.error ?? "no_price");
      if (o.expectedPrice > 0 && (q.avgPriceSol / o.expectedPrice - 1) * 100 > o.slippagePct) return fail("slippage");
      this.onOrderResult({ orderId: o.id, ok: true, ts, lamports: q.lamports, tokens: q.tokens, mcapSol: t.mcapSol, fees: q.fees });
    } else {
      const q = quoteSell(t, o.amount, this.costs, this.solUsd, o.closesAccount ?? false);
      if (!q.ok) return fail(q.error ?? "no_price");
      if (o.expectedPrice > 0 && (1 - q.avgPriceSol / o.expectedPrice) * 100 > o.slippagePct) return fail("slippage");
      this.onOrderResult({ orderId: o.id, ok: true, ts, lamports: q.lamports, tokens: o.amount, mcapSol: t.mcapSol, fees: q.fees });
    }
  }
  /** Apply an execution result (paper or live). Idempotent per order id. */
  onOrderResult(r) {
    try {
      const o = this.orders.get(r.orderId);
      if (!o) return;
      this.orders.delete(r.orderId);
      const pos = this.positions.get(o.positionId);
      if (!pos) return;
      if (pos.pendingOrder === o.id) pos.pendingOrder = void 0;
      const t = this.tokens.get(o.mint);
      if (o.side === "buy") this.onBuyResult(pos, o, r, t);
      else this.onSellResult(pos, o, r, t);
      this.markDirty();
    } catch (e) {
      this.stats.errors++;
      this.log.error("onOrderResult failed", { err: String(e) });
    }
  }
  onBuyResult(pos, o, r, t) {
    const rec = this.funnel.get(pos.signalId);
    if (!r.ok) {
      const score = this.scores.get(pos.mint)?.res.score ?? 0;
      const retryable = r.error === "slippage" || r.error === "migrating" || r.error === "no_price" || r.error === "live_error";
      const inWindow = this.now - pos.signalAt <= this.settings.retryWindowSec * 1e3;
      if (retryable && inWindow && score >= this.settings.minScore && t && !this.killed && this.settings.enabled) {
        pos.retries++;
        const lamports = o.amount;
        const q = quoteBuy(t, lamports, this.costs, this.solUsd, true);
        if (q.ok) {
          pos.notes.push(`retry ${pos.retries} after ${r.error}`);
          this.submit({ ...o, id: newId("o"), expectedPrice: q.avgPriceSol, submittedAt: this.now, attempt: o.attempt + 1, landAt: void 0 }, pos);
          return;
        }
      }
      pos.status = "failed";
      pos.exitReason = r.error ?? "failed";
      pos.closedAt = r.ts;
      pos.pnl = 0;
      pos.pnlPct = 0;
      this.positions.delete(pos.id);
      this.closed.push(pos);
      if (!this.settings.reentry) this.tradedMints.delete(pos.mint);
      if (rec) this.funnel.update(rec.id, "failed", r.error);
      this.hooks.watchMint?.(pos.mint, false);
      this.hooks.onPosition?.(pos, "fail");
      this.journal({ type: "entry_failed", pos: pos.id, mint: pos.mint, error: r.error, retries: pos.retries });
      return;
    }
    pos.status = "open";
    pos.cost = r.lamports;
    pos.tokens = r.tokens;
    pos.tokensLeft = r.tokens;
    pos.openedAt = r.ts;
    pos.entryMcapSol = r.mcapSol ?? t?.mcapSol ?? 0;
    pos.entryPriceSol = r.tokens > 0 ? r.lamports / LAMPORTS_PER_SOL / (r.tokens / 1e6) : 0;
    pos.value = r.lamports;
    pos.peakValue = 0;
    const fill = { ts: r.ts, side: "buy", reason: "entry", lamports: r.lamports, tokens: r.tokens, mcapSol: pos.entryMcapSol, priceSol: pos.entryPriceSol, fees: r.fees ?? 0, sig: r.sig };
    pos.fills.push(fill);
    if (pos.mode === "paper") this.paperBalance -= r.lamports;
    this.stats.entries++;
    this.stats.fees += r.fees ?? 0;
    if (rec) this.funnel.update(rec.id, "entered", void 0, pos.id);
    this.hooks.onPosition?.(pos, "fill");
    if (this.killed && t) {
      pos.notes.push("filled after the kill switch \u2014 selling");
      this.sell(pos, t, 1, "kill", r.ts);
    } else if (t) this.evaluatePosition(pos, t, r.ts);
    this.journal({ type: "entry_filled", pos: pos.id, mint: pos.mint, lamports: r.lamports, tokens: r.tokens, mcap: pos.entryMcapSol, sig: r.sig });
  }
  onSellResult(pos, o, r, t) {
    if (!r.ok) {
      pos.retries++;
      const nextSlip = Math.min(95, Math.max(o.slippagePct * 1.6, o.slippagePct + 10));
      pos.notes.push(`exit retry ${pos.retries} after ${r.error}`);
      if (r.error === "migrating" || r.error === "no_price") {
        pos.status = "open";
        return;
      }
      if (pos.retries % 10 === 0) this.log.warn("exit still failing", { pos: pos.id, mint: pos.mint, error: r.error, retries: pos.retries });
      const delay = Math.min(5e3, 500 * o.attempt);
      pos.pendingOrder = "retry";
      this.later.push({
        at: this.now + delay,
        run: () => {
          if (pos.status === "closed" || !this.positions.has(pos.id)) return;
          const tok = this.tokens.get(pos.mint);
          const q = tok ? quoteSell(tok, Math.min(o.amount, pos.tokensLeft), this.costs, this.solUsd, o.closesAccount) : null;
          pos.pendingOrder = void 0;
          this.submit({ ...o, id: newId("o"), amount: Math.min(o.amount, pos.tokensLeft), slippagePct: nextSlip, expectedPrice: q?.ok ? q.avgPriceSol : 0, submittedAt: this.now, attempt: o.attempt + 1, landAt: void 0 }, pos);
        }
      });
      return;
    }
    const sold = Math.min(pos.tokensLeft, r.tokens);
    pos.tokensLeft -= sold;
    pos.proceeds += r.lamports;
    this.stats.fees += r.fees ?? 0;
    if (pos.mode === "paper") this.paperBalance += r.lamports;
    pos.fills.push({ ts: r.ts, side: "sell", reason: o.reason, lamports: r.lamports, tokens: sold, mcapSol: r.mcapSol ?? t?.mcapSol ?? 0, priceSol: sold > 0 ? r.lamports / LAMPORTS_PER_SOL / (sold / 1e6) : 0, fees: r.fees ?? 0, sig: r.sig });
    if (o.reason === "initials") {
      pos.tpHit = true;
      pos.status = "open";
    }
    if (pos.tokensLeft <= 0 || pos.tokensLeft < pos.tokens * 1e-3) this.closePosition(pos, o.reason, r.ts);
    else {
      if (t) {
        const q = quoteSell(t, pos.tokensLeft, this.costs, this.solUsd);
        pos.value = q.ok ? q.lamports : 0;
        pos.peakValue = Math.max(pos.peakValue, pos.value);
      }
      if (pos.status === "closing") pos.status = "open";
      this.hooks.onPosition?.(pos, "update");
    }
    this.journal({ type: "exit_filled", pos: pos.id, mint: pos.mint, reason: o.reason, lamports: r.lamports, tokens: sold, sig: r.sig });
  }
  closePosition(pos, reason, ts) {
    pos.status = "closed";
    pos.tokensLeft = 0;
    pos.value = 0;
    pos.exitReason = reason;
    pos.closedAt = ts;
    pos.pnl = pos.proceeds - pos.cost;
    pos.pnlPct = pos.cost > 0 ? pos.pnl / pos.cost * 100 : 0;
    this.positions.delete(pos.id);
    this.closed.push(pos);
    this.rollDay(ts);
    this.stats.realized += pos.pnl;
    this.stats.dayPnl += pos.pnl;
    this.stats.exits++;
    if (pos.pnl > 0) this.stats.wins++;
    else this.stats.losses++;
    this.stats.equity.push({ t: ts, v: this.paperBalance });
    if (this.stats.equity.length > 2e3) this.stats.equity.splice(0, this.stats.equity.length - 2e3);
    this.hooks.watchMint?.(pos.mint, false);
    this.hooks.onPosition?.(pos, "close");
    this.journal({ type: "closed", pos: pos.id, mint: pos.mint, reason, pnl: pos.pnl, pnlPct: pos.pnlPct, cost: pos.cost, proceeds: pos.proceeds });
  }
  rollDay(ts) {
    const k = dayKey(ts);
    if (k !== this.stats.dayKey) {
      this.stats.dayKey = k;
      this.stats.dayPnl = 0;
    }
  }
  /** Revalue a held position and act on its exit plan. */
  evaluatePosition(pos, t, now) {
    if (pos.status !== "open") return;
    const q = quoteSell(t, pos.tokensLeft, this.costs, this.solUsd, true);
    if (!q.ok) return;
    pos.value = q.lamports;
    pos.valueAt = now;
    const mult = positionMultiple(pos);
    if (mult > pos.peakMult) pos.peakMult = mult;
    if (mult < pos.lowMult) pos.lowMult = mult;
    if (pos.tpHit) pos.peakValue = Math.max(pos.peakValue, pos.value);
    if (pos.pendingOrder) return;
    const d = decideExit(pos, now, t.lastTradeAt || pos.openedAt);
    if (d.action === "arm") {
      pos.tpHit = true;
      pos.peakValue = pos.value;
      pos.notes.push(`target reached at ${mult.toFixed(2)}\xD7, trailing stop armed`);
      this.hooks.onPosition?.(pos, "update");
      return;
    }
    if (d.action === "sell") this.sell(pos, t, d.fraction, d.reason, now);
  }
  sell(pos, t, fraction, reason, now) {
    const tokens = fraction >= 0.999 ? pos.tokensLeft : Math.floor(pos.tokensLeft * fraction);
    if (tokens <= 0) return;
    const full = tokens >= pos.tokensLeft;
    const q = quoteSell(t, tokens, this.costs, this.solUsd, full);
    pos.status = "closing";
    const slip = reason === "sl" || reason === "kill" || reason === "dead" ? Math.max(pos.plan.exitSlippagePct, 40) : pos.plan.exitSlippagePct;
    this.submit(
      {
        id: newId("o"),
        side: "sell",
        mint: pos.mint,
        positionId: pos.id,
        amount: tokens,
        slippagePct: slip,
        expectedPrice: q.ok ? q.avgPriceSol : 0,
        reason,
        submittedAt: now,
        attempt: 1,
        closesAccount: full
      },
      pos
    );
    this.journal({ type: "exit_submitted", pos: pos.id, mint: pos.mint, reason, tokens });
  }
  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------
  updateSettings(patch) {
    const prev = this.settings;
    const next = sanitizeSettings(patch, prev);
    this.settings = next;
    this.costs = { ...this.costs, priorityFeeSol: next.priorityFeeSol, platformFeePct: next.platformFeePct };
    this.outcomes.setOptions({ latencyMs: next.paperLatencyMs, costs: this.costs });
    const moved = next.minScore !== prev.minScore;
    for (const e of this.scores.values()) {
      e.above = 0;
      e.at = 0;
      if (next.reentry) e.armed = true;
      else if (moved) e.armed = e.res.score < next.minScore;
    }
    this.hooks.onSettings?.(next);
    this.journal({ type: "settings", settings: next });
    this.markDirty();
    return next;
  }
  setKill(on, sellAll = false) {
    this.killed = on;
    if (on && sellAll) for (const p of [...this.positions.values()]) this.closeManually(p.id, "kill");
    this.journal({ type: "kill", on, sellAll });
    this.markDirty();
  }
  closeManually(positionId, reason = "manual") {
    const p = this.positions.get(positionId);
    if (!p) return false;
    const t = this.tokens.get(p.mint);
    if (p.status === "opening") {
      p.notes.push("cancelled before fill");
      return false;
    }
    if (!t || p.tokensLeft <= 0 || p.pendingOrder) return false;
    this.sell(p, t, 1, reason, this.now);
    return true;
  }
  /**
   * Live reconciliation after a restart: align a position with what the wallet actually
   * holds (sold elsewhere, partially filled…).
   */
  reconcile(positionId, tokensInWallet) {
    const p = this.positions.get(positionId);
    if (!p) return;
    if (tokensInWallet <= 0) {
      if (p.status === "open" || p.status === "closing") {
        p.proceeds += Math.max(0, p.value);
        p.notes.push("not in wallet after restart \u2014 booked at last marked value (estimate)");
      } else p.notes.push("entry never landed");
      p.tokensLeft = 0;
      this.closePosition(p, "external", this.now);
      return;
    }
    if (p.status === "opening") {
      p.status = "open";
      p.tokens = tokensInWallet;
      p.notes.push("entry confirmed from wallet after restart");
    }
    if (tokensInWallet < p.tokensLeft) {
      p.notes.push(`wallet holds ${tokensInWallet} of ${p.tokensLeft} tokens \u2014 adjusted`);
      p.tokensLeft = tokensInWallet;
    }
    this.markDirty();
  }
  setModel(m) {
    if (!validateModel(m)) return false;
    this.model = m;
    for (const e of this.scores.values()) e.at = 0;
    this.journal({ type: "model", version: m.version, source: m.source });
    return true;
  }
  /**
   * Keep the PRIOR model's scale honest for the market it is watching: learn feature
   * means/spreads from the live population (no outcomes needed) and set the weight
   * temperature so scores spread ~16 points around 50 (≈5% of scored coins reach 75).
   * A trained model keeps the scale its data gave it.
   */
  normalizePrior(minRows = 300) {
    if (this.model.source !== "prior") return;
    let changed = false;
    for (const stage of ["curve", "amm"]) {
      const rows = this.xRes[stage].toArray();
      if (rows.length < minRows) continue;
      const base = this.priorBase.stages[stage];
      const cur = this.model.stages[stage];
      const n = rows.length;
      const blend = n / (n + 600);
      const mean2 = {};
      const std = {};
      FEATURE_KEYS.forEach((k2, j) => {
        let m = 0;
        for (const r of rows) m += r[j];
        m /= n;
        let v = 0;
        for (const r of rows) v += (r[j] - m) ** 2;
        const sd = Math.sqrt(v / Math.max(1, n - 1));
        const pm = base.mean[k2] ?? 0;
        const ps = base.std[k2] ?? 1;
        mean2[k2] = (1 - blend) * pm + blend * m;
        std[k2] = Math.max((1 - blend) * ps + blend * sd, 0.5 * ps, 1e-6);
      });
      const lin = [];
      for (const r of rows) {
        let s22 = 0;
        FEATURE_KEYS.forEach((k2, j) => {
          s22 += (base.weights[k2] ?? 0) * clamp((r[j] - mean2[k2]) / std[k2], -5, 5);
        });
        lin.push(s22);
      }
      const lm = lin.reduce((a, b) => a + b, 0) / lin.length;
      const lsd = Math.sqrt(lin.reduce((a, b) => a + (b - lm) ** 2, 0) / Math.max(1, lin.length - 1));
      const k = lsd > 1e-6 ? clamp(0.85 / lsd, 0.15, 3) : 1;
      const weights = {};
      for (const key of FEATURE_KEYS) weights[key] = (base.weights[key] ?? 0) * k;
      const bias = base.bias - lm * k;
      this.model.stages[stage] = { ...cur, mean: mean2, std, weights, bias, pRef: base.pRef };
      changed = true;
    }
    if (changed) {
      const first = !this.model.scaledAt;
      this.model = { ...this.model, scaledAt: this.now, version: `prior-2.0 \xB7 auto-scaled ${new Date(this.now).toISOString().slice(0, 16)}Z` };
      for (const e of this.scores.values()) {
        e.at = 0;
        if (first) {
          e.armed = true;
          e.above = 0;
        }
      }
      this.hooks.onModel?.(this.model);
      if (first) this.log.info("score scale learned from the live market \u2014 entries enabled");
    }
  }
  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------
  sweep(now) {
    for (const [mint, e] of this.scores) {
      if (now - e.at > 1e4) {
        const t = this.tokens.get(mint);
        if (t && now - t.lastEventAt < 10 * 6e4 && this.scorable(t)) this.scoreOne(t, now);
      }
    }
    for (const p of this.positions.values()) {
      const t = this.tokens.get(p.mint);
      if (t && p.status === "open") this.evaluatePosition(p, t, now);
    }
    this.outcomes.sweep(now, (m) => this.tokens.get(m));
    const every = this.modelReady() ? 5 * 6e4 : 3e4;
    if (now - this.lastNormalize >= every) {
      this.lastNormalize = now;
      this.normalizePrior(this.modelReady() ? 300 : 150);
    }
    for (const [pool, q] of this.ammPending) if (q.length === 0 || now - q[q.length - 1].ev.ts > 6e4) this.ammPending.delete(pool);
    this.narratives.prune(now);
    this.evictIdle(now);
    this.rollDay(now);
  }
  held(mint) {
    for (const p of this.positions.values()) if (p.mint === mint) return true;
    return false;
  }
  evictIdle(now) {
    for (const [mint, t] of this.tokens) {
      if (!t.isIdle(now, this.cfg.idleEvictMs) || this.held(mint)) continue;
      this.forget(t, now);
    }
    for (const mint of this.scores.keys()) if (!this.tokens.has(mint)) this.scores.delete(mint);
  }
  evictOldest() {
    let oldest;
    for (const t of this.tokens.values()) {
      if (this.held(t.mint)) continue;
      if (!oldest || t.lastEventAt < oldest.lastEventAt) oldest = t;
    }
    if (oldest) this.forget(oldest, this.now);
  }
  forget(t, now) {
    const price = t.priceSol;
    for (const [addr, h] of t.holders) {
      if (h.boughtSol > 0) this.wallets.closePosition(addr, h.boughtSol, h.soldSol, h.bal / 1e6 * price * 0.97);
    }
    this.wallets.noteCreatorResult(t.creator, t.athMcapSol, t.stage !== "curve");
    this.outcomes.onTokenGone(t, now);
    this.tokens.delete(t.mint);
    this.scores.delete(t.mint);
    this.dirty.delete(t.mint);
    if (t.pool) this.pools.delete(t.pool);
  }
  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------
  markDirty() {
    this.persistDirty = true;
  }
  journal(entry) {
    try {
      this.hooks.journal?.({ ts: this.now, ...entry });
    } catch {
    }
  }
  persistNow() {
    this.persistDirty = false;
    this.lastPersist = this.now;
    try {
      this.hooks.persist?.(this.exportState());
      this.saved = { at: this.now, failures: 0, error: "" };
    } catch (e) {
      this.saved = { at: this.saved.at, failures: this.saved.failures + 1, error: String(e?.message ?? e).slice(0, 200) };
      if (this.saved.failures < 5 || this.saved.failures % 100 === 0) this.log.error("persist failed", { err: this.saved.error, inARow: this.saved.failures });
      this.persistDirty = true;
    }
  }
  /** When settings and positions last reached the disk, and failed saves in a row since. */
  saved = { at: 0, failures: 0, error: "" };
  /** Pools of the coins we hold that trade on PumpSwap: their swaps must reach us. */
  heldPools() {
    const out = /* @__PURE__ */ new Set();
    for (const p of this.positions.values()) {
      const pool = this.tokens.get(p.mint)?.pool;
      if (pool) out.add(pool);
    }
    return [...out];
  }
  exportState() {
    const heldMints = new Set([...this.positions.values()].map((p) => p.mint));
    const tokens = [];
    for (const m of heldMints) {
      const t = this.tokens.get(m);
      if (!t) continue;
      tokens.push({
        mint: t.mint,
        name: t.name,
        symbol: t.symbol,
        creator: t.creator,
        createdAt: t.createdAt,
        stage: t.stage,
        vSol: t.vSol,
        vTok: t.vTok,
        realTok: t.realTok,
        supply: t.supply,
        pool: t.pool,
        poolBase: t.poolBase,
        poolQuote: t.poolQuote,
        mcapSol: t.mcapSol,
        athMcapSol: t.athMcapSol
      });
    }
    const pools = [];
    for (const [pool, mint] of this.pools) if (heldMints.has(mint)) pools.push([pool, mint]);
    return {
      v: 1,
      savedAt: this.now,
      settings: this.settings,
      positions: [...this.positions.values()],
      closed: this.closed.toArray().slice(-200),
      tradedMints: [...this.tradedMints].slice(-5e3),
      paperBalance: this.paperBalance,
      killed: this.killed,
      stats: this.stats,
      tokens,
      pools
    };
  }
  /** Restore after a restart. Open positions resume exit management immediately. */
  restore(s) {
    if (!s || s.v !== 1) return;
    this.settings = sanitizeSettings(s.settings ?? {}, DEFAULT_SETTINGS);
    this.costs = { ...this.costs, priorityFeeSol: this.settings.priorityFeeSol, platformFeePct: this.settings.platformFeePct };
    this.paperBalance = Number.isFinite(s.paperBalance) ? s.paperBalance : this.paperBalance;
    this.killed = !!s.killed;
    for (const m of s.tradedMints ?? []) this.tradedMints.add(m);
    for (const p of s.closed ?? []) this.closed.push(p);
    if (s.stats) this.stats = { ...this.stats, ...s.stats, startedAt: this.stats.startedAt, lastEventAt: 0, lastTradeAt: 0 };
    for (const [pool, mint] of s.pools ?? []) this.pools.set(pool, mint);
    for (const pt of s.tokens ?? []) {
      const t = new TokenState(pt.mint, pt.createdAt);
      t.name = pt.name;
      t.symbol = pt.symbol;
      t.creator = pt.creator;
      t.stage = pt.stage;
      t.vSol = pt.vSol;
      t.vTok = pt.vTok;
      t.realTok = pt.realTok;
      t.supply = pt.supply;
      t.pool = pt.pool;
      t.poolBase = pt.poolBase;
      t.poolQuote = pt.poolQuote;
      t.partial = true;
      t.refreshPrice();
      t.athMcapSol = Math.max(pt.athMcapSol, t.mcapSol);
      t.lastEventAt = this.now;
      this.tokens.set(t.mint, t);
    }
    for (const p of s.positions ?? []) {
      if (p.status === "opening") {
        if (p.mode === "paper") {
          p.status = "failed";
          p.exitReason = "restart_before_fill";
          p.closedAt = this.now;
          this.closed.push(p);
          continue;
        }
      }
      if (p.status === "closing") p.status = "open";
      p.pendingOrder = void 0;
      this.positions.set(p.id, p);
      this.hooks.watchMint?.(p.mint, true);
    }
    this.log.info("state restored", { open: this.positions.size, closed: this.closed.length });
  }
  // -------------------------------------------------------------------------
  // Views (dashboard)
  // -------------------------------------------------------------------------
  scoreOf(mint) {
    return this.scores.get(mint);
  }
  radar(opts = {}) {
    const limit = clamp(opts.limit ?? 60, 1, 500);
    const rows = [];
    const held = new Set([...this.positions.values()].map((p) => p.mint));
    for (const [mint, e] of this.scores) {
      const t = this.tokens.get(mint);
      if (!t) continue;
      if (opts.stage && opts.stage !== "all" && e.res.stage !== opts.stage) continue;
      if (opts.minScore && e.res.score < opts.minScore) continue;
      rows.push(this.radarRow(t, e, held.has(mint)));
    }
    const sort = opts.sort ?? "score";
    rows.sort((a, b) => sort === "new" ? b.createdAt - a.createdAt : sort === "mcap" ? b.mcapSol - a.mcapSol : b.score - a.score);
    return rows.slice(0, limit);
  }
  radarRow(t, e, held) {
    const f2 = e.f;
    const flags = [];
    if (f2.bundleShare > 0.15) flags.push("bundled");
    if (f2.devSold > 0.5) flags.push("dev sold");
    if (f2.creatorLaunches24h > 3) flags.push("serial dev");
    if (f2.smartBuyers > 0) flags.push(`${f2.smartBuyers} smart`);
    if (f2.top10 > 0.5) flags.push("concentrated");
    if (f2.isLeader) flags.push("narrative leader");
    else if (f2.clusterSize > 1) flags.push("copycat");
    return {
      mint: t.mint,
      name: t.name,
      symbol: t.symbol,
      stage: e.res.stage,
      score: Math.round(e.res.score * 10) / 10,
      p: e.res.p,
      calibrated: e.res.calibrated,
      mcapSol: t.mcapSol,
      athMcapSol: t.athMcapSol,
      ageSec: f2.ageSec,
      progress: t.progress,
      net60: f2.net60,
      buyers: f2.uniqTotal,
      holders: f2.holders,
      top10: f2.top10,
      devShare: f2.devShare,
      cluster: f2.clusterSize,
      flags,
      held,
      spent: !e.armed,
      createdAt: t.createdAt,
      lastTradeAt: t.lastTradeAt,
      image: t.meta.image,
      twitter: t.meta.twitter,
      telegram: t.meta.telegram,
      website: t.meta.website,
      why: e.res.contributions.slice(0, 3)
    };
  }
  tokenDetail(mint) {
    const t = this.tokens.get(mint);
    if (!t) return null;
    const e = this.scores.get(mint);
    const conc = t.concentration(this.now);
    const narrative = this.narratives.describe(mint, (m) => this.tokens.get(m)?.mcapSol ?? 0);
    const holders = [...t.holders.entries()].filter(([, h]) => h.bal > 0).sort((a, b) => b[1].bal - a[1].bal).slice(0, 15).map(([addr, h]) => ({
      addr,
      pct: h.bal / t.supply * 100,
      dev: addr === t.creator,
      early: h.early,
      bundle: h.bundle,
      smart: this.wallets.isSmart(addr)
    }));
    return {
      mint,
      name: t.name,
      symbol: t.symbol,
      creator: t.creator,
      stage: t.stage,
      createdAt: t.createdAt,
      partial: t.partial,
      mcapSol: t.mcapSol,
      athMcapSol: t.athMcapSol,
      progress: t.progress,
      pool: t.pool,
      meta: t.meta,
      quote: t.quote,
      score: e?.res ?? null,
      features: e?.f ?? null,
      concentration: conc,
      narrative,
      holders,
      creatorStats: t.creator ? this.wallets.creator(t.creator, this.now) : null,
      trades: t.trades.toArray().slice(-60).reverse(),
      positions: [...this.positions.values(), ...this.closed.toArray()].filter((p) => p.mint === mint),
      // the coin's entry moment: whether it came, and what the bot did about it
      entry: {
        spent: e ? !e.armed : false,
        above: e?.above ?? 0,
        need: this.settings.confirmTicks,
        signals: this.funnel.recent.toArray().filter((r) => r.mint === mint)
      }
    };
  }
  health() {
    const now = this.now;
    const mem = typeof process !== "undefined" && process.memoryUsage ? process.memoryUsage().rss : 0;
    return {
      now,
      uptimeSec: Math.round((now - this.stats.startedAt) / 1e3),
      feeds: [...this.feeds.values()],
      feedDown: this.feedDown(),
      saved: this.saved,
      tokens: this.tokens.size,
      scored: this.scores.size,
      wallets: this.wallets.size,
      smartWallets: this.wallets.smartCount(),
      pools: this.pools.size,
      events: this.stats.events,
      trades: this.stats.trades,
      creates: this.stats.creates,
      ammSwaps: this.stats.ammSwaps,
      unmappedAmm: this.stats.unmappedAmm,
      errors: this.stats.errors,
      badEvents: this.stats.badEvents,
      lagMs: this.stats.lastEventAt ? Math.max(0, now - this.stats.lastEventAt) : null,
      hypotheticalsOpen: this.outcomes.open,
      samples: this.samples.length,
      samplesResolved: this.outcomes.resolvedCount,
      ammReserveConvention: this.ammPreHits + this.ammPostHits < 20 ? "learning" : this.ammPreHits >= this.ammPostHits ? "pre-trade" : "post-trade",
      memMb: mem ? Math.round(mem / 1e6) : null,
      model: { version: this.model.version, source: this.model.source, training: this.model.training ?? null }
    };
  }
  account() {
    const open = [...this.positions.values()];
    const openValue = open.reduce((s, p) => s + p.value, 0);
    const exposure = open.reduce((s, p) => s + p.cost - p.proceeds, 0);
    return {
      mode: this.settings.mode,
      enabled: this.settings.enabled,
      killed: this.killed,
      paperBalance: this.paperBalance,
      equity: this.paperBalance + openValue,
      openValue,
      exposure,
      realized: this.stats.realized,
      dayPnl: this.stats.dayPnl,
      wins: this.stats.wins,
      losses: this.stats.losses,
      entries: this.stats.entries,
      fees: this.stats.fees,
      open,
      closed: this.closed.toArray().slice(-100).reverse(),
      equityCurve: this.stats.equity
    };
  }
};

// src/research/replay.ts
async function replay(events, opts) {
  let engine = null;
  let n = 0;
  let from = 0;
  let to = 0;
  let lastAdvance = 0;
  const samples = [];
  for await (const raw of events) {
    const ev = raw;
    if (!ev || typeof ev !== "object" || typeof ev.ts !== "number") continue;
    if (!engine) {
      from = ev.ts;
      engine = new Engine({
        now: ev.ts,
        model: opts.model ? JSON.parse(JSON.stringify(opts.model)) : void 0,
        settings: { enabled: true, mode: "paper", maxTradesPerHour: 500, ...opts.settings, paperLatencyMs: opts.latencyMs ?? opts.settings.paperLatencyMs ?? 1500 },
        config: { paperStartSol: opts.paperStartSol ?? 1e3, seed: 11 },
        hooks: opts.keepSamples ? { onSample: (s) => samples.push(s) } : {}
      });
      engine.setFeedHealth({ name: "replay", status: "open", lastMsgAt: ev.ts, msgs: 0, reconnects: 0, errors: 0, critical: false });
    }
    engine.ingest(ev);
    n++;
    to = ev.ts;
    if (ev.ts - lastAdvance >= 250) {
      engine.advance(ev.ts);
      lastAdvance = ev.ts;
    }
  }
  if (!engine) throw new Error("no events to replay");
  for (let t = to; t <= to + 3e4; t += 500) engine.advance(t);
  const f2 = engine.funnel.summary(engine.clock, 1e6);
  const closed = engine.closed.toArray();
  const exits = {};
  for (const p of closed) if (p.status === "closed") exits[p.exitReason ?? "?"] = (exits[p.exitReason ?? "?"] ?? 0) + 1;
  const blocked = {};
  for (const r of f2.reasons) blocked[r.reason] = r.n;
  const stats2 = paperStats(closed);
  return {
    events: n,
    from,
    to,
    hours: (to - from) / 36e5,
    settings: engine.settings,
    modelVersion: engine.model.version,
    entries: engine.stats.entries,
    signals: f2.signals,
    blocked,
    failed: f2.failed,
    exits,
    paper: stats2,
    avgPnlPct: stats2.avgPct,
    samples,
    errors: engine.stats.errors
  };
}

// src/research/selftest.ts
function collectSamples(hours, predictability, seed) {
  const sim = new MarketSim({ durationMs: hours * 36e5, seed, predictability, launchesPerMin: 6 });
  const samples = [];
  const e = new Engine({
    now: sim.opts.startTs,
    settings: { enabled: false },
    config: { outcomeHorizonMs: 90 * 6e4, seed },
    hooks: { onSample: (s) => samples.push(s) }
  });
  let last = 0;
  let end = sim.opts.startTs;
  for (const ev of sim.run()) {
    e.ingest(ev);
    end = ev.ts;
    if (ev.ts - last >= 500) {
      e.advance(ev.ts);
      last = ev.ts;
    }
  }
  for (let t = end; t <= end + 95 * 6e4; t += 5e3) e.advance(t);
  return samples;
}
function rowsOf(samples) {
  return samples.filter((s) => s.kind === "checkpoint" && s.stage === "curve").map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
}
async function pipelineSelfTest(opts = {}) {
  const log = opts.log ?? (() => {
  });
  const hours = opts.hours ?? 4;
  const notes = [];
  log(`simulating ${hours}h of an "edge" world\u2026`);
  const samples = collectSamples(hours, 0.9, opts.seed ?? 5).filter((s) => s.stage === "curve");
  const cps = samples.filter((s) => s.kind === "checkpoint").sort((a, b) => a.ts - b.ts);
  const cut = Math.floor(cps.length * 0.7);
  const train = rowsOf(cps.slice(0, cut));
  const test = cps.slice(cut);
  const testRows = rowsOf(test);
  const prior = priorModel().stages.curve;
  const priorAuc = evaluate(prior, testRows).auc;
  const trained = fitStage(prior, train);
  const trainedAuc = evaluate(trained, testRows).auc;
  const preds = test.map((s) => linear(trained, standardize(trained, s.x)));
  const order = preds.map((p, i) => i).sort((a, b) => preds[b] - preds[a]);
  const top = order.slice(0, Math.max(1, Math.floor(order.length / 10))).map((i) => test[i].ret);
  const bottom = order.slice(Math.floor(order.length / 2)).map((i) => test[i].ret);
  const avg = (x) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  log(`positive control: prior AUC ${priorAuc.toFixed(3)}, trained AUC ${trainedAuc.toFixed(3)} on unseen data`);
  const r = rng(99);
  const shuffled = cps.map((s) => ({ ...s }));
  const outcomes = shuffled.map((s) => ({ y: s.y, ret: s.ret, grid: s.grid }));
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  shuffled.forEach((s, i) => Object.assign(s, outcomes[i]));
  const nTrain = rowsOf(shuffled.slice(0, cut));
  const nTest = rowsOf(shuffled.slice(cut));
  const nTrained = fitStage(prior, nTrain);
  const nAuc = evaluate(nTrained, nTest).auc;
  const rescored = shuffled.slice(cut).map((s) => ({ ...s, kind: "signal", score: 50 + (linear(nTrained, standardize(nTrained, s.x)) - Math.log(nTrained.pRef / (1 - nTrained.pRef))) * 18.03 }));
  const report = buildReport(rescored, { ...DEFAULT_SETTINGS, minScore: 60 }, priorModel(), [], Date.now());
  log(`negative control: trained AUC ${nAuc.toFixed(3)}; gate: ${report.gate.verdict}`);
  const passed = trainedAuc > 0.62 && trainedAuc >= priorAuc - 0.02 && avg(top) > avg(bottom) && Math.abs(nAuc - 0.5) < 0.06 && !report.gate.pass;
  if (!passed) notes.push("self-test did not meet all criteria \u2014 inspect the numbers above");
  void auc;
  return {
    samples: samples.length,
    positive: { priorAuc, trainedAuc, topDecileRet: avg(top), bottomHalfRet: avg(bottom) },
    negative: { trainedAuc: nAuc, gatePass: report.gate.pass, gateVerdict: report.gate.verdict },
    passed,
    notes
  };
}

// src/research/cli.ts
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === void 0 || v.startsWith("--")) out[k] = true;
    else {
      out[k] = v;
      i++;
    }
  }
  return out;
}
var pct2 = (x) => Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "\u2014";
async function* recorded(dataDir, from, to) {
  const store = new DataStore(dataDir, silentLogger);
  const files = store.recordFiles().filter((f2) => {
    const name = f2.split(/[\\/]/).pop().slice(0, 13);
    return (!from || name >= from) && (!to || name <= to);
  });
  store.close();
  for (const f2 of files) yield* readRecording(f2);
}
function loadModel(path) {
  if (typeof path !== "string") return void 0;
  const m = JSON.parse(readFileSync2(path, "utf8"));
  if (!validateModel(m)) throw new Error("invalid model file");
  return m;
}
async function main() {
  const [cmd = "help", ...rest] = process.argv.slice(2);
  const a = args(rest);
  const data = String(a.data ?? "./data");
  switch (cmd) {
    case "report": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      store.close();
      const settings = sanitizeSettings({ minScore: Number(a.score ?? 75), tpPct: Number(a.tp ?? 100), slPct: Number(a.sl ?? 50) });
      const r = buildReport(samples, settings, store.loadModel() ?? priorModel(), [], Date.now());
      console.log(`Samples ${r.samples} (${r.checkpoints} checkpoints, ${r.signals} signals) over ${r.spanHours.toFixed(1)} h`);
      console.log(`TP ${r.settings.tpPct}% / SL ${r.settings.slPct}% \u2014 break-even win rate \u2248 ${pct2(r.breakEven)}
`);
      console.log("score    n      win%    avg return (95% range)        median peak");
      for (const b of r.buckets) console.log(`${String(b.lo).padStart(3)}-${String(b.hi).padEnd(3)} ${String(b.n).padStart(6)}  ${pct2(b.winRate).padStart(7)}   ${pct2(b.avgRet).padStart(7)} (${pct2(b.retLo)} \u2026 ${pct2(b.retHi)})   ${Number.isFinite(b.medMaxMult) ? b.medMaxMult.toFixed(2) + "\xD7" : "\u2014"}`);
      console.log(`
Go-live gate: ${r.gate.verdict} \u2014 ${r.gate.detail}`);
      break;
    }
    case "replay": {
      const settings = { ...DEFAULT_SETTINGS, minScore: Number(a.score ?? 75), tpPct: Number(a.tp ?? 100), slPct: Number(a.sl ?? 50), scoreOnly: !!a.scoreonly, maxOpen: Number(a.maxopen ?? 5), positionSol: Number(a.size ?? 0.1) };
      const src = a.sim ? new MarketSim({ durationMs: Number(a.hours ?? 3) * 36e5, seed: Number(a.seed ?? 1), predictability: Number(a.predictability ?? 0.7) }).run() : recorded(data, a.from, a.to);
      const r = await replay(src, { settings, model: loadModel(a.model), latencyMs: Number(a.latency ?? 1500) });
      console.log(JSON.stringify({ ...r, samples: void 0 }, null, 1));
      break;
    }
    case "sweep": {
      const scores = String(a.scores ?? "65,75,85").split(",").map(Number);
      const tps = String(a.tps ?? "50,100,200").split(",").map(Number);
      const sls = String(a.sls ?? "30,50").split(",").map(Number);
      console.log("score  tp   sl   trades  win%    avg%     pnl SOL   maxDD");
      for (const s of scores)
        for (const tp of tps)
          for (const sl of sls) {
            const src = a.sim ? new MarketSim({ durationMs: Number(a.hours ?? 3) * 36e5, seed: Number(a.seed ?? 1) }).run() : recorded(data, a.from, a.to);
            const r = await replay(src, { settings: { minScore: s, tpPct: tp, slPct: sl, scoreOnly: !!a.scoreonly, maxOpen: Number(a.maxopen ?? 5) }, model: loadModel(a.model), latencyMs: Number(a.latency ?? 1500) });
            console.log(`${String(s).padStart(5)} ${String(tp).padStart(4)} ${String(sl).padStart(4)} ${String(r.paper.trades).padStart(7)} ${pct2(r.paper.winRate).padStart(7)} ${(r.paper.avgPct ?? 0).toFixed(1).padStart(7)} ${r.paper.pnlSol.toFixed(3).padStart(9)} ${r.paper.maxDrawdownSol.toFixed(3).padStart(7)}`);
          }
      break;
    }
    case "train": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      const current = store.loadModel() ?? priorModel();
      const rows = samples.filter((s) => s.kind === "checkpoint").map((s) => ({ ts: s.ts, stage: s.stage, x: s.x, y: s.y }));
      const { model, reports } = trainAndSelect(current, rows);
      for (const r of reports) console.log(`${r.stage}: ${r.adopted ? "ADOPT" : "keep"} \u2014 ${r.reason}; AUC ${r.current.auc?.toFixed(3)} \u2192 ${r.candidate.auc?.toFixed(3)}, log-loss ${r.current.logLoss?.toFixed(4)} \u2192 ${r.candidate.logLoss?.toFixed(4)} (train ${r.trainRows}, validate ${r.valRows})`);
      if (a.adopt && reports.some((r) => r.adopted)) {
        store.saveModel(model);
        console.log(`saved ${model.version} to ${join2(data, "models/current.json")} \u2014 restart the server to use it`);
      }
      store.close();
      break;
    }
    case "sim": {
      const out = String(a.out ?? "./simdata");
      mkdirSync2(out, { recursive: true });
      const store = new DataStore(out, silentLogger);
      const sim = new MarketSim({ durationMs: Number(a.hours ?? 6) * 36e5, seed: Number(a.seed ?? 1), predictability: Number(a.predictability ?? 0.7) });
      let n = 0;
      for (const ev of sim.run()) {
        store.record(ev, ev.ts);
        n++;
      }
      store.close();
      console.log(`wrote ${n} simulated events to ${out}/record (SYNTHETIC \u2014 for testing the pipeline only)`);
      break;
    }
    case "edges": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 30));
      store.close();
      const r = findEdges(samples, { placeboRuns: Number(a.placebo ?? 5) });
      console.log(r.note);
      if (r.status === "ok") {
        console.log(`
${r.samples.toLocaleString("en-US")} entry outcomes over ${r.hours.toFixed(1)} h: searched the first ${r.discoveryHours.toFixed(1)} h, checked on the last ${r.holdoutHours.toFixed(1)} h`);
        console.log(`${r.tested.toLocaleString("en-US")} rules scored, ${r.candidates} re-tested, ${r.survivors.length} held up. Placebo (shuffled data): ${r.placebo.avgSurvivors.toFixed(2)} per run, max ${r.placebo.maxSurvivors}
`);
        for (const s of r.survivors)
          console.log(`\u2714 ${s.text}
   newest data ${pct2(s.holdout.mean)} per trade (worst case ${pct2(s.holdout.lo)}, ${s.holdout.n} trades, ${pct2(s.holdout.winRate)} winners) \xB7 search data ${pct2(s.discovery.mean)} \xB7 every coin at ${s.level}: ${pct2(s.baseline)} \xB7 ${s.tradesPerDay.toFixed(0)} coins/day`);
        for (const s of r.failed) console.log(`\u2718 ${s.text}: ${pct2(s.discovery.mean)} in the search data, ${pct2(s.holdout.mean)} on the newest data`);
      }
      break;
    }
    case "selftest": {
      const res = await pipelineSelfTest({ hours: Number(a.hours ?? 4), log: (m) => console.log(m) });
      console.log(JSON.stringify(res, null, 1));
      break;
    }
    default:
      console.log(readFileSync2(new URL(import.meta.url)).toString().split("*/")[0]);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
