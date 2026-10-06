# KuzeEdge - install, test, and (maybe) trade it

Read `VALIDATION_REPORT.md` first. Short version: the chat's rules did not show a net edge on public data, so **KuzeEdge starts in SHADOW mode: it measures
every setup on *your* broker's feed and places no orders** until you decide otherwise.

## 1. Install and compile

1. MT5: *File -> Open Data Folder*. Copy this repository's `MQL5/` sub-folders (`Experts`, `Include`, `Scripts`, `Presets`) into the terminal's `MQL5/` folder, keeping the `KuzeEdge` folders.
2. Open `MQL5/Experts/KuzeEdge/KuzeEdge.mq5` in MetaEditor and press **F7**. Do the same for `MQL5/Scripts/KuzeEdge/KuzeExport.mq5`.
3. **Expected: 0 errors.** This code was verified by compiling the same logic as C++ against a mock of the MQL5 API (`research/tests/run_all.sh`); I had no MetaEditor available.
   If MetaEditor reports an error or a warning you do not understand, that is a bug in *my* delivery: send me the exact message and line.

## 2. Check the broker clock (5 minutes, saves a lot of confusion)

All anchors (09:30 New York, 08:00 London, ...) are computed from the bar's server time, so the EA must know how your broker's server clock works
(`InpServerMode`): **Auto / NY close** = server = New York + 7 h (GMT+2 winter / GMT+3 summer following *US* DST) - most FX/CFD brokers;
**EU DST** = UTC+2 / UTC+3 following *European* DST; **Fixed** = a constant offset. At start the EA looks at the last 20 days of volume and warns in the *Experts* journal
if the busiest New York hour looks wrong for the market class ("WARNING: busiest New-York hour ..."). If you see it, change `InpServerMode` / `InpServerFixedHours`.

## 3. Get your own evidence first (no risk)

1. Run `Scripts/KuzeEdge/KuzeExport` on the symbol and timeframe you will trade (M1 or M5, from at least 2 years ago). It writes `Common\Files\KuzeEdge\export_<symbol>_<tf>.csv`
   (bid OHLC, tick volume, spread in price units, UTC time).
2. On a computer with Python: `python3 research/scripts/07_evaluate_export.py export_US100_M5.csv --class us_index` (add `--spread 1.5` if the file's spreads are 0).
   It prints results per setup and anchor for a development half and a hold-out half, how many cells were tested, the volume-gate table for S1, and the cells positive in **both** halves.
3. Attach the EA in **SHADOW** mode on a **demo** account (chart M5, `Presets/KuzeEdge_US100_M5_shadow.set` or the gold/FX equivalents). It replays `InpBootstrapDays` (250) days of history at start to build
   evidence, then records every setup at every anchor forward, as bid/ask-aware shadow trades, into `Common\Files\KuzeEdge\<symbol>_M5_S5_ledger.csv`
   (the exact path is written to the *Experts* journal at start). The chart panel shows, per setup, the shadow count, mean R, t-statistic, win rate, and whether the gate is open.
   *"Max bars in chart"* (Tools -> Options -> Charts) must be large enough for the bootstrap (M5: ~72,000 bars for 250 days; M1: ~360,000 - set *Unlimited*).

## 4. Strategy Tester

* **Modelling: "Every tick based on real ticks"** - mandatory. With generated ticks the tick volume is synthetic and every volume filter (S1's gate, S3) becomes meaningless.
* Symbol/timeframe as above; use your broker's real spread (real ticks carry it); deposit and leverage as in your account; at least two years, then split by date and test the halves separately.
* **Baseline run:** load `Presets/KuzeEdge_tester_S1_force_US100_M5.set` (FORCE = S1 trades the US-index anchors, evidence gate bypassed). This is the literal chat rule; expect flat-to-negative. Write the number down.
* **All setups, no trades:** SHADOW mode in the tester still writes the ledger, so you can read every setup's statistics from one run.
* `OnTester()` returns recovery factor x sqrt(trades) (0 if < 30 trades) for the "Custom max" criterion - **do not optimise on it**: with this little edge an optimiser will find noise.

### Acceptance gates before any real money (my suggestion; tighten, never loosen)

| gate | why |
|---|---|
| >= 200 trades in each of two disjoint periods | anything less is anecdote |
| positive **net** result after your real spread, in **both** periods, profit factor > 1.15 in both | one lucky half is not evidence |
| no single month > 30% of the profit; max drawdown < 10% at the risk you will use | fragility |
| survives +50% spread and +1 point slippage | your costs will be worse than the test's |
| neighbouring anchors / parameters (+-20%) do not flip the sign | isolated peak = noise |
| forward SHADOW on demo: >= 60 trades, average R within one standard error of the backtest | the only test the future cannot cheat |

## 5. Modes

| `InpMode` | behaviour |
|---|---|
| **SHADOW (default)** | measures every setup at every anchor; never places an order |
| GATED | trades only **live-eligible** cells (by default S1 on US-index anchors 09:30 / 10:00 / 13:00) **and** only while that setup's rolling shadow statistics pass the gate (>= 20 shadow trades, shrunk mean R >= 0.03, t >= 1.0 over the last 60) |
| FORCE | trades live-eligible cells even if the gate is closed (the tester baseline) |
| OFF | does nothing |

`InpExtraLiveMask` (S1 = 1, S2 = 2, S3 = 4, S4 = 8, S5 = 16) makes further setups live-eligible on **every** anchor - unproven; leave 0.

## 6. Risk controls (`KzRisk.mqh`) - they can only *reduce* risk

Risk per trade `InpRiskPct` of equity (lots rounded **down** to the lot step; if even the minimum lot risks more than `InpMinLotTol` x the budget the trade is skipped) - default 0.5%, use 0.25% on the first demo phase.
Daily loss stop (`InpDailyLossPct`, default 2%), optional daily profit lock, max trades per day (3), stop after 2 consecutive losses, **kill switch** at `InpMaxDDPct` (10%) below the equity peak
(sets the terminal global variable `KZ_KILL_<magic>_<symbol>`; delete it to resume), forced flat at `InpFlatHHMM` (16:50 New York; aligned down to the chart timeframe), no entry within
`InpMinToFlatMin` (10) minutes of the flat time, spread/stop cost gate `InpMaxCostFrac` (10%), one position per symbol, no martingale, no grid, no averaging down, no re-entry after a stop.
The stop and target are placed with the order; time / flat / no-progress exits are done by the EA on the next tick.

## 7. Going live - checklist

1. Demo SHADOW results and the acceptance gates above. 2. Demo GATED for weeks. 3. Micro-size live with `InpRiskPct` <= 0.25%.
4. **Prop firms:** rules differ (allowed EAs, news windows, weekend holding, consistency rules, and above all the *definition of the trading day and of the daily-loss limit*: many reset at midnight Central-European time = 18:00
   New York; this EA's day rolls at 17:00 New York). Set `InpDailyLossPct` well **below** the firm's limit and check every rule yourself.
5. One EA instance per symbol; keep `InpMagic` unique per instance; run it on a VPS with a stable connection; the EA re-attaches to its own open position after a restart (it manages it with a 2-hour time stop).
6. Never add size after a loss, and never "fix" a drawdown by loosening the gate.

## 8. Inputs (defaults)

| group | input | default | meaning |
|---|---|---|---|
| General | `InpMode` | SHADOW | see section 5 |
| | `InpClass` | Auto | market class (from the symbol name): US index, EU index, FX, metal, energy, crypto, or Custom anchors (`InpCustomAnchors`, e.g. `NY0930,LON0800,UTC1330`) |
| | `InpSignalMin` | 5 | signal bar (1, 5 or 15 min); the chart timeframe must divide it |
| | `InpServerMode`, `InpServerFixedHours` | Auto, 0 | broker clock (section 2) |
| S1 | `InpS1BoxMin / WinMin / SlMult / TpMult / VolMax / MaxHoldMin` | 15 / 120 / 1.5 / 1.0 / **0.7** / 60 | box-reclaim parameters from the chat (`VolMax` 0 = gate off) |
| Risk | `InpRiskPct` ... `InpMaxDDPct`, `InpFlatHHMM`, `InpMinToFlatMin`, `InpCtxFilter` | 0.5 ... 10, 1650, 10, 0 | section 6; `InpCtxFilter` = the chat's PDH/PDL hard filters (1 = no shorts above PDH and the open, 2 = no longs at/below PDL) - **A/B tested: no benefit** |
| Evidence gate | `InpGateN / MinN / Theta / Z / Cell`, `InpBootstrapDays`, `InpShadowSlipPts` | 60 / 20 / 0.03 / 1.0 / per setup, 250, 0 | rolling window, minimum shadow trades, shrunk mean R, t-stat, per setup or per setup x anchor; history replayed at start; slippage assumed in shadow trades |
| Logging | `InpLedger`, `InpLedgerBoot`, `InpPanel`, `InpVerbose` | true, false, true, false | CSV ledger, also bootstrap trades, chart panel, verbose journal |

Ledger columns: `symbol;sleeve;anchor;dir;t_signal_utc;t_entry_utc;t_exit_utc;entry;exit;sl;tp;R;exit_reason;was_live`.

## 9. Troubleshooting

| symptom | usual cause |
|---|---|
| no trades at all | mode is SHADOW (default); or GATED and the gate is closed (panel shows `no`); or the symbol was classified as FX (check `class` in the panel / journal) so nothing is live-eligible; or `InpMaxCostFrac` rejects every signal (spread too wide vs the 15-minute box) |
| "WARNING: busiest New-York hour ..." | wrong `InpServerMode` |
| shadow numbers differ from `07_evaluate_export.py` | different bootstrap window, different spread (the script can `--spread`), server-time mode, or bars missing in the terminal's history |
| retcode 10016 / invalid stops | the broker's minimum stop distance (`SYMBOL_TRADE_STOPS_LEVEL`) is larger than the setup's stop; the EA skips such signals and logs why (`InpVerbose`) |
| "attach to an M1 or M5 chart whose timeframe divides the signal bar" | chart timeframe must be 1, 5 or 15 min and divide `InpSignalMin` |
| bootstrap replays few bars | "Max bars in chart" too small, or history not downloaded for that symbol/timeframe |
| ledger file not where expected | see the path printed in the *Experts* journal at start (in the Strategy Tester the files go to the tester's own folders) |

## 10. Repository map

```
MQL5/Experts/KuzeEdge/KuzeEdge.mq5   the Expert Advisor            MQL5/Scripts/KuzeEdge/KuzeExport.mq5   history export
MQL5/Include/KuzeEdge/               Kz*.mqh (types, time, sleeves, engine, risk, presets, broker)
MQL5/Presets/                        .set files (shadow / gated demo / tester baseline)
research/                            reproducible studies and tests  (research/README.md)
docs/                                HOW_WE_TRADE.md, VALIDATION_REPORT.md, this guide
```
