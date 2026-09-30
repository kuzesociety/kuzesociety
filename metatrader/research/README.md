# Research kit

Everything here exists to answer one question with evidence instead of belief: **do the chat's rules make money after costs, on which
markets, and how would you find out on your own broker's data?** The results are summarised in
[`../docs/VALIDATION_REPORT.md`](../docs/VALIDATION_REPORT.md); this folder lets you reproduce (and attack) them.

```
research/
  cpp/         C++ build of the EA's own strategy engine + mock MetaTrader (see "Why C++")
  py/          data loaders, DST-aware clocks, and an INDEPENDENT numba prototype of the five setups (the parity reference)
  scripts/     the studies (numbered in the order to run them)
  tests/       self-tests - no market data and no MetaTrader needed
  results/     the tables quoted in the report (small text/CSV, committed)
  fetch_data.sh   downloads the public datasets (not stored in the repo: size and licences)
```

## Quick start

```bash
pip install -r requirements.txt                    # numpy, pandas, numba  (+ a C++17 compiler)
./tests/run_all.sh                                 # 1. prove the software is consistent (16 s, synthetic data)
./fetch_data.sh                                    # 2. download public datasets (~1.5 GB)   (or: ./fetch_data.sh nq cfd5   for the small ones)
python3 py/datasets.py                             # 3. normalise them into data_cache/*.npy
bash cpp/build.sh                                  #    (run_all.sh already did this)
python3 scripts/02_engine_matrix.py                # 4. the evidence matrix (1 min)
python3 scripts/02_engine_matrix.py --gross        #    the same before spread/slippage
python3 scripts/03_prototype_parity.py             # 5. engine == independent prototype on the real data
python3 scripts/04_gating_vs_random.py             # 6. does the rolling evidence gate beat chance?
python3 scripts/05_slot_scan.py                    # 7. model-free time-of-day predictability
python3 scripts/06_nq_volume_gate.py               # 8. the only place anything looked positive, and how fragile it is
python3 scripts/08_report_tables.py                # 9. regenerate results/report_tables.md
python3 scripts/09_hard_filter_ab.py               # 10. the chat's PDH/PDL "hard filters", A/B tested
```

Environment variables: `KZ_RAW` (raw downloads, default `data_raw/`), `KZ_DATA` (normalised caches, default `data_cache/`),
`KZ_BUILD` (compiled tools, default `cpp/build/`), `KZ_OUT` (scratch, default `out/`). Runs are deterministic.

## Test it on YOUR data (the important one)

1. In MetaTrader 5 run `MQL5/Scripts/KuzeEdge/KuzeExport.mq5` on the symbol/timeframe you intend to trade (M1 or M5). It writes
   `Common\Files\KuzeEdge\export_<symbol>_<tf>.csv` with **your broker's** bid prices, tick volume and spread.
2. `python3 scripts/07_evaluate_export.py export_US100_M5.csv --class us_index` runs the five setups over it with your spreads, splits the
   history into development / hold-out, and prints which (setup x anchor) cells are positive in **both** halves, how many cells were tested
   (so you can see how much luck you should expect), and the volume-gate variants of S1 using your broker's tick volume.
3. Attach `KuzeEdge.mq5` in **SHADOW** mode on a demo account for the same symbol and compare its ledger with step 2. Only then think about money.

## Why C++?

There is no MetaEditor in the sandbox this was built in, and a trading robot should not be trusted because "it looks right". The strategy code
under `MQL5/Include/KuzeEdge/` (everything except `KzBroker.mqh`) is written in the subset of MQL5 that is also valid C++17, so the *same
source files* are compiled with `g++` and run over years of data (`cpp/harness.cpp`). The MetaTrader-facing part (`KzBroker.mqh`, `KuzeEdge.mq5`)
is mechanically rewritten (`cpp/transpile.py`, only `input`/dynamic-array syntax) and compiled against a mock MT5 API with a bar-driven mock
broker (`cpp/mql5_shim.h`, `cpp/mock_main.cpp`), which is how the EA's order/guard logic was exercised.

What this does **not** prove: that MetaEditor accepts every line (the mock API is my reading of the MQL5 reference, not the real thing), or
that a real broker fills the way the mock does. See `docs/TESTER_GUIDE.md`.

## What the tests establish

| test | what it shows |
|---|---|
| `test_risk` | lot sizing rounds **down**, never exceeds the risk budget; daily-loss / max-trades / streak / kill-switch guards behave |
| `test_class` | 90 real-world symbol names classify correctly (found and fixed a bug: `USDJPY` was seen as a US index) |
| `check_time.py` | DST-aware clocks + broker-server-time conversion equal an independent Python implementation on 200k timestamps and every DST edge, 2010-2030 |
| `check_defaults.py` | the sleeve parameters are identical in MQL5, the prototype and the scripts |
| `check_parity_synth.py` / `03_prototype_parity.py` | engine == independent prototype **trade for trade** (entry, exit, prices, R, exit reason): 7,554 synthetic and 37,204 real-data trades, 0 differences |
| `check_mock_ea.py` | whole EA on a mock broker: every live trade equals its shadow twin (entry, stop, target, exit, R); max-trades cap honoured; kill switch stops trading; SHADOW mode places no orders |
| `check_export_pipeline.py` | `KuzeExport` CSV -> `07_evaluate_export.py` works end to end |
| `check_presets.py` | every key in `MQL5/Presets/*.set` is a real EA input |

A note on what a *random* market shows: on the synthetic random walk (no edge by construction) `check_export_pipeline.py` prints the S1
volume gate `<=0.5` with +0.17 R (t = 1.9) in the first half and -0.03 R (t = -0.2) in the second. That is why every study here has a hold-out.

## Data used (all public; **not** in this repository)

See the table in `docs/VALIDATION_REPORT.md` for periods, licences and known limitations. The loaders (`py/datasets.py`) rebuild the
normalised caches byte-identically from the raw downloads.
