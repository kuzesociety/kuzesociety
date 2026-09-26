"""Glue between the database (lines, overrides, logs) and the models."""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import asdict

import numpy as np
import pandas as pd
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from kuze.analysis.game_report import HardRockLines, analyze, kickoff_utc
from kuze.data.odds import BookLines, OddsClient, match_event
from kuze.db.models import (HardRockLine, InjuryOverride, KV, MarketSnapshot, Prediction, PropLine, QBOverride, User,
                            utcnow)
from kuze.pipeline import next_week, pipeline

log = logging.getLogger(__name__)


# ----------------------------------------------------------------------------- inputs
def latest_hr(db: Session, game_id: str) -> HardRockLines | None:
    row = db.scalar(select(HardRockLine).where(HardRockLine.game_id == game_id).order_by(desc(HardRockLine.created_at)))
    if row is None:
        return None
    return HardRockLines(row.home_spread, row.home_spread_odds, row.away_spread, row.away_spread_odds, row.home_ml,
                         row.away_ml, row.total, row.over_odds, row.under_odds, row.created_at.isoformat(), row.source)


def qb_overrides(db: Session, game_id: str) -> dict:
    return {r.side: {"qb_id": r.qb_id, "qb_name": r.qb_name, "confirmed": r.confirmed}
            for r in db.scalars(select(QBOverride).where(QBOverride.game_id == game_id))}


def injury_overrides(db: Session, game_id: str) -> dict:
    return {r.player: r.p_play for r in db.scalars(select(InjuryOverride).where(InjuryOverride.game_id == game_id))}


def latest_books(db: Session, game_id: str, max_age_hours: float = 12.0) -> dict:
    """Most recent per-book snapshot (from the odds sync) for consensus pricing."""
    cutoff = utcnow() - dt.timedelta(hours=max_age_hours)
    rows = db.scalars(select(MarketSnapshot).where(MarketSnapshot.game_id == game_id, MarketSnapshot.taken_at >= cutoff,
                                                   MarketSnapshot.source.notin_(["consensus", "nflverse"]))
                      .order_by(desc(MarketSnapshot.taken_at))).all()
    books = {}
    for r in rows:
        if r.source in books:
            continue
        books[r.source] = BookLines(r.source, r.taken_at.isoformat(), r.home_spread, r.home_spread_odds,
                                    -r.home_spread if r.home_spread is not None else None, r.away_spread_odds,
                                    r.home_ml, r.away_ml, r.total_line, r.over_odds, r.under_odds)
    return books


def get_kv(db: Session, key: str, default=None):
    row = db.get(KV, key)
    return row.value if row else default


def set_kv(db: Session, key: str, value) -> None:
    row = db.get(KV, key)
    if row is None:
        db.add(KV(key=key, value=value))
    else:
        row.value = value
    db.commit()


# ----------------------------------------------------------------------------- analysis
def analyze_game(db: Session, game_id: str, user: User | None, include_context: bool = True, log_prediction: bool = True,
                 weather: dict | None = None) -> dict:
    from kuze.learning.feedback import current_thresholds
    thresholds = current_thresholds(db)
    books = latest_books(db, game_id)
    rep = analyze(game_id, latest_hr(db, game_id), qb_overrides(db, game_id), injury_overrides(db, game_id),
                  books or None, weather or cached_weather(db, game_id),
                  bankroll=user.bankroll if user else 1000.0, kelly_mult=user.kelly_mult if user else 0.25,
                  max_bet_pct=user.max_bet_pct if user else 0.02, thresholds=thresholds, include_context=include_context)
    rep["market_history"] = market_history(db, game_id)
    rep["hr_history"] = hr_history(db, game_id)
    rep["qb_overrides"] = qb_overrides(db, game_id)
    rep["injury_overrides"] = injury_overrides(db, game_id)
    if log_prediction and rep["game"]["hours_to_kickoff"] > -0.5:
        m = rep["model"]
        db.add(Prediction(game_id=game_id, model_version=m["version"] or "", raw_margin=m["raw_margin"],
                          raw_total=m["raw_total"], fair_margin=m["fair_margin"], fair_total=m["fair_total"],
                          market_margin=rep["market"].get("margin"), market_total=rep["market"].get("total"),
                          hours_to_kickoff=rep["game"]["hours_to_kickoff"]))
        db.commit()
    return rep


def slate(db: Session, user: User | None, season: int | None = None, week: int | None = None) -> dict:
    st = pipeline.state
    if season is None or week is None:
        season, week = next_week(st.schedules)
    f = st.features
    games = f[(f["season"] == season) & (f["week"] == week)].sort_values(["gameday", "gametime"])
    out = []
    for _, g in games.iterrows():
        item = {"game_id": g["game_id"], "home": g["home_team"], "away": g["away_team"],
                "kickoff_utc": kickoff_utc(g).isoformat(), "stadium": g.get("stadium"), "roof": g.get("roof"),
                "home_qb": g.get("home_qb_name"), "away_qb": g.get("away_qb_name"),
                "final": bool(pd.notna(g.get("result"))),
                "score": ({"home": int(g["home_score"]), "away": int(g["away_score"])} if pd.notna(g.get("result")) else None),
                "market": {"spread_line": _f(g.get("spread_line")), "total_line": _f(g.get("total_line")),
                           "home_ml": _f(g.get("home_moneyline")), "away_ml": _f(g.get("away_moneyline"))}}
        try:
            rep = analyze_game(db, g["game_id"], user, include_context=False, log_prediction=False)
            item.update({"model": {k: rep["model"][k] for k in ("fair_margin", "fair_total", "fair_spread", "fair_total_line",
                                                                 "win_prob", "fair_ml", "projection", "raw_margin", "raw_total")},
                         "hard_rock": rep["hard_rock"], "confidence": rep["confidence"]["by_market"],
                         "flags": len(rep["confidence"]["flags"]), "primary": rep["primary"],
                         "labels": {b["selection"]: b["label"] for b in rep["bets"] if "selection" in b},
                         "best_ev": max([b.get("ev", -1) for b in rep["bets"] if b.get("market") != "all"], default=None)})
        except Exception as exc:  # never break the whole slate on one game
            log.exception("slate analysis failed for %s", g["game_id"])
            item["error"] = str(exc)
        out.append(item)
    weeks = sorted({int(w) for w in f.loc[f["season"] == season, "week"]})
    return {"season": season, "week": week, "weeks": weeks, "games": out,
            "model_version": st.model.version, "data_built_at": st.built_at}


def _f(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else v


# ----------------------------------------------------------------------------- lines / history
def save_hr_lines(db: Session, game_id: str, data: dict, user: User | None, source: str = "manual") -> HardRockLine:
    prev = latest_hr(db, game_id)
    base = asdict(prev) if prev else {}
    merged = {k: data.get(k, base.get(k)) for k in ("home_spread", "home_spread_odds", "away_spread", "away_spread_odds",
                                                     "home_ml", "away_ml", "total", "over_odds", "under_odds")}
    if merged.get("home_spread") is not None and merged.get("away_spread") is None:
        merged["away_spread"] = -merged["home_spread"]
    if merged.get("away_spread") is not None and merged.get("home_spread") is None:
        merged["home_spread"] = -merged["away_spread"]
    row = HardRockLine(game_id=game_id, source=source, entered_by=user.username if user else None, **merged)
    db.add(row)
    db.commit()
    return row


def hr_history(db: Session, game_id: str) -> list[dict]:
    rows = db.scalars(select(HardRockLine).where(HardRockLine.game_id == game_id).order_by(HardRockLine.created_at)).all()
    return [{"at": r.created_at.isoformat(), "home_spread": r.home_spread, "home_spread_odds": r.home_spread_odds,
             "away_spread_odds": r.away_spread_odds, "home_ml": r.home_ml, "away_ml": r.away_ml, "total": r.total,
             "over_odds": r.over_odds, "under_odds": r.under_odds, "source": r.source, "by": r.entered_by} for r in rows]


def market_history(db: Session, game_id: str) -> dict:
    rows = db.scalars(select(MarketSnapshot).where(MarketSnapshot.game_id == game_id,
                                                   MarketSnapshot.source.in_(["consensus", "nflverse"]))
                      .order_by(MarketSnapshot.taken_at)).all()
    pts = [{"at": r.taken_at.isoformat(), "source": r.source, "margin": r.margin, "total": r.total,
            "home_spread": r.home_spread, "total_line": r.total_line, "home_ml": r.home_ml, "away_ml": r.away_ml}
           for r in rows]
    out = {"points": pts}
    if pts:
        o, c = pts[0], pts[-1]
        out["open"] = o
        out["current"] = c
        if o["margin"] is not None and c["margin"] is not None:
            out["spread_move"] = round(c["margin"] - o["margin"], 2)
        if o["total"] is not None and c["total"] is not None:
            out["total_move"] = round(c["total"] - o["total"], 2)
    return out


def record_schedule_market(db: Session) -> int:
    """Log the nflverse consensus line for upcoming games when it changes (opening/current tracking)."""
    from kuze.models.market import schedule_market
    st = pipeline.state
    season, week = next_week(st.schedules)
    f = st.features
    up = f[(f["season"] == season) & (f["week"].between(week, week + 1)) & f["result"].isna()]
    n = 0
    for _, r in up.iterrows():
        mk = schedule_market(st.keynum, r)
        last = db.scalar(select(MarketSnapshot).where(MarketSnapshot.game_id == r["game_id"],
                                                      MarketSnapshot.source == "nflverse").order_by(desc(MarketSnapshot.taken_at)))
        sl, tl = _f(r.get("spread_line")), _f(r.get("total_line"))
        home_spread = -sl if sl is not None else None
        if last and last.home_spread == home_spread and last.total_line == tl and last.home_ml == _f(r.get("home_moneyline")):
            continue
        db.add(MarketSnapshot(game_id=r["game_id"], source="nflverse", margin=mk.margin, total=mk.total,
                              home_spread=home_spread, home_spread_odds=_f(r.get("home_spread_odds")),
                              away_spread_odds=_f(r.get("away_spread_odds")), total_line=tl,
                              over_odds=_f(r.get("over_odds")), under_odds=_f(r.get("under_odds")),
                              home_ml=_f(r.get("home_moneyline")), away_ml=_f(r.get("away_moneyline"))))
        n += 1
    db.commit()
    return n


def sync_odds(db: Session) -> dict:
    """Pull every book from The Odds API: store Hard Rock lines, per-book snapshots and the consensus."""
    from kuze.data.odds import SHARP_BOOKS
    from kuze.models.market import consensus
    client = OddsClient()
    if not client.enabled:
        return {"enabled": False, "note": "set ODDS_API_KEY to sync Hard Rock and consensus lines"}
    st = pipeline.state
    events = client.game_odds()
    f = st.features
    up = f[f["result"].isna()]
    n_games = n_hr = 0
    for _, r in up.iterrows():
        ev = match_event(events, r["home_team"], r["away_team"], kickoff_utc(r))
        if ev is None:
            continue
        n_games += 1
        for key, bl in ev.books.items():
            db.add(MarketSnapshot(game_id=r["game_id"], source=key, home_spread=bl.home_spread,
                                  home_spread_odds=bl.home_spread_odds, away_spread_odds=bl.away_spread_odds,
                                  total_line=bl.total, over_odds=bl.over_odds, under_odds=bl.under_odds,
                                  home_ml=bl.home_ml, away_ml=bl.away_ml))
        cons = consensus(st.keynum, ev.books, SHARP_BOOKS, exclude=("hardrockbet",))
        db.add(MarketSnapshot(game_id=r["game_id"], source="consensus", margin=cons.margin, total=cons.total))
        hr = ev.books.get("hardrockbet")
        if hr is not None:
            cur = latest_hr(db, r["game_id"])
            new = {"home_spread": hr.home_spread, "home_spread_odds": hr.home_spread_odds, "away_spread": hr.away_spread,
                   "away_spread_odds": hr.away_spread_odds, "home_ml": hr.home_ml, "away_ml": hr.away_ml,
                   "total": hr.total, "over_odds": hr.over_odds, "under_odds": hr.under_odds}
            if cur is None or any(getattr(cur, k) != v for k, v in new.items() if v is not None):
                save_hr_lines(db, r["game_id"], new, None, source="api")
                n_hr += 1
    db.commit()
    return {"enabled": True, "games": n_games, "hard_rock_updates": n_hr, "requests_remaining": client.remaining}


def sync_prop_odds(db: Session, window_hours: float = 48.0) -> dict:
    """Hard Rock player props for games kicking off within ``window_hours`` (books post most props
    2-3 days out, and each game costs quota, so the rest of the slate waits)."""
    client = OddsClient()
    if not client.enabled:
        return {"enabled": False}
    st = pipeline.state
    now = utcnow()
    events = client.events()
    up = st.features[st.features["result"].isna()]
    n = 0
    for _, r in up.iterrows():
        ko = kickoff_utc(r)
        if not (dt.timedelta(0) <= ko - now <= dt.timedelta(hours=window_hours)):
            continue
        ev = match_event(events, r["home_team"], r["away_team"], ko)
        if ev is not None:
            _sync_props(db, client, ev.event_id, r["game_id"])
            n += 1
    db.commit()
    return {"enabled": True, "games": n, "requests_remaining": client.remaining}


def _sync_props(db: Session, client: OddsClient, event_id: str, game_id: str) -> None:
    from kuze.props.engine import ODDS_API_MARKETS, engine
    rows = [r for r in client.event_props(event_id) if r["book"] == "hardrockbet"]
    if not rows or engine.state is None:
        return
    proj = engine.state.rows[engine.state.rows["game_id"] == game_id]
    name_to_id = dict(zip(proj["name"], proj["player_id"]))
    grouped: dict = {}
    for r in rows:
        stat = ODDS_API_MARKETS.get(r["market"])
        if stat is None or r["player"] not in name_to_id:
            continue
        key = (name_to_id[r["player"]], stat, r["line"])
        g = grouped.setdefault(key, {"player_name": r["player"]})
        if r["side"] in ("Over", "Yes"):
            g["over_odds"] = r["odds"]
        elif r["side"] in ("Under", "No"):
            g["under_odds"] = r["odds"]
    for (pid, stat, line), g in grouped.items():
        db.add(PropLine(game_id=game_id, player_id=pid, player_name=g["player_name"], stat=stat, line=line,
                        over_odds=g.get("over_odds"), under_odds=g.get("under_odds"), source="api"))


# ----------------------------------------------------------------------------- weather (cached)
def cached_weather(db: Session, game_id: str) -> dict | None:
    """Open-Meteo forecast at kickoff for outdoor games, cached for 3 hours in the KV table."""
    from kuze.data.stadiums import STADIUMS
    from kuze.data.weather import at_kickoff, fetch_forecast
    st = pipeline.state
    row = st.features[st.features["game_id"] == game_id]
    if row.empty:
        return None
    r = row.iloc[0]
    if r.get("indoor", 0) == 1:
        return None
    ko = kickoff_utc(r)
    hours = (ko - utcnow()).total_seconds() / 3600
    if hours > 240 or hours < -4:
        return None
    key = f"wx:{game_id}"
    cached = get_kv(db, key)
    if cached and (utcnow() - dt.datetime.fromisoformat(cached["fetched"])).total_seconds() < 3 * 3600:
        return cached.get("wx")
    stadium = STADIUMS.get(r.get("stadium_id"))
    if stadium is None:
        return None
    wx = at_kickoff(fetch_forecast(stadium.lat, stadium.lon), ko)
    set_kv(db, key, {"fetched": utcnow().isoformat(), "wx": wx})
    return wx
