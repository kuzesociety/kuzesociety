"""Player-game usage + outcome table (QB / RB / WR / TE) built from play-by-play and official weekly stats.

Usage (shares of team opportunity) is what props should be priced on - the prompt's
"prioritize usage and opportunity over touchdown prediction" - so we measure it directly:
targets, air yards, red-zone / inside-10 / end-zone targets, designed carries, inside-5
carries, snap share, and QB->receiver connections.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from kuze.data import nflverse as nv
from kuze.features.pbp_prep import normalize_team

OUTCOME_COLS = ["attempts", "completions", "passing_yards", "passing_tds", "passing_interceptions", "carries",
                "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds",
                "rushing_fumbles_lost", "receiving_fumbles_lost", "sack_fumbles_lost"]
SKILL = {"QB", "RB", "WR", "TE", "FB"}


def _pbp_usage(raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    p = raw[raw["posteam"].notna() & raw["epa"].notna()].copy()
    p["posteam"] = normalize_team(p["posteam"])
    for c in ("pass", "rush", "qb_scramble", "sack", "qb_spike", "qb_kneel", "touchdown", "complete_pass",
              "yardline_100", "air_yards", "yards_gained", "pass_touchdown", "rush_touchdown"):
        p[c] = pd.to_numeric(p[c], errors="coerce")
    tgt = p[(p["pass"] == 1) & p["receiver_player_id"].notna() & (p["qb_spike"] != 1)].copy()
    tgt["rz"] = (tgt["yardline_100"] <= 20).astype(int)
    tgt["i10"] = (tgt["yardline_100"] <= 10).astype(int)
    tgt["ez"] = (tgt["air_yards"].fillna(-99) >= tgt["yardline_100"]).astype(int)
    tgt["deep"] = (tgt["air_yards"].fillna(0) >= 20).astype(int)
    tgt["third"] = (pd.to_numeric(tgt["down"], errors="coerce") == 3).astype(int)
    tgt["late"] = ((pd.to_numeric(tgt["half_seconds_remaining"], errors="coerce") <= 120)).astype(int)
    rec = tgt.groupby(["game_id", "posteam", "receiver_player_id"]).agg(
        tgt=("play_id", "size"), air_yards=("air_yards", "sum"), rz_tgt=("rz", "sum"), i10_tgt=("i10", "sum"),
        ez_tgt=("ez", "sum"), deep_tgt=("deep", "sum"), third_tgt=("third", "sum"),
        rec_td_pbp=("pass_touchdown", "sum")).reset_index().rename(columns={"receiver_player_id": "player_id", "posteam": "team"})
    runs = p[(p["rush"] == 1) & (p["pass"] != 1) & (p["qb_kneel"] != 1) & p["rusher_player_id"].notna()].copy()
    runs["rz"] = (runs["yardline_100"] <= 20).astype(int)
    runs["i5"] = (runs["yardline_100"] <= 5).astype(int)
    ru = runs.groupby(["game_id", "posteam", "rusher_player_id"]).agg(
        designed=("play_id", "size"), rz_car=("rz", "sum"), i5_car=("i5", "sum"),
        rush_td_pbp=("rush_touchdown", "sum")).reset_index().rename(columns={"rusher_player_id": "player_id", "posteam": "team"})
    # team totals
    drop = p[(p["pass"] == 1) & (p["qb_spike"] != 1)]
    team = pd.DataFrame({
        "team_dropbacks": drop.groupby(["game_id", "posteam"]).size(),
        "team_pass_att": drop[(drop["sack"] != 1) & (drop["qb_scramble"] != 1)].groupby(["game_id", "posteam"]).size(),
        "team_targets": tgt.groupby(["game_id", "posteam"]).size(),
        "team_air_yards": tgt.groupby(["game_id", "posteam"])["air_yards"].sum(),
        "team_rz_tgt": tgt.groupby(["game_id", "posteam"])["rz"].sum(),
        "team_i10_tgt": tgt.groupby(["game_id", "posteam"])["i10"].sum(),
        "team_ez_tgt": tgt.groupby(["game_id", "posteam"])["ez"].sum(),
        "team_designed": runs.groupby(["game_id", "posteam"]).size(),
        "team_rz_car": runs.groupby(["game_id", "posteam"])["rz"].sum(),
        "team_i5_car": runs.groupby(["game_id", "posteam"])["i5"].sum(),
        "team_pass_td": p.groupby(["game_id", "posteam"])["pass_touchdown"].sum(),
        "team_rush_td": p.groupby(["game_id", "posteam"])["rush_touchdown"].sum(),
        "team_plays": p[(p["pass"] == 1) | (p["rush"] == 1)].groupby(["game_id", "posteam"]).size(),
    }).fillna(0).reset_index().rename(columns={"posteam": "team"})
    # QB -> receiver connection
    qr = tgt[tgt["passer_player_id"].notna()].groupby(["game_id", "posteam", "passer_player_id", "receiver_player_id"]).agg(
        tgt=("play_id", "size"), rz_tgt=("rz", "sum"), i10_tgt=("i10", "sum"), ez_tgt=("ez", "sum"),
        third_tgt=("third", "sum"), late_tgt=("late", "sum"), rec=("complete_pass", "sum"),
        yds=("yards_gained", "sum"), td=("pass_touchdown", "sum")).reset_index().rename(
        columns={"posteam": "team", "passer_player_id": "qb_id", "receiver_player_id": "player_id"})
    usage = rec.merge(ru, on=["game_id", "team", "player_id"], how="outer")
    return usage, team, qr


def build_player_games(season: int, snaps: pd.DataFrame | None = None, players: pd.DataFrame | None = None) -> dict:
    raw = nv.load_pbp(season)
    stats = nv.load("player_week", season)
    usage, team, qr = _pbp_usage(raw)
    stats = stats[stats["position"].isin(SKILL)].copy()
    stats["team"] = normalize_team(stats["team"])
    stats["opponent_team"] = normalize_team(stats["opponent_team"])
    keep = ["player_id", "player_display_name", "position", "season", "week", "season_type", "team", "opponent_team"] + \
        [c for c in OUTCOME_COLS if c in stats]
    s = stats[keep].rename(columns={"player_display_name": "name", "opponent_team": "opp"})
    sched = nv.load_schedules()
    sched = sched[sched["season"] == season][["game_id", "week", "home_team", "away_team", "gameday"]].copy()
    sched["home_team"] = normalize_team(sched["home_team"])
    sched["away_team"] = normalize_team(sched["away_team"])
    gid = pd.concat([sched.rename(columns={"home_team": "team"})[["game_id", "week", "team", "gameday"]],
                     sched.rename(columns={"away_team": "team"})[["game_id", "week", "team", "gameday"]]])
    s = s.merge(gid, on=["week", "team"], how="inner")
    s = s.merge(usage, on=["game_id", "team", "player_id"], how="left").merge(team, on=["game_id", "team"], how="left")
    num = [c for c in s.columns if c not in ("player_id", "name", "position", "season_type", "team", "opp", "game_id", "gameday")]
    s[num] = s[num].apply(pd.to_numeric, errors="coerce").fillna(0)
    if snaps is not None and players is not None and len(snaps):
        m = players[["gsis_id", "pfr_id"]].dropna().drop_duplicates("pfr_id")
        sn = snaps[snaps["season"] == season].merge(m, left_on="pfr_player_id", right_on="pfr_id")
        sn = sn[["game_id", "gsis_id", "offense_pct", "offense_snaps"]].rename(columns={"gsis_id": "player_id"})
        s = s.merge(sn.drop_duplicates(["game_id", "player_id"]), on=["game_id", "player_id"], how="left")
    else:
        s["offense_pct"] = np.nan
        s["offense_snaps"] = np.nan
    s["any_td"] = ((s["rushing_tds"] + s["receiving_tds"]) > 0).astype(int)
    s["tds"] = s["rushing_tds"] + s["receiving_tds"]
    s["fumbles_lost"] = s.get("rushing_fumbles_lost", 0) + s.get("receiving_fumbles_lost", 0) + s.get("sack_fumbles_lost", 0)
    s["rush_rec_yards"] = s["rushing_yards"] + s["receiving_yards"]
    qr["season"] = season
    qr = qr.merge(sched[["game_id", "week"]], on="game_id")
    return {"player_games": s, "team_games": team.merge(gid, on=["game_id", "team"]), "qb_receiver": qr}
