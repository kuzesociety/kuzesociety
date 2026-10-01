#!/usr/bin/env python3
"""KuzeExport.mq5 CSV format -> py/datasets.read_mt5csv -> scripts/07_evaluate_export.py must work end to end (synthetic file)."""
import os
import subprocess
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'scripts'))
from synth_data import make_synth  # noqa: E402
from engine_io import OUT  # noqa: E402
from datasets import read_mt5csv  # noqa: E402

a = make_synth(days=300, bar_min=5, seed=5)
path = os.path.join(OUT, 'export_SYNTH_M5.csv')
ts = pd.to_datetime(a['t'], unit='s').strftime('%Y.%m.%d %H:%M:%S')
df = pd.DataFrame({'utc': ts, 'open': a['o'], 'high': a['h'], 'low': a['l'], 'close': a['c'], 'tick_volume': a['v'].astype(int), 'spread': a['ao'] - a['o']})
df.to_csv(path, index=False, float_format='%.2f')                  # same columns / layout as KuzeExport.mq5
b = read_mt5csv(path)
assert len(b) == len(a) and np.array_equal(b['t'], a['t']), 'time round trip'
assert np.allclose(b['o'], a['o']) and np.allclose(b['c'], a['c']) and np.allclose(b['ao'] - b['o'], 0.5), 'price / spread round trip'
r = subprocess.run([sys.executable, os.path.join(HERE, '..', 'scripts', '07_evaluate_export.py'), path, '--class', 'us_index'], capture_output=True, text=True)
print(r.stdout[-1800:])
if r.returncode != 0 or 'Candidates' not in r.stdout or 'volume gate' not in r.stdout:
    print(r.stderr[-1500:]); print('FAIL'); sys.exit(1)
print('PASS')
