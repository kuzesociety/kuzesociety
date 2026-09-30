#!/usr/bin/env python3
"""Evidence matrix: the five chat-derived sleeves, frozen at their extracted parameters, run by the EA's own
engine over every dataset series, split into a development period and an out-of-sample period.

    python3 scripts/02_engine_matrix.py [--only NAME ...] [--last-bars N]

Nothing is tuned here: the parameters are the ones extracted from the chat (KzDefaultParams). Costs are inside R
(long pays the ask, short exits at the ask, plus optional slippage). Outputs (research/results/):
    engine_matrix.csv           series x sleeve x period
    engine_matrix_anchor.csv    series x sleeve x anchor x period
and (git-ignored) research/out/all_trades.pkl for scripts/04_gating_vs_random.py
"""
import argparse
import io
import os
import time
import warnings

import numpy as np
import pandas as pd

from engine_io import (A_BTC, A_GLOBAL, A_NQ_RTH, OUT, RESEARCH, SLEEVES, load_series, run_engine, stats)

warnings.filterwarnings('ignore')
RESULTS = os.path.join(RESEARCH, 'results')
os.makedirs(RESULTS, exist_ok=True)

# name, cache file, chart TF (min), signal TF (min), anchors, dev/OOS split date (None = halves), slippage per side (price units), flat HHMM (New York)
# The flat time must be reachable in the data: aligned to the chart TF (M15 -> 16:45) and, for the regular-hours futures
# sample whose last bar is 16:14 ET, 16:10. Otherwise a trade could only be "flattened" by the next session's gap open.
SERIES = [('XAUUSD-M1', 'xauusd_m1', 1, 5, A_GLOBAL, '2021-09-01', 0.0, 1650),
          ('BTCUSD-M1', 'btc_m1', 1, 5, A_BTC, '2020-01-01', 0.0, 1650)]
SERIES += [(s.upper() + '-M15', s + '_m15', 15, 15, A_GLOBAL, '2018-01-01', 0.0, 1645)
           for s in ('xauusd', 'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'eurjpy', 'gbpjpy', 'eurgbp', 'eurchf', 'audjpy')]
SERIES += [(s.upper() + '-M5', s + '_m5', 5, 5, A_GLOBAL, '2022-04-01', 0.0, 1650)
           for s in ('nas100', 'us500', 'us30', 'dax', 'ftse', 'xau5', 'eurusd5')]
SERIES += [('NQ-M1-RTH', 'nq_m1', 1, 5, A_NQ_RTH, None, 0.25, 1610)]     # futures sample: real volume, 1 tick spread + 1 tick slippage/side
MIN_TO_FLAT = 10                                                        # same default as the EA (InpMinToFlatMin)


def periods(T, split):
    if split is None:                       # short sample: first half / second half by time
        cut = int(T['tEntry'].median()) if len(T) else 0
    else:
        cut = int(pd.Timestamp(split).timestamp())
    return {'dev': T[T['tEntry'] < cut], 'oos': T[T['tEntry'] >= cut]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', help='cache names to run (e.g. xauusd_m1 nq_m1)')
    ap.add_argument('--last-bars', type=int, default=0, help='use only the last N chart bars (smoke tests)')
    ap.add_argument('--gross', action='store_true', help='zero spread and zero slippage: is there any edge BEFORE costs?')
    ap.add_argument('--tag', default='')
    args = ap.parse_args()
    if args.gross and not args.tag:
        args.tag = 'gross'

    rows, arows, alltr = [], [], []
    t0 = time.time()
    for name, cache, chart, sig, anchors, split, slip, flat in SERIES:
        if args.only and cache not in args.only:
            continue
        try:
            a = load_series(cache)
        except FileNotFoundError:
            print(f"skip {name}: cache {cache}.npy not built (see fetch_data.sh / py/datasets.py)")
            continue
        if args.last_bars:
            a = a[-args.last_bars:]
        T, _ = run_engine(a, chart, sig, anchors, tag=cache, slip=0.0 if args.gross else slip, maxcost=0.5, flat=flat, minflat=MIN_TO_FLAT,
                          zero_spread=args.gross)
        T['series'] = name
        alltr.append(T)
        for sl in SLEEVES:
            for per, g in periods(T[T['sleeve'] == sl], split).items():
                s = stats(g['r'], g['spread'] / g['risk']); s.update(series=name, sleeve=sl, period=per)
                rows.append(s)
                for an, ga in g.groupby('anchor'):
                    s2 = stats(ga['r'], ga['spread'] / ga['risk']); s2.update(series=name, sleeve=sl, anchor=an, period=per)
                    arows.append(s2)
        print(f"{name:12s} bars {len(a):8d}  trades {len(T):7d}  avgR {T['r'].mean():+.3f}  ({time.time() - t0:5.0f}s)", flush=True)

    if not rows:
        raise SystemExit('nothing ran')
    M = pd.DataFrame(rows)[['series', 'sleeve', 'period', 'n', 'wr', 'avgR', 'medR', 't', 'PF', 'sumR', 'costR', 'nBig']]
    A = pd.DataFrame(arows)[['series', 'sleeve', 'anchor', 'period', 'n', 'wr', 'avgR', 'medR', 't', 'PF', 'sumR', 'costR', 'nBig']]
    suffix = ('_' + args.tag) if args.tag else ''
    M.round(4).to_csv(os.path.join(RESULTS, f'engine_matrix{suffix}.csv'), index=False)
    A.round(4).to_csv(os.path.join(RESULTS, f'engine_matrix_anchor{suffix}.csv'), index=False)
    D = pd.concat(alltr, ignore_index=True)
    D.to_pickle(os.path.join(OUT, f'all_trades{suffix}.pkl'))

    pd.set_option('display.width', 220)
    buf = io.StringIO()

    def P(*x):
        print(*x); print(*x, file=buf)

    pv = M.pivot_table(index=['series', 'sleeve'], columns='period', values=['n', 'avgR', 't'], aggfunc='first')
    P(pv.round(3).to_string())
    P('\n=== pooled ===')
    P(f"series {M.series.nunique()}  sleeves {len(SLEEVES)}  trades {len(D):,}  mean net R {D['r'].mean():+.4f}  win rate {(D['r'] > 0).mean():.3f}")
    for per in ('dev', 'oos'):
        g = M[(M.period == per) & (M.n >= 100)]
        P(f"{per}: cells (series x sleeve, n>=100) {len(g)}   avgR>0: {(g.avgR > 0).sum()}   t>=2: {(g.t >= 2).sum()}   "
          f"trade-weighted avgR {np.average(g.avgR, weights=g.n):+.4f}")
    both = M[M.n >= 100].pivot_table(index=['series', 'sleeve'], columns='period', values=['avgR', 't'], aggfunc='first').dropna()
    pos_both = both[(both[('avgR', 'dev')] > 0) & (both[('avgR', 'oos')] > 0)]
    P(f"cells positive in BOTH periods: {len(pos_both)} of {len(both)}")
    if len(pos_both):
        P(pos_both.round(3).to_string())
    with open(os.path.join(RESULTS, f'engine_matrix_summary{suffix}.txt'), 'w') as f:
        f.write(buf.getvalue())
    print(f"\nwrote {os.path.join(RESULTS, 'engine_matrix' + suffix + '.csv')} (+ _anchor, _summary)")


if __name__ == '__main__':
    main()
