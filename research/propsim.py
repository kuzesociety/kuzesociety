"""Prop-evaluation pass rate from a bot's trade list.

Starts a new evaluation at the open of every session and replays the bot's trades from there:
pass at +target, fail when equity touches the trailing drawdown floor (updated at each day's
close, frozen at start + lock), otherwise unresolved when the data runs out.
"""
import numpy as np

def pass_rate(pnl, day, target=9000.0, dd=5000.0, lock=100.0, max_days=60):
    days = np.unique(day)
    res = []
    for d0 in days:
        idx = np.flatnonzero(day >= d0)
        bal = 0.0; peak = 0.0; floor = -dd; out = None; cur_day = None
        for k in idx:
            if day[k] - d0 > max_days * 1.5:
                break
            if cur_day is not None and day[k] != cur_day:
                peak = max(peak, bal); floor = max(floor, min(peak - dd, lock))
            cur_day = day[k]
            bal += pnl[k]
            if bal <= floor: out = "fail"; break
            if bal >= target: out = "pass"; break
        if out is not None:
            res.append(out)
    res = np.array(res)
    return (res == "pass").mean() if len(res) else float("nan"), len(res)
