"""Deterministic synthetic 24-hour market for the tests (no downloads needed).

A random walk with an intraday volatility / volume profile that peaks at the New York open, a daily 17:00-18:00 ET break and
weekend closures. It has no edge by construction - the tests use it to prove that the software is CONSISTENT (engine == prototype,
live path == shadow simulator), never that a strategy makes money.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'py'))
from common import clock_offset  # noqa: E402

DT = [('t', 'i8'), ('o', 'f8'), ('h', 'f8'), ('l', 'f8'), ('c', 'f8'), ('ao', 'f8'), ('ah', 'f8'), ('al', 'f8'), ('ac', 'f8'), ('v', 'f8')]


def make_synth(days=200, bar_min=1, seed=7, start='2021-01-04', price=15000.0, spread=0.5, daily_vol=0.012):
    """Return a cache-format structured array of `bar_min`-minute bars (times = bar OPEN, UTC seconds)."""
    rng = np.random.default_rng(seed)
    t0 = int(np.datetime64(start, 's').astype('int64'))
    t = t0 + np.arange(days * 1440 // bar_min, dtype=np.int64) * (bar_min * 60)
    off = clock_offset(t, 'NY')
    lt = t + off
    mod = (lt % 86400) // 60
    wd = ((lt // 86400) + 3) % 7                       # Mon=0
    closed = (mod >= 17 * 60) & (mod < 18 * 60)        # daily break
    closed |= (wd == 5) | ((wd == 4) & (mod >= 17 * 60)) | ((wd == 6) & (mod < 18 * 60))
    t, mod = t[~closed], mod[~closed]
    prof = np.full(len(t), 0.5)                         # relative volatility by New-York time of day
    prof[(mod >= 8 * 60) & (mod < 16 * 60)] = 1.0
    prof[(mod >= 8 * 60 + 30) & (mod < 11 * 60)] = 1.6
    prof[(mod >= 9 * 60 + 30) & (mod < 10 * 60)] = 3.0
    prof[(mod >= 3 * 60) & (mod < 5 * 60)] = 0.9
    sig = daily_vol / np.sqrt(1380.0) * np.sqrt(bar_min) * prof / np.sqrt(np.mean(prof ** 2))
    r = rng.standard_normal(len(t)) * sig
    c = price * np.exp(np.cumsum(r))
    o = np.concatenate(([price], c[:-1]))
    wick_h = np.abs(rng.standard_normal(len(t))) * 0.6 * sig * o
    wick_l = np.abs(rng.standard_normal(len(t))) * 0.6 * sig * o
    h = np.maximum(o, c) + wick_h
    l = np.minimum(o, c) - wick_l
    vol = np.exp(rng.standard_normal(len(t)) * 0.5) * 100.0 * bar_min * prof
    a = np.zeros(len(t), dtype=DT)
    a['t'] = t
    for k, x in (('o', o), ('h', h), ('l', l), ('c', c)):
        a[k] = np.round(x, 2)
        a['a' + k] = np.round(x, 2) + spread
    a['v'] = np.round(vol)
    return a
