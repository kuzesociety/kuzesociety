"""Estimate the SGP correlation structure (Gaussian copula loadings) from out-of-sample history.

For every player-game we convert the actual stat to a normal score within its predictive
distribution (PIT -> probit). For every game we do the same for the final margin and total
under the key-number distributions around the closing lines. Loadings = correlations with
the game factors (team-perspective margin, total) and with the team's QB passing factor.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from scipy.stats import norm

from kuze.config import settings
from kuze.data import nflverse as nv
from kuze.features.pbp_prep import normalize_team
from kuze.models.distributions import KeyNumberModel
from kuze.models.market import implied_margin_from_spread, implied_total
from kuze.props import model as PM

STATS = list(PM.STATS)


def pit_scores(o: pd.DataFrame) -> np.ndarray:
    dists = {pos: PM.RatioDistribution.fit(g["proj"].to_numpy(), g["actual"].to_numpy()) for pos, g in o.groupby("position")}
    z = np.empty(len(o))
    for i, (pos, p, a) in enumerate(zip(o["position"], o["proj"], o["actual"])):
        s = dists[pos].samples(p)
        u = (s < a).mean() + 0.5 * (s == a).mean()
        z[i] = norm.ppf(np.clip(u, 0.005, 0.995))
    return z


def main():
    km = KeyNumberModel.load()
    g = nv.load_schedules()
    g = g[(g["season"] >= 2019) & g["result"].notna() & g["spread_line"].notna()].copy()
    for c in ("home_team", "away_team"):
        g[c] = normalize_team(g[c])
    zm, zt = [], []
    for r in g.itertuples():
        mu = implied_margin_from_spread(km, -r.spread_line, r.home_spread_odds, r.away_spread_odds)
        k, p = km.margin_pmf(mu)
        u = p[k < r.result].sum() + 0.5 * p[k == r.result].sum()
        zm.append(norm.ppf(np.clip(u, 0.005, 0.995)))
        tmu = implied_total(km, r.total_line, r.over_odds, r.under_odds)
        t, pt = km.total_pmf(tmu)
        u = pt[t < r.total].sum() + 0.5 * pt[t == r.total].sum()
        zt.append(norm.ppf(np.clip(u, 0.005, 0.995)))
    g["z_margin_home"], g["z_total"] = zm, zt
    gz = g[["game_id", "home_team", "z_margin_home", "z_total"]]
    params = {"stats": {}, "note": "loadings are correlations of normal scores (2019-2025, out-of-sample)"}
    pg = pd.read_parquet(settings.data_dir / "derived" / "props_player_games.parquet")[["game_id", "player_id", "team"]]
    frames = {}
    for stat in STATS:
        o = pd.read_parquet(settings.data_dir / "derived" / f"props_oos_{stat}.parquet").dropna(subset=["proj", "actual"])
        o = o.merge(pg, on=["game_id", "player_id"], how="left").merge(gz, on="game_id")
        o["z"] = pit_scores(o)
        o["z_m"] = np.where(o["team"] == o["home_team"], o["z_margin_home"], -o["z_margin_home"])
        frames[stat] = o
    qb = frames["passing_yards"][["game_id", "team", "z"]].rename(columns={"z": "z_qb"}).drop_duplicates(["game_id", "team"])
    rb_rush = frames["rushing_yards"]
    rb_rush = rb_rush[rb_rush["position"] == "RB"].sort_values("proj").drop_duplicates(["game_id", "team"], keep="last")
    rb_rush = rb_rush[["game_id", "team", "z"]].rename(columns={"z": "z_rb1"})
    for stat, o in frames.items():
        o = o.merge(qb, on=["game_id", "team"], how="left").merge(rb_rush, on=["game_id", "team"], how="left")
        params["stats"][stat] = {}
        for pos, s in o.groupby("position"):
            if len(s) < 500:
                continue
            rec = {"n": int(len(s)), "margin": float(np.corrcoef(s["z"], s["z_m"])[0, 1]),
                   "total": float(np.corrcoef(s["z"], s["z_total"])[0, 1])}
            # team passing factor: partial correlation with the QB's passing-yards score
            if stat != "passing_yards" and s["z_qb"].notna().sum() > 300:
                t = s.dropna(subset=["z_qb"])
                X = np.vstack([t["z_m"], t["z_total"]]).T
                res_p = t["z"] - X @ np.linalg.lstsq(X, t["z"], rcond=None)[0]
                res_q = t["z_qb"] - X @ np.linalg.lstsq(X, t["z_qb"], rcond=None)[0]
                rec["pass_factor"] = float(np.corrcoef(res_p, res_q)[0, 1])
            if stat not in ("rushing_yards",) and s["z_rb1"].notna().sum() > 300:
                t = s.dropna(subset=["z_rb1"])
                X = np.vstack([t["z_m"], t["z_total"]]).T
                res_p = t["z"] - X @ np.linalg.lstsq(X, t["z"], rcond=None)[0]
                res_r = t["z_rb1"] - X @ np.linalg.lstsq(X, t["z_rb1"], rcond=None)[0]
                rec["rush_factor"] = float(np.corrcoef(res_p, res_r)[0, 1])
            params["stats"][stat][pos] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in rec.items()}
            print(stat, pos, params["stats"][stat][pos], flush=True)
    out = settings.data_dir / "sgp_params.json"
    out.write_text(json.dumps(params, indent=1))
    from pathlib import Path
    (Path(__file__).resolve().parents[1] / "kuze" / "props" / "sgp_params.json").write_text(json.dumps(params, indent=1))
    print("wrote", out)


if __name__ == "__main__":
    main()
