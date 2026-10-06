#!/usr/bin/env python3
"""Dry-run the whole Expert Advisor (transpiled to C++ against a mock MetaTrader API and a bar-driven mock broker) on synthetic data and
check its invariants:
  1. every LIVE trade is one the shadow simulator also produced (same entry, direction, stop, target) with the same exit and R
  2. the max-trades-per-day cap is honoured
  3. the kill switch stops trading for good once the drawdown limit is reached
  4. a run in SHADOW mode places no orders
Exit code 1 on any violation."""
import glob
import os
import shutil
import subprocess
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'scripts'))
from synth_data import make_synth  # noqa: E402
from engine_io import OUT, tool, write_bars  # noqa: E402
from common import is_dst  # noqa: E402

CFG = dict(symbol='NAS100', period=5, point=0.01, digits=2, ticksize=0.01, tickvalue=0.01, minlot=0.01, maxlot=500, lotstep=0.01,
           contract=1, balance=10000, start=20000, sigmin=5, bootdays=250, ledger=1, mode=3, s1vol=0, maxtrades=50, dailyloss=0, maxdd=0,
           maxconsec=0, risk=0.5, maxcost=0.5)


def run(tag, bars, **over):
    d = os.path.join(OUT, 'mock_' + tag)
    shutil.rmtree(d, ignore_errors=True)                     # the mock appends to ledgers: start clean
    os.makedirs(d)
    cfg = dict(CFG); cfg.update(over)
    with open(os.path.join(d, 'cfg.txt'), 'w') as f:
        f.write("\n".join(f"{k}={v}" for k, v in cfg.items()) + "\n")
    r = subprocess.run([tool('mock_run'), bars, os.path.join(d, 'cfg.txt'), os.path.join(d, 'out')], capture_output=True, text=True)
    if r.returncode != 0:
        print('mock_run failed:', r.stderr[-800:]); sys.exit(1)
    live = pd.read_csv(os.path.join(d, 'out', 'live_trades.csv'))
    ledger = glob.glob(os.path.join(d, 'out', 'files', 'KuzeEdge', '*_ledger.csv'))
    led = pd.read_csv(ledger[0], sep=';') if ledger else pd.DataFrame()
    return live, led, r.stdout.strip()


def to_utc(srv):                                            # server clock = New York + 7h
    s = np.asarray(srv)
    return s - np.where(is_dst(s - 2 * 3600, 'US'), 3 * 3600, 2 * 3600)


def main():
    a = make_synth(days=170, bar_min=5, seed=21)
    bars = os.path.join(OUT, 'synth_m5.bin'); write_bars(a, bars)
    print(f"synthetic bars: {len(a)}")
    fails = 0

    live, led, msg = run('force', bars)
    print(msg)
    led['tE'] = pd.to_datetime(led['t_entry_utc'], format='%Y.%m.%d %H:%M:%S').astype('datetime64[s]').astype('int64')
    led['tX'] = pd.to_datetime(led['t_exit_utc'], format='%Y.%m.%d %H:%M:%S').astype('datetime64[s]').astype('int64')
    s1 = led[led.sleeve == 'S1_BoxReclaim']
    live['tE'] = to_utc(live.tOpenSrv); live['tX'] = to_utc(live.tCloseSrv)
    matched = bad = 0
    for r in live.itertuples():
        c = s1[(s1.tE == r.tE) & (s1.dir == r.dir)]
        if len(c) == 0:
            bad += 1; continue
        j = ((c.sl - r.sl).abs() + (c.tp - r.tp).abs()).idxmin()
        x = c.loc[j]
        if abs(x.sl - r.sl) + abs(x.tp - r.tp) > 0.04 or abs(x.tX - r.tX) > 0:
            bad += 1; continue
        risk = abs(r.open - r.sl) / 0.01 * 0.01
        if abs(r.profit / (r.lots * risk) - x.R) > 0.02:
            bad += 1; continue
        matched += 1
    print(f"[1] live trades {len(live)}  matched to shadow {matched}  violations {bad}")
    if len(live) < 20 or bad > 0:
        fails += 1; print('    FAIL')

    live2, _, _ = run('maxtrades', bars, maxtrades=1)
    per_day = live2.assign(day=to_utc(live2.tOpenSrv) // 86400).groupby('day').size()
    print(f"[2] max 1 trade/day: live trades {len(live2)}, max per day {int(per_day.max()) if len(per_day) else 0}")
    if len(live2) == 0 or per_day.max() > 1:
        fails += 1; print('    FAIL')

    live3, _, msg3 = run('kill', bars, maxdd=1, risk=1.0)
    eq = 10000 + live3.profit.cumsum()
    dd_hit = (eq <= eq.cummax().clip(lower=10000) * 0.99).values
    first = int(np.argmax(dd_hit)) if dd_hit.any() else -1
    after = len(live3) - first - 1 if first >= 0 else 0
    print(f"[3] kill switch at -1%: trades {len(live3)}, first breach at trade #{first + 1 if first >= 0 else 'never'}, trades after breach {after}")
    if first < 0 or after > 1:                              # the trade that was open when the limit tripped may still be closing
        fails += 1; print('    FAIL')

    live4, led4, _ = run('shadow', bars, mode=1)
    print(f"[4] shadow mode: live trades {len(live4)}, ledger rows {len(led4)}")
    if len(live4) != 0 or len(led4) == 0:
        fails += 1; print('    FAIL')
    print('PASS' if fails == 0 else f'FAIL ({fails})')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
