"""Checks that the NinjaTrader C# engine matches the Python copy of the Pine logic, bar by bar.

Needs Mono (apt-get install mono-mcs) and the data from research/compare_presets.py. Run from the repo root:
    mcs -r:System.Xml.dll -out:/tmp/enginecheck.exe research/ntcheck/NtStubs.cs NinjaTrader/RutaCryptoPROP.cs research/ntcheck/EngineCheck.cs
    mono /tmp/enginecheck.exe research/data/NQ_1m.csv /tmp/cs_out.csv
    python research/ntcheck/compare_engine.py /tmp/cs_out.csv
"""
import math, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ind import load, indicators, signals

cs = pd.read_csv(sys.argv[1])
d = indicators(load(1))
assert len(cs) == len(d), "bar count differs"
sL, sS, *_ = signals(d, 20, 71, memory=0)
aL, aS, *_ = signals(d, 30, 70, memory=2)
ok = True
for name, py, c in [("RSI", d.rsi, cs.rsi), ("ATR", d.atr, cs.atr), ("Volume osc", d.vosc, cs.vosc), ("SMA", d.sma, cs.sma), ("HA open", d.haO, cs.haO)]:
    a, b = py.to_numpy(float), c.to_numpy(float)
    both = ~np.isnan(a) & ~np.isnan(b)
    diff = np.max(np.abs(a[both] - b[both]))
    same_na = bool((np.isnan(a) == np.isnan(b)).all())
    ok &= diff < 1e-6 and same_na
    print(f"{name:10s} max diff {diff:.1e}  same warm-up: {same_na}")
for name, py, c in [("Strict long", sL, cs.sL), ("Strict short", sS, cs.sS), ("Active long", aL, cs.aL), ("Active short", aS, cs.aS)]:
    miss = int((py.to_numpy().astype(int) != c.to_numpy()).sum())
    ok &= miss == 0
    print(f"{name:12s} signals {int(c.sum()):4d}  mismatched bars {miss}")

def plan(atr):
    if math.isnan(atr): return (0, 0, 0)
    sl = max(8, int(math.floor(atr * 2 / 0.25 + 0.5))); per = (sl + 1) * 0.5 + 1.24
    q = min(50, math.floor(2000 / per)); tp = 0
    if q >= 1: tp = min(int(math.floor(atr * 4 / 0.25 + 0.5)), math.floor(1500 / (q * 0.5)))
    return (q if sl >= 1 and tp >= 1 and q >= 1 else 0, sl, tp)
pp = np.array([plan(a) for a in cs.atr.to_numpy(float)])
miss = int((pp != cs[["qty", "sl", "tp"]].to_numpy()).any(axis=1).sum())
ok &= miss == 0
print(f"Sizing mismatched bars {miss}")
print("MATCH" if ok else "DIFFERENCES FOUND")
