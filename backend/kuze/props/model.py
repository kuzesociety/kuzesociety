"""Player prop projections: team volume x player share x efficiency, then a boosted calibration layer,
then an empirical predictive distribution for P(over / under) at any line.

Pipeline (walk-forward validated, see scripts/backtest_props.py):
1. Team volume: targets, designed rushes, pass attempts, pass/rush TDs from the team's recent
   volume, the opponent's volume allowed and the game environment (expected margin & total).
2. Structural projection: e.g. rec yards = team targets x target share x yards/target (shrunk)
   x opponent yards/target allowed to the position (vs league).
3. Calibration: gradient boosting on the structural projection + components corrects biases
   (volume regression to the mean, role changes, game script).
4. Recalibration (QB passing stats): walk-forward projections of QB volume were too extreme - a
   26-attempt projection averaged 28.5 actual, a 39-attempt one 36 (OOS slope ~0.66). A linear
   shrink fitted on out-of-sample history fixes the tails, which is exactly where bets come from.
   Other stats already had OOS slopes ~1 and recalibrating them only added noise.
5. Distribution: actual/projection ratios from out-of-sample history in bins of projection size.
   Books hang prop lines near the median, and yardage is right-skewed (mean > median), so the
   full distribution matters: an 82-yard mean projection can still be an UNDER at 74.5.
"""
from __future__ import annotations

import json
import pickle
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

STATS = {
    # stat: (positions, structural column)
    "receptions": (("WR", "TE", "RB"), "s_rec"),
    "receiving_yards": (("WR", "TE", "RB"), "s_rec_yds"),
    "targets": (("WR", "TE", "RB"), "s_tgt"),
    "carries": (("RB", "QB"), "s_car"),
    "rushing_yards": (("RB", "QB"), "s_rush_yds"),
    "rush_rec_yards": (("RB",), "s_rush_rec"),
    "attempts": (("QB",), "s_att"),
    "completions": (("QB",), "s_cmp"),
    "passing_yards": (("QB",), "s_pyds"),
    "passing_tds": (("QB",), "s_ptd"),
}
FITTED = Path(__file__).resolve().parent / "fitted"
OOS_SNAPSHOT = FITTED / "props_oos.parquet"     # compact walk-forward results shipped with the code
TEAM_TARGETS = ["team_targets", "team_designed", "team_pass_att", "team_pass_td", "team_rush_td"]
N_BINS = 10
# stats whose out-of-sample projections needed shrinking toward the mean (validated, nested by season)
RECAL_STATS = ("attempts", "completions", "passing_yards", "passing_tds")


def fit_recal(proj: np.ndarray, actual: np.ndarray, season: np.ndarray, decay: float = 0.8) -> tuple[float, float]:
    """Recency-weighted least squares of actual on projection: actual ~ a + b * proj."""
    w = np.power(decay, season.max() - season)
    X = np.c_[np.ones(len(proj)), proj]
    a, b = np.linalg.solve(X.T @ (X * w[:, None]), X.T @ (w * actual))
    b = float(np.clip(b, 0.4, 1.0))
    a = float(np.average(actual - b * proj, weights=w))   # re-center after clipping the slope
    return a, b


def apply_recal(proj, ab: tuple[float, float] | None, floor: float = 0.05):
    if ab is None:
        return proj
    return np.maximum(ab[0] + ab[1] * np.asarray(proj, dtype=float), floor)


def assemble(pf: pd.DataFrame, tf: pd.DataFrame, dv: pd.DataFrame, dq: pd.DataFrame, games: pd.DataFrame,
             game_features: pd.DataFrame | None = None, active: pd.Series | None = None) -> pd.DataFrame:
    """Join player features with team-volume features, opponent adjustments and the game line.

    ``active``: boolean per row, whether the player is expected to play (history: he played;
    live: P(play) >= 0.5). Shares are re-normalized over the active players, which is how a
    missing WR1's targets get redistributed to his teammates.
    """
    g = games[["game_id", "home_team", "away_team", "spread_line", "total_line", "home_qb_id", "away_qb_id"]].copy()
    team_cols = ["game_id", "team"] + [c for c in tf.columns if c.startswith(("tf_", "ta_"))]
    tf2 = tf[team_cols].copy()
    # opponent's allowed volume = the opponent row's ta_* (what the opponent's defense allows)
    opp_allowed = tf[["game_id", "team"] + [c for c in tf.columns if c.startswith("ta_")]].rename(columns={"team": "opp"})
    d = pf.merge(tf2[["game_id", "team"] + [c for c in tf2.columns if c.startswith("tf_")]], on=["game_id", "team"], how="left")
    d = d.merge(opp_allowed, on=["game_id", "opp"], how="left")
    d = d.merge(g, on="game_id", how="left")
    home = d["team"] == d["home_team"]
    d["team_spread"] = np.where(home, d["spread_line"], -d["spread_line"])  # expected margin for the player's team
    d["game_total"] = d["total_line"]
    d["team_implied"] = d["game_total"] / 2 + d["team_spread"] / 2
    d["is_starting_qb"] = np.where(home, d["home_qb_id"], d["away_qb_id"]) == d["player_id"]
    dv2 = dv.rename(columns={"pos": "position"})
    n0 = len(d)
    d = d.merge(dv2, on=["game_id", "opp", "position"], how="left", suffixes=("", "_dv"))
    d = d.merge(dq, on=["game_id", "opp"], how="left")
    assert len(d) == n0, f"assemble: merge changed row count {n0} -> {len(d)}"
    # league means for the opponent adjustment (per season to track drift)
    d["dv_ypt"] = d["dv_yds"] / d["dv_tgt"].replace(0, np.nan)
    d["dv_cr"] = d["dv_rec"] / d["dv_tgt"].replace(0, np.nan)
    d["dv_ypc"] = d["dv_ryd"] / d["dv_car"].replace(0, np.nan)
    d["dq_ypa"] = d["dq_pyd"] / d["dq_att"].replace(0, np.nan)
    d["dq_cmp"] = d["dq_cmp"] / d["dq_att"].replace(0, np.nan)
    for c in ("dv_ypt", "dv_cr", "dv_ypc", "dq_ypa", "dq_cmp"):
        lg = d.groupby(["season", "position"] if c.startswith("dv") else ["season"])[c].transform("median")
        d[c + "_adj"] = (d[c] / lg).clip(0.7, 1.3).fillna(1.0)
        d[c + "_adj"] = 1.0 + 0.5 * (d[c + "_adj"] - 1.0)   # half-strength: defenses vs position are noisy
    # redistribution of opportunity over the players who will actually be on the field
    if active is None:
        active = (d["offense_pct"].fillna(0) > 0) | (d["tgt"] + d["designed"] + d["attempts"] > 0)
    d["_active"] = np.asarray(active, dtype=bool)
    for share, out in (("f_tgt_share", "f_tgt_share_n"), ("f_carry_share", "f_carry_share_n"),
                       ("f_rz_tgt_share", "f_rz_tgt_share_n"), ("f_i5_share", "f_i5_share_n"), ("f_ez_share", "f_ez_share_n"),
                       ("f_air_share", "f_air_share_n")):
        mask = d["_active"] & (d["position"] != "QB") if share != "f_carry_share" else d["_active"]
        tot = d[share].where(mask, 0.0).groupby([d["game_id"], d["team"]]).transform("sum")
        d[out] = np.where(tot > 0.05, d[share] / tot.clip(lower=0.05), d[share])
        d[out] = np.minimum(d[out], d[share] * 2.0)   # cap: nobody more than doubles his share
        d[share + "_lost"] = (1.0 - tot).clip(-0.5, 0.9)   # share of team volume whose owner is out
    # league environment (passing volume drifts across eras) and the team's starting QB quality
    lg_env = d.drop_duplicates(["game_id", "team"]).groupby(["season", "week"]).agg(
        lg_targets=("tf_team_targets", "mean"), lg_pass_att=("tf_team_pass_att", "mean")).reset_index()
    d = d.merge(lg_env, on=["season", "week"], how="left")
    if game_features is not None:
        q = game_features[["game_id", "home_team", "home_qb_value", "away_qb_value"]]
        d = d.merge(q.drop(columns=["home_team"]), on="game_id", how="left")
        d["team_qb_value"] = np.where(d["team"] == d["home_team"], d["home_qb_value"], d["away_qb_value"])
        d["opp_qb_value"] = np.where(d["team"] == d["home_team"], d["away_qb_value"], d["home_qb_value"])
        d = d.drop(columns=["home_qb_value", "away_qb_value"])
    else:
        d["team_qb_value"] = 0.0
        d["opp_qb_value"] = 0.0
    return d


@dataclass
class TeamVolumeModel:
    models: dict = field(default_factory=dict)
    features: tuple = ("tf_team_targets", "ta_team_targets", "tf_team_designed", "ta_team_designed",
                       "tf_team_pass_att", "ta_team_pass_att", "tf_team_pass_td", "ta_team_pass_td",
                       "tf_team_rush_td", "ta_team_rush_td", "tf_team_plays", "ta_team_plays",
                       "team_spread", "game_total", "team_implied", "lg_targets", "lg_pass_att", "team_qb_value",
                       "opp_qb_value")

    def fit(self, team_rows: pd.DataFrame) -> "TeamVolumeModel":
        X = team_rows[list(self.features)].fillna(team_rows[list(self.features)].median())
        w = np.power(RECENCY_DECAY, team_rows["season"].max() - team_rows["season"])
        for tgt in TEAM_TARGETS:
            self.models[tgt] = Ridge(alpha=1.0).fit(X, team_rows[tgt], sample_weight=w)
        self._med = X.median()
        return self

    def predict(self, rows: pd.DataFrame) -> pd.DataFrame:
        X = rows[list(self.features)].fillna(self._med)
        return pd.DataFrame({f"v_{t}": np.maximum(m.predict(X), 0.1) for t, m in self.models.items()}, index=rows.index)


def team_rows(d: pd.DataFrame) -> pd.DataFrame:
    """One row per (game, team) with team features and realized volumes."""
    cols = ["game_id", "team", "season", "week"] + [c for c in d.columns if c.startswith(("tf_", "ta_"))] + \
        ["team_spread", "game_total", "team_implied", "lg_targets", "lg_pass_att", "team_qb_value", "opp_qb_value"] + \
        [c for c in TEAM_TARGETS if c in d]
    return d[cols].drop_duplicates(["game_id", "team"])


def structural(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["s_tgt"] = d["v_team_targets"] * d["f_tgt_share_n"]
    d["s_rec"] = d["s_tgt"] * d["f_catch_rate"] * d["dv_cr_adj"]
    d["s_rec_yds"] = d["s_tgt"] * d["f_ypt"] * d["dv_ypt_adj"]
    qb = d["position"] == "QB"
    d["s_car"] = np.where(qb, d["f_qb_car_pg"], d["v_team_designed"] * d["f_carry_share_n"])
    d["s_rush_yds"] = d["s_car"] * d["f_ypc"] * d["dv_ypc_adj"]
    d["s_rush_rec"] = d["s_rush_yds"] + d["s_rec_yds"]
    d["s_att"] = d["v_team_pass_att"]
    d["s_cmp"] = d["s_att"] * d["f_comp"] * d["dq_cmp_adj"]
    d["s_pyds"] = d["s_att"] * d["f_ypa"] * d["dq_ypa_adj"]
    d["s_ptd"] = d["v_team_pass_td"]
    return d


CAL_FEATURES = ["s_proj", "f_tgt_share", "f_tgt_share_n", "f_air_share_n", "f_carry_share", "f_carry_share_n",
                "f_tgt_share_lost", "f_carry_share_lost", "f_catch_rate", "f_ypt", "f_ypc", "f_adot",
                "f_snap", "games_prev", "team_spread", "game_total", "team_implied", "v_team_targets", "v_team_designed",
                "v_team_pass_att", "f_ypa", "f_comp", "f_att_pg", "f_qb_car_pg", "f_deep_share", "dv_ypt_adj",
                "dv_ypc_adj", "dq_ypa_adj", "pos_code", "lg_targets", "lg_pass_att", "team_qb_value", "opp_qb_value"]
RECENCY_DECAY = 0.8   # per season, for training-sample weights
POS_CODE = {"QB": 0, "RB": 1, "WR": 2, "TE": 3, "FB": 1}
# features that mean nothing for the position are replaced by a constant outside every feature's range,
# so the trees can't key on noise such as a QB's receiving efficiency from one trick-play target (which
# acted as a player identifier). A constant, not NaN: an all-missing column breaks the binner, and NaN
# routing at predict time would depend on whether training happened to see missing values.
RECEIVING_ONLY = ("f_tgt_share", "f_tgt_share_n", "f_air_share_n", "f_catch_rate", "f_ypt", "f_adot", "f_deep_share")
PASSING_ONLY = ("f_ypa", "f_comp", "f_att_pg")
MASKED = -9.0


def cal_matrix(d: pd.DataFrame, s_proj: pd.Series) -> pd.DataFrame:
    X = d.assign(s_proj=np.asarray(s_proj, dtype=float), pos_code=d["position"].map(POS_CODE).fillna(2))
    X = X[CAL_FEATURES].astype(float).reset_index(drop=True)
    qb = (d["position"] == "QB").to_numpy()
    X.loc[qb, [c for c in RECEIVING_ONLY if c in X]] = MASKED
    X.loc[~qb, [c for c in PASSING_ONLY if c in X]] = MASKED
    return X


def eligible(d: pd.DataFrame, stat: str) -> pd.Series:
    pos, _ = STATS[stat]
    ok = d["position"].isin(pos)
    if stat in ("attempts", "completions", "passing_yards", "passing_tds"):
        ok &= d["is_starting_qb"]
    elif "QB" in pos:
        ok &= (d["position"] != "QB") | d["is_starting_qb"]
    played = (d["offense_pct"].fillna(0.5) > 0) | (d["tgt"] + d["designed"] + d["attempts"] > 0)
    return ok & played


@dataclass
class RatioDistribution:
    """Empirical distribution of actual/projection by projection-size bin (out-of-sample)."""
    edges: np.ndarray
    ratios: list

    @classmethod
    def fit(cls, proj: np.ndarray, actual: np.ndarray, n_bins: int = N_BINS) -> "RatioDistribution":
        proj = np.maximum(proj, 1e-3)
        qs = np.quantile(proj, np.linspace(0, 1, n_bins + 1))
        qs[0], qs[-1] = 0.0, np.inf
        qs = np.unique(qs)
        ratios = []
        for lo, hi in zip(qs[:-1], qs[1:]):
            sel = (proj >= lo) & (proj < hi)
            r = np.sort(actual[sel] / proj[sel])
            ratios.append(r[:: max(1, len(r) // 4000)])
        return cls(qs, ratios)

    def samples(self, proj: float) -> np.ndarray:
        proj = max(proj, 1e-3)
        i = int(np.clip(np.searchsorted(self.edges, proj, side="right") - 1, 0, len(self.ratios) - 1))
        return self.ratios[i] * proj

    def prob_over(self, proj: float, line: float) -> tuple[float, float, float]:
        s = self.samples(proj)
        if float(line).is_integer():
            s = np.round(s)
            return float((s > line).mean()), float((s == line).mean()), float((s < line).mean())
        return float((s > line).mean()), 0.0, float((s < line).mean())

    def quantiles(self, proj: float, qs=(0.1, 0.25, 0.5, 0.75, 0.9)) -> dict:
        s = self.samples(proj)
        return {f"p{int(q * 100)}": float(np.quantile(s, q)) for q in qs}


@dataclass
class PropModel:
    team: TeamVolumeModel = field(default_factory=TeamVolumeModel)
    calibrators: dict = field(default_factory=dict)
    recal: dict = field(default_factory=dict)   # stat -> (a, b) linear shrink of the projection
    dists: dict = field(default_factory=dict)
    metrics: dict = field(default_factory=dict)
    trained_through: str = ""

    @staticmethod
    def _xy(d: pd.DataFrame, stat: str):
        s = d[eligible(d, stat)].copy()
        s["s_proj"] = s[STATS[stat][1]]
        return s

    @classmethod
    def train(cls, d: pd.DataFrame, oos: pd.DataFrame | None = None) -> "PropModel":
        m = cls()
        tr = team_rows(d)
        m.team.fit(tr.dropna(subset=["team_targets"]))
        d = structural(pd.concat([d, m.team.predict(d)], axis=1))
        for stat in STATS:
            s = cls._xy(d, stat)
            # Multiplicative correction of the structural projection: the (linear, extrapolating) volume
            # model carries the level - passing volume drifts down across eras and trees can't
            # extrapolate - while the boosted model learns the shape of the correction.
            base = s["s_proj"].clip(lower=0.25)
            ratio = (s[stat].clip(lower=0) / base).clip(upper=6.0)
            gb = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=80,
                                               l2_regularization=1.0)
            w = np.power(RECENCY_DECAY, s["season"].max() - s["season"]) * base
            gb.fit(cal_matrix(s, s["s_proj"]), ratio, sample_weight=w)
            m.calibrators[stat] = gb
            if oos is not None and stat in oos:
                o = oos[stat].dropna(subset=["proj", "actual"])
                proj = o["proj"].to_numpy(dtype=float)
                if stat in RECAL_STATS:
                    m.recal[stat] = fit_recal(proj, o["actual"].to_numpy(dtype=float), o["season"].to_numpy())
                    proj = apply_recal(proj, m.recal[stat])
                act = o["actual"].to_numpy(dtype=float)
                m.dists[stat] = {"_all": RatioDistribution.fit(proj, act)}
                for pos in o["position"].unique():
                    sel = (o["position"] == pos).to_numpy()
                    if sel.sum() >= 1500:
                        m.dists[stat][pos] = RatioDistribution.fit(proj[sel], act[sel])
        m.trained_through = f"{int(d['season'].max())} wk{int(d.loc[d['season'] == d['season'].max(), 'week'].max())}"
        return m

    def project(self, d: pd.DataFrame) -> pd.DataFrame:
        d = structural(pd.concat([d.reset_index(drop=True), self.team.predict(d.reset_index(drop=True))], axis=1))
        out = d[["player_id", "name", "position", "team", "opp", "game_id"]].copy()
        for stat, (pos, scol) in STATS.items():
            s_proj = d[scol]
            pred = np.clip(self.calibrators[stat].predict(cal_matrix(d, s_proj)), 0.2, 3.0) * s_proj.clip(lower=0.25)
            pred = apply_recal(pred, getattr(self, "recal", {}).get(stat))
            out[stat] = np.where(d["position"].isin(pos), pred, np.nan)
            out[f"{stat}_struct"] = np.where(d["position"].isin(pos), s_proj, np.nan)
        return out

    def dist(self, stat: str, position: str) -> RatioDistribution | None:
        d = self.dists.get(stat)
        if not d:
            return None
        return d.get(position, d["_all"])

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            pickle.dump(self, fh)
        path.with_suffix(".json").write_text(json.dumps({"trained_through": self.trained_through, "metrics": self.metrics},
                                                         indent=2, default=float))

    @staticmethod
    def load(path: Path) -> "PropModel":
        with open(path, "rb") as fh:
            return pickle.load(fh)


def walk_forward(d: pd.DataFrame, seasons) -> dict:
    """Out-of-sample projections for each season (models trained on earlier seasons only)."""
    out = {stat: [] for stat in STATS}
    for s in seasons:
        tr = d[(d["season"] < s)]
        te = d[d["season"] == s]
        if tr.empty or te.empty:
            continue
        m = PropModel.train(tr)
        proj = m.project(te)
        te = te.reset_index(drop=True)
        for stat in STATS:
            ok = eligible(te, stat).to_numpy()
            if not ok.any():
                continue
            rows = pd.DataFrame({"season": s, "game_id": te.loc[ok, "game_id"].to_numpy(),
                                 "player_id": te.loc[ok, "player_id"].to_numpy(),
                                 "position": te.loc[ok, "position"].to_numpy(),
                                 "proj": proj.loc[ok, stat].to_numpy(), "struct": proj.loc[ok, f"{stat}_struct"].to_numpy(),
                                 "naive": _naive(te.loc[ok], stat), "actual": te.loc[ok, stat].to_numpy()})
            out[stat].append(rows)
    return {k: pd.concat(v, ignore_index=True) for k, v in out.items() if v}


def _naive(te: pd.DataFrame, stat: str) -> np.ndarray:
    """Baseline: the player's own recency-weighted average of the stat (what a casual bettor looks at)."""
    col = {"receptions": "receptions_ew", "receiving_yards": "receiving_yards_ew", "targets": "tgt_ew",
           "carries": "carries_ew", "rushing_yards": "rushing_yards_ew", "attempts": "attempts_ew",
           "completions": "completions_ew", "passing_yards": "passing_yards_ew", "passing_tds": "passing_tds_ew"}.get(stat)
    if stat == "rush_rec_yards":
        return (te["rushing_yards_ew"].fillna(0) + te["receiving_yards_ew"].fillna(0)).to_numpy()
    return te[col].fillna(0).to_numpy() if col in te else np.zeros(len(te))
