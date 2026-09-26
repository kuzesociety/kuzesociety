"""Player availability (injuries / inactives) relative to what the team ratings already reflect.

Team ratings are built from recent games, so a starter who has been out for six weeks is
already "priced into" the ratings. What matters is the *change* for this game:

    delta(player) = E[share | healthy] * P(play this game) - recency-weighted share in recent games

summed by position group (OL, WR, TE, RB, DL, LB, CB, S). A healthy starter ruled out gives
~ -0.9 to his group; a starter returning from a long absence gives ~ +0.9.

Only PRE-GAME information is used for the game being predicted: weekly roster status
(IR / practice squad / game-day inactive) and the injury report (Out / Doubtful /
Questionable). A version using "did he actually play" looked spectacular in backtests
(57% ATS) but that was leakage: backups only see the field in blowouts, so in-game snap
participation encodes the result. The pre-game version is what the app can really know.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from kuze.features.pbp_prep import normalize_team

GROUPS = {
    "OL": {"T", "G", "C", "OL", "OT", "OG", "LT", "RT", "LG", "RG"},
    "WR": {"WR"},
    "TE": {"TE"},
    "RB": {"RB", "FB", "HB"},
    "DL": {"DE", "DT", "NT", "DL"},
    "LB": {"LB", "ILB", "MLB", "OLB"},
    "CB": {"CB"},
    "S": {"S", "FS", "SS", "DB", "SAF"},
}
OFFENSE_GROUPS = ("OL", "WR", "TE", "RB")
DEFENSE_GROUPS = ("DL", "LB", "CB", "S")
POS_TO_GROUP = {p: g for g, ps in GROUPS.items() for p in ps}
BASELINE_HALF_LIFE_GAMES = 4.0
LOOKBACK_GAMES = 10

# P(plays | final injury-report status). "Questionable" is for regular starters, who play far
# more often than the all-player average (~0.68): 0.76 estimated from 2019-2025 snap data.
DEFAULT_PLAY_PROB = {"Out": 0.0, "Doubtful": 0.01, "Questionable": 0.76, "Probable": 0.97}
UNAVAILABLE_ROSTER = {"RES", "CUT", "RET", "DEV", "EXE", "TRC", "TRD", "TRT", "PUP", "SUS", "NWT", "UFA", "RSN", "RSR"}


def pregame_play_prob(roster_status: str | None, report_status: str | None, play_prob: dict | None = None) -> float:
    play_prob = play_prob or DEFAULT_PLAY_PROB
    if roster_status in UNAVAILABLE_ROSTER or roster_status in ("INA", "MISSING"):
        return 0.0
    if report_status in play_prob:
        return float(play_prob[report_status])
    return 0.98


def _share(df: pd.DataFrame) -> np.ndarray:
    off = df["offense_pct"].fillna(0)
    de = df["defense_pct"].fillna(0)
    return np.where(df["group"].isin(OFFENSE_GROUPS), off, de)


def player_shares(snaps: pd.DataFrame) -> pd.DataFrame:
    s = snaps.copy()
    s["team"] = normalize_team(s["team"])
    s["group"] = s["position"].map(POS_TO_GROUP)
    s = s[s["group"].notna()]
    s["share"] = _share(s)
    return s.loc[s["share"] > 0, ["game_id", "team", "pfr_player_id", "player", "position", "group", "share"]]


def team_game_index(snaps: pd.DataFrame, schedules: pd.DataFrame, include_next: bool = True) -> pd.DataFrame:
    """Chronological games per team: every game with snap data + each team's next unplayed game."""
    games = schedules[["game_id", "season", "week", "gameday", "home_team", "away_team", "home_score"]].copy()
    games["home_team"] = normalize_team(games["home_team"])
    games["away_team"] = normalize_team(games["away_team"])
    tg = pd.concat([games.rename(columns={"home_team": "team"})[["game_id", "season", "week", "gameday", "team", "home_score"]],
                    games.rename(columns={"away_team": "team"})[["game_id", "season", "week", "gameday", "team", "home_score"]]])
    have = set(snaps["game_id"])
    played = tg[tg["game_id"].isin(have)]
    parts = [played]
    if include_next:
        min_season = int(played["season"].min()) if len(played) else 0
        future = tg[~tg["game_id"].isin(have) & (tg["season"] >= min_season)].sort_values("gameday")
        last_played = played.groupby("team")["gameday"].max()
        future = future[future["gameday"] > future["team"].map(last_played).fillna(pd.Timestamp.min)]
        parts.append(future.groupby("team").head(1))
    tg = pd.concat(parts).sort_values(["team", "gameday"]).reset_index(drop=True)
    tg["team_game_no"] = tg.groupby("team").cumcount()
    return tg[["game_id", "team", "season", "week", "gameday", "team_game_no"]]


def pfr_gsis_map(players: pd.DataFrame | None, rosters_weekly: pd.DataFrame | None = None) -> dict:
    """pfr_id -> gsis_id using the nflverse players table (falls back to weekly rosters)."""
    frames = []
    if players is not None:
        frames.append(players[["gsis_id", "pfr_id"]])
    if rosters_weekly is not None and "pfr_id" in rosters_weekly:
        frames.append(rosters_weekly[["gsis_id", "pfr_id"]])
    ids = pd.concat(frames).dropna().drop_duplicates("pfr_id")
    return dict(zip(ids["pfr_id"], ids["gsis_id"]))


@dataclass
class AvailabilityResult:
    team_games: pd.DataFrame          # per (game, team): av_<group>, out_<group>
    players: pd.DataFrame             # per (game, team, player) for upcoming games: role, P(play), delta


def compute(snaps: pd.DataFrame, schedules: pd.DataFrame, rosters_weekly: pd.DataFrame, injuries: pd.DataFrame,
            players: pd.DataFrame | None = None, use_gameday_inactives: bool = True,
            play_prob: dict | None = None, overrides: dict | None = None,
            half_life: float = BASELINE_HALF_LIFE_GAMES, lookback: int = LOOKBACK_GAMES) -> AvailabilityResult:
    """Availability deltas for every team-game (history + each team's next game).

    For every player with history on the team:
      * E[share | healthy]: recency-weighted share over past games in which he was available
        (on the active roster, not Out/Doubtful) - zeros included, so a healthy backup who
        rarely plays has a low expectation;
      * baseline: recency-weighted share over all past team games (what the ratings saw);
      * this game: E[share | healthy] * P(play) from roster status + injury report.
    ``overrides``: {(season, week, team, gsis_id): (roster_status, report_status)} for manual /
    fresher injury news entered in the app.
    """
    shares = player_shares(snaps)
    index = team_game_index(snaps, schedules)
    pfr_to_gsis = pfr_gsis_map(players, rosters_weekly)
    rw = rosters_weekly.copy()
    rw["team"] = normalize_team(rw["team"])
    rstat = {(int(s), int(w), t, g): st for s, w, t, g, st in
             zip(rw["season"], rw["week"], rw["team"], rw["gsis_id"], rw["status"]) if isinstance(g, str)}
    rosters_seen = {(int(s), int(w), t) for s, w, t in zip(rw["season"], rw["week"], rw["team"])}
    inj = injuries.copy()
    inj["team"] = normalize_team(inj["team"])
    istat = {(int(s), int(w), t, g): st for s, w, t, g, st in
             zip(inj["season"], inj["week"], inj["team"], inj["gsis_id"], inj["report_status"])
             if isinstance(g, str) and isinstance(st, str)}
    if overrides:
        for key, (rs, rep) in overrides.items():
            if rs is not None:
                rstat[key] = rs
            if rep is not None:
                istat[key] = rep
    decay = np.power(0.5, np.arange(1, lookback + 1) / half_life)
    have_snaps = set(shares["game_id"])
    rows, player_rows = [], []
    for team, idx in index.groupby("team"):
        idx = idx.sort_values("team_game_no").reset_index(drop=True)
        tsh = shares[shares["team"] == team].merge(idx[["game_id", "team_game_no"]], on="game_id")
        n_games = len(idx)
        plist = tsh.drop_duplicates("pfr_player_id")
        players_ = plist["pfr_player_id"].to_numpy()
        pidx = {p: i for i, p in enumerate(players_)}
        mat = np.zeros((n_games, len(players_)))
        mat[tsh["team_game_no"].to_numpy(), tsh["pfr_player_id"].map(pidx).to_numpy()] = tsh["share"].to_numpy()
        group_of = plist["group"].to_numpy()
        names = plist["player"].to_numpy()
        positions = plist["position"].to_numpy()
        gsis = [pfr_to_gsis.get(p) for p in players_]
        avail = np.ones_like(mat, dtype=bool)
        prob_now = np.ones_like(mat)
        status_txt = np.empty(mat.shape, dtype=object)
        for g in range(n_games):
            s, w = int(idx.at[g, "season"]), int(idx.at[g, "week"])
            have_roster = (s, w, team) in rosters_seen
            for i, gid in enumerate(gsis):
                if gid is None:
                    continue
                key = (s, w, team, gid)
                rs = rstat.get(key, "MISSING" if have_roster else None)
                rep = istat.get(key)
                if rs == "INA" and not use_gameday_inactives:
                    rs = "ACT"
                injured = rep in ("Out", "Doubtful") or rs in ("RES", "PUP", "SUS", "MISSING")
                avail[g, i] = not injured and rs not in UNAVAILABLE_ROSTER
                prob_now[g, i] = pregame_play_prob(rs, rep, play_prob)
                status_txt[g, i] = rep or rs
        avail |= mat > 0
        for g in range(1, n_games):
            lo = max(0, g - lookback)
            hist = mat[lo:g][::-1]
            av_h = avail[lo:g][::-1]
            wts = decay[: len(hist)][:, None]
            baseline = (hist * wts).sum(axis=0) / wts.sum()
            aw = (av_h * wts).sum(axis=0)
            healthy = np.where(aw > 0, (hist * av_h * wts).sum(axis=0) / np.maximum(aw, 1e-9), 0.0)
            current = healthy * prob_now[g]
            delta = current - baseline
            gid_game = idx.at[g, "game_id"]
            rec = {"game_id": gid_game, "team": team}
            for grp in GROUPS:
                sel = group_of == grp
                rec[f"av_{grp}"] = float(delta[sel].sum())
                rec[f"out_{grp}"] = float(((healthy >= 0.6) & (prob_now[g] < 0.5) & sel).sum())
            rows.append(rec)
            if gid_game not in have_snaps:  # upcoming game: keep player detail for the report
                for i in np.where((healthy >= 0.25) | (np.abs(delta) >= 0.2))[0]:
                    player_rows.append({"game_id": gid_game, "team": team, "player": names[i], "position": positions[i],
                                        "group": group_of[i], "gsis_id": gsis[i], "role": float(healthy[i]),
                                        "baseline": float(baseline[i]), "p_play": float(prob_now[g, i]),
                                        "status": status_txt[g, i], "delta": float(delta[i])})
    return AvailabilityResult(pd.DataFrame(rows), pd.DataFrame(player_rows))


def game_level(av: pd.DataFrame, games: pd.DataFrame) -> pd.DataFrame:
    """Home-minus-away (d_av_*) and summed (s_av_*) availability features per game."""
    g = games[["game_id", "home_team", "away_team"]].copy()
    g["home_team"] = normalize_team(g["home_team"])
    g["away_team"] = normalize_team(g["away_team"])
    h = av.rename(columns={"team": "home_team"}).add_prefix("h_").rename(columns={"h_game_id": "game_id", "h_home_team": "home_team"})
    a = av.rename(columns={"team": "away_team"}).add_prefix("a_").rename(columns={"a_game_id": "game_id", "a_away_team": "away_team"})
    g = g.merge(h, on=["game_id", "home_team"], how="left").merge(a, on=["game_id", "away_team"], how="left")
    cols = {"game_id": g["game_id"]}
    for grp in GROUPS:
        cols[f"d_av_{grp}"] = g[f"h_av_{grp}"].fillna(0) - g[f"a_av_{grp}"].fillna(0)
        cols[f"s_av_{grp}"] = g[f"h_av_{grp}"].fillna(0) + g[f"a_av_{grp}"].fillna(0)
        cols[f"h_out_{grp}"] = g[f"h_out_{grp}"].fillna(0)
        cols[f"a_out_{grp}"] = g[f"a_out_{grp}"].fillna(0)
    return pd.DataFrame(cols)


def estimate_play_probabilities(injuries: pd.DataFrame, snaps: pd.DataFrame, players: pd.DataFrame,
                                min_prev_share: float = 0.6) -> dict:
    """P(plays | report_status) for regulars (>= min_prev_share of snaps in the previous game)."""
    m = pfr_gsis_map(players)
    sh = player_shares(snaps)
    sh["gsis_id"] = sh["pfr_player_id"].map(m)
    seasons = snaps[["game_id", "season", "week"]].drop_duplicates()
    sh = sh.merge(seasons, on="game_id")
    played = sh[["season", "week", "gsis_id"]].drop_duplicates().assign(played=1)
    regular = sh[sh["share"] >= min_prev_share][["season", "week", "gsis_id"]].drop_duplicates()
    regular["week"] = regular["week"] + 1
    inj = injuries.merge(regular, on=["season", "week", "gsis_id"])
    j = inj.merge(played, on=["season", "week", "gsis_id"], how="left").fillna({"played": 0})
    return {k: float(v) for k, v in j.groupby("report_status")["played"].mean().items()}
