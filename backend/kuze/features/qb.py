"""Quarterback model.

A QB's value is his shrunk, recency-weighted EPA per QB play (dropbacks incl. sacks and
scrambles + designed QB runs), measured relative to the league average over the same
window. QBs with little history are pulled toward a replacement-level prior, so a
backup with 40 good dropbacks is not treated like a proven starter.

The team adjustment for a game is:  value(starter) - value(QBs who generated the
team's recent passing numbers). That is what moves a line when a starter is out.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from kuze.features.pbp_prep import normalize_team
from kuze.features.ratings import time_index


@dataclass(frozen=True)
class QBParams:
    half_life: float = 40.0     # weeks
    gap: float = 12.0           # off-season decay (weeks)
    prior_plays: float = 150.0  # strength of the prior, in QB plays
    replacement: float = -0.10  # prior mean EPA/play relative to league average
    team_half_life: float = 16.0  # decay used to describe who generated the team's pass numbers


def build_qb_games(pbp: pd.DataFrame) -> pd.DataFrame:
    """Per (game, team, QB): dropbacks, dropback EPA, designed-run EPA, CPOE, sacks, turnovers."""
    p = pbp[pbp["epa"].notna() & pbp["posteam"].notna()].copy()
    p["posteam"] = normalize_team(p["posteam"])
    for c in ("pass", "rush", "qb_scramble", "sack", "interception", "fumble_lost", "qb_kneel", "qb_spike"):
        p[c] = pd.to_numeric(p[c], errors="coerce").fillna(0)
    drop = p[(p["pass"] == 1) & (p["qb_spike"] != 1) & p["passer_id"].notna()]
    g = drop.groupby(["game_id", "season", "week", "posteam", "passer_id"])
    qb = pd.DataFrame({
        "dropbacks": g.size(),
        "db_epa": g["epa"].sum(),
        "sacks": g["sack"].sum(),
        "ints": g["interception"].sum(),
        "cpoe_sum": g["cpoe"].sum(),
        "cpoe_n": g["cpoe"].count(),
        "success": g["success"].sum(),
    }).reset_index().rename(columns={"passer_id": "qb_id", "posteam": "team"})
    qb_ids = set(qb["qb_id"])
    runs = p[(p["rush"] == 1) & (p["pass"] != 1) & (p["qb_kneel"] != 1) & p["rusher_id"].isin(qb_ids)]
    r = runs.groupby(["game_id", "posteam", "rusher_id"]).agg(runs=("epa", "size"), run_epa=("epa", "sum")).reset_index()
    r = r.rename(columns={"posteam": "team", "rusher_id": "qb_id"})
    qb = qb.merge(r, on=["game_id", "team", "qb_id"], how="left").fillna({"runs": 0, "run_epa": 0})
    qb["plays"] = qb["dropbacks"] + qb["runs"]
    qb["epa"] = qb["db_epa"] + qb["run_epa"]
    names = drop.groupby("passer_id")["passer_player_name"].agg(lambda s: s.dropna().iloc[-1] if s.notna().any() else None) \
        if "passer_player_name" in drop else None
    if names is not None:
        qb["qb_name"] = qb["qb_id"].map(names)
    return qb


class QBModel:
    def __init__(self, qb_games: pd.DataFrame, params: QBParams | None = None):
        self.params = params or QBParams()
        self.q = qb_games.reset_index(drop=True)
        self._t = time_index(self.q["season"], self.q["week"], self.params.gap)
        self._t_team = time_index(self.q["season"], self.q["week"], self.params.gap)
        self._y = self.q["epa"].to_numpy(float)
        self._n = self.q["plays"].to_numpy(float)

    def values(self, season: int, week: int) -> tuple[pd.DataFrame, float]:
        """Shrunk value (EPA/play vs league) of every QB using games strictly before (season, week)."""
        prm = self.params
        t_now = time_index(season, week, prm.gap)
        mask = self._t < t_now
        age = t_now - self._t[mask]
        w = np.power(0.5, age / prm.half_life)
        sub = self.q.loc[mask, ["qb_id"]].copy()
        sub["w_epa"] = w * self._y[mask]
        sub["w_n"] = w * self._n[mask]
        sub["raw_n"] = self._n[mask]
        league = sub["w_epa"].sum() / max(sub["w_n"].sum(), 1e-9)
        agg = sub.groupby("qb_id").agg(w_epa=("w_epa", "sum"), w_n=("w_n", "sum"), career_plays=("raw_n", "sum"))
        agg["raw"] = agg["w_epa"] / agg["w_n"].clip(lower=1e-9) - league
        agg["value"] = (agg["w_epa"] - league * agg["w_n"] + prm.replacement * prm.prior_plays) / (agg["w_n"] + prm.prior_plays)
        return agg.reset_index(), league

    def team_baseline(self, season: int, week: int, values: pd.DataFrame) -> pd.DataFrame:
        """Dropback-weighted value of the QBs behind each team's recent pass numbers."""
        prm = self.params
        t_now = time_index(season, week, prm.gap)
        mask = self._t_team < t_now
        age = t_now - self._t_team[mask]
        w = np.power(0.5, age / prm.team_half_life) * self.q.loc[mask, "dropbacks"].to_numpy(float)
        sub = self.q.loc[mask, ["team", "qb_id"]].assign(w=w)
        sub = sub.merge(values[["qb_id", "value"]], on="qb_id", how="left").fillna({"value": prm.replacement})
        sub["wv"] = sub["w"] * sub["value"]
        agg = sub.groupby("team").agg(wv=("wv", "sum"), w=("w", "sum"))
        agg["baseline"] = agg["wv"] / agg["w"].clip(lower=1e-9)
        return agg[["baseline"]].reset_index()

    def value_of(self, values: pd.DataFrame, qb_id) -> float:
        if qb_id is None or (isinstance(qb_id, float) and np.isnan(qb_id)):
            return self.params.replacement
        row = values.loc[values["qb_id"] == qb_id, "value"]
        return float(row.iloc[0]) if len(row) else self.params.replacement
