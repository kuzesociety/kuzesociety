# SIGNAL

A 24/7 pump.fun radar and trading bot. It watches every launch and trade on-chain, scores each coin 0–100, and can paper-trade or live-trade the coins that reach your score. It measures, with delay and fees included, whether your settings actually make money.

The bot runs on a **server** (a VPS, a cloud container, or your PC). The dashboard is a remote control you open from your phone. Closing the browser or locking your phone does not stop the bot, and Telegram tells you what it did while you were away.

> **Risk.** Most pump.fun coins go to zero, and a stop-loss is a market sell, not a guarantee. The bot starts in **paper mode** and has a built-in go-live check. Only use money you can lose.

---

## 1. Run it

### Option A: cloud, from your phone (Railway, about $5–10/month, usage-based)
1. Open [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → pick `kuzesociety/kuzesociety`, branch `claude/signal-meme-trading-bot-o142hw`. Railway finds the `Dockerfile` automatically.
2. **Variables**: add `DASHBOARD_TOKEN` (a long random password), plus `RPC_URL` / `RPC_WS_URL` (see step 2). Add the Telegram variables if you want alerts.
3. **Volumes**: add a volume mounted at `/data`. Without it, trade history resets on every redeploy.
4. **Settings → Networking → Generate domain**, then open `https://<your-domain>/?token=<DASHBOARD_TOKEN>`.

Render works too (`render.yaml` is included). It needs the paid Starter instance, because the free one sleeps.

### Option B: VPS (Ubuntu, about $4–6/month at Hetzner, DigitalOcean, etc.)
```bash
curl -fsSL https://raw.githubusercontent.com/kuzesociety/kuzesociety/claude/signal-meme-trading-bot-o142hw/signal/deploy/install-ubuntu.sh | sudo bash
```
This installs Node, builds, creates a systemd service that restarts on failure, and prints your dashboard link and token. Configuration lives in `/opt/signal/signal/.env`; run `systemctl restart signal` after editing it.

With Docker instead: `cd signal && cp .env.example .env && docker compose up -d`.

### Option C: your Windows PC (free) — step-by-step guide: [`docs/SETUP-WINDOWS.md`](docs/SETUP-WINDOWS.md)
Install [Node.js LTS](https://nodejs.org), [download the bot](https://github.com/kuzesociety/kuzesociety/archive/refs/heads/claude/signal-meme-trading-bot-o142hw.zip), then double-click **`signal/start-windows.bat`**. The dashboard opens in your browser (on the PC itself no token is needed) and the bot restarts automatically if it stops. Everything else — the data-feed key, Telegram, and later the wallet — is done with buttons in **More → Setup**. `autostart-windows.bat` makes it start with Windows. On a Mac, use `start-mac.command` (it also keeps the Mac awake).

**Updates install themselves:** a copy started this way checks for a new version every 30 minutes and installs it on its own — never in the middle of placing or selling an order, and after a learning run in progress has finished. It downloads the new version, checks it, keeps a copy of every file it replaces (`data/update-backup/`), installs it over the folder — never touching `data/` (keys, settings, trade history, open trades), `.env` or `work/` — and test-starts it before restarting into it. Open trades stay open: the new version picks them up and manages their exits. A version that does not start is put back at once; one that keeps stopping after the restart (more than 3 starts in its first half hour) is put back at its next start; either way Telegram says so and that version is not installed by itself again. Recordings in progress at a restart are kept as far as they were watched. To update only when you say so, set `AUTO_UPDATE=0` in `.env`: the dashboard then shows a blue bar when a version is ready (**More → Setup → Update now**, or send `/update`). Servers update by redeploying (Railway/Render) or `git pull && npm run build` (VPS).

### Try it in your browser first
`dist/companion.html` (built by `npm run build`) is a single page that runs the real engine on a simulated market, with a research tab and a setup wizard that generates your server settings. Nothing in it touches real coins or money, and it stops when the page closes.

### Try the server without any keys
Set `SIM=1` (or run `npm run build && node dist/engine.mjs --sim`). A simulated market with fake coins runs so you can explore the dashboard. The dashboard shows a banner that it is simulated.

## 2. Data feeds

| Feed | What it gives | Cost |
|---|---|---|
| **Solana stream** (free public feed by default) | Every pump.fun create, trade and graduation, decoded from on-chain logs about one slot after landing. Graduated coins on PumpSwap are followed pool by pool: the ones held, and fresh graduates for an hour | Free. The public Solana feed allows 100 MB per 30 s; the pump.fun stream is a small part of that |
| Your RPC key (`RPC_URL`, optional) | Sending orders when live, and lookups | A free [Helius](https://helius.dev) key is enough |
| PumpPortal | New launches and migrations, plus trades for held coins if `PUMPPORTAL_API_KEY` is set | Free / paid per message |
| DexScreener | Paid profiles and boosts, USD quotes and liquidity for graduated coins | Free |

**Why not stream through a key?** Providers bill streams by volume (Helius: 20 credits per MB). Every pump.fun *and* PumpSwap transaction is about 2–3 MB a second — a Helius free plan (1M credits a month) lasted about five hours, and PumpSwap is about nine tenths of it (most PumpSwap pools never came from pump.fun). So the bot does not stream all of PumpSwap (`AMM_FIREHOSE=1` turns it back on), and streams through your key only if you choose it in **More → Setup**, within a daily cap (`STREAM_BUDGET_MB_PER_DAY`, default 1500 MB), after which it uses the free feed until 00:00 UTC.

**Health** (More → Health) shows each feed's server, message rate, data per day and reconnects. The bot does not open trades while its primary feed is down.

## 3. How the score works

- **Scale.** The score ranks coins by their odds of hitting your target before your stop (higher is always better odds) on a fixed scale: **50 is a typical coin moment and 75 the top 5%** of moments. The starting model is scaled that way from the live market in its first minutes. A trained model is anchored the same way each time it learns, so a sharper model makes the bot pickier within the same share of coins, rather than letting more coins past your minimum score. How *often* coins reach 75 still moves with the market. Once trained, each coin also shows its win chance, P(win), in **Why this score**.
- **Inputs (36 features).** Buyer inflow and acceleration, distinct buyers, buy/sell mix, whale share, dev holdings and dev selling, launch-block bundles, sniper supply, top-10 concentration, drawdown from peak, smart wallets (learned from the order flow), fresh-wallet share, socials, tweet links, narrative clusters (copycats versus the leader), serial launchers, market heat, liquidity, and time since graduation. **Why this score** on each coin shows the top reasons in points.
- **Learning.** Every eligible coin is followed as if bought with your size and delay, until the target or the stop is hit: from fixed checkpoints in its life, and from the moment it first reaches each score level, which is exactly when the bot buys. Every 2 hours (`LEARN_EVERY_HOURS`) the score is refitted on these finished outcomes in two ways:
  - as a weighted sum of the inputs;
  - as the weighted sum plus small decision trees, which learn combinations a sum cannot ("heavy buying, *but* the dev already sold").

  The better recipe replaces the current score only if it predicts newer coins, which neither of them has seen, better by more than luck. If the score clearly stops working on new coins, it retrains early. **Learn → What the bot learned** shows what moves the score now (and how that differs from the starting assumptions), whether it still works on coins it has never seen, and every learning run. Telegram: `/learn`.
- **First start.** The shipped prior is rescaled to the live market in the first few minutes. Entries wait for that. The funnel reports this as `warming_up`.

## 4. Bot settings (Bot tab or Telegram)

**Autopilot** (top of the Bot tab, on by default; Telegram `/autopilot on|off`): the bot picks its own rule. Every 2 hours it retrains the score (keeping the new one only if it predicts coins neither model has seen better) and the edge finder searches your recorded market for rules that made money on data the search never saw (section 5). The autopilot then switches, at once, to the rule that earns the most per day at your trade size and limits, counted from its *worst case* on that unseen data. It changes only the rule — entry score or moment, which coins, take profit, stop loss, time limit — never your trade size, limits or mode. A rule you pick yourself — a strategy, a proven rule from the list, one click on a past decision, or your own settings — leaves it on: your rule then competes with the proven ones (below). Turn it off to trade your rule no matter what.

It is built not to fool itself:
- It acts only on a fresh search (under 6 hours old) whose luck check stayed clean: the same search on shuffled outcomes, where no rule can work, may "find" at most 1 rule in 5 runs. Coins bought in the same hour count as one piece of evidence, so a hot hour of the market is not taken for an edge.
- Once in use, a rule stays until there is evidence against it. A later search that simply does not list it again is not such evidence: each search re-checks only its best candidates, and those shift as data comes in. A new rule replaces it only if it earns at least 25% more, so it does not flip-flop on noise.
- The rule in use is judged on its own trades (after 30) and on every coin that qualified for it after it was proven (after 40, the trades it could not take included). If either is clearly worse than it had shown (the top of its 95% range below the worst case it promised), it is benched for a day and the next best rule, or your own, takes over.
- Only what was actually seen counts, and never in a way that favors quick wins. The bot follows at most 40 PumpSwap pools at once, so a graduated coin's price stops reaching it after a while (so does everything open while the trade feed is silent for a minute or more, for example on a sleeping computer; a reconnect of a few seconds is not an outage — the bot's own trades see the same short delay, and entries wait it out). A stop-loss nobody saw is never counted as a trade that held its value. Nor are the exits that happened to come before watching stopped kept on their own: those are the quick ones, mostly take-profits when the target is near, so a rule would look better than it is (on synthetic coins where a rule loses 8% a trade, counting that way showed it at break-even). Such a recording counts for a rule only if it was watched for the rule's whole time limit, whatever its result, so a rule on graduated coins that holds for hours can rarely be proven from recordings; if it is your rule, it is judged by its own trades. Coins bought on the bonding curve lose their price only by graduating, which is a result in itself, so for them the exit only needs to have been seen. Graduated-coin outcomes recorded before observation was tracked are not trusted at all, so after updating, rules about graduated coins need about a day of new recordings to be proven again. Trades follow the same principle: the bot never buys a graduated coin whose price it is not following (its last price could be an hour old), nor one followed again after a gap until a swap has brought its price up to date; coins your rule is about to buy (say, 1 h after graduating) are followed first, so busy hours are not skipped.
- **Real money:** turning it on asks for a second tap (`/autopilot on yes`), and it uses only rules at the go-live bar (at least 100 unseen trades and a worst case above +2% per trade). Until one exists, **new live entries wait**; open positions are still managed. A bot already trading live before this update keeps its own rule until you turn the autopilot on.
- **Your own rule competes** (paper mode). A proven rule replaces it only if it would make at least 25% more a day, both counted at their worst case, than the best evidence about yours: its own trades once it has 30 (every trade records the rule it was made under), and until then the newest recordings — your exact rule (entry, stages, filters, conditions, exits) on the same part of the data the search checks its candidates on, with the same corrected bar. So picking a rule never hands the choice back to luck: a rule you pick is measured at once and kept if it holds its own; one the recordings cannot express exactly (a take profit, stop or time limit the bot does not record, a trailing stop) has nothing to be weighed by until its own trades, and the Entry card tells you so while you edit. Your rule's evidence is shown on the Autopilot card.
- Picking a rule the search has proven makes it the autopilot's own pick, judged like any other.

Every decision, with its numbers, is listed on the Autopilot card (**Decisions**) and sent to Telegram. Each one names the rules it is about — the one switched to, the one dropped, your own — with a **Use this rule** button, so going back to any of them is one click. The numbers in a decision are what was known then; the autopilot weighs the rule again from what is known now.

**Self-check** (Bot tab, Telegram `/checks`): the bot watches itself, so a problem does not have to be spotted by you. Every 10 minutes (in full every 2 hours) it answers, with ✓ / ⚠️ / 🛑:
- **Do its recordings match its real trades?** Every closed trade is paired with the recording of the same coin at the same moment, under the same exits. The recordings are what the score, the edge finder and the autopilot learn and prove from; if they come out clearly better than what the bot actually got (by more than 5 points per trade at the low end of the range), everything proven on them is too optimistic, and you are told. This is the check that catches the kind of problem where a price stops updating.
- **Does the rule in use keep its promise?** Its own trades against the worst case it was switched in on.
- **Are the autopilot's decisions steady?** More than 4 rule changes in a day looks like chasing noise.
- **Does the bot see what it records?** How many recordings stopped being watched before they ended (graduated coins beyond the 40 followed pools, feed outages of a minute or more); a down feed is flagged at once.
- **Are the promises plausible?** A rule claiming more than +30% per trade is flagged: on a real market that is more often a measuring problem than an edge.
- **Does learning run on time, and does the engine run cleanly** (errors, failed saves)?
- **Does storage have room?** The data folder against its limit, and the disk's free space — a warning well before saving could fail.

A check that turns bad, or recovers, is sent to Telegram at once, and once a day a check-up summarises trades, the rule in use and every check.

**Copy a diagnosis for Claude** (bottom of the Self-check card): everything the bot sees on one page, to paste into a chat — how much it has recorded and how much of it was watched to the end (by day), what every entry looks like on all finished data before any proof, the last search with its closest tries and luck check, the rule in use measured on the recordings and by its own trades, the autopilot's latest decisions, and the checks. No keys or wallet in it. The same page on the computer running the bot: `node dist/research.mjs diagnose --data ./data` (on Windows, in `C:\SIGNAL`: `node dist\research.mjs diagnose --data data`).

**What is automatic, and what never is.** With the autopilot on, every finding on the dashboard is applied by itself as soon as it is proven: the score (a new model replaces the current one when it predicts coins neither has seen better) and the whole rule (entry, coins, exits, time limit) — from the edge finder or from the Lab (section 5), whichever proved more per day. There is one standard of proof for all of it: better on data the search never saw, counted per hour, with a clean luck check. The Learn tab's *Better settings found* is a narrower search inside the edge finder's, so it is shown (with its Apply button and auto-tune) only when the autopilot is off. Never set automatically, on purpose: your trade size, limits and mode (how much you risk is your call — sizing up on past results is how accounts blow up), and the realism settings such as the paper delay (a shorter simulated delay always looks better, which would be fooling itself).

**Strategy** (under the Autopilot): one tap switches the whole rule — entry score, which coins, take profit, stop loss and time limit — to *Your plan*, the *Simulator finding* (unproven, for paper-testing), or any rule the edge finder proved on your data. In live mode it asks for a second tap.

**Buy** (top of the Entry card): when the score reaches your minimum, or at a moment in every coin's life — some time **after launch** (still on the bonding curve), **after graduating**, or a share of the way to graduation. The bot always records every coin at 20 s, 45 s, 90 s, 3, 6 and 12 min after launch and 1, 5, 15 and 60 min after graduating (quick picks). Type any other time and it becomes a **moment of your own**: from the moment you save it, the bot records every coin there too (up to 4 such moments, kept after you switch rules; × removes one). After about a day of recordings the edge finder searches rules at it like the fixed ones, and your rule at it can be weighed. A moment is the whole entry: the score is not used, and **No filters** (the score-only switch) buys every coin at that moment.


| Setting | Meaning |
|---|---|
| Buy | When the score reaches your minimum, or at a moment after launch or after graduating — a recorded one or any time of your own (see above) |
| Minimum score | Enter when a coin reaches this. The slider shows how many coins per hour recently reached each value |
| **Score only** | Buy on the score alone and ignore all token filters. Account limits still apply: size, max open positions, daily loss, one entry per coin, trades per hour |
| Take profit / Stop loss | Net of every cost: pool fees, 0.5% venue fee, priority fee, account rent. The stop is fixed from entry. In a crash the fill can land below it, and the bot always sells |
| Sell after | Time limit per trade: sells at market if neither target nor stop was hit (0 = no limit). The recordings keep 5, 10, 30, 60, 120 min and 6 h, so with one of these (and a recorded take profit and stop) the autopilot can weigh your rule on them |
| **One entry per coin** | The bot buys a coin only at its first entry moment: the first time the score reaches your number and holds. In simulation, buying the same coin again after a dip lost about 40% per trade. Turn on re-entry to allow it anyway |
| Score must hold | Evaluations in a row (about one per second on an active coin) at or above your score before buying. Default 5: skips one-off spikes and costs a few seconds |
| Entry slippage + retry window | A buy lands at the price when the transaction lands. If the price moved further than your slippage, the buy fails like on-chain and the bot retries while the score still holds |
| Dead-coin exit | Sells a coin with no trades for N minutes so dead positions don't block new entries |
| Trailing stop / take initials | Optional: after the target, sell the stake and let the rest ride with a trailing stop |

**Why no trade?** The Bot tab shows, for the last hour, how many coins were scored, how many reached your score, what was bought, and exactly why the rest were blocked.

Telegram commands: `/status /positions /pause /resume /autopilot /checks /lab /idea /strategy /edges /learn /score 75 /tp 100 /sl 50 /hold 10 /size 0.1 /scoreonly on|off /kill /unkill /update /link`. `/lab` shows what the Lab is testing and what it proved; `/idea <rule>` adds your own. `/autopilot` shows the rule in use and why; `/autopilot on|off` switches it. `/strategy` lists the ready-made rules and the ones the edge finder proved; `/strategy 2` switches the whole rule. `/edges` shows the edge finder's latest answer (every 2 hours once there is a day of data). `/link` sends the dashboard links that open on the phone: home Wi-Fi, and anywhere once [Tailscale](https://tailscale.com/download) (free) runs on the computer and the phone with the same account.

## 5. Is it making money?

Background, costs, break-even tables and simulator findings: [`docs/RESEARCH.md`](docs/RESEARCH.md).


The **Learn** tab answers this with your own data:
- **what the bot learned**: the score's recipe, the inputs that move it most (↑ raises, ↓ lowers, ↕ depends on the rest) against the starting assumptions, how well it ranks coins it has never seen (and whether the win chance it gives matches what happened), and the history of learning runs
- outcome by score bucket (win rate and average net result with a 95% range)
- a threshold table (coins per hour versus result)
- a take-profit × stop-loss heat map for coins above your score
- your paper-trading results (profit factor, drawdown)
- the **go-live check**: it passes only with ≥150 resolved signals at your settings *and* a 95% lower bound on average net return above +2%. Every range on the tab counts coins bought in the same hour as one piece of evidence, so a lucky run of hot market hours does not look like proof
- the **edge finder**: independently of your settings, it searches 23 kinds of entry — the first time a coin reaches one of 10 score levels, or every coin at one of 13 fixed points in its life (20 s–12 min after launch; a quarter, half or three quarters of the way to graduation; 1, 5, 15 or 60 min after graduating), plus your own moments once they are recorded — × 22 coin conditions (stage, market cap, age, bundles, holders, buyers, socials, dev behaviour) × 192 exits (take profit 25–500%, stop loss 10–70%, optional 10/30/60-minute time limit) for rules that made money after every cost. It ranks them on the older two thirds of the data, re-checks the best 20 on the newest third (which the search never saw) with a bound corrected for testing 20 at once — counting coins bought in the same hour as one piece of evidence, since a hot hour lifts them all — and repeats everything on shuffled data to show how often the search fools itself. Every rule it reports is one the bot can run: the autopilot trades the best one by itself, or **Paper-trade this rule** switches your settings to it
- the **Lab**: rules beyond the edge finder's menu. The edge finder tries each coin condition on its own; the Lab tries one or two conditions on any of 33 facts the bot records about a coin at the moment of entry (money flowing in over 1 and 5 minutes, buyers, holders, top-10 share, smart wallets, fresh wallets, snipers, bundles, the dev's history, narrative heat, market heat …), at round thresholds, with every exit. Searching that much finds lucky rules easily, so it pays with a stricter proof: each idea is written down with the newest coin the search saw, and **only coins that come after it count**. It is judged at 60, 120, 240 and 480 finished coins and passes only if the low end of its range, counted per market hour, stays above zero at one-sided 0.05% per look — an idea with no edge passes by luck at most about once in 500. Clearly losing ideas, ideas not proven by 480 coins or within a week, and proven ideas whose later coins fall short leave again. Proven ideas go to the autopilot like any proven rule, and the bot trades their conditions on the same facts at the same moment they were recorded. You can test your own ideas too (Learn tab → Lab, or Telegram `/idea`), in the form `mig300 top10<=25% smart>=1 tp100 sl30 hold30`

**The Lab and Claude, at no extra cost.** The Lab itself runs on your computer (a few seconds every 2 hours) and costs nothing. To bring Claude's ideas into it without paying for anything more, use the Claude plan you already have: **Copy a summary for Claude** (Learn tab → Lab) gives what the market looks like at each entry, the strongest leads, what is being tested and what failed, and the rule format; paste it into a chat, ask for rules, and paste the ones you like back into the Lab. They are judged exactly like the bot's own — only on coins after you add them. (Having the bot call Claude by itself would need an Anthropic API key, which is billed separately from Claude plans; it is not built in.)

Exact replays on recorded data are available through the research CLI:
```bash
node dist/research.mjs diagnose --data ./data            # everything the bot sees, on one page
node dist/research.mjs report   --data ./data --score 75 --tp 100 --sl 50
node dist/research.mjs replay   --data ./data --score 75 --tp 100 --sl 50 --scoreonly
node dist/research.mjs sweep    --data ./data --scores 65,75,85 --tps 50,100,200 --sls 30,50
node dist/research.mjs train    --data ./data --adopt          # --notrees: the weighted sum alone
node dist/research.mjs edges    --data ./data            # the edge finder on your recorded data
node dist/research.mjs selftest            # proves the learning pipeline finds real edges and rejects fake ones
```

## 6. Going live (real SOL)

1. In Phantom, create a **new wallet used only by the bot**. Fund it with what you can afford to lose.
2. Export its private key (Settings → Manage accounts → Show private key).
3. **With buttons:** on the computer running the bot, **More → Setup → 5. Go live** → paste the key, set the per-trade and per-day limits, type `I understand the risk` → **Allow live trading**. The bot saves it to `DATA_DIR/config.json` (owner-only file), restarts itself, and never shows the key again. For safety this only works on the computer itself or over HTTPS, never over plain Wi-Fi.
   **Or in `.env` / host variables:**
   ```
   LIVE_TRADING=I_UNDERSTAND_THE_RISK
   WALLET_PRIVATE_KEY=...
   LIVE_MAX_POSITION_SOL=0.05
   LIVE_MAX_DAILY_LOSS_SOL=0.25
   ```
4. Choose Bot → Mode → **Live**.

Each order is built by PumpPortal's local API (0.5% fee, `pool=auto` covers the bonding curve and PumpSwap). It is signed on your server (the key never leaves it), sent through your RPC, and re-broadcast until confirmed. The real fill is then read back from the chain. The per-trade and per-day caps cannot be raised from the Bot tab. Four errors in a row or the daily cap halt new live entries, but exits always go through. After a restart, open live positions are reconciled against the wallet.

## 7. Development

```bash
cd signal
npm ci
npm test          # 162 tests: exact curve math vs the official SDK, decoders, engine, learning, edge finder, autopilot, feeds, live signing, memory, end-to-end
npm run build     # dist/engine.mjs (server with embedded dashboard), dist/research.mjs, dist/dashboard.html, dist/companion.html
npm run typecheck
```

Layout:
- `src/core`: platform-independent engine: curve math, decoders, token state, wallets, narratives, features, model, learning (`learn.ts`, boosted trees in `boost.ts`, what it learned in `insight.ts`), the edge finder (`edges.ts`), the autopilot (`autopilot.ts`) and the self-check (`selfcheck.ts`), positions, outcomes, funnel
- `src/node`: server: feeds, websocket reconnects, storage, HTTP/SSE API, Telegram, live executor
- `src/web`: dashboard (Preact, bundled into one HTML file)
- `src/companion`: the demo page: the same dashboard and engine running on a simulated market in the browser, plus research and a setup wizard
- `src/sim`: market simulator, for tests and demos only
- `src/research`: replays, sweeps, self-test

Data lives in `DATA_DIR`: `state.json` (atomic writes and a backup), a journal, labelled samples, hourly gzip recordings of market events, models and wallet snapshots.

**Storage never fills the disk.** The data folder stays under `DATA_MAX_GB` (by default a fifth of the disk, between 10 and 100 GB) and at least `MIN_FREE_GB` (2) of the disk stays free, checked every 10 minutes. Over either, the oldest raw recordings go first (only replays use them), then recorded outcomes older than the newest 3 days (training and the searches use the newest ones), then journals older than a week; trading state, models, the Lab and the autopilot are never touched. If the disk is still too full, raw recording pauses until there is twice the minimum free, and Telegram says so. Each start writes its own recording file, so a crash cannot leave the rest of an hour unreadable. Measured: a recorded market event takes about 136 bytes compressed, a recorded outcome about 1.3 KB.

**How much history learning uses.** Training, the edge finder and the Lab load the newest recorded outcomes, not all of them: 85,000 on a small server, twice that where the bot's memory limit is 1.5 GB or more, three times from 3 GB (a desktop usually). More history makes their answers more precise; the limit keeps memory and time in check (measured, 23 entries: 85,000 outcomes take 186 MB and a 24-second search, 170,000 take 338 MB and 82 s, 340,000 take 640 MB and 250 s). More → health shows both, and what the data folder holds.
