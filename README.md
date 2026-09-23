# RutaCrypto PROP — MNQ strategy for prop-firm accounts

A TradingView (Pine Script v6) strategy: Heikin-Ashi + RSI + volume signals, plus a risk engine built around prop-firm rules.

- **File to use:** [`RutaCrypto_PROP.pine`](RutaCrypto_PROP.pine)
- **Original version (for reference):** [`legacy/rutacrypto_original_v4.pine`](legacy/rutacrypto_original_v4.pine)

## Quick start

1. In TradingView, open **Pine Editor**, paste all of `RutaCrypto_PROP.pine`, and click **Add to chart**.
2. Use a **regular candle** chart such as `MNQ1!` on 1–5 min. Don't use a Heikin-Ashi chart: the script calculates HA itself.
3. Go to **Settings → Properties** and set *Initial capital* to your account size. Set *Commission* and *Slippage* to your firm's numbers (defaults are $0.62/contract/side and 1 tick).
4. Go to **Settings → Inputs → ① Per-trade risk** and set your **max loss** ($2,000) and **max profit** ($1,500) per trade.
5. Optional: under **Properties**, turn on **Bar magnifier** (Premium plans). Stop and target fills then use lower-timeframe data and are more accurate.

## How the $ limits work on any contract

The script reads the contract specs from the chart symbol (`syminfo.mintick`, `syminfo.pointvalue`) and turns dollars into ticks:

```
$ per tick           = tick size × point value     (MNQ: 0.25 × $2 = $0.50)
worst loss/contract  = (stop ticks + slippage ticks) × $ per tick + round-trip commission
```

Stops and targets are real bracket orders. They are measured in ticks from the actual fill price, so the dollar amount stays exact wherever you get filled.

### Mode 1 — "Fixed $ stop/target + fixed contracts"

You choose the number of contracts. The stop and target are placed so they are worth exactly your $ amounts (examples below: fees $0.62/side, 1 tick slippage):

| Contracts | Stop | Max loss | Target | Profit |
|---|---|---|---|---|
| 10 MNQ | 99 pts (396 ticks) | $1,997 | 75 pts | $1,500 |
| 1 NQ   | 99.5 pts (398 ticks) | $1,996 | 75 pts | $1,500 |
| 10 MES | 39.5 pts (158 ticks) | $2,000 | 30 pts | $1,500 |
| 1 ES   | 39.5 pts (158 ticks) | $1,989 | 30 pts | $1,500 |

If you switch the chart from MNQ to NQ or ES, the distances recalculate by themselves.

### Mode 2 — "ATR stop + auto contracts" (default)

The stop comes from ATR (like the original, 2 × ATR). The script then works out how many contracts fit so a full stop-out costs at most $2,000. The target is 4 × ATR, capped so it is never worth more than $1,500. Example on MNQ:

| ATR | Contracts | Stop | Max loss | Target |
|---|---|---|---|---|
| 8 pts  | 50 (cap) | 16 pts  | $1,687 | 15 pts → $1,500 |
| 15 pts | 32 | 30 pts  | $1,976 | 23.25 pts → $1,488 |
| 30 pts | 16 | 60 pts  | $1,948 | 46.75 pts → $1,496 |
| 60 pts | 8  | 120 pts | $1,934 | 93.75 pts → $1,500 |

Calm market → more contracts. Wild market → fewer contracts. The risk stays the same. Set **Max contracts** to your firm's position limit.

> With $2,000 risk and a $1,500 cap, every winner is 0.75R. You break even at about a 57% win rate, and you need a bit more to cover fees. Check the win rate on the dashboard.

## Account guard (② in the settings)

| Rule | What it does |
|---|---|
| **Trailing max drawdown** (on, $5,000) | Simulates the firm's trailing threshold, either end-of-day or intraday. It can freeze at start balance + $100. Trades are downsized so a stop-out can never break it. If it breaks anyway (a gap), the strategy flattens and stops trading for good, like a failed account. |
| **Daily loss limit** (off) | Counts realized and open P/L. After a loss, the next trade shrinks to the room that's left. If the limit is hit, the strategy flattens and stops for the day. |
| **Daily profit goal** (off) | Stops trading for the day once reached. Helps with consistency rules. |
| **Max trades / max losers per day** (off) | Hard caps per trading day. The trading day starts at 18:00 New York, like CME and the prop firms. |
| **Safety buffer** ($100) | Space kept between a worst-case stop and any limit. |

Session (③): new trades only 09:30–15:45 New York, Mon–Fri. Positions are forced flat at 15:55. Change both for your firm's rules or to trade overnight.

## Dashboard

The top-right panel shows:

- contract specs ($ per tick)
- the next trade (contracts, stop and target in ticks, points and $)
- today's P/L and trade count
- drawdown floor and room left
- a **rule check**: worst and best trade over the whole backtest against your $ limits, so you can confirm the caps held (✓ / ✗)

Hover over a BUY / SELL label for that trade's full risk details.

## Alerts / automation

Create an alert on the strategy with **Message** = `{{strategy.order.alert_message}}`. Every order then sends JSON like:

```json
{"ticker":"MNQ1!","action":"buy","qty":16,"reason":"entry","price":21345.25,"sl_ticks":240,"tp_ticks":187,"sl_price":21285.25,"tp_price":21392}
```

Exits send `"action":"exit"` with the reason: `stop_loss`, `take_profit`, `breakeven`, `trailing_stop` or `opposite_signal`. Forced closes send `"action":"flatten"`. If your webhook bridge needs a specific contract name (e.g. `MNQZ2026`), set it in ⑨.

## What changed from the original

**Bugs fixed**

- **Stops ignored wicks.** The original checked stop and target only against the candle *close*. If a wick went through the stop and the candle closed back inside, the backtest didn't count the loss. When a candle closed beyond the stop, it booked the whole overshoot. Live losses could be much bigger than the backtest showed. Now stops and targets are real bracket orders that fill intrabar.
- **Crypto leverage sizing replaced.** The "max leverage" and "invested $" sizing doesn't apply to futures. Sizing is now in contracts, based on dollar risk.
- **Martingale removed** (as requested).
- **`lookback1` was never used.** It is now "Signal memory (bars)". The default 0 keeps the original behaviour.
- **Heikin-Ashi is calculated locally** instead of with 4 `security()` calls. Same values, and it's faster.
- **Volume oscillator** no longer divides by zero on symbols without volume.
- **Margin set to 0.** Pine v6 defaults margin to 100%, which would trigger fake margin calls on futures. `fill_orders_on_standard_ohlc` also keeps fills on real prices if someone loads it on an HA chart.

**Added (off by default unless noted)**

- Prop risk engine: $ max loss and max profit per trade, adapted to each contract (**on**)
- Trailing drawdown simulation (**on**), daily loss limit, daily goal, max trades and losers per day
- Session window and forced flat (**on**)
- Break-even (at X% of the way to target) and ATR trailing stop
- VWAP, higher-timeframe EMA and ADX filters (non-repainting), direction filter, cooldown after exits
- Opposite-signal handling: reverse (original), close only, or ignore
- Entry, stop and target lines with risk/reward zones, trade labels with tooltips, dashboard, JSON alerts

## Important

A backtest is not a guarantee. The defaults are a starting point, not tuned settings. Before going live:

1. Run it on a few months of data with the costs set correctly.
2. Check that the rule check shows ✓.
3. Paper-trade or run it on a sim / eval account first.
