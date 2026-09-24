# NinjaTrader 8 bots

- [`RutaPullback.cs`](#rutapullback--1500--2000-bracket-bot): fixed-contract $1,500 / $2,000 bracket bot on 5-minute candles
- [`RutaCryptoPROP.cs`](#rutacrypto-prop): port of the TradingView strategy

## RutaPullback — $1,500 / $2,000 bracket bot

It always trades the same bracket: fixed contracts, a stop worth $2,000 (fees and slippage included) and a target worth $1,500. While flat, it decides at every 5-minute candle close.

**Default rule, *PullbackInTrend*:** trade in the direction of the hourly trend (price above or below the 60-minute EMA 50). Enter on a 5-minute candle that pulls back against it: buy a red candle in an uptrend, sell a green candle in a downtrend.

**Setup:**
1. Copy `RutaPullback.cs` to `Documents\NinjaTrader 8\bin\Custom\Strategies\` and press F5 in the NinjaScript Editor.
2. Chart or Strategy Analyzer: **MNQ, 5 Minute**, trading hours **CME US Index Futures RTH**.
3. For backtests, set **Order fill resolution = High, 1 Minute**, so stops and targets are checked every minute.
4. Keep **Fill limit orders on touch = False**, so targets must trade through, like real fills.

**Settings:**

| Setting | Default | Notes |
|---|---|---|
| Contracts | 15 | 15 MNQ: target 50 pts, stop ~66 pts. 30 MNQ: target 25 pts, stop ~32 pts. |
| Max loss / max profit per trade | $2,000 / $1,500 | |
| Direction rule | PullbackInTrend | Also: FadeCandle, FollowTrend, FollowCandle, FollowCandlePersistFlip. The last one is your current bot's logic: the first trade follows the candle, it keeps the direction after a win and flips after a loss. Use it to compare the two on your own data. |
| Hourly trend EMA length | 50 | |
| Entry window / force flat | 09:30–15:45 / 15:55 New York | |
| Max trades per day, daily loss limit, daily goal | off | |

**What the research found** (`research/compare_bracket_bots.py`, 108 sessions of NQ 1-minute data, Apr–Sep 2026):

| Bot | Trades/session | Win rate (1st / 2nd half) | Net, 5 months | Evaluations passed* |
|---|---|---|---|---|
| Coin flip, 30 MNQ | 38.1 | 55.5% | −$217,400 | 32.0% |
| Follow candle, keep after win / flip after loss, 30 MNQ | 38.2 | 55.8% (55.7 / 55.9) | −$184,870 | 30.3% |
| Pullback in trend, 30 MNQ | 21.0 | 56.7% (56.5 / 56.8) | −$21,388 | 30.4% |
| Pullback in trend, 20 MNQ | 15.2 | 58.9% (59.3 / 58.5) | +$111,494 | 43.1% |
| **Pullback in trend, 15 MNQ** | **11.4** | **59.6% (60.5 / 58.9)** | **+$141,134** | **47.5%** |

\* 150K-style evaluation: +$9,000 target, $5,000 end-of-day trailing drawdown, a new evaluation started every session.

- **Break-even:** every stop-out is about −$2,000 and every win about +$1,500 after commission, so break-even is about 57%. A coin flip wins about 55.5% and still passes ~32% of evaluations, purely from the swing of $1,500/$2,000 bets. Passing accounts alone doesn't prove an edge.
- **Why the rule matters:** on this data, following the 5-minute candle is worse than random (NQ tends to snap back over 5 minutes). Fading it in the direction of the hourly trend works best.
- **Why size matters:** 30 contracts is too many for this rule, because tight 25-point targets get eaten by noise and costs. 15–20 contracts does better.
- **Big caveat:** this is 5 months of data and 59.8% is not far above break-even. Confirm it in NinjaTrader on months this test never saw (Jan–Mar 2026, and 2025) before real money.

I compiled the bot against a stand-in of the NinjaTrader API, and checked its direction decisions against the research on 11,090 five-minute candles (0 differences). Send me any compile error text from NinjaTrader and I'll fix it.

---

# RutaCrypto PROP

[`RutaCryptoPROP.cs`](RutaCryptoPROP.cs) is the NinjaTrader 8 version of [`RutaCrypto_PROP.pine`](../RutaCrypto_PROP.pine). It uses the same rules and the same default settings.

## Is it identical to TradingView?

**The logic is identical. The results will not be 100% identical, and no port between platforms can be.**

What is verified: the C# signal and risk engine was run on 55,440 real NQ 1-minute bars next to the Python copy of the Pine logic.

- RSI, ATR, volume oscillator, SMA and Heikin-Ashi agree to 11 decimal places.
- Every buy/sell signal and every position size (contracts, stop, target) matched: **0 differences**.
- The indicators are written to match TradingView's formulas exactly. NinjaTrader's built-in RSI/EMA/ATR start up differently, so they are not used.

What will still differ:

| # | Difference | Why | Effect |
|---|---|---|---|
| 1 | **Fill price of entries** | TradingView fills at the candle's close. NinjaTrader sends the order after the close, so it fills at the next candle's open. Live on either platform, you get the next price anyway. | In the test: same 598 trades and about the same total (Active $22.1k vs $22.2k). Individual trades shift, and Strict went from $9.9k to $7.5k. |
| 2 | **Data feed** | TradingView and your NinjaTrader feed (Rithmic, Tradovate, CQG…) build 1-minute candles from slightly different data, especially volume. | A few RSI crosses happen on one platform and not the other, so some trades differ. |
| 3 | **Reversals** | NinjaTrader ignores a flip order while a stop loss is active. The bot closes first and enters the new side as soon as it's flat. | Rare: 3 of 598 trades in the test. |
| 4 | **Break-even / trailing stop** | They move at the candle close. TradingView trails inside the candle. | Only if you turn them on (off by default). |
| 5 | **Backtest fills** | Each platform guesses differently which of stop/target was hit first inside a candle. | Use *Order fill resolution = High* (1 tick) in NinjaTrader backtests for the most realistic fills. |
| 6 | **Live vs backtest** | Real slippage, partial fills and latency. | Applies to every platform. |

## Install

1. Copy `RutaCryptoPROP.cs` to `Documents\NinjaTrader 8\bin\Custom\Strategies\`.
2. In NinjaTrader: **New → NinjaScript Editor**, then press **F5** to compile. The bottom panel should show no errors.
3. Open a chart: **MNQ** front month (e.g. `MNQ 12-26`), **1 Minute**. Set Trading hours to **CME US Index Futures ETH**.
4. Right-click the chart, choose **Strategies…**, add **RutaCryptoPROP**. Set **Account = Sim101** first, tick **Enabled**, then click **OK**.
5. Set your commission rate on the account's commission template. For backtests, tick *Include commission* in the Strategy Analyzer and choose that template.

I compiled this file against a stand-in of the NinjaTrader API, because NinjaTrader only runs on Windows. If the NinjaScript Editor shows any error, send me the text and I'll fix it.

## Backtest in the Strategy Analyzer

1. **Connect to a data feed first.** Use your prop firm or broker connection (Rithmic, Tradovate…), not *Kinetick – End of Day*, which only has daily data. Without a connection, NinjaTrader has no 1-minute futures history to download.
2. Check **Tools → Options → Market data → Merge policy = Merge back adjusted** (the default). NinjaTrader then stitches older contracts behind the current one, like TradingView's `MNQ1!`.
3. Open **New → Strategy Analyzer** and set:

| Setting | Value |
|---|---|
| Strategy | RutaCryptoPROP |
| Instrument | Type `MNQ` and pick the **front month**, e.g. **MNQ 12-26**. Not `MNQ1!`, which is TradingView's name. |
| Type / Value | Minute / 1 |
| Price based on | Last |
| Trading hours | CME US Index Futures ETH |
| Start / End date | e.g. 2026-04-01 → 2026-09-01 (the period of my test) |
| Order fill resolution | High, Tick, 1 (most realistic; the first download is slower) |
| Include commission | ticked, with your commission template |
| Slippage | 1 |

4. Click **Run**.

If **MNQ doesn't show up** when you type it, NinjaTrader's instrument database is out of date. **Don't create a new instrument by hand:** a blank one has point value 1 and tick size 0.01, and the bot would size every trade wrong. Instead:

1. Disconnect (**Connections → Disconnect**).
2. Open **Tools → Database Management**. Under *Update instruments*, tick **General properties**, **Futures expiries** and **Symbol mappings**, then click **Update**.
3. Restart NinjaTrader, reconnect, and type `MNQ` again.
4. Still missing? Install the latest NinjaTrader 8 version, which includes MNQ.

NinjaTrader names futures by expiry month (`MNQ 12-26` = December 2026). The front month changes roughly one week before each quarterly expiry (March, June, September, December). Once the bot runs, the dashboard must show **tick 0.25 = $0.50** for MNQ. If it shows anything else, the instrument is set up wrong.

## Settings

Same groups and defaults as TradingView:

| Group | Settings (defaults) |
|---|---|
| 1. Per-trade risk | ATR stop + auto contracts, max loss $2,000, max profit $1,500, fixed contracts 10, max contracts 50, ATR 14, stop 2× ATR, target 4× ATR, min stop 8 ticks |
| 2. Account guard | Account size $150,000, trailing drawdown $5,000 end-of-day, locks at start + $100, blown → new account (backtest), daily loss limit off ($3,000), daily goal off ($3,000), max trades/losers off, safety buffer $100 |
| 3. Session (New York time) | Entries 09:30–15:45 Mon–Fri, force flat 15:55 |
| 4. Signal | Preset **Active** (RSI 30/70, memory 2), Heikin-Ashi on, RSI length 12 on close, volume osc 5/14 above −39, trend SMA 10 |
| 5. Extra filters | Both directions, opposite signal = Reverse, VWAP / HTF EMA / ADX off, cooldown 0 |
| 6. Trade management | Break-even off (50%, 2 ticks), trailing off (60%, 1× ATR) |
| 7. Costs | Commission $0.62 per contract per side. Slippage is the strategy's built-in **Slippage** setting (1 tick). |

Where they differ from TradingView:

- *Initial capital* is called **Account size**.
- Commission comes from NinjaTrader's commission template. Keep **Commission per contract** equal to it, because the risk engine uses it to keep a full stop-out under $2,000.

## Going live on a prop account

1. **Test first.** Run it on **Sim101**, or on **Playback** (Market Replay), for at least a week. Check the dashboard: the worst trade must stay within your max loss.
2. **Account size** = your account's starting balance, e.g. 150,000. The drawdown lock uses it.
3. **LIVE: firm's current drawdown floor.** Enter the account value where your firm fails you today, from the firm's dashboard. The bot trails it from there. With 0, it assumes the floor is the account value at start minus the trailing drawdown.
4. **Enable it before the session, while flat.** When the bot goes live it forgets the backtest. Daily counters start at zero, so if you restart it mid-day, it doesn't know about that day's earlier trades.
5. **In live trading, a blown account always means flatten and stop.** "Start a new account" only applies to backtests.
6. **Check your firm's rules on automated trading.** Some prop firms don't allow fully automated bots on funded accounts. Ask them before using it live.
7. **Keep it connected.** NinjaTrader has to stay running and connected (a VPS is safer than a home PC). If it disconnects during a trade, the stop and target already sent keep working at the broker, but the bot can't move the stop or flatten at 15:55 until it reconnects.

## First-run checks

- **Commission:** compare the dashboard's `net` with the Strategy Analyzer's *Net profit*. They should match. If the dashboard is lower by about the commissions, tell me: it means NinjaTrader already deducts commission in the trade profit, and I'll remove the second deduction.
- **Timezone:** the bot converts bar times to New York time itself. It works whatever time zone NinjaTrader is set to.
