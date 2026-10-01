"""Bridge between Python and the C++ build of the EA's strategy engine (research/cpp/harness.cpp).

The harness compiles MQL5/Include/KuzeEdge/KzEngine.mqh *unchanged* as C++, so every number produced through
this module is produced by the same code that runs inside the Expert Advisor.

Environment
    KZ_BUILD  directory holding the compiled tools (default research/cpp/build, made by cpp/build.sh)
    KZ_DATA   normalised .npy caches (default research/data_cache, made by py/datasets.py)
    KZ_OUT    scratch/output directory (default research/out, git-ignored)
"""
import os
import subprocess
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(RESEARCH, 'py'))

BUILD = os.environ.get('KZ_BUILD', os.path.join(RESEARCH, 'cpp', 'build'))
OUT = os.environ.get('KZ_OUT', os.path.join(RESEARCH, 'out'))
os.makedirs(OUT, exist_ok=True)

CLOCK_ID = {'NY': 0, 'LON': 1, 'FRA': 2, 'TYO': 3, 'UTC': 4}
SLEEVES = ['S1_BoxReclaim', 'S2_OpenExhaust', 'S3_IBBreak', 'S4_OpenRetest', 'S5_LevelSweep']
ALL_SLEEVES_MASK = 31

# Mirror of KzDefaultParams() in KzSleeves.mqh (tests/check_defaults.py fails if the two ever diverge).
DEFAULT_PARAMS = {
    0: [15, 120, 1.5, 1.0, 1.0, 1.0, 0.4, 2.5, 60, 1, 0.05],
    1: [45, 60, 3, 0.10, 0.0, 0.8, 3.0, 0.10, 90, 1],
    2: [30, 90, 1.2, 0.5, 1.5, 15, 0.3, 0.02, 0.5, 90, 1],
    3: [15, 150, 1.0, 0.10, 1.5, 0.10, 90, 3, 2],
    4: [120, 3, 0.01, 0.20, 1.5, 0.10, 60, 0.01],
}

# Anchor sets (name, clock, minute-of-day on that clock, weekdays Mon=0). Research grid: every plausible
# "candle open" the chat mentions, evaluated with EVERY sleeve, no selection.
def anchor(name, clock, hhmm, wd=(0, 1, 2, 3, 4)):
    return dict(name=name, clock=clock, minute=(hhmm // 100) * 60 + hhmm % 100, wd=tuple(wd))

# (Frankfurt 09:00 == London 08:00: the same instant every day, so it is ONE anchor)
A_GLOBAL = [anchor('TYO0900', 'TYO', 900), anchor('LON0800', 'LON', 800),
            anchor('NY0800', 'NY', 800), anchor('NY0930', 'NY', 930), anchor('NY1000', 'NY', 1000),
            anchor('NY1100', 'NY', 1100), anchor('NY1300', 'NY', 1300), anchor('NY1400', 'NY', 1400),
            anchor('NY1800', 'NY', 1800, wd=(6, 0, 1, 2, 3))]          # Globex re-open: Sun..Thu evenings
A_BTC = [anchor('UTC0000', 'UTC', 0, range(7)), anchor('UTC0800', 'UTC', 800, range(7)),
         anchor('UTC1330', 'UTC', 1330, range(7)), anchor('UTC1600', 'UTC', 1600, range(7))]
A_NQ_RTH = [anchor('NY0930', 'NY', 930), anchor('NY1000', 'NY', 1000), anchor('NY1100', 'NY', 1100),
            anchor('NY1300', 'NY', 1300), anchor('NY1400', 'NY', 1400)]   # the sample only holds regular hours

BAR_DT = np.dtype([('t', '<i8'), ('o', '<f8'), ('h', '<f8'), ('l', '<f8'), ('c', '<f8'), ('v', '<f8'), ('sp', '<f8')])


def tool(name):
    p = os.path.join(BUILD, name)
    if not os.path.exists(p):
        raise SystemExit(f"{p} not found - run research/cpp/build.sh first (or set KZ_BUILD)")
    return p


def write_bars(a, path, zero_spread=False):
    """a: cache array (t,o,h,l,c,ao,...,v)  ->  harness binary. Spread per bar = ask-open minus bid-open (0 for a gross-of-costs run)."""
    rec = np.zeros(len(a), dtype=BAR_DT)
    rec['t'] = a['t']; rec['o'] = a['o']; rec['h'] = a['h']; rec['l'] = a['l']; rec['c'] = a['c']
    rec['v'] = a['v']; rec['sp'] = 0.0 if zero_spread else a['ao'] - a['o']
    with open(path, 'wb') as f:
        f.write(np.int32(len(a)).tobytes())
        rec.tofile(f)


def write_config(path, chart_min, sig_min, anchors, params=None, slip=0.0, maxcost=0.5, flat=1650, minwin=1,
                 live_mask=None, gate=None, minflat=0, sleeve_mask=ALL_SLEEVES_MASK, ctx=0):
    """params: {sleeve_id: [floats]} overrides on top of DEFAULT_PARAMS.  gate: tuple (N,minN,theta,z,priorK,priorMu,levelCell)."""
    L = [f"sig {sig_min}", f"chart {chart_min}", f"flat {(flat // 100) * 60 + flat % 100}", f"slip {slip}",
         f"maxcost {maxcost}", "execgap 180", f"minwin {minwin}", f"minflat {minflat}", f"ctx {ctx}"]
    if gate:
        L.append("gate " + " ".join(str(x) for x in gate))
    for i, an in enumerate(anchors):
        mask = sum(1 << int(d) for d in an.get('wd', (0, 1, 2, 3, 4)))
        lm = ALL_SLEEVES_MASK if live_mask is None else live_mask
        L.append(f"anchor {CLOCK_ID[an['clock']]} {an['minute']} {mask} {sleeve_mask} {i} {lm}")
    P = {k: list(v) for k, v in DEFAULT_PARAMS.items()}
    for k, v in (params or {}).items():
        P[k] = list(v)
    for k in sorted(P):
        L.append(f"param {k} " + " ".join(repr(float(x)) for x in P[k]))
    with open(path, 'w') as f:
        f.write("\n".join(L) + "\n")


def run_engine(a, chart_min, sig_min, anchors, tag='run', zero_spread=False, **cfg):
    """Run the EA engine over cache array `a`; return (trades DataFrame, summary text).

    Columns: sleeve (name), anchor (name), dir, tSig, tEntry, tExit, entry, exit, sl, tp, risk, r, reason, live, spread.
    `r` is the net R multiple: costs are inside it (long entries pay the ask, short exits pay the ask, plus `slip`).
    """
    d = os.path.join(OUT, 'engine_' + tag); os.makedirs(d, exist_ok=True)
    bars, conf, pre = os.path.join(d, 'bars.bin'), os.path.join(d, 'cfg.txt'), os.path.join(d, 'out')
    write_bars(a, bars, zero_spread)
    write_config(conf, chart_min, sig_min, anchors, **cfg)
    r = subprocess.run([tool('harness'), bars, conf, pre], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"harness failed ({r.returncode}): {r.stderr[:500]}")
    T = pd.read_csv(pre + '_trades.csv')
    T['sleeve'] = T['sleeve'].map(dict(enumerate(SLEEVES)))
    T['anchor'] = T['anchor'].map(lambda i: anchors[i]['name'])
    with open(pre + '_summary.txt') as f:
        summ = f.read()
    for fn in (bars,):                      # bars.bin can be hundreds of MB; keep the outputs only
        os.remove(fn)
    return T, summ


def stats(r, spread_r=None):
    """Summary of an array/Series of R multiples (net of costs). nBig = trades worse than -3R (gap fills / data artefacts)."""
    r = np.asarray(r, float)
    n = len(r)
    if n == 0:
        return dict(n=0, wr=np.nan, avgR=np.nan, medR=np.nan, t=np.nan, PF=np.nan, sumR=0.0, costR=np.nan, nBig=0)
    m = r.mean(); s = r.std(ddof=1) if n > 1 else np.nan
    t = m / (s / np.sqrt(n)) if n > 1 and s > 0 else np.nan
    w = r[r > 0].sum(); l = -r[r < 0].sum()
    return dict(n=n, wr=float((r > 0).mean()), avgR=float(m), medR=float(np.median(r)), t=float(t), PF=float(w / l) if l > 0 else np.inf,
                sumR=float(r.sum()), costR=float(np.mean(spread_r)) if spread_r is not None and len(spread_r) else np.nan,
                nBig=int((r < -3).sum()))


def load_series(name):
    from common import load_cache
    return load_cache(name)
