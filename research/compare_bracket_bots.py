"""Reproduces the $1,500 / $2,000 bracket-bot study (RutaPullback). Run: python research/compare_bracket_bots.py"""
import numpy as np
import flipbot as fb, fastsim as fs, propsim as ps

F = fb.features(5)
d, is_dec, day, sig = F
sig["pullback_trend"] = np.where(sig["candle_rev"] == sig["trend_1h"], sig["candle_rev"], 0)
sessions = fs.arrays(d).sessions
mid = np.median(np.unique(day))

def show(label, runs):
    pnl = np.concatenate([r[0] for r in runs]); dd = np.concatenate([r[4] for r in runs]); k = len(runs)
    a = dd < mid
    pr = np.mean([ps.pass_rate(r[0], r[4])[0] for r in runs])
    print(f"{label:52s} {len(pnl)/sessions/k:5.1f}/sess  win {(pnl>0).mean():5.1%} "
          f"(halves {(pnl[a]>0).mean():.1%}/{(pnl[~a]>0).mean():.1%})  net ${pnl.sum()/k:>9,.0f}  eval pass {pr:5.1%}")

print("MNQ 1-min data, decisions on 5-min closes, NinjaTrader-style fills, targets need 1 tick through\n")
show("coin flip, 30 MNQ", [fb.run(F, rule="random", qty=30, mode=0, seed=s) for s in range(20)])
show("follow candle, keep after win / flip after loss, 30", [fb.run(F, rule="candle", qty=30, mode=1, flip_rule=1)])
for q in (30, 20, 15):
    show(f"pullback in hourly trend, {q} MNQ", [fb.run(F, rule="pullback_trend", qty=q, mode=0)])
