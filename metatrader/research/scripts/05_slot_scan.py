#!/usr/bin/env python3
"""Time-of-day predictability map: is there ANY pair of 15-minute slots (i earlier, j later, same session day) whose returns are
correlated in a way that replicates out of sample? (This is the model-free version of "the 10:15 reversal", "the 13:00 candle wipes
the 10:00 one", "trade against the 5pm candle", ...: if such structure existed it would show up as a stable correlation.)

    python3 scripts/05_slot_scan.py

Method: session days start 17:00 ET (the daily roll; UTC 00:00 for BTC). For every slot pair (i<j) the correlation of slot returns is
measured across days in a DEVELOPMENT period and again in a HOLD-OUT period. With ~4,500 pairs per market, ~12 pairs per market are
expected to look "significant" (|t|>3) by chance alone. We ask whether |t|>=2.5 pairs keep their sign out of sample (50% = noise),
whether dev and OOS t-statistics correlate across pairs (0 = no persistent structure), and how many strong pairs replicate.
Adjacent slots are also reported separately because bid-ask bounce creates spurious short-lag structure that cannot be traded.

Output: research/results/slot_scan.txt
"""
import io
import os
import warnings

import numpy as np
import pandas as pd

from engine_io import RESEARCH, load_series      # engine_io also puts research/py on sys.path
from common import local_parts

warnings.filterwarnings('ignore')


def slot_matrix(t, mid_c, slot_min=15, day_start_min=18 * 60, clock='NY', weekday_ok=(0, 1, 2, 3, 4)):
    """(session-day index, matrix R [days x slots] of close-to-close log returns per slot, bars-per-slot count)."""
    day, mod, _ = local_parts(t, clock)
    shifted = (mod - day_start_min) % 1440
    sd = day + (mod >= day_start_min).astype(np.int64)          # session day = date at the END of the session
    nslots = 1440 // slot_min
    key = sd * nslots + shifted // slot_min
    chg = np.flatnonzero(np.diff(key)) + 1
    st = np.concatenate(([0], chg)); en = np.concatenate((chg, [len(t)]))
    kk = key[st]; lastc = np.log(mid_c[en - 1])
    sdays = np.unique(sd)
    sidx = {d: i for i, d in enumerate(sdays)}
    C = np.full((len(sdays), nslots), np.nan)
    N = np.zeros((len(sdays), nslots))
    for k, cval, n in zip(kk, lastc, (en - st)):
        C[sidx[k // nslots], k % nslots] = cval; N[sidx[k // nslots], k % nslots] = n
    R = np.full_like(C, np.nan)
    R[:, 1:] = C[:, 1:] - C[:, :-1]
    R[1:, 0] = C[1:, 0] - C[:-1, -1]
    wdays = (sdays + 3) % 7
    ok = np.isin(wdays, weekday_ok)
    return sdays[ok], R[ok], N[ok]


def pair_scan(R, min_n=300):
    nd, ns = R.shape
    Z = R.copy()
    for s in range(ns):                                            # winsorise each slot at 4 sigma
        x = Z[:, s]; m = np.nanmean(x); sd = np.nanstd(x)
        if sd > 0:
            Z[:, s] = np.clip(x, m - 4 * sd, m + 4 * sd)
    out = []
    for i in range(ns):
        xi = Z[:, i]
        for j in range(i + 1, ns):
            xj = Z[:, j]
            ok = ~np.isnan(xi) & ~np.isnan(xj)
            n = int(ok.sum())
            if n < min_n:
                continue
            a, b = xi[ok], xj[ok]
            if a.std() == 0 or b.std() == 0:
                continue
            r = np.corrcoef(a, b)[0, 1]
            out.append((i, j, n, r, r * np.sqrt((n - 2) / max(1e-12, 1 - r * r))))
    return pd.DataFrame(out, columns=['i', 'j', 'n', 'r', 't'])


def run(name, a, split, clock='NY', day_start=17 * 60, wdays=(0, 1, 2, 3, 4), min_n=200, P=print):
    mid = (a['c'] + a['ac']) / 2
    sdays, R, _ = slot_matrix(a['t'], mid, 15, day_start, clock, wdays)
    cut = int(pd.Timestamp(split).timestamp() // 86400)
    dev = sdays < cut
    d, o = pair_scan(R[dev], min_n), pair_scan(R[~dev], min_n)
    m = d.merge(o, on=['i', 'j'], suffixes=('_dev', '_oos'))
    if len(m) < 50:
        P(f"{name:9s} too few pairs ({len(m)})"); return None
    sel = m[m.t_dev.abs() >= 2.5]
    agree = (np.sign(sel.r_dev) == np.sign(sel.r_oos)).mean() if len(sel) else np.nan
    strong = m[m.t_dev.abs() >= 4]
    rep = strong[(np.sign(strong.r_dev) == np.sign(strong.r_oos)) & (strong.t_oos.abs() >= 2.5)]
    non = m[(m.j - m.i) >= 2]
    sel2 = non[non.t_dev.abs() >= 2.5]
    agree2 = (np.sign(sel2.r_dev) == np.sign(sel2.r_oos)).mean() if len(sel2) else np.nan
    P(f"{name:9s} days dev/oos {int(dev.sum()):5d}/{int((~dev).sum()):5d}  pairs {len(m):5d}  corr(t_dev,t_oos) {np.corrcoef(m.t_dev, m.t_oos)[0, 1]:+.3f}  "
      f"|t_dev|>=2.5: n={len(sel):4d} sign-agree {agree:.2f} | non-adjacent n={len(sel2):4d} agree {agree2:.2f} | strong(>=4) {len(strong):3d} replicate {len(rep):2d}")
    return m


def main():
    out = io.StringIO()

    def P(*x):
        print(*x); print(*x, file=out)

    jobs = [('BTC', 'btc_m1', '2020-01-01', dict(clock='UTC', day_start=0, wdays=range(7)))]
    jobs += [(s.upper(), s + '_m15', '2018-01-01', {}) for s in
             ('eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'eurjpy', 'gbpjpy', 'eurgbp', 'eurchf', 'audjpy', 'xauusd')]
    jobs += [('XAU-M1', 'xauusd_m1', '2021-09-01', {})]
    jobs += [(s.upper(), s + '_m5', '2022-04-01', dict(min_n=150)) for s in ('nas100', 'us500', 'us30', 'dax', 'ftse')]
    P("sleeve-free test: does return in slot i predict return in slot j later the same session day, and does that survive out of sample?")
    P("(50% sign agreement and ~0 correlation of t-statistics = noise; chance level of |t|>=4 pairs ~ 0.006% of pairs)\n")
    tab = []
    for name, cache, split, kw in jobs:
        try:
            a = load_series(cache)
        except FileNotFoundError:
            P(f"skip {name}: cache missing"); continue
        m = run(name, a, split, P=P, **kw)
        if m is not None:
            tab.append(dict(name=name, corr_t=np.corrcoef(m.t_dev, m.t_oos)[0, 1]))
    if tab:
        c = np.array([x['corr_t'] for x in tab])
        P(f"\ncorr(t_dev, t_oos) across {len(tab)} markets: mean {c.mean():+.3f}, min {c.min():+.3f}, max {c.max():+.3f}")
    with open(os.path.join(RESEARCH, 'results', 'slot_scan.txt'), 'w') as f:
        f.write(out.getvalue())


if __name__ == '__main__':
    main()
