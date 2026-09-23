"""Simulator for "always in, fixed $ bracket" bots on MNQ (decisions on 5-min candles).

Model of the bot described by the user:
  • fixed contract count (e.g. 30 MNQ) → target $1,500 / stop $2,000 become fixed point distances
  • decisions at 5-minute candle closes, orders fill at the next 1-minute open (NinjaTrader style)
  • after a win it keeps the same direction; after a loss it may flip (several flip rules)
  • exits are checked on 1-minute bars (more accurate than 5-minute OHLC)
"""
import math
import numpy as np
import pandas as pd
from numba import njit

import fastsim as fs

TICK, PV = 0.25, 2.0
TV = TICK * PV

# direction-rule codes for the "entry direction" signal
RULES = ["random", "candle", "candle_rev", "trend_1h", "vwap", "orb30", "day_open"]


def features(tf_entry=5):
    d = fs.data(1)
    idx = d.index
    tmin = d.tmin.to_numpy()
    # 1-min bar that closes a 5-min candle (…:04, :09, … open times)
    is_dec = ((tmin + 1) % tf_entry) == 0
    # direction of the 5-min candle that just closed
    grp = (tmin // tf_entry)
    day = np.asarray(pd.Index(idx.date).factorize()[0])
    key = day * 10000 + grp
    first_open = pd.Series(d.open.to_numpy()).groupby(key).transform("first").to_numpy()
    candle = np.sign(d.close.to_numpy() - first_open)
    # opening-range (09:30-10:00) direction once complete: +1 above its high, -1 below its low
    orh = np.full(len(d), np.nan); orl = np.full(len(d), np.nan)
    rth_or = (tmin >= 570) & (tmin < 600)
    s_or = pd.DataFrame({"h": d.high.where(rth_or), "l": d.low.where(rth_or), "day": day})
    hi = s_or.groupby("day").h.transform("max").to_numpy(); lo = s_or.groupby("day").l.transform("min").to_numpy()
    c = d.close.to_numpy()
    orb = np.where(tmin >= 600, np.where(c > hi, 1, np.where(c < lo, -1, 0)), 0)
    # day open (09:30) direction: price vs today's 09:30 open
    op930 = pd.Series(np.where(tmin == 570, d.open.to_numpy(), np.nan)).groupby(day).transform("max").to_numpy()
    day_open = np.where(np.isnan(op930), 0, np.sign(c - op930))
    sig = {
        "candle": candle,
        "candle_rev": -candle,
        "trend_1h": np.where(np.isnan(d.htf.to_numpy()), 0, np.sign(c - d.htf.to_numpy())),
        "vwap": np.where(np.isnan(d.vwap.to_numpy()), 0, np.sign(c - d.vwap.to_numpy())),
        "orb30": orb,
        "day_open": day_open,
    }
    return d, is_dec, day, {k: v.astype(np.int64) for k, v in sig.items()}


@njit(cache=True)
def _run(o, h, l, c, tmin, cmin, dow, day, is_dec, sig, rand, qty, slT, tpT, fee_rt, slip,
         mode, flip_rule, fast_k, win_start, win_end, flat_min, max_trades_day, lim_through):
    """mode 0: fresh direction from `sig` at every entry.
       mode 1: persist — first trade of the day from `sig`, keep direction after a win,
               after a loss apply flip_rule: 0 never flip, 1 always flip,
               2 flip if the stop was hit within fast_k minutes ("big pullback"),
               3 flip if it took longer than fast_k minutes, 4 re-read `sig`."""
    n = len(o)
    pnl = np.zeros(n); dur = np.zeros(n, np.int64); dirs = np.zeros(n, np.int64); why = np.zeros(n, np.int64); dd = np.zeros(n, np.int64)
    nt = 0
    pos = 0; ent = 0.0; eb = 0
    cur_dir = 0; pend = 0; last_day = -1; day_trades = 0
    for i in range(n):
        if day[i] != last_day:
            last_day = day[i]; cur_dir = 0; day_trades = 0
        # fill pending entry at this open
        if pend != 0 and pos == 0:
            pos = pend; ent = o[i] + pos * slip * TICK; eb = i; pend = 0
        pend = 0
        # exits inside the bar
        if pos != 0:
            stop = ent - pos * slT * TICK
            tp = ent + pos * tpT * TICK
            hs = (l[i] <= stop) if pos > 0 else (h[i] >= stop)
            # limit target: price must trade `lim_through` ticks beyond it (NinjaTrader default: 1)
            ht = (h[i] >= tp + lim_through * TICK) if pos > 0 else (l[i] <= tp - lim_through * TICK)
            if hs and ht:
                high_first = abs(h[i] - o[i]) < abs(l[i] - o[i])
                tf = high_first if pos > 0 else not high_first
                hs = not tf; ht = tf
            exited = False; won = False
            if hs:
                px = (min(o[i], stop) if pos > 0 else max(o[i], stop)) - pos * slip * TICK
                pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; why[nt] = 0; exited = True
            elif ht:
                px = max(o[i], tp) if pos > 0 else min(o[i], tp)
                pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; why[nt] = 1; exited = True; won = True
            elif cmin[i] >= flat_min and tmin[i] < 1080:
                px = c[i] - pos * slip * TICK
                pnl[nt] = pos * (px - ent) * PV * qty - qty * fee_rt; why[nt] = 2; exited = True; won = pnl[nt] > 0
            if exited:
                dur[nt] = i - eb + 1; dirs[nt] = pos; dd[nt] = day[i]; nt += 1
                if mode == 1:
                    if won:
                        cur_dir = pos
                    else:
                        if flip_rule == 0:
                            cur_dir = pos
                        elif flip_rule == 1:
                            cur_dir = -pos
                        elif flip_rule == 2:
                            cur_dir = -pos if (i - eb + 1) <= fast_k else pos
                        elif flip_rule == 3:
                            cur_dir = -pos if (i - eb + 1) > fast_k else pos
                        else:
                            cur_dir = 0
                pos = 0
        # new entry at 5-min decision points
        if pos == 0 and is_dec[i] and dow[i] < 5 and tmin[i] >= win_start and tmin[i] < win_end \
                and not (cmin[i] >= flat_min and tmin[i] < 1080) \
                and (max_trades_day == 0 or day_trades < max_trades_day):
            d = 0
            if mode == 1 and cur_dir != 0:
                d = cur_dir
            else:
                d = sig[i] if sig[i] != 0 else 0
                if rand:
                    d = 1 if np.random.random() < 0.5 else -1
            if d != 0:
                pend = d; cur_dir = d; day_trades += 1
    return pnl[:nt], dur[:nt], dirs[:nt], why[:nt], dd[:nt]


def run(F, rule="candle", qty=30, max_loss=2000.0, max_profit=1500.0, fee=0.62, slip=1, mode=1,
        flip_rule=1, fast_k=10, win=(570, 945), flat_min=955, max_trades_day=0, seed=None, sl_ticks=None, tp_ticks=None,
        lim_through=1):
    d, is_dec, day, sig = F
    fee_rt = 2 * fee
    slT = sl_ticks if sl_ticks else int(math.floor((max_loss / qty - fee_rt) / TV)) - slip
    tpT = tp_ticks if tp_ticks else int(math.floor(max_profit / (qty * TV)))
    a = fs.arrays(d)
    rand = rule == "random"
    s = np.zeros(a.n, np.int64) if rand else sig[rule]
    if seed is not None:
        _seed(seed)
    return _run(a.o, a.h, a.l, a.c, a.tmin, a.cmin, a.dow, day, is_dec, s, rand, qty, slT, tpT, fee_rt, slip,
                mode, flip_rule, fast_k, win[0], win[1], flat_min, max_trades_day, lim_through)


@njit(cache=True)
def _seed(s):
    np.random.seed(s)


def summary(res, sessions):
    pnl, dur, dirs, why, dd = res
    n = len(pnl)
    return dict(trades=n, per_session=n / sessions, win=float((pnl > 0).mean()) if n else float("nan"),
                net=float(pnl.sum()), time_exits=float((why == 2).mean()) if n else 0.0,
                avg_minutes=float(dur.mean()) if n else 0.0)
