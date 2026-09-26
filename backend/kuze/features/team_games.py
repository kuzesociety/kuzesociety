"""Aggregate play-by-play into one row per (game, offense) with efficiency, style and pace stats."""
from __future__ import annotations

import numpy as np
import pandas as pd

from kuze.features.pbp_prep import normalize_team

TD_POINTS = 6.95  # TD + expected PAT


def _drive_stats(pbp: pd.DataFrame) -> pd.DataFrame:
    d = pbp[pbp["posteam"].notna() & pbp["fixed_drive"].notna()]
    drives = d.groupby(["game_id", "posteam", "fixed_drive"]).agg(
        result=("fixed_drive_result", "last"),
        min_yl=("yardline_100", "min"),
    ).reset_index()
    drives["td"] = (drives["result"] == "Touchdown").astype(int)
    drives["fg"] = (drives["result"] == "Field goal").astype(int)
    drives["rz"] = (drives["min_yl"] <= 20).astype(int)
    drives["rz_td"] = drives["rz"] * drives["td"]
    drives["pts"] = drives["td"] * TD_POINTS + drives["fg"] * 3
    drives = drives[~drives["result"].isin(["End of half"]) | (drives["rz"] == 1)]
    return drives.groupby(["game_id", "posteam"]).agg(
        drives=("fixed_drive", "size"), drive_pts=("pts", "sum"), tds=("td", "sum"),
        fgs=("fg", "sum"), rz_trips=("rz", "sum"), rz_tds=("rz_td", "sum"),
    ).reset_index()


def _special_teams(pbp: pd.DataFrame) -> pd.DataFrame:
    st = pbp[pbp["play_type"].isin(["kickoff", "punt", "field_goal", "extra_point"]) & pbp["epa"].notna()]
    off = st.groupby(["game_id", "posteam"])["epa"].sum().rename("st_pos")
    de = st.groupby(["game_id", "defteam"])["epa"].sum().rename("st_def")
    off.index.names = de.index.names = ["game_id", "team"]
    out = pd.concat([off, de], axis=1).fillna(0)
    out["st_epa"] = out["st_pos"] - out["st_def"]
    return out[["st_epa"]].reset_index()


def _pace(plays: pd.DataFrame) -> pd.DataFrame:
    p = plays.sort_values(["game_id", "play_id"])
    nxt = p.groupby(["game_id", "fixed_drive"])["game_seconds_remaining"].shift(-1)
    gap = pd.to_numeric(p["game_seconds_remaining"], errors="coerce") - pd.to_numeric(nxt, errors="coerce")
    ok = (p["neutral"] == 1) & gap.between(5, 60)
    tmp = p.loc[ok, ["game_id", "posteam"]].assign(gap=gap[ok])
    return tmp.groupby(["game_id", "posteam"]).agg(neutral_sec=("gap", "sum"), neutral_gaps=("gap", "size")).reset_index()


def build_team_games(raw_pbp: pd.DataFrame, plays: pd.DataFrame, schedules: pd.DataFrame) -> pd.DataFrame:
    """One row per game and offense. Sums (not rates) so they can be pooled with weights later."""
    p = plays
    g = p.groupby(["game_id", "posteam"])
    f = pd.DataFrame({
        "plays": g.size(),
        "n_pass": g["is_pass"].sum(),
        "n_rush": g["is_rush"].sum(),
        "epa": g["epa"].sum(),
        "success": g["success"].sum(),
        "explosive": g["explosive"].sum(),
        "turnovers": g["turnover"].sum(),
        "sacks": g["sack"].sum(),
        "qb_hits": g["qb_hit"].sum(),
        "ints": g["interception"].sum(),
        "fumbles": g["fumble"].sum(),
        "fumbles_lost": g["fumble_lost"].sum(),
    })
    pp = p[p["is_pass"] == 1].groupby(["game_id", "posteam"])
    f["pass_epa"] = pp["epa"].sum()
    f["pass_epa_nto"] = pp["epa_nto"].sum()
    f["pass_nto_n"] = pp["epa_nto"].count()
    f["pass_success"] = pp["success"].sum()
    f["pass_explosive"] = pp["explosive"].sum()
    f["cpoe_sum"] = pp["cpoe"].sum()
    f["cpoe_n"] = pp["cpoe"].count()
    rp = p[p["is_rush"] == 1].groupby(["game_id", "posteam"])
    f["rush_epa"] = rp["epa"].sum()
    f["rush_epa_nto"] = rp["epa_nto"].sum()
    f["rush_nto_n"] = rp["epa_nto"].count()
    f["rush_success"] = rp["success"].sum()
    f["rush_explosive"] = rp["explosive"].sum()
    ed = p[p["early_down"] == 1].groupby(["game_id", "posteam"])
    f["early_epa"] = ed["epa"].sum()
    f["early_n"] = ed.size()
    f["early_success"] = ed["success"].sum()
    nt = p[p["neutral"] == 1].groupby(["game_id", "posteam"])
    f["neutral_n"] = nt.size()
    f["neutral_pass"] = nt["is_pass"].sum()
    f["proe_sum"] = nt["pass_oe"].sum()
    f["proe_n"] = nt["pass_oe"].count()
    rz = p[p["red_zone"] == 1].groupby(["game_id", "posteam"])
    f["rz_epa"] = rz["epa"].sum()
    f["rz_n"] = rz.size()
    td3 = p[p["third_down"] == 1].groupby(["game_id", "posteam"])
    f["third_n"] = td3.size()
    f["third_conv"] = td3["first_down"].sum()
    f = f.fillna(0).reset_index()

    f = f.merge(_drive_stats(raw_pbp.assign(posteam=normalize_team(raw_pbp["posteam"]))), on=["game_id", "posteam"], how="left")
    f = f.merge(_pace(p), on=["game_id", "posteam"], how="left")
    st = _special_teams(raw_pbp.assign(posteam=normalize_team(raw_pbp["posteam"]), defteam=normalize_team(raw_pbp["defteam"])))
    f = f.merge(st.rename(columns={"team": "posteam"}), on=["game_id", "posteam"], how="left")

    games = schedules[["game_id", "season", "week", "game_type", "gameday", "home_team", "away_team",
                       "home_score", "away_score", "location"]].copy()
    games["home_team"] = normalize_team(games["home_team"])
    games["away_team"] = normalize_team(games["away_team"])
    f = f.merge(games, on="game_id", how="inner")
    f["defteam"] = np.where(f["posteam"] == f["home_team"], f["away_team"], f["home_team"])
    f["is_home"] = ((f["posteam"] == f["home_team"]) & (f["location"] != "Neutral")).astype(int)
    f["is_away"] = ((f["posteam"] == f["away_team"]) & (f["location"] != "Neutral")).astype(int)
    f["points"] = np.where(f["posteam"] == f["home_team"], f["home_score"], f["away_score"])
    f["points_allowed"] = np.where(f["posteam"] == f["home_team"], f["away_score"], f["home_score"])
    num = f.select_dtypes("number").columns
    f[num] = f[num].fillna(0)
    return f.rename(columns={"posteam": "team", "defteam": "opp"})
