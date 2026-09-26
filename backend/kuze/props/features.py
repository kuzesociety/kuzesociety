"""Pre-game usage / efficiency features for every player-game (only earlier games are used).

Shares are recency-weighted (half-life in games, extra decay across the off-season) and
shrunk toward position priors, so one big week can't dominate: "Do not recommend a prop simply
because a player recently hit it."
"""
from __future__ import annotations

import numpy as np
import pandas as pd

HALF_LIFE_WEEKS = 4.0
SEASON_WEEKS = 30  # 'football time': ~8 extra weeks of decay across an off-season

# prior pseudo-observations (games) and prior values by position for shrinkage
SHARE_PRIOR_GAMES = 2.0
POS_PRIOR = {
    "WR": {"tgt_share": 0.12, "catch_rate": 0.64, "ypt": 8.2, "ypc": 5.5, "carry_share": 0.01, "rz_tgt_share": 0.11,
           "ez_share": 0.12, "i5_share": 0.0, "snap": 0.6},
    "TE": {"tgt_share": 0.10, "catch_rate": 0.70, "ypt": 7.0, "ypc": 4.0, "carry_share": 0.0, "rz_tgt_share": 0.12,
           "ez_share": 0.12, "i5_share": 0.0, "snap": 0.55},
    "RB": {"tgt_share": 0.08, "catch_rate": 0.78, "ypt": 6.0, "ypc": 4.2, "carry_share": 0.35, "rz_tgt_share": 0.07,
           "ez_share": 0.03, "i5_share": 0.35, "snap": 0.45},
    "QB": {"tgt_share": 0.0, "catch_rate": 0.0, "ypt": 0.0, "ypc": 4.5, "carry_share": 0.10, "rz_tgt_share": 0.0,
           "ez_share": 0.0, "i5_share": 0.12, "snap": 0.95},
    "FB": {"tgt_share": 0.02, "catch_rate": 0.75, "ypt": 6.0, "ypc": 3.5, "carry_share": 0.02, "rz_tgt_share": 0.02,
           "ez_share": 0.02, "i5_share": 0.05, "snap": 0.2},
}
EFF_PRIOR_N = {"catch_rate": 25.0, "ypt": 40.0, "ypc": 60.0, "ypa": 150.0, "comp": 150.0}


def _ftime(season, week):
    return pd.to_datetime("2000-01-02") + pd.to_timedelta((np.asarray(season) * SEASON_WEEKS + np.asarray(week)) * 7, unit="D")


def _ewm_prev(df: pd.DataFrame, key: str, cols: list[str], half_life_weeks: float = HALF_LIFE_WEEKS) -> pd.DataFrame:
    """EWMA of each column over *previous* rows of the same key (time-aware)."""
    out = pd.DataFrame(index=df.index)
    hl = pd.Timedelta(days=7 * half_life_weeks)
    for col in cols:
        def f(g):
            s = g[col].shift()
            t = g["_t"]
            if s.notna().sum() == 0:
                return pd.Series(np.nan, index=g.index)
            return s.ewm(halflife=hl, times=t, ignore_na=True).mean()
        out[col] = df.groupby(key, group_keys=False)[[col, "_t"]].apply(f)
    return out


def _count_prev(df: pd.DataFrame, key: str, col: str) -> pd.Series:
    return df.groupby(key)[col].transform(lambda s: s.shift().fillna(0).cumsum())


def player_features(pg: pd.DataFrame) -> pd.DataFrame:
    """Add pre-game usage/efficiency features to player-game rows (sorted by time within player)."""
    d = pg.sort_values(["player_id", "season", "week"]).copy()
    d["_t"] = _ftime(d["season"], d["week"])
    played = (d["offense_snaps"].fillna(1) > 0) | (d["tgt"] + d["designed"] + d["attempts"] > 0)
    d["_played"] = played.astype(float)
    # numerators / denominators at game level
    base_cols = ["tgt", "team_targets", "air_yards", "team_air_yards", "rz_tgt", "team_rz_tgt", "i10_tgt", "team_i10_tgt",
                 "ez_tgt", "team_ez_tgt", "designed", "team_designed", "rz_car", "team_rz_car", "i5_car", "team_i5_car",
                 "receptions", "receiving_yards", "carries", "rushing_yards", "attempts", "completions", "passing_yards",
                 "passing_tds", "passing_interceptions", "offense_pct", "team_pass_att", "rushing_tds", "receiving_tds",
                 "fumbles_lost", "deep_tgt", "third_tgt"]
    for c in base_cols:
        if c not in d:
            d[c] = 0.0
        # rows where the player did not play shouldn't dilute shares
        d[c + "_p"] = np.where(d["_played"] > 0, d[c], np.nan)
    ew = _ewm_prev(d, "player_id", [c + "_p" for c in base_cols])
    ew.columns = [c[:-2] + "_ew" for c in ew.columns]   # "<col>_p" -> "<col>_ew"
    d = pd.concat([d, ew], axis=1)
    d["games_prev"] = _count_prev(d, "player_id", "_played")
    d["tgt_prev_total"] = _count_prev(d, "player_id", "tgt")
    d["car_prev_total"] = _count_prev(d, "player_id", "designed")
    d["att_prev_total"] = _count_prev(d, "player_id", "attempts")

    def share(num, den, prior_key):
        prior = d["position"].map(lambda p: POS_PRIOR.get(p, POS_PRIOR["WR"])[prior_key])
        n = d["games_prev"].clip(upper=20)
        raw = d[num + "_ew"] / d[den + "_ew"].replace(0, np.nan)
        raw = raw.fillna(prior)
        return (raw * n + prior * SHARE_PRIOR_GAMES) / (n + SHARE_PRIOR_GAMES)

    d["f_tgt_share"] = share("tgt", "team_targets", "tgt_share")
    d["f_air_share"] = share("air_yards", "team_air_yards", "tgt_share")
    d["f_rz_tgt_share"] = share("rz_tgt", "team_rz_tgt", "rz_tgt_share")
    d["f_i10_share"] = share("i10_tgt", "team_i10_tgt", "rz_tgt_share")
    d["f_ez_share"] = share("ez_tgt", "team_ez_tgt", "ez_share")
    d["f_carry_share"] = share("designed", "team_designed", "carry_share")
    d["f_rz_car_share"] = share("rz_car", "team_rz_car", "carry_share")
    d["f_i5_share"] = share("i5_car", "team_i5_car", "i5_share")
    d["f_snap"] = d["offense_pct_ew"].fillna(d["position"].map(lambda p: POS_PRIOR.get(p, POS_PRIOR["WR"])["snap"]))

    def ratio(num_ew, den_ew, min_den=0.5):
        # an EWMA denominator decays toward 0 for someone who hasn't had the opportunity in a long time;
        # below min_den per game the ratio is noise (a QB with one old target had 10 million yds/target)
        return d[num_ew] / d[den_ew].where(d[den_ew] >= min_den)

    def eff(num_ew, den_ew, prior_key, n_prior, prev_total, bounds, pos_default=None):
        prior = d["position"].map(lambda p: POS_PRIOR.get(p, POS_PRIOR["WR"])[prior_key]) if pos_default is None else pos_default
        raw = ratio(num_ew, den_ew).clip(*bounds).fillna(prior)
        n = d[prev_total].clip(upper=300)
        return (raw * n + prior * n_prior) / (n + n_prior)

    d["f_catch_rate"] = eff("receptions_ew", "tgt_ew", "catch_rate", EFF_PRIOR_N["catch_rate"], "tgt_prev_total", (0.0, 1.0))
    d["f_ypt"] = eff("receiving_yards_ew", "tgt_ew", "ypt", EFF_PRIOR_N["ypt"], "tgt_prev_total", (-2.0, 25.0))
    d["f_ypc"] = eff("rushing_yards_ew", "carries_ew", "ypc", EFF_PRIOR_N["ypc"], "car_prev_total", (-2.0, 12.0))
    d["f_adot"] = ratio("air_yards_ew", "tgt_ew").clip(-5.0, 30.0).fillna(8.0)
    d["f_ypa"] = eff("passing_yards_ew", "attempts_ew", "ypt", EFF_PRIOR_N["ypa"], "att_prev_total", (2.0, 12.0),
                     pos_default=6.6)
    d["f_comp"] = eff("completions_ew", "attempts_ew", "ypt", EFF_PRIOR_N["comp"], "att_prev_total", (0.3, 0.85),
                      pos_default=0.63)
    d["f_att_pg"] = d["attempts_ew"].fillna(0)
    d["f_qb_car_pg"] = d["carries_ew"].fillna(0)
    d["f_td_rate_rec"] = ratio("receiving_tds_ew", "tgt_ew").clip(0.0, 0.5).fillna(0.04)
    d["f_deep_share"] = ratio("deep_tgt_ew", "tgt_ew").clip(0.0, 1.0).fillna(0.1)
    d["f_fumble_rate"] = (d["fumbles_lost_ew"] / (d["tgt_ew"] + d["carries_ew"]).where(lambda x: x >= 0.5)).clip(0, 0.2).fillna(0.005)
    drop = [c for c in d.columns if c.endswith("_p")]
    return d.drop(columns=drop)


def team_features(tg: pd.DataFrame) -> pd.DataFrame:
    """Recency-weighted team volume (offense) and what the defense allows, entering each game."""
    t = tg.copy()
    t["season"] = t["game_id"].str.slice(0, 4).astype(int)
    t = t.sort_values(["team", "season", "week"])
    t["_t"] = _ftime(t["season"], t["week"])
    cols = ["team_pass_att", "team_targets", "team_designed", "team_plays", "team_dropbacks", "team_pass_td", "team_rush_td",
            "team_air_yards", "team_rz_tgt", "team_rz_car"]
    ew = _ewm_prev(t, "team", cols, half_life_weeks=6.0)
    for c in cols:
        t[f"tf_{c}"] = ew[c]
    # defense: what opponents did against this team
    opp = tg[["game_id", "team"] + cols].rename(columns={"team": "opp_of"})
    pairs = tg[["game_id", "team"]].merge(tg[["game_id", "team"]].rename(columns={"team": "opp"}), on="game_id")
    pairs = pairs[pairs["team"] != pairs["opp"]]
    allowed = pairs.merge(opp, left_on=["game_id", "opp"], right_on=["game_id", "opp_of"]).drop(columns=["opp_of"])
    allowed = allowed.merge(t[["game_id", "team", "season", "week", "_t"]], on=["game_id", "team"])
    allowed = allowed.sort_values(["team", "season", "week"])
    ew2 = _ewm_prev(allowed, "team", cols, half_life_weeks=6.0)
    for c in cols:
        allowed[f"ta_{c}"] = ew2[c]
    t = t.merge(allowed[["game_id", "team"] + [f"ta_{c}" for c in cols]], on=["game_id", "team"], how="left")
    t = t.merge(pairs, on=["game_id", "team"], how="left")
    return t


def defense_vs_position(pg: pd.DataFrame) -> pd.DataFrame:
    """Per (defense, game): recency-weighted yards/target, catch rate, TDs allowed to WR/TE/RB, ypc allowed."""
    rows = []
    for pos in ("WR", "TE", "RB"):
        x = pg[pg["position"] == pos].groupby(["game_id", "opp", "season", "week"]).agg(
            tgt=("tgt", "sum"), rec=("receptions", "sum"), yds=("receiving_yards", "sum"), td=("receiving_tds", "sum"),
            car=("carries", "sum"), ryd=("rushing_yards", "sum"), rtd=("rushing_tds", "sum")).reset_index()
        x["pos"] = pos
        rows.append(x)
    q = pg[pg["position"] == "QB"].groupby(["game_id", "opp", "season", "week"]).agg(
        att=("attempts", "sum"), cmp=("completions", "sum"), pyd=("passing_yards", "sum"), ptd=("passing_tds", "sum")).reset_index()
    d = pd.concat(rows, ignore_index=True)
    d = d.sort_values(["opp", "pos", "season", "week"])
    d["_t"] = _ftime(d["season"], d["week"])
    d["_key"] = d["opp"] + "_" + d["pos"]
    ew = _ewm_prev(d, "_key", ["tgt", "rec", "yds", "td", "car", "ryd", "rtd"], half_life_weeks=8.0)
    d = pd.concat([d[["game_id", "opp", "pos", "season", "week"]], ew.add_prefix("dv_")], axis=1)
    q = q.sort_values(["opp", "season", "week"])
    q["_t"] = _ftime(q["season"], q["week"])
    ewq = _ewm_prev(q, "opp", ["att", "cmp", "pyd", "ptd"], half_life_weeks=8.0)
    q = pd.concat([q[["game_id", "opp"]], ewq.add_prefix("dq_")], axis=1)
    return d, q
