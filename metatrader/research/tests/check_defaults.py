#!/usr/bin/env python3
"""The sleeve parameter defaults exist in three places (KzSleeves.mqh, py/proto.py, scripts/engine_io.py). They must agree."""
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'scripts'))
from engine_io import DEFAULT_PARAMS  # noqa: E402
from proto import default_params  # noqa: E402

src = open(os.path.join(HERE, '..', '..', 'MQL5', 'Include', 'KuzeEdge', 'KzSleeves.mqh')).read()
mq = {}
for k in range(1, 6):
    m = re.search(r'double\s+s%d\s*\[\s*\d+\s*\]\s*=\s*\{([^}]*)\}' % k, src)
    mq[k - 1] = [float(x) for x in m.group(1).split(',')]
proto = default_params()
ok = True
for sid, name in enumerate(['S1', 'S2', 'S4', 'S5', 'S6']):
    a, b, c = mq[sid], list(map(float, DEFAULT_PARAMS[sid])), list(map(float, proto[name]))
    same = np.allclose(a, b) and np.allclose(a, c) and len(a) == len(b) == len(c)
    ok &= same
    print(f"sleeve {sid}: {'OK' if same else 'MISMATCH'}  mql5 {a}")
sys.exit(0 if ok else 1)
