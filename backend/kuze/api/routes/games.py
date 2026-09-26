from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from kuze import services
from kuze.api.auth import current_user
from kuze.api.deps import require_ready
from kuze.db.models import AnalystReport, InjuryOverride, QBOverride, User, utcnow
from kuze.db.session import get_db
from kuze.pipeline import pipeline

router = APIRouter(prefix="/api", tags=["games"], dependencies=[Depends(require_ready)])


class LinesIn(BaseModel):
    home_spread: float | None = Field(None, description="home team's spread, e.g. -3.5")
    home_spread_odds: float | None = None
    away_spread: float | None = None
    away_spread_odds: float | None = None
    home_ml: float | None = None
    away_ml: float | None = None
    total: float | None = None
    over_odds: float | None = None
    under_odds: float | None = None


class QBIn(BaseModel):
    side: str                       # home / away
    qb_id: str | None = None        # gsis id; or give qb_name
    qb_name: str | None = None
    confirmed: bool = True


class InjuryIn(BaseModel):
    player: str                     # gsis id or display name
    p_play: float = Field(..., ge=0, le=1)
    note: str | None = None


class AnalystIn(BaseModel):
    notes: str | None = None
    web_search: bool = True


@router.get("/slate")
def get_slate(season: int | None = None, week: int | None = None, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    return services.slate(db, user, season, week)


@router.get("/games/{game_id}")
def get_game(game_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        return services.analyze_game(db, game_id, user)
    except KeyError:
        raise HTTPException(404, f"unknown game {game_id}")


@router.post("/games/{game_id}/lines")
def post_lines(game_id: str, body: LinesIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_game(game_id)
    for k in ("home_spread_odds", "away_spread_odds", "home_ml", "away_ml", "over_odds", "under_odds"):
        v = getattr(body, k)
        if v is not None and -100 < v < 100:
            raise HTTPException(400, f"{k}: American odds must be <= -100 or >= +100")
    services.save_hr_lines(db, game_id, body.model_dump(exclude_none=True), user)
    return services.analyze_game(db, game_id, user)


@router.get("/games/{game_id}/lines/history")
def lines_history(game_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"hard_rock": services.hr_history(db, game_id), "market": services.market_history(db, game_id)}


@router.post("/games/{game_id}/qb")
def set_qb(game_id: str, body: QBIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_game(game_id)
    if body.side not in ("home", "away"):
        raise HTTPException(400, "side must be home or away")
    qb_id = body.qb_id or _qb_id_from_name(body.qb_name)
    row = db.scalar(select(QBOverride).where(QBOverride.game_id == game_id, QBOverride.side == body.side))
    if row is None:
        row = QBOverride(game_id=game_id, side=body.side)
        db.add(row)
    row.qb_id, row.qb_name, row.confirmed, row.set_by, row.updated_at = qb_id, body.qb_name, body.confirmed, user.username, utcnow()
    db.commit()
    return services.analyze_game(db, game_id, user)


@router.delete("/games/{game_id}/qb/{side}")
def clear_qb(game_id: str, side: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(QBOverride).where(QBOverride.game_id == game_id, QBOverride.side == side))
    if row:
        db.delete(row)
        db.commit()
    return services.analyze_game(db, game_id, user)


@router.get("/games/{game_id}/qbs")
def qb_candidates(game_id: str, user: User = Depends(current_user)):
    """QBs who played for either team recently (for the QB override picker)."""
    st = pipeline.state
    row = st.features[st.features["game_id"] == game_id]
    if row.empty:
        raise HTTPException(404, game_id)
    r = row.iloc[0]
    q = st.qb_games.sort_values(["season", "week"])
    names = _player_names()
    out = {}
    for side in ("home", "away"):
        team = r[f"{side}_team"]
        recent = q[(q["team"] == team) & (q["season"] >= int(r["season"]) - 1)]
        agg = recent.groupby("qb_id").agg(plays=("plays", "sum"), last_season=("season", "last"),
                                          last_week=("week", "last")).reset_index().sort_values("plays", ascending=False)
        agg["name"] = agg["qb_id"].map(names).fillna(agg["qb_id"])
        out[side] = {"team": team, "listed": {"qb_id": r.get(f"{side}_qb_id_used"), "name": r.get(f"{side}_qb_name")},
                     "candidates": agg.head(6).to_dict("records")}
    return out


_NAMES: dict = {}


def _player_names() -> dict:
    if not _NAMES:
        from kuze.data import nflverse as nv
        p = nv.load("players", columns=["gsis_id", "display_name"])
        _NAMES.update(dict(zip(p["gsis_id"], p["display_name"])))
    return _NAMES


@router.post("/games/{game_id}/injury")
def set_injury(game_id: str, body: InjuryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_game(game_id)
    row = db.scalar(select(InjuryOverride).where(InjuryOverride.game_id == game_id, InjuryOverride.player == body.player))
    if row is None:
        row = InjuryOverride(game_id=game_id, player=body.player)
        db.add(row)
    row.p_play, row.note, row.set_by, row.updated_at = body.p_play, body.note, user.username, utcnow()
    db.commit()
    return services.analyze_game(db, game_id, user)


@router.delete("/games/{game_id}/injury/{player}")
def clear_injury(game_id: str, player: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(InjuryOverride).where(InjuryOverride.game_id == game_id, InjuryOverride.player == player))
    if row:
        db.delete(row)
        db.commit()
    return services.analyze_game(db, game_id, user)


@router.post("/games/{game_id}/analyst")
def run_analyst(game_id: str, body: AnalystIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from kuze.analysis import analyst
    if not analyst.available():
        raise HTTPException(400, "Set ANTHROPIC_API_KEY on the server to enable the AI analyst.")
    report = services.analyze_game(db, game_id, user, log_prediction=False)
    props = None
    try:
        from kuze.api.routes.props import priced_props
        props = priced_props(db, game_id)
    except Exception:
        props = None
    try:
        out = analyst.generate(report, props, body.notes, body.web_search)
    except Exception as exc:
        raise HTTPException(502, f"analyst failed: {exc}")
    db.add(AnalystReport(game_id=game_id, model=out["model"], content=out["markdown"], created_by=user.username))
    db.commit()
    return out


@router.get("/games/{game_id}/analyst")
def list_analyst(game_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(AnalystReport).where(AnalystReport.game_id == game_id)
                      .order_by(desc(AnalystReport.created_at)).limit(5)).all()
    return [{"id": r.id, "model": r.model, "markdown": r.content, "by": r.created_by, "at": r.created_at.isoformat()}
            for r in rows]


def _check_game(game_id: str) -> None:
    f = pipeline.state.features
    if not (f["game_id"] == game_id).any():
        raise HTTPException(404, f"unknown game {game_id}")


def _qb_id_from_name(name: str | None) -> str | None:
    """Resolve a typed QB name to a gsis id (full display name first, then 'F.Last' style)."""
    if not name:
        return None
    names = _player_names()
    q = pipeline.state.qb_games.sort_values(["season", "week"])
    ids = [i for i, n in names.items() if isinstance(n, str) and n.lower() == name.strip().lower()]
    with_games = [i for i in ids if i in set(q["qb_id"])]
    if with_games or ids:
        return (with_games or ids)[0]
    last = name.split()[-1].lower()
    hit = q[q["qb_name"].fillna("").str.lower().str.endswith(last)]
    return None if hit.empty else hit.iloc[-1]["qb_id"]
