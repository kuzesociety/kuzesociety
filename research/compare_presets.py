"""Python replica of RutaCrypto_PROP.pine, used to compare the signal presets.

Setup (once):
    pip install pandas numpy
    git clone https://github.com/getdata-finance/nq-1m-ohlcv-stocks-historical-data research/data
Run:
    python research/compare_presets.py
"""
from ind import load, indicators
from sim import run

PRESETS = {
    "Active": dict(lower=30, upper=70, memory=2),
    "Strict (original)": dict(lower=20, upper=71, memory=0),
}

for tf in (1, 5):
    d = indicators(load(tf))
    mid = d.index[len(d) // 2]
    print(f"=== {tf}-minute chart")
    for name, sig in PRESETS.items():
        r = run(d=d, one_per_cross=True, useDD=True, reset_on_stall=True, exact=True, **sig)
        a = run(d=d[d.index < mid], one_per_cross=True, useDD=False, exact=True, **sig)
        b = run(d=d[d.index >= mid], one_per_cross=True, useDD=False, exact=True, **sig)
        print(f"  {name:18s} trades/session={r['per_session']:.1f} busiest={r['busiest']} win={r['win']:.0%} "
              f"net=${r['net']:,.0f} (1st half ${a['net']:,.0f}, 2nd half ${b['net']:,.0f}) accounts blown={r['blown']}")
