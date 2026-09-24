"""Fast (numba) version of sim.py for parameter searches.

Same trading rules as RutaCrypto_PROP.pine / RutaCryptoPROP.cs: signal memory with one
trade per RSI cross, $ risk engine, entry window, forced flat, opposite-signal handling.
No drawdown guard (research mode). Fills: "next_open" (NinjaTrader) or "close" (TradingView).
"""
import math
import numpy as np
import pandas as pd
from numba import njit

from ind import load, indicators, rma

TICK, PV = 0.25, 2.0   # MNQ
TV = TICK * PV


def pine_ema(x, n):
    """Pine ta.ema: SMA of the first n values, then alpha = 2 / (n + 1)."""
    a = x.to_numpy(float); out = np.full(len(a), np.nan)
    if len(a) >= n:
        out[n - 1] = a[:n].mean(); k = 2 / (n + 1)
        for i in range(n, len(a)):
            out[i] = k * a[i] + (1 - k) * out[i - 1]
    return pd.Series(out, x.index)


def add_features(d):
    """Extra columns used by the optional filters (all non-repainting)."""
    d = d.copy()
    idx = d.index
    d["tmin"] = idx.hour * 60 + idx.minute
    tc = d["tclose"]
    d["cmin"] = tc.dt.hour * 60 + tc.dt.minute
    d["dow"] = idx.dayofweek
    # trading day starts 18:00 New York (as on CME / TradingView "D")
    tday = (idx + pd.Timedelta(hours=6)).date
    hlc3 = (d.high + d.low + d.close) / 3
    pv = (hlc3 * d.volume).groupby(tday).cumsum()
    vv = d.volume.groupby(tday).cumsum()
    d["vwap"] = pv / vv.replace(0, np.nan)
    # 60-minute EMA(50) of the last *completed* hour (Pine: ema[1] with lookahead_on)
    hr = d.close.resample("60min", label="left", closed="left").last().dropna()
    d["htf"] = pine_ema(hr, 50).shift(1).reindex(idx.floor("60min")).to_numpy()
    # ADX (Pine ta.dmi 14, 14)
    up = d.high.diff(); dn = -d.low.diff()
    plus_dm = np.where((up > dn) & (up > 0), up, 0.0); plus_dm[0] = np.nan
    minus_dm = np.where((dn > up) & (dn > 0), dn, 0.0); minus_dm[0] = np.nan
    tr = pd.concat([d.high - d.low, (d.high - d.close.shift()).abs(), (d.low - d.close.shift()).abs()], axis=1).max(axis=1)
    tr.iloc[0] = np.nan
    trur = rma(tr, 14)
    plus = (100 * rma(pd.Series(plus_dm, idx), 14) / trur).ffill()
    minus = (100 * rma(pd.Series(minus_dm, idx), 14) / trur).ffill()
    s = (plus + minus).replace(0, 1)
    d["adx"] = 100 * rma((plus - minus).abs() / s, 14)
    return d


@njit(cache=True)
def _run(o, h, l, c, atr, upx, dnx, setL, setS, can, flat,
         memory, slM, tpM, min_stop, max_qty, fixed_qty, max_loss, max_profit,
         fee_rt, slip, opp_mode, next_open, exact):
    # opp_mode: 0 reverse, 1 close, 2 ignore ; fixed_qty > 0 → fixed $ bracket mode
    n = len(o)
    pnl = np.zeros(n); ebar = np.zeros(n, np.int64); xbar = np.zeros(n, np.int64); why = np.zeros(n, np.int64)
    nt = 0
    pos = 0; qty = 0; ent = 0.0; slT = 0; tpT = 0; eb = 0
    last_up = -1; last_dn = -1; used_up = -2; used_dn = -2
    pend_dir = 0; pend_q = 0; pend_sl = 0; pend_tp = 0; pend_flat = False; pend_why = 0
    for i in range(n):
        # 0) orders from the previous close fill at this open (NinjaTrader)
        if pend_flat and pos != 0:
            px = o[i] - pos * slip * TICK
            pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = pend_why; nt += 1
            pos = 0
        pend_flat = False
        if pend_dir != 0:
            if pos != 0:
                px = o[i] - pos * slip * TICK
                pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = 3; nt += 1
            pos = pend_dir; qty = pend_q; slT = pend_sl; tpT = pend_tp; ent = o[i] + pos * slip * TICK; eb = i
            pend_dir = 0
        # 1) bracket exits inside the bar
        if pos != 0:
            stop = ent - pos * slT * TICK
            tp = ent + pos * tpT * TICK
            hit_s = (l[i] <= stop) if pos > 0 else (h[i] >= stop)
            hit_t = (h[i] >= tp) if pos > 0 else (l[i] <= tp)
            if hit_s and hit_t:
                high_first = abs(h[i] - o[i]) < abs(l[i] - o[i])
                tp_first = high_first if pos > 0 else not high_first
                hit_s = not tp_first
                hit_t = tp_first
            if hit_s:
                px = (min(o[i], stop) if pos > 0 else max(o[i], stop)) - pos * slip * TICK
                pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = 0; nt += 1
                pos = 0
            elif hit_t:
                px = max(o[i], tp) if pos > 0 else min(o[i], tp)
                pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = 1; nt += 1
                pos = 0
        if upx[i]:
            last_up = i
        if dnx[i]:
            last_dn = i
        # 2) session flatten
        if pos != 0 and flat[i]:
            if next_open:
                pend_flat = True; pend_why = 2
            else:
                pnl[nt] = pos * (c[i] - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = 2; nt += 1
                pos = 0
        # 3) signals
        rl = last_up >= 0 and i - last_up <= memory and last_up > used_up
        rs = last_dn >= 0 and i - last_dn <= memory and last_dn > used_dn
        sigL = setL[i] and rl
        sigS = setS[i] and rs
        if opp_mode == 1 and pos != 0 and not pend_flat:
            if (pos > 0 and sigS) or (pos < 0 and sigL):
                if next_open:
                    pend_flat = True; pend_why = 4
                else:
                    pnl[nt] = pos * (c[i] - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = 4; nt += 1
                    pos = 0
        wantL = sigL and pos <= 0 and (pos == 0 or opp_mode == 0)
        wantS = sigS and pos >= 0 and (pos == 0 or opp_mode == 0)
        if can[i] and (wantL or wantS) and not pend_flat and not math.isnan(atr[i]):
            if fixed_qty > 0:
                sl = int(math.floor((max_loss / fixed_qty - fee_rt) / TV)) - slip
                tpk = int(math.floor((max_profit / fixed_qty + fee_rt) / TV)) if exact else int(math.floor(max_profit / (fixed_qty * TV)))
                q = fixed_qty
            else:
                sl = max(min_stop, int(math.floor(atr[i] * slM / TICK + 0.5)))
                per = (sl + slip) * TV + fee_rt
                q = min(max_qty, int(math.floor(max_loss / per)))
                tpk = 0
                if q >= 1:
                    if exact:   # ATR picked the size; bracket set in $ for that size (net of fees)
                        sl = int(math.floor((max_loss / q - fee_rt) / TV)) - slip
                        tpk = int(math.floor((max_profit / q + fee_rt) / TV))
                    else:
                        tpk = min(int(math.floor(atr[i] * tpM / TICK + 0.5)), int(math.floor(max_profit / (q * TV))))
            if q >= 1 and sl >= 1 and tpk >= 1:
                d = 1 if wantL else -1
                if wantL:
                    used_up = last_up
                else:
                    used_dn = last_dn
                if next_open:
                    pend_dir = d; pend_q = q; pend_sl = sl; pend_tp = tpk
                else:
                    if pos != 0:
                        px = c[i] - pos * slip * TICK
                        pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; ebar[nt] = eb; xbar[nt] = i; why[nt] = 3; nt += 1
                    pos = d; qty = q; slT = sl; tpT = tpk; ent = c[i] + pos * slip * TICK; eb = i
    return pnl[:nt], ebar[:nt], xbar[:nt], why[:nt]


def crosses(rsi, lower, upper):
    prev = np.roll(rsi, 1); prev[0] = np.nan
    return (rsi > lower) & (prev <= lower), (rsi < upper) & (prev >= upper)


class Arrays:
    """numpy views of a feature DataFrame, computed once (the search calls run() many times)."""
    def __init__(self, d):
        g = lambda k: d[k].to_numpy()
        self.o, self.h, self.l, self.c = g("open"), g("high"), g("low"), g("close")
        self.rsi, self.atr, self.vosc, self.vwap, self.htf, self.adx = g("rsi"), g("atr"), g("vosc"), g("vwap"), g("htf"), g("adx")
        self.haL, self.haS = g("haC") > g("haO"), g("haC") < g("haO")
        self.tmin, self.cmin, self.dow = g("tmin"), g("cmin"), g("dow")
        self.sma = {10: g("sma")}
        self._close = d.close
        rth = (self.dow < 5) & (self.tmin >= 570) & (self.tmin < 945)
        self.sessions = max(1, pd.Series(d.index.date[rth]).nunique())
        self.n = len(d)

    def trend(self, n):
        if n not in self.sma:
            self.sma[n] = self._close.rolling(n).mean().to_numpy()
        return self.sma[n]


_cache = {}
def arrays(d):
    key = id(d)
    if key not in _cache:
        _cache[key] = (d, Arrays(d))   # keep d alive so id() stays unique
    return _cache[key][1]


def run(d, lower=30, upper=70, memory=2, use_ha=True, vol=-39.0, trend=None,
        vwap=False, htf=False, adx_min=0.0, win=(570, 945), flat_min=955, direction="both",
        slM=2.0, tpM=4.0, min_stop=8, max_qty=50, fixed_qty=0, max_loss=2000.0, max_profit=1500.0,
        fee=0.62, slip=1, opp="reverse", fill="next_open", exact=False):
    a = arrays(d)
    c = a.c
    upx, dnx = crosses(a.rsi, lower, upper)
    sma = a.trend(10 if trend is None else trend)
    ones = np.ones(a.n, bool)
    haL = a.haL if use_ha else ones
    haS = a.haS if use_ha else ones
    volok = a.vosc > vol
    fL = ones.copy(); fS = ones.copy()
    if vwap:
        fL &= c > a.vwap; fS &= c < a.vwap
    if htf:
        fL &= c > a.htf; fS &= c < a.htf
    if adx_min > 0:
        x = a.adx >= adx_min; fL &= x; fS &= x
    setL = haL & volok & (c > sma) & fL & (direction != "short")
    setS = haS & volok & (c < sma) & fS & (direction != "long")
    flat = (a.cmin >= flat_min) & (a.tmin < 1080)
    can = (a.dow < 5) & (a.tmin >= win[0]) & (a.tmin < win[1]) & ~flat
    om = {"reverse": 0, "close": 1, "ignore": 2}[opp]
    pnl, eb, xb, why = _run(a.o, a.h, a.l, c, a.atr, upx, dnx, setL, setS, can, flat, memory, slM, tpM,
                            min_stop, max_qty, fixed_qty, max_loss, max_profit, 2 * fee, slip, om,
                            fill == "next_open", exact)
    return pnl, eb, xb, why


def stats(d, pnl, eb):
    sessions = arrays(d).sessions
    n = len(pnl)
    return dict(trades=n, per_session=n / max(sessions, 1), win=(pnl > 0).mean() if n else float("nan"),
                net=pnl.sum(), avg=pnl.mean() if n else float("nan"))


def data(tf=1):
    return add_features(indicators(load(tf)))
