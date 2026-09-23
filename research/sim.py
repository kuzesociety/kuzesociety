import math, pandas as pd, numpy as np
from ind import load, indicators, signals
TICK, PV = 0.25, 2.0          # simulate MNQ on NQ prices
TV = TICK * PV

def run(tf=1, memory=0, one_per_cross=False, useDD=True, dd=5000, reset_on_stall=False, keep_rr=False, maxLoss=2000, maxProfit=1500,
        maxQty=50, slM=2.0, tpM=4.0, fee=0.62, slip=1, lower=20, upper=71, capital=150000, buffer=100, d=None):
    if d is None: d = indicators(load(tf))
    L, S, upx, dnx = signals(d, lower=lower, upper=upper, memory=memory)
    o, h, l, c = (d[k].to_numpy() for k in ("open", "high", "low", "close"))
    atr = d.atr.to_numpy(); Lv, Sv = L.to_numpy(), S.to_numpy(); ux, dx = upx.to_numpy(), dnx.to_numpy()
    idx = d.index; tclose = d.tclose
    tmin = idx.hour * 60 + idx.minute; cmin = tclose.dt.hour.to_numpy() * 60 + tclose.dt.minute.to_numpy()
    dow = idx.dayofweek.to_numpy(); dates = idx.date
    inwin = (dow < 5) & (tmin >= 570) & (tmin < 945)
    flat = (cmin >= 955) & (tmin < 1080)
    feeRT = 2 * fee
    pos = 0; qty = 0; ent = 0.0; slT = tpT = 0
    bal = capital; peak = capital; floor_ = capital - dd; acc_start = capital
    trades = []; blown = 0; stalls = 0; last_up = last_dn = -1; used_up = used_dn = -2
    prev_date = None
    def close_pos(px, i, why):
        nonlocal pos, qty, bal
        pnl = pos * (px - ent) * PV * qty - qty * feeRT
        bal += pnl; trades.append((dates[i], pnl, why)); pos = 0; qty = 0
    for i in range(len(d)):
        if ux[i]: last_up = i
        if dx[i]: last_dn = i
        # new trading day (EOD trailing update)
        if dates[i] != prev_date:
            prev_date = dates[i]
            if useDD:
                peak = max(peak, bal)
                floor_ = max(floor_, min(peak - dd, acc_start + 100))
        # 1) bracket exits intrabar
        if pos != 0:
            stop = ent - pos * slT * TICK; tp = ent + pos * tpT * TICK
            hit_stop = (l[i] <= stop) if pos > 0 else (h[i] >= stop)
            hit_tp = (h[i] >= tp) if pos > 0 else (l[i] <= tp)
            if hit_stop and hit_tp:
                high_first = abs(h[i] - o[i]) < abs(l[i] - o[i])
                tp_first = high_first if pos > 0 else not high_first
                hit_stop, hit_tp = (not tp_first), tp_first
            if hit_stop:
                px = (min(o[i], stop) if pos > 0 else max(o[i], stop)) - pos * slip * TICK
                close_pos(px, i, "SL")
            elif hit_tp:
                px = max(o[i], tp) if pos > 0 else min(o[i], tp)
                close_pos(px, i, "TP")
        # drawdown breach (bar-close approximation)
        eq = bal + (pos * (c[i] - ent) * PV * qty if pos else 0)
        if useDD and eq <= floor_:
            if pos: close_pos(c[i], i, "DD")
            blown += 1
            if reset_on_stall:
                acc_start = peak = bal; floor_ = bal - dd
            else:
                break
        # 2) session flatten
        if pos != 0 and flat[i]:
            close_pos(c[i], i, "EOD")
        # 3) entries
        can = inwin[i] and not flat[i]
        wantL = Lv[i] and pos <= 0; wantS = Sv[i] and pos >= 0
        if one_per_cross:
            wantL = wantL and last_up > used_up
            wantS = wantS and last_dn > used_dn
        if can and (wantL or wantS) and not np.isnan(atr[i]):
            eq = bal + (pos * (c[i] - ent) * PV * qty if pos else 0)
            budget = min(maxLoss, eq - floor_ - buffer) if useDD else maxLoss
            sl = max(8, round(atr[i] * slM / TICK)); per = (sl + slip) * TV + feeRT
            q = min(maxQty, math.floor(budget / per)) if budget > 0 else 0
            if keep_rr and q >= 1:
                q = min(q, math.floor(maxProfit / (round(atr[i] * tpM / TICK) * TV)))
            if q < 1 and useDD and reset_on_stall and pos == 0:
                blown += 1; stalls += 1; acc_start = peak = bal; floor_ = bal - dd
                budget = maxLoss; q = min(maxQty, math.floor(budget / per))
            if q >= 1:
                if pos: close_pos(c[i] - pos * slip * TICK, i, "REV")
                pos = 1 if wantL else -1
                if wantL: used_up = last_up
                else: used_dn = last_dn
                qty = q; slT = sl; tpT = min(round(atr[i] * tpM / TICK), math.floor(maxProfit / (q * TV)))
                ent = c[i] + pos * slip * TICK
            else:
                stalls += 1
    t = pd.DataFrame(trades, columns=["date", "pnl", "why"])
    sessions = pd.Series(dates[inwin]).nunique()
    active = t.date.nunique() if len(t) else 0
    return dict(trades=len(t), per_session=len(t) / sessions,
                busiest=int(t.groupby("date").size().max()) if len(t) else 0,
                win=(t.pnl > 0).mean() if len(t) else float("nan"), net=t.pnl.sum() if len(t) else 0,
                stopped_on=str(t.date.iloc[-1]) if len(t) else "-", blown=blown, no_room=stalls,
                exits=t.why.value_counts().to_dict() if len(t) else {})
