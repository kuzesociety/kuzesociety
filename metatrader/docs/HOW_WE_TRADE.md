# How the chat trades - the rules, extracted

**Source:** two exports of a private two-person trading chat, 25 Jun - 29 Sep 2026 (Spanish; the shorter file is the first two days of the longer one).
Only what is *rule-like* was kept - no names, accounts, products or personal details. Clock times are **New York (ET)**, the chart time the participants talk in,
unless stated. Two kinds of statements are kept apart throughout:

* **mechanical** - could be written as code (used to build the setups),
* **claims** - win rates, "x3 with 20% drawdown", "95% of the time": recorded, **not** treated as evidence (see `VALIDATION_REPORT.md`).

Short quotes are in the original Spanish with a translation, only where they pin down a rule.

## 1. Markets and timeframes

* Main instrument **NQ / MNQ futures** on prop-firm style accounts (1:1 to 1.5:1 targets, several accounts at once). Also ES, YM ("mostly one trade - the breakout - then it sleeps"),
  gold ("short rip of gold in 15 min"), EURUSD, BTC (rejected: "CFD costs too high").
* MT5 CFD versions (NAS100, XAUUSD, EURUSD) organised as "sleeves" for the Nasdaq: *normal* (the open), *reversal*, *1pm*.
* Execution on 1-5 minute charts; **decisions only at candle opens** of the hours that matter.

## 2. The clock - "wait for the candle OPEN"

> "esperar aperturas de vela ... es clave y es matemático" - wait for candle opens, it is key and it is mathematical (30 Jun) / "no fallan esas aperturas de vela" - those candle opens do not fail (13 Jul)

| ET | what the chat says happens there |
|---|---|
| 21:00 (Asia open) | "if NY expanded, Asia usually continues without volume until London" |
| 03:00-05:15 (London) | "London blueprint": price takes the previous-day low -> super-bullish -> wait for a candle open, then long (late Sep) |
| 09:30 (NY cash open) | opening candle direction + its **relative volume** decides continuation vs range; "first candles break out cleanly, then reverse" |
| 10:00, 11:00, 13:00, 14:00 | "hourly-open logic": 11:00 behaves like 10:00, 14:00 does the work of 13:00; the 14:00 candle wipes the 13:00 one |
| **10:15** | "reversal hour = 10:15 always" - the most repeated pattern ("the standard"); the 10:00 push reverses, 11:00 pushes the same way |
| **13:00 ("1PM")** | the flagship setup (below); price returns to the open "like a magnet", especially Fridays |
| 15:45 / 16:50 | flat, "no exceptions" |
| 18:00 (Globex re-open) | "6pm short": stop at the open of the 18:00 candle, target the low; "trade against the 5 pm candle, 6 pm continues it" |

## 3. Reference levels

* **The session/hour OPEN** - a magnet ("price taps the open repeatedly"; "Fridays always revert to the open"); bias = which side of it price is on
  ("buy above the open and above highs, sell below lows and the open" - 23 Jul); targets are often "back to the open".
* **The opening box / Initial Balance** - first candle(s) after 09:30 (and after each key hour); an unusually large open candle is called the costliest situation.
* **PDH / PDL (previous day high/low)** - liquidity. "Days PDH gets touched are long days, days it isn't are short days."
* **FVG / engulfing / discount-premium** - "only buy discount"; the nearest FVG "fills" toward one side; PDH/PDL reaction + FVG = "A+ setup".
* **VWAP** - only in a "continuation" variant (limit at an FVG with price vs VWAP).

## 4. Volume ("look at LEVELS and TIME vs VOLUME")

* Relative volume of the opening candle vs the same candle in previous sessions (15 Sep): good volume -> price goes where the open goes; no volume -> nothing / range.
* "Dead volume is better followed than faded."
* Volume that **dries up** during an excursion, then a specific candle = start of the move (the 1PM setup's filter, "needs almost no volume").
* Capitulation volume precedes reversals ("counterparty to forced flow").
* On MT5 CFDs only *tick* volume exists; the chat notes real order-flow (delta) can only be forward-tested on a futures platform.

## 5. The setups and how they were formalised

Each setup below became one **sleeve** (a pure function in `MQL5/Include/KuzeEdge/KzSleeves.mqh`), run at every anchor listed. Parameters are the
chat's numbers where the chat gave one, otherwise the first reasonable value (no optimisation). All are one trade per anchor per day.

| sleeve | chat setup | rule as coded | defaults |
|---|---|---|---|
| **S1 BoxReclaim** | the **"1PM" sleeve** (6 Jul, 14:19-14:20: price leaves the 13:00 box on one side, "si vuelve dentro ... su confirmación" - if it comes back inside, that is its confirmation - then trades to the other side; "stop 1.5 vs tp 1"; "volume filter needs almost no volume") | box = first 15 min after the anchor; price **closes** outside one side (sweep depth 0.05-1.0 box heights), then a bar closes back inside -> fade toward the other side; SL 1.5 x box, TP 1.0 x box; volume gate: average volume of the outside bars <= `volMax` x the box's average (frozen research value 1.0; the EA input `InpS1VolMax` defaults to 0.7); box height must be 0.4-2.5 x the anchor's recent mean; 60 min time stop | `P = {15,120,1.5,1.0,1.0,1.0,0.4,2.5,60,1,0.05}` |
| **S2 OpenExhaust** | "10:15 reversal": drive from the open exhausts, fade it back **to the open** ("target of the long = the open"; "never buy a long continuation after 3 candles going long") | after 45 min, `runN=3` bars in one direction from the open, next bar closes back through the previous bar's extreme at the session extreme -> fade, target the open (capped 3R), 90 min stop | `{45,60,3,0.10,0,0.8,3.0,0.10,90,1}` |
| **S3 IBBreak** | the "drive real" routine (5 Aug): 09:30-10:00 builds the Initial Balance, 10:00-11:30 the only entry window, 15 min "time limit for momentum trades" | first bar to close beyond the IB with volume >= 1.2 x the IB average, on the right side of the open and VWAP; SL inside the IB, 1.5R, no-progress exit after 15 min | `{30,90,1.2,0.5,1.5,15,0.3,0.02,0.5,90,1}` |
| **S4 OpenRetest** | "respect the open": trade the rebound when price taps the open in the direction of the day ("buy the first red candle that touches the open") | day has extended >= 1.0 x box away from the open, pulls back to within 10% of it, a bar closes back on the trend side in the trend colour -> join; 1.5R, signals accepted for 150 min, 90 min time stop | `{15,150,1.0,0.10,1.5,0.10,90,3,2}` |
| **S5 LevelSweep** | PDH/PDL sweep + reclaim (Asia/London "when price touches PDH ... find the FVG") | a bar takes out PDH (PDL), a bar within 3 bars closes back under (over) in the reversal colour -> fade; 1.5R, 60 min stop | `{120,3,0.01,0.20,1.5,0.10,60,0.01}` |

Anchors (`KzPresets.mqh`): US index 09:30, 10:00, 11:00, 13:00, 14:00, 18:00 (Sun-Thu); EU index 08:00 London (= 09:00 Frankfurt, the same instant), 09:30 and 13:00 NY;
metals/energy Tokyo 09:00, London 08:00, NY 08:30, 09:30, 13:00, 18:00; FX Tokyo 09:00, London 08:00, NY 08:00, 09:30, 13:00, 18:00; crypto 00:00,
08:00, 13:30, 16:00 UTC. Every anchor is DST-aware (New York, London, Frankfurt clocks) and converted from the broker's server clock.

## 6. Filters and risk rules in the chat

| chat rule | status in the software |
|---|---|
| "Never sell above PDH **and** above the open" ("vender arriba del PDH y del open es prohibido", 22 Sep) | **implemented, opt-in**: `InpCtxFilter` bit 1; A/B-tested on 308k trades -> **no benefit** (the trades it removes are not worse than the ones it keeps: net -0.12R vs -0.17R) |
| "Never buy at / below PDL without a mega bounce" (2 Jul) | **implemented, opt-in**: `InpCtxFilter` bit 2; same A/B |
| Skip low-volume opens / large open candle | S1's volume gate and box-height band (relative to the anchor's own history) |
| Time limit 15 min for momentum trades; flat by 15:45-16:50 | per-sleeve time stops, no-progress exit (S3), forced flat `InpFlatHHMM` (default 16:50 NY) |
| 1:1 - 1.5:1 R, "TP and SL both mechanical" | every sleeve has a fixed stop and target |
| Daily loss / profit lock ("Equity Guardian", per-broker) | `KzRisk.mqh`: daily loss %, daily profit %, max trades/day, consecutive-loss stop, drawdown kill switch, lot rounding **down** |
| "After a stop, flip - don't re-enter the same direction" | not implemented (one trade per sleeve per anchor per day; no re-entry) |
| "Operate the open as a privilege, not an obligation" (31 Jul); "wait for the double-tap" | discretionary - not codable |
| "Friday: sweep the highs then reverse", "Mondays London = like Fridays US" | discretionary - not implemented |
| "fear candle", "long from PDH ~95%", "buy the first red candle at the open ~95%" | discretionary claims; the chat's own AI review says the fear candle "died out of sample" |

## 7. Deliberately NOT built

* **Grid / martingale / averaging down** - the chat itself says such a system is for short exam-style asymmetry, "not for the long term".
* **A "candle colour" bot** (green candle -> long, red -> short, fixed TP/SL, rotating accounts): the chat's own analysis says "entry has no edge of its own; hit rate comes from TP/SL geometry".
  That is a lottery ticket, not a strategy.
* **Anything that presents randomised or cherry-picked backtests as evidence.** This repository does the opposite: every number is produced by code you can re-run, negative results included.

## 8. What the chat itself concedes (relevant to how much to trust the setups)

* "Patterns that looked great and died out of sample (turtle soup, the fear candle, the VWAP reclaim)" (30 Jun, the chat's AI review).
* "Naive fading is a coin flip"; fading only works against forced sellers with real auction volume.
* The 1PM "~70% win rate, 133 trades in 3 years" was **optimised on the last 1.5 years on TradingView** with the volume filter; "high win-rate sets take few trades".
* "The 1-minute market is chop almost always ... loses money" (Aug); "the good edges are fast and small".
* The edge is described as **regime-specific**: strong in chop/whipsaw, weak on clean trend days.
