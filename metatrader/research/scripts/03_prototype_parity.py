#!/usr/bin/env python3
"""Parity test: the EA's engine (MQL5 source compiled as C++) versus the independent numba research prototype (py/proto.py).

Both implementations were written separately; if they agree trade-for-trade (entry, exit, prices, R, exit reason) over
tens of thousands of trades, the MQL5 logic really is the logic that produced the research numbers.

    python3 scripts/03_prototype_parity.py [--quick]

The prototype rules are compared with the engine at its research settings: flat 16:50 ET, no min-time-to-flat guard.
"""
import argparse
import sys
import warnings

import numpy as np
import pandas as pd

from engine_io import A_GLOBAL, load_series, run_engine

warnings.filterwarnings('ignore')
PROTO_OF = {'S1_BoxReclaim': 'S1', 'S2_OpenExhaust': 'S2', 'S3_IBBreak': 'S4', 'S4_OpenRetest': 'S5', 'S5_LevelSweep': 'S6'}


def parity(name, a, chart_min, sig_min, anchors=A_GLOBAL, slip=0.0, maxcost=0.5, verbose=True):
    """Returns (n_python, n_engine, n_matched, only_python, only_engine, field_mismatches)."""
    from proto import default_params, make_sig_bars, run_sleeve, session_context, to_df
    T, _ = run_engine(a, chart_min, sig_min, anchors, tag='parity', slip=slip, maxcost=maxcost)
    T['sleeve'] = T['sleeve'].map(PROTO_OF)
    # the engine sees the bar-level spread on the ask side: give the prototype the same ask series
    sp = a['ao'] - a['o']
    a2 = a.copy()
    for k in ('o', 'h', 'l', 'c'):
        a2['a' + k] = a[k] + sp
    B = make_sig_bars(a2, sig_min)
    ctx = session_context(B, sig_min)
    params = default_params()
    frames = []
    ancs = [dict(name=x['name'], clock=x['clock'], minute=x['minute'], wd=x['wd']) for x in anchors]
    for s in ('S1', 'S2', 'S4', 'S5', 'S6'):
        d = to_df(run_sleeve(a2, B, ctx, s, params[s], ancs, sig_min, slip=slip, min_nv=1))
        d['sleeve'] = s
        frames.append(d)
    Pr = pd.concat(frames, ignore_index=True)
    Pr = Pr[Pr.spread / Pr.R0 <= maxcost]
    m = Pr.merge(T, left_on=['sleeve', 'anchor', 'entry_t'], right_on=['sleeve', 'anchor', 'tEntry'],
                 how='outer', suffixes=('_py', '_cpp'), indicator=True)
    both = m[m._merge == 'both']
    only_py, only_cpp = m[m._merge == 'left_only'], m[m._merge == 'right_only']
    tol = 1e-7
    bad = both[(both.dir_py != both.dir_cpp) | ((both.exit_t - both.tExit).abs() > 0) | ((both.entry_py - both.entry_cpp).abs() > tol) |
               ((both.exit_py - both.exit_cpp).abs() > tol) | ((both.R - both.r).abs() > 1e-6) | (both.why != both.reason)]
    if verbose:
        print(f"{name:34s} python {len(Pr):6d}  engine {len(T):6d}  matched {len(both):6d}  only-python {len(only_py):4d}  "
              f"only-engine {len(only_cpp):4d}  field mismatches {len(bad):4d}", flush=True)
    return len(Pr), len(T), len(both), len(only_py), len(only_cpp), len(bad)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quick', action='store_true')
    args = ap.parse_args()
    jobs = [('NQ M1 chart / M5 signal', 'nq_m1', 1, 5, 0.25, None), ('NQ M1 chart / M1 signal', 'nq_m1', 1, 1, 0.25, None),
            ('NQ M1 chart / M15 signal', 'nq_m1', 1, 15, 0.25, None), ('NAS100 M5 / M5', 'nas100_m5', 5, 5, 0.0, None),
            ('DAX M5 / M5', 'dax_m5', 5, 5, 0.0, None), ('EURUSD M15 / M15', 'eurusd_m15', 15, 15, 0.0, None),
            ('XAUUSD M1 (last 500k) / M5', 'xauusd_m1', 1, 5, 0.0, slice(-500000, None))]
    if args.quick:
        jobs = jobs[:1]
    tot = np.zeros(6, dtype=int)
    for name, cache, chart, sig, slip, sl in jobs:
        try:
            a = load_series(cache)
        except FileNotFoundError:
            print(f'skip {name}: cache {cache}.npy missing'); continue
        if sl is not None:
            a = a[sl]
        tot += np.array(parity(name, a, chart, sig, slip=slip))
    print(f"\nTOTAL python {tot[0]}  engine {tot[1]}  matched {tot[2]}  only-python {tot[3]}  only-engine {tot[4]}  mismatches {tot[5]}")
    sys.exit(0 if tot[3] == 0 and tot[4] == 0 and tot[5] == 0 and tot[2] > 0 else 1)


if __name__ == '__main__':
    main()
