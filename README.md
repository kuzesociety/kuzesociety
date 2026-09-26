# Kuze Edge

An NFL betting model and a private web app for two people, built around one question: **is the
Hard Rock price wrong, and by how much?** It prices every side, total, moneyline, player prop,
anytime TD and same-game parlay at the exact Hard Rock number. It labels each one PLAY / SMALLER /
LEAN / PASS / UNKNOWN, sizes the stake, then grades every bet against the closing line so the
system keeps learning.

It is built to not fool itself. Every number below comes from walk-forward testing: each season is
predicted by a model trained only on the seasons before it. Most games come out as PASS, by design.

---

## What the testing says

### Game model (spreads and totals)

| Test (walk-forward, out of sample) | Result |
|---|---|
| Bet every game where the model disagrees with the **closing** spread by 3+ pts, 2010–2026 | 531–479, **52.6%** |
| Same rule, 2013–2020 | 56.7% |
| Same rule, **2021–2026** | **48.4%** |
| Same rule vs the **Wednesday** line (SuperContest lines, 2013–2020 only) | 296–207, 58.8% (56.0% vs the close, same games) |
| Did the line move toward the model by kickoff? (same games) | Toward 56%, away 23%, average +0.7 pts |
| Totals, 3+ pts vs the close | 52.4% overall, 53.8% since 2021 |

Break-even at −110 is 52.4%. The honest read:

- **The modern closing line is at least as good as this model.** The edge against the close faded
  after 2020. Out-predicting the final number is not where the money is.
- **Timing and price are.** Model disagreements predicted where the line was going. So bet early in
  the week when the model disagrees, and bet Hard Rock when its price lags the sharp consensus.
- The model therefore **blends with the market** instead of replacing it. How much it trusts itself
  was estimated out of sample and depends on the time to kickoff: spreads 16% early week and 13% at
  the close, totals 22% and 18%. The weekly learning loop keeps updating these weights from your
  own bets.

### What did not add value (tested, then left out of the model or kept only as context)
- Rest, travel, time zones, body clock, altitude, primetime: nothing beyond what the market prices.
- Turnover margin and red-zone TD%: next-game R² of about 1%. Shown only as **regression flags**.
- "He scored last week" for touchdowns: log loss 0.62, versus 0.45 for usage-based models.
- Reacting to injuries with *realized* snap counts: that was look-ahead leakage. Availability uses
  pre-game information only (injury report, roster status, expected role).

### Player props (walk-forward 2019–2025, about 3,900 QB games and 36,000 receiver games)

| Stat | Model error (MAE) | Player's own recent average | 80% range covers |
|---|---|---|---|
| Passing yards | **60.0** | 70.2 | 81% |
| Pass attempts | **7.0** | 8.4 | 81% |
| Completions | **4.9** | 5.8 | 83% |
| Rushing yards | **18.1** | 18.7 | 84% |
| Receiving yards | **17.4** | 17.9 | 87% |
| Receptions | **1.33** | 1.37 | 88% |

The projections beat the number most bettors look at, and the ranges are calibrated. There is
**no historical prop-line data** to test ROI against books, so for props your CLV is the real test.
Two safeguards follow from what testing found:

- **League passing volume fell faster than the model tracks.** Its P(over) on QB attempts and
  completions ran about 3 points high in 2023–25. So when both Hard Rock prices are entered, the
  fair probability is half model and half Hard Rock's no-vig price (`KUZE_PROP_MODEL_WEIGHT`).
  A one-sided price caps confidence at MEDIUM.
- **QB projections were too extreme.** A linear shrink fitted out of sample corrects the tails,
  which is where bets come from.

### Anytime TD (walk-forward 2019–2025, about 40,000 player-games)

| Model | Log loss (lower is better) |
|---|---|
| Red-zone / end-zone / goal-line usage + QB trust + contract (production) | **0.4540** |
| Usage + QB trust | 0.4545 |
| Usage only | 0.4547 |
| Poisson baseline (team TDs × scoring-area shares) | 0.4749 |
| "Scored recently" | 0.6207 |

QB trust (decayed QB-to-receiver history in the red zone, end zone, third down, late in halves)
and contract / draft capital each add a small but real gain, so they stay as secondary signals.
The model is calibrated: predicted and actual TD rates agree within about 1 point in every bucket.

### Same-game parlays
Books price correlation into SGPs and usually hold 20% or more. The simulator correlates
the legs through game margin, total and each team's pass and rush volume. It is rarely +EV, and
the app says so.

---

## Weekly workflow

1. **Early week (Tue–Wed), as soon as lines post.** Open the Slate. Enter the exact Hard Rock lines
   on each game, or let them sync automatically (`ODDS_API_KEY`). Early week is when the model's
   opinion is worth the most.
2. **On each game with an edge:** confirm the starting QBs in the QB panel (an unconfirmed QB
   makes the call UNKNOWN). Check injuries (you can override a status and re-run), weather, and
   the "why the model says this" breakdown.
3. **Bet only PLAY or SMALLER**, at the shown price or better. "Playable to" is the worst
   line/price where the bet still clears the bar, and "pass at" is where it stops. Log the bet.
4. **Late week and Sunday:** re-run after injury news. Anything that changed is re-priced.
5. **After the games:** bets are graded automatically each Tuesday, or press *Grade finished
   games*. Watch **CLV** and "beat the close %". Beating the close on 100+ bets is the earliest
   trustworthy sign of an edge; win/loss records need thousands of bets.

Labels: **PLAY** (full stake), **SMALLER** (half stake: edge clears the bar with some
uncertainty), **LEAN** (small edge or too much uncertainty to bet), **PASS**, **UNKNOWN**
(critical information missing, such as QB status). Confidence runs HIGH / MEDIUM+ / MEDIUM / LOW /
UNKNOWN. It downgrades the call and scales the stake: quarter Kelly × confidence, capped at 2%
of bankroll by default. Change these in Settings.

---

## The learning loop

| When | What |
|---|---|
| 4× a day | Refresh nflverse data (results, injuries, rosters, snaps) and rebuild features and projections |
| Every 20 min | Within 75 min of kickoff: record the model's own PLAY/SMALLER calls as **paper bets**, and log every active player's raw prop projection |
| Hourly / every 4 h | With `ODDS_API_KEY`: game lines from every book hourly, Hard Rock props every 4 h for games within 48 h |
| Tuesday 9:13 ET | Grade all bets and compute CLV → adapt each market's PLAY/LEAN bar from CLV → update model-vs-market weights by time to kickoff → prop drift correction → retrain the game model (a challenger replaces the champion only if it is not worse on recent games) → retrain props and TD models |

Each learned quantity is shrunk toward a conservative prior and bounded. For example, the prop
drift factor is a shrunk ratio of means, clipped to ±15%. So a few weeks of noise cannot swing
the system.

---

## Setup

### Docker (recommended)

```bash
cp .env.example .env        # set KUZE_USERS and KUZE_JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build
# open http://localhost:8000
```

The first start downloads about 450 MB of nflverse data and trains everything. That takes 15–30
minutes, during which the app answers "model is building". Give the container about 4 GB of RAM.
Data, the SQLite database and trained models live in the `kuze-data` volume, so restarts are fast.

To reach it from your phones, put it behind HTTPS (Caddy, a Cloudflare Tunnel, or any reverse
proxy). Cookies are marked secure over HTTPS; set `KUZE_SECURE_COOKIES=1` if the proxy terminates
TLS. Failed logins are rate-limited.

### Local development

```bash
# backend (Python 3.11)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
KUZE_USERS=me:secret KUZE_JWT_SECRET=dev uvicorn kuze.api.main:app --reload

# frontend (Node 22), in another terminal; proxies /api to :8000
cd frontend && npm install && npm run dev

# tests
cd backend && pytest
```

### Configuration

| Variable | Purpose |
|---|---|
| `KUZE_USERS` | `name:password` pairs, comma separated, created on first start. Change passwords later in Settings |
| `KUZE_JWT_SECRET` | Signs login cookies. **Required** for any real deployment |
| `ODDS_API_KEY` | [The Odds API](https://the-odds-api.com): auto-pulls Hard Rock lines, the sharp consensus (Pinnacle, LowVig, BetOnline…) and Hard Rock props. About 15K credits/month in season, which fits the 20K plan. Without it, enter Hard Rock numbers by hand |
| `ANTHROPIC_API_KEY` | Enables the AI analyst tab: Claude writes the master-prompt report from the model's numbers and verifies injuries, QB status and weather with web search |
| `KUZE_ANALYST_MODEL` | Default `claude-opus-5` |
| `KUZE_SCHEDULER` | `1` (default) runs the jobs above; `0` disables them |
| `KUZE_PROP_MODEL_WEIGHT` | Trust in the prop model vs Hard Rock's no-vig price when both sides are posted. Default `0.5` |
| `KUZE_DATA_DIR`, `KUZE_DB_URL` | Where data lives; any SQLAlchemy URL works (SQLite by default) |
| `KUZE_BOOK_KEY` | Which Odds API bookmaker is "your" book. Default `hardrockbet` |
| `KUZE_CORS` | Only needed when the frontend runs on another origin |

---

## How the model works

**Team strength.** Opponent-adjusted, recency-weighted ridge ratings from play-by-play: EPA per
play split into pass and rush, points per drive, success rate, special teams, pace. Decay rates
were tuned per metric by predicting the next game. Also a QB value model (shrunk EPA per QB play vs
replacement, so a backup QB moves the line correctly) and ratings implied by past closing lines.

**Availability.** Pre-game only: each player's expected snap share × P(plays | injury status) vs
his baseline, aggregated by position group into points.

**Game prediction.** Ridge models for margin and total, trained walk-forward. The prediction is
blended with the market-implied mean (inverted from the prices, not just the line). It is then
turned into a full **key-number distribution** fitted to 4,129 games since 2011, with peaks
at 3, 7, 10 and 14. That makes −2.5 vs −3.5, pushes and moneylines priced properly.

**Betting math.** No-vig probabilities (multiplicative, power, Shin), EV including pushes, Kelly
with pushes, fair prices, and the worst playable line and price for each bet.

**Props.** Team volume (targets, designed runs, pass attempts, TDs) from the game environment ×
the player's share (re-normalized when teammates are out) × efficiency, adjusted for the opponent.
Then a boosted calibration layer, the QB shrink, and an empirical out-of-sample distribution. The
distribution matters because yardage is right-skewed: an 82-yard mean can still be an UNDER at 74.5.

**Anytime TD.** Gradient-boosted classifier on red-zone, end-zone, inside-10 and inside-5 shares,
team TD expectation, QB trust with the current QB, ball security and contract role. Includes a
transparent Poisson baseline for comparison.

**SGP.** Gaussian-copula simulation (40,000 games) of the calibrated marginals, with loadings
fitted on history.

### Code map

```
backend/kuze/
  data/        nflverse loader + cache, The Odds API, Open-Meteo weather, stadiums, SuperContest lines
  features/    play-by-play prep, team-game aggregates, ratings, QB value, availability, game features
  models/      key-number distributions, betting math, market inversion, game model + walk-forward
  analysis/    game report (fair lines, bets, confidence flags, matchups, scripts), labels & stakes, AI analyst
  props/       player-game dataset, features, projection model, TD model, SGP simulator, live engine
  learning/    grading + CLV, adaptive thresholds, blend updates, prop drift, scheduler jobs
  api/         FastAPI app, auth, routes;   db/  SQLAlchemy models
backend/scripts/  tune_ratings, backtest_props, backtest_td, fit_sgp
backend/tests/    pytest suite
frontend/         React + TypeScript (Vite)
```

---

## Known limits

- **News lag.** nflverse updates injuries and rosters about daily. Friday statuses and Sunday
  inactives can arrive late, so confirm QBs and override injuries in the app before betting. The AI
  analyst can verify news on the web.
- **QB volume overs.** Treat them with extra care: see the props section.
- **Weather** comes from Open-Meteo and is only called FORECAST inside 48 hours. Earlier it is
  EARLY FORECAST; if unavailable it is UNKNOWN.
- **Props, TDs and SGPs** are validated for accuracy and calibration, not ROI against real book
  lines (no archive exists). CLV on real bets is the judge.
- A backtest is history. Markets adapt, which is exactly why the weights, bars and corrections keep
  re-learning from your bets.

Data: [nflverse](https://github.com/nflverse) play-by-play, schedules with closing lines,
injuries, rosters, snap counts, FTN charting and contracts; Westgate SuperContest lines
2013–2020; Open-Meteo.
