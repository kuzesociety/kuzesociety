#!/usr/bin/env python3
"""Evaluate the five setups on YOUR broker's data (a CSV written by MQL5/Scripts/KuzeEdge/KuzeExport.mq5).

    python3 scripts/07_evaluate_export.py export_US100_M5.csv --class us_index [--sig 5] [--spread 1.5] [--slip 0] [--split 2025-01-01]

What it does
  * runs the EA's own engine over the file with your spreads (bid/ask-aware fills, costs inside R)
  * splits the data in two by time (development / hold-out); nothing is tuned on the hold-out
  * prints setup x anchor tables, the volume-gate variants of S1, and the cells that are positive in BOTH halves
  * says how many cells were tested, because with K cells the best few will look good by chance alone

It never says "profitable": it tells you which cells are worth keeping in SHADOW mode on a demo account to see if they hold up forward.
"""
import argparse
import warnings
from statistics import NormalDist

import numpy as np
import pandas as pd

from engine_io import A_BTC, A_GLOBAL, run_engine, stats
from datasets import read_mt5csv

warnings.filterwarnings('ignore')


def infer_tf(t):
    d = np.diff(t)
    d = d[(d > 0) & (d <= 3600)]
    return int(np.median(d) // 60)


def fmt(df):
    return df.round(3).to_string(index=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv')
    ap.add_argument('--class', dest='cls', default='us_index', choices=['us_index', 'eu_index', 'fx', 'metal', 'energy', 'crypto'])
    ap.add_argument('--sig', type=int, default=5, help='signal bar in minutes (1, 5 or 15; must be a multiple of the file timeframe)')
    ap.add_argument('--spread', type=float, default=None, help='override the spread (price units) if the file has none / zeros')
    ap.add_argument('--slip', type=float, default=0.0, help='extra slippage per side (price units)')
    ap.add_argument('--split', default=None, help='dev / hold-out split date (default: midpoint of the data)')
    ap.add_argument('--flat', type=int, default=1650, help='forced flat time HHMM New York (default 1650)')
    args = ap.parse_args()

    a = read_mt5csv(args.csv)
    tf = infer_tf(a['t'])
    sp0 = a['ao'] - a['o']
    print(f"{args.csv}: {len(a)} bars of {tf} min, {pd.to_datetime(a['t'][0], unit='s')} -> {pd.to_datetime(a['t'][-1], unit='s')} UTC")
    print(f"spread in file: median {np.median(sp0):.5g}  mean {sp0.mean():.5g}  max {sp0.max():.5g}")
    if args.spread is not None:
        for k in ('o', 'h', 'l', 'c'):
            a['a' + k] = a[k] + args.spread
        print(f"spread overridden with {args.spread} (price units)")
    elif np.median(sp0) == 0:
        print("WARNING: the file has (almost) no spread information, so every result below is GROSS of the spread and therefore too optimistic.\n"
              "         Re-run with --spread <typical spread in price units> (e.g. --spread 1.5 for a 1.5-point US100 spread).")
    flat = (args.flat // 100) * 60 + args.flat % 100
    flat = (flat // tf) * tf                                        # reachable on this chart timeframe
    flat_hhmm = (flat // 60) * 100 + flat % 60
    anchors = A_BTC if args.cls == 'crypto' else A_GLOBAL
    T, _ = run_engine(a, tf, args.sig, anchors, tag='export', slip=args.slip, maxcost=0.5, flat=flat_hhmm, minflat=10)
    cut = int(pd.Timestamp(args.split).timestamp()) if args.split else int(np.median(a['t']))
    T['period'] = np.where(T['tEntry'] < cut, 'dev', 'oos')
    print(f"split at {pd.to_datetime(cut, unit='s')} UTC: dev trades {int((T.period == 'dev').sum())}, hold-out trades {int((T.period == 'oos').sum())}\n")

    rows = []
    for (sl, an, per), g in T.groupby(['sleeve', 'anchor', 'period']):
        s = stats(g['r'], g['spread'] / g['risk']); s.update(sleeve=sl, anchor=an, period=per); rows.append(s)
    M = pd.DataFrame(rows)
    if M.empty:
        raise SystemExit('no trades produced - check the timeframe / class / date range')

    print("=== per setup (all anchors) ===")
    pr = []
    for (sl, per), g in T.groupby(['sleeve', 'period']):
        s = stats(g['r'], g['spread'] / g['risk']); s.update(sleeve=sl, period=per); pr.append(s)
    print(fmt(pd.DataFrame(pr)[['sleeve', 'period', 'n', 'wr', 'avgR', 't', 'PF', 'costR']]))

    wide = M.pivot_table(index=['sleeve', 'anchor'], columns='period', values=['n', 'avgR', 't'], aggfunc='first')
    wide.columns = [f'{a_}_{b}' for a_, b in wide.columns]
    wide = wide.dropna().reset_index()
    K = len(wide)
    cand = wide[(wide.n_dev >= 50) & (wide.n_oos >= 50) & (wide.avgR_dev > 0.05) & (wide.avgR_oos > 0.05) & (wide.t_oos >= 1.5)]
    print(f"\n=== cells (setup x anchor) with >=50 trades in each half: {int(((wide.n_dev >= 50) & (wide.n_oos >= 50)).sum())} of {K} tested ===")
    print(f"Candidates (avgR > +0.05 net in BOTH halves and hold-out t >= 1.5): {len(cand)}")
    if len(cand):
        print(fmt(cand))
    zbar = NormalDist().inv_cdf(1 - 0.05 / max(K, 1))
    print(f"\nHow to read this: with {K} cells and no real edge at all you still expect several to look positive in one half and a few in both.\n"
          f"A cell deserves attention only if its hold-out t-statistic clears the multiple-testing bar (one-sided 5% over {K} cells: t > {zbar:.1f}),\n"
          f"neighbouring anchors / markets agree, and it keeps working in weeks of forward SHADOW trading on a demo account.")

    print("\n=== S1 (box reclaim) volume gate, all anchors pooled (uses YOUR broker's tick volume) ===")
    rows = []
    for vm in (0.0, 1.0, 0.7, 0.5):
        p = [15, 120, 1.5, 1.0, vm, 1.0, 0.4, 2.5, 60, 1, 0.05]
        Tv, _ = run_engine(a, tf, args.sig, anchors, tag='export_s1', slip=args.slip, maxcost=0.5, flat=flat_hhmm, minflat=10,
                           params={0: p}, sleeve_mask=1)
        Tv = Tv[Tv['sleeve'] == 'S1_BoxReclaim']
        for per, g in (('dev', Tv[Tv['tEntry'] < cut]), ('oos', Tv[Tv['tEntry'] >= cut])):
            st = stats(g['r'], g['spread'] / g['risk'])
            rows.append(dict(volume_gate='off' if vm == 0 else f'<={vm}', period=per, n=st['n'], wr=st['wr'], avgR=st['avgR'], t=st['t'], PF=st['PF']))
    print(fmt(pd.DataFrame(rows)))
    print("\nNext: attach KuzeEdge in SHADOW mode on a demo account for the same symbol; compare its ledger with these numbers.")


if __name__ == '__main__':
    main()
