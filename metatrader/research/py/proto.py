"""Research prototype of the 'how we trade' sleeves (causal, closed-bar state machines) + spread-aware trade simulator.

Signals are generated on closed *signal bars* (M5 by default) and executed on the *execution bars* (M1):
entry = open of the first exec bar after the signal bar closes (long pays the ask, short sells the bid).
All decisions use only information from closed signal bars (no look-ahead).
"""
import numpy as np, numba as nb
from common import local_parts, clock_offset

# ----------------------------------------------------------------------------------------------
# Signal bars
# ----------------------------------------------------------------------------------------------
def make_sig_bars(a, sig_min):
    t = a['t']
    key = t // (60 * sig_min)
    chg = np.flatnonzero(np.diff(key)) + 1
    st = np.concatenate(([0], chg)); en = np.concatenate((chg, [len(t)]))
    B = dict(t=key[st] * 60 * sig_min, o=a['o'][st], c=a['c'][en - 1],
             h=np.maximum.reduceat(a['h'], st), l=np.minimum.reduceat(a['l'], st),
             v=np.add.reduceat(a['v'], st), i0=st, i1=en - 1, n=(en - st))
    return B


def session_context(B, sig_min, y_off_hours=7):
    """Session-day (17:00 ET rollover) high/low per bar, previous-day PDH/PDL, and Dref = median range of last 10 days."""
    t = B['t']
    off = clock_offset(t, 'NY')
    sday = (t + off + y_off_hours * 3600) // 86400
    chg = np.flatnonzero(np.diff(sday)) + 1
    st = np.concatenate(([0], chg)); en = np.concatenate((chg, [len(t)]))
    dh = np.maximum.reduceat(B['h'], st); dl = np.minimum.reduceat(B['l'], st)
    nd = len(st)
    pdh_d = np.full(nd, np.nan); pdl_d = np.full(nd, np.nan); dref_d = np.full(nd, np.nan)
    rng = dh - dl
    for k in range(1, nd):
        pdh_d[k] = dh[k - 1]; pdl_d[k] = dl[k - 1]
        lo = max(0, k - 10)
        dref_d[k] = np.median(rng[lo:k])
    pdh = np.repeat(pdh_d, en - st); pdl = np.repeat(pdl_d, en - st); dref = np.repeat(dref_d, en - st)
    return dict(sday=sday, pdh=pdh, pdl=pdl, dref=dref)


# ----------------------------------------------------------------------------------------------
# Sleeves.  out[] = [found, j(signal bar idx), dir(+1/-1), sl, tp, maxhold_min, entry_ref, noprog_min, noprog_R]
# ----------------------------------------------------------------------------------------------
@nb.njit(cache=True)
def s1_box_reclaim(t, o, h, l, c, v, ia, nv, sm, P, ctx, out):
    # P: 0 boxMin,1 winMin,2 slMult,3 tpMult,4 volMax(0=off),5 maxDepth(xU),6 minBoxRel,7 maxBoxRel,8 maxhold,
    #    9 needCloseOutside(1/0), 10 minDepth(xU)
    out[0] = 0.0
    boxb = int(P[0] // sm); winb = int(P[1] // sm)
    if nv < boxb + 1:
        return
    BH = -1e18; BL = 1e18; bv = 0.0
    for k in range(ia, ia + boxb):
        if h[k] > BH: BH = h[k]
        if l[k] < BL: BL = l[k]
        bv += v[k]
    U = BH - BL
    if U <= 0:
        return
    bvavg = bv / boxb
    base = ctx[3]
    if base > 0:
        r = U / base
        if r < P[6] or r > P[7]:
            return
    up = False; dn = False
    upx = -1e18; dnx = 1e18; upv = 0.0; dnv = 0.0; upn = 0; dnn = 0
    up_closed = False; dn_closed = False
    last = min(ia + boxb + winb, ia + nv)
    for j in range(ia + boxb, last):
        if h[j] > BH:
            up = True; upx = max(upx, h[j]); upv += v[j]; upn += 1
        if l[j] < BL:
            dn = True; dnx = min(dnx, l[j]); dnv += v[j]; dnn += 1
        if c[j] > BH: up_closed = True
        if c[j] < BL: dn_closed = True
        if up and dn:
            return
        inside = (c[j] <= BH) and (c[j] >= BL)
        if up and inside:
            if P[9] > 0 and not up_closed:
                continue
            depth = upx - BH
            if depth < P[10] * U:
                continue
            if depth > P[5] * U:
                return
            if P[4] > 0 and (upv / upn) > P[4] * bvavg:
                return
            entry = c[j]
            sl = entry + P[2] * U
            if sl < upx + 0.02 * U: sl = upx + 0.02 * U
            out[0] = 1.0; out[1] = j; out[2] = -1.0; out[3] = sl; out[4] = entry - P[3] * U
            out[5] = P[8]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
            return
        if dn and inside:
            if P[9] > 0 and not dn_closed:
                continue
            depth = BL - dnx
            if depth < P[10] * U:
                continue
            if depth > P[5] * U:
                return
            if P[4] > 0 and (dnv / dnn) > P[4] * bvavg:
                return
            entry = c[j]
            sl = entry - P[2] * U
            if sl > dnx - 0.02 * U: sl = dnx - 0.02 * U
            out[0] = 1.0; out[1] = j; out[2] = 1.0; out[3] = sl; out[4] = entry + P[3] * U
            out[5] = P[8]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
            return


@nb.njit(cache=True)
def s2_open_exhaust(t, o, h, l, c, v, ia, nv, sm, P, ctx, out):
    # P: 0 driveMin,1 revWinMin,2 runN,3 minDrive(xDref),4 climaxMult(0=off),5 minRewardR,6 maxRewardR,7 slBufFrac,
    #    8 maxhold, 9 needSessExtreme
    out[0] = 0.0
    O = o[ia]; dref = ctx[2]
    db = int(P[0] // sm); rb = int(P[1] // sm); runN = int(P[2])
    last = min(ia + db + rb, ia + nv)
    for j in range(ia + db, last):
        if j - runN - 1 < ia:
            continue
        sh = -1e18; slo = 1e18; vs = 0.0; cnt = 0
        for k in range(ia, j + 1):
            if h[k] > sh: sh = h[k]
            if l[k] < slo: slo = l[k]
        allup = True; alldn = True
        for k in range(j - runN, j):
            if not (c[k] > o[k]): allup = False
            if not (c[k] < o[k]): alldn = False
        # volume climax test: run bars avg volume vs avg volume since anchor (excluding run)
        climax_ok = True
        if P[4] > 0:
            rv = 0.0
            for k in range(j - runN, j): rv += v[k]
            rv /= runN
            pv = 0.0; pc = 0
            for k in range(ia, j - runN):
                pv += v[k]; pc += 1
            if pc > 0:
                climax_ok = rv >= P[4] * (pv / pc)
        if allup and c[j] < o[j] and c[j] < l[j - 1] and climax_ok:
            E = -1e18
            for k in range(j - runN, j + 1):
                if h[k] > E: E = h[k]
            if P[9] > 0 and E < sh - 1e-12:
                continue
            if dref > 0 and (E - O) < P[3] * dref:
                continue
            entry = c[j]
            sl = E + P[7] * (E - entry)
            R0 = sl - entry
            dist = entry - O
            if R0 <= 0 or dist < P[5] * R0:
                continue
            tp = O if dist <= P[6] * R0 else entry - P[6] * R0
            out[0] = 1.0; out[1] = j; out[2] = -1.0; out[3] = sl; out[4] = tp
            out[5] = P[8]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
            return
        if alldn and c[j] > o[j] and c[j] > h[j - 1] and climax_ok:
            E = 1e18
            for k in range(j - runN, j + 1):
                if l[k] < E: E = l[k]
            if P[9] > 0 and E > slo + 1e-12:
                continue
            if dref > 0 and (O - E) < P[3] * dref:
                continue
            entry = c[j]
            sl = E - P[7] * (entry - E)
            R0 = entry - sl
            dist = O - entry
            if R0 <= 0 or dist < P[5] * R0:
                continue
            tp = O if dist <= P[6] * R0 else entry + P[6] * R0
            out[0] = 1.0; out[1] = j; out[2] = 1.0; out[3] = sl; out[4] = tp
            out[5] = P[8]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
            return


@nb.njit(cache=True)
def s4_ib_break(t, o, h, l, c, v, ia, nv, sm, P, ctx, out):
    # P: 0 ibMin,1 winMin,2 volMult,3 slFrac,4 rr,5 noProgMin,6 noProgR,7 minIBrel(xDref),8 maxIBrel,9 maxhold,10 needVWAP
    out[0] = 0.0
    ibb = int(P[0] // sm); winb = int(P[1] // sm)
    if nv < ibb + 1:
        return
    IBH = -1e18; IBL = 1e18; bv = 0.0
    for k in range(ia, ia + ibb):
        if h[k] > IBH: IBH = h[k]
        if l[k] < IBL: IBL = l[k]
        bv += v[k]
    IBh = IBH - IBL
    if IBh <= 0:
        return
    vb = bv / ibb
    dref = ctx[2]
    if dref > 0:
        if IBh < P[7] * dref or IBh > P[8] * dref:
            return
    O = o[ia]
    cpv = 0.0; cv = 0.0
    for k in range(ia, ia + ibb):
        tp_ = (h[k] + l[k] + c[k]) / 3.0
        cpv += tp_ * v[k]; cv += v[k]
    last = min(ia + ibb + winb, ia + nv)
    for j in range(ia + ibb, last):
        tp_ = (h[j] + l[j] + c[j]) / 3.0
        cpv += tp_ * v[j]; cv += v[j]
        vwap = cpv / cv if cv > 0 else c[j]
        if v[j] < P[2] * vb:
            continue
        if c[j] > IBH + 0.02 * IBh and c[j] > O and (P[10] == 0 or c[j] > vwap) and c[j - 1] <= IBH + 0.02 * IBh:
            entry = c[j]
            sl = IBH - P[3] * IBh
            R0 = entry - sl
            if R0 <= 0: continue
            out[0] = 1.0; out[1] = j; out[2] = 1.0; out[3] = sl; out[4] = entry + P[4] * R0
            out[5] = P[9]; out[6] = entry; out[7] = P[5]; out[8] = P[6]
            return
        if c[j] < IBL - 0.02 * IBh and c[j] < O and (P[10] == 0 or c[j] < vwap) and c[j - 1] >= IBL - 0.02 * IBh:
            entry = c[j]
            sl = IBL + P[3] * IBh
            R0 = sl - entry
            if R0 <= 0: continue
            out[0] = 1.0; out[1] = j; out[2] = -1.0; out[3] = sl; out[4] = entry - P[4] * R0
            out[5] = P[9]; out[6] = entry; out[7] = P[5]; out[8] = P[6]
            return


@nb.njit(cache=True)
def s5_open_retest(t, o, h, l, c, v, ia, nv, sm, P, ctx, out):
    # P: 0 boxMin(ref U0),1 winMin,2 sepMult(xU0),3 touchTol(xExt),4 rr,5 slBuf(xU0),6 maxhold,7 minSideBars,8 maxCrosses
    out[0] = 0.0
    boxb = int(P[0] // sm); winb = int(P[1] // sm)
    if nv < boxb + 1:
        return
    BH = -1e18; BL = 1e18
    for k in range(ia, ia + boxb):
        if h[k] > BH: BH = h[k]
        if l[k] < BL: BL = l[k]
    U0 = BH - BL
    if U0 <= 0:
        return
    O = o[ia]
    last = min(ia + boxb + winb, ia + nv)
    ext_up = 0.0; ext_dn = 0.0; crosses = 0; prev_side = 0; run_up = 0; run_dn = 0
    for j in range(ia, last):
        side = 1 if c[j] > O else (-1 if c[j] < O else 0)
        if side != 0 and prev_side != 0 and side != prev_side:
            crosses += 1
        if side != 0: prev_side = side
        if h[j] - O > ext_up: ext_up = h[j] - O
        if O - l[j] > ext_dn: ext_dn = O - l[j]
        if j < ia + boxb:
            continue
        if crosses > P[8]:
            return
        # long retest: extension up established, pullback touches near open, closes back green above open
        if ext_up >= P[2] * U0 and ext_up > ext_dn:
            if l[j] <= O + P[3] * ext_up and c[j] > O and c[j] > o[j]:
                # need the side established previously: at least minSideBars closes above open earlier
                cnt = 0
                for k in range(ia + boxb, j):
                    if c[k] > O: cnt += 1
                if cnt >= P[7]:
                    lo = min(l[j], l[j - 1])
                    sl = min(lo, O) - P[5] * U0
                    entry = c[j]
                    R0 = entry - sl
                    if R0 > 0:
                        out[0] = 1.0; out[1] = j; out[2] = 1.0; out[3] = sl; out[4] = entry + P[4] * R0
                        out[5] = P[6]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
                        return
        if ext_dn >= P[2] * U0 and ext_dn > ext_up:
            if h[j] >= O - P[3] * ext_dn and c[j] < O and c[j] < o[j]:
                cnt = 0
                for k in range(ia + boxb, j):
                    if c[k] < O: cnt += 1
                if cnt >= P[7]:
                    hi = max(h[j], h[j - 1])
                    sl = max(hi, O) + P[5] * U0
                    entry = c[j]
                    R0 = sl - entry
                    if R0 > 0:
                        out[0] = 1.0; out[1] = j; out[2] = -1.0; out[3] = sl; out[4] = entry - P[4] * R0
                        out[5] = P[6]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
                        return


@nb.njit(cache=True)
def s6_level_sweep(t, o, h, l, c, v, ia, nv, sm, P, ctx, out):
    # P: 0 winMin,1 reclaimBars,2 minDepth(xDref),3 maxDepth(xDref),4 rr,5 slBufFrac,6 maxhold,7 minRiskDref
    out[0] = 0.0
    pdh = ctx[0]; pdl = ctx[1]; dref = ctx[2]
    if not (pdh > 0 and pdl > 0 and dref > 0):
        return
    winb = int(P[0] // sm)
    last = min(ia + winb, ia + nv)
    su = False; sd = False; su_i = -1; sd_i = -1; sux = -1e18; sdx = 1e18
    for j in range(ia, last):
        if h[j] > pdh:
            if not su:
                su = True; su_i = j
            if h[j] > sux: sux = h[j]
        if l[j] < pdl:
            if not sd:
                sd = True; sd_i = j
            if l[j] < sdx: sdx = l[j]
        if su and c[j] < pdh and (j - su_i) < P[1] and c[j] < o[j]:
            depth = sux - pdh
            if depth >= P[2] * dref and depth <= P[3] * dref:
                entry = c[j]
                sl = sux + P[5] * depth
                R0 = sl - entry
                if R0 >= P[7] * dref:
                    out[0] = 1.0; out[1] = j; out[2] = -1.0; out[3] = sl; out[4] = entry - P[4] * R0
                    out[5] = P[6]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
                    return
            su = False; su_i = -1; sux = -1e18   # consumed / rejected
        if sd and c[j] > pdl and (j - sd_i) < P[1] and c[j] > o[j]:
            depth = pdl - sdx
            if depth >= P[2] * dref and depth <= P[3] * dref:
                entry = c[j]
                sl = sdx - P[5] * depth
                R0 = entry - sl
                if R0 >= P[7] * dref:
                    out[0] = 1.0; out[1] = j; out[2] = 1.0; out[3] = sl; out[4] = entry + P[4] * R0
                    out[5] = P[6]; out[6] = entry; out[7] = 0.0; out[8] = 0.0
                    return
            sd = False; sd_i = -1; sdx = 1e18


SLEEVES = {'S1': s1_box_reclaim, 'S2': s2_open_exhaust, 'S4': s4_ib_break, 'S5': s5_open_retest, 'S6': s6_level_sweep}


# ----------------------------------------------------------------------------------------------
# Trade simulation on execution bars (bid/ask aware)
# ----------------------------------------------------------------------------------------------
@nb.njit(cache=True)
def sim_trade(t, o, h, l, c, ao, ah, al, ac, k0, dirn, sl, tp, maxmin, tflat, slip, np_min, np_R, R_plan):
    """Returns (exit_idx, entry_px, exit_px, reason). reason: 1 TP, 2 SL, 3 time, 4 flat, 5 no-progress, 6 data-end."""
    n = len(t)
    entry = ao[k0] + slip if dirn > 0 else o[k0] - slip
    tend = t[k0] + int(maxmin * 60)
    if tflat < tend: tend = tflat
    t_np = t[k0] + int(np_min * 60) if np_min > 0 else -1
    best = 0.0
    for k in range(k0, n):
        if k > k0 and t[k] >= tend:
            px = o[k] if dirn > 0 else ao[k]
            return k, entry, px, 3 if tend != tflat else 4
        if np_min > 0 and k > k0 and t[k] >= t_np:
            if best < np_R * R_plan:
                px = o[k] if dirn > 0 else ao[k]
                return k, entry, px, 5
            t_np = -1   # passed the no-progress check
        if dirn > 0:
            # gap-through handling at the bar open (bid)
            if k > k0 and o[k] <= sl:
                return k, entry, o[k] - slip, 2
            if k > k0 and o[k] >= tp:
                return k, entry, o[k], 1
            sl_hit = l[k] <= sl; tp_hit = h[k] >= tp
            if sl_hit:
                return k, entry, sl - slip, 2
            if tp_hit:
                return k, entry, tp, 1
            if h[k] - entry > best: best = h[k] - entry
        else:
            if k > k0 and ao[k] >= sl:
                return k, entry, ao[k] + slip, 2
            if k > k0 and ao[k] <= tp:
                return k, entry, ao[k], 1
            sl_hit = ah[k] >= sl; tp_hit = al[k] <= tp
            if sl_hit:
                return k, entry, sl + slip, 2
            if tp_hit:
                return k, entry, tp, 1
            if entry - al[k] > best: best = entry - al[k]
    px = c[n - 1] if dirn > 0 else ac[n - 1]
    return n - 1, entry, px, 6


# ----------------------------------------------------------------------------------------------
# Driver
# ----------------------------------------------------------------------------------------------
def default_params():
    return dict(
        S1=np.array([15, 120, 1.5, 1.0, 1.0, 1.0, 0.4, 2.5, 60, 1, 0.05]),
        S2=np.array([45, 60, 3, 0.10, 0.0, 0.8, 3.0, 0.10, 90, 1]),
        S4=np.array([30, 90, 1.2, 0.5, 1.5, 15, 0.3, 0.02, 0.5, 90, 1]),
        S5=np.array([15, 150, 1.0, 0.10, 1.5, 0.10, 90, 3, 2]),
        S6=np.array([120, 3, 0.01, 0.20, 1.5, 0.10, 60, 0.01]),
    )


def next_flat_epoch(te, flat_min=16 * 60 + 50):
    off = int(clock_offset(np.array([te]), 'NY')[0])
    lt = te + off
    m = (lt % 86400) // 60
    delta = (flat_min - m) * 60 if m < flat_min else (flat_min + 1440 - m) * 60
    return te + delta - (te % 60)


def run_sleeve(a, B, ctx, sleeve, P, anchors, sig_min, slip=0.0, weekdays=None, y0=None, y1=None, exec_gap_ok=180, min_nv=6):
    """Run one sleeve over all anchors. anchors: list of dict(name, clock, minute, wd) . Returns list of trade tuples."""
    fn = SLEEVES[sleeve]
    t, o, h, l, c, v = B['t'], B['o'], B['h'], B['l'], B['c'], B['v']
    et, eo, eh, el, ec = a['t'], a['o'], a['h'], a['l'], a['c']
    eao, eah, eal, eac = a['ao'], a['ah'], a['al'], a['ac']
    trades = []
    outarr = np.zeros(9)
    maxw = 200
    for an in anchors:
        day, mod, wd = local_parts(t, an['clock'])
        idx = np.flatnonzero((mod == an['minute']) & np.isin(wd, an.get('wd', (0, 1, 2, 3, 4))))
        box_hist = []
        for ia in idx:
            if y0 is not None:
                yr = 1970 + int(t[ia] // 31556952)
            # contiguous valid bars from ia
            hi = min(ia + maxw, len(t))
            dt_ = np.diff(t[ia:hi])
            bad = np.flatnonzero(dt_ != sig_min * 60)
            nv = (bad[0] + 1) if len(bad) else (hi - ia)
            if nv < min_nv:
                continue
            cx = np.array([ctx['pdh'][ia], ctx['pdl'][ia], ctx['dref'][ia], 0.0, 0.0])
            # S1 box baseline (causal): mean of previous same-anchor box heights
            if sleeve == 'S1':
                boxb = int(P[0] // sig_min)
                if nv >= boxb:
                    U = h[ia:ia + boxb].max() - l[ia:ia + boxb].min()
                    cx[3] = np.mean(box_hist[-20:]) if len(box_hist) >= 5 else 0.0
                    box_hist.append(U)
            fn(t, o, h, l, c, v, ia, nv, sig_min, P, cx, outarr)
            if outarr[0] > 0:
                j = int(outarr[1]); dirn = outarr[2]; sl = outarr[3]; tp = outarr[4]
                # execution index: first exec bar after signal bar close
                k0 = B['i1'][j] + 1
                if k0 >= len(et) or et[k0] - (t[j] + sig_min * 60) > exec_gap_ok:
                    continue
                te = et[k0]
                tflat = next_flat_epoch(te)
                R_plan = abs(outarr[6] - sl)
                ei, epx, xpx, why = sim_trade(et, eo, eh, el, ec, eao, eah, eal, eac, k0, dirn, sl, tp,
                                               outarr[5], tflat, slip, outarr[7], outarr[8], R_plan)
                pnl = (xpx - epx) if dirn > 0 else (epx - xpx)
                R0 = abs(epx - sl)
                if R0 <= 0:
                    continue
                trades.append((sleeve, an['name'], int(dirn), int(t[j]), int(te), int(et[ei]), epx, xpx, sl, tp, R0, pnl / R0, why,
                               float(eao[k0] - eo[k0])))
    return trades


import pandas as pd
COLS = ['sleeve', 'anchor', 'dir', 'sig_t', 'entry_t', 'exit_t', 'entry', 'exit', 'sl', 'tp', 'R0', 'R', 'why', 'spread']


def to_df(trades):
    df = pd.DataFrame(trades, columns=COLS)
    if len(df):
        df['dt'] = pd.to_datetime(df['entry_t'], unit='s')
        df['year'] = df['dt'].dt.year
        df['hold_min'] = (df['exit_t'] - df['entry_t']) / 60.0
    return df.sort_values('entry_t').reset_index(drop=True)


def stats(df, label=''):
    if len(df) == 0:
        return dict(label=label, n=0)
    R = df['R'].values
    n = len(R); m = R.mean(); s = R.std(ddof=1) if n > 1 else np.nan
    t = m / (s / np.sqrt(n)) if n > 1 and s > 0 else np.nan
    wins = R[R > 0].sum(); loss = -R[R < 0].sum()
    return dict(label=label, n=n, wr=(R > 0).mean(), avgR=m, t=t, PF=(wins / loss if loss > 0 else np.inf),
                sumR=R.sum(), spreadR=float((df['spread'] / df['R0']).mean()))
