"""Descriptive team / QB stats for the game report (baseline season, current form, splits, ranks).

These numbers are for the analyst view; the model itself uses the opponent-adjusted,
recency-weighted ratings in kuze.features.ratings.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from kuze.features.pbp_prep import normalize_team

# metric -> True if higher is better for the OFFENSE (defense ranks use the opposite)
HIGHER_IS_BETTER = {
    "epa_play": True, "pass_epa": True, "rush_epa": True, "success": True, "early_success": True,
    "exp_pass": True, "exp_rush": True, "sack_rate": False, "pressure_proxy": False, "turnover_rate": False,
    "rz_td": True, "pts_drive": True, "third_conv": True, "ypp": True,
}


def _agg(p: pd.DataFrame) -> dict:
    n = len(p)
    if n == 0:
        return {}
    d = p[p["is_pass"] == 1]
    r = p[p["is_rush"] == 1]
    ed = p[p["early_down"] == 1]
    td3 = p[p["third_down"] == 1]
    out = {
        "plays": n,
        "epa_play": p["epa"].mean(),
        "pass_epa": d["epa"].mean() if len(d) else np.nan,
        "rush_epa": r["epa"].mean() if len(r) else np.nan,
        "success": p["success"].mean(),
        "pass_success": d["success"].mean() if len(d) else np.nan,
        "rush_success": r["success"].mean() if len(r) else np.nan,
        "early_success": ed["success"].mean() if len(ed) else np.nan,
        "exp_pass": (d["yards_gained"] >= 20).mean() if len(d) else np.nan,
        "exp_rush": (r["yards_gained"] >= 10).mean() if len(r) else np.nan,
        "sack_rate": d["sack"].mean() if len(d) else np.nan,
        "pressure_proxy": ((d["sack"] == 1) | (d["qb_hit"] == 1) | (d["qb_scramble"] == 1)).mean() if len(d) else np.nan,
        "turnover_rate": p["turnover"].mean(),
        "third_conv": td3["first_down"].mean() if len(td3) else np.nan,
        "ypp": p["yards_gained"].mean(),
        "pass_rate": p["is_pass"].mean(),
        "ypc": r["yards_gained"].mean() if len(r) else np.nan,
        "ypa": d.loc[d["sack"] != 1, "yards_gained"].mean() if len(d) else np.nan,
    }
    return out


def _drive_agg(dr: pd.DataFrame) -> dict:
    if dr.empty:
        return {}
    rz = dr[dr["rz"] == 1]
    return {"drives": len(dr), "pts_drive": dr["pts"].mean(), "rz_trips": len(rz),
            "rz_td": rz["td"].mean() if len(rz) else np.nan}


def build_drives(raw: pd.DataFrame) -> pd.DataFrame:
    d = raw[raw["posteam"].notna() & raw["fixed_drive"].notna()].copy()
    d["posteam"] = normalize_team(d["posteam"])
    d["defteam"] = normalize_team(d["defteam"])
    drives = d.groupby(["game_id", "posteam", "defteam", "fixed_drive"]).agg(
        result=("fixed_drive_result", "last"), min_yl=("yardline_100", "min")).reset_index()
    drives["td"] = (drives["result"] == "Touchdown").astype(int)
    drives["fg"] = (drives["result"] == "Field goal").astype(int)
    drives["rz"] = (drives["min_yl"] <= 20).astype(int)
    drives["pts"] = drives["td"] * 6.95 + drives["fg"] * 3
    return drives


@dataclass
class TeamStats:
    plays: pd.DataFrame      # prepared scrimmage plays (several seasons)
    drives: pd.DataFrame
    games: pd.DataFrame      # schedule rows (normalized teams)

    def _team_games(self, team: str, season: int, last_n: int | None = None, home: bool | None = None) -> list[str]:
        g = self.games[(self.games["season"] == season) & self.games["result"].notna()
                       & ((self.games["home_team"] == team) | (self.games["away_team"] == team))].sort_values("gameday")
        if home is not None:
            g = g[(g["home_team"] == team) == home]
        ids = g["game_id"].tolist()
        return ids[-last_n:] if last_n else ids

    def summary(self, team: str, season: int, last_n: int | None = None, home: bool | None = None,
                seasons_back: int = 0) -> dict:
        ids = self._team_games(team, season, last_n, home)
        if last_n and len(ids) < last_n and seasons_back:
            prev = self._team_games(team, season - 1)
            ids = prev[-(last_n - len(ids)):] + ids
        if not ids:
            return {"games": 0}
        p = self.plays[self.plays["game_id"].isin(ids)]
        dr = self.drives[self.drives["game_id"].isin(ids)]
        off = _agg(p[p["posteam"] == team]) | _drive_agg(dr[dr["posteam"] == team])
        de = _agg(p[p["defteam"] == team]) | _drive_agg(dr[dr["defteam"] == team])
        g = self.games[self.games["game_id"].isin(ids)]
        pts_for = np.where(g["home_team"] == team, g["home_score"], g["away_score"])
        pts_ag = np.where(g["home_team"] == team, g["away_score"], g["home_score"])
        w = int((pts_for > pts_ag).sum()); l = int((pts_for < pts_ag).sum()); t = int((pts_for == pts_ag).sum())
        own = p[p["posteam"] == team]
        opp = p[p["defteam"] == team]
        giveaways = int(own["interception"].sum() + own["fumble_lost"].sum())
        takeaways = int(opp["interception"].sum() + opp["fumble_lost"].sum())
        fum_own = own["fumble"].sum()
        fum_lost_own = own["fumble_lost"].sum()
        fum_opp = opp["fumble"].sum()
        fum_lost_opp = opp["fumble_lost"].sum()
        return {
            "games": len(ids), "record": f"{w}-{l}" + (f"-{t}" if t else ""),
            "ppg": float(np.mean(pts_for)), "papg": float(np.mean(pts_ag)), "diff_pg": float(np.mean(pts_for - pts_ag)),
            "off": _clean(off), "def": _clean(de),
            "giveaways": giveaways, "takeaways": takeaways, "to_margin": takeaways - giveaways,
            # fumble recoveries are ~coin flips: large deviations from 50% are luck that regresses
            "fumble_recovery_luck": _fumble_luck(fum_own, fum_lost_own, fum_opp, fum_lost_opp),
        }

    def league_ranks(self, season: int, last_n: int | None = None) -> pd.DataFrame:
        teams = sorted(set(self.games.loc[self.games["season"] == season, "home_team"]))
        rows = []
        for t in teams:
            s = self.summary(t, season, last_n)
            if not s.get("games"):
                continue
            rec = {"team": t}
            for k, v in s["off"].items():
                rec[f"off_{k}"] = v
            for k, v in s["def"].items():
                rec[f"def_{k}"] = v
            rows.append(rec)
        df = pd.DataFrame(rows).set_index("team")
        ranks = pd.DataFrame(index=df.index)
        for m, hib in HIGHER_IS_BETTER.items():
            if f"off_{m}" in df:
                ranks[f"off_{m}"] = df[f"off_{m}"].rank(ascending=not hib, method="min")
            if f"def_{m}" in df:
                ranks[f"def_{m}"] = df[f"def_{m}"].rank(ascending=hib, method="min")
        return ranks

    # ------------------------------------------------------------------ QB
    def qb_summary(self, qb_id: str | None, season: int, last_n: int | None = None, ftn: pd.DataFrame | None = None) -> dict:
        if not qb_id:
            return {}
        p = self.plays[(self.plays["season"] == season)]
        db = p[(p["is_pass"] == 1) & (p["passer_id"] == qb_id)]
        if last_n:
            ids = db.drop_duplicates("game_id").sort_values("game_date")["game_id"].tolist()[-last_n:]
            db = db[db["game_id"].isin(ids)]
            p = p[p["game_id"].isin(ids)]
        runs = p[(p["is_rush"] == 1) & (p["rusher_id"] == qb_id)]
        if db.empty:
            return {"dropbacks": 0}
        att = db[(db["sack"] != 1) & (db["qb_scramble"] != 1)]
        comp = att["complete_pass"].sum()
        out = {
            "games": int(db["game_id"].nunique()), "dropbacks": int(len(db)),
            "epa_db": float(db["epa"].mean()), "success": float(db["success"].mean()),
            "cpoe": float(pd.to_numeric(db["cpoe"], errors="coerce").mean()),
            "comp_pct": float(comp / max(len(att), 1)),
            "ypa": float(att["yards_gained"].sum() / max(len(att), 1)),
            "adot": float(pd.to_numeric(att["air_yards"], errors="coerce").mean()),
            "td_pct": float(att["pass_touchdown"].sum() / max(len(att), 1)),
            "int_pct": float(att["interception"].sum() / max(len(att), 1)),
            "sack_pct": float(db["sack"].mean()),
            "early_epa": float(db.loc[db["early_down"] == 1, "epa"].mean()),
            "third_epa": float(db.loc[db["third_down"] == 1, "epa"].mean()),
            "rz_epa": float(db.loc[db["red_zone"] == 1, "epa"].mean()) if (db["red_zone"] == 1).any() else None,
            "scrambles": int(db["qb_scramble"].sum()), "designed_runs": int(len(runs)),
            "rush_epa": float(pd.concat([db.loc[db["qb_scramble"] == 1, "epa"], runs["epa"]]).sum()),
            "pressure_proxy_epa": float(db.loc[(db["qb_hit"] == 1) | (db["sack"] == 1), "epa"].mean())
            if ((db["qb_hit"] == 1) | (db["sack"] == 1)).any() else None,
        }
        if ftn is not None and len(ftn):
            f = ftn.merge(db[["game_id", "play_id"]], left_on=["nflverse_game_id", "nflverse_play_id"],
                          right_on=["game_id", "play_id"])
            if len(f):
                out["turnover_worthy_rate"] = float(f["is_interception_worthy"].fillna(False).astype(float).mean())
                out["play_action_rate"] = float(f["is_play_action"].fillna(False).astype(float).mean())
        return _clean(out)


def _fumble_luck(fum_own, fum_lost_own, fum_opp, fum_lost_opp) -> float:
    """Extra turnovers gained vs a 50% recovery rate on all fumbles (positive = lucky)."""
    return float((fum_lost_opp - 0.5 * fum_opp) - (fum_lost_own - 0.5 * fum_own))


def _clean(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if isinstance(v, (float, np.floating)):
            out[k] = None if np.isnan(v) else round(float(v), 4)
        elif isinstance(v, (np.integer,)):
            out[k] = int(v)
        else:
            out[k] = v
    return out
