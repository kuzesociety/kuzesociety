"""Assemble one feature row per game (past and upcoming) from ratings, QB, market and situation.

All features for a game use only information available before that game's week:
ratings/QB values are computed from team-games in earlier weeks; the market prior uses
closing lines of earlier weeks. The game's own closing line is carried along only as the
benchmark to beat (``spread_line`` / ``total_line``), never as a model input.
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from kuze.data.stadiums import STADIUMS, TEAM_HOME, haversine_miles
from kuze.features import ratings as R
from kuze.features.pbp_prep import normalize_team
from kuze.features.qb import QBModel, QBParams

EDGE_METRICS = ["epa", "pass_epa", "rush_epa", "sr", "pass_sr", "rush_sr", "early_epa", "int_rate", "fum_rate",
                "sack_rate", "exp_pass", "exp_rush", "ppd", "rz_td", "third", "points", "cpoe"]
STYLE_METRICS = ["pace", "plays", "proe"]
MARKET_SPEC = R.MetricSpec("impl", None, 3, 4, 0.25)
ET = ZoneInfo("America/New_York")


def market_team_games(schedules: pd.DataFrame) -> pd.DataFrame:
    """Closing-line implied points for each team in each past game (two rows per game)."""
    g = schedules[schedules["spread_line"].notna() & schedules["total_line"].notna()].copy()
    for c in ("home_team", "away_team"):
        g[c] = normalize_team(g[c])
    neutral = g["location"].eq("Neutral").to_numpy()
    home = pd.DataFrame({"game_id": g["game_id"], "season": g["season"], "week": g["week"], "team": g["home_team"],
                         "opp": g["away_team"], "is_home": (~neutral).astype(int), "is_away": 0,
                         "impl": (g["total_line"] + g["spread_line"]) / 2})
    away = pd.DataFrame({"game_id": g["game_id"], "season": g["season"], "week": g["week"], "team": g["away_team"],
                         "opp": g["home_team"], "is_home": 0, "is_away": (~neutral).astype(int),
                         "impl": (g["total_line"] - g["spread_line"]) / 2})
    return pd.concat([home, away], ignore_index=True)


def _utc_offset_hours(tz: str, when: dt.datetime) -> float:
    return ZoneInfo(tz).utcoffset(when).total_seconds() / 3600.0


def _wrap_hours(h: float) -> float:
    return ((h + 12.0) % 24.0) - 12.0


def situational(games: pd.DataFrame) -> pd.DataFrame:
    """Rest, travel, time zones, body clock, altitude, weather, venue."""
    out = []
    for row in games.itertuples(index=False):
        stadium = STADIUMS.get(row.stadium_id)
        home_base = STADIUMS.get(TEAM_HOME.get(row.home_team, ""), stadium)
        away_base = STADIUMS.get(TEAM_HOME.get(row.away_team, ""))
        gametime = row.gametime if isinstance(row.gametime, str) and ":" in row.gametime else "13:00"
        hh, mm = (int(x) for x in gametime.split(":")[:2])
        day = pd.Timestamp(row.gameday).to_pydatetime().date()
        kickoff_et = dt.datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET)
        rec = {"game_id": row.game_id}
        if stadium and away_base:
            rec["away_travel"] = haversine_miles(away_base, stadium)
            rec["home_travel"] = haversine_miles(home_base, stadium) if home_base else 0.0
            naive = kickoff_et.replace(tzinfo=None)
            st_off = _utc_offset_hours(stadium.tz, naive)
            rec["away_tz_shift"] = _wrap_hours(st_off - _utc_offset_hours(away_base.tz, naive))
            rec["home_tz_shift"] = _wrap_hours(st_off - _utc_offset_hours(home_base.tz, naive)) if home_base else 0.0
            rec["away_body_hour"] = kickoff_et.astimezone(ZoneInfo(away_base.tz)).hour + mm / 60
            rec["home_body_hour"] = kickoff_et.astimezone(ZoneInfo(home_base.tz)).hour + mm / 60 if home_base else hh
            rec["altitude"] = 1.0 if stadium.elevation_ft >= 4000 else 0.0
            rec["lat"], rec["lon"] = stadium.lat, stadium.lon
        out.append(rec)
    s = pd.DataFrame(out)
    g = games[["game_id", "home_rest", "away_rest", "div_game", "location", "game_type", "roof", "temp", "wind",
               "surface", "gametime", "weekday"]].merge(s, on="game_id", how="left")
    f = pd.DataFrame({"game_id": g["game_id"]})
    f["neutral"] = g["location"].eq("Neutral").astype(float)
    hr = g["home_rest"].fillna(7).clip(4, 14)
    ar = g["away_rest"].fillna(7).clip(4, 14)
    f["rest_diff"] = (hr - ar).clip(-7, 7)
    f["home_bye"] = (hr >= 13).astype(float)
    f["away_bye"] = (ar >= 13).astype(float)
    f["home_short"] = (hr <= 5).astype(float)
    f["away_short"] = (ar <= 5).astype(float)
    f["away_travel_k"] = g["away_travel"].fillna(500) / 1000.0
    f["travel_diff_k"] = (g["away_travel"].fillna(500) - g["home_travel"].fillna(0)) / 1000.0
    f["away_tz_shift"] = g["away_tz_shift"].fillna(0)
    f["tz_diff"] = (g["away_tz_shift"].fillna(0).abs() - g["home_tz_shift"].fillna(0).abs())
    # Body clock: kickoff at <= 11am in a team's home time zone (west-coast team at 1pm ET) and
    # late kickoffs for east-coast teams playing out west.
    f["away_early_body"] = (g["away_body_hour"].fillna(13) < 11.5).astype(float)
    f["home_early_body"] = (g["home_body_hour"].fillna(13) < 11.5).astype(float)
    f["away_late_body"] = (g["away_body_hour"].fillna(13) >= 22.5).astype(float)
    f["home_late_body"] = (g["home_body_hour"].fillna(13) >= 22.5).astype(float)
    f["altitude"] = g["altitude"].fillna(0)
    f["div_game"] = g["div_game"].fillna(0).astype(float)
    f["playoff"] = (g["game_type"] != "REG").astype(float)
    indoor = g["roof"].isin(["dome", "closed"])
    f["indoor"] = indoor.astype(float)
    f["temp"] = np.where(indoor, 70.0, g["temp"].astype(float))
    f["wind"] = np.where(indoor, 0.0, g["wind"].astype(float))
    f["weather_known"] = (indoor | g["wind"].notna()).astype(float)
    f["temp"] = f["temp"].fillna(60.0)
    f["wind"] = f["wind"].fillna(8.0)
    f["wind_hi"] = np.clip(f["wind"] - 10, 0, None)       # wind hurts mostly above ~10 mph
    f["cold"] = np.clip(40 - f["temp"], 0, None)          # degrees below 40F
    f["grass"] = g["surface"].fillna("").str.contains("grass").astype(float)
    f["primetime"] = g["gametime"].fillna("13:00").str.slice(0, 2).astype(int).ge(19).astype(float)
    f["lat"] = g["lat"]
    f["lon"] = g["lon"]
    return f


def build_game_features(schedules: pd.DataFrame, team_games: pd.DataFrame, qb_games: pd.DataFrame,
                        first_season: int = 2006, qb_params: QBParams | None = None) -> pd.DataFrame:
    games = schedules[schedules["season"] >= first_season].copy()
    for c in ("home_team", "away_team"):
        games[c] = normalize_team(games[c])
    games = games.sort_values(["season", "week", "gameday"]).reset_index(drop=True)
    keys = sorted({(int(s), int(w)) for s, w in zip(games["season"], games["week"])})

    # 1) performance ratings
    data = R.RatingData(team_games)
    rt = R.all_snapshots(data, keys)

    # 2) market-implied ratings from earlier closing lines
    mdata = R.RatingData(market_team_games(schedules), index=data.index)
    mrt = R.all_snapshots(mdata, keys, {"mkt": MARKET_SPEC})

    # 3) QB values and team baselines
    qbm = QBModel(qb_games, qb_params)
    qb_rows = []
    for season, week in keys:
        vals, _ = qbm.values(season, week)
        base = qbm.team_baseline(season, week, vals)
        vmap = dict(zip(vals["qb_id"], vals["value"]))
        pmap = dict(zip(vals["qb_id"], vals["career_plays"]))
        wk = games[(games["season"] == season) & (games["week"] == week)]
        bmap = dict(zip(base["team"], base["baseline"]))
        last_qb = _last_starters(games, season, week)
        for r in wk.itertuples(index=False):
            rec = {"game_id": r.game_id}
            for side in ("home", "away"):
                team = getattr(r, f"{side}_team")
                qb_id = getattr(r, f"{side}_qb_id")
                if not isinstance(qb_id, str):
                    qb_id = last_qb.get(team)
                val = vmap.get(qb_id, qbm.params.replacement)
                rec[f"{side}_qb_id_used"] = qb_id
                rec[f"{side}_qb_value"] = val
                rec[f"{side}_qb_plays"] = pmap.get(qb_id, 0.0)
                rec[f"{side}_qb_delta"] = val - bmap.get(team, val)
            qb_rows.append(rec)
    qbf = pd.DataFrame(qb_rows)

    # 4) join ratings for both teams
    feats = games[["game_id", "season", "week", "game_type", "gameday", "gametime", "weekday", "home_team", "away_team",
                   "home_score", "away_score", "result", "total", "spread_line", "total_line", "home_moneyline",
                   "away_moneyline", "home_spread_odds", "away_spread_odds", "over_odds", "under_odds",
                   "home_qb_name", "away_qb_name", "home_qb_id", "away_qb_id", "stadium_id", "stadium", "roof",
                   "location"]].copy()
    rt = rt.merge(mrt, on=["season", "week", "team"], how="left")
    h = rt.add_prefix("h_").rename(columns={"h_season": "season", "h_week": "week", "h_team": "home_team"})
    a = rt.add_prefix("a_").rename(columns={"a_season": "season", "a_week": "week", "a_team": "away_team"})
    feats = feats.merge(h, on=["season", "week", "home_team"], how="left").merge(a, on=["season", "week", "away_team"], how="left")

    cols = {"game_id": feats["game_id"]}
    home_flag = (feats["location"] != "Neutral").astype(float)
    for m in EDGE_METRICS + STYLE_METRICS:
        hm = feats[f"h_off_{m}"] + feats[f"a_def_{m}"]
        am = feats[f"a_off_{m}"] + feats[f"h_def_{m}"]
        cols[f"d_{m}"] = hm - am
        cols[f"s_{m}"] = hm + am
        cols[f"h_{m}"] = hm
        cols[f"a_{m}"] = am
        cols[f"mu_{m}"] = feats[f"h_mu_{m}"]
    cols["d_st"] = feats["h_off_st"] - feats["a_off_st"]
    mk_h = feats["h_off_mkt"] + feats["a_def_mkt"]
    mk_a = feats["a_off_mkt"] + feats["h_def_mkt"]
    cols["mkt_spread_prior"] = 2 * feats["h_hfa_mkt"] * home_flag + mk_h - mk_a
    cols["mkt_total_prior"] = 2 * feats["h_mu_mkt"] + mk_h + mk_a
    cols["mkt_home_prior"] = feats["h_mu_mkt"] + feats["h_hfa_mkt"] * home_flag + mk_h
    cols["mkt_away_prior"] = feats["h_mu_mkt"] - feats["h_hfa_mkt"] * home_flag + mk_a
    out = pd.DataFrame(cols)
    base_cols = [c for c in feats.columns if not c.startswith(("h_off_", "a_off_", "h_def_", "a_def_", "h_mu_", "a_mu_", "h_hfa_", "a_hfa_"))]
    feats = feats[base_cols].merge(out, on="game_id").merge(qbf, on="game_id", how="left")
    feats["d_qb_delta"] = feats["home_qb_delta"] - feats["away_qb_delta"]
    feats["s_qb_delta"] = feats["home_qb_delta"] + feats["away_qb_delta"]
    feats["d_qb_value"] = feats["home_qb_value"] - feats["away_qb_value"]
    sit = situational(games)
    return feats.merge(sit, on="game_id", how="left")


def _last_starters(games: pd.DataFrame, season: int, week: int) -> dict:
    """Most recent listed starting QB per team before (season, week) — fallback for missing QB ids."""
    past = games[(games["season"] < season) | ((games["season"] == season) & (games["week"] < week))]
    past = past.tail(600)
    last = {}
    for r in past.itertuples(index=False):
        if isinstance(r.home_qb_id, str):
            last[r.home_team] = r.home_qb_id
        if isinstance(r.away_qb_id, str):
            last[r.away_team] = r.away_qb_id
    return last
