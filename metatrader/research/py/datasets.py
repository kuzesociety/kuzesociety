"""Loaders that turn the public datasets used in the validation into one normalised cache format.

Cache format (numpy structured array, one row per bar, time in UTC seconds):
    t  i8   bar OPEN time (UTC epoch seconds)
    o,h,l,c      bid OHLC
    ao,ah,al,ac  ask OHLC  (real ask where the source has it, otherwise bid + an assumed spread)
    v            volume (tick/real volume of the source; NOT comparable across sources)

Raw data is NOT stored in this repository (size / licences). `fetch_data.sh` downloads it from the public
GitHub repositories listed in docs/VALIDATION_REPORT.md into $KZ_RAW.  Everything is deterministic.
"""
import os, glob, sys
import numpy as np, pandas as pd
from common import RAW, DATA, is_dst

DT = [('t', 'i8'), ('o', 'f8'), ('h', 'f8'), ('l', 'f8'), ('c', 'f8'), ('ao', 'f8'), ('ah', 'f8'), ('al', 'f8'), ('ac', 'f8'), ('v', 'f8')]

# assumed retail spreads where the source has none (price units)
FX_PIP = {'EURUSD': 1e-4, 'GBPUSD': 1e-4, 'AUDUSD': 1e-4, 'USDCAD': 1e-4, 'USDCHF': 1e-4, 'EURCHF': 1e-4, 'EURGBP': 1e-4,
          'USDJPY': 1e-2, 'EURJPY': 1e-2, 'GBPJPY': 1e-2, 'AUDJPY': 1e-2}
FX_SPREAD_PIPS = {'EURUSD': 0.8, 'GBPUSD': 1.2, 'AUDUSD': 1.2, 'USDCAD': 1.5, 'USDCHF': 1.5, 'EURCHF': 2.0, 'EURGBP': 1.5,
                  'USDJPY': 1.0, 'EURJPY': 1.8, 'GBPJPY': 2.5, 'AUDJPY': 2.5}
CFD5 = {  # name: (relative path in the multi-asset repo, assumed spread in price units)
    'nas100': ('indices/nasdaq100/USATECHIDXUSD_M5.csv', 1.5), 'us500': ('indices/s&p500/USA500IDXUSD_M5.csv', 0.6),
    'us30': ('indices/dow30/USA30IDXUSD_M5.csv', 3.0), 'dax': ('indices/dax30/DEUIDXEUR_M5.csv', 1.2),
    'ftse': ('indices/ftse100/GBRIDXGBP_M5.csv', 1.5), 'xau5': ('commodities/gold/XAUUSD_M5.csv', 0.35),
    'eurusd5': ('forex/eurusd/EURUSD_M5.csv', 0.00008)}


def _save(name, arr):
    os.makedirs(DATA, exist_ok=True)
    np.save(os.path.join(DATA, name + '.npy'), arr)
    print(f'{name:12s} {len(arr):9d} bars  {pd.to_datetime(arr["t"][0], unit="s")} -> {pd.to_datetime(arr["t"][-1], unit="s")}')


def build_xau():            # Dypoi/XAUUSD_Dataset : 10y XAUUSD M1, bid AND ask, UTC
    files = sorted(glob.glob(os.path.join(RAW, 'Dypoi_XAUUSD_Dataset', 'XAUUSD_M1_*.csv')))
    df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    df['ts'] = pd.to_datetime(df['timestamp'])
    df = df.drop_duplicates('ts').sort_values('ts').reset_index(drop=True)
    out = np.zeros(len(df), dtype=DT)
    out['t'] = df['ts'].to_numpy().astype('datetime64[s]').astype('int64')
    for k, col in (('o', 'open_bid'), ('h', 'high_bid'), ('l', 'low_bid'), ('c', 'close_bid'),
                   ('ao', 'open_ask'), ('ah', 'high_ask'), ('al', 'low_ask'), ('ac', 'close_ask')):
        out[k] = df[col].to_numpy()
    out['v'] = (df['volume_bid'] + df['volume_ask']).to_numpy()
    _save('xauusd_m1', out)


def build_nq():             # getdata-finance NQ 1m free sample: mostly RTH, real futures volume, UTC
    df = pd.read_csv(os.path.join(RAW, 'getdata-finance_nq-1m-ohlcv-stocks-historical-data', 'NQ_1m.csv'))
    ts = pd.to_datetime(df['datetime'], utc=True).dt.tz_localize(None)
    # Data hygiene (decided BEFORE looking at any trading result): 13 sessions in the sample (2026-05-25, 06-19, 07-03 and
    # 08-03..08-14) sit ~10% above their neighbours and their prices are NOT on the 0.25 futures tick grid (float artefacts such as
    # 31636.739999999998, volumes ~10x normal): a derived / rescaled series, not traded NQ prices. They are dropped whole.
    off = ((df['open'] * 4).round() - df['open'] * 4).abs() > 1e-6
    share = off.groupby(ts.dt.date).transform('mean')
    keep = (share < 0.5).to_numpy()
    print(f'nq: dropping {int((~keep).sum())} bars in {ts[~keep].dt.date.nunique()} off-grid sessions '
          f'({", ".join(sorted(str(d) for d in ts[~keep].dt.date.unique()))})')
    df, ts = df[keep].reset_index(drop=True), ts[keep].reset_index(drop=True)
    out = np.zeros(len(df), dtype=DT)
    out['t'] = ts.to_numpy().astype('datetime64[s]').astype('int64')
    for k, col in (('o', 'open'), ('h', 'high'), ('l', 'low'), ('c', 'close')):
        out[k] = df[col].to_numpy(); out['a' + k] = out[k] + 0.25       # 1 tick spread
    out['v'] = df['volume'].to_numpy().astype(float)
    _save('nq_m1', out)


def build_fx15():           # ejtraderLabs/historical-data : MT5 exports, server time = New York + 7h, prices x1e5 (JPY x1e3, gold x1e2)
    for sym in list(FX_PIP) + ['XAUUSD']:
        df = pd.read_csv(os.path.join(RAW, 'ejtraderLabs_historical-data', sym, f'{sym}m15.csv'), parse_dates=['Date'])
        srv = df['Date'].to_numpy().astype('datetime64[s]').astype('int64')
        ny_local = srv - 7 * 3600
        utc = ny_local + np.where(is_dst(ny_local + 5 * 3600, 'US'), 4 * 3600, 5 * 3600)
        if sym == 'XAUUSD': sc, sp = 100.0, 0.35
        else: sc, sp = (1e5 if FX_PIP[sym] == 1e-4 else 1e3), FX_SPREAD_PIPS[sym] * FX_PIP[sym]
        out = np.zeros(len(df), dtype=DT); out['t'] = utc
        for k, col in (('o', 'open'), ('h', 'high'), ('l', 'low'), ('c', 'close')):
            out[k] = df[col].to_numpy(float) / sc; out['a' + k] = out[k] + sp
        out['v'] = df['tick_volume'].to_numpy(float)
        _save(sym.lower() + '_m15', out)


def build_btc():            # ff137/bitstamp-btcusd-minute-data : 2012-2026, UTC
    df = pd.read_csv(os.path.join(RAW, 'ff137_btc', 'data', 'historical', 'btcusd_bitstamp_1min_2012-2025.csv.gz'))
    up = pd.read_csv(os.path.join(RAW, 'ff137_btc', 'data', 'updates', 'btcusd_bitstamp_1min_latest.csv'))
    df = pd.concat([df, up], ignore_index=True).drop_duplicates('timestamp').sort_values('timestamp').reset_index(drop=True)
    out = np.zeros(len(df), dtype=DT); out['t'] = df['timestamp'].to_numpy('i8')
    for k, col in (('o', 'open'), ('h', 'high'), ('l', 'low'), ('c', 'close')):
        out[k] = df[col].to_numpy(float); out['a' + k] = out[k] * (1 + 0.0004)     # ~4 bp round-trip CFD cost
    out['v'] = df['volume'].to_numpy(float)
    _save('btc_m1', out)


def build_cfd5():           # TheSnowGuru/Stocks-Futures-Financial-Time-series-Tick-Bar-Data : Dukascopy M5, UTC, 200k-row cap
    base = os.path.join(RAW, 'TheSnowGuru_Stocks-Futures-Financial-Time-series-Tick-Bar-Data')
    for k, (rel, sp) in CFD5.items():
        df = pd.read_csv(os.path.join(base, rel), sep='\t', parse_dates=['Time'])
        out = np.zeros(len(df), dtype=DT)
        out['t'] = df['Time'].to_numpy().astype('datetime64[s]').astype('int64')
        for a, c in (('o', 'Open'), ('h', 'High'), ('l', 'Low'), ('c', 'Close')):
            out[a] = df[c].to_numpy(float); out['a' + a] = out[a] + sp
        out['v'] = df['Volume'].to_numpy(float)          # NB: coarse/quantised in this source -> volume gate not testable here
        _save(k + '_m5', out)


def read_mt5csv(path):      # MQL5/Scripts/KuzeEdge/KuzeExport.mq5 output: utc,open,high,low,close,tick_volume,spread (bid OHLC, spread in price units)
    df = pd.read_csv(path)
    df['ts'] = pd.to_datetime(df['utc'], format='%Y.%m.%d %H:%M:%S')
    df = df.drop_duplicates('ts').sort_values('ts').reset_index(drop=True)
    out = np.zeros(len(df), dtype=DT)
    out['t'] = df['ts'].to_numpy().astype('datetime64[s]').astype('int64')
    sp = df['spread'].to_numpy(float)
    for k, col in (('o', 'open'), ('h', 'high'), ('l', 'low'), ('c', 'close')):
        out[k] = df[col].to_numpy(float); out['a' + k] = out[k] + sp
    out['v'] = df['tick_volume'].to_numpy(float)
    return out


def build_mt5csv(path, name=None):
    _save(name or os.path.splitext(os.path.basename(path))[0], read_mt5csv(path))


BUILDERS = {'xau': build_xau, 'nq': build_nq, 'fx15': build_fx15, 'btc': build_btc, 'cfd5': build_cfd5}

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'mt5csv':          # python3 datasets.py mt5csv export_US100_M5.csv [cache name]
        build_mt5csv(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    else:
        for w in (sys.argv[1:] or list(BUILDERS)):
            BUILDERS[w]()
