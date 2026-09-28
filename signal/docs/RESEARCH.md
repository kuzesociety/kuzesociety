# SIGNAL research notes

What the system knows, how it knows it, and what nobody knows yet. Numbers marked *sim* come from the agent-based market simulator in `src/sim`. They show how the machinery behaves; they are **not** evidence about the real market.

## 1. Status

| Claim | Status | Evidence |
|---|---|---|
| Bonding-curve and PumpSwap quotes are exact | Proven | `test/curve.test.ts`: integer math matches the official SDKs on random states; fee tiers match `calculateFeeTier` |
| Events are decoded correctly | Proven for published layouts | `test/decode.test.ts`: create, trade (current and older, shorter versions), complete, migration, pool creation, PumpSwap buy/sell; random garbage never throws |
| Paper accounting is consistent | Proven | balance + open cost − proceeds = start + realized, within 10 lamports, under random trading |
| The learning pipeline finds real edges and rejects fake ones | Proven on synthetic data | `node dist/research.mjs selftest` (the server's own learner, judged on coins it never trained on): planted edge AUC 0.79 → 0.89, top decile +100% vs bottom half −19%; pure noise AUC 0.49 and the go-live check refuses |
| The learner finds combinations of signals, and does not mistake noise for them | Proven on synthetic data | `test/learn.test.ts`: an edge that lives in a combination (XOR) of two inputs, which no weighted sum can rank (AUC < 0.58), is learned by the trees (AUC > 0.75 on unseen coins); on pure noise the trees stay out, because they must beat the weighted sum by a one-sided 5% test counted per coin |
| A new score replaces the current one only when it predicts unseen coins better | Proven | `test/learn.test.ts`: retraining on the same data waits for newer coins; the comparison uses only rows neither model has seen; a working model is not traded for one that ranks worse |
| The edge finder does not take a hot hour of the market for an edge | Proven on synthetic data | `test/edges.test.ts`: where no rule has an edge but the whole market has good and bad hours, counting trade by trade let false rules through in 5 of 18 searches; counting per hour, 0 of 18, and planted real edges are still found (section 6) |
| The bot notices when its recordings stop matching its real trades | Tested | `test/selfcheck.test.ts`: recordings clearly better than the trades they pair with raise a warning, matching ones pass, unobserved exits are not compared; plus the rule-in-use, decision, coverage, plausibility, loop and engine checks, each sent once when it turns bad and once when it recovers (section 8) |
| Would-be trades count only for what was observed | Tested | `test/observed.test.ts`: when a graduated coin's pool is no longer followed, or the trade feed goes quiet, every exit after that moment is unknown and left out of proofs and training, instead of counted as a trade that held its value (section 6) |
| The autopilot trades only rules proven on unseen data, and drops one that stops working | Tested | `test/autopilot.test.ts`: ranking at your limits, no flip-flopping, stale or untrusted searches ignored, the real-money bar holds new entries, benching on its own trades, paper fallback, a manual change turns it off; section 8 for the whole loop on the simulator |
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

- **Entry:** the first time a coin reaches one of 10 score levels (50 … 95) and holds, followed exactly the way the bot buys — or every coin at one of 13 fixed points in its life, whatever its score: 20 s, 45 s, 90 s, 3, 6 or 12 min after launch; a quarter, half or three quarters of the way to graduation; 1, 5, 15 or 60 min after graduating. A proven fixed-point rule is traded with the `entryAt` setting (each coin once, at that point, through the same limits and filters).
- **Which coins:** any, or one of 21 conditions that map to existing settings: bonding curve or graduated, market cap bands (≤40/80/150 SOL, ≥80/150/300 SOL), age (≤1/3/10 min, ≥3/10 min), ≤10% bundled, top 10 holders ≤30%, 30+/100+ buyers, socials, dev holds ≤5%, dev hasn't sold, dev's only launch today.
- **Exit:** 48 take-profit × stop-loss pairs (25–500% × 10–70%, reward:risk from 0.36 to 50) × 4 time limits (none, 10, 30, 60 minutes). Each would-be trade records when every pair triggered and its value at 5, 10, 30, 60 and 120 minutes, so time limits are evaluated from the same trades.

That is about 97,000 rules. Searching that many guarantees some look great by luck, so:

1. **Discovery.** Rules are ranked on the older two thirds of the data only, by a lower confidence bound; the best exit per (entry, condition) pair competes, so the finalists are distinct. Each kind of entry is split on its own time span, so kinds recorded over different spans are all judged on their own unseen days.
2. **Holdout.** The best 20 are re-tested on the newest third, which the search never saw. A rule survives only if its average net return stays positive at a bound corrected for testing 20 at once (z ≈ 2.8), with at least 40 trades and 10 winners (so a rule cannot rest on a few lucky +500% hits). Coins bought in the same hour share the market's mood — a hot hour lifts them all — so the bound is also computed hour by hour (a cluster-robust standard error, with Student's t for the number of hours: t ≈ 3.3 for 16 hours) and the more cautious of the two counts.
3. **Placebo.** The whole search runs again on shuffled, centred outcomes where no rule can have an edge. Measured over 40 shuffled runs on synthetic data, it "found" something 3 times (7.5% per search), in line with the 5% it is designed for — the same 3 with the per-hour count below, as it should be: shuffling removes the market's moods.
4. **Planted-edge test.** On synthetic data with one real edge hidden among losing rules (graduated coins, score 70+, +50%/−20%), it finds exactly that rule; on pure noise it finds nothing (`test/edges.test.ts`).

**Why the hour matters.** Counting trade by trade assumes every trade is independent evidence. On pump.fun they are not: when the whole market runs hot for an hour, every rule's trades in that hour win together. On synthetic worlds where no rule has an edge (every exit breaks even or slightly loses) but the market alternates good and bad hours (every coin's win chance raised or cut by 80–90%, hour by hour), the trade-by-trade holdout let false rules through in 5 of 18 searches (2 of 6 at 2 days of data, 1 of 6 at 3 days, 2 of 6 at 4 days; up to 7 false rules in one search, one of them with a "worst case" of +14.1% per trade) — its design rate is 1 in 20. Counted per hour: 0 of 18. It costs little where the edge is real: a planted edge of +8% to +16% per trade was found in all 36 searches either way (6 seeds × three strengths × with and without market moods); the weakest, +6.5% per trade, in 5 of 6 either way without moods, and 6 → 5 of 6 with them.

**Only what was seen.** Graduated coins trade on PumpSwap, and the bot follows at most 40 pools at a time (held coins first, then the newest graduates). With hundreds of graduations a day a coin's pool is dropped after about two hours, and its would-be trades are followed for up to six. They used to keep their last seen price from then on: a stop-loss that came later never triggered, and holding looked better than it was — worst for rules that buy late after graduation and hold without a time limit. Now the moment a coin's price stops reaching the bot (its pool is dropped, or the whole trade feed goes quiet, as on a sleeping computer) is recorded with each would-be trade, and every exit after it is treated as unknown: left out of the edge finder, the Learn tab and the score's training, instead of counted as a trade that held (`test/observed.test.ts`). On synthetic graduated coins observed for only 30 minutes after entry, the old counting "proved" a rule that holds; counted this way, none. Graduated-coin outcomes recorded before this change cannot say when they froze, so none of their exits is trusted; proofs about graduated coins rebuild from new recordings (about a day). Coins still on the bonding curve were always observed, since every pump.fun trade is streamed.

Only complete outcomes are used (entries older than the 6-hour follow-up), so the newest data is not biased toward quick exits. A rule without a time limit is traded with the follow-up as its limit, exactly as it was tested. The search needs at least a day of recorded market and 1,000 finished would-be trades before it answers and runs every 2 hours. Its answers change settings only through the autopilot (section 8) or the **Paper-trade this rule** button; Telegram's `/edges` shows the latest answer on the phone.

What it cannot do: find an edge that is not in the data, or guarantee that one found in the past continues. pump.fun is adversarial and changes; the search reruns every 2 hours, the autopilot judges the rule in use on its own trades (section 8), and the go-live check keeps judging whatever rule is live.

**End-to-end test on the simulator** (*sim*; 36 simulated hours at 8 launches per minute, about 112,000–115,000 entry outcomes per world). The finder scored about 30,000 rules on the first 28.6 hours and re-checked the best 20 on the last 14.3 hours. In both worlds 19–20 rules held up, and the placebo found 0 in 5 shuffled runs. The survivors were variations of one idea: buy when a coin first reaches 90–95, keep a tight stop (−20% to −30%) and sell after 10 minutes (the +500% target almost never triggers). On the unseen hours they averaged +86% per trade in the low-predictability world and +111% to +124% in the other, against +12% to +24% for the plain 2× / −50% exit on the same entries.

Results that good were checked for a bug before being believed. The recorded 10-minute values match the coins' true price moves minus about 5% of costs (median ratio 0.953 over 54,883 values), and the 2× / −50% exit reproduces the earlier runs. So the finder found a real property **of the simulator**: strong short-term momentum. Its coins keep attracting buyers after a burst (self-exciting order flow), far more than real pump.fun coins can on average — if holding ten minutes after a strong score paid +80% on the real market, everyone would be doing it. The test shows the search works end to end and finds what is in the data; it says nothing about the size of any edge on pump.fun. That comes only from the server's recordings.

**The widened search on the simulator** (30 simulated hours, 6 launches per minute, predictability 0.4). Fixed-point entries now carry the same facts as score entries, so the search covers both: 141,722 would-be trades (70,030 score entries, 60,806 age snapshots, 10,283 curve-progress points, 628 post-graduation points), 65,472 rules scored in 70 seconds (families with too few trades are skipped), 20 re-checked on each family's own unseen hours, 20 held up, placebo 0 in 3 shuffled runs. Fixed points were among the best: *every coin 20 s after launch with 30+ buyers* (+167% per trade on 109 unseen trades) and *halfway to graduation within its first minute* (+129% on 211), alongside the score-95 rules. As before, this is the simulator's momentum, not a pump.fun finding: it shows the wider search runs end to end, keeps each family honest on its own unseen data, and makes every rule it finds directly tradable (`entryAt`).

## 7. Smarter learning (*sim*)

What limited the old learner, and what replaced it (`src/core/learn.ts`, `boost.ts`, `insight.ts`):

| Old | Why it hurt | Now |
|---|---|---|
| A weighted sum of the 36 inputs | Cannot learn combinations: heavy buying is good *unless* the dev already sold; bundles matter early, not late | The weighted sum **plus small decision trees** (depth 3) fitted to what it gets wrong, with early stopping. Trees are used only when they beat the sum on newer coins by more than luck |
| Trained on age snapshots only | The bot buys at a different moment: the first time a coin reaches a score, usually on a burst of buying. Snapshots flatter that moment, and in the no-signal world the old model's probabilities at those moments were worse than the prior's | Also trains on those **buy moments** (the first crossing of each score level), one row per coin moment |
| Label = "the user's own TP/SL hit first" | Changing TP/SL (a strategy switch) silently mixed different targets in the training data | The label comes from each outcome's exit grid: a trade at the model's target (+100% / −50%) ended in profit. It means the same thing whatever the settings were |
| New vs. current compared on the newest quarter of rows | The current model had usually been trained on most of those rows already, so the comparison was not fair. With trees, a model that memorized them would never be replaced | Compared only on rows **neither** model has seen (after the current model's own training data), by a paired test counted per coin |
| Newest outcomes used as they came in | Samples are written when every exit they are followed for has resolved, so among the newest moments quick crashes are in and slow winners are not yet | Only finished cohorts (older than the 6-hour follow-up), as the edge finder does |
| Market cap, curve progress and SOL in the curve all used on the curve | They are one number seen three ways, so the fit gave two of them large opposite weights that cancel, and the "why this score" reasons showed both | Market cap only on the curve |
| Trained scores on the raw odds scale | A calibrated model puts most coins far below 50 and 8–14% of coin moments above 75 (the prior: ~5%), so the user's minimum score suddenly let more coins through once the first model was trained. With only a few slots, the bot then fills them with whichever qualifying coins come first, so a *sharper* model made trades *worse* at the same minimum score | Trained scores are **anchored** like the prior's: the median coin moment scores 50 and the top 5% 75, at every retrain. The minimum score keeps selecting about the same share of coins, and a better ranking makes those coins better |
| Blocked the server for seconds while learning (reading days of samples, fitting) | Stops and exits wait meanwhile | Everything runs in slices of about 15 ms; the longest pause measured during a learning run is ~0.1 s |

**Result on coins neither learner saw** (three 24-hour simulated worlds, 8,700 launches each, 75% of the coins to learn from and the newest 25% to judge on; "buy moments" are the first time a coin reached a score, what the bot actually buys; top 10% = the tenth of buy moments each model rated highest, average net result at +100% / −50%):

| World | Learner | Ranks winners above losers (AUC), snapshots · buy moments | Log-loss at buy moments | Top 10% · top 25% of buy moments |
|---|---|---|---|---|
| predictability 0.7 | prior | 0.835 · 0.758 | 0.585 | +68.9% · +44.1% |
| | old | 0.892 · 0.860 | 0.438 | +96.4% · +68.4% |
| | **new** (128 trees) | **0.923 · 0.871** | **0.386** | +95.9% · +69.2% |
| predictability 0.35 | prior | 0.791 · 0.687 | 0.619 | +42.1% · +32.8% |
| | old | 0.862 · 0.803 | 0.517 | +70.2% · +51.9% |
| | **new** (132 trees) | **0.882 · 0.818** | **0.461** | **+74.9% · +54.4%** |
| predictability 0 | prior | 0.669 · 0.619 | 0.638 | +45.9% · +28.6% |
| | old | 0.786 · 0.666 | 0.659 | +58.1% · +33.4% |
| | **new** (190 trees) | **0.840 · 0.755** | **0.523** | **+82.5% · +53.3%** |

All buy moments together averaged +8.7% to +9.9% in these worlds. The gain is largest where the prior's assumptions are weakest (predictability 0: early order flow reveals nothing about a coin's hidden quality, but the simulator's momentum, rugs and bundles still leave patterns that combine). On shuffled outcomes the learner adopts nothing that ranks (AUC ≈ 0.50), and against a working model it does not adopt noise.

**Trading, not just ranking.** Ranking better is only worth something if the bot makes more with it. Two tests, both at the user's default plan (buy when a coin first reaches 75 and holds, +100% / −50%, 0.1 SOL, 3 positions at a time, 4-hour limit, every cost and a 1.5 s delay):

*A fresh market* (6 simulated hours no model had seen, models trained on an earlier simulated day):

| World | Old learner, as it shipped | Old learner + anchored scale | New learner |
|---|---|---|---|
| predictability 0 | 54 trades, +36.4% each, **+1.97 SOL** | 75 trades, +42.9%, +3.22 SOL | 85 trades, +54.4%, **+4.62 SOL** (half the drawdown) |
| predictability 0.35 | 47 trades, +34.1% each, **+1.60 SOL** | 76 trades, +56.0%, +4.25 SOL | 75 trades, +65.1%, **+4.88 SOL** |

Counting every coin that first reached 75 on that market (not only the ones 3 slots could hold), in the no-signal world: old 544 coins at +33.9% each, old anchored 315 at +47.1%, new 444 at +54.0%.

*Learning while trading* (the whole loop as the server runs it: 24 simulated hours, the bot trades with its current score, records outcomes and retrains every 6 hours, the default then (now 2); profit from hour 6, when the first model can be trained, to hour 24):

| World | Seed | Old learner, as it shipped | Old learner + anchored scale | New learner |
|---|---|---|---|---|
| predictability 0 | 77 | +10.02 SOL | +7.39 SOL | +7.92 SOL |
| | 78 | +7.40 SOL | +6.30 SOL | **+14.76 SOL** |
| | 79 | +10.91 SOL | +10.90 SOL | **+16.26 SOL** |
| | total | +28.3 SOL | +24.6 SOL | **+38.9 SOL** |
| predictability 0.35 | 77 | +7.75 SOL | — | **+9.98 SOL** |
| | 78 | +4.93 SOL | +14.63 SOL | +14.31 SOL |
| | 79 | +5.92 SOL | +10.09 SOL | +9.10 SOL |
| | total | +18.6 SOL | — | **+33.4 SOL** |

Without learning (the prior, seed 77) the same hours made +0.01 SOL and +0.67 SOL. The new learner beat the old one in 5 of 6 runs. Where early flow says something (0.35), most of the gain is the anchored scale — the old learner with it does about as well; where it says nothing about a coin's hidden quality (0), the anchored scale alone does not help the old learner and the gain comes from what the new one learns. Single 6-hour stretches swing by ±1.5 SOL, which is why there are three seeds.

The finding that made the anchored scale necessary: the first version of the new learner kept the raw odds scale, and at the default plan it made *less* than the old learner over the same 24 hours (seed 77: +7.3 vs +10.3 SOL at predictability 0, +4.5 vs +8.1 SOL at 0.35) while ranking better. A sharper model put twice as many coins above 75; with 3 slots the bot takes whichever qualifying coin comes first, so the extra, weaker ones crowded out the good ones. At a higher minimum score (90) the same model beat the old one (+6.14 vs +5.93 SOL, profit factor 6.65 vs 4.57). Anchoring the scale makes the user's minimum mean the same share of coins after every retrain.

As everywhere in this document: these are properties of the simulator, which shows that the learner finds what is in the data and refuses what is not. How much it helps on pump.fun is measured by the server on its own outcomes — the Learn tab's **What the bot learned** shows, for coins the score has never seen, how often it ranks a winner above a loser and whether the win chances it gives match what happened.

## 8. Autopilot

The learning loop runs every 2 hours: retrain the score (switch only if the new one predicts coins neither model has seen better), search for rules (section 6), then the **autopilot** (`src/core/autopilot.ts`) decides which rule the bot trades.

- **Which rule.** Among the rules that held up on unseen data, the one with the most *worst-case* SOL a day at the user's size and limits: the holdout's corrected lower bound per trade × the trades a day it would get, capped by the hourly limit and by the open-position limit (slots × a day ÷ its average time in a trade). A rich rule that trades twice a day can lose to a modest one that trades sixty times.
- **Selection is covered.** The 20 holdout bounds are corrected to hold all at once, so picking the best of them does not inflate its bound.
- **When.** Only on a search younger than 6 hours whose placebo found at most 1 rule in 5 shuffled runs. A rule in use is replaced only by one worth 25% more a day, so it does not flip-flop on noise.
- **It stays until the evidence turns.** The first version went back to the owner's rule whenever the newest search did not list the rule in use again. On a real bot that dropped a profitable rule two hours after switching to it. Not being listed is not evidence against a rule: each search re-checks only its 20 best candidates, and which ones those are shifts as data comes in. Now only three things end a rule. Its own trades, or every coin that qualified for it after its proof (its forward test), can show it clearly worse than promised. Or a rule worth 25% more a day can be proven.
- **Judged on its own trades and on the coins after it** (checked every 10 minutes). After 30 closed trades under a rule, or 40 coins that qualified for it after its proof (as far as observed, the ones it could not take included), if the top of the 95% range of their average (per hour, for the coins) is below the worst case the rule was switched in on, the rule is benched for 24 hours and the next best (or the user's own rule) takes over.
- **Real money.** Only rules with at least 100 unseen trades and a worst case above +2% per trade. Without one, new live entries wait (`autopilot_hold` in *Why no trade?*); exits always go through. Turning it on in live mode asks for confirmation; a bot already live before the update keeps its own rule until the owner turns the autopilot on.
- **Only the rule.** Entry, coins, take profit, stop loss and time limit. Never size, limits or mode. A manual change of the rule turns it off; in paper mode, with nothing proven, the user's own rule is traded.
- **One standard for every finding.** The score is replaced automatically when a new model predicts unseen coins better (section 7); the rule, when the edge finder proves one on unseen data. The Learn tab's in-sample suggestion searches a subset of the edge finder's rules (score levels × any coin × exits), so with the autopilot on it is not a separate path. Deliberately never automatic: trade size, limits and mode (risk is the owner's decision, and sizing up on past results is the classic way to blow up), and realism settings such as the paper delay, which "optimizing" would only make less honest.

**On the simulator** (*sim*; the whole loop without a person: 48 simulated hours at 6 launches a minute; the score retrains every 2 hours; the edge finder answers every 4 hours from hour 24 (on the server: every 2); the bot starts on the default plan — first reaches 75, +100% / −50%, 0.1 SOL, 3 positions, 4-hour limit, 1.5 s delay, every cost; profit from hour 24, when the first search can answer, to hour 48):

| World | Seed | The plan all along (autopilot off) | Autopilot on |
|---|---|---|---|
| predictability 0.35 | 77 | +17.3 SOL | +37.4 SOL |
| | 78 | +16.9 SOL | +36.7 SOL |
| predictability 0 | 77 | +17.7 SOL | +51.5 SOL |
| | 78 | +14.4 SOL | +48.3 SOL |

The first search with a day of finished outcomes answered at hour 28, and the autopilot switched at once. Every search after that found 16–20 rules on unseen hours and none on shuffled data. Of the 16 later answers, 8 switched rules and 8 kept the one in use. A switch needs a rule worth at least 25% more a day, or the rule in use dropping out of the proven set. Once, it chose a rule with a lower average per trade (+208% against +236%) because it qualified more coins a day at the same limits. The rules then made about what had proved them: +111% to +275% per trade over 6-hour stretches, against +155% to +270% on the unseen hours. The watchdog never had a reason to bench one.

What this means, and what it does not:
- **The numbers are the simulator's, not pump.fun's.** Every rule was a version of one idea: buy when a coin first reaches 75–95, with a tight stop, and sell after 10 minutes (the +500% target almost never triggers). That is the simulator's strong short-term momentum (section 6). An edge of +100% to +275% per trade on a real venue would be competed away. These runs say nothing about what the autopilot will earn on pump.fun.
- **What they do show:** the loop runs end to end on its own. It learns, searches, switches the moment a rule is proven and ranks rules by what they earn at the user's limits. It does not chase a slightly better rule, and the rules it picks keep delivering on coins that did not exist when it picked them.
- **What they cannot show:** behaviour where there is no edge. This simulator always has one. That case is covered on synthetic data: pure noise, and markets with hot and cold hours, where the finder "proves" nothing (section 6), so the autopilot switches nothing and, with real money, waits.

**When the market turns against the rule** (*sim*; the same loop at predictability 0.35. At hour 30 the market changes: every entry lands 15 seconds late instead of 1.5, as if faster bots now got there first. The autopilot also checks the rule in use every 10 minutes, as on the server). Profit from hour 30 to 48:

| Seed | Plan, market unchanged | Plan, market changed | Autopilot, market unchanged | Autopilot, market changed |
|---|---|---|---|---|
| 77 | +12.7 SOL | +6.1 SOL | +31.1 SOL | +12.5 SOL |
| 78 | +13.2 SOL | +4.8 SOL | +30.2 SOL | +12.8 SOL |

- **Both got worse.** Late entries cost the plan and the autopilot alike 52–63% of their profit. No rule protects against a market that changes.
- **The autopilot noticed.** With seed 77, a search at hour 32 still proved rules mostly on the old market and switched in one promising at least +98.8% per trade. Its first 30 trades in the new market averaged +48.5%, so at hour 36.5 it was benched and the next rule took over.
- **The searches moved on too.** In both runs they replaced rules at hours 40 and 44 as their unseen window slid into the new market. With seed 78 nothing was benched: its rules' own trades were never clearly worse before the next search replaced them.
- **The edge weakened but did not die.** Late entries still catch much of the simulator's 10-minute momentum, so the autopilot still made 2.0–2.6 times the plan. The case where every edge dies (no proven rule left: back to the owner's rule in paper, new entries held with real money) is covered by `test/autopilot.test.ts`, not by this simulator, which cannot remove its own momentum without rewriting it.
- **The cost of trusting the past** is visible here: for 4.5 hours the autopilot traded a rule proven on a market that no longer existed. It was still profitable, but below its promise. The watchdog bounds that to about 30 trades, and the real-money bar exists because of it.

What it cannot know: whether the past keeps paying. Every guard above is about not trusting luck; none makes a rule's future certain. A rule that buys at a score level was proven with the scores the bot gave at the time; after a retrain the same level selects the same share of coins (the anchored scale) but not the same coins, and only the next searches and the rule's own trades show whether it still pays. The watchdog limits how long a rule that stopped working keeps trading (30 trades), and the real-money bar is deliberately strict.

**Self-check** (`src/core/selfcheck.ts`). The problems found so far — a rule dropped for no reason, prices that stopped updating — were spotted by a person looking at the dashboard. The bot now looks for that kind of problem itself, every 10 minutes and in full every 2 hours, and tells the owner on Telegram when a check turns bad or recovers, plus a daily check-up:
- **Recordings against real trades.** Each closed trade (a clean exit at its target, stop or time limit) is paired with the recording of its own signal: same coin, same moment, same take profit, stop and time limit, read from the recording's exit grid as far as it was observed. The difference per pair (recording − trade) is averaged over the last 7 days with a 95% range counted per hour; from 20 pairs, a low end above +5 points per trade means the data everything is learned and proven from is optimistic — a missed stop, a fill that could not happen, a price that stopped updating. It compares like with like, so it catches such problems whatever their cause, including ones nobody has thought of yet. It cannot see what the recordings and the trades get wrong alike (for example a decoding error that moves both prices).
- **The rule in use against its promise**, its own trades with a per-hour range (the autopilot's watchdog acts on the same comparison).
- **Steady decisions**: more than 4 rule changes a day.
- **What it sees**: the share of recordings that went unobserved, graduated coins and feed outages apart; a down feed is a failure.
- **Plausible promises**: more than +30% per trade on unseen data is flagged (with real money, as a warning).
- **The loop and the engine**: learning and edge searches on time and without errors, internal errors, failed saves.

## 9. Method

- **Outcome tracking.** Every coin that passes basic sanity is followed from fixed checkpoints (20 s, 45 s, 90 s, 3, 6 and 12 min on the curve; 25/50/75% curve progress; 1, 5, 15 and 60 min after graduation), at every signal, and at its first entry moment for each score level from 50 to 95, as if bought with the configured size and a landing delay. Each follow-up resolves on target, stop, dead coin or a 6-hour horizon, for the user's TP/SL and for an 8 × 6 grid of alternatives.
- **Score scale.** A straight line in the model's log-odds, anchored on the population of coin moments: 50 is the typical moment and 75 the top ~5%. The shipped prior is rescaled to the live population during the first minutes (its weights get one temperature so scores spread ~16 points around 50); entries wait for that (`warming_up`). A trained model is anchored at each training: its calibrated log-odds at the median checkpoint scores 50 and at the 95th percentile 75. Trained models used to keep the raw odds scale (`50 + 12.5 · log2(odds / reference odds)`), on which a calibrated model puts most coins far below 50 and 8–14% of moments above 75 (the prior: ~5%), so the user's minimum score let more coins through the moment the first model was trained, and even more with a sharper model; see section 7.
- **Learning.** Every 2 hours by default (`LEARN_EVERY_HOURS`), per stage (curve, graduated), on finished outcomes: fixed checkpoints and first crossings of each score level, one row per coin moment (rows of one coin within 3 s are one moment), labelled from the exit grid for the model's target. Rows are split by coin in time order: the older 60% to fit, the next 15% to calibrate (Platt) and to stop the trees, the newest 25% to check. Recipe 1 is a logistic model shrunk toward the current weights (L2, recency half-life 3 days); recipe 2 adds gradient-boosted trees (depth 3, learning rate 0.08, quantile histograms, early stopping) on its logit. Recipe 2 is kept only if its log-loss beats recipe 1's by ≥ 1.65 standard errors, counted per coin. The winner replaces the current model only if, on checking rows the current model has not seen either (≥ 200 with ≥ 10 wins), its log-loss is lower by ≥ 0.001 and ≥ 1.5 standard errors per coin, and it does not rank worse (AUC −0.005). It is then refitted on every row before going live. The score's reference odds are the win rate of checkpoints (all coins, not just the surges). Between runs, the model is checked every 2 hours on finished outcomes of coins it has not seen; if its ranking falls clearly below what it showed when adopted (or to chance), it retrains early.
- **Evidence per hour.** Every confidence range the system acts on or shows — the edge finder's holdout, the go-live check, the Learn tab's tables and its suggestion — is the wider of two: trade by trade, and hour by hour (a cluster-robust standard error over the hours the coins were bought in, with Student's t for the number of hours). Coins bought in the same hour share the market's mood, so a run of hot hours is a few pieces of evidence, not thousands. On a synthetic stretch where every exit loses on average but 20 of 30 hours happened to be hot, the trade-by-trade go-live check would have passed; per hour it does not (`test/report.test.ts`).
- **Go-live check.** Passes only with ≥150 resolved signals at the user's exact settings **and** a 95% lower confidence bound (per hour, above) on the average net return above +2% per trade.
- **Auto-tune (optional, paper only, with the autopilot off).** Searches 10 thresholds × 48 exit pairs (480 hypotheses). A suggestion's lower bound, corrected for all 480 (one-sided 0.05/480) and counted per hour, must be positive and beat the current settings' bound, and it must be positive separately in the older and the newer half of the data. (It used to be corrected for 200 hypotheses, from when the exit grid had 20 pairs.) Its search lies inside the edge finder's, which judges it on unseen data, so with the autopilot on the edge finder decides.

## 10. Sources

- pump.fun fees: https://pump.fun/docs/fees
- pump.fun program docs and IDLs: https://github.com/pump-fun/pump-public-docs
- PumpPortal real-time data: https://pumpportal.fun/data-api/real-time · fees: https://pumpportal.fun/fees
- DexScreener API: https://docs.dexscreener.com/api/reference
- Graduation rates: https://solanacompass.com/news/pumpfun-launched-42000-tokens-in-one-day-fewer-than-2-will-ever-reach-a-dex · https://dune.com/jondar/pumpfun
