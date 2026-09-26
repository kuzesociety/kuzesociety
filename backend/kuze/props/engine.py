"""Live props engine: projections for the upcoming week's players, prop pricing, anytime TD + QB trust."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import numpy as np
import pandas as pd

from kuze.config import settings
from kuze.data import nflverse as nv
from kuze.features.availability import pregame_play_prob
from kuze.features.pbp_prep import normalize_team
from kuze.models import betting as B
from kuze.models.distributions import Outcome
from kuze.props import features as F
from kuze.props import model as PM
from kuze.props import td as TD
from kuze.props.dataset import build_player_games

log = logging.getLogger(__name__)
FIRST_SEASON = 2016
SKILL = ("QB", "RB", "WR", "TE", "FB")
STAT_LABELS = {"receptions": "Receptions", "receiving_yards": "Receiving Yards", "targets": "Targets",
               "carries": "Rush Attempts", "rushing_yards": "Rushing Yards", "rush_rec_yards": "Rush + Rec Yards",
               "attempts": "Pass Attempts", "completions": "Completions", "passing_yards": "Passing Yards",
               "passing_tds": "Passing TDs"}
ODDS_API_MARKETS = {"player_pass_yds": "passing_yards", "player_pass_attempts": "attempts",
                    "player_pass_completions": "completions", "player_pass_tds": "passing_tds",
                    "player_rush_yds": "rushing_yards", "player_rush_attempts": "carries",
                    "player_receptions": "receptions", "player_reception_yds": "receiving_yards",
                    "player_rush_reception_yds": "rush_rec_yards", "player_anytime_td": "anytime_td"}


def _derived(name: str):
    p = settings.data_dir / "derived"
    p.mkdir(parents=True, exist_ok=True)
    return p / name


@dataclass
class PropsState:
    rows: pd.DataFrame            # upcoming player rows with features + projections + TD probs
    model: PM.PropModel
    td_model: TD.TDModel
    built_at: float


class PropsEngine:
    def __init__(self):
        self.state: PropsState | None = None
        self.corrections: dict = {}   # online multiplicative corrections per stat (learning loop)

    # ------------------------------------------------------------------ data
    def _datasets(self, cur: int) -> dict:
        players = nv.load("players", columns=["gsis_id", "pfr_id"])
        snaps = nv.load("snap_counts", range(FIRST_SEASON, cur + 1))
        out = {"player_games": [], "team_games": [], "qb_receiver": []}
        for s in range(FIRST_SEASON, cur + 1):
            paths = {k: _derived(f"props_{k}_{s}.parquet") for k in out}
            if s < cur and all(p.exists() for p in paths.values()):
                for k, p in paths.items():
                    out[k].append(pd.read_parquet(p))
                continue
            d = build_player_games(s, snaps, players)
            for k in out:
                d[k].to_parquet(paths[k])
                out[k].append(d[k])
        return {k: pd.concat(v, ignore_index=True) for k, v in out.items()}

    def _candidates(self, st, pg: pd.DataFrame, season: int, week: int) -> pd.DataFrame:
        """Skill players expected to be involved in each upcoming game, with P(play)."""
        f = st.features
        up = f[(f["season"] == season) & (f["week"] == week)]
        inj = nv.load("injuries", season)
        inj = inj[inj["week"] == week] if len(inj) else inj
        rw = nv.load("rosters_weekly", season, columns=["season", "week", "team", "gsis_id", "status", "full_name", "position"])
        if len(rw):
            rw = rw[rw["week"] <= week]
            rw = rw.assign(team=normalize_team(rw["team"]))
        rw_wk = rw[rw["week"] == week] if len(rw) else rw
        rstat = {g: s for g, s in zip(rw_wk.get("gsis_id", []), rw_wk.get("status", []))}
        # each player's latest roster team this season: departed / released players drop out entirely
        # (their old shares are redistributed over whoever is still there)
        latest_team = ({} if rw.empty else
                       rw.sort_values("week").drop_duplicates("gsis_id", keep="last").set_index("gsis_id")["team"].to_dict())
        istat = {g: s for g, s in zip(inj.get("gsis_id", []), inj.get("report_status", [])) if isinstance(s, str)}
        prac = {g: s for g, s in zip(inj.get("gsis_id", []), inj.get("practice_status", [])) if isinstance(s, str)}
        last = pg.sort_values(["season", "week"]).groupby("player_id").tail(1)
        recent = pg[(pg["season"] >= season - 1)]
        rows = []
        for r in up.itertuples(index=False):
            for side, team, opp in (("home", r.home_team, r.away_team), ("away", r.away_team, r.home_team)):
                qb_id = getattr(r, f"{side}_qb_id_used")
                tg_hist = recent[recent["team"] == team]
                team_games = tg_hist.drop_duplicates("game_id").sort_values(["season", "week"])["game_id"].tolist()[-8:]
                pl = last[(last["team"] == team) & last["position"].isin(SKILL) & last["game_id"].isin(team_games)]
                pl = pl[(pl["position"] != "QB") | (pl["player_id"] == qb_id)]
                ids = set(pl["player_id"])
                if isinstance(qb_id, str) and qb_id not in ids:
                    q = last[last["player_id"] == qb_id]
                    pl = pd.concat([pl, q.assign(team=team)]) if len(q) else pl
                for p in pl.itertuples(index=False):
                    if latest_team and p.player_id != qb_id and latest_team.get(p.player_id) != team:
                        continue   # on another team now, or on no roster this season
                    rs = rstat.get(p.player_id)
                    if rs is None and len(rw_wk) and p.player_id not in rstat:
                        rs = "MISSING"
                    prob = pregame_play_prob(rs, istat.get(p.player_id))
                    rows.append({"player_id": p.player_id, "name": p.name, "position": p.position, "season": season,
                                 "week": week, "team": team, "opp": opp, "game_id": r.game_id, "gameday": r.gameday,
                                 "p_play": prob, "roster_status": rs, "report_status": istat.get(p.player_id),
                                 "practice_status": prac.get(p.player_id), "season_type": "REG"})
        return pd.DataFrame(rows)

    # ------------------------------------------------------------------ build
    def build(self, st, retrain: bool = False) -> PropsState:
        from kuze.pipeline import next_week
        t0 = time.time()
        cur = nv.current_season()
        season, week = next_week(st.schedules)
        ds = self._datasets(cur)
        pg, tg, qr = ds["player_games"], ds["team_games"], ds["qb_receiver"]
        cand = self._candidates(st, pg, season, week)
        cand = cand[~cand["game_id"].isin(set(pg["game_id"]))]   # already played (e.g. Thursday) -> not upcoming
        # synthetic rows for the upcoming games (outcomes unknown) so EWMA features see all prior games
        syn = cand.drop(columns=["p_play", "roster_status", "report_status", "practice_status"]).copy()
        for c in pg.columns:
            if c not in syn:
                syn[c] = np.nan if c in ("offense_pct", "offense_snaps") else 0
        pg_all = pd.concat([pg, syn[pg.columns]], ignore_index=True)
        syn_t = cand.drop_duplicates(["game_id", "team"])[["game_id", "team", "week", "gameday"]].copy()
        for c in tg.columns:
            if c not in syn_t:
                syn_t[c] = np.nan
        tg_all = pd.concat([tg, syn_t[tg.columns]], ignore_index=True)
        pf = F.player_features(pg_all[pg_all["season"] >= FIRST_SEASON])
        tf = F.team_features(tg_all)
        dv, dq = F.defense_vs_position(pg_all)
        games = self._games_with_fair_lines(st)
        active = np.where(pf["game_id"].isin(set(cand["game_id"])) & pf["season"].eq(season),
                          pf.merge(cand[["game_id", "player_id", "p_play"]], on=["game_id", "player_id"], how="left")["p_play"].fillna(0).to_numpy() >= 0.5,
                          ((pf["offense_pct"].fillna(0) > 0) | (pf["tgt"] + pf["designed"] + pf["attempts"] > 0)).to_numpy())
        d = PM.assemble(pf, tf, dv, dq, games, st.features, active=pd.Series(active, index=pf.index))
        d = self._add_td_features(d, qr, games, cur)
        up_mask = d["game_id"].isin(set(cand["game_id"])) & (d["season"] == season)
        hist = d[~up_mask & (d["season"] >= 2017)]
        model_path, td_path = settings.models_dir / "props_model.pkl", settings.models_dir / "td_model.pkl"
        if retrain or not model_path.exists() or not td_path.exists():
            model = PM.PropModel.train(hist, oos=self._oos())
            model.save(model_path)
            tdm = TD.TDModel().fit(self._td_rows(hist, model))
            import pickle
            with open(td_path, "wb") as fh:
                pickle.dump(tdm, fh)
        else:
            import pickle
            model = PM.PropModel.load(model_path)
            with open(td_path, "rb") as fh:
                tdm = pickle.load(fh)
        up = d[up_mask].copy()
        up = up.merge(cand[["game_id", "player_id", "p_play", "roster_status", "report_status", "practice_status"]],
                      on=["game_id", "player_id"], how="left")
        proj = model.project(up)
        up = up.reset_index(drop=True)
        for stat in PM.STATS:
            up[f"raw_{stat}"] = proj[stat].to_numpy()   # logged for the online drift correction
            up[f"proj_{stat}"] = proj[stat].to_numpy() * self.corrections.get(stat, 1.0)
        tdrows = self._td_rows(up, model)
        up["p_td"] = tdm.predict(tdrows)
        up["p_td_struct"] = TD.structural_td_prob(tdrows)
        for c in ("v_team_pass_td", "v_team_rush_td", "v_team_targets", "v_team_designed", "v_team_pass_att"):
            up[c] = tdrows[c].to_numpy()
        self.state = PropsState(up, model, tdm, time.time())
        log.info("props engine built in %.1fs (%d players)", time.time() - t0, len(up))
        return self.state

    def _games_with_fair_lines(self, st) -> pd.DataFrame:
        """Schedule rows; upcoming games carry the model's fair margin / total and chosen QBs."""
        from kuze.pipeline import pipeline
        g = st.schedules.copy()
        for c in ("home_team", "away_team"):
            g[c] = normalize_team(g[c])
        try:
            up = pipeline.upcoming()
            fair = {}
            from kuze.models.market import schedule_market
            for _, r in up.iterrows():
                mk = schedule_market(st.keynum, r)
                hours = None
                fl = st.model.fair_lines(r["model_margin"], r["model_total"], mk.margin, mk.total, hours)
                fair[r["game_id"]] = (fl["fair_margin"], fl["fair_total"], r.get("home_qb_id_used"), r.get("away_qb_id_used"))
            for gid, (m, t, hq, aq) in fair.items():
                i = g.index[g["game_id"] == gid]
                g.loc[i, "spread_line"] = m
                g.loc[i, "total_line"] = t
                if isinstance(hq, str):
                    g.loc[i, "home_qb_id"] = hq
                if isinstance(aq, str):
                    g.loc[i, "away_qb_id"] = aq
        except Exception as exc:  # fall back to market lines
            log.warning("fair lines for props unavailable: %s", exc)
        return g

    def _oos(self) -> dict:
        """Walk-forward (out-of-sample) projections vs actuals: they shape the prop distributions and the
        QB recalibration. Uses a local backtest run if there is one, else the snapshot shipped with the code."""
        out = {}
        for stat in PM.STATS:
            p = _derived(f"props_oos_{stat}.parquet")
            if p.exists():
                out[stat] = pd.read_parquet(p)
        if not out and PM.OOS_SNAPSHOT.exists():
            snap = pd.read_parquet(PM.OOS_SNAPSHOT)
            out = {stat: g.drop(columns="stat").reset_index(drop=True) for stat, g in snap.groupby("stat")}
        return out

    def _add_td_features(self, d: pd.DataFrame, qr: pd.DataFrame, games: pd.DataFrame, cur: int) -> pd.DataFrame:
        trust = TD.qb_trust_features(d, qr, TD.expected_starters(games))
        d = d.merge(trust, on=["game_id", "player_id"], how="left")
        for c in [c for c in trust.columns if c.startswith(("trust", "c_"))]:
            d[c] = d[c].fillna(0.0)
        cf = TD.contract_features(nv.load("contracts", columns=["gsis_id", "year_signed", "years", "apy_cap_pct",
                                                                 "draft_overall"]), range(FIRST_SEASON, cur + 1))
        d = d.merge(cf, on=["player_id", "season"], how="left")
        d["apy_cap_pct"] = d["apy_cap_pct"].fillna(0.004)
        d["draft_overall"] = d["draft_overall"].fillna(300)
        return d

    @staticmethod
    def _td_rows(d: pd.DataFrame, model: PM.PropModel) -> pd.DataFrame:
        x = d.reset_index(drop=True)
        x = pd.concat([x, model.team.predict(x)], axis=1)
        x["pos_code"] = x["position"].map(PM.POS_CODE).fillna(2)
        return x

    # ------------------------------------------------------------------ queries
    def players(self, game_id: str) -> list[dict]:
        if self.state is None:
            return []
        up = self.state.rows[self.state.rows["game_id"] == game_id]
        out = []
        for _, r in up.iterrows():
            stats = {}
            for stat in PM.STATS:
                v = r.get(f"proj_{stat}")
                if v is None or (isinstance(v, float) and np.isnan(v)):
                    continue
                dist = self.state.model.dist(stat, r["position"])
                q = dist.quantiles(v) if dist else {}
                stats[stat] = {"label": STAT_LABELS[stat], "mean": round(float(v), 2),
                               **{k: round(val, 1) for k, val in q.items()}}
            out.append({
                "player_id": r["player_id"], "name": r["name"], "position": r["position"], "team": r["team"],
                "opp": r["opp"], "p_play": round(float(r.get("p_play", 1.0) or 0), 2),
                "status": _status_text(r.get("report_status"), r.get("roster_status")), "practice": r.get("practice_status"),
                "out": bool(float(r.get("p_play", 1.0) or 0) < 0.05),
                "usage": {"target_share": _r(r["f_tgt_share_n"]), "air_share": _r(r["f_air_share_n"]),
                          "carry_share": _r(r["f_carry_share_n"]), "snap_pct": _r(r["f_snap"]),
                          "rz_target_share": _r(r["f_rz_tgt_share_n"]), "ez_target_share": _r(r["f_ez_share_n"]),
                          "inside10_share": _r(r["f_i10_share"]), "goal_line_carry_share": _r(r["f_i5_share_n"]),
                          "adot": _r(r["f_adot"], 1), "catch_rate": _r(r["f_catch_rate"]),
                          "yards_per_target": _r(r["f_ypt"], 2), "yards_per_carry": _r(r["f_ypc"], 2)},
                "projections": stats,
                "td": {"p_anytime": _r(r["p_td"]), "fair_odds": round(B.prob_to_american(float(r["p_td"]))),
                       "structural": _r(r["p_td_struct"]),
                       "qb_trust": {"qb_id": r.get("qb_id"), "rz_share_from_qb": _r(r.get("trust_rz_share", 0)),
                                    "ez_share_from_qb": _r(r.get("trust_ez_share", 0)),
                                    "td_share_from_qb": _r(r.get("trust_td_share", 0)),
                                    "games_together": int(r.get("trust_games", 0) or 0),
                                    "rz_targets_from_qb": _r(r.get("c_rz_tgt", 0), 1),
                                    "ez_targets_from_qb": _r(r.get("c_ez_tgt", 0), 1),
                                    "tds_from_qb": _r(r.get("c_td", 0), 1),
                                    "third_down_looks": _r(r.get("trust_third", 0), 1),
                                    "late_half_looks": _r(r.get("trust_late", 0), 1)},
                       "ball_security": {"fumbles_lost_per_touch": _r(r["f_fumble_rate"], 4),
                                         "catch_rate": _r(r["f_catch_rate"])},
                       "contract": {"apy_cap_pct": _r(r.get("apy_cap_pct"), 4),
                                    "draft_overall": int(r.get("draft_overall", 300))},
                       "opp_tds_allowed_to_pos": _r(r.get("dv_td", 0), 2)},
            })
        out.sort(key=lambda x: -(x["projections"].get("receiving_yards", {}).get("mean", 0)
                                 + x["projections"].get("rushing_yards", {}).get("mean", 0)
                                 + x["projections"].get("passing_yards", {}).get("mean", 0) / 3))
        return out

    def price(self, game_id: str, player_id: str, stat: str, line: float, over_odds: float | None,
              under_odds: float | None, thresholds: dict | None = None) -> dict:
        from kuze.analysis.recommend import DEFAULT_THRESHOLDS, label_bet
        th = thresholds or DEFAULT_THRESHOLDS
        r = self._row(game_id, player_id)
        if stat == "anytime_td":
            p = float(r["p_td"])
            res = {"stat": stat, "p_yes": p, "fair_odds": round(B.prob_to_american(p))}
            if over_odds is not None:
                ev = p * (B.american_to_decimal(over_odds) - 1) - (1 - p)
                res.update({"odds": over_odds, "ev": ev, "label": label_bet(ev, "td", "MEDIUM+", None, th)})
            return res
        proj = float(r[f"proj_{stat}"])
        dist = self.state.model.dist(stat, r["position"])
        m_over, p_push, m_under = dist.prob_over(proj, line)
        p_over, p_under, mkt_over = m_over, m_under, None
        w = settings.prop_model_weight
        if over_odds is not None and under_odds is not None:
            # fair = book's no-vig P(over) + w * (model - book), on the no-push scale
            mkt_over, _ = B.devig(over_odds, under_odds, "multiplicative")
            live = 1.0 - p_push
            model_nopush = m_over / live if live > 0 else 0.5
            fair = mkt_over + w * (model_nopush - mkt_over)
            p_over, p_under = fair * live, (1.0 - fair) * live
        out = {"stat": stat, "label_text": STAT_LABELS[stat], "line": line, "projection": proj,
               "projection_raw": float(r.get(f"raw_{stat}", proj)),
               "median": float(np.median(dist.samples(proj))), "p_over": p_over, "p_under": p_under, "p_push": p_push,
               "p_over_model": m_over, "p_over_market": mkt_over, "model_weight": w if mkt_over is not None else 1.0,
               "sides": []}
        p_play = float(r.get("p_play", 1) or 0)
        conf = "HIGH" if p_play >= 0.95 else "MEDIUM"
        if mkt_over is None:
            conf = "MEDIUM"    # one-sided price: the book's fair number is unknown, so the edge is less certain
        if r.get("report_status") == "Questionable":
            conf = "LOW"
        if p_play < 0.5:
            conf = "UNKNOWN"   # not expected to play: label_bet turns this into UNKNOWN
        for side, odds, pw, pl in (("over", over_odds, p_over, p_under), ("under", under_odds, p_under, p_over)):
            if odds is None:
                continue
            o = Outcome(pw, p_push, pl)
            ev = B.expected_value(o, odds)
            out["sides"].append({"side": side, "odds": odds, "win": pw, "ev": ev, "kelly": B.kelly_fraction(o, odds),
                                 "fair_odds": round(B.fair_american(o)), "label": label_bet(ev, "prop", conf, None, th),
                                 "confidence": conf})
        return out

    def _row(self, game_id: str, player_id: str) -> pd.Series:
        rows = self.state.rows
        sel = rows[(rows["game_id"] == game_id) & ((rows["player_id"] == player_id) | (rows["name"] == player_id))]
        if sel.empty:
            raise KeyError(f"{player_id} not projected for {game_id}")
        return sel.iloc[0]


ROSTER_TEXT = {"RES": "Injured reserve", "INA": "Inactive", "PUP": "PUP", "SUS": "Suspended", "DEV": "Practice squad",
               "MISSING": "Not on roster", "NWT": "Not with team", "EXE": "Exempt"}


def _status_text(report: str | None, roster: str | None) -> str | None:
    if isinstance(report, str) and report:
        return report
    if isinstance(roster, str) and roster not in ("ACT", ""):
        return ROSTER_TEXT.get(roster, roster)
    return None


def _r(x, nd: int = 3):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else round(v, nd)


engine = PropsEngine()
