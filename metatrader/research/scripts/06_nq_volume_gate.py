#!/usr/bin/env python3
"""The one place where anything looked positive: S1 (box reclaim) with the volume filter on real NQ futures volume.

    python3 scripts/06_nq_volume_gate.py

Data: getdata-finance NQ 1-minute FREE SAMPLE (Apr-Sep 2026, mostly regular hours, real CME volume), 13 off-grid sessions removed
(see py/datasets.py). About 100 sessions - far too few to prove anything; this script exists to show how fragile the result is.

Parts
  A  volume-gate variants x slippage x signal timeframe (the chat's own geometry: SL 1.5 x box, TP 1.0 x box)
  B  placebo: the same S1 + gate at EVERY 5-minute anchor between 09:30 and 14:30 ET (not only the chat's times). If the chat's
     anchors are not special, the "edge" is a generic property of the sample (or noise), not of the clock times.
  C  stability: by month and first/second half
  D  geometry sensitivity (SL x TP), showing the result is not a plateau
  E  the same volume gate on 10 years of gold M1
Output: research/results/nq_volume_gate.txt
"""
import io
import os
import warnings

import numpy as np
import pandas as pd

from engine_io import (RESEARCH, anchor, load_series, run_engine, stats)

warnings.filterwarnings('ignore')
NQ_ANCH = [anchor('NY0930', 'NY', 930), anchor('NY1000', 'NY', 1000), anchor('NY1100', 'NY', 1100),
           anchor('NY1300', 'NY', 1300), anchor('NY1400', 'NY', 1400)]
S1_ONLY = 1                     # sleeve mask: S1 only
FLAT, MINFLAT = 1610, 10        # regular-hours sample ends 16:14 ET


def s1_params(vol_max=1.0, sl=1.5, tp=1.0, box=15):
    p = [15, 120, 1.5, 1.0, 1.0, 1.0, 0.4, 2.5, 60, 1, 0.05]
    p[0], p[2], p[3], p[4] = box, sl, tp, vol_max
    return {0: p}


def s1(a, anchors, sig=5, vol_max=1.0, slip=0.25, sl=1.5, tp=1.0, tag='nq_s1'):
    T, _ = run_engine(a, 1, sig, anchors, tag=tag, slip=slip, maxcost=0.5, flat=FLAT, minflat=MINFLAT,
                      params=s1_params(vol_max, sl, tp), sleeve_mask=S1_ONLY)
    return T[T['sleeve'] == 'S1_BoxReclaim'].sort_values('tEntry').reset_index(drop=True)


def row(label, T):
    s = stats(T['r'], T['spread'] / T['risk']) if len(T) else stats([])
    return dict(label=label, n=s['n'], wr=s['wr'], avgR=s['avgR'], t=s['t'], PF=s['PF'], sumR=s['sumR'])


def fmt(df):
    return df.round(3).to_string(index=False)


def main():
    a = load_series('nq_m1')
    days = pd.to_datetime(a['t'], unit='s').normalize().nunique()
    out = io.StringIO()

    def P(*x):
        print(*x); print(*x, file=out)

    P(f"NQ sample: {len(a)} one-minute bars, {days} calendar days with data (after removing off-grid sessions)\n")

    # ---- A
    P("=== A. S1 with different volume gates (volMax = max excursion volume / box volume; 0 = gate off) ===")
    rows = []
    for sig in (5, 1, 15):
        for vm in (0.0, 1.0, 0.7, 0.5):
            for slip in (0.25, 1.0):
                T = s1(a, NQ_ANCH, sig, vm, slip)
                rows.append(row(f"sig M{sig:<2d} vol<={vm if vm else 'off':<4} slip {slip}", T))
    P(fmt(pd.DataFrame(rows)))

    # ---- B
    P("\n=== B. placebo: S1 (vol<=0.7, M5 signals, 0.25 slip) at every 5-minute anchor 09:30-14:30 ET ===")
    slots = [h * 100 + m for h in range(9, 15) for m in range(0, 60, 5) if 930 <= h * 100 + m <= 1430]
    res = []
    for i in range(0, len(slots), 10):                       # the engine holds at most 12 anchors per run
        chunk = slots[i:i + 10]
        T = s1(a, [anchor(f'NY{h:04d}', 'NY', h) for h in chunk], 5, 0.7, 0.25, tag='nq_s1_placebo')
        for an, g in T.groupby('anchor'):
            s = stats(g['r']); s['anchor'] = an; res.append(s)
    R = pd.DataFrame(res).set_index('anchor')
    R = R.reindex([f'NY{h:04d}' for h in slots]).dropna(subset=['n'])
    chat = R.loc[[x for x in ('NY0930', 'NY1000', 'NY1100', 'NY1300', 'NY1400') if x in R.index]]
    P(f"anchors tested {len(R)}; median avgR {R.avgR.median():+.3f}; share of anchors with avgR>0: {(R.avgR > 0).mean():.2f}; "
      f"share with t>=2: {(R.t >= 2).mean():.2f}; best t {R.t.max():.2f} ({R.t.idxmax()})")
    P("the chat's anchors:")
    P(fmt(chat[['n', 'wr', 'avgR', 't']].reset_index()))
    rank = {a_: int((R.avgR > R.loc[a_, 'avgR']).sum()) + 1 for a_ in chat.index}
    P(f"rank of each chat anchor by avgR among {len(R)} anchors: {rank}")

    # ---- C
    P("\n=== C. stability of the headline configuration (M5 signals, vol<=0.7, 0.25 slip, chat anchors) ===")
    T = s1(a, NQ_ANCH, 5, 0.7, 0.25)
    P(fmt(pd.DataFrame([row('ALL', T)] + [row(an, g) for an, g in T.groupby('anchor')])))
    T['month'] = pd.to_datetime(T['tEntry'], unit='s').dt.strftime('%Y-%m')
    P("by month:\n" + T.groupby('month')['r'].agg(['count', 'mean', 'sum']).round(2).T.to_string())
    mid = T['tEntry'].median()
    P(fmt(pd.DataFrame([row('first half', T[T.tEntry < mid]), row('second half', T[T.tEntry >= mid])])))
    P(f"bootstrap over trades: P(avgR<=0) = {(np.random.default_rng(1).choice(T['r'].values, (20000, len(T))).mean(1) <= 0).mean():.3f}")

    # ---- D
    P("\n=== D. geometry sensitivity (vol<=0.7, 0.25 slip): stop x target, in box heights ===")
    g = []
    for sl in (1.0, 1.5, 2.0):
        for tp in (0.75, 1.0, 1.5):
            g.append(row(f"SL {sl} / TP {tp}", s1(a, NQ_ANCH, 5, 0.7, 0.25, sl, tp)))
    P(fmt(pd.DataFrame(g)))
    # ---- E
    P("\n=== E. the same gate on 10 years of XAUUSD M1 (real bid/ask, tick volume), same anchors, M5 signals ===")
    try:
        gold = load_series('xauusd_m1')
    except FileNotFoundError:
        P('xauusd_m1 cache not built - skipped')
    else:
        cut = int(pd.Timestamp('2021-09-01').timestamp())
        rows = []
        for vm in (0.0, 1.0, 0.7, 0.5):
            T, _ = run_engine(gold, 1, 5, NQ_ANCH, tag='xau_s1', slip=0.0, maxcost=0.5, flat=1650, minflat=MINFLAT,
                              params=s1_params(vm), sleeve_mask=S1_ONLY)
            T = T[T['sleeve'] == 'S1_BoxReclaim']
            for per, x in (('dev', T[T.tEntry < cut]), ('oos', T[T.tEntry >= cut])):
                rows.append(row(f"vol<={vm if vm else 'off'} {per}", x))
        P(fmt(pd.DataFrame(rows)))
    with open(os.path.join(RESEARCH, 'results', 'nq_volume_gate.txt'), 'w') as f:
        f.write(out.getvalue())


if __name__ == '__main__':
    main()
