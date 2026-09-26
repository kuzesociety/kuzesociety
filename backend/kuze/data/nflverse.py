"""Loaders for the public nflverse data releases, with a local parquet cache.

nflverse (https://github.com/nflverse) publishes play-by-play with EPA / WP / CPOE,
weekly player stats, injury reports, snap counts, depth charts, rosters and the
schedule file (which also carries closing spread / total / moneyline).

Completed seasons are cached forever; the current season is re-downloaded when the
cached copy is older than ``settings.live_ttl_hours``.
"""
from __future__ import annotations

import datetime as dt
import logging
import time
from pathlib import Path
from typing import Iterable, Sequence

import httpx
import pandas as pd

from kuze.config import settings

log = logging.getLogger(__name__)

RELEASE_BASE = "https://github.com/nflverse/nflverse-data/releases/download"

DATASETS: dict[str, str] = {
    "pbp": "pbp/play_by_play_{season}.parquet",
    "player_week": "stats_player/stats_player_week_{season}.parquet",
    "team_week": "stats_team/stats_team_week_{season}.parquet",
    "injuries": "injuries/injuries_{season}.parquet",
    "snap_counts": "snap_counts/snap_counts_{season}.parquet",
    "depth_charts": "depth_charts/depth_charts_{season}.parquet",
    "rosters_weekly": "weekly_rosters/roster_weekly_{season}.parquet",
    "rosters": "rosters/roster_{season}.parquet",
    "participation": "pbp_participation/pbp_participation_{season}.parquet",
    "ftn": "ftn_charting/ftn_charting_{season}.parquet",
    "pfr_rec": "pfr_advstats/advstats_week_rec_{season}.parquet",
    "pfr_pass": "pfr_advstats/advstats_week_pass_{season}.parquet",
    "pfr_rush": "pfr_advstats/advstats_week_rush_{season}.parquet",
    "pfr_def": "pfr_advstats/advstats_week_def_{season}.parquet",
    # season independent
    "schedules": "schedules/games.parquet",
    "players": "players/players.parquet",
    "contracts": "contracts/historical_contracts.parquet",
    "ngs_passing": "nextgen_stats/ngs_passing.parquet",
    "ngs_receiving": "nextgen_stats/ngs_receiving.parquet",
    "ngs_rushing": "nextgen_stats/ngs_rushing.parquet",
}

# Columns we actually use from play-by-play (full file has ~370 columns).
PBP_COLUMNS: list[str] = [
    "game_id", "season", "season_type", "week", "game_date", "home_team", "away_team",
    "posteam", "defteam", "posteam_type", "play_id", "play_type", "down", "ydstogo",
    "yardline_100", "qtr", "game_seconds_remaining", "half_seconds_remaining",
    "score_differential", "posteam_score", "defteam_score", "wp", "vegas_wp",
    "epa", "wpa", "success", "yards_gained", "air_yards", "yards_after_catch",
    "pass", "rush", "qb_dropback", "qb_scramble", "qb_kneel", "qb_spike", "sack",
    "qb_hit", "pass_attempt", "complete_pass", "incomplete_pass", "interception",
    "fumble", "fumble_lost", "touchdown", "pass_touchdown", "rush_touchdown",
    "return_touchdown", "first_down", "penalty", "no_play", "two_point_attempt",
    "field_goal_attempt", "field_goal_result", "kick_distance", "extra_point_result",
    "punt_attempt", "kickoff_attempt", "special_teams_play", "cpoe", "xpass",
    "pass_oe", "shotgun", "no_huddle", "pass_location", "pass_length", "run_location",
    "run_gap", "passer_player_id", "passer_player_name", "rusher_player_id",
    "rusher_player_name", "receiver_player_id", "receiver_player_name",
    "fumbled_1_player_id", "td_player_id", "drive", "fixed_drive", "fixed_drive_result",
    "drive_play_count", "goal_to_go", "roof", "surface", "temp", "wind",
    "spread_line", "total_line", "result", "total", "home_score", "away_score",
    "location", "div_game", "stadium_id", "xyac_epa", "qb_epa", "comp_air_epa",
    "comp_yac_epa", "air_epa", "yac_epa", "ep", "passer_id", "rusher_id", "receiver_id",
    "fantasy_player_id", "desc", "play_type_nfl", "timeout", "posteam_timeouts_remaining",
    "home_timeouts_remaining", "away_timeouts_remaining",
]

_SEASON_INDEPENDENT = {"schedules", "players", "contracts", "ngs_passing", "ngs_receiving", "ngs_rushing"}


def current_season(today: dt.date | None = None) -> int:
    """NFL season label for a date (the season that starts in September)."""
    today = today or dt.date.today()
    return today.year if today.month >= 3 else today.year - 1


def _cache_path(name: str, season: int | None) -> Path:
    base = settings.cache_dir / name
    base.mkdir(parents=True, exist_ok=True)
    return base / (f"{name}.parquet" if season is None else f"{name}_{season}.parquet")


def _is_fresh(path: Path, season: int | None) -> bool:
    if not path.exists():
        return False
    live = season is None or season >= current_season()
    if not live:
        return True
    age_h = (time.time() - path.stat().st_mtime) / 3600.0
    return age_h < settings.live_ttl_hours


def download(name: str, season: int | None = None, force: bool = False) -> Path | None:
    """Download one nflverse release asset into the cache. Returns None if missing upstream."""
    if name not in DATASETS:
        raise KeyError(f"unknown dataset {name}")
    if name in _SEASON_INDEPENDENT:
        season = None
    path = _cache_path(name, season)
    if not force and _is_fresh(path, season):
        return path
    url = f"{RELEASE_BASE}/{DATASETS[name].format(season=season)}"
    for attempt in range(4):
        try:
            with httpx.Client(follow_redirects=True, timeout=120) as client:
                resp = client.get(url)
            if resp.status_code == 404:
                log.info("nflverse asset missing: %s", url)
                return path if path.exists() else None
            resp.raise_for_status()
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(resp.content)
            tmp.replace(path)
            return path
        except (httpx.HTTPError, OSError) as exc:  # network hiccup: back off and retry
            log.warning("download failed (%s) attempt %d: %s", url, attempt + 1, exc)
            time.sleep(2 ** (attempt + 1))
    if path.exists():
        log.warning("using stale cache for %s", path)
        return path
    raise RuntimeError(f"could not download {url}")


def load(name: str, seasons: int | Iterable[int] | None = None, columns: Sequence[str] | None = None,
         force: bool = False) -> pd.DataFrame:
    """Load a dataset (optionally for several seasons) as one DataFrame."""
    if name in _SEASON_INDEPENDENT or seasons is None:
        path = download(name, None, force=force)
        return _read(path, columns)
    if isinstance(seasons, int):
        seasons = [seasons]
    frames = []
    for season in seasons:
        path = download(name, season, force=force)
        if path is None:
            continue
        frames.append(_read(path, columns))
    if not frames:
        return pd.DataFrame(columns=list(columns) if columns else None)
    return pd.concat(frames, ignore_index=True)


def _read(path: Path | None, columns: Sequence[str] | None) -> pd.DataFrame:
    if path is None:
        return pd.DataFrame(columns=list(columns) if columns else None)
    if columns is None:
        return pd.read_parquet(path)
    import pyarrow.parquet as pq

    available = set(pq.read_schema(path).names)
    use = [c for c in columns if c in available]
    df = pd.read_parquet(path, columns=use)
    for missing in (c for c in columns if c not in available):
        df[missing] = pd.NA
    return df


def load_pbp(seasons: int | Iterable[int], columns: Sequence[str] | None = None, force: bool = False) -> pd.DataFrame:
    return load("pbp", seasons, columns=columns or PBP_COLUMNS, force=force)


def load_schedules(force: bool = False) -> pd.DataFrame:
    """Schedule + results + closing lines for every game since 1999 (and the future schedule)."""
    games = load("schedules", force=force)
    games["gameday"] = pd.to_datetime(games["gameday"])
    return games
