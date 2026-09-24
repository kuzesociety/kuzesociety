# NY Open Volume → NinjaTrader 8

Your Pine indicator *NY Open Volumen + Zonas de cierre horario* ported to NinjaTrader 8, plus a
strategy that **backtests** the idea and can **learn from past sessions**.

| File | What it is | Copy it to (`Documents\NinjaTrader 8\bin\Custom\…`) |
|---|---|---|
| `AddOns/NYOpenCore.cs` | All the logic (opening candle, RVOL, SIGUE/AMBIGUA/CONTRARIA, zones, learners). Shared by the other two files. | `AddOns\` |
| `Indicators/NYOpenVolumenZonas.cs` | The indicator: same boxes, labels, markers, tables and hourly zones as the Pine version. | `Indicators\` |
| `Strategies/NYOpenVolumeStrategy.cs` | The strategy for the Strategy Analyzer (backtests, optimization, walk-forward) and for sim/live. | `Strategies\` |
| `tests/NYOpenCore.Tests/` | Unit tests for the core logic (run on any PC with the .NET SDK, no NinjaTrader needed). | don't copy |
| `../pinescript/ny_open_volumen_zonas.pine` | The original Pine script, for reference. | — |

## 1 · Install

1. Close NinjaTrader's NinjaScript Editor if it's open.
2. Copy the three `.cs` files into the folders in the table above. **All three are needed**: the indicator and strategy use `NYOpenCore.cs`.
3. In NinjaTrader: **New → NinjaScript Editor**, then press **F5** to compile. The bottom panel should show no errors.
4. Open a **5-minute** (or 1-minute) chart of **MNQ or NQ** (they have real volume). Trading hours `CME US Index Futures ETH` or `RTH` both work. Set **Days to load** to at least 60 so the tables have history.
5. Right-click the chart → **Indicators… → NYOpenVolumenZonas**.

The code only uses C# 5 syntax, so it compiles on every NinjaTrader 8 version. NinjaTrader 8.1.2+ also accepts newer C#.

## 2 · The indicator

It does the same things as the Pine version, with the same inputs (the labels are in Spanish, as in your script):

- The 09:30–09:35 NY candle: direction, volume vs the mean/median of the same candle in the previous N sessions,
  RVOL / σ / percentile, and the reading **SIGUE ▲▼ · fuerte / SIGUE / AMBIGUA-CONTRARIA**.
- Box from the candle to checkpoint 2, labels, bar colour, ▲ ▼ ◆ markers, the "✔ siguió / ✖ contraria / ≈ ambigua" result.
- The **today** table and the **historical** table (drawn as text blocks, because NinjaTrader has no table object).
- Hourly close zones (5 min before → 5 min after each 1H close), line at the close price, touches, and
  "until crossed / fixed hours / always" extension, including the "shift the zone ±N min" comparison.
- An alert when the opening candle closes (real time only).

Differences you might notice:
- NinjaTrader stamps each bar with its **close** time (TradingView uses the open), so boxes start on the first bar of the window.
- Times are converted from whatever time zone NinjaTrader uses (Tools → Options → General) to New York, daylight saving included.

## 3 · Backtesting the idea

1. **New → Strategy Analyzer**.
2. Strategy **NYOpenVolumeStrategy**, instrument **MNQ** (or NQ), data series **Minute 5**, trading hours `CME US Index Futures ETH`.
   For several years of history use the continuous contract (`MNQ ##-##`) with *Merge back adjusted* turned on
   (Tools → Options → Market data). Download minute data first if you need to (Tools → Historical Data).
3. Choose a date range of **3+ years**, a commission template and 1 tick of slippage (so the results are realistic).
4. Leave **Mode = Rules** for the first run. This is your Pine hypothesis exactly:
   *volume ≥ base → trade with the candle*. Optionally *Rules: fade below-base volume* also trades AMBIGUA / CONTRARIA days against the candle.
5. Click **Run**, then open **New → NinjaScript Output** to read the report (it prints when the run finishes).

What a trade is:

| | Default | Setting |
|---|---|---|
| Entry | Market at the open of the bar after the 09:35 close | – |
| Stop | Beyond the other side of the opening candle (+2 ticks, at least 20 ticks) | `Stop beyond the candle extreme`, `Stop range multiple`, `Stop buffer`, `Min stop` |
| Target | None | `Target (R)`: 2 = twice the stop distance |
| Time exit | 16:00 NY | `Exit minutes after open` (60 = 10:30) |

**R** = the distance to the stop. A trade that makes 2× what it risked is +2R.

### The report

```
Volumen apertura        N Sigue 10:30 Sigue 16:00 Amb. 16:00 Contra 16:00  Recorrido  Follow win   avg R  Fade win   avg R
Muy alto (>=+50%)     ...
Sobre la media        ...
Bajo la media         ...
Todas                 ...

Rules (the Pine hypothesis) · sessions decided before knowing the outcome: …
                            trades   win   avg R   total R
  Follow EVERY session           …     …       …         …
  Fade EVERY session             …     …       …         …
  Follow signals taken           …     …       …         …
  Fade signals taken             …     …       …         …
```
(Layout only: your numbers depend on the instrument, dates and settings.)

- The first table is your Pine historical table. The extra columns show what trading **with** (follow) or **against** (fade) the candle
  would have paid in each volume bucket, using the stop/target/exit settings.
- The second block compares **the days the strategy picked** with **simply trading every day**.
  The strategy only adds value if its rows beat the *EVERY session* rows. If they don't, the volume filter
  doesn't help, whatever the win rate says.
- These numbers are "shadow trades" before costs. The Strategy Analyzer's own results (Summary / Trades tabs)
  are the real ones, with fills, commission and slippage.

## 4 · Making it learn from the past

Set **Mode** to one of the learners:

| Mode | How it decides at 09:35 |
|---|---|
| `Buckets` | Your historical table, used live: trades a volume bucket only while it has paid on average so far. |
| `Knn` | Finds the **k** past openings that looked most like today's (k = 25 by default) and averages what happened next. |
| `Logistic` | A logistic regression on the features below, re-fitted after every session over the last `Training window` sessions. |

What the learners look at. All of it is known at 09:35:

| Feature | Meaning |
|---|---|
| `dir` | bullish or bearish candle |
| `log_rvol` | volume vs the previous sessions (your RVOL) |
| `log_rel_range` | candle size vs the average opening candle |
| `body` | body / range (how decisive the candle was) |
| `close_loc` | 1 = closed right at its extreme in its direction |
| `gap` | 09:30 open vs the previous 16:00 close, in the candle's direction |
| `prev_day` | previous day's move, in the candle's direction |

How learning works, and why the backtest is honest:
- Every finished session becomes a training example: the features, plus what a trade **with** the candle and a trade
  **against** it would have paid (win or loss, and R).
- At 09:35 the learner estimates the **expected R** of following (and, with `Learned: allow fades`, of fading).
  It trades only when that is at least `Learned: min expected R` (default 0.2R).
- A session is learned from **only after it ends**. So in a 5-year backtest, the decision on a day in 2023 has only
  seen days before it. This is walk-forward testing by construction, with no look-ahead. A unit test checks it: changing the
  future data must not change a single past decision.
- The first `Learned: min training sessions` sessions (60) are used for learning only, with no trades.
- **Live / sim:** when you enable the strategy on a chart, it first replays the chart's loaded history and learns from it.
  Load plenty of days (e.g. 400+) so it starts trained. It re-learns from the chart history each time it is enabled, so nothing needs saving.

### A sensible workflow

1. Run **Rules** → this is the baseline for your hypothesis.
2. Run **Buckets**, **Knn** and **Logistic** on the same period. Compare each one's *signals taken* rows with *EVERY session*,
   and the Strategy Analyzer results with the Rules run.
3. **Keep the most recent year out** of all of this. Tune on the older data, then run once on the last year. If the edge
   disappears there, it was probably luck.
4. To tune parameters, use Strategy Analyzer's **Walk-Forward Optimization**, and only on 1–2 parameters
   (e.g. `Learned: min expected R`, `KNN: neighbours`). Turn off `Print report` while optimizing.
5. Want to dig deeper (Excel, Python)? Set `CSV file` (e.g. `nyopen_sessions.csv`). You get one row per session with
   every feature, prediction and outcome in `Documents\NinjaTrader 8\`.

### Be sceptical of the results

- A year has only ~250 opening candles. With 100 trades, a 55% win rate is well within luck (±10% either way).
- The more settings you try, the more certain it becomes that one of them looks great by chance. The learners protect you from
  look-ahead, **not** from over-tuning.
- Include commissions and slippage. The opening minutes are the most expensive time to trade.
- Run it in **Sim** for a while before real money.

## 5 · Tests

The logic in `NYOpenCore.cs` doesn't depend on NinjaTrader, so it is tested outside it (needs the .NET 8 SDK):

```
dotnet run --project ninjatrader/tests/NYOpenCore.Tests
```

The tests cover: RVOL, buckets and outcomes on a hand-computed week; mean vs median; stop / target / gap fills;
1-minute and 5-minute bars giving identical sessions; half-day sessions; hourly zones (touches, crossing, shift, max
zones); time-zone conversion; **no look-ahead**; learners finding a pattern planted in synthetic data; and learners **not**
finding one in pure noise.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Red text *"usa un gráfico de 1m o 5m"* / Log: *use a 1-minute or 5-minute chart* | Minute bars that divide the opening candle (1, 5) and, for the zones, ≤ 5 min. |
| Compile error *NyoEngine not found* | `NYOpenCore.cs` is missing from `bin\Custom\AddOns\`. |
| Tables say *calentando 3/10* | Needs 10 previous sessions (half of *Sesiones anteriores*): load more days. |
| Learned mode never trades | The Output report says how many sessions it trained on. Load more history or lower `Learned: min training sessions` / `min expected R`. |
| Volume shows *sin volumen* | Use a futures contract with real volume (NQ, MNQ, ES, MES). |
