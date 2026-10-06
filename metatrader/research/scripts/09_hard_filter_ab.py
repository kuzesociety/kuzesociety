#!/usr/bin/env python3
"""A/B test of the chat's PDH / PDL "hard filters" ("never sell above PDH AND the open", "never buy at/below PDL").

The chat says of the PDH/PDL filter: "has a hard edge - must be A/B tested". Here it is, on every series and every setup:
run the engine with the filter OFF and ON; the ON trades are a strict subset of the OFF trades, so the REMOVED trades are the
difference. If the filter had information, the removed trades would be clearly worse than the kept ones, in both halves.

    python3 scripts/09_hard_filter_ab.py       ->  research/results/hard_filter_ab.txt
"""
import importlib.util
import io
import os
import warnings

import numpy as np
import pandas as pd

from engine_io import RESEARCH, load_series, run_engine

warnings.filterwarnings('ignore')
spec = importlib.util.spec_from_file_location('m02', os.path.join(os.path.dirname(os.path.abspath(__file__)), '02_engine_matrix.py'))
m02 = importlib.util.module_from_spec(spec); spec.loader.exec_module(m02)


def welch_t(a, b):
    if len(a) < 2 or len(b) < 2:
        return np.nan
    return (a.mean() - b.mean()) / np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))


def main():
    out = io.StringIO()

    def P(*x):
        print(*x); print(*x, file=out)

    rows = []
    for gross in (False, True):
        kept_all, rem_all = [], []
        for name, cache, chart, sig, anchors, split, slip, flat in m02.SERIES:
            try:
                a = load_series(cache)
            except FileNotFoundError:
                continue
            kw = dict(slip=0.0 if gross else slip, maxcost=0.5, flat=flat, minflat=m02.MIN_TO_FLAT, zero_spread=gross)
            off, _ = run_engine(a, chart, sig, anchors, tag=cache + '_off', ctx=0, **kw)
            on, _ = run_engine(a, chart, sig, anchors, tag=cache + '_on', ctx=3, **kw)
            key = lambda d: d['sleeve'] + '|' + d['anchor'] + '|' + d['tEntry'].astype(str)
            keep = key(off).isin(set(key(on)))
            assert int(keep.sum()) == len(on), 'filter ON must produce a strict subset of the filter OFF trades'
            cut = int(pd.Timestamp(split).timestamp()) if split else int(off['tEntry'].median())
            for lab, g in (('kept', off[keep]), ('removed', off[~keep])):
                g = g.assign(period=np.where(g['tEntry'] < cut, 'dev', 'oos'), series=name, group=lab, gross=gross)
                (kept_all if lab == 'kept' else rem_all).append(g)
        K, R = pd.concat(kept_all), pd.concat(rem_all)
        P(f"\n=== {'GROSS (no spread / slippage)' if gross else 'NET of costs'} : filter ON keeps {len(K):,} of {len(K) + len(R):,} trades ===")
        for per in ('dev', 'oos'):
            k, r = K[K.period == per]['r'].clip(-3, 5), R[R.period == per]['r'].clip(-3, 5)
            P(f"{per}: kept n={len(k):7d} avgR {k.mean():+.4f} | removed n={len(r):7d} avgR {r.mean():+.4f} | kept - removed {k.mean() - r.mean():+.4f} (Welch t {welch_t(k, r):+.2f})")
        per_series = []
        for s_, g in pd.concat([K, R]).groupby('series'):
            d = {}
            for per in ('dev', 'oos'):
                k = g[(g.group == 'kept') & (g.period == per)]['r'].clip(-3, 5); r = g[(g.group == 'removed') & (g.period == per)]['r'].clip(-3, 5)
                d[per] = k.mean() - r.mean() if len(k) > 30 and len(r) > 30 else np.nan
            per_series.append(d)
        ps = pd.DataFrame(per_series).dropna()
        P(f"series where kept beats removed: dev {(ps.dev > 0).sum()} / {len(ps)}, oos {(ps.oos > 0).sum()} / {len(ps)}, both {((ps.dev > 0) & (ps.oos > 0)).sum()}")
        rows.append((gross, K, R))
    net_K = rows[0][1]
    P("\nKept-trades net result by setup (filter ON):")
    t = net_K.groupby('sleeve')['r'].agg(['count', 'mean']).round(4)
    P(t.to_string())
    with open(os.path.join(RESEARCH, 'results', 'hard_filter_ab.txt'), 'w') as f:
        f.write(out.getvalue())


if __name__ == '__main__':
    main()
