#!/usr/bin/env python3
"""Engine (MQL5 source as C++) versus the independent numba prototype on synthetic data: must agree trade-for-trade."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'scripts'))
from synth_data import make_synth  # noqa: E402

spec = importlib.util.spec_from_file_location('parity03', os.path.join(HERE, '..', 'scripts', '03_prototype_parity.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

a = make_synth(days=160, bar_min=1, seed=11)
tot = [0] * 6
for sig in (5, 1, 15):
    r = mod.parity(f'synthetic M1 chart / M{sig} signal', a, 1, sig, slip=0.1)
    tot = [x + y for x, y in zip(tot, r)]
a5 = make_synth(days=400, bar_min=5, seed=12)
r = mod.parity('synthetic M5 chart / M5 signal', a5, 5, 5)
tot = [x + y for x, y in zip(tot, r)]
print(f"TOTAL python {tot[0]} engine {tot[1]} matched {tot[2]} only-python {tot[3]} only-engine {tot[4]} mismatches {tot[5]}")
ok = tot[2] > 1500 and tot[3] == 0 and tot[4] == 0 and tot[5] == 0
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
