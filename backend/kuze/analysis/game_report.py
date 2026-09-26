"""RUN THE MODEL: full analysis of one game against the exact Hard Rock lines.

Produces a JSON-able dict that mirrors the master-prompt output format:
lines, model fair lines, 2025 baseline, 2026 form, QB analysis, matchups, OL/pass rush,
injuries, pace/weather/schedule, market, projection, scripts, bets with playable thresholds,
confidence and a final PLAY / SMALLER / LEAN / PASS / UNKNOWN board.
"""
from __future__ import annotations

import datetime as dt
import math
from dataclasses import asdict, dataclass
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from kuze.analysis import matchups as MU
from kuze.analysis.recommend import DEFAULT_THRESHOLDS, Flag, data_confidence, label_bet, stake
from kuze.data.stadiums import STADIUMS
from kuze.models import betting as B
from kuze.models import game_model as GM
from kuze.models.distributions import moneyline_outcome
from kuze.models.market import MarketView, consensus, schedule_market
from kuze.pipeline import pipeline, qb_model, ratings_snapshot, team_stats

ET = ZoneInfo("America/New_York")
INJURED_STATUSES = {"Out", "Doubtful", "Questionable", "RES", "PUP", "INA", "SUS"}
DEPARTED_STATUSES = {"MISSING", "CUT", "DEV", "UFA", "RET", "TRD", "TRC", "TRT", "NWT", "EXE", "RSN", "RSR"}


def _status_kind(status) -> str:
    s = str(status or "")
    base = s.split(" (override")[0]
    if base in DEPARTED_STATUSES:
        return "departed"
    if base in INJURED_STATUSES or "override" in s:
        return "injury"
    return "active"


@dataclass
class HardRockLines:
    home_spread: float | None = None
    home_spread_odds: float | None = None
    away_spread: float | None = None
    away_spread_odds: float | None = None
    home_ml: float | None = None
    away_ml: float | None = None
    total: float | None = None
    over_odds: float | None = None
    under_odds: float | None = None
    updated_at: str | None = None
    source: str = "manual"


def kickoff_utc(row) -> dt.datetime:
    day = pd.Timestamp(row["gameday"]).to_pydatetime().date()
    gt = row.get("gametime") if isinstance(row.get("gametime"), str) else "13:00"
    hh, mm = (int(x) for x in gt.split(":")[:2])
    return dt.datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET).astimezone(dt.timezone.utc)


def _num(x):
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else v


def fmt_spread(team: str, line: float) -> str:
    return f"{team} {'+' if line > 0 else ''}{line:g}" if line != 0 else f"{team} PK"


def round_half(x: float) -> float:
    return round(x * 2) / 2


def fair_spread_line(k, pk, from_spread_outcome) -> float:
    """Half-point home line whose cover probability (pushes excluded) is closest to 50%."""
    best, best_d = 0.0, 9.0
    for line in np.arange(-40, 40.5, 0.5):
        o = from_spread_outcome(k, pk, +1, float(line))
        d = abs(o.win_no_push - 0.5)
        if d < best_d:
            best, best_d = float(line), d
    return best


def fair_total_line(t, pt, from_total_outcome) -> float:
    best, best_d = 44.0, 9.0
    for line in np.arange(20, 80.5, 0.5):
        d = abs(from_total_outcome(t, pt, "over", float(line)).win_no_push - 0.5)
        if d < best_d:
            best, best_d = float(line), d
    return best


# ---------------------------------------------------------------------------------------------
def apply_qb_override(st, row: pd.Series, side: str, qb_id: str) -> pd.Series:
    """Recompute QB features for ``side`` if the user sets/confirms a different starter."""
    qbm = qb_model(st)
    season, week = int(row["season"]), int(row["week"])
    vals, _ = qbm.values(season, week)
    base = qbm.team_baseline(season, week, vals)
    team = row[f"{side}_team"]
    b = base.loc[base["team"] == team, "baseline"]
    value = qbm.value_of(vals, qb_id)
    row = row.copy()
    row[f"{side}_qb_value"] = value
    row[f"{side}_qb_delta"] = value - (float(b.iloc[0]) if len(b) else value)
    row[f"{side}_qb_id_used"] = qb_id
    row["d_qb_delta"] = row["home_qb_delta"] - row["away_qb_delta"]
    row["s_qb_delta"] = row["home_qb_delta"] + row["away_qb_delta"]
    row["d_qb_value"] = row["home_qb_value"] - row["away_qb_value"]
    return row


def apply_weather(row: pd.Series, wx: dict | None) -> pd.Series:
    if not wx or row.get("indoor", 0) == 1:
        return row
    row = row.copy()
    if wx.get("wind_mph") is not None:
        row["wind"] = wx["wind_mph"]
        row["wind_hi"] = max(wx["wind_mph"] - 10.0, 0.0)
    if wx.get("temp_f") is not None:
        row["temp"] = wx["temp_f"]
        row["cold"] = max(40.0 - wx["temp_f"], 0.0)
    row["weather_known"] = 1.0
    return row


def apply_availability_overrides(st, row: pd.Series, players: pd.DataFrame, overrides: dict) -> tuple[pd.Series, pd.DataFrame]:
    """overrides: {player_name or gsis_id: p_play} -> adjust d_av/s_av features by role * (p_new - p_old)."""
    if not overrides or players.empty:
        return row, players
    row = row.copy()
    players = players.copy()
    for i, pr in players.iterrows():
        key = pr["gsis_id"] if pr["gsis_id"] in overrides else (pr["player"] if pr["player"] in overrides else None)
        if key is None:
            continue
        p_new = float(overrides[key])
        d = pr["role"] * (p_new - pr["p_play"])
        grp = pr["group"]
        sign = 1 if pr["team"] == row["home_team"] else -1
        row[f"d_av_{grp}"] = row.get(f"d_av_{grp}", 0.0) + sign * d
        row[f"s_av_{grp}"] = row.get(f"s_av_{grp}", 0.0) + d
        players.at[i, "p_play"] = p_new
        players.at[i, "delta"] = pr["delta"] + d
        players.at[i, "status"] = f"{pr['status'] or ''} (override {p_new:.0%})"
    return row, players


# ---------------------------------------------------------------------------------------------
def confidence_flags(st, row: pd.Series, players: pd.DataFrame, raw_margin: float, raw_total: float,
                     market: MarketView, hours: float | None, wx_summary: dict, qb_confirmed: dict) -> list[Flag]:
    flags: list[Flag] = []
    model: GM.GameModel = st.model
    # 1) QB status
    for side in ("home", "away"):
        team = row[f"{side}_team"]
        qb_name = row.get(f"{side}_qb_name") or "?"
        if qb_confirmed.get(side):
            continue
        qb_rows = players[(players["team"] == team) & (players["position"] == "QB")] if not players.empty else players
        status = None
        if len(qb_rows):
            status = qb_rows.iloc[0]["status"]
        if status in ("Out", "Doubtful", "RES", "INA", "MISSING"):
            flags.append(Flag("QB_OUT", f"{team} listed QB {qb_name} is {status}: QB STATUS = UNKNOWN until the starter is confirmed", 3))
        elif status == "Questionable":
            flags.append(Flag("QB_Q", f"{team} QB {qb_name} is Questionable: edge downgraded until confirmed", 2,
                              swing=abs(0.0)))
        plays = row.get(f"{side}_qb_plays", 0) or 0
        if plays < 300:
            flags.append(Flag("QB_THIN", f"{team} QB {qb_name} has little NFL history ({int(plays)} QB plays): value mostly prior", 2))
        if abs(row.get(f"{side}_qb_delta", 0) or 0) > 0.08:
            flags.append(Flag("QB_CHANGE", f"{team} starter differs from the QBs behind recent numbers (QB value delta "
                              f"{row.get(f'{side}_qb_delta'):+.2f} EPA/play): verify the starter", 2))
    # 2) questionable starters: how much could the line swing?
    if not players.empty:
        q = players[(players["p_play"] > 0.05) & (players["p_play"] < 0.95) & (players["role"] >= 0.4)
                    & (players["position"] != "QB")]
        swing_m = 0.0
        swing_t = 0.0
        names = []
        for _, pr in q.iterrows():
            cm = abs(model.coef_points(f"d_av_{pr['group']}", "margin"))
            ct = abs(model.coef_points(f"s_av_{pr['group']}", "total"))
            swing_m += cm * pr["role"] * pr["p_play"] * model.blend.spread_early
            swing_t += ct * pr["role"] * pr["p_play"] * model.blend.total_early
            names.append(f"{pr['player']} ({pr['team']} {pr['position']})")
        if names:
            sev = 2 if swing_m >= 0.5 or len(names) >= 3 else 1
            flags.append(Flag("QUESTIONABLE", f"Questionable starters: {', '.join(names[:6])}"
                              + (" ..." if len(names) > 6 else "") + ": EDGE DOWNGRADED UNTIL CONFIRMED", sev,
                              swing=swing_m))
        injured = players[players["status"].map(_status_kind) == "injury"]
        for team in (row["home_team"], row["away_team"]):
            ol_out = injured[(injured["team"] == team) & (injured["group"] == "OL") & (injured["p_play"] < 0.5) & (injured["role"] >= 0.6)]
            db_out = injured[(injured["team"] == team) & (injured["group"].isin(["CB", "S"])) & (injured["p_play"] < 0.5) & (injured["role"] >= 0.6)]
            if len(ol_out) >= 2:
                flags.append(Flag("OL_CLUSTER", f"{team} missing {len(ol_out)} OL starters: OFFENSIVE EFFICIENCY DOWNGRADE (in model)", 1))
            if len(db_out) >= 2:
                flags.append(Flag("DB_CLUSTER", f"{team} missing {len(db_out)} starting DBs: PASSING/EXPLOSIVE-PLAY DEFENSE DOWNGRADE (in model)", 1))
    # 3) weather
    if wx_summary.get("status") == "UNKNOWN":
        flags.append(Flag("WX_UNKNOWN", "Outdoor game, forecast not available: WEATHER = UNKNOWN", 2, markets=("total",)))
        flags.append(Flag("WX_UNKNOWN_S", "Weather unknown (minor for sides)", 1, markets=("spread", "moneyline")))
    elif wx_summary.get("status") == "EARLY FORECAST" and wx_summary.get("impact") in ("medium", "high"):
        flags.append(Flag("WX_EARLY", "Weather could matter but forecast is >48h out", 2, markets=("total",)))
    # 4) early season / market disagreement
    if int(row["week"]) <= 2 and row.get("game_type") == "REG":
        flags.append(Flag("EARLY_SEASON", "Weeks 1-2: ratings still lean on the 2025 baseline", 1))
    if market.margin is not None and abs(raw_margin - market.margin) >= 6:
        flags.append(Flag("BIG_DISAGREE", f"Model is {raw_margin - market.margin:+.1f} pts off the market: usually means "
                          "news the model lacks (QB/injury/suspension). Verify before betting", 2, markets=("spread", "moneyline")))
    if market.total is not None and abs(raw_total - market.total) >= 6:
        flags.append(Flag("BIG_DISAGREE_T", f"Model total {raw_total - market.total:+.1f} vs market: verify weather/injuries", 2,
                          markets=("total",)))
    return flags


# ---------------------------------------------------------------------------------------------
def analyze(game_id: str, hr: HardRockLines | None = None, qb_overrides: dict | None = None,
            avail_overrides: dict | None = None, books: dict | None = None, weather: dict | None = None,
            bankroll: float = 1000.0, kelly_mult: float = 0.25, max_bet_pct: float = 0.02,
            thresholds: dict | None = None, now: dt.datetime | None = None, include_context: bool = True) -> dict:
    st = pipeline.state
    thresholds = thresholds or DEFAULT_THRESHOLDS
    f = st.features
    sel = f[f["game_id"] == game_id]
    if sel.empty:
        raise KeyError(game_id)
    row = sel.iloc[0].copy()
    home, away = row["home_team"], row["away_team"]
    season, week = int(row["season"]), int(row["week"])
    now = now or dt.datetime.now(dt.timezone.utc)
    ko = kickoff_utc(row)
    hours = (ko - now).total_seconds() / 3600.0
    qb_overrides = qb_overrides or {}
    qb_confirmed = {}
    for side in ("home", "away"):
        ov = qb_overrides.get(side)
        if ov:
            if ov.get("qb_id") and ov.get("qb_id") != row.get(f"{side}_qb_id_used"):
                row = apply_qb_override(st, row, side, ov["qb_id"])
                row[f"{side}_qb_name"] = ov.get("qb_name") or row.get(f"{side}_qb_name")
            qb_confirmed[side] = bool(ov.get("confirmed"))

    players = st.availability_players
    players = players[players["game_id"] == game_id] if not players.empty else players
    row, players = apply_availability_overrides(st, row, players, avail_overrides or {})

    indoor = bool(row.get("indoor", 0) == 1)
    from kuze.data.weather import classify
    wx_summary = classify(weather, indoor, hours)
    row = apply_weather(row, weather)

    model: GM.GameModel = st.model
    pred = model.predict(row.to_frame().T).iloc[0]
    raw_margin, raw_total = float(pred["model_margin"]), float(pred["model_total"])

    km = st.keynum
    if books:
        from kuze.data.odds import SHARP_BOOKS
        market = consensus(km, books, SHARP_BOOKS, exclude=("hardrockbet",))
        if market.margin is None:
            market = schedule_market(km, row)
    else:
        market = schedule_market(km, row)
    fair = model.fair_lines(raw_margin, raw_total, market.margin, market.total, hours)
    fm, ft = fair["fair_margin"], fair["fair_total"]

    k, pk = km.margin_pmf(fm)
    ml_home = moneyline_outcome(k, pk, +1)
    p_home = ml_home.win_no_push
    from kuze.models.distributions import spread_outcome, total_outcome
    fair_home_line = fair_spread_line(k, pk, spread_outcome)
    t_sup, t_pmf = km.total_pmf(ft)
    fair_tot_line = fair_total_line(t_sup, t_pmf, total_outcome)
    report = {
        "game": {"game_id": game_id, "season": season, "week": week, "home": home, "away": away,
                 "kickoff_utc": ko.isoformat(), "hours_to_kickoff": round(hours, 1),
                 "stadium": row.get("stadium"), "roof": row.get("roof"), "neutral": bool(row.get("neutral", 0)),
                 "home_qb": row.get("home_qb_name"), "away_qb": row.get("away_qb_name"),
                 "game_type": row.get("game_type"), "weekday": row.get("weekday")},
        "hard_rock": asdict(hr) if hr else None,
        "market": market.as_dict() | {"spread_line": _num(row.get("spread_line")), "total_line": _num(row.get("total_line")),
                                      "home_ml": _num(row.get("home_moneyline")), "away_ml": _num(row.get("away_moneyline"))},
        "model": {
            "raw_margin": round(raw_margin, 2), "raw_total": round(raw_total, 2),
            "fair_margin": round(fm, 2), "fair_total": round(ft, 2),
            "beta_spread": round(fair["beta_spread"], 3), "beta_total": round(fair["beta_total"], 3),
            "fair_spread": {"home": fair_home_line, "away": -fair_home_line,
                            "text": fmt_spread(home if fair_home_line <= 0 else away, -abs(fair_home_line))},
            "fair_total_line": fair_tot_line,
            "win_prob": {"home": round(p_home, 4), "away": round(1 - p_home, 4)},
            "fair_ml": {"home": round(B.prob_to_american(p_home)), "away": round(B.prob_to_american(1 - p_home))},
            "projection": {home: round((ft + fm) / 2, 1), away: round((ft - fm) / 2, 1)},
            "raw_projection": {home: round(float(pred["model_home_pts"]), 1), away: round(float(pred["model_away_pts"]), 1)},
            "version": model.version, "trained_through": model.trained_through,
        },
    }

    flags = confidence_flags(st, row, players, raw_margin, raw_total, market, hours, wx_summary, qb_confirmed)
    conf = {m: data_confidence(flags, m) for m in ("spread", "moneyline", "total")}
    report["confidence"] = {"by_market": conf, "flags": [fl.as_dict() for fl in flags]}
    swing = sum(fl.swing for fl in flags)

    bets = _evaluate_bets(km, fm, ft, hr, home, away, conf, thresholds, bankroll, kelly_mult, max_bet_pct, swing, market)
    report["bets"] = bets
    ranked = sorted([b for b in bets if b["label"] in ("PLAY", "SMALLER")], key=lambda b: -b["ev"])
    report["primary"] = ranked[0] if ranked else None
    report["secondary"] = ranked[1] if len(ranked) > 1 and ranked[1]["market"] != ranked[0]["market"] else None
    report["final"] = {lab: [b["selection"] for b in bets if b["label"] == lab]
                       for lab in ("PLAY", "SMALLER", "LEAN", "PASS", "UNKNOWN")}
    report["final"]["summary"] = _summary(report, bets)

    margins, totals = MU.simulate_scores(km, fm, ft)
    report["scripts"] = MU.scripts(margins, totals, fm, ft, home, away)
    report["injuries"] = _injury_section(players, home, away, model)
    report["environment"] = _environment(row, wx_summary, hours)
    if include_context:
        report.update(_context(st, row, season, week, home, away))
    report["explain"] = {"margin": model.contributions(row, "margin"), "total": model.contributions(row, "total")}
    return _jsonable(report)


def _evaluate_bets(km, fm, ft, hr, home, away, conf, thresholds, bankroll, kelly_mult, max_bet_pct, swing, market) -> list[dict]:
    bets = []

    def finish(ev: B.BetEval, kind: str, th_fn, extra: dict):
        c = conf[kind if kind != "total" else "total"]
        edge_vs_swing = None
        if swing > 0 and kind in ("spread", "moneyline"):
            # how many points of cushion the bet has vs what unresolved news could move
            edge_vs_swing = extra.get("edge_pts", 0) / swing if swing else None
        lab = label_bet(ev.ev, kind, c, edge_vs_swing, thresholds)
        st_ = stake(ev.kelly, lab, c, bankroll, kelly_mult, max_bet_pct)
        d = ev.as_dict() | {"label": lab, "confidence": c, "stake": st_, "thresholds": th_fn(), **extra}
        d["win_pct_no_push"] = round(ev.win / max(ev.win + ev.loss, 1e-9), 4)
        bets.append(d)

    if hr and hr.home_spread is not None:
        for side, team, line, odds in (("home", home, hr.home_spread, hr.home_spread_odds or -110),
                                       ("away", away, hr.away_spread if hr.away_spread is not None else -hr.home_spread,
                                        hr.away_spread_odds or -110)):
            ev = B.eval_spread(km, fm, side, team, line, odds)
            team_margin = fm if side == "home" else -fm
            edge_pts = team_margin + line  # model margin cushion over the number
            th = lambda side=side, odds=odds: {k: v for k, v in B.spread_thresholds(
                km, fm, side, odds, thresholds["spread"]["play"], thresholds["spread"]["lean"]).items()}
            mk_edge = None
            if market.margin is not None:
                mk_margin = market.margin if side == "home" else -market.margin
                mk_edge = round(mk_margin + line, 2)  # >0: Hard Rock number is better than the market's fair
            finish(ev, "spread", th, {"team": team, "side": side, "edge_pts": round(edge_pts, 2), "vs_market_pts": mk_edge})
    if hr and hr.home_ml is not None and hr.away_ml is not None:
        k, p = km.margin_pmf(fm)
        for side, team, odds in (("home", home, hr.home_ml), ("away", away, hr.away_ml)):
            ev = B.eval_moneyline(km, fm, side, team, odds)
            wp = ev.win / max(ev.win + ev.loss, 1e-9)
            th = lambda wp=wp: {k2: (round(v) if v == v else None) for k2, v in B.ml_thresholds(
                wp, thresholds["moneyline"]["play"], thresholds["moneyline"]["lean"]).items()}
            no_vig = B.devig(hr.home_ml, hr.away_ml, "power")
            finish(ev, "moneyline", th, {"team": team, "side": side, "model_prob": round(wp, 4),
                                          "implied_prob": round(B.implied_prob(odds), 4),
                                          "no_vig_prob": round(no_vig[0] if side == "home" else no_vig[1], 4),
                                          "edge_pts": round((fm if side == "home" else -fm), 2)})
    if hr and hr.total is not None:
        for side, odds in (("over", hr.over_odds or -110), ("under", hr.under_odds or -110)):
            ev = B.eval_total(km, ft, side, hr.total, odds)
            th = lambda side=side, odds=odds: B.total_thresholds(km, ft, side, odds, thresholds["total"]["play"],
                                                                  thresholds["total"]["lean"])
            edge = (ft - hr.total) if side == "over" else (hr.total - ft)
            mk_edge = None
            if market.total is not None:
                mk_edge = round((market.total - hr.total) if side == "over" else (hr.total - market.total), 2)
            finish(ev, "total", th, {"side": side, "edge_pts": round(edge, 2), "vs_market_pts": mk_edge})
    if not hr or all(getattr(hr, a) is None for a in ("home_spread", "home_ml", "total")):
        bets.append({"market": "all", "selection": "No Hard Rock lines entered", "label": "UNKNOWN", "ev": 0.0,
                     "reason": "Enter the exact Hard Rock numbers to evaluate bets."})
    return bets


def _summary(report: dict, bets: list[dict]) -> str:
    m = report["model"]
    g = report["game"]
    parts = [f"Model fair line {m['fair_spread']['text']}, total {m['fair_total_line']:g}, "
             f"{g['home']} win prob {m['win_prob']['home']:.0%}."]
    plays = [b for b in bets if b.get("label") in ("PLAY", "SMALLER")]
    if plays:
        b = max(plays, key=lambda x: x["ev"])
        parts.append(f"Best value: {b['selection']} ({B.fmt_american(b['odds'])}) EV {b['ev']:+.1%}.")
    elif any(b.get("label") == "UNKNOWN" for b in bets):
        parts.append("Critical information missing: resolve UNKNOWN items before betting.")
    else:
        parts.append("No bet clears the edge threshold at the Hard Rock prices: PASS THE GAME.")
    return " ".join(parts)


def _injury_section(players: pd.DataFrame, home: str, away: str, model: GM.GameModel) -> dict:
    out = {}
    if players is None or players.empty:
        return {home: [], away: [], "note": "no availability data"}
    for team in (home, away):
        p = players[(players["team"] == team) & ((players["p_play"] < 0.95) | (players["delta"].abs() >= 0.3))]
        rows = []
        for _, r in p.sort_values("delta").iterrows():
            # points of this team's margin per unit of availability (same for home/away by symmetry)
            coef = model.coef_points(f"d_av_{r['group']}", "margin") if r["group"] in GM.AV_GROUPS else 0.0
            rows.append({"player": r["player"], "position": r["position"], "status": r["status"],
                         "kind": _status_kind(r["status"]),
                         "p_play": round(float(r["p_play"]), 2), "role": round(float(r["role"]), 2),
                         "delta": round(float(r["delta"]), 2),
                         "impact_pts": round(float(coef * r["delta"]), 2)})
        out[team] = {"injuries": [x for x in rows if x["kind"] == "injury"],
                     "returning": [x for x in rows if x["kind"] == "active" and x["delta"] > 0.2],
                     "departed": [x for x in rows if x["kind"] == "departed"],
                     "total_impact_pts": round(sum(x["impact_pts"] for x in rows), 2)}
    return out


def _environment(row: pd.Series, wx: dict, hours: float) -> dict:
    stadium = STADIUMS.get(row.get("stadium_id"))
    return {
        "weather": wx,
        "schedule": {"home_rest": _num(row.get("rest_diff")), "rest_diff_days": _num(row.get("rest_diff")),
                     "home_bye": bool(row.get("home_bye")), "away_bye": bool(row.get("away_bye")),
                     "home_short_week": bool(row.get("home_short")), "away_short_week": bool(row.get("away_short")),
                     "away_travel_miles": round(float(row.get("away_travel_k", 0)) * 1000),
                     "away_tz_shift_hours": _num(row.get("away_tz_shift")),
                     "away_body_clock_early": bool(row.get("away_early_body")),
                     "divisional": bool(row.get("div_game")), "primetime": bool(row.get("primetime")),
                     "altitude": bool(row.get("altitude")), "neutral_site": bool(row.get("neutral")),
                     "note": "Rest/travel/body-clock are shown for context; in backtests they added no value beyond "
                             "the market once team strength was known, so the model does not use them."},
        "pace": {"home_neutral_sec_per_play": None, "combined_pace_vs_avg": _num(row.get("s_pace")),
                 "combined_plays_vs_avg": _num(row.get("s_plays")), "combined_proe": _num(row.get("s_proe")),
                 "classification": ("Fast" if (row.get("s_pace") or 0) < -1.0 else "Slow" if (row.get("s_pace") or 0) > 1.0 else "Average")},
        "stadium": {"name": row.get("stadium"), "roof": row.get("roof"),
                    "elevation_ft": stadium.elevation_ft if stadium else None},
    }


def _context(st, row, season, week, home, away) -> dict:
    ts = team_stats(st, season)
    ftn = st.cache().get(("ftn", season))
    ctx = {"baseline": {}, "current": {}, "qb": {}}
    for team in (home, away):
        ctx["baseline"][team] = ts.summary(team, season - 1)
        ctx["current"][team] = {"season": ts.summary(team, season), "last3": ts.summary(team, season, 3, seasons_back=1),
                                "last5": ts.summary(team, season, 5, seasons_back=1),
                                "home": ts.summary(team, season, home=True), "road": ts.summary(team, season, home=False)}
    for side, team in (("home", home), ("away", away)):
        qb_id = row.get(f"{side}_qb_id_used")
        ctx["qb"][team] = {
            "name": row.get(f"{side}_qb_name"), "gsis_id": qb_id,
            "model_value_epa": round(float(row.get(f"{side}_qb_value", 0) or 0), 3),
            "delta_vs_recent": round(float(row.get(f"{side}_qb_delta", 0) or 0), 3),
            "career_qb_plays": int(row.get(f"{side}_qb_plays", 0) or 0),
            "current": ts.qb_summary(qb_id, season, ftn=ftn), "last3": ts.qb_summary(qb_id, season, 3, ftn=ftn),
            "baseline": ts.qb_summary(qb_id, season - 1, ftn=ftn),
        }
    rt = ratings_snapshot(st, season, week)
    ctx["matchups"] = {"exploits": MU.exploits(rt, home, away),
                       "ol_vs_rush": [MU.pass_rush_verdict(rt, home, away), MU.pass_rush_verdict(rt, away, home)],
                       "ratings": _ratings_rows(rt, [home, away])}
    ctx["turnovers"] = {}
    for team in (home, away):
        s = ctx["current"][team]["season"]
        b = ctx["baseline"][team]
        flag = None
        if s.get("games") and abs(s.get("fumble_recovery_luck", 0)) >= 2:
            flag = "REGRESSION FLAG: fumble-recovery luck of %+.1f turnovers" % s["fumble_recovery_luck"]
        elif s.get("games") and abs(s.get("to_margin", 0)) / max(s["games"], 1) >= 1.0:
            flag = "REGRESSION FLAG: turnover margin %+d in %d games is not sustainable" % (s["to_margin"], s["games"])
        ctx["turnovers"][team] = {"to_margin": s.get("to_margin"), "giveaways": s.get("giveaways"),
                                  "takeaways": s.get("takeaways"), "baseline_to_margin": b.get("to_margin"), "flag": flag}
    return ctx


def _ratings_rows(rt: pd.DataFrame, teams: list[str]) -> dict:
    cols = [c for c in rt.columns if c.startswith(("off_", "def_"))]
    out = {}
    for t in teams:
        r = rt[rt["team"] == t].iloc[0]
        out[t] = {c: round(float(r[c]), 4) for c in cols}
    ranks = {}
    for c in cols:
        m = c.split("_", 1)[1]
        higher_better_off = m not in ("sack_rate", "int_rate", "fum_rate", "pace")
        asc = not higher_better_off if c.startswith("off_") else higher_better_off
        rk = rt.set_index("team")[c].rank(ascending=asc, method="min")
        ranks[c] = {t: int(rk[t]) for t in teams}
    return {"values": out, "ranks": ranks}


def _jsonable(o):
    if isinstance(o, dict):
        return {str(k): _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        v = float(o)
        return None if math.isnan(v) or math.isinf(v) else v
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp, dt.datetime, dt.date)):
        return o.isoformat()
    if o is pd.NaT or (hasattr(pd, "NA") and o is pd.NA):
        return None
    return o
