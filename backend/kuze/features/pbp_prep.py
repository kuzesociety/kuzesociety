"""Clean play-by-play and tag each play with the categories the models use."""
from __future__ import annotations

import numpy as np
import pandas as pd

from kuze.data import nflverse as nv

# Team abbreviations changed over time; map old to the current franchise code so
# ratings carry across relocations.
FRANCHISE = {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA"}


def normalize_team(series: pd.Series) -> pd.Series:
    return series.replace(FRANCHISE)


def prepare(pbp: pd.DataFrame) -> pd.DataFrame:
    """Return scrimmage plays (pass or designed run, incl. penalty plays) with helper flags."""
    df = pbp.copy()
    for col in ("posteam", "defteam", "home_team", "away_team"):
        df[col] = normalize_team(df[col])
    df = df[df["epa"].notna() & df["posteam"].notna()]
    num_cols = ["pass", "rush", "qb_dropback", "qb_scramble", "qb_kneel", "qb_spike", "sack", "qb_hit",
                "pass_attempt", "complete_pass", "interception", "fumble", "fumble_lost", "touchdown",
                "pass_touchdown", "rush_touchdown", "first_down", "penalty", "shotgun", "no_huddle",
                "success", "yards_gained", "air_yards", "down", "ydstogo", "yardline_100", "goal_to_go"]
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    scrimmage = ((df["pass"] == 1) | (df["rush"] == 1)) & (df["qb_kneel"] != 1) & (df["qb_spike"] != 1)
    df = df[scrimmage].copy()

    df["is_pass"] = (df["pass"] == 1).astype(np.int8)          # dropbacks incl. sacks & scrambles
    df["is_rush"] = ((df["rush"] == 1) & (df["pass"] != 1)).astype(np.int8)  # designed runs
    df["turnover"] = ((df["interception"] == 1) | (df["fumble_lost"] == 1)).astype(np.int8)
    df["epa_nto"] = np.where(df["turnover"] == 1, np.nan, df["epa"])  # EPA with turnover plays removed
    yg = df["yards_gained"].fillna(0)
    df["explosive"] = np.where(df["is_pass"] == 1, yg >= 20, yg >= 10).astype(np.int8)
    df["early_down"] = df["down"].isin([1, 2]).astype(np.int8)
    df["third_down"] = (df["down"] == 3).astype(np.int8)
    df["red_zone"] = (df["yardline_100"] <= 20).astype(np.int8)
    wp = pd.to_numeric(df["wp"], errors="coerce")
    hsr = pd.to_numeric(df["half_seconds_remaining"], errors="coerce")
    df["neutral"] = (wp.between(0.2, 0.8) & (hsr > 120) & df["down"].isin([1, 2, 3])).astype(np.int8)
    df["sack"] = df["sack"].fillna(0)
    df["qb_hit"] = df["qb_hit"].fillna(0)
    df["success"] = df["success"].fillna(0)
    df["game_date"] = pd.to_datetime(df["game_date"])
    return df


def load_prepared(seasons) -> pd.DataFrame:
    return prepare(nv.load_pbp(seasons))
