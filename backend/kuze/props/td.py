"""Anytime-TD model with the QB Trust / Red-Zone Connection module.

For every TD candidate we measure (recency-weighted, shrunk):
  1. QB-to-player history: targets, red-zone / inside-10 / end-zone targets and TDs from the
     *expected starting QB*, and that QB's share of scoring-area looks going to the player.
  2. QB trust in compressed-field / high-leverage spots: third-down and late-half targets.
  3. Ball security: fumbles lost per touch, catch rate (drops where FTN charting exists).
  4. Contract / role context (APY % of cap) - only as a weak secondary feature, and only if it
     survives out-of-sample testing.
  5. Recent usage outweighs old history when roles change (half-life in games, the QB
     connection only counts games both played).
  6. Opponent: TDs allowed to the position.

The probability model is a boosted classifier on these features plus the team's expected
passing / rushing TDs (from the game line), validated walk-forward against simpler baselines.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from kuze.props.features import _ewm_prev, _ftime

TRUST_HALF_LIFE_WEEKS = 10.0
TRUST_PRIOR_TARGETS = 6.0

TD_FEATURES = ["pos_code", "team_implied", "team_spread", "game_total", "v_team_pass_td", "v_team_rush_td",
               "f_tgt_share_n", "f_carry_share_n", "f_rz_tgt_share_n", "f_i10_share", "f_ez_share_n", "f_i5_share_n",
               "f_rz_car_share", "f_snap", "games_prev", "f_td_rate_rec", "trust_rz_share", "trust_ez_share",
               "trust_td_share", "trust_games", "dv_td", "dv_rtd", "f_adot", "team_qb_value"]


def qb_trust_features(pg: pd.DataFrame, qr: pd.DataFrame, starters: pd.DataFrame) -> pd.DataFrame:
    """Per (game, receiver): how much the expected starting QB has trusted this player near the goal line.

    ``starters``: (game_id, team, qb_id) of the expected starting QB for each team-game.
    Uses only games before the current one and only games where this QB threw to this receiver's team.
    """
    q = qr.copy()
    q["_t"] = _ftime(q["season"], q["week"])
    # totals thrown by each QB per game (denominators)
    qb_tot = q.groupby(["game_id", "qb_id"]).agg(q_rz=("rz_tgt", "sum"), q_ez=("ez_tgt", "sum"), q_td=("td", "sum"),
                                                  q_tgt=("tgt", "sum")).reset_index()
    q = q.merge(qb_tot, on=["game_id", "qb_id"])
    q = q.sort_values(["qb_id", "player_id", "season", "week"])
    q["_key"] = q["qb_id"] + "|" + q["player_id"]
    cols = ["tgt", "rz_tgt", "ez_tgt", "td", "q_rz", "q_ez", "q_td", "q_tgt", "third_tgt", "late_tgt"]
    hl = pd.Timedelta(days=7 * TRUST_HALF_LIFE_WEEKS)
    # cumulative decayed sums *including* each game -> joined to the NEXT game via as-of merge
    agg = []
    for key, g in q.groupby("_key"):
        g = g.sort_values("_t")
        t = g["_t"].to_numpy()
        vals = g[cols].to_numpy(float)
        acc = np.zeros(len(cols))
        last_t = None
        out = np.zeros_like(vals)
        for i in range(len(g)):
            if last_t is not None:
                dt_days = (t[i] - last_t) / np.timedelta64(1, "D")
                acc *= 0.5 ** (dt_days / (7 * TRUST_HALF_LIFE_WEEKS))
            acc = acc + vals[i]
            out[i] = acc
            last_t = t[i]
        df = pd.DataFrame(out, columns=[f"c_{c}" for c in cols])
        df["qb_id"], df["player_id"], df["_t"], df["n_games"] = g["qb_id"].to_numpy(), g["player_id"].to_numpy(), t, np.arange(1, len(g) + 1)
        agg.append(df)
    hist = pd.concat(agg, ignore_index=True).sort_values("_t")
    # attach to player-games whose expected QB is known
    pgs = pg[["game_id", "team", "player_id", "season", "week"]].merge(starters, on=["game_id", "team"], how="left")
    pgs["_t"] = _ftime(pgs["season"], pgs["week"]) - pd.Timedelta(days=1)
    pgs = pgs.dropna(subset=["qb_id"]).sort_values("_t")
    m = pd.merge_asof(pgs, hist, on="_t", by=["qb_id", "player_id"], direction="backward", allow_exact_matches=False)
    k = TRUST_PRIOR_TARGETS
    m["trust_rz_share"] = m["c_rz_tgt"] / (m["c_q_rz"] + k)
    m["trust_ez_share"] = m["c_ez_tgt"] / (m["c_q_ez"] + k)
    m["trust_td_share"] = m["c_td"] / (m["c_q_td"] + k / 2)
    m["trust_tgt_share"] = m["c_tgt"] / (m["c_q_tgt"] + 3 * k)
    m["trust_third"] = m["c_third_tgt"]
    m["trust_late"] = m["c_late_tgt"]
    m["trust_games"] = m["n_games"]
    keep = ["game_id", "player_id", "qb_id", "trust_rz_share", "trust_ez_share", "trust_td_share", "trust_tgt_share",
            "trust_third", "trust_late", "trust_games", "c_rz_tgt", "c_ez_tgt", "c_td", "c_tgt"]
    return m[keep].fillna({c: 0.0 for c in keep if c.startswith(("trust", "c_"))})


def expected_starters(games: pd.DataFrame) -> pd.DataFrame:
    g = games[["game_id", "home_team", "away_team", "home_qb_id", "away_qb_id"]]
    return pd.concat([g.rename(columns={"home_team": "team", "home_qb_id": "qb_id"})[["game_id", "team", "qb_id"]],
                      g.rename(columns={"away_team": "team", "away_qb_id": "qb_id"})[["game_id", "team", "qb_id"]]])


class TDModel:
    def __init__(self):
        self.clf = None
        self.features = TD_FEATURES

    def fit(self, d: pd.DataFrame) -> "TDModel":
        s = d[d["position"].isin(["RB", "WR", "TE", "QB"])]
        w = np.power(0.85, s["season"].max() - s["season"])
        self.clf = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.04, max_leaf_nodes=15,
                                                  min_samples_leaf=100, l2_regularization=1.0)
        self.clf.fit(s[self.features].astype(float), s["any_td"].astype(int), sample_weight=w)
        return self

    def predict(self, d: pd.DataFrame) -> np.ndarray:
        return self.clf.predict_proba(d[self.features].astype(float))[:, 1]


def structural_td_prob(d: pd.DataFrame) -> np.ndarray:
    """Transparent baseline: Poisson with team pass/rush TDs split by scoring-area shares."""
    lam = d["v_team_pass_td"] * (0.5 * d["f_ez_share_n"] + 0.5 * d["f_rz_tgt_share_n"]) + \
        d["v_team_rush_td"] * (0.6 * d["f_i5_share_n"] + 0.4 * d["f_rz_car_share"])
    return 1 - np.exp(-lam.clip(lower=0))


def contract_features(contracts: pd.DataFrame, seasons) -> pd.DataFrame:
    """Per (player, season): APY as % of cap of the contract in force, and draft capital."""
    c = contracts.dropna(subset=["gsis_id"]).copy()
    c = c[c["year_signed"] > 1990]
    c["end"] = c["year_signed"] + c["years"].fillna(1)
    rows = []
    for s in seasons:
        act = c[(c["year_signed"] <= s) & (c["end"] > s)].sort_values("year_signed").drop_duplicates("gsis_id", keep="last")
        rows.append(pd.DataFrame({"player_id": act["gsis_id"], "season": s, "apy_cap_pct": act["apy_cap_pct"],
                                  "draft_overall": act["draft_overall"]}))
    out = pd.concat(rows, ignore_index=True)
    out["draft_overall"] = out["draft_overall"].fillna(300)
    return out
