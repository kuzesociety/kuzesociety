"""End-to-end pipeline: refresh data -> features -> model -> predictions for upcoming games.

Artifacts are cached under ``settings.data_dir``; completed seasons are computed once, the
current season is rebuilt on every refresh (nflverse updates play-by-play nightly).
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from kuze.config import settings
from kuze.data import nflverse as nv
from kuze.features import availability as AV
from kuze.features import game_features as GF
from kuze.features import pbp_prep, team_games
from kuze.features.qb import build_qb_games
from kuze.models import game_model as GM
from kuze.models.distributions import KeyNumberModel

log = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)

FIRST_PBP_SEASON = 2005
FIRST_AV_SEASON = 2012
_lock = threading.RLock()


def _derived(name: str) -> Path:
    p = settings.data_dir / "derived"
    p.mkdir(parents=True, exist_ok=True)
    return p / name


@dataclass
class State:
    schedules: pd.DataFrame
    features: pd.DataFrame          # game features incl. availability, all games since 2006
    availability_players: pd.DataFrame
    model: GM.GameModel
    keynum: KeyNumberModel
    built_at: str
    team_games: pd.DataFrame = None
    qb_games: pd.DataFrame = None
    _cache: dict = None

    def cache(self) -> dict:
        if self._cache is None:
            self._cache = {}
        return self._cache


class Pipeline:
    def __init__(self):
        self._state: State | None = None

    # ------------------------------------------------------------------ data
    def refresh_data(self, force: bool = False) -> dict:
        """Re-download current-season files (history is cached permanently)."""
        season = nv.current_season()
        t = time.time()
        for name in ("pbp", "injuries", "snap_counts", "rosters_weekly", "player_week", "depth_charts"):
            try:
                nv.download(name, season, force=force)
            except Exception as exc:  # keep going with stale data rather than failing the app
                log.warning("refresh %s failed: %s", name, exc)
        nv.download("schedules", force=force)
        return {"season": season, "seconds": round(time.time() - t, 1)}

    def _season_tables(self, season: int, sched: pd.DataFrame, rebuild: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
        tg_path, qb_path = _derived(f"team_games_{season}.parquet"), _derived(f"qb_games_{season}.parquet")
        if not rebuild and tg_path.exists() and qb_path.exists():
            return pd.read_parquet(tg_path), pd.read_parquet(qb_path)
        raw = nv.load_pbp(season)
        if raw.empty:
            return pd.DataFrame(), pd.DataFrame()
        plays = pbp_prep.prepare(raw)
        tg = team_games.build_team_games(raw, plays, sched)
        qb = build_qb_games(raw)
        tg.to_parquet(tg_path)
        qb.to_parquet(qb_path)
        return tg, qb

    def build(self, retrain: bool = False) -> State:
        with _lock:
            t0 = time.time()
            cur = nv.current_season()
            sched = nv.load_schedules()
            tgs, qbs = [], []
            for s in range(FIRST_PBP_SEASON, cur + 1):
                tg, qb = self._season_tables(s, sched, rebuild=(s >= cur))
                if len(tg):
                    tgs.append(tg)
                    qbs.append(qb)
            team_g = pd.concat(tgs, ignore_index=True)
            qb_g = pd.concat(qbs, ignore_index=True)
            feats = GF.build_game_features(sched, team_g, qb_g)
            av = self._availability(sched)
            feats = feats.merge(av["games"], on="game_id", how="left")
            feats.to_parquet(_derived("game_features.parquet"))
            model_path = settings.models_dir / "game_model.pkl"
            if retrain or not model_path.exists():
                model = self.train(feats)
            else:
                model = GM.GameModel.load(model_path)
            keynum = KeyNumberModel.load()
            self._state = State(sched, feats, av["players"], model, keynum, dt.datetime.utcnow().isoformat(),
                                team_g, qb_g)
            log.info("pipeline built in %.1fs", time.time() - t0)
            return self._state

    def _availability(self, sched: pd.DataFrame) -> dict:
        cur = nv.current_season()
        seasons = range(FIRST_AV_SEASON, cur + 1)
        sn = nv.load("snap_counts", seasons)
        rw = nv.load("rosters_weekly", seasons, columns=["season", "week", "team", "gsis_id", "pfr_id", "status"])
        inj = nv.load("injuries", seasons)
        players = nv.load("players")
        overrides = load_injury_overrides()
        res = AV.compute(sn, sched, rw, inj, players, overrides=overrides)
        games = AV.game_level(res.team_games, sched[sched["season"] >= FIRST_AV_SEASON])
        return {"games": games, "players": res.players}

    # ------------------------------------------------------------------ model
    def train(self, feats: pd.DataFrame) -> GM.GameModel:
        """Fit on all completed games, estimate the market blend out-of-sample, save a new version."""
        cur = int(feats["season"].max())
        oos = GM.add_market_means(GM.walk_forward(feats, range(2010, cur + 1)))
        blend, report = GM.estimate_blend(oos, midweek_lines())
        model = GM.GameModel.train(feats)
        model.blend = blend
        model.backtest = {"blend_report": report, **GM.backtest_summary(oos, blend)}
        km = KeyNumberModel.load()
        model.margin_resid_sd = km.margin_sd
        path = settings.models_dir / "game_model.pkl"
        if path.exists():  # keep the previous champion for rollback / comparison
            path.replace(settings.models_dir / "game_model_prev.pkl")
        model.save(path)
        oos.to_parquet(_derived("walk_forward_oos.parquet"))
        return model

    # ------------------------------------------------------------------ inference
    @property
    def state(self) -> State:
        if self._state is None:
            self.build()
        return self._state

    def upcoming(self, season: int | None = None, week: int | None = None) -> pd.DataFrame:
        st = self.state
        f = st.features
        if season is None or week is None:
            season, week = next_week(st.schedules)
        sel = f[(f["season"] == season) & (f["week"] == week)]
        pred = st.model.predict(sel)
        return sel.merge(pred, on="game_id")


def ratings_snapshot(st: State, season: int, week: int) -> pd.DataFrame:
    """Opponent-adjusted ratings of every team entering (season, week) (cached)."""
    from kuze.features import ratings as R
    key = ("ratings", season, week)
    c = st.cache()
    if key not in c:
        data = R.RatingData(st.team_games)
        c[key] = R.all_snapshots(data, [(season, week)])
    return c[key]


def team_stats(st: State, season: int):
    """Descriptive stats over the previous + current season (cached)."""
    from kuze.analysis.team_stats import TeamStats, build_drives
    key = ("team_stats", season)
    c = st.cache()
    if key not in c:
        raw = nv.load_pbp([season - 1, season])
        plays = pbp_prep.prepare(raw)
        g = st.schedules[st.schedules["season"] >= season - 1].copy()
        for col in ("home_team", "away_team"):
            g[col] = pbp_prep.normalize_team(g[col])
        c[key] = TeamStats(plays, build_drives(raw), g)
        try:
            c[("ftn", season)] = nv.load("ftn", [season - 1, season])
        except Exception:
            c[("ftn", season)] = None
    return c[key]


def qb_model(st: State):
    from kuze.features.qb import QBModel
    c = st.cache()
    if "qb_model" not in c:
        c["qb_model"] = QBModel(st.qb_games)
    return c["qb_model"]


def next_week(schedules: pd.DataFrame, today: dt.date | None = None) -> tuple[int, int]:
    """The (season, week) containing the next unplayed game."""
    today = pd.Timestamp(today or dt.date.today())
    fut = schedules[schedules["result"].isna() & (schedules["gameday"] >= today - pd.Timedelta(days=1))]
    if fut.empty:
        last = schedules.sort_values("gameday").iloc[-1]
        return int(last["season"]), int(last["week"])
    first = fut.sort_values("gameday").iloc[0]
    return int(first["season"]), int(first["week"])


def midweek_lines() -> dict[str, float]:
    """Westgate SuperContest (Wednesday) lines 2013-2020, home perspective (for blend estimation)."""
    path = Path(__file__).resolve().parent / "data" / "static" / "sc_lines.csv"
    if not path.exists():
        return {}
    sc = pd.read_csv(path)
    sc = sc[sc["side"] == sc["home_team"]].copy()
    sched = nv.load_schedules()
    sched["old_game_id"] = sched["old_game_id"].astype(str)
    sc["old_game_id"] = sc["game_id"].astype(str)
    sc = sc.merge(sched[["old_game_id", "game_id"]].rename(columns={"game_id": "gid"}), on="old_game_id")
    return dict(zip(sc["gid"], -sc["line"]))


def load_injury_overrides() -> dict:
    """Manual injury statuses entered in the app: {(season, week, team, gsis_id): (roster, report)}."""
    path = settings.data_dir / "injury_overrides.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    return {(r["season"], r["week"], r["team"], r["gsis_id"]): (r.get("roster_status"), r.get("report_status")) for r in raw}


pipeline = Pipeline()
