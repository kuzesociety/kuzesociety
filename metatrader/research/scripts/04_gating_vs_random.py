#!/usr/bin/env python3
"""Does the rolling evidence gate (the EA's adaptive filter) select better trades than chance?

For every cell (series x sleeve x anchor) the trades are replayed in time order. A trade is "taken" only if the PREVIOUS N trades of
its cell pass the gate (shrunk mean R >= theta and t-stat >= z) - exactly the information the EA has live. The control takes the
SAME NUMBER of trades per cell, chosen at random. If the gate has skill, gated avgR should beat the control.

    python3 scripts/04_gating_vs_random.py        (needs research/out/all_trades.pkl from 02_engine_matrix.py)

Output: research/results/gating_vs_random.csv
"""
import itertools
import os
import warnings

import numpy as np
import pandas as pd

from engine_io import OUT, RESEARCH

warnings.filterwarnings('ignore')


def gate_take(R, N, min_n, theta, z, prior_k=20.0, prior_mu=-0.05):
    """Boolean array: trade i is taken if the previous <=N trades pass the gate (vectorised, causal)."""
    R = np.asarray(R, float)
    n = len(R)
    i = np.arange(n)
    lo = np.maximum(0, i - N)
    k = i - lo
    cs = np.concatenate(([0.0], np.cumsum(R)))
    cs2 = np.concatenate(([0.0], np.cumsum(R * R)))
    with np.errstate(divide='ignore', invalid='ignore'):
        m = (cs[i] - cs[lo]) / k
        var = np.maximum((cs2[i] - cs2[lo]) / k - m * m, 1e-9) * k / (k - 1)
        se = np.sqrt(var / k)
        mp = (k * m + prior_k * prior_mu) / (k + prior_k)          # shrink toward a sceptical prior
        return (k >= min_n) & (k > 1) & (mp >= theta) & (m / se >= z)


def pooled(D, mask, label):
    x = D[mask]
    if len(x) == 0:
        return dict(label=label, n=0)
    g = x.groupby('ym')['Rc'].sum()                                # independent-ish observations: series x month
    t = g.mean() / (g.std(ddof=1) / np.sqrt(len(g))) if len(g) > 2 else np.nan
    return dict(label=label, n=len(x), avgR=x['Rc'].mean(), sumR=x['Rc'].sum(), wr=(x['Rc'] > 0).mean(), t_month=t)


def main():
    D = pd.read_pickle(os.path.join(OUT, 'all_trades.pkl'))
    D['Rc'] = D['r'].clip(-3, 5)                                   # winsorise gap-fill outliers
    D = D.sort_values('tEntry').reset_index(drop=True)
    D['cell'] = D['series'] + '|' + D['sleeve'] + '|' + D['anchor']
    D['ym'] = D['series'] + pd.to_datetime(D['tEntry'], unit='s').dt.strftime('%Y%m')
    groups = D.groupby('cell').indices
    rng = np.random.default_rng(1)
    rows = [pooled(D, np.ones(len(D), bool), 'UNGATED (all trades)')]
    for N, theta, z in itertools.product((30, 60, 120), (0.0, 0.03, 0.05, 0.10), (0.0, 1.0, 2.0)):
        take = np.zeros(len(D), bool)
        for idx in groups.values():
            take[idx] = gate_take(D['Rc'].values[idx], N, max(15, N // 2), theta, z)
        r = pooled(D, take, f'gate N={N} theta={theta} z={z}')
        ctrl = np.zeros(len(D), bool)
        for idx in groups.values():
            k = int(take[idx].sum())
            if k > 0:
                ctrl[rng.choice(idx, size=k, replace=False)] = True
        r['control_avgR'] = pooled(D, ctrl, '').get('avgR')
        rows.append(r)
    R = pd.DataFrame(rows)
    pd.set_option('display.width', 200)
    print(R.round(4).to_string(index=False))
    R.round(5).to_csv(os.path.join(RESEARCH, 'results', 'gating_vs_random.csv'), index=False)
    g = R.dropna(subset=['control_avgR'])
    g = g[g.n >= 200]
    print(f"\nconfigurations with >=200 gated trades: {len(g)};  gated better than random control in {int((g.avgR > g.control_avgR).sum())};  "
          f"gated avgR range {g.avgR.min():+.3f}..{g.avgR.max():+.3f};  best gated {g.avgR.max():+.3f} (n={int(g.loc[g.avgR.idxmax(), 'n'])})")


if __name__ == '__main__':
    main()
