"""Game model: projected margin and total, plus the market blend that turns them into fair lines.

Two ridge regressions (margin, total) are trained on every completed game since 2006 using
pre-game features only. Their raw projections are NOT used as fair lines directly: the NFL
closing line is extremely efficient, so we estimate - out of sample - how much of the
model's disagreement with the market is real signal (``beta``) and shrink toward the market:

    fair = market + beta(hours_to_kickoff) * (model - market)

beta is larger early in the week (lines still move toward good models) and small at the
close. Everything is re-estimated by the learning loop as new results arrive.
"""
from __future__ import annotations

import datetime as dt
import json
import pickle
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

AV_GROUPS = ["OL", "WR", "TE", "RB", "DL", "LB", "CB", "S"]
MARGIN_FEATURES = ["mkt_spread_prior", "d_pass_epa", "d_rush_epa", "d_ppd", "d_points", "d_st",
                   "d_qb_delta", "d_qb_value", "home_flag"] + [f"d_av_{g}" for g in AV_GROUPS]
TOTAL_FEATURES = ["mkt_total_prior", "s_ppd", "s_points", "s_pass_epa", "s_rush_epa", "s_pace", "s_plays",
                  "s_proe", "wind_hi", "cold", "indoor", "s_qb_delta", "s_qb_value"] + [f"s_av_{g}" for g in AV_GROUPS]
FIRST_TRAIN_SEASON = 2006
BLEND_HALF_LIFE_SEASONS = 4.0


def prepare(features: pd.DataFrame) -> pd.DataFrame:
    f = features.copy()
    f["home_flag"] = 1.0 - f["neutral"].fillna(0)
    f["s_qb_value"] = f["home_qb_value"] + f["away_qb_value"]
    for g in AV_GROUPS:  # availability only exists from 2012 (snap counts); 0 = no information
        for p in ("d_av_", "s_av_"):
            if p + g not in f:
                f[p + g] = 0.0
            f[p + g] = f[p + g].fillna(0.0)
    return f


def _fit_pipe(X: pd.DataFrame, y: pd.Series, alpha: float = 10.0) -> Pipeline:
    return make_pipeline(StandardScaler(), Ridge(alpha=alpha)).fit(X.fillna(0.0), y)


@dataclass
class Blend:
    spread_close: float = 0.12
    spread_early: float = 0.30
    total_close: float = 0.20
    total_early: float = 0.30
    early_hours: float = 96.0   # >= this many hours before kickoff -> "early" beta
    close_hours: float = 3.0    # <= this -> "close" beta

    def beta(self, market: str, hours_to_kickoff: float | None) -> float:
        early = self.spread_early if market == "spread" else self.total_early
        close = self.spread_close if market == "spread" else self.total_close
        if hours_to_kickoff is None:
            return close
        h = float(np.clip(hours_to_kickoff, self.close_hours, self.early_hours))
        t = (h - self.close_hours) / (self.early_hours - self.close_hours)
        return close + t * (early - close)


@dataclass
class GameModel:
    margin_pipe: Pipeline | None = None
    total_pipe: Pipeline | None = None
    blend: Blend = field(default_factory=Blend)
    margin_resid_sd: float = 13.0
    total_resid_sd: float = 13.3
    trained_through: str = ""
    version: str = ""
    backtest: dict = field(default_factory=dict)

    # ------------------------------------------------------------------ training
    @classmethod
    def train(cls, features: pd.DataFrame, through: tuple[int, int] | None = None, alpha: float = 10.0) -> "GameModel":
        f = prepare(features)
        done = f[f["result"].notna() & f["total"].notna() & (f["season"] >= FIRST_TRAIN_SEASON)]
        if through is not None:
            s, w = through
            done = done[(done["season"] < s) | ((done["season"] == s) & (done["week"] <= w))]
        m = cls()
        m.margin_pipe = _fit_pipe(done[MARGIN_FEATURES], done["result"], alpha)
        m.total_pipe = _fit_pipe(done[TOTAL_FEATURES], done["total"], alpha)
        last = done.sort_values(["season", "week"]).iloc[-1]
        m.trained_through = f"{int(last['season'])} wk{int(last['week'])}"
        m.version = dt.datetime.utcnow().strftime("%Y%m%d%H%M")
        return m

    # ------------------------------------------------------------------ inference
    def predict(self, features: pd.DataFrame) -> pd.DataFrame:
        f = prepare(features)
        out = f[["game_id"]].copy()
        out["model_margin"] = self.margin_pipe.predict(f[MARGIN_FEATURES].fillna(0.0))
        out["model_total"] = self.total_pipe.predict(f[TOTAL_FEATURES].fillna(0.0))
        out["model_home_pts"] = (out["model_total"] + out["model_margin"]) / 2
        out["model_away_pts"] = (out["model_total"] - out["model_margin"]) / 2
        return out

    def contributions(self, features_row: pd.Series, kind: str = "margin") -> dict[str, float]:
        """Per-feature contribution (points) to the raw projection, for explanation in the UI."""
        pipe = self.margin_pipe if kind == "margin" else self.total_pipe
        cols = MARGIN_FEATURES if kind == "margin" else TOTAL_FEATURES
        row = prepare(features_row.to_frame().T)
        x = row[cols].astype(float).fillna(0.0).to_numpy()[0]
        scaler, ridge = pipe.named_steps["standardscaler"], pipe.named_steps["ridge"]
        z = (x - scaler.mean_) / scaler.scale_
        return {c: float(v) for c, v in zip(cols, z * ridge.coef_)} | {"intercept": float(ridge.intercept_)}

    def coef_points(self, feature: str, kind: str = "margin") -> float:
        """Points per unit of a raw feature (ridge coefficient / feature scale)."""
        pipe = self.margin_pipe if kind == "margin" else self.total_pipe
        cols = MARGIN_FEATURES if kind == "margin" else TOTAL_FEATURES
        if feature not in cols:
            return 0.0
        i = cols.index(feature)
        return float(pipe.named_steps["ridge"].coef_[i] / pipe.named_steps["standardscaler"].scale_[i])

    def fair_lines(self, model_margin: float, model_total: float, market_margin: float | None,
                   market_total: float | None, hours_to_kickoff: float | None) -> dict:
        """Blend the raw projection with the current market into the fair expected margin/total."""
        if market_margin is None or np.isnan(market_margin):
            fair_margin, b_s = model_margin, 1.0
        else:
            b_s = self.blend.beta("spread", hours_to_kickoff)
            fair_margin = market_margin + b_s * (model_margin - market_margin)
        if market_total is None or np.isnan(market_total):
            fair_total, b_t = model_total, 1.0
        else:
            b_t = self.blend.beta("total", hours_to_kickoff)
            fair_total = market_total + b_t * (model_total - market_total)
        return {"fair_margin": float(fair_margin), "fair_total": float(fair_total), "beta_spread": b_s, "beta_total": b_t}

    # ------------------------------------------------------------------ persistence
    def save(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            pickle.dump(self, fh)
        meta = {"version": self.version, "trained_through": self.trained_through, "blend": self.blend.__dict__,
                "margin_resid_sd": self.margin_resid_sd, "total_resid_sd": self.total_resid_sd,
                "backtest": self.backtest}
        path.with_suffix(".json").write_text(json.dumps(meta, indent=2, default=float))
        return path

    @staticmethod
    def load(path: Path) -> "GameModel":
        with open(path, "rb") as fh:
            return pickle.load(fh)


# ---------------------------------------------------------------------- backtesting
def add_market_means(df: pd.DataFrame, km=None) -> pd.DataFrame:
    """Market-implied expected margin / total (no-vig, key-number aware) for each game."""
    from kuze.models.distributions import KeyNumberModel
    from kuze.models.market import implied_margin_from_spread, implied_total
    km = km or KeyNumberModel.load()
    d = df.copy()
    def f(x):
        return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)
    d["mkt_margin"] = [implied_margin_from_spread(km, -r.spread_line, f(r.home_spread_odds), f(r.away_spread_odds))
                       if r.spread_line == r.spread_line else np.nan for r in d.itertuples()]
    d["mkt_total"] = [implied_total(km, r.total_line, f(r.over_odds), f(r.under_odds))
                      if r.total_line == r.total_line else np.nan for r in d.itertuples()]
    return d


def walk_forward(features: pd.DataFrame, test_seasons, alpha: float = 10.0) -> pd.DataFrame:
    """Train on every season before s, predict season s. Returns out-of-sample predictions."""
    f = prepare(features)
    done = f[f["result"].notna() & f["total"].notna()]
    out = []
    for s in test_seasons:
        tr = done[(done["season"] < s) & (done["season"] >= FIRST_TRAIN_SEASON)]
        te = done[done["season"] == s]
        if tr.empty or te.empty:
            continue
        mp = _fit_pipe(tr[MARGIN_FEATURES], tr["result"], alpha)
        tp = _fit_pipe(tr[TOTAL_FEATURES], tr["total"], alpha)
        out.append(te[["game_id", "season", "week", "home_team", "away_team", "result", "total", "spread_line",
                       "total_line", "home_moneyline", "away_moneyline", "home_spread_odds", "away_spread_odds",
                       "over_odds", "under_odds"]]
                   .assign(model_margin=mp.predict(te[MARGIN_FEATURES].fillna(0.0)),
                           model_total=tp.predict(te[TOTAL_FEATURES].fillna(0.0))))
    return pd.concat(out, ignore_index=True)


def weighted_slope(edge: np.ndarray, resid: np.ndarray, w: np.ndarray) -> tuple[float, float]:
    """Weighted LS slope of resid on edge (with intercept) and its standard error."""
    W = w / w.sum()
    em, rm = (W * edge).sum(), (W * resid).sum()
    sxx = (W * (edge - em) ** 2).sum()
    b = (W * (edge - em) * (resid - rm)).sum() / sxx
    e = resid - rm - b * (edge - em)
    n_eff = w.sum() ** 2 / (w ** 2).sum()
    se = np.sqrt((W * e ** 2).sum() / (sxx * n_eff))
    return float(b), float(se)


def estimate_blend(oos: pd.DataFrame, midweek_lines: dict[str, float] | None = None,
                   ref_season: int | None = None) -> tuple[Blend, dict]:
    """Estimate beta at the close (recency-weighted) and early in the week (via midweek lines)."""
    ref_season = ref_season or int(oos["season"].max())
    d = oos if "mkt_margin" in oos else add_market_means(oos)
    d = d[d["mkt_margin"].notna() & d["mkt_total"].notna()]
    w = np.power(0.5, (ref_season - d["season"].to_numpy(float)) / BLEND_HALF_LIFE_SEASONS)
    b_sc, se_sc = weighted_slope((d.model_margin - d.mkt_margin).to_numpy(), (d.result - d.mkt_margin).to_numpy(), w)
    b_tc, se_tc = weighted_slope((d.model_total - d.mkt_total).to_numpy(), (d.total - d.mkt_total).to_numpy(), w)
    report = {"spread_close_beta": b_sc, "spread_close_se": se_sc, "total_close_beta": b_tc, "total_close_se": se_tc}
    ratio = 2.0
    if midweek_lines:
        mw = d[d["game_id"].isin(midweek_lines)].copy()
        if len(mw) > 300:
            mw["mid"] = mw["game_id"].map(midweek_lines)
            ones = np.ones(len(mw))
            b_mid, se_mid = weighted_slope((mw.model_margin - mw.mid).to_numpy(), (mw.result - mw.mid).to_numpy(), ones)
            b_cl_same, _ = weighted_slope((mw.model_margin - mw.spread_line).to_numpy(), (mw.result - mw.spread_line).to_numpy(), ones)
            ratio = float(np.clip(b_mid / max(b_cl_same, 0.05), 1.0, 3.0))
            report.update({"spread_mid_beta_2013_2020": b_mid, "spread_mid_se": se_mid,
                           "spread_close_beta_same_games": b_cl_same, "early_close_ratio": ratio})
    # shrink the estimates (noisy) toward conservative priors, never below 0 / above 0.6
    prior_close_s, prior_close_t, k = 0.10, 0.15, 1.0
    def shrink(b, se, prior):
        wgt = 1.0 / (se ** 2) if se > 0 else 0.0
        pw = 1.0 / (0.08 ** 2) * k
        return float(np.clip((b * wgt + prior * pw) / (wgt + pw), 0.0, 0.6))
    sc = shrink(b_sc, se_sc, prior_close_s)
    tc = shrink(b_tc, se_tc, prior_close_t)
    blend = Blend(spread_close=sc, spread_early=float(np.clip(sc * ratio, sc, 0.6)),
                  total_close=tc, total_early=float(np.clip(tc * min(ratio, 1.5), tc, 0.6)))
    report["blend"] = blend.__dict__
    return blend, report


def backtest_summary(oos: pd.DataFrame, blend: Blend) -> dict:
    """ATS / O-U record and error metrics of the blended fair lines vs closing lines, by season."""
    d = oos.copy()
    d["fair_margin"] = d.spread_line + blend.spread_close * (d.model_margin - d.spread_line)
    d["fair_total"] = d.total_line + blend.total_close * (d.model_total - d.total_line)
    rows = []
    for s, g in d.groupby("season"):
        e = g.model_margin - g.spread_line
        r = g.result - g.spread_line
        te = g.model_total - g.total_line
        tr = g.total - g.total_line
        rec = {"season": int(s), "games": int(len(g)),
               "mae_model": float((g.result - g.model_margin).abs().mean()),
               "mae_line": float(r.abs().mean()),
               "mae_fair": float((g.result - g.fair_margin).abs().mean()),
               "total_mae_model": float((g.total - g.model_total).abs().mean()),
               "total_mae_line": float(tr.abs().mean())}
        for thr in (2, 3):
            pick = e.abs() >= thr
            o = np.sign(r[pick])
            rec[f"ats_w_{thr}"] = int(((np.sign(e[pick]) == o) & (o != 0)).sum())
            rec[f"ats_n_{thr}"] = int((o != 0).sum())
            pick = te.abs() >= thr
            o = np.sign(tr[pick])
            rec[f"ou_w_{thr}"] = int(((np.sign(te[pick]) == o) & (o != 0)).sum())
            rec[f"ou_n_{thr}"] = int((o != 0).sum())
        rows.append(rec)
    return {"by_season": rows}


def midweek_summary(oos: pd.DataFrame, midweek: dict, thr: float = 3.0) -> dict | None:
    """Disagreements of thr+ points with the Wednesday line (Westgate SuperContest, 2013-2020): the hit
    rate against that line and against the close for the same games, and whether the market moved toward
    the model by kickoff (the closing-line value a bettor would have captured by betting early)."""
    d = oos.assign(mid=oos["game_id"].map(midweek)).dropna(subset=["mid", "result"])
    if d.empty:
        return None
    e = d["model_margin"] - d["mid"]
    pick = d[e.abs() >= thr]
    side = np.sign(e[e.abs() >= thr])

    def record(line: str) -> tuple[int, int]:
        o = np.sign(pick["result"] - pick[line]) * side
        return int((o > 0).sum()), int((o != 0).sum())

    w_mid, n_mid = record("mid")
    w_close, n_close = record("spread_line")
    move = (pick["spread_line"] - pick["mid"]) * side
    return {"seasons": f"{int(d['season'].min())}-{int(d['season'].max())}", "threshold": thr,
            "w_mid": w_mid, "n_mid": n_mid, "w_close": w_close, "n_close": n_close,
            "moved_toward": float((move > 0).mean()), "moved_away": float((move < 0).mean()),
            "avg_move_pts": float(move.mean())}

