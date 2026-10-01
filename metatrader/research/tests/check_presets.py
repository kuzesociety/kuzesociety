#!/usr/bin/env python3
"""Every key in MQL5/Presets/*.set must be a real input of KuzeEdge.mq5 (MetaTrader silently ignores unknown keys), and numeric
values must be parseable / inside the enum ranges."""
import glob
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'MQL5')
src = open(os.path.join(ROOT, 'Experts', 'KuzeEdge', 'KuzeEdge.mq5')).read()
decl = re.findall(r'^input\s+(?!group)([A-Za-z_0-9]+)\s+(Inp\w+)\s*=\s*([^;]*);', src, flags=re.M)
names = {n: (t, v) for t, n, v in decl}
ranges = {'InpMode': (0, 3), 'InpClass': (0, 7), 'InpServerMode': (0, 3), 'InpSignalMin': (1, 15)}
bad = 0
for f in sorted(glob.glob(os.path.join(ROOT, 'Presets', '*.set'))):
    keys = {}
    for ln in open(f):
        ln = ln.strip()
        if not ln or ln.startswith(';'):
            continue
        k, v = ln.split('=', 1)
        keys[k] = v
        if k not in names:
            print(f"{os.path.basename(f)}: unknown input {k}"); bad += 1; continue
        t = names[k][0]
        try:
            if t in ('int',) or t.startswith('ENUM_'):
                x = int(v)
                if k in ranges and not (ranges[k][0] <= x <= ranges[k][1]):
                    print(f"{os.path.basename(f)}: {k}={v} out of range"); bad += 1
            elif t == 'double':
                float(v)
            elif t == 'bool':
                assert v in ('true', 'false')
        except Exception:
            print(f"{os.path.basename(f)}: bad value {k}={v} for type {t}"); bad += 1
    missing = [n for n in names if n not in keys]
    print(f"{os.path.basename(f):42s} keys {len(keys):2d}/{len(names)}  not set (EA default used): {missing}")
print('PASS' if bad == 0 else f'FAIL ({bad})')
sys.exit(1 if bad else 0)
