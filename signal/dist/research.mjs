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
function runSteps(it) {
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
async function runStepsAsync(it, sliceMs = 15) {
  let t = Date.now();
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
    if (Date.now() - t > sliceMs) {
      await new Promise((res) => setTimeout(res, 0));
      t = Date.now();
    }
  }
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
function wilson(successes, n, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 1, p: NaN };
  const p = successes / n;
  const denom = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), p };
}
var hourOf = (ts) => Math.floor(ts / 36e5);
function clusteredMeanCI(xs, cluster, level = 0.95) {
  const n = xs.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, n, clusters: 0 };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += xs[i];
  const m = sum / n;
  const by = /* @__PURE__ */ new Map();
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i] - m;
    sq += d * d;
    by.set(cluster[i], (by.get(cluster[i]) ?? 0) + d);
  }
  const c = by.size;
  if (n < 2 || c < 2) return { mean: m, lo: -Infinity, hi: Infinity, n, clusters: c };
  const q = 1 - (1 - level) / 2;
  let cs = 0;
  for (const v of by.values()) cs += v * v;
  const half = Math.max(tInv(q, n - 1) * Math.sqrt(sq / (n - 1) / n), tInv(q, c - 1) * Math.sqrt(cs / (n * n) * (c / (c - 1))));
  return { mean: m, lo: m - half, hi: m + half, n, clusters: c };
}
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
function tInv(p, df) {
  if (!(df >= 1)) return Infinity;
  if (df === 1) return Math.tan(Math.PI * (p - 0.5));
  if (df === 2) {
    const a = 2 * p - 1;
    return a * Math.sqrt(2 / (1 - a * a));
  }
  const z = normInv(p);
  const z2 = z * z;
  const g1 = z * (z2 + 1) / 4;
  const g2 = z * ((5 * z2 + 16) * z2 + 3) / 96;
  const g3 = z * (((3 * z2 + 19) * z2 + 17) * z2 - 15) / 384;
  const g4 = z * ((((79 * z2 + 776) * z2 + 1482) * z2 - 1920) * z2 - 945) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}
var silentLogger = { debug() {
}, info() {
}, warn() {
}, error() {
} };

// src/core/outcomes.ts
function sumBps(f2) {
  return (f2.creator + f2.protocol + f2.lp) / 1e4;
}
var GRID_TP = [10, 15, 25, 50, 75, 100, 150, 200, 300, 500];
var GRID_SL = [5, 10, 20, 30, 40, 50, 70];
var LEGACY_TP = [25, 50, 75, 100, 150, 200, 300, 500];
var LEGACY_SL = [10, 20, 30, 40, 50, 70];
var LEGACY = LEGACY_TP.flatMap((tp) => LEGACY_SL.map((sl) => ({ tp, sl })));
var LEGACY_GRID = LEGACY.length;
var GRID = [
  ...LEGACY,
  ...GRID_TP.flatMap((tp) => GRID_SL.map((sl) => ({ tp, sl }))).filter((g) => !LEGACY.some((l) => l.tp === g.tp && l.sl === g.sl))
];
var GRID_VERSION = 3;
var GRID_VERSION_MIN = 2;
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
function comboObserved(s, gi) {
  if (s.gridT !== void 0 && gi >= s.gridT.length) return false;
  const t = s.gridT?.[gi];
  return seenAt(s, t ?? Infinity);
}
function counts(s, exitSec, windowSec = Infinity) {
  if (s.ov === void 0 && s.stage === "amm") return false;
  if (s.blind === void 0) return true;
  if (s.stage === "amm" || s.blindBy === "feed" || s.blindBy === "stop") return windowSec <= s.blind;
  return Math.min(exitSec, windowSec) <= s.blind;
}
function comboCounts(s, gi) {
  if (s.gridT !== void 0 && gi >= s.gridT.length) return false;
  return counts(s, s.gridT?.[gi] ?? Infinity);
}
function seenAt(s, sec) {
  if (s.ov === void 0 && s.stage === "amm") return false;
  return s.blind === void 0 || sec <= s.blind;
}
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
  /** Coins with would-be trades still being followed. */
  openMints() {
    return this.byMint.keys();
  }
  /**
   * The coin's price no longer reaches us (its pool is not followed any more): its would-be
   * trades keep their exits up to `at`; what happens after is unknown. Not yet entered ones are
   * dropped — their entry could not be seen.
   */
  blindMint(mint, at2, by = "pool") {
    const list = this.byMint.get(mint);
    if (!list) return;
    for (const h of [...list]) {
      if (!h.entered) {
        this.remove(h);
        continue;
      }
      if (h.blind !== void 0) continue;
      h.blind = Math.max(at2, h.ts);
      h.blindBy = by;
      for (let i = 0; i < COMBOS; i++) if (h.c[i * SLOT + STATE] === 1) this.resolveCombo(h, i, h.lastM);
      if (h.open === 0) this.emit(h, at2);
    }
  }
  /** The trade feed went quiet at `at`: nothing open is observed from then on. */
  blindAll(at2) {
    for (const mint of [...this.byMint.keys()]) this.blindMint(mint, at2, "feed");
  }
  /**
   * The bot is stopping (a restart, an update): every open would-be trade is written now, as
   * watched up to `at`, instead of being lost with the process. Like a trade-feed outage, each then
   * counts only for rules whose whole window it was watched through (counts); exits it had not
   * reached are written past any window (at the horizon), so they are never taken for results.
   * Losing them instead would drop mostly the coins still alive at the stop — a bias.
   */
  endAll(at2) {
    const timeout = KINDS.indexOf("timeout");
    for (const list of [...this.byMint.values()]) {
      for (const h of [...list]) {
        if (!h.entered) {
          this.remove(h);
          continue;
        }
        if (h.blind === void 0) {
          h.blind = Math.max(at2, h.ts);
          h.blindBy = "stop";
        }
        for (let i = 0; i < COMBOS; i++) {
          const o = i * SLOT;
          if (h.c[o + STATE] === 2) continue;
          if (h.c[o + STATE] !== 1) {
            h.c[o + KIND] = timeout;
            h.c[o + TIME] = this.opts.horizonMs / 1e3;
          }
          this.resolveCombo(h, i, h.lastM);
        }
        this.emit(h, at2);
      }
    }
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
      f: facts,
      lastM: 1
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
    const venueFee = t.stage === "amm" ? sumBps(ammFeesForMcapSol(t.mcapSol)) : 0.0125;
    const sellFee = venueFee + this.opts.costs.platformFeePct / 100;
    const tokensUi = q.tokens / 1e6;
    const pricePerMcap = 1e6 / t.supply;
    h.a = tokensUi * pricePerMcap * (1 - sellFee) / this.opts.sizeSol;
    h.b = (this.opts.costs.priorityFeeSol - (this.opts.costs.refundRent ? this.opts.costs.ataRentSol : 0)) / this.opts.sizeSol;
    h.ts = now;
    h.lastM = this.mult(h, t.mcapSol);
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
      if (h.blind === void 0) h.lastM = m;
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
      ...h.blind !== void 0 ? { blind: Math.round((h.blind - h.ts) / 100) / 10, blindBy: h.blindBy } : {},
      ov: 1,
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

// src/core/settings.ts
var ENTRY_POINTS = {
  age20: "20 s after launch",
  age45: "45 s after launch",
  age90: "90 s after launch",
  age180: "3 min after launch",
  age360: "6 min after launch",
  age720: "12 min after launch",
  prog25: "a quarter of the way to graduation",
  prog50: "halfway to graduation",
  prog75: "three quarters of the way to graduation",
  mig60: "1 min after graduating",
  mig300: "5 min after graduating",
  mig900: "15 min after graduating",
  mig3600: "1 h after graduating"
};
var MAX_MOMENTS = 4;
var MOMENT_RANGE = { age: [10, 86400], mig: [30, 86400] };
function snapMomentSec(sec) {
  if (sec < 120) return Math.round(sec);
  if (sec < 7200) return Math.round(sec / 30) * 30;
  return Math.round(sec / 1800) * 1800;
}
function customMoment(tag) {
  const m = /^(age|mig)(\d{1,6})$/.exec(tag);
  if (!m || tag in ENTRY_POINTS) return null;
  const kind = m[1];
  const sec = Number(m[2]);
  const [lo, hi] = MOMENT_RANGE[kind];
  return sec >= lo && sec <= hi && snapMomentSec(sec) === sec ? { kind, sec } : null;
}
function isMomentTag(tag) {
  return tag in ENTRY_POINTS || customMoment(tag) !== null;
}
var duration = (sec) => sec < 120 ? `${sec} s` : sec < 7200 ? `${+(sec / 60).toFixed(1)} min` : `${+(sec / 3600).toFixed(1)} h`;
function entryLabel(tag) {
  const fixed = ENTRY_POINTS[tag];
  if (fixed) return fixed;
  const c = customMoment(tag);
  return c ? `${duration(c.sec)} after ${c.kind === "age" ? "launch" : "graduating"}` : tag;
}
var DEFAULT_SETTINGS = {
  enabled: false,
  mode: "paper",
  minScore: 75,
  entryAt: "score",
  moments: [],
  conds: [],
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
  autopilot: true,
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
    entryAt: i.entryAt === "score" || typeof i.entryAt === "string" && isMomentTag(i.entryAt) ? i.entryAt : b.entryAt,
    moments: sanitizeMoments(i.moments, b.moments),
    conds: sanitizeConds(i.conds, b.conds),
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
    autopilot: bool(i.autopilot, b.autopilot),
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
  if (customMoment(out.entryAt) && !out.moments.includes(out.entryAt)) {
    out.moments.push(out.entryAt);
    while (out.moments.length > MAX_MOMENTS) out.moments.splice(out.moments.findIndex((m) => m !== out.entryAt), 1);
  }
  return out;
}
function sanitizeMoments(v, d = []) {
  if (!Array.isArray(v)) return [...d];
  const out = [];
  for (const m of v) if (typeof m === "string" && customMoment(m) && !out.includes(m)) out.push(m);
  return out.slice(-MAX_MOMENTS);
}
function sanitizeConds(v, d = []) {
  if (!Array.isArray(v)) return d.map((c) => ({ ...c }));
  const out = [];
  for (const c of v) {
    if (!c || typeof c !== "object") continue;
    const { k, op, v: val } = c;
    if (typeof k === "string" && FEATURE_KEYS.includes(k) && (op === ">=" || op === "<=") && typeof val === "number" && Number.isFinite(val)) out.push({ k, op, v: val });
    if (out.length === 3) break;
  }
  return out;
}
function filterBlock(f2, x) {
  if (f2.minMcapSol > 0 && x.mcap < f2.minMcapSol) return "filter:mcap_min";
  if (f2.maxMcapSol > 0 && x.mcap > f2.maxMcapSol) return "filter:mcap_max";
  if (x.devShare * 100 > f2.maxDevPct) return "filter:dev";
  if (x.top10 * 100 > f2.maxTop10Pct) return "filter:top10";
  if (x.bundle * 100 > f2.maxBundlePct) return "filter:bundle";
  if (x.buyers < f2.minBuyers) return "filter:buyers";
  if (f2.minAgeSec > 0 && x.age < f2.minAgeSec) return "filter:age_min";
  if (f2.maxAgeMin > 0 && x.age > f2.maxAgeMin * 60) return "filter:age_max";
  if (f2.requireSocials && x.socials === 0) return "filter:socials";
  if (f2.maxDevLaunches24h > 0 && x.launches24h > f2.maxDevLaunches24h) return "filter:serial_dev";
  if (f2.maxDevSoldPct < 100 && x.devSold * 100 > f2.maxDevSoldPct) return "filter:dev_sold";
  return null;
}
var RULE_KEYS = ["entryAt", "conds", "minScore", "tpPct", "slPct", "maxHoldMin", "trailPct", "takeInitials", "reentry", "tradeCurve", "tradeAmm", "scoreOnly", "filters"];
function ruleOf(s) {
  const out = {};
  for (const k of RULE_KEYS) out[k] = k === "filters" ? { ...s.filters } : k === "conds" ? (s.conds ?? []).map((c) => ({ ...c })) : s[k];
  return out;
}
function ruleChanged(a, b) {
  return JSON.stringify(ruleOf(a)) !== JSON.stringify(ruleOf(b));
}
function ruleKey(s) {
  const text = JSON.stringify(ruleOf(s));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function condsHold(conds, x) {
  for (const c of conds) {
    const v = x[FEATURE_KEYS.indexOf(c.k)];
    if (v === void 0 || !Number.isFinite(v)) return false;
    if (c.op === ">=" ? v < c.v - 1e-9 : v > c.v + 1e-9) return false;
  }
  return true;
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

// src/core/edges.ts
var HOLDS_MIN = [0, 10, 30, 60];
var EXITS = GRID.length * HOLDS_MIN.length;
var f = (s) => s.f;
var CONDITIONS = [
  { key: "any", label: "any coin", test: () => true },
  { key: "curve", label: "still on the bonding curve", test: (s) => s.stage === "curve", stage: "curve" },
  { key: "amm", label: "already graduated", test: (s) => s.stage === "amm", stage: "amm" },
  ...[40, 80, 150].map((v) => ({ key: `mcap<=${v}`, label: `market cap \u2264 ${v} SOL`, test: (s) => f(s).mcap <= v, filters: { maxMcapSol: v } })),
  // Up to 300 SOL these are bands of the bonding curve, which completes at about 411. The three
  // above it are the graduated market, and they are there because that is where trading is cheap:
  // PumpSwap charges by market cap, so a round trip falls from 4.94% on the curve at 0.1 SOL to
  // 3.13% around 9,820 SOL and 1.70% above ~98,000. Every entry in the menu loses roughly the fee,
  // so the size of the fee is the difference between a losing rule and a working one — and until
  // now the search could not say "a big graduated coin" at all.
  ...[80, 150, 300, 1500, 1e4, 5e4].map((v) => ({ key: `mcap>=${v}`, label: `market cap \u2265 ${v.toLocaleString("en-US")} SOL`, test: (s) => f(s).mcap >= v, filters: { minMcapSol: v } })),
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
var EDGE_METHOD = 3;
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
function exitReturn(s, c, h) {
  return exitReturnAt(s, c, HOLDS_MIN[h]);
}
function hasExit(s, c) {
  if (c >= s.grid.length) return false;
  return s.gridT === void 0 || c < s.gridT.length;
}
function exitReturnAt(s, c, hold) {
  if (!hasExit(s, c)) return NaN;
  const ret = s.grid[c];
  const window = hold ? hold * 60 : Infinity;
  const t = s.gridT?.[c];
  if (hold === 0 || (t ?? 0) <= hold * 60) return counts(s, t ?? Infinity, window) ? ret : NaN;
  if (!counts(s, window, window)) return NaN;
  const v = s.path?.[PATH_MIN.indexOf(hold)];
  return v ?? ret;
}
function describe(r) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const when = r.cond === "any" ? "" : ` \xB7 ${cond.label}`;
  const time = r.hold ? `, or after ${r.hold} min` : "";
  const entry = r.at ? `Buy every coin ${entryLabel(r.at)}` : `Buy when a coin first reaches ${r.level}`;
  return `${entry}${when} \xB7 sell at +${r.tp}% or \u2212${r.sl}%${time}`;
}
function settingsFor(r, horizonMs) {
  const cond = CONDITIONS.find((c) => c.key === r.cond);
  const out = {
    entryAt: r.at ?? "score",
    conds: [],
    minScore: r.at ? 0 : r.level,
    tpPct: r.tp,
    slPct: r.sl,
    maxHoldMin: r.hold || Math.round(horizonMs / 6e4),
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
function recordedRows(samples, horizonMs) {
  let lastResolved = 0;
  for (const s of samples) if (s.resolvedAt > lastResolved) lastResolved = s.resolvedAt;
  const cutoff = lastResolved - horizonMs;
  return samples.filter(
    (s) => (s.kind === "entry" || s.kind === "checkpoint" && s.tag in ENTRY_POINTS || s.kind === "moment" && customMoment(s.tag) !== null) && (s.gv ?? 0) >= GRID_VERSION_MIN && s.f && (s.gridT?.length ?? 0) >= LEGACY_GRID && s.grid.length >= LEGACY_GRID && s.path?.length === PATH_MIN.length && s.ts <= cutoff
  ).sort((a, b) => a.ts - b.ts);
}
function whyUnmeasurable(s, horizonMs) {
  if (s.entryAt === "score" && !ENTRY_LEVELS.includes(s.minScore)) return `score ${s.minScore} is not one of the levels the bot records (${ENTRY_LEVELS.join(", ")})`;
  if (s.entryAt === "score" && s.reentry) return "buying the same coin again is not recorded";
  if (!GRID.some((g) => g.tp === s.tpPct && g.sl === s.slPct))
    return `+${s.tpPct}% / \u2212${s.slPct}% is not among the exits the bot records (take profit ${GRID_TP_TEXT}; stop loss ${GRID_SL_TEXT})`;
  if (holdOf(s, horizonMs) === null) return `a time limit of ${s.maxHoldMin} min is not among the ones the bot records (${PATH_MIN.join(", ")} min, ${Math.round(horizonMs / 36e5)} h or none)`;
  if (s.trailPct > 0) return "a trailing stop is not recorded";
  if (s.takeInitials) return "taking the initials out is not recorded";
  return null;
}
var GRID_TP_TEXT = [...new Set(GRID.map((g) => g.tp))].map((x) => `${x}%`).join(", ");
var GRID_SL_TEXT = [...new Set(GRID.map((g) => g.sl))].map((x) => `${x}%`).join(", ");
function holdOf(s, horizonMs) {
  if (s.maxHoldMin === 0 || s.maxHoldMin * 6e4 >= horizonMs) return 0;
  return PATH_MIN.includes(s.maxHoldMin) ? s.maxHoldMin : null;
}
function measureRule(rows, s, o) {
  const key = ruleKey(s);
  const none = (why) => ({ key, ok: false, why, n: 0, mean: NaN, lo: NaN, hi: NaN, coinsPerDay: 0 });
  const bad = whyUnmeasurable(s, o.horizonMs);
  if (bad) return none(bad);
  const tag = s.entryAt === "score" ? `x${s.minScore}` : s.entryAt;
  const family = rows.filter((r) => r.tag === tag);
  if (family.length < 2) return none(`the bot has no finished recordings of ${s.entryAt === "score" ? `coins reaching ${s.minScore}` : `coins ${entryLabel(tag)}`} yet`);
  const f0 = family[0].ts;
  const f1 = family[family.length - 1].ts;
  const split = f0 + (f1 - f0) * 2 / 3;
  const combo = GRID.findIndex((g) => g.tp === s.tpPct && g.sl === s.slPct);
  const hold = holdOf(s, o.horizonMs);
  const t0 = rows[0].ts;
  const vals = [];
  const hours = [];
  const mints = /* @__PURE__ */ new Set();
  let held = 0;
  let wins2 = 0;
  let qualified = 0;
  for (const r of family) {
    if (r.ts < split) continue;
    if (r.stage === "curve" && !s.tradeCurve || r.stage === "amm" && !s.tradeAmm) continue;
    if (s.conds.length && !condsHold(s.conds, r.x)) continue;
    if (!s.scoreOnly && filterBlock(s.filters, r.f)) continue;
    qualified++;
    mints.add(r.mint);
    const v = exitReturnAt(r, combo, hold);
    if (Number.isNaN(v)) continue;
    vals.push(v);
    hours.push(Math.floor((r.ts - t0) / 36e5));
    if (v > 0) wins2++;
    const sec = r.gridT?.[combo] ?? 0;
    held += hold ? Math.min(sec, hold * 60) : sec;
  }
  const minN = o.minN ?? DEFAULTS.minHoldout;
  const minWins = o.minWins ?? DEFAULTS.minWins;
  if (vals.length < minN)
    return none(
      qualified >= minN ? `only ${vals.length} of the ${qualified} coins that qualified on the newest recordings were watched through its whole time limit (${minN} needed) \u2014 graduated coins drop out of the 40 followed pools after a while` : `only ${qualified} coins qualified for it on the newest recordings (${minN} needed)`
    );
  const m = clusteredMeanCI(vals, hours, 1 - 0.1 / Math.max(1, o.tests ?? DEFAULTS.candidates));
  const days = Math.max(1 / 24, (f1 - split) / 864e5);
  const out = { key, ok: true, n: vals.length, mean: m.mean, lo: m.lo, hi: m.hi, coinsPerDay: mints.size / days, avgHoldMin: held / vals.length / 60 };
  if (wins2 < minWins) return { ...out, ok: false, why: `only ${wins2} of its ${vals.length} coins won \u2014 too few to count on` };
  return out;
}
function forwardTest(rows, rule, after) {
  const tag = rule.at ?? `x${rule.level}`;
  const cond = CONDITIONS.find((c) => c.key === rule.cond);
  const combo = GRID.findIndex((g) => g.tp === rule.tp && g.sl === rule.sl);
  const h = HOLDS_MIN.indexOf(rule.hold);
  if (!cond || combo < 0 || h < 0) return void 0;
  const v = [];
  const hours = [];
  for (const s of rows) {
    if (s.ts <= after || s.tag !== tag || !cond.test(s)) continue;
    const x = exitReturn(s, combo, h);
    if (Number.isNaN(x)) continue;
    v.push(x);
    hours.push(hourOf(s.ts));
  }
  const m = clusteredMeanCI(v, hours);
  return { text: describe(rule), n: v.length, mean: m.mean, lo: m.lo, hi: m.hi };
}
function stats(d, idx, e, z) {
  let n = 0;
  let sum = 0;
  let sq = 0;
  let w = 0;
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]) * EXITS + e] - d.shift[e];
    if (Number.isNaN(v)) continue;
    n++;
    sum += v;
    sq += v * v;
    if (d.wins(v)) w++;
  }
  if (n < 2) return { n, mean: n ? sum : NaN, lo: -Infinity, winRate: n ? w / n : NaN };
  const mean = sum / n;
  const variance = Math.max(0, (sq - n * mean * mean) / (n - 1));
  return { n, mean, lo: mean - z * Math.sqrt(variance / n), winRate: w / n };
}
function holdoutStats(d, idx, e, tests) {
  const st = stats(d, idx, e, 0);
  if (st.n < 2) return st;
  const vals = [];
  const hours = [];
  for (let k = 0; k < idx.length; k++) {
    const v = d.R[d.row(idx[k]) * EXITS + e] - d.shift[e];
    if (Number.isNaN(v)) continue;
    vals.push(v);
    hours.push(d.hour[idx[k]]);
  }
  return { ...st, lo: clusteredMeanCI(vals, hours, 1 - 0.1 / Math.max(1, tests)).lo };
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
  const checked = cands.map((c) => ({ c, hold: holdoutStats(d, c.g.hold, c.e, cands.length) }));
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
    method: EDGE_METHOD,
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
  const rows = recordedRows(samples, o.horizonMs);
  if (rows.length) base.cutoff = rows[rows.length - 1].ts;
  if (opts.incumbent) base.incumbent = forwardTest(rows, opts.incumbent.rule, opts.incumbent.after);
  const own = (tests) => opts.own ? { own: measureRule(rows, opts.own, { horizonMs: o.horizonMs, tests, minN: o.minHoldout, minWins: o.minWins }) } : {};
  const n = rows.length;
  const t0 = n ? rows[0].ts : 0;
  const t1 = n ? rows[n - 1].ts : 0;
  const hours = n ? (t1 - t0) / 36e5 : 0;
  base.samples = n;
  base.hours = hours;
  if (n < o.minSamples || hours < o.minHours) {
    base.note = `Needs at least ${o.minHours} hours of recorded market and ${o.minSamples.toLocaleString("en-US")} finished would-be trades (so far: ${hours.toFixed(1)} h, ${n.toLocaleString("en-US")}). Each outcome finishes ${Math.round(o.horizonMs / 36e5)} hours after its entry.`;
    return { ...base, ...own(o.candidates) };
  }
  const R = new Float32Array(n * EXITS);
  for (let i = 0; i < n; i++) {
    const s = rows[i];
    for (let c = 0; c < GRID.length; c++) for (let h = 0; h < HOLDS_MIN.length; h++) R[i * EXITS + c * HOLDS_MIN.length + h] = exitReturn(s, c, h);
    if (i % 2e3 === 0) yield;
  }
  const groups = [];
  const byEntry = /* @__PURE__ */ new Map();
  rows.forEach((s, i) => {
    let list = byEntry.get(s.tag);
    if (!list) byEntry.set(s.tag, list = []);
    list.push(i);
  });
  const yours = [...new Set(rows.filter((s) => s.kind === "moment").map((s) => s.tag))].sort();
  const families = [
    ...ENTRY_LEVELS.map((level) => ({ tag: `x${level}`, level })),
    ...[...Object.keys(ENTRY_POINTS), ...yours].map((at2) => ({ tag: at2, level: 0, at: at2 }))
  ];
  for (const fam of families) {
    const idx = byEntry.get(fam.tag) ?? [];
    if (!idx.length) continue;
    const f0 = rows[idx[0]].ts;
    const f1 = rows[idx[idx.length - 1]].ts;
    const split = f0 + (f1 - f0) * 2 / 3;
    const holdDays = Math.max(1 / 24, (f1 - split) / 864e5);
    CONDITIONS.forEach((cond, ci) => {
      const disc = [];
      const hold = [];
      for (const i of idx) if (cond.test(rows[i])) (rows[i].ts < split ? disc : hold).push(i);
      groups.push({ level: fam.level, at: fam.at, cond: ci, disc: Int32Array.from(disc), hold: Int32Array.from(hold), holdDays });
    });
  }
  const hour2 = new Int32Array(n);
  for (let i = 0; i < n; i++) hour2[i] = Math.floor((rows[i].ts - t0) / 36e5);
  const zero = new Float64Array(EXITS);
  const real = { R, row: (i) => i, shift: zero, wins: (v) => v > 0, hour: hour2 };
  const run = yield* search(real, groups, o);
  const toFound = (c, holdSt) => {
    const combo = Math.floor(c.e / HOLDS_MIN.length);
    const rule = { level: c.g.level, cond: CONDITIONS[c.g.cond].key, tp: GRID[combo].tp, sl: GRID[combo].sl, hold: HOLDS_MIN[c.e % HOLDS_MIN.length] };
    if (c.g.at) rule.at = c.g.at;
    const all = groups.find((g) => g.level === c.g.level && g.at === c.g.at && g.cond === 0);
    let held = 0;
    let heldN = 0;
    for (const i of c.g.hold) {
      if (Number.isNaN(R[i * EXITS + c.e])) continue;
      const sec = rows[i].gridT?.[combo] ?? 0;
      held += rule.hold ? Math.min(sec, rule.hold * 60) : sec;
      heldN++;
    }
    return {
      ...rule,
      text: describe(rule),
      discovery: c.disc,
      holdout: holdSt,
      baseline: stats(real, all.hold, c.e, 0).mean,
      tradesPerDay: new Set(Array.from(c.g.hold, (i) => rows[i].mint)).size / c.g.holdDays,
      avgHoldMin: heldN ? held / heldN / 60 : void 0,
      settings: settingsFor(rule, o.horizonMs)
    };
  };
  const survivors = run.passed.map((x) => toFound(x.c, x.hold)).sort((a, b) => b.holdout.lo - a.holdout.lo);
  const failed = run.cands.filter((x) => !run.passed.includes(x)).slice(0, 3).map((x) => toFound(x.c, x.hold));
  const colMean = new Float64Array(EXITS);
  const colN = new Float64Array(EXITS);
  for (let i = 0; i < n; i++)
    for (let e = 0; e < EXITS; e++) {
      const v = R[i * EXITS + e];
      if (Number.isNaN(v)) continue;
      colMean[e] += v;
      colN[e]++;
    }
  for (let e = 0; e < EXITS; e++) colMean[e] = colN[e] ? colMean[e] / colN[e] : 0;
  const rand = rng(o.seed);
  const counts2 = [];
  for (let r = 0; r < o.placeboRuns; r++) {
    const perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    counts2.push((yield* search({ R, row: (i) => perm[i], shift: colMean, wins: (v) => v > 0, hour: hour2 }, groups, o)).passed.length);
  }
  const discHours = hours * (2 / 3);
  return {
    ...base,
    ...own(run.cands.length),
    status: "ok",
    note: survivors.length ? `${survivors.length} rule${survivors.length > 1 ? "s" : ""} held up on the newest data the search never saw.` : "No rule held up on the newest data yet. That is a real answer: keep recording, the search runs again every few hours.",
    discoveryHours: discHours,
    holdoutHours: hours - discHours,
    tested: run.tested,
    candidates: run.cands.length,
    survivors,
    failed,
    placebo: {
      runs: counts2.length,
      avgSurvivors: counts2.length ? counts2.reduce((a, b) => a + b, 0) / counts2.length : 0,
      maxSurvivors: counts2.length ? Math.max(...counts2) : 0
    }
  };
}

// src/research/cli.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";

// src/core/boost.ts
var BOOST_DEFAULTS = {
  rounds: 300,
  lr: 0.08,
  depth: 3,
  lambda: 5,
  minHess: 8,
  minHessShare: 2e-3,
  minGain: 0,
  subsample: 0.8,
  colsample: 0.8,
  bins: 32,
  patience: 25,
  seed: 17
};
var sig = (z) => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
function logLossOf(m, y, w, n = m.length) {
  let ll = 0;
  let sw = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, sig(m[i])));
    ll -= w[i] * (y[i] ? Math.log(p) : Math.log(1 - p));
    sw += w[i];
  }
  return sw > 0 ? ll / sw : NaN;
}
function* makeCuts(X, n, d, bins, rand) {
  const take = Math.min(n, 2e4);
  const pick2 = new Int32Array(take);
  for (let k = 0; k < take; k++) pick2[k] = n <= take ? k : Math.floor(rand() * n);
  const cuts = [];
  const vals = new Float64Array(take);
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < take; k++) vals[k] = X[pick2[k] * d + j];
    vals.sort();
    const out = [];
    for (let b = 1; b < bins; b++) {
      const v = vals[Math.min(take - 1, Math.floor(b / bins * take))];
      if (v < vals[take - 1] && (out.length === 0 || v > out[out.length - 1])) out.push(v);
    }
    cuts.push(Float64Array.from(out));
    yield;
  }
  return cuts;
}
function binOf(cuts, x) {
  let lo = 0;
  let hi = cuts.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (cuts[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function treeOut(t, x, map) {
  let i = 0;
  while (t.f[i] >= 0) i = Math.fround(x[map[t.f[i]]]) <= t.t[i] ? t.l[i] : t.r[i];
  return t.v[i];
}
var identity = /* @__PURE__ */ new Map();
function identityMap(d) {
  let m = identity.get(d);
  if (!m) {
    m = Int32Array.from({ length: d }, (_, i) => i);
    identity.set(d, m);
  }
  return m;
}
function ensembleMargin(ens, x, map = identityMap(ens.keys.length)) {
  let s = 0;
  for (const t of ens.trees) s += treeOut(t, x, map);
  return s;
}
function ensembleContrib(ens, x, out, map = identityMap(ens.keys.length)) {
  let bias = 0;
  for (const t of ens.trees) {
    let i = 0;
    bias += t.v[0];
    while (t.f[i] >= 0) {
      const at2 = map[t.f[i]];
      const next = Math.fround(x[at2]) <= t.t[i] ? t.l[i] : t.r[i];
      out[at2] += t.v[next] - t.v[i];
      i = next;
    }
  }
  return bias;
}
function* boostSteps(train, valid, keys, params = {}) {
  const p = { ...BOOST_DEFAULTS, ...params };
  const { n, d, X, y, w } = train;
  const rand = rng(p.seed);
  const B = Math.max(2, Math.min(255, p.bins));
  const cuts = yield* makeCuts(X, n, d, B, rand);
  const nb = cuts.map((c) => c.length + 1);
  const skip = new Set(p.skip ?? []);
  const bins = new Uint8Array(n * d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) bins[i * d + j] = binOf(cuts[j], X[i * d + j]);
    if ((i & 4095) === 4095) yield;
  }
  yield;
  const m = Float64Array.from(train.base);
  const g = new Float64Array(n);
  const h = new Float64Array(n);
  const vm = valid ? Float64Array.from(valid.base) : null;
  const curve = [valid ? logLossOf(vm, valid.y, valid.w) : logLossOf(m, y, w)];
  let best = curve[0];
  let bestRounds = 0;
  const trees = [];
  const gains = [];
  const hist = (rows, feats) => {
    const hs = new Float64Array(d * B * 2);
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r];
      const gi = g[i];
      const hi = h[i];
      const o = i * d;
      for (let k = 0; k < feats.length; k++) {
        const j = feats[k];
        const at2 = (j * B + bins[o + j]) * 2;
        hs[at2] += gi;
        hs[at2 + 1] += hi;
      }
    }
    return hs;
  };
  for (let round = 0; round < p.rounds; round++) {
    let Htot = 0;
    for (let i = 0; i < n; i++) {
      const q = sig(m[i]);
      g[i] = w[i] * (q - y[i]);
      h[i] = w[i] * Math.max(q * (1 - q), 1e-6);
      Htot += h[i];
    }
    const minH = Math.max(p.minHess, p.minHessShare * Htot);
    const rowList = [];
    for (let i = 0; i < n; i++) if (p.subsample >= 1 || rand() < p.subsample) rowList.push(i);
    const featList = [];
    for (let j = 0; j < d; j++) if (nb[j] > 1 && !skip.has(j) && (p.colsample >= 1 || rand() < p.colsample)) featList.push(j);
    if (featList.length === 0 || rowList.length < 2) break;
    const feats = Int32Array.from(featList);
    const tree = { f: [], t: [], l: [], r: [], v: [] };
    const splitBin = [];
    const gain = new Array(keys.length).fill(0);
    const leafOf = (G, H2) => -G / (H2 + p.lambda) * p.lr;
    const newNode = (G, H2) => {
      tree.f.push(-1);
      tree.t.push(0);
      tree.l.push(-1);
      tree.r.push(-1);
      tree.v.push(leafOf(G, H2));
      splitBin.push(-1);
      return tree.f.length - 1;
    };
    const rootRows = Int32Array.from(rowList);
    let G0 = 0;
    let H0 = 0;
    for (const i of rootRows) {
      G0 += g[i];
      H0 += h[i];
    }
    const open = [{ id: newNode(G0, H0), rows: rootRows, hs: hist(rootRows, feats), G: G0, H: H0, depth: 0 }];
    while (open.length) {
      const node = open.pop();
      if (node.depth >= p.depth || node.H < 2 * minH) continue;
      const parentScore = node.G * node.G / (node.H + p.lambda);
      let bestGain = p.minGain;
      let bj = -1;
      let bb = -1;
      for (let k = 0; k < feats.length; k++) {
        const j = feats[k];
        let GL2 = 0;
        let HL2 = 0;
        for (let b = 0; b < nb[j] - 1; b++) {
          const at2 = (j * B + b) * 2;
          GL2 += node.hs[at2];
          HL2 += node.hs[at2 + 1];
          const HR = node.H - HL2;
          if (HL2 < minH) continue;
          if (HR < minH) break;
          const GR = node.G - GL2;
          const gn = GL2 * GL2 / (HL2 + p.lambda) + GR * GR / (HR + p.lambda) - parentScore;
          if (gn > bestGain) {
            bestGain = gn;
            bj = j;
            bb = b;
          }
        }
      }
      if (bj < 0) continue;
      const left = [];
      const right = [];
      for (const i of node.rows) (bins[i * d + bj] <= bb ? left : right).push(i);
      const L = Int32Array.from(left);
      const R = Int32Array.from(right);
      const small = L.length <= R.length ? L : R;
      const hsSmall = hist(small, feats);
      const hsLarge = new Float64Array(node.hs.length);
      for (let q = 0; q < hsLarge.length; q++) hsLarge[q] = node.hs[q] - hsSmall[q];
      const hsL = small === L ? hsSmall : hsLarge;
      const hsR = small === L ? hsLarge : hsSmall;
      let GL = 0;
      let HL = 0;
      for (const i of L) {
        GL += g[i];
        HL += h[i];
      }
      const li = newNode(GL, HL);
      const ri = newNode(node.G - GL, node.H - HL);
      tree.f[node.id] = bj;
      tree.t[node.id] = cuts[bj][bb];
      tree.l[node.id] = li;
      tree.r[node.id] = ri;
      splitBin[node.id] = bb;
      gain[bj] += bestGain;
      open.push({ id: li, rows: L, hs: hsL, G: GL, H: HL, depth: node.depth + 1 });
      open.push({ id: ri, rows: R, hs: hsR, G: node.G - GL, H: node.H - HL, depth: node.depth + 1 });
    }
    if (tree.f[0] < 0) break;
    for (let i = 0; i < n; i++) {
      let k = 0;
      while (tree.f[k] >= 0) k = bins[i * d + tree.f[k]] <= splitBin[k] ? tree.l[k] : tree.r[k];
      m[i] += tree.v[k];
    }
    trees.push(tree);
    gains.push(gain);
    let score;
    if (valid && vm) {
      const vx = valid.X;
      for (let i = 0; i < valid.n; i++) {
        let k = 0;
        while (tree.f[k] >= 0) k = vx[i * d + tree.f[k]] <= tree.t[k] ? tree.l[k] : tree.r[k];
        vm[i] += tree.v[k];
      }
      score = logLossOf(vm, valid.y, valid.w);
    } else score = logLossOf(m, y, w);
    curve.push(score);
    if (!valid) bestRounds = trees.length;
    else if (score < best - 1e-7) {
      best = score;
      bestRounds = trees.length;
    } else if (trees.length - bestRounds >= p.patience) break;
    yield;
  }
  const kept = trees.slice(0, bestRounds).map((t) => ({
    f: t.f,
    t: t.t.map((v) => Math.fround(v)),
    l: t.l,
    r: t.r,
    v: t.v.map((v) => Math.round(v * 1e6) / 1e6)
  }));
  const gainByKey = {};
  for (let r = 0; r < bestRounds; r++) gains[r].forEach((gv, j) => gv > 0 && (gainByKey[keys[j]] = (gainByKey[keys[j]] ?? 0) + gv));
  return { ens: { keys: [...keys], trees: kept, gain: gainByKey }, curve, rounds: bestRounds };
}
function validEnsemble(ens, featureKeys) {
  if (!ens || typeof ens !== "object") return false;
  const e = ens;
  if (!Array.isArray(e.keys) || !Array.isArray(e.trees) || e.trees.length > 5e3) return false;
  if (!e.keys.every((k) => typeof k === "string" && featureKeys.includes(k))) return false;
  for (const t of e.trees) {
    if (!t || !Array.isArray(t.f)) return false;
    const n = t.f.length;
    if (n < 1 || n > 1023 || t.t?.length !== n || t.l?.length !== n || t.r?.length !== n || t.v?.length !== n) return false;
    for (let i = 0; i < n; i++) {
      const f2 = t.f[i];
      if (!Number.isInteger(f2) || f2 >= e.keys.length || !Number.isFinite(t.v[i]) || Math.abs(t.v[i]) > 20) return false;
      if (f2 >= 0) {
        if (!Number.isFinite(t.t[i]) || !(t.l[i] > i && t.l[i] < n) || !(t.r[i] > i && t.r[i] < n)) return false;
      }
    }
  }
  return true;
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
function scalePrior(base, rows) {
  const n = rows.length;
  const blend = n / (n + 600);
  const mean = {};
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
    mean[k2] = (1 - blend) * pm + blend * m;
    std[k2] = Math.max((1 - blend) * ps + blend * sd, 0.5 * ps, 1e-6);
  });
  const lin = [];
  for (const r of rows) {
    let s22 = 0;
    FEATURE_KEYS.forEach((k2, j) => {
      s22 += (base.weights[k2] ?? 0) * clamp((r[j] - mean[k2]) / std[k2], -5, 5);
    });
    lin.push(s22);
  }
  const lm = lin.reduce((a, b) => a + b, 0) / lin.length;
  const lsd = Math.sqrt(lin.reduce((a, b) => a + (b - lm) ** 2, 0) / Math.max(1, lin.length - 1));
  const k = lsd > 1e-6 ? clamp(0.85 / lsd, 0.15, 3) : 1;
  const weights = {};
  for (const key of FEATURE_KEYS) weights[key] = (base.weights[key] ?? 0) * k;
  return { mean, std, weights, bias: base.bias - lm * k };
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
  const sc = stage.scale;
  if (sc) return clamp(50 + 25 * (zLogit - sc.at50) / (sc.at75 - sc.at50), 0, 100);
  return clamp(50 + (zLogit - logit(stage.pRef)) * POINTS_PER_LOGIT, 0, 100);
}
function pointsPerLogit(stage) {
  return stage.scale ? 25 / (stage.scale.at75 - stage.scale.at50) : POINTS_PER_LOGIT;
}
var keyMaps = /* @__PURE__ */ new WeakMap();
function treeMap(ens) {
  let m = keyMaps.get(ens);
  if (!m) {
    m = Int32Array.from(ens.keys, (k) => FEATURE_KEYS.indexOf(k));
    keyMaps.set(ens, m);
  }
  return m;
}
function rawLogit(stage, x) {
  const lin = linear(stage, standardize(stage, x));
  return stage.trees?.trees.length ? lin + ensembleMargin(stage.trees, x, treeMap(stage.trees)) : lin;
}
function stageLogit(stage, x) {
  const raw = rawLogit(stage, x);
  return stage.calib ? stage.calib.a + stage.calib.b * raw : raw;
}
function contributionPoints(stage, x, z = standardize(stage, x)) {
  const out = new Float64Array(FEATURE_KEYS.length);
  for (let i = 0; i < out.length; i++) out[i] = (stage.weights[FEATURE_KEYS[i]] ?? 0) * z[i];
  if (stage.trees?.trees.length) ensembleContrib(stage.trees, x, out, treeMap(stage.trees));
  const k = (stage.calib?.b ?? 1) * pointsPerLogit(stage);
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}
function scoreToken(model, f2, explain = true) {
  const stageKey = f2.stage;
  const stage = model.stages[stageKey];
  const x = featureVector(f2);
  const z = standardize(stage, x);
  let raw = linear(stage, z);
  if (stage.trees?.trees.length) raw += ensembleMargin(stage.trees, x, treeMap(stage.trees));
  const pLogit = stage.calib ? stage.calib.a + stage.calib.b * raw : raw;
  const p = sigmoid(pLogit);
  const score = scoreFromLogit(stage, pLogit);
  let contributions = [];
  if (explain) {
    const pts2 = contributionPoints(stage, x, z);
    for (let i = 0; i < FEATURE_DEFS.length; i++) {
      const d = FEATURE_DEFS[i];
      const v = pts2[i];
      if (Math.abs(v) < 0.5) continue;
      contributions.push({ key: d.key, label: d.label, value: d.show(f2), points: v, note: v > 0 ? d.good : d.bad });
    }
    contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    contributions = contributions.slice(0, 10);
  }
  return { score, p, calibrated: !!stage.calib && model.source === "trained", stage: stageKey, contributions };
}
function scoreVector(model, stage, x) {
  const st = model.stages[stage];
  const l = stageLogit(st, x);
  return { score: scoreFromLogit(st, l), p: sigmoid(l) };
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
    if (st.calib && !(Number.isFinite(st.calib.a) && Number.isFinite(st.calib.b))) return false;
    if (st.scale && !(Number.isFinite(st.scale.at50) && Number.isFinite(st.scale.at75) && st.scale.at75 - st.scale.at50 > 1e-3)) return false;
    if (st.trees !== void 0 && !validEnsemble(st.trees, FEATURE_KEYS)) return false;
  }
  return true;
}

// src/core/learn.ts
var SAME_MOMENT_MS = 3e3;
function labelOf(s, target) {
  const gi = GRID.findIndex((g) => g.tp === target.tpPct && g.sl === target.slPct);
  if (gi >= 0 && (s.gv ?? 0) >= GRID_VERSION_MIN && gi < (s.grid?.length ?? 0) && (s.grid?.length ?? 0) >= LEGACY_GRID) {
    if (!comboCounts(s, gi)) return null;
    const r = s.grid[gi];
    return Number.isFinite(r) ? r > 0 ? 1 : 0 : null;
  }
  if (s.blind !== void 0 || s.ov === void 0 && s.stage === "amm") return null;
  if (s.tp === target.tpPct && s.sl === target.slPct && Number.isFinite(s.ret)) return s.ret > 0 ? 1 : 0;
  return null;
}
function trainingRows(samples, target, opts = {}) {
  const d = FEATURE_KEYS.length;
  let cutoff = Infinity;
  if (opts.horizonMs && opts.horizonMs > 0) {
    let last = 0;
    for (const s of samples) if (s.resolvedAt > last) last = s.resolvedAt;
    cutoff = last - opts.horizonMs;
  }
  const list = samples.filter((s) => (s.kind === "checkpoint" || s.kind === "entry") && s.x?.length === d && s.ts <= cutoff).sort((a, b) => a.ts - b.ts);
  const lastKept = /* @__PURE__ */ new Map();
  const out = [];
  for (const s of list) {
    const y = labelOf(s, target);
    if (y === null) continue;
    const prev = lastKept.get(s.mint);
    if (prev !== void 0 && s.ts - prev < SAME_MOMENT_MS) continue;
    lastKept.set(s.mint, s.ts);
    out.push({ ts: s.ts, stage: s.stage, x: s.x, y, mint: s.mint, kind: s.kind === "entry" ? "entry" : "checkpoint" });
  }
  return out;
}
function auc(scores, labels) {
  const idx = Array.from({ length: scores.length }, (_, i2) => i2).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++)
      if (labels[idx[k]] === 1) {
        rankSum += avgRank;
        nPos++;
      }
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}
function* evaluateSteps(stage, rows) {
  return (yield* scoreRowsSteps(stage, rows)).metrics;
}
function* scoreRowsSteps(stage, rows) {
  const n = rows.length;
  const ps = new Float64Array(n);
  const ys = new Uint8Array(n);
  const losses = new Float64Array(n);
  let ll = 0;
  let br = 0;
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const p = clamp(sigmoid(stageLogit(stage, r.x)), 1e-6, 1 - 1e-6);
    ps[i] = p;
    ys[i] = r.y;
    losses[i] = -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    ll += losses[i];
    br += (p - r.y) ** 2;
    pos += r.y;
    if ((i & 2047) === 2047) yield;
  }
  return { metrics: { n, positives: pos, auc: auc(ps, ys), logLoss: n ? ll / n : NaN, brier: n ? br / n : NaN, baseRate: n ? pos / n : NaN }, losses };
}
function evaluate(stage, rows) {
  return runSteps(evaluateSteps(stage, rows));
}
function lossGainZ(a, b, rows) {
  const n = rows.length;
  if (!n) return { gain: NaN, z: 0 };
  const byCoin = /* @__PURE__ */ new Map();
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    total += d;
    const key = rows[i].mint ?? `row:${i}`;
    const c = byCoin.get(key);
    if (c) {
      c.d += d;
      c.n++;
    } else byCoin.set(key, { d, n: 1 });
  }
  const gain = total / n;
  let v = 0;
  for (const c of byCoin.values()) v += (c.d - gain * c.n) ** 2;
  const k = byCoin.size;
  const se = k > 1 ? Math.sqrt(v * (k / (k - 1))) / n : Infinity;
  return { gain, z: se > 0 ? gain / se : gain > 0 ? Infinity : 0 };
}
function choleskyFlat(A, b, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}
function* newtonSteps(Z, n, k, y, w, prior, lambda, maxIter = 30) {
  const d = k + 1;
  let beta = Float64Array.from(prior);
  const objective = (b) => {
    let f2 = 0;
    for (let i = 0; i < n; i++) {
      let s = b[0];
      const o = i * k;
      for (let j = 0; j < k; j++) s += b[j + 1] * Z[o + j];
      const p = clamp(sigmoid(s), 1e-9, 1 - 1e-9);
      f2 -= w[i] * (y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
    }
    for (let j = 1; j < d; j++) f2 += 0.5 * lambda * (b[j] - prior[j]) ** 2;
    f2 += 0.5 * 1e-4 * (b[0] - prior[0]) ** 2;
    return f2;
  };
  let fPrev = objective(beta);
  let converged = false;
  const g = new Float64Array(d);
  const H2 = new Float64Array(d * d);
  for (let iter = 0; iter < maxIter; iter++) {
    g.fill(0);
    H2.fill(0);
    for (let i = 0; i < n; i++) {
      const o = i * k;
      let s = beta[0];
      for (let j = 0; j < k; j++) s += beta[j + 1] * Z[o + j];
      const p = sigmoid(s);
      const r = w[i] * (p - y[i]);
      const v = w[i] * Math.max(p * (1 - p), 1e-9);
      g[0] += r;
      H2[0] += v;
      for (let j = 0; j < k; j++) {
        const zj = Z[o + j];
        g[j + 1] += r * zj;
        H2[j + 1] += v * zj;
        const vz = v * zj;
        const row = (j + 1) * d + 1;
        for (let m = 0; m <= j; m++) H2[row + m] += vz * Z[o + m];
      }
      if ((i & 4095) === 4095) yield;
    }
    for (let j = 1; j < d; j++) {
      g[j] += lambda * (beta[j] - prior[j]);
      H2[j * d + j] += lambda;
      H2[j * d] = H2[j];
      for (let m = 1; m < j; m++) H2[m * d + j] = H2[j * d + m];
    }
    g[0] += 1e-4 * (beta[0] - prior[0]);
    H2[0] += 1e-4;
    const step = choleskyFlat(H2, g, d);
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
    let moved = 0;
    for (let j = 0; j < d; j++) moved = Math.max(moved, Math.abs(step[j] * t));
    beta = next;
    const improvement = fPrev - fNext;
    fPrev = fNext;
    yield;
    if (moved < 1e-7 || improvement < 1e-9) {
      converged = true;
      break;
    }
  }
  return { beta: Array.from(beta), converged };
}
var REDUNDANT = { curve: ["progress", "liquidity", "sinceMig"], amm: ["progress"] };
function* fitStageSteps(base, rows, weights, opts = {}) {
  const lambda = opts.lambda ?? 8;
  const half = opts.standardizeHalfRows ?? 400;
  const n = rows.length;
  const d = FEATURE_KEYS.length;
  const blend = n / (n + half);
  let sw = 0;
  for (let i = 0; i < n; i++) sw += weights[i];
  const mean = {};
  const std = {};
  for (let j = 0; j < d; j++) {
    const k = FEATURE_KEYS[j];
    let m = 0;
    for (let i = 0; i < n; i++) m += weights[i] * rows[i].x[j];
    m /= sw || 1;
    let v = 0;
    for (let i = 0; i < n; i++) v += weights[i] * (rows[i].x[j] - m) ** 2;
    v /= sw || 1;
    const pm = base.mean[k] ?? 0;
    const ps = base.std[k] ?? 1;
    mean[k] = (1 - blend) * pm + blend * m;
    const sd = (1 - blend) * ps + blend * Math.sqrt(v);
    std[k] = sd > 1e-6 ? sd : ps;
    if ((j & 3) === 3) yield;
  }
  const shape = { pRef: base.pRef, bias: 0, weights: {}, mean, std };
  const zero = new Set(opts.zero ?? []);
  const prior = [base.bias];
  FEATURE_KEYS.forEach((k) => prior.push(zero.has(k) ? 0 : (base.weights[k] ?? 0) * ((std[k] ?? 1) / (base.std[k] ?? 1))));
  let pos = 0;
  for (let i = 0; i < n; i++) pos += weights[i] * rows[i].y;
  const baseRate = clamp(sw > 0 ? pos / sw : base.pRef, 5e-3, 0.95);
  prior[0] = logit(baseRate);
  const Z = new Float64Array(n * d);
  const y = new Uint8Array(n);
  const zeroAt = FEATURE_KEYS.flatMap((k, j) => zero.has(k) ? [j] : []);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    Z.set(standardize(shape, r.x), i * d);
    for (const j of zeroAt) Z[i * d + j] = 0;
    y[i] = r.y;
    if ((i & 4095) === 4095) yield;
  }
  yield;
  const { beta } = yield* newtonSteps(Z, n, d, y, weights, prior, lambda);
  const out = {};
  FEATURE_KEYS.forEach((k, j) => out[k] = clamp(beta[j + 1], -10, 10));
  return { pRef: baseRate, bias: beta[0], weights: out, mean, std };
}
function* calibrateSteps(stage, rows) {
  if (rows.length < 50) return stage;
  const plain = { ...stage, calib: void 0 };
  const z = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    z[i] = rawLogit(plain, rows[i].x);
    if ((i & 2047) === 2047) yield;
  }
  const { beta } = yield* newtonSteps(
    z,
    rows.length,
    1,
    rows.map((r) => r.y),
    rows.map((r) => r.w ?? 1),
    [0, 1],
    0.5
  );
  if (!(beta[1] > 0.05)) return stage;
  return { ...stage, calib: { a: beta[0], b: beta[1] } };
}
var TRAIN_DEFAULTS = {
  minRows: 300,
  minPositives: 25,
  halfLifeDays: 3,
  trees: true,
  treesMinRows: 2e3,
  minFreshRows: 200,
  minFreshPositives: 10,
  treesZ: 1.65,
  replaceZ: 1.5,
  replaceMinGain: 1e-3
};
var EMPTY = { n: 0, positives: 0, auc: NaN, logLoss: NaN, brier: NaN, baseRate: NaN };
function* boostDataSteps(rows, w, lin) {
  const n = rows.length;
  const d = FEATURE_KEYS.length;
  const X = new Float32Array(n * d);
  const y = new Uint8Array(n);
  const wf = new Float32Array(n);
  const base = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    for (let j = 0; j < d; j++) X[i * d + j] = r.x[j];
    y[i] = r.y;
    wf[i] = w[i];
    base[i] = linear(lin, standardize(lin, r.x));
    if ((i & 4095) === 4095) yield;
  }
  return { n, d, X, y, w: wf, base };
}
function* scaleSteps(stage, rows) {
  const pop = rows.filter((r) => r.kind !== "entry");
  const use = pop.length >= 100 ? pop : rows;
  const L = new Float64Array(use.length);
  for (let i = 0; i < use.length; i++) {
    L[i] = stageLogit(stage, use[i].x);
    if ((i & 2047) === 2047) yield;
  }
  L.sort();
  const q = (f2) => L[Math.min(L.length - 1, Math.round(f2 * (L.length - 1)))];
  const at50 = q(0.5);
  const at75 = q(0.95);
  return use.length >= 50 && at75 - at50 > 0.05 ? { at50, at75 } : void 0;
}
function populationRate(rows, w) {
  let pos = 0;
  let sw = 0;
  rows.forEach((r, i) => {
    if (r.kind === "entry") return;
    pos += w[i] * r.y;
    sw += w[i];
  });
  let count = 0;
  for (const r of rows) if (r.kind !== "entry") count++;
  return count >= 100 && sw > 0 ? clamp(pos / sw, 5e-3, 0.95) : null;
}
function* stageSteps(stageKey, cur, seenTo, input, o) {
  const n = input.length;
  const coinIds = /* @__PURE__ */ new Map();
  const coin = new Int32Array(n);
  input.forEach((r, i) => {
    const k = r.mint ?? `row:${i}`;
    let id = coinIds.get(k);
    if (id === void 0) coinIds.set(k, id = coinIds.size);
    coin[i] = id;
  });
  const first = new Float64Array(coinIds.size).fill(Infinity);
  input.forEach((r, i) => {
    if (r.ts < first[coin[i]]) first[coin[i]] = r.ts;
  });
  yield;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => first[coin[a]] - first[coin[b]] || coin[a] - coin[b] || input[a].ts - input[b].ts);
  yield;
  const sr = order.map((i) => input[i]);
  const keys = order.map((i) => coin[i]);
  const cutAt = (frac, hi) => {
    let c = Math.floor(hi * frac);
    while (c > 0 && c < hi && keys[c] === keys[c - 1]) c++;
    return c;
  };
  const cut = cutAt(0.75, n);
  const train = sr.slice(0, cut);
  const val = sr.slice(cut);
  const cutA = cutAt(0.8, cut);
  const partA = sr.slice(0, cutA);
  const partB = sr.slice(cutA, cut);
  const pos = sr.reduce((s, r) => s + r.y, 0);
  const entries = sr.filter((r) => r.kind === "entry").length;
  const rows = { total: n, entries };
  const base = { stage: stageKey, trainRows: train.length, valRows: val.length, entryRows: entries };
  if (n < o.minRows || pos < o.minPositives || val.length < 50 || partB.length < 30) {
    return {
      rows,
      report: {
        ...base,
        adopted: false,
        reason: `need \u2265${o.minRows} resolved moments with \u2265${o.minPositives} wins (have ${n}/${pos})`,
        freshRows: 0,
        current: val.length ? yield* evaluateSteps(cur, val) : EMPTY,
        candidate: EMPTY
      }
    };
  }
  const halfMs = o.halfLifeDays > 0 ? o.halfLifeDays * 864e5 : 0;
  const weigh = (list) => {
    let tMax = -Infinity;
    for (const r of list) if (r.ts > tMax) tMax = r.ts;
    return list.map((r) => (r.w ?? 1) * (halfMs ? Math.pow(0.5, (tMax - r.ts) / halfMs) : 1));
  };
  const fit = { ...o, zero: REDUNDANT[stageKey] };
  const boost = { ...o.boost, skip: REDUNDANT[stageKey].map((k) => FEATURE_KEYS.indexOf(k)) };
  const wA = weigh(partA);
  const lin = yield* fitStageSteps(cur, partA, wA, fit);
  const L = o.calibrate === false ? lin : yield* calibrateSteps(lin, partB);
  const sL = yield* scoreRowsSteps(L, val);
  const mL = sL.metrics;
  let H2 = null;
  let mH = null;
  let treesZ = 0;
  let treeCount = 0;
  if (o.trees && partA.length >= o.treesMinRows && partB.reduce((s, r) => s + r.y, 0) >= 10) {
    const dataA = yield* boostDataSteps(partA, wA, lin);
    const dataB = yield* boostDataSteps(partB, new Float32Array(partB.length).fill(1), lin);
    const res = yield* boostSteps(dataA, dataB, FEATURE_KEYS, boost);
    if (res.ens.trees.length) {
      const withTrees = { ...lin, trees: res.ens };
      H2 = o.calibrate === false ? withTrees : yield* calibrateSteps(withTrees, partB);
      const sH = yield* scoreRowsSteps(H2, val);
      mH = sH.metrics;
      treesZ = lossGainZ(sL.losses, sH.losses, val).z;
      treeCount = res.ens.trees.length;
    }
  }
  const treesWin = !!(H2 && mH && treesZ >= o.treesZ && !(mH.auc < mL.auc - 3e-3));
  const cand = treesWin ? H2 : L;
  const recipe = treesWin ? "trees" : "linear";
  const fresh = val.filter((r) => r.ts > seenTo);
  const freshPos = fresh.reduce((s, r) => s + r.y, 0);
  const common = { ...base, freshRows: fresh.length, recipe, linear: mL, trees: mH ?? void 0, treeCount: treesWin ? treeCount : 0, treesZ: H2 ? treesZ : void 0 };
  if (fresh.length < o.minFreshRows || freshPos < o.minFreshPositives) {
    return {
      rows,
      report: {
        ...common,
        adopted: false,
        reason: `waiting for newer coins that neither model has seen (${fresh.length}/${o.minFreshRows} moments, ${freshPos}/${o.minFreshPositives} wins)`,
        current: yield* evaluateSteps(cur, fresh),
        candidate: yield* evaluateSteps(cand, fresh)
      }
    };
  }
  const sCur = yield* scoreRowsSteps(cur, fresh);
  const sCand = yield* scoreRowsSteps(cand, fresh);
  const mCur = sCur.metrics;
  const mCand = sCand.metrics;
  const gain = lossGainZ(sCur.losses, sCand.losses, fresh);
  const better = Number.isFinite(mCand.logLoss) && gain.gain > o.replaceMinGain && gain.z >= o.replaceZ && (!Number.isFinite(mCur.auc) || !Number.isFinite(mCand.auc) || mCand.auc >= mCur.auc - 5e-3);
  const what = treesWin ? `weighted sum + ${treeCount} trees` : "weighted sum";
  const report = {
    ...common,
    replaceZ: gain.z,
    adopted: better,
    reason: better ? `the new model (${what}) predicted ${fresh.length.toLocaleString("en-US")} newer moments better than the current one; neither had seen them` : `the current model still predicts newer moments (${fresh.length.toLocaleString("en-US")}) at least as well`,
    current: mCur,
    candidate: mCand
  };
  if (!better) return { rows, report };
  const wAll = weigh(sr);
  const linAll = yield* fitStageSteps(cur, sr, wAll, fit);
  let deploy = linAll;
  if (treesWin) {
    const res = yield* boostSteps(yield* boostDataSteps(sr, wAll, linAll), null, FEATURE_KEYS, { ...boost, rounds: treeCount });
    if (res.ens.trees.length) deploy = { ...deploy, trees: res.ens };
  }
  if (cand.calib) deploy = { ...deploy, calib: cand.calib };
  deploy.pRef = populationRate(sr, wAll) ?? deploy.pRef;
  deploy.scale = yield* scaleSteps(deploy, sr);
  deploy.trainedTo = sr.reduce((m, r) => Math.max(m, r.ts), 0);
  return { rows, report, deploy };
}
function* trainSteps(current, rows, opts = {}) {
  const o = { ...TRAIN_DEFAULTS, ...opts };
  const reports = [];
  let next = JSON.parse(JSON.stringify(current));
  const insight = {
    recipe: { ...current.insight?.recipe ?? {} },
    trees: { ...current.insight?.trees ?? {} },
    rows: { ...current.insight?.rows ?? {} },
    auc: { ...current.insight?.auc ?? {} }
  };
  let adoptedAny = false;
  for (const stageKey of ["curve", "amm"]) {
    const cur = current.stages[stageKey];
    const seenTo = cur.trainedTo ?? (current.source === "trained" ? current.training?.to ?? -Infinity : -Infinity);
    const res = yield* stageSteps(
      stageKey,
      cur,
      seenTo,
      rows.filter((r) => r.stage === stageKey),
      o
    );
    reports.push(res.report);
    if (res.deploy) {
      next.stages[stageKey] = res.deploy;
      insight.recipe[stageKey] = res.report.recipe;
      insight.trees[stageKey] = res.deploy.trees?.trees.length ?? 0;
      insight.rows[stageKey] = res.rows;
      insight.auc[stageKey] = res.report.candidate.auc;
      adoptedAny = true;
    }
  }
  if (adoptedAny) {
    const now = o.now ?? Date.now();
    const won = reports.find((r) => r.adopted);
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
        valAuc: won?.candidate.auc,
        valLogLoss: won?.candidate.logLoss,
        priorValAuc: won?.current.auc,
        priorValLogLoss: won?.current.logLoss
      },
      insight
    };
  }
  return { model: next, reports };
}
function trainAndSelect(current, rows, opts = {}) {
  return runSteps(trainSteps(current, rows, opts));
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
  autopilot_hold: "Autopilot: no rule is proven enough for real money yet \u2014 new live entries wait (open positions are still managed)",
  stage_off: "This stage is turned off in settings",
  non_sol_quote: "Coin is not paired with SOL",
  pool_drained: "Its pool has been drained \u2014 the quoted price cannot be sold into",
  not_launched_here: "The bot never saw this coin launch \u2014 it may not be a pump.fun coin at all",
  already_traded: "Already traded this coin (re-entry off)",
  max_open: "Max open positions reached",
  pending: "An order for this coin is already in flight",
  daily_loss_limit: "Daily loss limit reached",
  rate_limit: "Max trades per hour reached",
  feed_down: "Live data feed is down \u2014 not trading blind",
  warming_up: "Learning this market's score scale (first minutes after install)",
  insufficient_balance: "Not enough SOL \u2014 paper: Trades tab \u2192 Add paper SOL; live: fund the wallet",
  slippage: "Price moved more than your slippage before the buy landed",
  migrating: "Coin is migrating to PumpSwap (not tradable for a moment)",
  rule_conditions: "Does not meet the conditions of the rule in use",
  not_followed: "Its price is not followed right now (more graduated coins than the bot can follow at once) \u2014 not buying at an old price",
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
var MIN_QUOTE_LIQ_SOL = 1;
function quoteLiquiditySol(ev) {
  if (ev.liqUsd === void 0 || !ev.priceUsd || !ev.priceSol) return null;
  return ev.liqUsd * ev.priceSol / ev.priceUsd;
}
function quoteTradable(ev) {
  const liq = quoteLiquiditySol(ev);
  return liq === null || liq >= MIN_QUOTE_LIQ_SOL;
}
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
  /** the newest off-chain quote had no pool behind it to sell into, so its price was not used */
  quoteUntradable = false;
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
    this.quoteUntradable = !quoteTradable(ev);
    if (ev.priceSol && ev.priceSol > 0 && this.tradeCount === 0 && !this.quoteUntradable) {
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
  feedOutageMs: 6e4,
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
var SAMPLED_POOLS = 12;
var NEWEST_KEPT = 10;
function mintHash(mint) {
  let h = 2166136261;
  for (let i = 0; i < mint.length; i++) {
    h ^= mint.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
var POOL_WAIT_MS = 6e4;
var ENTRY_LEAD_SEC = 600;
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
  /** the autopilot holds new entries (real money, no rule proven at the go-live bar); exits go on */
  autoHold = null;
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
      equity: [{ t: opts.now, v: this.paperBalance }],
      deposits: 0
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
            if (t.tradeCount === 0 && t.quoteUntradable) this.outcomes.blindMint(t.mint, ts);
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
    if (ev.venue === "amm" && ev.pool) this.stalePools.delete(ev.pool);
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
      e = { res, f: f2, x, at: now, above: 0, armed: true, lastFunnelAt: 0, reached: 0, held: new Uint8Array(ENTRY_LEVELS.length), cps: [] };
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
  /**
   * Fixed points in a coin's life (an age, a share of the curve, a time after graduation):
   * each is followed once per coin as a would-be entry, with the facts the filters see, and
   * is the entry itself when the settings trade at that point.
   */
  checkpoints(t, e, now) {
    const custom = { tp: this.settings.tpPct, sl: this.settings.slPct };
    const add = (tag, kind = "checkpoint") => {
      if (e.cps.includes(tag)) return;
      e.cps.push(tag);
      this.outcomes.add(t, kind, tag, now, e.res.score, e.res.p, e.x, custom, entryFacts(t, e.f));
      if (this.settings.entryAt === tag) this.fire(t, e, now, true);
    };
    const own = this.ownMoments();
    if (t.stage === "curve") {
      const age = (now - t.createdAt) / 1e3;
      if (t.partial) return;
      let tag = null;
      for (const s of this.cfg.checkpointsCurveSec) if (age >= s && age < s * 1.6) tag = `age${s}`;
      if (tag) add(tag);
      for (const p of this.cfg.checkpointsProgress) if (t.progress >= p && t.progress < p + 0.1) add(`prog${Math.round(p * 100)}`);
      for (const m of own) if (m.kind === "age" && age >= m.sec && age < m.sec * 1.6) add(m.tag, "moment");
    } else if (t.stage === "amm" && t.migrateAt) {
      const since = (now - t.migrateAt) / 1e3;
      for (const s of this.cfg.checkpointsAmmSec) if (since >= s && since < s * 1.6) add(`mig${s}`);
      for (const m of own) if (m.kind === "mig" && since >= m.sec && since < m.sec * 1.6) add(m.tag, "moment");
    }
  }
  momentsOf = null;
  moments = [];
  /** Moments of your own to record (Settings.moments, and the rule's entry if it is one), parsed once per settings. */
  ownMoments() {
    const s = this.settings;
    if (this.momentsOf !== s) {
      this.momentsOf = s;
      const tags = /* @__PURE__ */ new Set([...s.moments, s.entryAt]);
      this.moments = [...tags].flatMap((tag) => {
        const c = customMoment(tag);
        return c ? [{ tag, ...c }] : [];
      });
    }
    return this.moments;
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
    if (s.entryAt !== "score") return;
    const score = e.res.score;
    if (score >= s.minScore) e.above++;
    else {
      e.above = 0;
      if (s.reentry && score < s.minScore - 5) e.armed = true;
    }
    if (!e.armed || e.above < s.confirmTicks) return;
    e.armed = false;
    this.fire(t, e, now, false);
  }
  /** A signal: recorded, checked against every limit and filter, and entered if nothing blocks it. */
  fire(t, e, now, structural) {
    const s = this.settings;
    const score = e.res.score;
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
    const blocked = this.entryBlock(t, e, structural);
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
  entryBlock(t, e, structural = false) {
    const s = this.settings;
    if (!s.enabled) return "bot_off";
    if (this.killed) return "kill_switch";
    if (this.autoHold) return "autopilot_hold";
    if (t.nonSol) return "non_sol_quote";
    if (t.partial) return "not_launched_here";
    if (t.tradeCount === 0 && t.quoteUntradable) return "pool_drained";
    if (t.stage === "curve" && !s.tradeCurve || t.stage === "amm" && !s.tradeAmm) return "stage_off";
    if (t.stage === "migrating") return "migrating";
    if (s.conds.length && !condsHold(s.conds, e.x)) return "rule_conditions";
    if (t.stage === "amm" && this.followedPools && !(t.pool && this.followedPools.has(t.pool) && !this.stalePools.has(t.pool))) return "not_followed";
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
    if (!structural && !this.modelReady()) return "warming_up";
    if (s.mode === "live") {
      if (!this.executor || !this.executor.ready()) return "live_disabled";
    } else if (this.paperBalance < s.positionSol * LAMPORTS_PER_SOL) return "insufficient_balance";
    if (s.scoreOnly) return null;
    const raw = e.f;
    return filterBlock(s.filters, {
      mcap: t.mcapSol,
      age: raw.ageSec,
      buyers: raw.uniqTotal,
      top10: raw.top10,
      bundle: raw.bundleShare,
      devShare: raw.devShare,
      devSold: raw.devSold,
      socials: raw.socials,
      launches24h: raw.creatorLaunches24h
    });
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
  /** The last message from any trade feed the bot relies on. */
  feedLastMsgAt() {
    return Math.max(0, ...[...this.feeds.values()].filter((f2) => f2.critical && f2.status !== "off").map((f2) => f2.lastMsgAt));
  }
  /** Down and silent for `feedOutageMs` or more: an outage, not a reconnect of a few seconds. */
  feedOutage() {
    return this.feedDown() && this.now - this.feedLastMsgAt() >= this.cfg.feedOutageMs;
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
      rule: ruleKey(s),
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
    this.stats.equity.push({ t: ts, v: this.paperBalance - this.stats.deposits });
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
  /**
   * Apply a settings change. `by`: who made it. A rule you pick by hand with the autopilot on
   * leaves it on: your rule then competes with the proven ones (the learner is told, onSettings).
   */
  updateSettings(patch, by = "user") {
    const prev = this.settings;
    const next = sanitizeSettings(patch, prev);
    if (by === "user" && prev.autopilot && next.autopilot && ruleChanged(prev, next)) this.journal({ type: "rule_picked", rule: ruleKey(next) });
    if (!next.autopilot) this.autoHold = null;
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
    this.hooks.onSettings?.(next, { by, prev });
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
      this.model.stages[stage] = { ...cur, ...scalePrior(base, rows), pRef: base.pRef };
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
    if (this.feedOutage()) this.outcomes.blindAll(this.feedLastMsgAt());
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
  /** The bot is stopping: open recordings are written as watched up to now instead of being lost (OutcomeTracker.endAll). */
  endRecordings() {
    this.outcomes.endAll(this.now);
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
  /** PumpSwap pools the stream follows one by one (poolsToFollow); null while every swap reaches us (whole stream, simulator). */
  followedPools = null;
  /** pools followed again after a gap: their price is old until a swap arrives */
  stalePools = /* @__PURE__ */ new Set();
  /**
   * PumpSwap pools whose swaps must reach us: coins we hold first, then coins the rule is about
   * to buy (when it buys at a time after graduating), then graduated coins whose would-be trades
   * are still being followed, newest first, `max` in all. The graduated coins left out stop being
   * observed from now on: their would-be trades are marked (outcomes blindMint), so a stop that
   * nobody saw is not counted as a trade that held its value, and they are not bought (entryBlock
   * "not_followed"): their last price may be long gone. A coin followed again after such a gap
   * is not bought before a swap has brought its price up to date.
   * Called only when pools are followed one by one (not with the whole PumpSwap stream).
   */
  poolsToFollow(max = 40) {
    const out = /* @__PURE__ */ new Set();
    for (const p of this.positions.values()) {
      const pool = this.tokens.get(p.mint)?.pool;
      if (pool) out.add(pool);
    }
    const buyAt = this.ruleBuysAfterGraduating();
    const followed = [];
    for (const mint of this.outcomes.openMints()) {
      const t = this.tokens.get(mint);
      if (t?.stage !== "amm" || t.pool && out.has(t.pool)) continue;
      const since = t.migrateAt ? (this.now - t.migrateAt) / 1e3 : -1;
      const soon = !!buyAt && since >= buyAt.sec - ENTRY_LEAD_SEC && since < buyAt.sec * 1.6 && !this.scores.get(mint)?.cps.includes(buyAt.tag);
      followed.push({ mint, pool: t.pool, at: t.migrateAt ?? 0, soon });
    }
    followed.sort((a, b) => Number(b.soon) - Number(a.soon) || b.at - a.at);
    const reserved = Math.min(SAMPLED_POOLS, Math.floor(max / 3));
    if (reserved > 0) {
      const older = followed.filter((f2) => f2.pool && !f2.soon).slice(NEWEST_KEPT);
      older.sort((a, b) => mintHash(a.mint) - mintHash(b.mint));
      for (const f2 of older.slice(0, reserved)) if (out.size < max) out.add(f2.pool);
    }
    for (const f2 of followed) {
      if (f2.pool && out.size < max) out.add(f2.pool);
      else if (f2.pool && out.has(f2.pool)) continue;
      else if (!f2.pool && this.now - f2.at < POOL_WAIT_MS) continue;
      else this.outcomes.blindMint(f2.mint, f2.pool || !f2.at ? this.now : f2.at);
    }
    for (const pool of out) {
      if (this.followedPools?.has(pool)) continue;
      const t = this.tokens.get(this.pools.get(pool) ?? "");
      if (t?.migrateAt && this.now - t.migrateAt > POOL_WAIT_MS) this.stalePools.add(pool);
    }
    for (const pool of this.stalePools) if (!out.has(pool)) this.stalePools.delete(pool);
    this.followedPools = out;
    return [...out];
  }
  /** The moment after graduating at which the settings buy (entryAt mig…), if they trade graduated coins that way. */
  ruleBuysAfterGraduating() {
    const m = /^mig(\d+)$/.exec(this.settings.entryAt);
    return m && this.settings.tradeAmm ? { tag: this.settings.entryAt, sec: Number(m[1]) } : null;
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
    if (s.settings && typeof s.settings === "object" && !("autopilot" in s.settings) && this.settings.mode === "live") this.settings.autopilot = false;
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
  /**
   * Adds paper money (the paper balance ran low). History stays; the amount is booked as a
   * deposit, so results and win rates are unchanged and it never shows up as profit.
   */
  addPaperMoney(sol) {
    const lamports = Math.round(sol * LAMPORTS_PER_SOL);
    if (!(lamports > 0)) return this.paperBalance;
    this.paperBalance += lamports;
    this.stats.deposits += lamports;
    this.journal({ type: "paper_deposit", sol, balance: this.paperBalance });
    this.markDirty();
    return this.paperBalance;
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
      deposits: this.stats.deposits,
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

// src/core/lab.ts
var DAY = 864e5;
var NF = FEATURE_KEYS.length;
var H = HOLDS_MIN.length;
var LAB = {
  /** ideas from the search tested at once */
  maxActive: 20,
  /** your own ideas tested at once */
  mineMax: 5,
  /** new ideas from one search at most, one per entry */
  newPerRun: 3,
  /** finished coins at which an idea is looked at; it can be proven only at these */
  looks: [60, 120, 240, 480],
  /** one-sided error per look: an idea without an edge passes a look by luck at most this often */
  alpha: 5e-4,
  /** a proof resting on a handful of lucky wins is not trusted */
  minWins: 10,
  /** an idea not proven after this long leaves */
  maxAgeMs: 7 * DAY,
  /** a proven idea leaves after this long, and has to be found and proven again */
  provenMs: 14 * DAY,
  /** coins after its proof before a proven idea can be dropped for falling short */
  postMin: 40,
  /** the search: fewest trades a rule needs on the data it is invented from */
  minSeen: 60,
  /** the search needs this much finished data */
  minHours: 24,
  minRows: 1e3,
  /** candidate thresholds: these shares of each fact's values at each entry */
  quantiles: [0.1, 0.25, 0.5, 0.75, 0.9],
  /** thresholds per entry that get every exit after the first look (on SCREEN exits) */
  screenTop: 16,
  /** single conditions per entry carried into pairs */
  pairTop: 8,
  /** a failed idea is not suggested again for this long */
  retryAfterMs: 3 * DAY,
  /** retired ideas kept to show */
  keepRetired: 30,
  /** results kept per idea (oldest dropped beyond) */
  keepVals: 3e3
};
var sig2 = (v) => v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(2));
var signedPct = (x) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
var pctFact = (key, label) => ({ key, label, raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 100) / 100, show: (r) => `${Math.round(r * 100)}%`, pct: true });
var countFact = (key, label) => ({ key, label, raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: (r) => r >= 10 ? sig2(r) : Math.round(r), show: (r) => `${Math.round(r)}` });
var solFact = (key, label) => ({ key, label, raw: Math.sinh, x: Math.asinh, nice: sig2, show: (r) => `${r} SOL` });
var moveFact = (key, label) => ({ key, label, raw: (x) => Math.exp(x) - 1, x: (r) => Math.max(-2, Math.min(2, Math.log(1 + Math.max(-0.99, r)))), nice: (r) => Math.round(r * 100) / 100, show: signedPct, pct: true });
var yesNoFact = (key, label) => ({ key, label, raw: (x) => x, x: (r) => r, nice: (r) => r >= 0.5 ? 1 : 0, show: (r) => r >= 0.5 ? "yes" : "no", yesNo: true });
var LAB_FACTS = [
  { key: "age", label: "Age", raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: (r) => r < 90 ? Math.round(r / 5) * 5 : r < 5400 ? Math.round(r / 60) * 60 : Math.round(r / 600) * 600, show: fmtAge },
  { key: "mcap", label: "Market cap", raw: Math.exp, x: (r) => Math.log(Math.max(r, 1)), nice: sig2, show: (r) => `${r} SOL` },
  pctFact("progress", "Curve progress"),
  solFact("net60", "Net inflow 60s"),
  solFact("net300", "Net inflow 5m"),
  { key: "accel", label: "Acceleration", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 10) / 10, show: (r) => r.toFixed(1) },
  pctFact("buyRatio", "Buy share 60s"),
  countFact("uniq60", "New buyers 60s"),
  countFact("uniqTotal", "Buyers total"),
  countFact("trades60", "Trades 60s"),
  { key: "avgBuy", label: "Avg buy 5m", raw: (x) => Math.exp(x) - 0.01, x: (r) => Math.log(0.01 + Math.max(0, r)), nice: sig2, show: (r) => `${r} SOL` },
  pctFact("whale", "Largest buy share"),
  pctFact("devShare", "Dev holds"),
  pctFact("devSold", "Dev sold"),
  pctFact("bundle", "Bundled supply"),
  pctFact("early", "Sniper supply"),
  pctFact("top10", "Top 10 holders"),
  countFact("holders", "Holders"),
  pctFact("drawdown", "Below peak"),
  moveFact("chg30", "Move 30s"),
  moveFact("chg120", "Move 2m"),
  countFact("smart", "Smart wallets in"),
  pctFact("fresh", "Fresh wallets"),
  { key: "socials", label: "Socials", raw: (x) => x * 3, x: (r) => r / 3, nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} of 3` },
  yesNoFact("tweet", "Tweet-linked"),
  { key: "cluster", label: "Narrative heat", raw: Math.exp, x: (r) => Math.log(Math.max(1, r)), nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} similar coins` },
  yesNoFact("leader", "Narrative leader"),
  yesNoFact("copycat", "Copycat"),
  { key: "serial", label: "Dev launches in 24 h", raw: (x) => Math.expm1(x) + 1, x: (r) => Math.log1p(Math.max(0, r - 1)), nice: (r) => Math.round(r), show: (r) => `${Math.round(r)}` },
  { key: "creatorBest", label: "Dev's best coin", raw: (x) => Math.expm1(x) * 100, x: (r) => Math.log1p(Math.max(0, r) / 100), nice: sig2, show: (r) => `${r} SOL` },
  { key: "heat", label: "Market heat", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r * 100) / 100, show: (r) => r.toFixed(2) },
  { key: "liquidity", label: "Liquidity", raw: Math.expm1, x: (r) => Math.log1p(Math.max(0, r)), nice: sig2, show: (r) => `${r} SOL` },
  { key: "dex", label: "DEX listing paid", raw: (x) => x, x: (r) => r, nice: (r) => Math.round(r), show: (r) => `${Math.round(r)} of 2` }
];
var FACT = new Map(LAB_FACTS.map((f2) => [f2.key, f2]));
var FACT_INDEX = LAB_FACTS.map((f2) => FEATURE_KEYS.indexOf(f2.key));
function describeCond(c) {
  const f2 = FACT.get(c.k);
  if (!f2) return c.k;
  const raw = f2.raw(c.v);
  if (f2.yesNo) return c.op === ">=" ? f2.label.toLowerCase() : `not ${f2.label.toLowerCase()}`;
  return `${f2.label.toLowerCase()} ${c.op === ">=" ? "\u2265" : "\u2264"} ${f2.show(raw)}`;
}
var GRID_TPS = [...new Set(GRID.map((g) => g.tp))];
var GRID_SLS = [...new Set(GRID.map((g) => g.sl))];
var LAB_FORMAT = `entry, then up to 3 conditions, then the exit \u2014 e.g. "mig300 top10<=25% smart>=1 tp100 sl30 hold30". Entry: score50\u2026score95 (the first time the score reaches it) or ${Object.keys(ENTRY_POINTS).join(", ")}. Optional: stage=curve or stage=amm. Conditions on: ${LAB_FACTS.map((f2) => f2.key).join(", ")} (with >= or <=; % for shares; =1 / =0 for yes/no). Take profit tp: ${GRID_TPS.join(", ")}; stop loss sl: ${GRID_SLS.join(", ")}; time limit hold (minutes): ${HOLDS_MIN.filter((h) => h > 0).join(", ")}, or none.`;
var STRICT = 1 - 2 * LAB.alpha;
var SCREEN = [
  [25, 10, 0],
  [50, 20, 0],
  [50, 20, 10],
  [100, 30, 0],
  [100, 30, 30],
  [100, 50, 0],
  [200, 50, 0],
  [150, 40, 60],
  [300, 70, 0],
  [500, 50, 0]
].map(([tp, sl, hold]) => GRID.findIndex((g) => g.tp === tp && g.sl === sl) * H + HOLDS_MIN.indexOf(hold)).filter((e) => e >= 0);

// src/core/presets.ts
var BASE = { entryAt: "score", conds: [], trailPct: 0, takeInitials: false, reentry: false, tradeCurve: true, tradeAmm: true, scoreOnly: true };
var PRESETS = [
  {
    key: "plan",
    name: "Your plan",
    note: "Buy when a coin reaches 75 \xB7 sell at 2\xD7 or \u221250% \xB7 time limit 4 hours. Score only.",
    proof: "yours",
    settings: { ...BASE, minScore: 75, tpPct: 100, slPct: 50, maxHoldMin: 240 }
  },
  {
    key: "sim-momentum",
    name: "Simulator finding: fast momentum",
    note: "Buy when a coin reaches 95 \xB7 sell at +500% or \u221220%, or after 10 minutes. It won in the simulator, which has more momentum than pump.fun \u2014 paper-test it before trusting it.",
    proof: "unproven",
    settings: { ...BASE, minScore: 95, tpPct: 500, slPct: 20, maxHoldMin: 10 }
  }
];
function ruleSummary(s) {
  const time = s.maxHoldMin > 0 ? s.maxHoldMin >= 120 && s.maxHoldMin % 60 === 0 ? `${s.maxHoldMin / 60} h` : `${s.maxHoldMin} min` : "no time limit";
  const entry = s.entryAt && s.entryAt !== "score" ? entryLabel(s.entryAt) : `score \u2265 ${s.minScore}`;
  const when = s.conds?.length ? ` \xB7 ${s.conds.map(describeCond).join(", ")}` : "";
  return `${entry}${when} \xB7 +${s.tpPct}% / \u2212${s.slPct}% \xB7 ${time}`;
}

// src/core/selfcheck.ts
var HOUR2 = 36e5;
var DAY2 = 24 * HOUR2;
var SELFCHECK = {
  /** trades compared, recorded vs real */
  windowMs: 7 * DAY2,
  /** pairs before the comparison is judged */
  minPairs: 20,
  /** recordings better than real trades by more than this (per trade, at the low end of the range) → warn */
  gap: 0.05,
  /** rule switches a day before the autopilot looks like it chases noise */
  maxSwitches: 4,
  /** a promise above this per trade is extraordinary for a real market */
  extraordinary: 0.3
};
var pct2 = (x, d = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
var pts = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} points`;
function recordedReturn(s, p) {
  const { tpPct, slPct, maxHoldMin } = p.plan;
  const gi = GRID.findIndex((g) => g.tp === tpPct && g.sl === slPct);
  if (gi < 0 || s.grid?.length !== GRID.length || !s.gridT) return void 0;
  const t = s.gridT[gi];
  if (maxHoldMin > 0 && t > maxHoldMin * 60) {
    const k = PATH_MIN.indexOf(maxHoldMin);
    const v = k >= 0 ? s.path?.[k] : void 0;
    return v !== void 0 && v !== null && seenAt(s, maxHoldMin * 60) ? v : void 0;
  }
  return comboObserved(s, gi) ? s.grid[gi] : void 0;
}
function pairTrades(closed, samples, from) {
  const signals = /* @__PURE__ */ new Map();
  for (const s of samples) {
    if (s.kind !== "signal") continue;
    let l = signals.get(s.mint);
    if (!l) signals.set(s.mint, l = []);
    l.push(s);
  }
  const out = [];
  for (const p of closed) {
    if (p.status !== "closed" || (p.closedAt ?? 0) < from || !Number.isFinite(p.pnlPct)) continue;
    if (!["tp", "sl", "time"].includes(p.exitReason ?? "") || p.plan.trailPct > 0 || p.plan.takeInitials) continue;
    const s = signals.get(p.mint)?.find((x) => x.ts >= p.signalAt && x.ts - p.signalAt <= 12e4);
    if (!s) continue;
    const rec = recordedReturn(s, p);
    if (rec === void 0) continue;
    out.push({ rec, real: (p.pnlPct ?? 0) / 100, hour: hourOf(p.openedAt) });
  }
  return out;
}
function recordedVsReal(closed, samples, now) {
  const title = "Recordings match real trades";
  const from = now - SELFCHECK.windowMs;
  const pairs = pairTrades(closed, samples, from);
  if (pairs.length < SELFCHECK.minPairs) {
    const done = closed.filter((p) => p.status === "closed" && (p.closedAt ?? 0) >= from).length;
    return {
      key: "recorded",
      status: "info",
      title,
      detail: `Not enough trades to compare yet: ${pairs.length} of ${SELFCHECK.minPairs} needed (${done} trades closed in the last 7 days). A trade is compared once the recording of its own moment has finished (up to 6 h), under the same exits, as far as it was observed; recordings of graduated coins from before this version are not trusted.`
    };
  }
  const d = clusteredMeanCI(
    pairs.map((x) => x.rec - x.real),
    pairs.map((x) => x.hour)
  );
  const rec = pairs.reduce((a, x) => a + x.rec, 0) / pairs.length;
  const real = pairs.reduce((a, x) => a + x.real, 0) / pairs.length;
  const range = `95% range ${pts(d.lo)} to ${pts(d.hi)}`;
  if (d.lo > SELFCHECK.gap)
    return {
      key: "recorded",
      status: "warn",
      title,
      detail: `On ${pairs.length} trades the recordings of the same coins at the same moments made ${pct2(rec)} per trade, the trades themselves ${pct2(real)} (${pts(d.mean)}, ${range}). What the bot learns and proves from recordings is too optimistic \u2014 its promises will not be kept.`
    };
  if (d.hi < -SELFCHECK.gap)
    return { key: "recorded", status: "info", title, detail: `The bot's own ${pairs.length} trades did better than their recordings (${pts(-d.mean)} per trade): the recordings are on the cautious side.` };
  return { key: "recorded", status: "ok", title, detail: `On ${pairs.length} trades recordings and real trades agree: ${pct2(rec)} vs ${pct2(real)} per trade (${pts(d.mean)}, ${range}).` };
}
function decisions(st, now) {
  const title = "Autopilot decisions are steady";
  const day2 = st.log.filter((x) => x.at >= now - DAY2);
  const answer = (i) => day2.slice(0, i).some((y) => /^You picked/.test(y.what) && day2[i].at - y.at <= 15 * 6e4);
  const switches = day2.filter((x, i) => /^(Now trading|Back to your own rule|Dropped)/.test(x.what) && !answer(i)).length;
  const picks = day2.filter((x) => /^You picked/.test(x.what)).length;
  const yours = picks ? ` You picked the rule ${picks} time${picks === 1 ? "" : "s"} (not counted).` : "";
  if (switches > SELFCHECK.maxSwitches)
    return { key: "decisions", status: "warn", title, detail: `${switches} rule changes by the autopilot in the last 24 h. A rule should stay until its results turn; this many changes looks like chasing noise.${yours}` };
  return { key: "decisions", status: "ok", title, detail: `${switches} rule change${switches === 1 ? "" : "s"} by the autopilot in the last 24 h.${yours}` };
}
function coverage(samples, now, feedDown) {
  const title = "The bot sees what it records";
  if (feedDown) return { key: "coverage", status: "fail", title, detail: "No trade data for over a minute: no new entries, and nothing open is observed until it is back." };
  const day2 = samples.filter((s) => s.resolvedAt >= now - DAY2 && s.ov === 1);
  const amm = day2.filter((s) => s.stage === "amm");
  const ammBlind = amm.filter((s) => s.blind !== void 0 && s.blindBy !== "feed" && s.blindBy !== "stop");
  const outage = day2.filter((s) => s.blind !== void 0 && s.blindBy === "feed").length;
  const stopped = day2.filter((s) => s.blind !== void 0 && s.blindBy === "stop").length;
  const parts = [];
  if (amm.length)
    parts.push(
      `${Math.round(ammBlind.length / amm.length * 100)}% of graduated-coin recordings stopped being watched before they ended (the bot follows at most 40 pools). Those count only for rules whose time limit they were watched through, never by how they ended, so rules on graduated coins that hold long are judged by the bot's own trades`
    );
  if (outage) parts.push(`${Math.round(outage / day2.length * 100)}% of all recordings were cut by trade-feed outages (a minute or more without data)`);
  if (stopped) parts.push(`${Math.round(stopped / day2.length * 100)}% were cut by the bot restarting (updates, settings that need a restart), kept as far as they were watched`);
  if (!day2.length) return { key: "coverage", status: "info", title, detail: "No recordings finished in the last 24 h yet." };
  const status = outage / day2.length > 0.1 ? "warn" : amm.length > 20 && ammBlind.length / amm.length > 0.5 ? "info" : "ok";
  return { key: "coverage", status, title, detail: parts.length ? `Last 24 h: ${parts.join("; ")}.` : `Last 24 h: all ${day2.length} recordings were observed to the end.` };
}

// src/core/diagnose.ts
var HOUR3 = 36e5;
var at = (t) => t ? `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC` : "\u2014";
var p1 = (x) => {
  if (!Number.isFinite(x)) return "\u2014";
  const v = Math.round(x * 1e3) / 10;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;
};
var n0 = (x) => Math.round(x).toLocaleString("en-US");
var share = (a, b) => b ? `${Math.round(a / b * 100)}%` : "\u2014";
var ago = (t, now) => {
  const m = Math.max(0, Math.round((now - t) / 6e4));
  return m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
var entryName = (tag) => /^x\d+$/.test(tag) ? `first reaching score ${tag.slice(1)}` : entryLabel(tag);
var exitName = (e) => {
  const g = GRID[Math.floor(e / HOLDS_MIN.length)];
  const hold = HOLDS_MIN[e % HOLDS_MIN.length];
  return `+${g.tp}% / \u2212${g.sl}%${hold ? `, ${hold} min` : ""}`;
};
function trades(list) {
  if (!list.length) return "none";
  const wins2 = list.filter((p) => (p.pnl ?? 0) > 0).length;
  const mean = list.reduce((a, p) => a + (p.pnlPct ?? 0), 0) / list.length / 100;
  const sol = list.reduce((a, p) => a + (p.pnl ?? 0), 0) / 1e9;
  const how = /* @__PURE__ */ new Map();
  for (const p of list) how.set(p.exitReason ?? "?", (how.get(p.exitReason ?? "?") ?? 0) + 1);
  const ends = [...how].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  const from = Math.min(...list.map((p) => p.openedAt));
  return `${list.length} (${wins2} won) \xB7 ${p1(mean)} per trade on average \xB7 ${sol >= 0 ? "+" : ""}${sol.toFixed(3)} SOL in all \xB7 ended by: ${ends} \xB7 since ${at(from)}`;
}
function* steps2(i) {
  const s = i.settings;
  const out = [];
  out.push(`SIGNAL diagnosis \xB7 ${at(i.now)}${i.version ? ` \xB7 version ${i.version}` : ""}`);
  out.push(`Mode ${s.mode} \xB7 auto-trading ${s.enabled ? "on" : "off"} \xB7 autopilot ${s.autopilot ? "on" : "off"} \xB7 rule in use: ${ruleSummary(s)}${s.scoreOnly ? " \xB7 no filters" : " \xB7 with filters"}`);
  const all = i.samples;
  out.push("", "DATA (recordings on disk)");
  if (!all.length) out.push("- no recordings yet");
  else {
    let first = Infinity;
    let last = 0;
    const kinds = /* @__PURE__ */ new Map();
    for (const x of all) {
      if (x.ts < first) first = x.ts;
      if (x.ts > last) last = x.ts;
      kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
    }
    const named = { checkpoint: "at fixed moments", entry: "at score levels", signal: "of the rule in use", moment: "at your moments" };
    out.push(`- ${n0(all.length)} recordings over ${((last - first) / HOUR3).toFixed(0)} h (${at(first)} \u2192 ${at(last)}): ${[...kinds].map(([k, v]) => `${n0(v)} ${named[k] ?? k}`).join(", ")}`);
    const rows = recordedRows(all, i.horizonMs);
    out.push(`- finished and usable by the search (followed for ${Math.round(i.horizonMs / HOUR3)} h): ${n0(rows.length)}`);
    const amm = all.filter((x) => x.stage === "amm");
    const poolCut = amm.filter((x) => x.blind !== void 0 && x.blindBy !== "feed" && x.blindBy !== "stop").length;
    const feedCut = all.filter((x) => x.blind !== void 0 && x.blindBy === "feed").length;
    const stopCut = all.filter((x) => x.blind !== void 0 && x.blindBy === "stop").length;
    const untrusted = amm.filter((x) => x.ov !== 1).length;
    out.push(`- graduated coins: ${share(amm.length, all.length)} of recordings; ${share(poolCut, amm.length)} of those stopped being watched before they ended (the bot follows at most 40 pools)`);
    out.push(`- cut by trade-feed outages: ${share(feedCut, all.length)} of all recordings`);
    if (stopCut) out.push(`- cut by the bot stopping (restarts, updates; kept as far as they were watched): ${share(stopCut, all.length)} of all recordings`);
    if (untrusted) out.push(`- graduated-coin recordings from before observation was tracked (not used): ${n0(untrusted)}`);
    const days = /* @__PURE__ */ new Map();
    for (const x of all) {
      const d = new Date(x.ts).toISOString().slice(0, 10);
      let r2 = days.get(d);
      if (!r2) days.set(d, r2 = { n: 0, amm: 0, pool: 0, feed: 0 });
      r2.n++;
      if (x.stage === "amm") {
        r2.amm++;
        if (x.blind !== void 0 && x.blindBy !== "feed" && x.blindBy !== "stop") r2.pool++;
      }
      if (x.blind !== void 0 && x.blindBy === "feed") r2.feed++;
    }
    out.push("- by day (UTC): recordings \xB7 graduated ones cut by pools \xB7 all cut by feed outages");
    for (const [d, r2] of [...days].sort().slice(-8)) out.push(`  ${d} \xB7 ${n0(r2.n)} \xB7 ${share(r2.pool, r2.amm)} \xB7 ${share(r2.feed, r2.n)}`);
    yield;
    out.push("", "ENTRIES ON ALL FINISHED DATA (not proof: the best of 192 exits on everything recorded flatters every entry; each average leaves out its single largest recording, so no one coin can be the headline)");
    const byTag = /* @__PURE__ */ new Map();
    for (const x of rows) {
      let l = byTag.get(x.tag);
      if (!l) byTag.set(x.tag, l = []);
      l.push(x);
    }
    const lines = [];
    for (const [tag, list] of byTag) {
      if (list.length < 30) continue;
      const sum = new Float64Array(EXITS);
      const cnt = new Float64Array(EXITS);
      const top = new Float64Array(EXITS).fill(-Infinity);
      for (let k = 0; k < list.length; k++) {
        for (let e = 0; e < EXITS; e++) {
          const v = exitReturn(list[k], Math.floor(e / HOLDS_MIN.length), e % HOLDS_MIN.length);
          if (Number.isNaN(v)) continue;
          sum[e] += v;
          cnt[e]++;
          if (v > top[e]) top[e] = v;
        }
        if (k % 1e3 === 999) yield;
      }
      const less = (e) => cnt[e] > 1 ? (sum[e] - top[e]) / (cnt[e] - 1) : sum[e] / cnt[e];
      let best = -1;
      for (let e = 0; e < EXITS; e++) if (cnt[e] >= 30 && (best < 0 || less(e) > less(best))) best = e;
      const span = Math.max(1 / 24, (list[list.length - 1].ts - list[0].ts) / (24 * HOUR3));
      const coins = new Set(list.map((x) => x.mint)).size;
      if (best < 0) lines.push({ v: -Infinity, text: `- ${entryName(tag)} \xB7 ${(coins / span).toFixed(0)}/day \xB7 too few watched to the end` });
      else {
        const mean = sum[best] / cnt[best];
        const trimmed = less(best);
        const carried = Math.abs(mean - trimmed) > 0.05 ? ` \u2014 but ${p1(mean)} with its best single recording, which one coin carries` : "";
        lines.push({ v: trimmed, text: `- ${entryName(tag)} \xB7 ${(coins / span).toFixed(0)}/day \xB7 best: ${exitName(best)} \u2192 ${p1(trimmed)} per trade on ${n0(cnt[best])}${carried}` });
      }
    }
    lines.sort((a, b) => b.v - a.v);
    out.push(...lines.length ? lines.map((l) => l.text) : ["- none with 30 finished recordings yet"]);
  }
  const r = i.report;
  out.push("", "LAST SEARCH (the edge finder)");
  if (!r) out.push("- none yet");
  else {
    out.push(`- ${ago(r.generatedAt, i.now)} \xB7 method ${r.method ?? "old"} \xB7 ${r.status === "ok" ? "answered" : "not enough data"}: ${r.note}`);
    if (r.status === "ok") {
      out.push(`- ${r.hours.toFixed(0)} h of market \xB7 ${n0(r.samples)} recordings \xB7 ${n0(r.tested)} rules tried \xB7 ${r.candidates} candidates re-checked on data it never saw \xB7 ${r.survivors.length} held up`);
      out.push(`- luck check: on shuffled data the same search "found" ${r.placebo.avgSurvivors.toFixed(1)} rules per run (at most ${r.placebo.maxSurvivors})`);
      for (const x of r.survivors.slice(0, 5)) out.push(`  held up: ${x.text} \xB7 ${p1(x.holdout.mean)} per trade on ${x.holdout.n} unseen (worst case ${p1(x.holdout.lo)}) \xB7 ${x.tradesPerDay.toFixed(0)}/day`);
      for (const x of r.failed) out.push(`  closest try: ${x.text} \xB7 ${p1(x.discovery.mean)} while searching (${x.discovery.n}) \u2192 ${p1(x.holdout.mean)} on ${x.holdout.n} unseen (worst case ${p1(x.holdout.lo)})`);
    }
  }
  out.push("", `THE RULE IN USE: ${ruleSummary(s)}`);
  if (all.length) {
    const m = measureRule(recordedRows(all, i.horizonMs), s, { horizonMs: i.horizonMs, tests: r?.status === "ok" ? r.candidates : void 0 });
    out.push(
      m.ok ? `- on the newest recordings (as the search checks candidates): ${p1(m.mean)} per trade on ${n0(m.n)} coins (range ${p1(m.lo)} to ${p1(m.hi)}), ~${m.coinsPerDay.toFixed(0)} coins a day` : `- on the recordings: cannot be weighed \u2014 ${m.why}`
    );
  }
  const mine = i.closed.filter((p) => p.status === "closed" && p.mode === s.mode);
  out.push(`- all ${s.mode} trades: ${trades(mine)}`);
  out.push(`- under this exact rule: ${trades(mine.filter((p) => p.rule === ruleKey(s)))}`);
  const ap = i.autopilot;
  if (ap) {
    out.push("", `AUTOPILOT: ${!s.autopilot ? "off" : ap.holding ? `holding new live entries \u2014 ${ap.holdReason}` : ap.active ? `trading ${ap.active} (since ${at(ap.since)})` : "on your own rule"}`);
    for (const x of ap.log.slice(-6).reverse()) out.push(`- ${at(x.at)}: ${x.what}`);
  }
  out.push("", "CHECKS");
  const checks = [recordedVsReal(i.closed, all, i.now), coverage(all, i.now, false), ...ap ? [decisions(ap, i.now)] : []];
  for (const c of checks) out.push(`- ${c.status === "ok" ? "ok" : c.status} \xB7 ${c.title}: ${c.detail}`);
  return out.join("\n");
}
function diagnosis(i) {
  const it = steps2(i);
  for (; ; ) {
    const r = it.next();
    if (r.done) return r.value;
  }
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
function observedReturn(s, tp, sl) {
  if (s.blind !== void 0 || s.ov === void 0 && s.stage === "amm") {
    if (!gridOf(s)) return void 0;
    const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
    if (!comboCounts(s, gi >= 0 ? gi : nearestGrid(tp, sl))) return void 0;
  }
  return sampleReturn(s, tp, sl).ret;
}
function sampleReturn(s, tp, sl) {
  if (s.tp === tp && s.sl === sl) return { ret: s.ret, exact: true };
  const g = gridOf(s);
  const gi = GRID.findIndex((c) => c.tp === tp && c.sl === sl);
  if (g && gi >= 0 && Number.isFinite(g[gi])) return { ret: g[gi], exact: true };
  return { ret: g?.[nearestGrid(tp, sl)] ?? s.ret, exact: false };
}
function valuesOf(rows, val) {
  const v = [];
  const h = [];
  for (const s of rows) {
    const x = val(s);
    if (x === void 0 || !Number.isFinite(x)) continue;
    v.push(x);
    h.push(hourOf(s.ts));
  }
  return { v, h };
}
function statsOf({ v, h }) {
  const wins2 = v.filter((r) => r > 0).length;
  const w = wilson(wins2, v.length);
  const m = clusteredMeanCI(v, h);
  return { n: v.length, winRate: v.length ? wins2 / v.length : NaN, winLo: w.lo, winHi: w.hi, avgRet: m.mean, retLo: m.lo, retHi: m.hi };
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
  const retOf = (s) => observedReturn(s, tp, sl);
  const t0 = samples.reduce((m, s) => Math.min(m, s.ts), Infinity);
  const t1 = samples.reduce((m, s) => Math.max(m, s.ts), 0);
  const spanHours = samples.length ? Math.max(1 / 60, (t1 - t0) / 36e5) : 0;
  const buckets = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const rows = checkpoints.filter((s) => s.score >= lo && (s.score < hi || hi === 100 && s.score <= 100));
    const st = statsOf(valuesOf(rows, retOf));
    const mm = rows.map((s) => s.maxMult).sort((a, b) => a - b);
    buckets.push({ lo, hi, n: st.n, winRate: st.winRate, winLo: st.winLo, winHi: st.winHi, avgRet: st.avgRet, retLo: st.retLo, retHi: st.retHi, medMaxMult: quantile(mm, 0.5) });
  }
  const sigAbove = signals.filter((s) => s.score >= settings.minScore);
  const signalStats = statsOf(valuesOf(sigAbove, retOf));
  const entries = samples.filter((s) => s.kind === "entry");
  const thresholdSource = entries.length >= 200 ? "entries" : "checkpoints";
  const atLevel = (min) => thresholdSource === "entries" ? entries.filter((s) => s.tag === `x${min}`) : checkpoints.filter((s) => s.score >= min);
  const thresholds = [];
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    const st = statsOf(valuesOf(rows, retOf));
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
    const st = statsOf(valuesOf(pool, (s) => comboCounts(s, i) ? gridOf(s)?.[i] : void 0));
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
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade (95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%, counting coins bought in the same hour as one piece of evidence) after fees, delay and slippage. The low end must clear +2% before risking real money.`
    };
  } else {
    gate = {
      pass: true,
      verdict: "Evidence supports these settings",
      detail: `Average ${(signalStats.avgRet * 100).toFixed(1)}% per trade over ${signalStats.n} signals; 95% range ${(signalStats.retLo * 100).toFixed(1)}% to ${(signalStats.retHi * 100).toFixed(1)}%. Past results in this market can still stop working \u2014 start small.`
    };
  }
  let suggestion = null;
  const strict = 1 - 0.1 / (10 * GRID.length);
  const bound = (x, level2) => x.v.length >= 2 ? clusteredMeanCI(x.v, x.h, level2).lo : -Infinity;
  const cur = valuesOf(pool, retOf);
  let bestLo = cur.v.length >= 30 ? bound(cur, strict) : -Infinity;
  const mid = t0 + (t1 - t0) / 2;
  for (let min = 50; min <= 95; min += 5) {
    const rows = atLevel(min);
    if (rows.length < 150) continue;
    const older = rows.filter((s) => s.ts < mid);
    const newer = rows.filter((s) => s.ts >= mid);
    GRID.forEach((g, i) => {
      const val = (s) => comboCounts(s, i) ? gridOf(s)?.[i] : void 0;
      const all = valuesOf(rows, val);
      if (all.v.length < 150) return;
      const lo = bound(all, strict);
      if (!(lo > 0) || lo <= bestLo + 5e-3) return;
      const o = valuesOf(older, val);
      const nw = valuesOf(newer, val);
      if (o.v.length < 50 || nw.v.length < 50 || !(bound(o, 0.95) > 0) || !(bound(nw, 0.95) > 0)) return;
      const m = clusteredMeanCI(all.v, all.h);
      bestLo = lo;
      suggestion = {
        minScore: min,
        tpPct: g.tp,
        slPct: g.sl,
        avgRet: m.mean,
        retLo: lo,
        n: all.v.length,
        why: `${thresholdSource === "entries" ? "buying when coins first reached" : "coins scoring"} ${min}+ with TP ${g.tp}% / SL ${g.sl}% averaged ${(m.mean * 100).toFixed(1)}% per trade over ${all.v.length} outcomes, positive in both the older and newer half of the data (strict worst case ${(lo * 100).toFixed(1)}%)`
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
  statfsSync,
  writeSync
} from "node:fs";
import { join } from "node:path";
import { getHeapStatistics } from "node:v8";
import { createGzip, gunzipSync, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { createGunzip, constants as zlibConstants } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
var day = (ts) => new Date(ts).toISOString().slice(0, 10);
var SAMPLE_LIMITS = { checkpoints: 4e4, structural: 2e4, entries: 25e3 };
function sampleScale(heapLimit = getHeapStatistics().heap_size_limit) {
  const gb = heapLimit / 1e9;
  return gb >= 3 ? 3 : gb >= 1.5 ? 2 : 1;
}
function sampleLimits(scale = sampleScale()) {
  return { checkpoints: SAMPLE_LIMITS.checkpoints * scale, structural: SAMPLE_LIMITS.structural * scale, entries: SAMPLE_LIMITS.entries * scale };
}
function* forEachLineSteps(path, fn) {
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
      yield;
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
  /** raw recording is paused while the disk has too little room (enforceBudget) */
  recordingPaused = false;
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
  loadSamples(days, now = Date.now(), limits = sampleLimits()) {
    return runSteps(this.loadSamplesSteps(days, now, limits));
  }
  /** The same, pausing every few milliseconds so trading goes on while days of samples are read. */
  loadSamplesAsync(days, now = Date.now(), limits = sampleLimits()) {
    return runStepsAsync(this.loadSamplesSteps(days, now, limits));
  }
  *loadSamplesSteps(days, now, limits) {
    const cutoff = day(now - days * 864e5);
    let files = [];
    try {
      files = readdirSync(join(this.dir, "samples")).filter((f2) => f2.endsWith(".jsonl") && f2.slice(0, 10) >= cutoff).sort().reverse();
    } catch {
      return [];
    }
    const perFile = [];
    const cap = { cp: limits.checkpoints, st: limits.structural, en: limits.entries };
    const used = { cp: 0, st: 0, en: 0 };
    const bucketOf = (line) => line.includes('"kind":"moment"') ? "st" : !line.includes('"kind":"checkpoint"') ? "en" : line.includes('"tag":"prog') || line.includes('"tag":"mig') ? "st" : "cp";
    for (const f2 of files) {
      const room = { cp: cap.cp - used.cp, st: cap.st - used.st, en: cap.en - used.en };
      if (room.cp <= 0 && room.st <= 0 && room.en <= 0) break;
      const got = { cp: [], st: [], en: [] };
      try {
        yield* forEachLineSteps(join(this.dir, "samples", f2), (line) => {
          const b = bucketOf(line);
          if (room[b] <= 0) return;
          let s;
          try {
            s = JSON.parse(line);
          } catch {
            return;
          }
          if (!Array.isArray(s.x) || s.y !== 0 && s.y !== 1) return;
          const into = got[b];
          into.push(s);
          if (into.length >= room[b] * 2) into.splice(0, into.length - room[b]);
        });
      } catch (e) {
        this.log.warn("could not read samples", { file: f2, err: String(e) });
        continue;
      }
      for (const b of ["cp", "st", "en"]) {
        if (got[b].length > room[b]) got[b].splice(0, got[b].length - Math.max(0, room[b]));
        used[b] += got[b].length;
      }
      perFile.push(got.cp.concat(got.st, got.en));
    }
    return perFile.reverse().flat().sort((a, b) => a.ts - b.ts);
  }
  // ---- market recorder (gzip, hourly files) ----------------------------------------
  record(ev, ts) {
    if (this.recordingPaused) return;
    const key = hour(ts);
    if (!this.recStream || this.recStream.key !== key) {
      this.closeRecorder();
      const gz = createGzip({ level: 6 });
      let path = join(this.dir, "record", `${key}.jsonl.gz`);
      for (let n = 2; existsSync(path); n++) path = join(this.dir, "record", `${key}_${String(n).padStart(2, "0")}.jsonl.gz`);
      const file = createWriteStream(path, { flags: "a" });
      file.on("error", (e) => this.log.error("recorder write failed", { err: String(e) }));
      gz.pipe(file);
      this.recStream = { key, gz, file, path };
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
    this.pruneModels();
  }
  /** Earlier models are kept for reference, the newest few only (with trees each is ~100 KB). */
  pruneModels(keep = 20) {
    try {
      const dir = join(this.dir, "models");
      const old = readdirSync(dir).filter((f2) => f2.endsWith(".json") && f2 !== "current.json" && f2 !== "history.json").map((f2) => ({ f: f2, t: statSync(join(dir, f2)).mtimeMs })).sort((a, b) => b.t - a.t).slice(keep);
      for (const x of old) rmSync(join(dir, x.f), { force: true });
    } catch (e) {
      this.log.warn("could not prune old models", { err: String(e) });
    }
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
  /** The self-check's own state (when the last daily check-up went out). */
  saveSelfCheck(state) {
    writeFileAtomic(join(this.dir, "selfcheck.json"), JSON.stringify(state));
  }
  loadSelfCheck() {
    const p = join(this.dir, "selfcheck.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }
  /** The autopilot's state: the rule in use, the user's own rule, benched rules, decisions. */
  saveAutopilot(state) {
    writeFileAtomic(join(this.dir, "autopilot.json"), JSON.stringify(state));
  }
  loadAutopilot() {
    const p = join(this.dir, "autopilot.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }
  /** The Lab (core/lab): the ideas being tested, their results so far, and the retired ones. */
  saveLab(state) {
    writeFileAtomic(join(this.dir, "lab.json"), JSON.stringify(state));
  }
  loadLab() {
    const p = join(this.dir, "lab.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }
  /** What each training run tried and decided (the dashboard's learning history). */
  saveLearnHistory(runs) {
    writeFileAtomic(join(this.dir, "models", "history.json"), JSON.stringify(runs));
  }
  loadLearnHistory() {
    const p = join(this.dir, "models", "history.json");
    if (!existsSync(p)) return [];
    try {
      const runs = JSON.parse(readFileSync(p, "utf8"));
      return Array.isArray(runs) ? runs : [];
    } catch {
      return [];
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
  /** Free space on the disk holding the data, MB (null when the system does not say). */
  freeMb() {
    try {
      const st = statfsSync(this.dir);
      return Math.round(Number(st.bavail) * Number(st.bsize) / 1e6);
    } catch {
      return null;
    }
  }
  /** What the data takes, folder by folder, and what the disk has left. */
  storageReport() {
    const byDir = {};
    let total = 0;
    try {
      for (const f2 of readdirSync(this.dir)) {
        const p = join(this.dir, f2);
        const st = statSync(p);
        const size = st.isDirectory() ? dirBytes(p) : st.size;
        const k = st.isDirectory() ? f2 : "other";
        byDir[k] = (byDir[k] ?? 0) + size / 1e6;
        total += size;
      }
    } catch {
    }
    for (const k of Object.keys(byDir)) byDir[k] = Math.round(byDir[k]);
    return { usedMb: Math.round(total / 1e6), byDir, freeMb: this.freeMb(), recordingPaused: this.recordingPaused };
  }
  /**
   * Keeps the data within `b.maxMb` and at least `b.minFreeMb` of the disk free, deleting, oldest
   * first: raw recordings (only replays use them), then samples older than the newest
   * `b.keepSampleDays` days (training and the searches use the newest ones), then journals older
   * than a week. Trading state, models, the Lab and the autopilot are never touched. When the disk
   * still has too little room, raw recording pauses, and resumes once there is twice the minimum.
   */
  enforceBudget(b, now = Date.now()) {
    const list = (sub) => {
      try {
        return readdirSync(join(this.dir, sub)).filter((f2) => f2.endsWith(".jsonl") || f2.endsWith(".jsonl.gz")).sort().map((f2) => {
          const p = join(this.dir, sub, f2);
          return { f: f2, p, mb: statSync(p).size / 1e6 };
        });
      } catch {
        return [];
      }
    };
    let used = dirBytes(this.dir) / 1e6;
    let free = this.freeMb() ?? Infinity;
    let freedMb = 0;
    let deleted = 0;
    let samplesPruned = false;
    const need = () => Math.max(used - b.maxMb, b.minFreeMb - free);
    const del = (x) => {
      try {
        rmSync(x.p, { force: true });
      } catch {
        return;
      }
      used -= x.mb;
      free += x.mb;
      freedMb += x.mb;
      deleted++;
    };
    for (const x of list("record")) {
      if (need() <= 0) break;
      if (x.p !== this.recStream?.path) del(x);
    }
    const keepSamplesFrom = day(now - (Math.max(1, b.keepSampleDays) - 1) * 864e5);
    for (const x of list("samples")) {
      if (need() <= 0 || x.f.slice(0, 10) >= keepSamplesFrom) break;
      del(x);
      samplesPruned = true;
    }
    const keepJournalFrom = day(now - 6 * 864e5);
    for (const x of list("journal")) {
      if (need() <= 0 || x.f.slice(0, 10) >= keepJournalFrom) break;
      del(x);
    }
    const wasPaused = this.recordingPaused;
    if (free < b.minFreeMb) {
      this.recordingPaused = true;
      this.closeRecorder();
    } else if (wasPaused && free >= 2 * b.minFreeMb) this.recordingPaused = false;
    return { freedMb: Math.round(freedMb), deleted, samplesPruned, paused: !wasPaused && this.recordingPaused, resumed: wasPaused && !this.recordingPaused };
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
function dirBytes(d) {
  let total = 0;
  try {
    for (const f2 of readdirSync(d)) {
      const p = join(d, f2);
      const st = statSync(p);
      total += st.isDirectory() ? dirBytes(p) : st.size;
    }
  } catch {
  }
  return total;
}
async function* readRecording(path) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip({ finishFlush: zlibConstants.Z_SYNC_FLUSH })), crlfDelay: Infinity });
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
function splitByCoin(samples, share2) {
  const first = /* @__PURE__ */ new Map();
  for (const s of samples) if (!first.has(s.mint) || s.ts < first.get(s.mint)) first.set(s.mint, s.ts);
  const coins = [...first.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  const testCoins = new Set(coins.slice(Math.floor(coins.length * share2)));
  return { learn: samples.filter((s) => !testCoins.has(s.mint)), test: samples.filter((s) => testCoins.has(s.mint)) };
}
async function pipelineSelfTest(opts = {}) {
  const log = opts.log ?? (() => {
  });
  const hours = opts.hours ?? 4;
  const notes = [];
  log(`simulating ${hours}h of an "edge" world\u2026`);
  const samples = collectSamples(hours, 0.9, opts.seed ?? 5).filter((s) => s.stage === "curve");
  const prior = { ...priorModel(0), scaledAt: 1 };
  const target = prior.target;
  const { learn, test } = splitByCoin(samples, 0.7);
  const learnRows = trainingRows(learn, target);
  const testRows = trainingRows(test, target);
  const trained = trainAndSelect(prior, learnRows, { now: 1 });
  const rep = trained.reports.find((r2) => r2.stage === "curve");
  const priorAuc = evaluate(prior.stages.curve, testRows).auc;
  const trainedAuc = evaluate(trained.model.stages.curve, testRows).auc;
  const gi = GRID.findIndex((g) => g.tp === target.tpPct && g.sl === target.slPct);
  const moments = test.filter((s) => s.kind !== "signal" && labelOf(s, target) !== null);
  const preds = moments.map((s) => scoreVector(trained.model, "curve", s.x).p);
  const order = preds.map((_, i) => i).sort((a, b) => preds[b] - preds[a]);
  const avg = (x) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  const retOf = (i) => moments[i].grid[gi];
  const top = order.slice(0, Math.max(1, Math.floor(order.length / 10))).map(retOf);
  const bottom = order.slice(Math.floor(order.length / 2)).map(retOf);
  log(`positive control: ${rep.adopted ? "adopted" : "did NOT adopt"} ${rep.recipe === "trees" ? `weighted sum + ${rep.treeCount} trees` : "weighted sum"}; AUC on unseen coins ${priorAuc.toFixed(3)} (prior) \u2192 ${trainedAuc.toFixed(3)}`);
  const r = rng(99);
  const shuffle = (rows) => {
    const ys = rows.map((x) => x.y);
    for (let i = ys.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [ys[i], ys[j]] = [ys[j], ys[i]];
    }
    return rows.map((x, i) => ({ ...x, y: ys[i] }));
  };
  const nLearn = shuffle(learnRows);
  const nTest = shuffle(testRows);
  const noise = trainAndSelect(prior, nLearn, { now: 2 });
  const nAuc = evaluate(noise.model.stages.curve, nTest).auc;
  const perm = moments.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const rescored = moments.map((s, i) => {
    const o = moments[perm[i]];
    return { ...s, kind: "signal", y: o.y, ret: o.ret, grid: o.grid, score: scoreVector(noise.model, "curve", s.x).score };
  });
  const report = buildReport(rescored, { ...DEFAULT_SETTINGS, minScore: 60 }, priorModel(), [], Date.now());
  log(`negative control: AUC on unseen coins ${nAuc.toFixed(3)}; gate: ${report.gate.verdict}`);
  const passed = rep.adopted && trainedAuc > 0.62 && trainedAuc >= priorAuc - 0.02 && avg(top) > avg(bottom) && Math.abs(nAuc - 0.5) < 0.06 && !report.gate.pass;
  if (!passed) notes.push("self-test did not meet all criteria \u2014 inspect the numbers above");
  return {
    samples: samples.length,
    positive: { priorAuc, trainedAuc, recipe: rep.recipe ?? "none", trees: rep.treeCount ?? 0, topDecileRet: avg(top), bottomHalfRet: avg(bottom) },
    negative: { trainedAuc: nAuc, gatePass: report.gate.pass, gateVerdict: report.gate.verdict },
    passed,
    notes
  };
}

// src/research/cli.ts
var USAGE = `SIGNAL research CLI

  node dist/research.mjs diagnose [--data ./data] [--days 14]   (everything the bot sees, in one page to read or paste to Claude)
  node dist/research.mjs report   [--data ./data] [--days 14]
  node dist/research.mjs replay   [--data ./data] [--score 75] [--tp 100] [--sl 50] [--scoreonly] [--latency 1500]
  node dist/research.mjs sweep    [--data ./data] [--scores 65,75,85] [--tps 50,100,200] [--sls 30,50]
  node dist/research.mjs train    [--data ./data] [--days 14] [--adopt] [--notrees] [--horizon 6]
  node dist/research.mjs edges    [--data ./data] [--days 30] [--placebo 5]   (searches for rules that made money on their own)
  node dist/research.mjs sim      [--hours 6] [--out ./simdata] [--predictability 0.7] [--seed 1]
  node dist/research.mjs selftest            (proves the learning pipeline on known worlds)
`;
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
var pct3 = (x) => Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "\u2014";
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
    case "diagnose": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      const state = store.loadState();
      const text = diagnosis({
        samples,
        settings: sanitizeSettings(state?.settings ?? {}),
        closed: state?.closed ?? [],
        autopilot: store.loadAutopilot() ?? null,
        report: store.loadEdges() ?? null,
        now: Date.now(),
        horizonMs: DEFAULT_CONFIG.outcomeHorizonMs
      });
      store.close();
      console.log(text);
      break;
    }
    case "report": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      store.close();
      const settings = sanitizeSettings({ minScore: Number(a.score ?? 75), tpPct: Number(a.tp ?? 100), slPct: Number(a.sl ?? 50) });
      const r = buildReport(samples, settings, store.loadModel() ?? priorModel(), [], Date.now());
      console.log(`Samples ${r.samples} (${r.checkpoints} checkpoints, ${r.signals} signals) over ${r.spanHours.toFixed(1)} h`);
      console.log(`TP ${r.settings.tpPct}% / SL ${r.settings.slPct}% \u2014 break-even win rate \u2248 ${pct3(r.breakEven)}
`);
      console.log("score    n      win%    avg return (95% range)        median peak");
      for (const b of r.buckets) console.log(`${String(b.lo).padStart(3)}-${String(b.hi).padEnd(3)} ${String(b.n).padStart(6)}  ${pct3(b.winRate).padStart(7)}   ${pct3(b.avgRet).padStart(7)} (${pct3(b.retLo)} \u2026 ${pct3(b.retHi)})   ${Number.isFinite(b.medMaxMult) ? b.medMaxMult.toFixed(2) + "\xD7" : "\u2014"}`);
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
            console.log(`${String(s).padStart(5)} ${String(tp).padStart(4)} ${String(sl).padStart(4)} ${String(r.paper.trades).padStart(7)} ${pct3(r.paper.winRate).padStart(7)} ${(r.paper.avgPct ?? 0).toFixed(1).padStart(7)} ${r.paper.pnlSol.toFixed(3).padStart(9)} ${r.paper.maxDrawdownSol.toFixed(3).padStart(7)}`);
          }
      break;
    }
    case "train": {
      const store = new DataStore(data, silentLogger);
      const samples = store.loadSamples(Number(a.days ?? 14));
      const current = store.loadModel() ?? priorModel();
      const rows = trainingRows(samples, current.target, { horizonMs: Number(a.horizon ?? DEFAULT_CONFIG.outcomeHorizonMs / 36e5) * 36e5 });
      const { model, reports } = trainAndSelect(current, rows, { trees: !a.notrees });
      console.log(`${rows.length.toLocaleString("en-US")} finished moments (${rows.filter((r) => r.kind === "entry").length.toLocaleString("en-US")} of them entry moments)`);
      for (const r of reports) {
        const recipes = r.linear ? ` \xB7 weighted sum ${r.linear.logLoss.toFixed(4)}${r.trees ? `, + trees ${r.trees.logLoss.toFixed(4)}` : ""} (log-loss on newer rows)` : "";
        console.log(`${r.stage}: ${r.adopted ? "ADOPT" : "keep"} ${r.recipe === "trees" ? `weighted sum + ${r.treeCount} trees` : r.recipe ?? ""} \u2014 ${r.reason}; on ${r.freshRows} unseen moments AUC ${r.current.auc?.toFixed(3)} \u2192 ${r.candidate.auc?.toFixed(3)}, log-loss ${r.current.logLoss?.toFixed(4)} \u2192 ${r.candidate.logLoss?.toFixed(4)} (train ${r.trainRows}, check ${r.valRows})${recipes}`);
      }
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
${r.samples.toLocaleString("en-US")} would-be trades over ${r.hours.toFixed(1)} h: searched the first ${r.discoveryHours.toFixed(1)} h, checked on the last ${r.holdoutHours.toFixed(1)} h`);
        console.log(`${r.tested.toLocaleString("en-US")} rules scored, ${r.candidates} re-tested, ${r.survivors.length} held up. Placebo (shuffled data): ${r.placebo.avgSurvivors.toFixed(2)} per run, max ${r.placebo.maxSurvivors}
`);
        for (const s of r.survivors)
          console.log(`\u2714 ${s.text}
   newest data ${pct3(s.holdout.mean)} per trade (worst case ${pct3(s.holdout.lo)}, ${s.holdout.n} trades, ${pct3(s.holdout.winRate)} winners) \xB7 search data ${pct3(s.discovery.mean)} \xB7 every coin at the same entry: ${pct3(s.baseline)} \xB7 ${s.tradesPerDay.toFixed(0)} coins/day`);
        for (const s of r.failed) console.log(`\u2718 ${s.text}: ${pct3(s.discovery.mean)} in the search data, ${pct3(s.holdout.mean)} on the newest data`);
      }
      break;
    }
    case "selftest": {
      const res = await pipelineSelfTest({ hours: Number(a.hours ?? 4), log: (m) => console.log(m) });
      console.log(JSON.stringify(res, null, 1));
      break;
    }
    default:
      console.log(USAGE);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
