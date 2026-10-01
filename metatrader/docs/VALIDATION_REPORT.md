# Validation report - does "how we trade" make money?

**Short answer: I could not find a market where it does, and I looked at 22 series, 5 setups and ~650 setup-x-anchor cells.**
Before costs the rules are a coin flip (mean -0.017 R per trade); after realistic spreads they lose about -0.17 R per trade. The one place
anything looked positive - the "1PM" box-reclaim setup with a volume filter on NQ futures - rests on 52 trades in 100 sessions of a vendor's free
sample and is not distinguishable from what a search over this many cells produces by luck. Nothing here is investment advice, and nothing here
is a promise of profit.

That is a statement about *the rules as they can be written down from the chat*, on the data I could get, with costs I could assume. It is not proof
about anyone's discretionary trading, and it is exactly why the EA is built to **measure on your own broker's data before it risks a cent** (see the end).

Everything below is reproducible: `research/README.md`, tables in `research/results/`.

## 1. What was tested

The five setups (S1 BoxReclaim, S2 OpenExhaust, S3 IBBreak, S4 OpenRetest, S5 LevelSweep - see `HOW_WE_TRADE.md`) with the parameters **as extracted
from the chat, frozen** (`KzDefaultParams`), run by the EA's own engine (`KzEngine.mqh` compiled as C++) at every candle-open anchor the chat
mentions (Tokyo 09:00, London 08:00, NY 08:00, 09:30, 10:00, 11:00, 13:00, 14:00, 18:00 Sun-Thu; crypto: 00:00, 08:00, 13:30, 16:00 UTC).

* **Fills:** entry at the open of the bar after the signal bar closes; longs pay the ask, shorts sell the bid, exits mirror that, plus optional
  slippage; stop and target both inside a bar => stop first (pessimistic); gap-through fills at the open; forced flat 16:50 NY (16:45 on M15 charts, 16:10 on the regular-hours NQ sample).
* **Costs are inside R** (R = distance from entry to stop). "Gross" runs set spread and slippage to zero.
* **Development / hold-out split by date, per series** (gold 2021-09-01, FX M15 2018-01-01, BTC 2020-01-01, CFD M5 2022-04-01, NQ by median date). No parameter
  was tuned on any series; the hold-out is not used for choosing anything.
* **Trades whose spread exceeds 50% of the stop are dropped** (cost filter, same as the EA's `maxCostFrac` at a looser value).
* Two independent implementations (the MQL5-as-C++ engine and a separate numba prototype) agree trade for trade on 37,204 real-data trades (section 8).

### Data (all public, downloaded by `research/fetch_data.sh`; **not** stored in this repository)

| series | source | bars / period | licence & notes |
|---|---|---|---|
| XAUUSD M1 | `Dypoi/XAUUSD_Dataset` | 3.54 M bars, 2016-09 -> 2026-09, real bid **and** ask | no licence file in the repo: used locally for research, not redistributed |
| BTCUSD M1 | `ff137/bitstamp-btcusd-minute-data` | 7.75 M bars, 2012-01 -> 2026-09 (Bitstamp) | CC BY-SA 4.0 (history, from "Zielak (mczielinski), Bitcoin Historical Data, Kaggle") / CC BY 4.0 (API updates: "Bitstamp BTC/USD minute data, github.com/ff137/bitstamp-btcusd-minute-data"). Cost assumed 4 bp round trip |
| 12 x M15 MT5 exports (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, EURJPY, GBPJPY, EURGBP, EURCHF, AUDJPY, XAUUSD) | `ejtraderLabs/historical-data` | 230,400 bars each, 2012 -> 2022-03, server time = New York + 7 h | Apache-2.0 (repo). Spreads **assumed** (0.8-2.5 pips; gold 0.35) |
| 7 x M5 CFDs (NAS100, US500, US30, DAX, FTSE, XAUUSD, EURUSD) | `TheSnowGuru/Stocks-Futures-Financial-Time-series-Tick-Bar-Data` (Dukascopy) | 200,000 bars each, 2020/21 -> 2023-09 | MIT (repo; the underlying Dukascopy terms apply). Spreads **assumed** (NAS100 1.5, US500 0.6, US30 3.0, DAX 1.2, FTSE 1.5, gold 0.35, EURUSD 0.8 pip). Volume field is junk -> volume gates cannot be tested here |
| NQ futures M1 | `getdata-finance/nq-1m-ohlcv-stocks-historical-data` (free sample) | 50,531 bars, 2026-04 -> 2026-09, real CME volume, 1 tick spread + 1 tick slippage per side | MIT (repo). **13 of 113 sessions removed**: 2026-05-25, 06-19, 07-03 and 08-03...08-14 sit ~10% above their neighbours with prices off the 0.25 tick grid (`31636.739999999998`) and ~10x volume - a rescaled/derived series, not traded NQ. The rest is mostly regular hours (09:30-16:14 ET) plus 13 full Globex days |

The vendor sample's contamination is a warning in itself: it is a *free evaluation sample*, and it is the only place a positive number appeared.

## 2. Headline result: the setups as written down lose after costs, and are flat before costs

22 series x 5 setups = 308,522 simulated trades (`results/report_tables.md`, `results/engine_matrix*.csv`).

| pooled | trades | win rate | net R dev | net R hold-out | net R all | **gross R** | cost R |
|---|---|---|---|---|---|---|---|
| S1 BoxReclaim | 78,255 | 44.4% | -0.111 | -0.112 | -0.112 | -0.012 | 0.101 |
| S2 OpenExhaust | 15,304 | 37.1% | -0.173 | -0.166 | -0.169 | -0.007 | 0.150 |
| S3 IBBreak | 87,491 | 29.0% | -0.193 | -0.188 | -0.191 | -0.034 | 0.168 |
| S4 OpenRetest | 85,209 | 36.5% | -0.217 | -0.204 | -0.211 | -0.014 | 0.190 |
| S5 LevelSweep | 42,263 | 38.9% | -0.163 | -0.160 | -0.162 | +0.003 | 0.156 |
| **all** | **308,522** | 36.7% | -0.175 | -0.168 | **-0.171** | **-0.017** | |
| by class: index | 33,563 | 43.2% | -0.103 | -0.088 | -0.096 | +0.001 | 0.093 |
| crypto | 24,305 | 36.0% | -0.163 | -0.137 | -0.150 | +0.013 | 0.122 |
| gold | 51,371 | 37.2% | -0.186 | -0.147 | -0.167 | -0.006 | 0.163 |
| FX | 199,283 | 35.6% | -0.184 | -0.191 | -0.188 | -0.026 | 0.167 |

*cost R = average spread / stop distance. The net loss is the cost: the setups have no measurable edge to pay it with.*

* **Cells (series x setup, >= 100 trades per half): 99. Net of costs: 0 positive in the development half, 1 in the hold-out half (DAX M5 S5, +0.115 R, t = 2.1, negative in dev),
  0 positive in both.** With ~100 tests one t > 2 is what chance gives.
* **Before costs: 28 / 99 positive in dev, 31 / 99 in hold-out, 11 in both** - about what independent coin flips at those rates give (9).
* **Finer grain (setup x anchor, >= 50 trades per half): ~670 cells per half; net 31 / 35 positive (4.6% / 5.2%), none with t >= 2; 6 of 655 positive in both halves, the best with a
  hold-out t of 0.5.** Full listing: `results/engine_matrix_anchor.csv`.
* No market class is an exception: indices lose least (cheapest costs) but are still at zero **before** costs (+0.001 R).
* NQ futures (1 tick spread, 1 tick slippage - almost no cost), all five setups: 600 trades, **-0.024 R net, -0.015 R gross** in a 100-session sample.

### The chat's claims versus what the same rule measures

| claim in the chat | what the rule measures |
|---|---|
| "1PM sleeve: ~70% win rate, 133 trades / 3 years" - optimised on the last 1.5 years, TradingView, volume-filtered | S1 at 13:00, no useful volume filter possible on CFD data: NAS100 49.5%, US500 47.1%, US30 47.6%, DAX 48.5% win rate, **-0.06 to -0.12 R** net (n = 307-334 each). NQ sample, default gate: 28 trades, 64%, +0.10 R (too few) |
| "~70% win rate with SL 1.5 : TP 1" | that geometry needs **60%** just to break even before costs; a fade with no edge produces 44-50% |
| "10:15 reversal is the standard" | S2 (formalised 10:15-style fade to the open): -0.17 R; the model-free time-of-day scan (section 5) finds no stable structure |
| "PDH/PDL hard filters have a hard edge - must be A/B tested" | A/B tested on 308k trades (section 6): the trades the filters remove are **not worse** than the ones they keep |
| "x3 with 20% drawdown", "long from PDH ~95%", "buy the first red candle at the open ~95%" | not testable as stated (marketing-style / discretionary); not reproduced by any rule here |

## 3. The rolling evidence gate does not add edge

The EA only trades a setup while its recent shadow trades look good (shrunk mean R >= theta and t >= z over the last N). Replayed causally over all 308k trades against a
control that takes the *same number of random trades in each cell* (`scripts/04_gating_vs_random.py`, 36 configurations, 32 with >= 200 gated trades):
gated trades average -0.06 to -0.12 R (ungated -0.171), but the random control does the same or better - **the gate beat random in 3 of 32, by <= 0.008 R; on average it was 0.033 R worse.**
Recent performance did not predict next-trade performance (regression to the mean). **The gate is a risk valve (it trades much less while a setup is losing), not an edge.**

## 4. The one candidate: S1 with a volume filter on NQ futures - and why it is not a result

`scripts/06_nq_volume_gate.py` on the 100 clean sessions of the NQ sample (5-minute signal bars, box 15 min, SL 1.5 / TP 1.0 box heights, chat anchors 09:30 / 10:00 / 11:00 / 13:00 / 14:00):

| volume filter (excursion volume / box volume) | trades | win rate | avg net R | t |
|---|---|---|---|---|
| none | 228 | 54.8% | +0.022 | 0.5 |
| <= 1.0 (the frozen research value) | 177 | 57.1% | +0.044 | 0.9 |
| **<= 0.7** (EA default) | **52** | **65.4%** | **+0.226** | **2.5** |
| <= 0.5 | 6 | 66.7% | +0.213 | 1.2 |

Same picture with 1-minute signals (30 trades, 63%, +0.19 R) and 15-minute signals (43 trades, 63%, +0.11 R, t 1.4); raising slippage from 0.25 to 1.0 point per side moves +0.226 to +0.220.
Positive in 5 of 6 months (the sixth holds a single trade), in both halves (+0.18 R / +0.28 R), and for all nine stop/target geometries tried (+0.12 ... +0.37 R). **Reasons not to believe it yet:**

1. **n = 52 in 100 sessions, one instrument, one 5-month regime, one vendor's free sample that had 12% of its sessions corrupted.**
2. **The threshold 0.7 was chosen after looking** at this and gold data: the gain sits entirely in the 0.5-0.7 band (n 52 vs 6 vs 177) - a knife edge.
3. **The clock times are not special.** Running the same S1 + gate at *every* 5-minute anchor from 09:30 to 14:30 (60 anchors, placebo): median -0.03 R, 45% positive,
   5 anchors (8%) with t >= 2, **best t = 3.65 at 11:25 - a time nobody in the chat mentions**. The chat's anchors rank 15th, 11th, 44th, 10th and 1st of 60 by average R (n = 26, 8, 7, 6, 5).
4. **It fails on gold**: S1 on 10 years of XAUUSD M1 (real bid/ask, tick volume) stays negative at every gate level - off -0.11 / -0.07 R (dev / hold-out, n = 2,801 / 2,993), <= 0.7: -0.08 / -0.10 R (n = 456 / 606), <= 0.5: -0.17 / -0.05 R (n = 66 / 139). The CFD indices cannot test the gate at all (junk volume field).
5. The naive bootstrap probability "avg R <= 0" of 0.4% ignores the choice of gate, anchor set and market among many tried.

What it *is*: a cell worth watching in SHADOW mode on a real futures/CFD feed. That is what the EA does by default.

## 5. Is there time-of-day structure at all? (model-free)

`scripts/05_slot_scan.py`: for 19 markets, every pair of 15-minute slots (i earlier, j later, same session day; ~4,000 pairs per market) is correlated in a development period and again
in the hold-out. Persistent structure would show up as correlated t-statistics across the two periods; noise gives ~0.
**Across 19 markets the dev-vs-hold-out correlation of t-statistics is +0.015 ... +0.128 (mean +0.054); the sign of "significant" pairs (|t| >= 2.5) repeats 49-64% of the time.**
The strongest (EURGBP +0.128, EURCHF +0.090) are quiet crosses whose assumed 1.5-2 pip spreads sit against median 15-minute ranges of only ~4-4.5 pips, so any such structure would not survive costs. Nothing supports "the 10:15 reversal", "13:00 wipes 10:00" or "trade against the 5 pm candle" as stable, tradable effects.

## 6. The chat's PDH / PDL hard filters, A/B tested

"Never sell above PDH **and** above the open", "never buy at/below PDL" (`InpCtxFilter` = 3), engine run with the filters off and on (on = strict subset of off), 22 series:

| | kept | removed | kept - removed |
|---|---|---|---|
| net, development | 147,660 trades, -0.179 R | 13,616, -0.123 R | -0.056 R (Welch t -8.3) |
| net, hold-out | 134,157, -0.172 R | 13,089, -0.129 R | -0.042 R (t -6.0) |
| gross, hold-out | 139,522, -0.014 R | 13,165, -0.013 R | -0.001 R (t -0.1) |

The filters removed 8.7% of the trades, and those trades were **not worse**. Kept beats removed in 0 of 22 series in both halves (net). No information there.

## 7. Multiple-testing, data-quality and other threats to validity

* **Everything tried is in the tables** - no cell was hidden; the pooled numbers include all of them. With ~650 fine cells and 22 x 5 coarse cells, single "significant" ones are expected.
* **Costs are assumptions** for the CFD/FX/gold series (typical retail spreads, constant). Wider real spreads make things worse; commissions and swaps are not included; with **zero** cost (gross) the result is still ~0.
* **Bar-level fills**: inside a bar the path is unknown; "stop first when both are touched" is pessimistic, but with M1/M5 chart bars (most series) both-in-one-bar is rare; the M15 FX series have more of it.
* **Formalisation risk**: five rules are my best mechanical reading of a chat that is mostly discretionary ("respect the open", "wait for the candle open", "buy the rejection"). A discretionary trader may add
  context I cannot code. A better formalisation could behave differently - that is what the shadow evidence machinery is for.
* **Data**: M15 exports end 2022-03; Dukascopy CFDs 2020-23; only the NQ sample has real futures volume (100 sessions); BTC uses an assumed 4 bp cost.
* **Regime**: the chat says the edge is regime-specific (chop good, trend bad). These tests average over regimes.
* Bugs found by the verification, fixed, and covered by tests: bar-by-bar vs bulk signal mismatches (prefix-inconsistent guards), an EA guard that flattened the trade it had just opened, a symbol classifier that
  read `USDJPY` as a US index, London 08:00 = Frankfurt 09:00 counted as two anchors, an exit-gap artifact from unreachable flat times (weekend / regular-hours data), and the corrupted NQ sessions above.

## 8. What was verified about the software

| check | result |
|---|---|
| engine (MQL5 source as C++) vs independent numba prototype, real data: NQ M1/M5/M15 signals, NAS100, DAX, EURUSD M15, XAUUSD | **37,204 trades, 0 differences** in entry, exit, prices, R, exit reason |
| same on synthetic data (M1 charts with 1/5/15-minute signals, M5) | 7,554 trades, 0 differences |
| time library (DST for NY/London/Frankfurt/Tokyo, broker server-time conversion) vs Python, 200k timestamps 2010-2030 + every DST edge | 0 mismatches |
| whole EA on a mock broker, 33.7k synthetic M5 bars | 59 live trades, each identical to its shadow twin; max-trades cap honoured; kill switch stops trading; SHADOW places no orders |
| sizing/guards, 90 symbol names, preset anchors, preset files | all pass |
| **not** verified | that MetaEditor compiles every line (no MetaEditor here - the mock API is my reading of the MQL5 reference); real-broker fills, `SYMBOL_*` values, tester behaviour |

## 9. What would change the conclusion, and the honest way forward

1. **Test on your broker's data, with your spreads and your tick volume**: run `KuzeExport.mq5`, then `research/scripts/07_evaluate_export.py` (dev / hold-out, cells positive in both halves, multiple-testing bar).
2. **Forward test in SHADOW mode on a demo account** for weeks: the EA logs every setup at every anchor as a bid/ask-aware shadow trade to `Common\Files\KuzeEdge\*_ledger.csv`, so the evidence is *yours* and forward, not a backtest.
3. **More NQ futures history with volume** (the vendor sells 1.26 M bars back to 2014) to settle S1 + volume: it needs several hundred gated trades, not 52.
4. Only a cell that survives (1)-(3), is positive on neighbouring anchors, and beats its own costs deserves live money - at the small risk and the guards in `TESTER_GUIDE.md`.

## 10. Bottom line

* The rules extracted from the chat have **no measurable edge before costs and lose about 0.17 R per trade after costs** on every market class tested, in both halves of the data.
* The published win rates (70%, 90%, 95%) come from in-sample optimisation, small samples, discretionary selection or geometry; none survives a systematic test here.
* One small, fragile pocket (NQ, S1, volume-gated) is worth **watching**, not trusting.
* This repository gives you the machinery to find out on your own data, honestly, and refuses to dress randomness up as an edge.
