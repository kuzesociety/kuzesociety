"""Win-rate search for a fixed $1,500 target / $2,000 stop (MNQ, 1-min, NinjaTrader-style fills).

Searches settings on the first half of the data (TRAIN) only, then checks the best ones on the
second half (TEST), which the search never saw.   Run: python research/optimize.py
"""
import itertools, time
import numpy as np, pandas as pd
import fastsim as fs

d = fs.data(1)
mid = d.index[len(d) // 2]
train, test = d[d.index < mid], d[d.index >= mid]

WINDOWS = {"09:30-15:45": (570, 945), "09:30-11:30": (570, 690), "10:00-15:45": (600, 945),
           "09:30-13:00": (570, 780), "13:00-15:45": (780, 945)}
grid = dict(
    rsi=[(20, 71), (20, 80), (25, 75), (30, 70), (35, 65), (40, 60)],
    memory=[0, 1, 2, 3],
    use_ha=[True, False],
    vol=[-39.0, -100.0, 0.0],
    trend=[10, 20],
    vwap=[False, True],
    htf=[False, True],
    adx_min=[0.0, 20.0],
    win=list(WINDOWS),
    slM=[1.0, 1.5, 2.0, 3.0],
    opp=["reverse", "ignore"],
)

def params(combo):
    p = dict(zip(grid, combo))
    lo, up = p.pop("rsi")
    p["lower"], p["upper"] = lo, up
    p["tpM"] = 2 * p["slM"]
    p["win"] = WINDOWS[p["win"]]
    return p

def evaluate(df, p):
    pnl, eb, xb, why = fs.run(df, max_loss=2000.0, max_profit=1500.0, **p)
    return fs.stats(df, pnl, eb)

if __name__ == "__main__":
    t0 = time.time()
    rows = []
    for combo in itertools.product(*grid.values()):
        s = evaluate(train, params(combo))
        rows.append((*combo, s["trades"], s["per_session"], s["win"], s["net"]))
    cols = list(grid) + ["trades", "per_session", "winrate", "net"]
    res = pd.DataFrame(rows, columns=cols)
    res.to_pickle("/tmp/opt_train.pkl")
    print(f"{len(res)} combinations on TRAIN in {time.time()-t0:.0f}s")
