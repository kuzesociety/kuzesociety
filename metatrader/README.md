# KuzeEdge - an evidence-gated intraday engine for MetaTrader 5 (M1 / M5)

Built from two exports of a private trading chat (25 Jun - 29 Sep 2026): what the chat actually says about how it trades was extracted
(`docs/HOW_WE_TRADE.md`), turned into five precise, testable setups, run over 22 public price series (FX, gold, US/EU indices, NQ futures, BTC; 308,522 simulated trades) and packaged into an Expert Advisor.

## The honest status

| | |
|---|---|
| **Does it make money on every market?** | **No - and the evidence says the chat's rules do not.** Before costs they are a coin flip (-0.017 R / trade); after realistic spreads they lose ~0.17 R / trade in every market class, in both halves of the data (`docs/VALIDATION_REPORT.md`) |
| Anything promising? | One pocket only: the "1PM" box-reclaim setup with a volume filter on NQ futures - 52 trades in 100 sessions of a vendor's free sample, not distinguishable from luck given how many cells were searched. Worth *watching*, not trusting |
| What is delivered | a rigorously verified engine + EA that **measures every setup on *your* broker's data (shadow trades, bid/ask-aware) and only trades a setup while its own evidence supports it**, with hard risk controls; tools to test on your own history; the full research kit |
| Default behaviour | **SHADOW: no orders.** You decide when (and whether) to let it trade |

I did not build lottery-style "candle colour" bots, grid/martingale systems, or anything that dresses randomised or cherry-picked backtests up as an edge.
Not investment advice; leveraged products can lose more than the deposit.

## Start here (10 minutes)

1. Install + compile (`docs/TESTER_GUIDE.md` section 1). Expected: 0 errors.
2. Attach **KuzeEdge** to an M5 chart of your index / gold / FX symbol on a **demo** account with `MQL5/Presets/KuzeEdge_<symbol>_M5_shadow.set`.
3. Run `Scripts/KuzeEdge/KuzeExport` once, then `python3 research/scripts/07_evaluate_export.py <csv> --class us_index`: your spreads, your tick volume, dev / hold-out split.
4. Read the ledger the EA writes (`Common\Files\KuzeEdge\*_ledger.csv`) after a few weeks. Only cells that are positive net of costs in both halves, on neighbouring anchors, *and* forward, deserve size - see the acceptance gates in the guide.

## What is inside

```
MQL5/Experts/KuzeEdge/KuzeEdge.mq5    Expert Advisor (SHADOW / GATED / FORCE), evidence gate, risk shell, panel, CSV ledger
MQL5/Include/KuzeEdge/                pure-logic core (also compiles as C++): time & DST, five setups, streaming engine, risk, presets; KzBroker.mqh = MT5 glue
MQL5/Scripts/KuzeEdge/KuzeExport.mq5  exports your broker's bars (UTC, bid OHLC, tick volume, spread) for the research kit
MQL5/Presets/*.set                    shadow / gated-demo / tester-baseline presets
docs/HOW_WE_TRADE.md                  the rules, with dates and quotes, and how each became code (and what was refused)
docs/VALIDATION_REPORT.md             the evidence: what works, what doesn't, and why the one positive is not believed yet
docs/TESTER_GUIDE.md                  install, broker-clock check, Strategy Tester settings, acceptance gates, going-live checklist, inputs
research/                             reproducible studies (C++ engine harness, numba prototype, scripts, self-tests, results) - research/README.md
```

## How the engine works (one paragraph)

Chart bars (M1/M5) are aggregated to signal bars (1/5/15 min). At each **anchor** (a New York / London / Tokyo / UTC clock time, DST-aware, converted from your broker's server clock) an anchor window opens and the five
setups (S1 box reclaim, S2 open exhaustion, S3 initial-balance break, S4 open retest, S5 PDH/PDL sweep) look for their first trigger, causally. Every trigger is executed twice: as a **shadow trade**
(entry at the next open with the bar's real spread, stop/target/time/no-progress/flat exits, gap-through fills) whose R multiple feeds a rolling evidence cell, and - only if the setup is live-eligible, the mode allows it and the
evidence gate is open - as a real order sized by fixed-fractional risk. Guards (daily loss, trades per day, loss streak, drawdown kill switch, cost gate, forced flat) can only reduce risk.

## Verification in one line each

Engine == independent prototype on 37,204 real-data and 7,554 synthetic trades (0 differences); DST/time library == Python on 200k timestamps (0 mismatches); whole EA on a mock broker: every live trade equals its shadow twin,
caps and kill switch honoured; 90 symbol names classified; a preset-anchor duplicate, a classifier bug and an EA guard bug were found and fixed on the way. **Not** verified: MetaEditor compilation and real-broker fills
(no MetaEditor / broker in the build sandbox) - see the guide.

`research/tests/run_all.sh` re-runs all of it in ~15 seconds.
