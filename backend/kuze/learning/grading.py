"""Grade finished bets, compute profit and closing-line value (CLV).

CLV is the single most reliable early signal of a real edge: results take thousands of bets
to separate skill from luck, but beating the closing number shows up in a few hundred.
  * clv_points: how many points better the bet's number was than the closing number
  * clv_prob:   no-vig win probability of the bet AT THE CLOSE minus the break-even
                probability of the price taken (>0 means the bet was +EV vs the close)
"""
from __future__ import annotations

import datetime as dt
import logging

import numpy as np
import pandas as pd
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from kuze.data import nflverse as nv
from kuze.db.models import Bet, MarketSnapshot, PropPrediction, utcnow
from kuze.features.pbp_prep import normalize_team
from kuze.models import betting as B
from kuze.models.distributions import KeyNumberModel, moneyline_outcome, spread_outcome, total_outcome
from kuze.models.market import implied_margin_from_spread, implied_total

log = logging.getLogger(__name__)


def _schedule() -> pd.DataFrame:
    g = nv.load_schedules()
    for c in ("home_team", "away_team"):
        g[c] = normalize_team(g[c])
    return g.set_index("game_id")


def closing_market(db: Session, game_id: str, game_row: pd.Series, km: KeyNumberModel, kickoff: dt.datetime | None) -> dict:
    """Closing implied margin/total: last consensus snapshot before kickoff, else the schedule's closing line."""
    q = select(MarketSnapshot).where(MarketSnapshot.game_id == game_id, MarketSnapshot.source == "consensus")
    if kickoff is not None:
        q = q.where(MarketSnapshot.taken_at <= kickoff)
    snap = db.scalar(q.order_by(desc(MarketSnapshot.taken_at)))
    if snap is not None and snap.margin is not None:
        return {"margin": snap.margin, "total": snap.total, "source": "consensus"}

    def f(x):
        return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)
    sl, tl = f(game_row.get("spread_line")), f(game_row.get("total_line"))
    margin = implied_margin_from_spread(km, -sl, f(game_row.get("home_spread_odds")), f(game_row.get("away_spread_odds"))) if sl is not None else None
    total = implied_total(km, tl, f(game_row.get("over_odds")), f(game_row.get("under_odds"))) if tl is not None else None
    return {"margin": margin, "total": total, "source": "nflverse_close", "spread_line": sl, "total_line": tl}


def _settle(outcome_win: bool, outcome_push: bool, stake: float, odds: float) -> tuple[str, float]:
    if outcome_push:
        return "push", 0.0
    if outcome_win:
        return "win", stake * (B.american_to_decimal(odds) - 1)
    return "loss", -stake


def grade_bets(db: Session, km: KeyNumberModel | None = None) -> dict:
    km = km or KeyNumberModel.load()
    sched = _schedule()
    pending = db.scalars(select(Bet).where(Bet.result == "pending")).all()
    stats_cache: dict = {}
    n = 0
    for bet in pending:
        if bet.game_id not in sched.index:
            continue
        g = sched.loc[bet.game_id]
        if pd.isna(g.get("result")):
            continue
        margin, total = float(g["result"]), float(g["total"])
        home = g["home_team"]
        from kuze.analysis.game_report import kickoff_utc
        ko = kickoff_utc(g)
        close = closing_market(db, bet.game_id, g, km, ko)
        res = None
        if bet.market == "spread":
            tm = margin if bet.side == "home" else -margin
            v = tm + bet.line
            res = _settle(v > 0, v == 0, bet.stake, bet.odds)
            if close["margin"] is not None:
                cm = close["margin"] if bet.side == "home" else -close["margin"]
                bet.clv_points = round(cm + bet.line, 2)      # cushion the bet had vs the closing fair margin
                k, p = km.margin_pmf(close["margin"])
                o = spread_outcome(k, p, 1 if bet.side == "home" else -1, bet.line)
                bet.clv_prob = round(o.win_no_push - B.implied_prob(bet.odds), 4)
                bet.closing_line = round(-close["margin"] if bet.side == "home" else close["margin"], 2)
        elif bet.market == "moneyline":
            tm = margin if bet.side == "home" else -margin
            res = _settle(tm > 0, tm == 0, bet.stake, bet.odds)
            if close["margin"] is not None:
                k, p = km.margin_pmf(close["margin"])
                o = moneyline_outcome(k, p, 1 if bet.side == "home" else -1)
                bet.clv_prob = round(o.win_no_push - B.implied_prob(bet.odds), 4)
                bet.closing_odds = round(B.prob_to_american(o.win_no_push))
        elif bet.market == "total":
            over = bet.side == "over"
            res = _settle(total > bet.line if over else total < bet.line, total == bet.line, bet.stake, bet.odds)
            if close["total"] is not None:
                bet.clv_points = round((close["total"] - bet.line) if over else (bet.line - close["total"]), 2)
                t, p = km.total_pmf(close["total"])
                o = total_outcome(t, p, bet.side, bet.line)
                bet.clv_prob = round(o.win_no_push - B.implied_prob(bet.odds), 4)
                bet.closing_line = round(close["total"], 2)
        elif bet.market in ("prop", "td"):
            val = _player_stat(stats_cache, bet.game_id, bet.player_id, bet.stat if bet.market == "prop" else "tds")
            if val is None:
                if _game_stats_available(stats_cache, bet.game_id):
                    bet.result, bet.profit = "void", 0.0   # player did not play: book voids the prop
                    bet.graded_at = utcnow()
                    n += 1
                continue
            if bet.market == "td":
                res = _settle(val >= 1, False, bet.stake, bet.odds)
            else:
                over = bet.side == "over"
                res = _settle(val > bet.line if over else val < bet.line, val == bet.line, bet.stake, bet.odds)
        elif bet.market == "sgp":
            outcome = _grade_sgp(stats_cache, bet, margin, total, home)
            if outcome is None:
                continue
            res = _settle(outcome, False, bet.stake, bet.odds)
        if res is None:
            continue
        bet.result, bet.profit = res
        bet.graded_at = utcnow()
        n += 1
    db.commit()
    graded_props = _fill_prop_actuals(db, stats_cache)
    return {"graded": n, "prop_predictions_filled": graded_props}


def _load_stats(cache: dict, season: int) -> pd.DataFrame:
    if season not in cache:
        df = nv.load("player_week", season)
        df["tds"] = df["rushing_tds"].fillna(0) + df["receiving_tds"].fillna(0)
        df["rush_rec_yards"] = df["rushing_yards"].fillna(0) + df["receiving_yards"].fillna(0)
        df["team"] = normalize_team(df["team"])
        if "game_id" not in df.columns:   # older stat files: attach game ids from the schedule
            sched = _schedule().reset_index()
            sched = sched[sched["season"] == season]
            gid = pd.concat([sched.rename(columns={"home_team": "team"})[["game_id", "week", "team"]],
                             sched.rename(columns={"away_team": "team"})[["game_id", "week", "team"]]])
            df = df.merge(gid, on=["week", "team"])
        cache[season] = df
    return cache[season]


def _game_stats_available(cache: dict, game_id: str) -> bool:
    s = _load_stats(cache, int(game_id[:4]))
    return bool((s["game_id"] == game_id).any())


def _player_stat(cache: dict, game_id: str, player_id: str | None, stat: str | None):
    if not player_id or not stat:
        return None
    s = _load_stats(cache, int(game_id[:4]))
    row = s[(s["game_id"] == game_id) & (s["player_id"] == player_id)]
    if row.empty or stat not in row:
        return None
    return float(row.iloc[0][stat])


def _grade_sgp(cache: dict, bet: Bet, margin: float, total: float, home: str) -> bool | None:
    legs = (bet.legs or {}).get("legs", [])
    for leg in legs:
        kind = leg.get("kind")
        if kind == "spread":
            tm = margin if leg.get("team") == home else -margin
            if not tm + leg["line"] > 0:
                return False
        elif kind == "moneyline":
            tm = margin if leg.get("team") == home else -margin
            if not tm > 0:
                return False
        elif kind == "total":
            ok = total > leg["line"] if leg["side"] == "over" else total < leg["line"]
            if not ok:
                return False
        elif kind == "player":
            v = _player_stat(cache, bet.game_id, leg.get("player_id"), leg.get("stat"))
            if v is None:
                return None
            ok = v > leg["line"] if leg["side"] == "over" else v < leg["line"]
            if not ok:
                return False
    return True


def _fill_prop_actuals(db: Session, cache: dict) -> int:
    rows = db.scalars(select(PropPrediction).where(PropPrediction.actual.is_(None))).all()
    n = 0
    for r in rows:
        if not _game_stats_available(cache, r.game_id):
            continue
        v = _player_stat(cache, r.game_id, r.player_id, r.stat)
        if v is not None:
            r.actual = v
            n += 1
    db.commit()
    return n
