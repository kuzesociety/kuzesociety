from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from kuze import services
from kuze.api.auth import current_user
from kuze.api.deps import require_ready
from kuze.db.models import PropLine, User
from kuze.db.session import get_db
from kuze.learning.feedback import current_thresholds
from kuze.pipeline import pipeline
from kuze.props import model as PM
from kuze.props.engine import engine
from kuze.props.sgp import SCRIPT_TEMPLATES, Leg, SGPSimulator

router = APIRouter(prefix="/api/games/{game_id}", tags=["props"], dependencies=[Depends(require_ready)])


class PropLineIn(BaseModel):
    player_id: str
    stat: str                       # one of PM.STATS or "anytime_td"
    line: float | None = None
    over_odds: float | None = None  # for anytime TD: the "yes" price
    under_odds: float | None = None


class SGPLegIn(BaseModel):
    kind: str                       # spread / moneyline / total / player
    side: str
    line: float | None = None
    team: str | None = None
    player_id: str | None = None
    stat: str | None = None


class SGPIn(BaseModel):
    legs: list[SGPLegIn]
    odds: float | None = None       # Hard Rock SGP price


def _need_engine():
    if engine.state is None:
        raise HTTPException(503, "props engine is still building")


def latest_prop_lines(db: Session, game_id: str) -> list[PropLine]:
    rows = db.scalars(select(PropLine).where(PropLine.game_id == game_id).order_by(desc(PropLine.created_at))).all()
    seen, out = set(), []
    for r in rows:
        key = (r.player_id, r.stat)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def priced_props(db: Session, game_id: str) -> list[dict]:
    th = current_thresholds(db)
    out = []
    for pl in latest_prop_lines(db, game_id):
        try:
            pr = engine.price(game_id, pl.player_id, pl.stat, pl.line if pl.line is not None else 0.5, pl.over_odds,
                              pl.under_odds, th)
        except KeyError:
            continue
        out.append({"id": pl.id, "player_id": pl.player_id, "player": pl.player_name, "stat": pl.stat, "line": pl.line,
                    "over_odds": pl.over_odds, "under_odds": pl.under_odds, "source": pl.source,
                    "entered_at": pl.created_at.isoformat(), **pr})
    return out


@router.get("/props")
def get_props(game_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _need_engine()
    players = engine.players(game_id)
    priced = priced_props(db, game_id)
    # maximum 2 props per team among PLAY/SMALLER, best EV first
    best: dict = {}
    for p in priced:
        for s in p.get("sides", []):
            if s["label"] in ("PLAY", "SMALLER"):
                team = next((x["team"] for x in players if x["player_id"] == p["player_id"]), "?")
                best.setdefault(team, []).append({"player": p["player"], "stat": p["stat"], "line": p["line"],
                                                  "side": s["side"], "odds": s["odds"], "ev": s["ev"], "label": s["label"]})
    for t in best:
        best[t] = sorted(best[t], key=lambda x: -x["ev"])[:2]
    return {"players": players, "lines": priced, "best_by_team": best, "stats": {k: v for k, v in
            {s: PM.STATS[s][0] for s in PM.STATS}.items()}}


@router.post("/props/lines")
def post_prop_line(game_id: str, body: PropLineIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _need_engine()
    if body.stat != "anytime_td" and body.stat not in PM.STATS:
        raise HTTPException(400, f"unknown stat {body.stat}")
    if body.stat != "anytime_td" and body.line is None:
        raise HTTPException(400, "line is required")
    try:
        row = engine._row(game_id, body.player_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    db.add(PropLine(game_id=game_id, player_id=row["player_id"], player_name=row["name"], stat=body.stat, line=body.line,
                    over_odds=body.over_odds, under_odds=body.under_odds, source="manual"))
    db.commit()
    return {"lines": priced_props(db, game_id)}


@router.delete("/props/lines/{line_id}")
def delete_prop_line(game_id: str, line_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(PropLine, line_id)
    if row and row.game_id == game_id:
        for r in db.scalars(select(PropLine).where(PropLine.game_id == game_id, PropLine.player_id == row.player_id,
                                                   PropLine.stat == row.stat)):
            db.delete(r)
        db.commit()
    return {"lines": priced_props(db, game_id)}


@router.post("/props/price")
def price_prop(game_id: str, body: PropLineIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _need_engine()
    try:
        return engine.price(game_id, body.player_id, body.stat, body.line if body.line is not None else 0.5,
                            body.over_odds, body.under_odds, current_thresholds(db))
    except KeyError as exc:
        raise HTTPException(404, str(exc))


@router.get("/td")
def td_board(game_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _need_engine()
    players = [p for p in engine.players(game_id) if p["position"] in ("RB", "WR", "TE", "QB")]
    players.sort(key=lambda p: -(p["td"]["p_anytime"] or 0))
    td_lines = {pl.player_id: pl for pl in latest_prop_lines(db, game_id) if pl.stat == "anytime_td"}
    th = current_thresholds(db)
    from kuze.analysis.recommend import label_bet
    from kuze.models import betting as B
    rows = []
    for p in players:
        item = {"player_id": p["player_id"], "name": p["name"], "position": p["position"], "team": p["team"],
                "status": p["status"], "p_play": p["p_play"], **p["td"], "usage": p["usage"]}
        pl = td_lines.get(p["player_id"])
        if pl and pl.over_odds is not None:
            prob = p["td"]["p_anytime"] or 0.0
            ev = prob * (B.american_to_decimal(pl.over_odds) - 1) - (1 - prob)
            item["hard_rock"] = {"odds": pl.over_odds, "implied": B.implied_prob(pl.over_odds), "ev": ev,
                                 "label": label_bet(ev, "td", "MEDIUM+" if (p["p_play"] or 0) >= 0.95 else "LOW", None, th),
                                 "line_id": pl.id}
        rows.append(item)
    return {"players": rows, "note": "Anytime TD is volatile and high-hold: not a primary play unless the edge is large. "
                                     "QB-trust and contract features were each validated out of sample (small but real "
                                     "gains in log loss); 'scored recently' is not predictive."}


def _leg(game_id: str, home: str, away: str, spec: SGPLegIn) -> Leg:
    if spec.kind in ("spread", "moneyline"):
        team = spec.team or (home if spec.side == "home" else away)
        return Leg(spec.kind, spec.side, spec.line, team=team)
    if spec.kind == "total":
        return Leg("total", spec.side, spec.line)
    r = engine._row(game_id, spec.player_id)
    proj = float(r[f"proj_{spec.stat}"])
    return Leg("player", spec.side, spec.line, team=r["team"], stat=spec.stat, position=r["position"], projection=proj,
               player=r["name"], dist=engine.state.model.dist(spec.stat, r["position"]))


@router.post("/sgp")
def eval_sgp(game_id: str, body: SGPIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _need_engine()
    rep = services.analyze_game(db, game_id, user, include_context=False, log_prediction=False)
    home, away = rep["game"]["home"], rep["game"]["away"]
    try:
        legs = [_leg(game_id, home, away, s) for s in body.legs]
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    sim = SGPSimulator(pipeline.state.keynum)
    out = sim.simulate(home, away, rep["model"]["fair_margin"], rep["model"]["fair_total"], legs, sgp_odds=body.odds)
    if body.odds is not None:
        from kuze.analysis.recommend import label_bet
        out["label"] = label_bet(out["ev"], "sgp", "MEDIUM+", None, current_thresholds(db))
    if len(legs) > 4:
        out["warning"] = "More than 4 legs: every extra leg compounds the book's hold. Prefer 3-4 legs."
    return out


@router.get("/sgp/suggestions")
def sgp_suggestions(game_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Script-consistent SGPs built from the Hard Rock prop lines entered for this game."""
    _need_engine()
    rep = services.analyze_game(db, game_id, user, include_context=False, log_prediction=False)
    home, away = rep["game"]["home"], rep["game"]["away"]
    fm, ft = rep["model"]["fair_margin"], rep["model"]["fair_total"]
    fav, dog = (home, away) if fm >= 0 else (away, home)
    hr = rep.get("hard_rock") or {}
    lines = latest_prop_lines(db, game_id)
    players = {p["player_id"]: p for p in engine.players(game_id)}
    sim = SGPSimulator(pipeline.state.keynum)
    scripts = {s["code"]: s for s in rep.get("scripts", [])}
    out = []
    for code, tpl in SCRIPT_TEMPLATES.items():
        legs, used = [], set()
        for kind, who in tpl["game"]:
            if kind == "spread" and hr.get("home_spread") is not None:
                team = fav if who == "fav" else dog
                line = hr["home_spread"] if team == home else hr["away_spread"]
                legs.append(Leg("spread", "home" if team == home else "away", line, team=team))
            elif kind == "moneyline" and hr.get("home_ml") is not None:
                team = fav if who == "fav" else dog
                legs.append(Leg("moneyline", "home" if team == home else "away", None, team=team))
            elif kind == "total" and hr.get("total") is not None:
                legs.append(Leg("total", who, hr["total"]))
        for who, pos, stat, side in tpl["players"]:
            team = fav if who == "fav" else dog
            cands = [pl for pl in lines if pl.stat == stat and pl.player_id in players and players[pl.player_id]["team"] == team
                     and players[pl.player_id]["position"] == pos and pl.player_id not in used]
            if not cands:
                continue
            pl = cands[0]
            used.add(pl.player_id)
            p = players[pl.player_id]
            r = engine._row(game_id, pl.player_id)
            legs.append(Leg("player", side, pl.line, team=team, stat=stat, position=pos, projection=float(r[f"proj_{stat}"]),
                            player=p["name"], dist=engine.state.model.dist(stat, pos),
                            odds=pl.over_odds if side == "over" else pl.under_odds))
        if len(legs) < 3:
            continue
        res = sim.simulate(home, away, fm, ft, legs[:4])
        res.update({"script": code, "name": tpl["name"], "script_prob": scripts.get(code, {}).get("prob")})
        out.append(res)
    out.sort(key=lambda x: -x["joint_prob"] * (x["correlation_lift"] or 1))
    return {"suggestions": out, "note": "Enter the Hard Rock SGP price to get EV. Books price correlation into SGPs and "
                                        "usually hold 20%+: most SGPs are -EV; bet only when fair odds beat the offer."}
