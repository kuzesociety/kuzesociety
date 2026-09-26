"""Opponent-adjusted, recency-weighted team ratings.

For every metric (EPA/dropback, rush success rate, points/drive, pace, ...) and every
week we solve a weighted ridge regression over all prior team-games:

    rate(offense, game) = mu + home * h + off[offense] + def[defense] + noise

* weights  = sample size (plays / dropbacks / drives) x exponential time decay
* the ridge penalty is expressed in "plays of league-average evidence" so a team with few
  plays is pulled to the league mean (this is what makes week-2 numbers sane)
* time runs through the off-season with an extra gap, so last season (the baseline)
  fades smoothly as current-season games accumulate.

Offense and defense are rated separately, which gives the opponent adjustment for free:
a defense that faced three bad offenses doesn't get credit for it.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

WEEKS_PER_SEASON = 22


@dataclass(frozen=True)
class MetricSpec:
    num: str
    den: str | None          # None -> per-game metric (weight 1 per game)
    half_life: float = 10.0  # weeks
    gap: float = 12.0        # extra "weeks" of decay across the off-season
    lam: float = 300.0       # ridge penalty in units of the denominator
    offense_only: bool = False


# Hyper-parameters tuned with ``tune_metric`` (walk-forward, predicting the next game's value
# for 2009-2025). See scripts/tune_ratings.py for the search.
METRICS: dict[str, MetricSpec] = {
    "epa": MetricSpec("epa", "plays", 16, 20, 200),
    "pass_epa": MetricSpec("pass_epa_nto", "pass_nto_n", 16, 12, 150),
    "rush_epa": MetricSpec("rush_epa_nto", "rush_nto_n", 32, 32, 200),
    "sr": MetricSpec("success", "plays", 16, 20, 200),
    "pass_sr": MetricSpec("pass_success", "n_pass", 24, 32, 150),
    "rush_sr": MetricSpec("rush_success", "n_rush", 16, 6, 200),
    "early_epa": MetricSpec("early_epa", "early_n", 32, 48, 400),
    "int_rate": MetricSpec("ints", "n_pass", 48, 32, 1500),
    "fum_rate": MetricSpec("fumbles", "plays", 32, 3, 3000),
    "sack_rate": MetricSpec("sacks", "n_pass", 32, 32, 400),
    "exp_pass": MetricSpec("pass_explosive", "n_pass", 48, 48, 800),
    "exp_rush": MetricSpec("rush_explosive", "n_rush", 24, 12, 250),
    "ppd": MetricSpec("drive_pts", "drives", 24, 32, 60),
    "rz_td": MetricSpec("rz_tds", "rz_trips", 32, 6, 160),
    "third": MetricSpec("third_conv", "third_n", 32, 12, 200),
    "proe": MetricSpec("proe_sum", "proe_n", 12, 20, 150),
    "pace": MetricSpec("neutral_sec", "neutral_gaps", 12, 6, 150),
    "plays": MetricSpec("plays", None, 48, 48, 16),
    "points": MetricSpec("points", None, 12, 6, 4),
    "cpoe": MetricSpec("cpoe_sum", "cpoe_n", 24, 20, 250),
    "st": MetricSpec("st_epa", None, 24, 3, 24, offense_only=True),
}


def time_index(season, week, gap: float) -> np.ndarray:
    season = np.asarray(season, dtype=float)
    week = np.asarray(week, dtype=float)
    return (season - 2000.0) * (WEEKS_PER_SEASON + gap) + week


class TeamIndex:
    def __init__(self, teams):
        self.teams = sorted(set(teams))
        self.pos = {t: i for i, t in enumerate(self.teams)}

    def __len__(self):
        return len(self.teams)

    def idx(self, series) -> np.ndarray:
        return np.array([self.pos[t] for t in series], dtype=np.int64)


def _solve(off, de, home, y, w, n, lam, offense_only=False):
    """Weighted ridge with one-hot offense/defense effects, via closed-form normal equations."""
    p = 2 + (n if offense_only else 2 * n)
    A = np.zeros((p, p))
    b = np.zeros(p)
    wh = w * home
    wy = w * y
    A[0, 0] = w.sum()
    A[0, 1] = A[1, 0] = wh.sum()
    A[1, 1] = (wh * home).sum()
    b[0] = wy.sum()
    b[1] = (wy * home).sum()
    ow = np.bincount(off, weights=w, minlength=n)
    owh = np.bincount(off, weights=wh, minlength=n)
    o_sl = slice(2, 2 + n)
    A[0, o_sl] = A[o_sl, 0] = ow
    A[1, o_sl] = A[o_sl, 1] = owh
    A[o_sl, o_sl] = np.diag(ow)
    b[o_sl] = np.bincount(off, weights=wy, minlength=n)
    if not offense_only:
        d_sl = slice(2 + n, 2 + 2 * n)
        dw = np.bincount(de, weights=w, minlength=n)
        dwh = np.bincount(de, weights=wh, minlength=n)
        A[0, d_sl] = A[d_sl, 0] = dw
        A[1, d_sl] = A[d_sl, 1] = dwh
        A[d_sl, d_sl] = np.diag(dw)
        cross = np.bincount(off * n + de, weights=w, minlength=n * n).reshape(n, n)
        A[o_sl, d_sl] = cross
        A[d_sl, o_sl] = cross.T
        b[d_sl] = np.bincount(de, weights=wy, minlength=n)
    A[2:, 2:] += lam * np.eye(p - 2)
    A[1, 1] += 1e-6
    A[0, 0] += 1e-9
    beta = np.linalg.solve(A, b)
    mu, hfa = beta[0], beta[1]
    off_eff = beta[o_sl]
    def_eff = beta[2 + n:] if not offense_only else np.zeros(n)
    return mu, hfa, off_eff, def_eff


class RatingData:
    """Pre-extracted numpy arrays of team-game rows for fast repeated snapshots."""

    def __init__(self, team_games: pd.DataFrame, index: TeamIndex | None = None):
        tg = team_games.sort_values(["season", "week"]).reset_index(drop=True)
        self.tg = tg
        self.index = index or TeamIndex(pd.concat([tg["team"], tg["opp"]]).unique())
        self.off = self.index.idx(tg["team"])
        self.de = self.index.idx(tg["opp"])
        self.home = (tg["is_home"] - tg["is_away"]).to_numpy(float)
        self.season = tg["season"].to_numpy(float)
        self.week = tg["week"].to_numpy(float)

    def rate(self, spec: MetricSpec):
        num = self.tg[spec.num].to_numpy(float)
        if spec.den is None:
            return num, np.ones_like(num)
        den = self.tg[spec.den].to_numpy(float)
        with np.errstate(invalid="ignore", divide="ignore"):
            y = np.where(den > 0, num / np.maximum(den, 1e-9), 0.0)
        return y, den


def snapshot(data: RatingData, spec: MetricSpec, season: int, week: int, y=None, n_obs=None,
             half_life=None, gap=None, lam=None):
    """Ratings using every team-game strictly before (season, week)."""
    half_life = spec.half_life if half_life is None else half_life
    gap = spec.gap if gap is None else gap
    lam = spec.lam if lam is None else lam
    if y is None:
        y, n_obs = data.rate(spec)
    t_now = time_index(season, week, gap)
    t = time_index(data.season, data.week, gap)
    mask = (t < t_now) & (t > t_now - 6 * half_life - 3 * (WEEKS_PER_SEASON + gap)) & (n_obs > 0)
    age = t_now - t[mask]
    w = n_obs[mask] * np.power(0.5, age / half_life)
    return _solve(data.off[mask], data.de[mask], data.home[mask], y[mask], w, len(data.index), lam,
                  spec.offense_only)


def all_snapshots(data: RatingData, keys: list[tuple[int, int]], metrics: dict[str, MetricSpec] | None = None) -> pd.DataFrame:
    """Ratings table: one row per (season, week, team) with ``off_<m>``/``def_<m>`` columns and league means."""
    metrics = metrics or METRICS
    teams = data.index.teams
    rows = []
    prepared = {m: data.rate(spec) for m, spec in metrics.items()}
    for season, week in keys:
        block = {"season": season, "week": week, "team": teams}
        for m, spec in metrics.items():
            y, n_obs = prepared[m]
            mu, hfa, off_eff, def_eff = snapshot(data, spec, season, week, y, n_obs)
            block[f"off_{m}"] = off_eff
            if not spec.offense_only:
                block[f"def_{m}"] = def_eff
            block[f"mu_{m}"] = np.full(len(teams), mu)
            block[f"hfa_{m}"] = np.full(len(teams), hfa)
        rows.append(pd.DataFrame(block))
    return pd.concat(rows, ignore_index=True)


def tune_metric(data: RatingData, spec: MetricSpec, seasons: range, grid_hl, grid_gap, grid_lam) -> pd.DataFrame:
    """Walk-forward: for each hyper-parameter combo, how well do ratings predict the next game's rate?"""
    y, n_obs = data.rate(spec)
    keys = sorted({(int(s), int(w)) for s, w in zip(data.season, data.week) if int(s) in seasons})
    results = []
    for hl in grid_hl:
        for gap in grid_gap:
            for lam in grid_lam:
                sse = sse0 = wsum = 0.0
                for season, week in keys:
                    rows = (data.season == season) & (data.week == week) & (n_obs > 0)
                    if not rows.any():
                        continue
                    mu, hfa, off_eff, def_eff = snapshot(data, spec, season, week, y, n_obs, hl, gap, lam)
                    pred = mu + hfa * data.home[rows] + off_eff[data.off[rows]] + def_eff[data.de[rows]]
                    ww = n_obs[rows]
                    sse += float(np.sum(ww * (y[rows] - pred) ** 2))
                    sse0 += float(np.sum(ww * (y[rows] - mu) ** 2))
                    wsum += float(ww.sum())
                results.append({"half_life": hl, "gap": gap, "lam": lam, "mse": sse / wsum,
                                "r2_vs_mean": 1 - sse / sse0})
    return pd.DataFrame(results).sort_values("mse")
