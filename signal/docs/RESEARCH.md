# SIGNAL research notes

What the system knows, how it knows it, and what nobody knows yet. Numbers marked *sim* come from the agent-based market simulator in `src/sim`. They show how the machinery behaves; they are **not** evidence about the real market.

## 1. Status

| Claim | Status | Evidence |
|---|---|---|
| Bonding-curve and PumpSwap quotes are exact | Proven | `test/curve.test.ts`: integer math matches the official SDKs on random states; fee tiers match `calculateFeeTier` |
| Events are decoded correctly | Proven for published layouts | `test/decode.test.ts`: create, trade (current and older, shorter versions), complete, migration, pool creation, PumpSwap buy/sell; random garbage never throws |
| Paper accounting is consistent | Proven | balance + open cost − proceeds = start + realized, within 10 lamports, under random trading |
| The learning pipeline finds real edges and rejects fake ones | Proven on synthetic data | `node dist/research.mjs selftest`: planted edge AUC 0.93 → 0.98 after training, top decile +65% vs bottom half −16%; pure noise AUC 0.51 and the go-live check refuses |
| The server survives crashes and long runs | Proven | kill −9 and restart restores positions, settings and the scaled model; 12 simulated hours (3.9 M events) with zero errors |
| The entry logic buys at the right moment | Fixed and tested | One entry per coin at its first qualifying crossing; see section 5 for the simulator comparison |
| Score 75+ makes money on the real market | **Unknown** | Requires recorded live data. The server records from day one, and the go-live check stays red until the evidence is there |

## 2. The venue

- **Bonding curve.** Virtual reserves start at 30 SOL and 1,073,000,000 tokens; 793.1 M tokens are sold on the curve. It completes after about **85 SOL** of real buys, at a market cap of about **411 SOL**, and the coin migrates to PumpSwap.
- **Fees.** 1.25% per side on the curve (0.95% protocol + 0.30% creator). PumpSwap canonical pools charge by market cap: 1.25% below 420 SOL, falling step by step to 0.30% above ~98,000 SOL. PumpPortal's local trade API adds 0.5% per trade. Priority fee: the bot's default is 0.0005 SOL per transaction.
- **Graduation rate.** Public dashboards put it at roughly 1–3% of launches (all-time about 1.4%), so the base rate of any coin "making it" is tiny.
- **Data.** The Solana RPC log firehose (`logsSubscribe`) delivers every pump.fun and PumpSwap event about one slot after it lands. PumpPortal's free websocket gives new tokens and migrations; its trade stream is paid per message. DexScreener's free API adds paid-profile and boost data for graduated coins.

## 3. The game

Every trade pays fees that leave the table, so the **average participant loses**. Profit comes only from being consistently earlier or more selective than the people you sell to.

| Player | Wants | Tell | What SIGNAL does |
|---|---|---|---|
| Launchers (devs) | Sell their supply and earn the creator fee on volume | Large dev holding, early dev selling, many launches per day | Dev share, dev-sold share, launches in 24 h and the creator's past coins are score inputs and filters |
| Bundlers & insiders | Take the launch block through many wallets, sell into the first wave | Supply bought in the launch block | Bundle share is a score input and a filter (25% default) |
| Snipers | First in the opening blocks, flip at 1.5–3× | Supply still held by block-zero buyers | Does not race them; tracks sniper supply still held (their exit is your drawdown) |
| Callers & alpha groups | Buy, post, sell to followers | Bursts of fresh wallets and tweet links after a quiet period | Acceleration, fresh-wallet share and socials are inputs; outcomes decide whether they pay |
| Smart wallets | Repeatable profit | Credible realized record across many coins | Learned from the flow: 8+ closed positions, win rate ≥55% after a pessimistic prior (1 win in 4), average ROI ≥30%, ≥1 SOL realized |
| Copy-trade bots | Mirror tracked wallets | Buys clustered seconds after a tracked wallet | Counted as demand; only rewarded if it paid in the data |
| Late buyers | The next 100× after it trends | Rising market cap, shrinking new money per buyer | The exit liquidity; the bot sells to them at your target |
| Venue & validators | Fees and paid ordering | Always | All fees are inside TP/SL and every measured result |

Design consequence: SIGNAL does not compete on block-zero speed (a race decided by paid priority, tips and co-located servers). It scores the first minutes, when demand beyond the sniper wave either shows up or doesn't, and exits mechanically.

## 4. Costs and break-even

Round trip (buy then immediately sell) at ~54 SOL market cap, from the engine's own cost model (`quoteBuy`/`quoteSell`, rent refunded):

| Size | Cost |
|---|---|
| 0.05 SOL | 5.5% |
| 0.1 SOL | 4.8% |
| 0.25 SOL | 4.9% |
| 0.5 SOL | 5.8% |
| 1 SOL | 7.8% |
| 2 SOL | 11.8% |

Small orders pay the fixed priority fee; big ones move the curve against themselves. 0.1–0.25 SOL is the cheapest range on the curve.

TP and SL are measured on the **net** position value (buy costs in, sell costs out), so fees are already inside them. The only extra is the stop filling below its line in a fast dump. With a 10% stop overshoot, the win rate needed to break even is:

| TP / SL | Break-even win rate |
|---|---|
| 50% / 30% | 44% |
| 100% / 50% (the default plan: 2× or −50%) | 37.5% |
| 100% / 30% | 29% |
| 200% / 50% | 23% |
| 300% / 60% | 19% |

## 5. Simulator findings (*sim*)

Setup: 8 launches per minute, two simulated worlds (early order flow says little about a coin's future, `predictability 0.35`, or a lot, `0.7`), the shipped prior rescaled to the live population, TP 100% / SL 50%, 0.1 SOL, 1.5 s landing delay and every fee. Outcomes were followed until resolved.

**1. The score ranks coins.** Win rate (hitting +100% before −50%) rises steadily with score in both worlds: about 5–7% of snapshots at 60–70 versus 28–40% at 90–100.

**2. When you buy matters as much as what you buy.** The same score means different things at different moments:

| Moment of entry at score 75 | Trades | Winners | Average per trade |
|---|---|---|---|
| First time the coin reaches 75 and holds ~5 s | 750–800 | 33% | **+12.5% to +13%** |
| The same coins signalling again after a dip below 70 | 484 | 1–4% | **−41% to −45%** |

A coin coming back after a dip is usually fading while its running totals (buyers, holders) still look strong. The engine used to re-arm after dips, and when all slots were busy at a coin's first signal it would buy that coin later, on the worst kind of entry. It now takes **one entry moment per coin** (re-entry is an explicit opt-in).

**3. Requiring the score to hold for a few evaluations helps a little.** Buying on the first tick above the line versus after it held for 3–12 evaluations (~1 per second on an active coin) improved results by 2–6 points per trade; 20 evaluations was worse again. The default is now 5.

**4. End to end, with the user's plan** (score 75, TP 100%, SL 50%, 3 positions at a time, 6 simulated hours):

| World | Old entry logic | New entry logic |
|---|---|---|
| predictability 0.35 | 46 trades, 20% winners, **−0.58 SOL** (−12.5%/trade), profit factor 0.58 | 43 trades, 30% winners, **+0.44 SOL** (+10.2%/trade), profit factor 1.55 |
| predictability 0.7 | 29 trades, 10% winners, **−0.59 SOL** (−20.3%/trade), profit factor 0.35 | 40 trades, 33% winners, **+0.27 SOL** (+6.8%/trade), profit factor 1.33 |

These are simulated markets built to test the machinery. They say the entry logic was wrong and is now right; they say nothing about how often real pump.fun coins will hit 2× after reaching 75. That answer comes from the server's own recordings.

**5. Snapshots flatter thresholds.** A snapshot of a coin that happens to be above a score is kinder than buying the moment it gets there. The Learn tab therefore compares thresholds with **entry outcomes**: for every coin, the first time it reached each of 50, 55 … 95 and held, followed as if bought. Snapshot tables are only shown until 200 entry outcomes exist.

## 6. Finding edges independently

The user's plan (score 75, 2×, −50%) is one rule among many. The **edge finder** (`src/core/edges.ts`, Learn tab, `node dist/research.mjs edges`) searches for rules on its own, using only rules the bot can execute:

- **Entry:** the first time a coin reaches one of 10 score levels (50 … 95) and holds, followed exactly the way the bot buys.
- **Which coins:** any, or one of 21 conditions that map to existing settings: bonding curve or graduated, market cap bands (≤40/80/150 SOL, ≥80/150/300 SOL), age (≤1/3/10 min, ≥3/10 min), ≤10% bundled, top 10 holders ≤30%, 30+/100+ buyers, socials, dev holds ≤5%, dev hasn't sold, dev's only launch today.
- **Exit:** 48 take-profit × stop-loss pairs (25–500% × 10–70%, reward:risk from 0.36 to 50) × 4 time limits (none, 10, 30, 60 minutes). Each would-be trade records when every pair triggered and its value at 5, 10, 30, 60 and 120 minutes, so time limits are evaluated from the same trades.

That is about 42,000 rules. Searching that many guarantees some look great by luck, so:

1. **Discovery.** Rules are ranked on the older two thirds of the data only, by a lower confidence bound; the best exit per (score, condition) pair competes, so the finalists are distinct.
2. **Holdout.** The best 20 are re-tested on the newest third, which the search never saw. A rule survives only if its average net return stays positive at a bound corrected for testing 20 at once (z ≈ 2.8), with at least 40 trades and 10 winners (so a rule cannot rest on a few lucky +500% hits).
3. **Placebo.** The whole search runs again on shuffled, centred outcomes where no rule can have an edge. Measured over 40 shuffled runs on synthetic data, it "found" something 3 times (7.5% per search), in line with the 5% it is designed for.
4. **Planted-edge test.** On synthetic data with one real edge hidden among losing rules (graduated coins, score 70+, +50%/−20%), it finds exactly that rule; on pure noise it finds nothing (`test/edges.test.ts`).

Only complete outcomes are used (entries older than the 6-hour follow-up), so the newest data is not biased toward quick exits. The search needs at least a day of recorded market and 1,000 finished entries before it answers, runs after every learning cycle, and never changes settings on its own: **Paper-trade this rule** is a button.

What it cannot do: find an edge that is not in the data, or guarantee that one found in the past continues. pump.fun is adversarial and changes; the search reruns every few hours, and the go-live check keeps judging whatever rule is live.

<!-- EDGE_SIM -->

## 7. Method

- **Outcome tracking.** Every coin that passes basic sanity is followed from fixed checkpoints (20 s, 45 s, 90 s, 3, 6 and 12 min on the curve; 25/50/75% curve progress; 1, 5, 15 and 60 min after graduation), at every signal, and at its first entry moment for each score level from 50 to 95, as if bought with the configured size and a landing delay. Each follow-up resolves on target, stop, dead coin or a 6-hour horizon, for the user's TP/SL and for a 5 × 4 grid of alternatives.
- **Score scale.** `score = 50 + 12.5 · log2(odds / reference odds)`: 75 is 4× the odds of an average coin at that moment, and each +12.5 doubles them again. The shipped prior is rescaled to the live population during the first minutes; entries wait for that (`warming_up`).
- **Learning.** A regularized logistic model per stage (curve, graduated) is refit every few hours on resolved checkpoints. A new model replaces the current one only if it wins on newer data it never saw (walk-forward), and is calibrated before use.
- **Go-live check.** Passes only with ≥150 resolved signals at the user's exact settings **and** a 95% lower confidence bound on the average net return above +2% per trade.
- **Auto-tune (optional, paper only).** Searches 10 thresholds × 20 exit pairs. A suggestion must clear a multiple-comparison-corrected bound (z = 3.5) and be positive separately in the older and the newer half of the data.

## 8. Sources

- pump.fun fees: https://pump.fun/docs/fees
- pump.fun program docs and IDLs: https://github.com/pump-fun/pump-public-docs
- PumpPortal real-time data: https://pumpportal.fun/data-api/real-time · fees: https://pumpportal.fun/fees
- DexScreener API: https://docs.dexscreener.com/api/reference
- Graduation rates: https://solanacompass.com/news/pumpfun-launched-42000-tokens-in-one-day-fewer-than-2-will-ever-reach-a-dex · https://dune.com/jondar/pumpfun
