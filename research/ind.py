import pandas as pd, numpy as np
import os
DATA = os.path.join(os.path.dirname(__file__), "data", "NQ_1m.csv")

def load(tf_min=1):
    df = pd.read_csv(DATA, parse_dates=["datetime"]).set_index("datetime")
    df.index = df.index.tz_convert("America/New_York")
    if tf_min > 1:
        df = df.resample(f"{tf_min}min", label="left", closed="left").agg(
            {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    df["tclose"] = df.index + pd.Timedelta(minutes=tf_min)
    return df

def rma(s, n):   # Pine ta.rma: seeded with the SMA of the first n valid values, then Wilder smoothing
    a = s.to_numpy(float); out = np.full(len(a), np.nan)
    valid = np.flatnonzero(~np.isnan(a))
    if len(valid) < n: return pd.Series(out, s.index)
    k = valid[n-1]
    out[k] = a[valid[:n]].mean()
    for i in range(k + 1, len(a)):
        out[i] = (out[i-1] * (n - 1) + a[i]) / n
    return pd.Series(out, s.index)

def ema(s, n):   # Pine ta.ema: seeded with SMA of first n values
    a = s.to_numpy(float); out = np.full(len(a), np.nan); k = 2 / (n + 1)
    out[n-1] = a[:n].mean()
    for i in range(n, len(a)):
        out[i] = k * a[i] + (1 - k) * out[i-1]
    return pd.Series(out, s.index)

def indicators(df, rsiLen=12, volF=5, volS=14, atrLen=14, trendLen=10):
    d = df.copy()
    d["haC"] = (d.open + d.high + d.low + d.close) / 4
    ha = np.empty(len(d)); o = d.open.to_numpy(); c = d.close.to_numpy(); hc = d.haC.to_numpy()
    ha[0] = (o[0] + c[0]) / 2
    for i in range(1, len(d)): ha[i] = (ha[i-1] + hc[i-1]) / 2
    d["haO"] = ha
    ch = d.close.diff()
    up = rma(ch.clip(lower=0), rsiLen); dn = rma((-ch).clip(lower=0), rsiLen)
    d["rsi"] = np.where(dn == 0, 100, np.where(up == 0, 0, 100 - 100 / (1 + up / dn)))
    vf, vs = ema(d.volume, volF), ema(d.volume, volS)
    d["vosc"] = np.where(vs > 0, 100 * (vf - vs) / vs, 0.0)
    tr = pd.concat([d.high - d.low, (d.high - d.close.shift()).abs(), (d.low - d.close.shift()).abs()], axis=1).max(axis=1)
    tr.iloc[0] = d.high.iloc[0] - d.low.iloc[0]
    d["atr"] = rma(tr, atrLen)
    d["sma"] = d.close.rolling(trendLen).mean()
    return d

def signals(d, lower=20, upper=71, vol=-39, memory=0, useHA=True):
    r = d.rsi
    upx = (r > lower) & (r.shift() <= lower)
    dnx = (r < upper) & (r.shift() >= upper)
    if memory > 0:
        def recent(x):
            idx = np.where(x.to_numpy(), np.arange(len(x)), -10**9)
            last = np.maximum.accumulate(idx)
            return pd.Series(np.arange(len(x)) - last <= memory, x.index)
        rl, rs = recent(upx), recent(dnx)
    else:
        rl, rs = upx, dnx
    haB = (d.haC > d.haO) if useHA else True
    haS = (d.haC < d.haO) if useHA else True
    L = haB & rl & (d.vosc > vol) & (d.close > d.sma)
    S = haS & rs & (d.vosc > vol) & (d.close < d.sma)
    return L.fillna(False), S.fillna(False), upx, dnx
