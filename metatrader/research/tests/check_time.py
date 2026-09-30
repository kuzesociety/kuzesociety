#!/usr/bin/env python3
"""The EA's time library (KzTime.mqh, compiled as C++) versus the independent Python implementation, on 200k random timestamps
between 2010 and 2030 plus every DST transition +-1 s / +-1 h. Exit code 1 on any hard mismatch."""
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'scripts'))
from engine_io import tool  # noqa: E402  (also puts research/py on sys.path)
from common import clock_offset, dst_table, is_dst, local_parts  # noqa: E402
from proto import next_flat_epoch  # noqa: E402


def main():
    rng = np.random.default_rng(3)
    lo, hi = 1262304000, 1893456000
    t = rng.integers(lo, hi, size=200000)
    extra = []
    for tab in (dst_table('US'), dst_table('EU')):
        for x in tab:
            if lo <= x <= hi:
                extra += [x - 3601, x - 1, x, x + 1, x + 3601]
    t = np.concatenate([t, np.array(extra)])
    out = subprocess.run([tool('test_time')], input="\n".join(map(str, t.tolist())) + "\n", capture_output=True, text=True).stdout.strip().split("\n")
    rows = np.array([[int(x) for x in ln.split()] for ln in out], dtype=np.int64)
    assert len(rows) == len(t)
    bad = 0
    for ci, clk in enumerate(['NY', 'LON', 'FRA', 'TYO', 'UTC']):
        off = clock_offset(t, clk); _, mod, wd = local_parts(t, clk)
        c = rows[:, 1 + 3 * ci:4 + 3 * ci]
        for name, a, b in (('offset', off, c[:, 0]), ('minute', mod, c[:, 1]), ('weekday', wd, c[:, 2])):
            n = int((a != b).sum()); bad += n
            print(f"{clk:4s} {name:8s} mismatches: {n}")
    sday = (t + clock_offset(t, 'NY') + 7 * 3600) // 86400
    for name, a, b in (('session day', sday, rows[:, 16]), ('US DST', is_dst(t, 'US').astype(int), rows[:, 17]),
                       ('EU DST', is_dst(t, 'EU').astype(int), rows[:, 18])):
        n = int((a != b).sum()); bad += n; print(f"{name} mismatches: {n}")
    nf = np.array([next_flat_epoch(int(x)) for x in t[:20000]])
    n = int((nf != rows[:20000, 20]).sum()); bad += n; print("next-flat mismatches:", n)
    diff = t[rows[:, 19] != t]
    us = dst_table('US')
    stray = int(sum(1 for x in diff if np.min(np.abs(us - x)) > 2 * 3600))
    print(f"server<->UTC round-trip differences: {len(diff)}, of which outside the +-2h around a US DST switch: {stray}")
    bad += stray
    print("TOTAL hard mismatches:", bad)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
