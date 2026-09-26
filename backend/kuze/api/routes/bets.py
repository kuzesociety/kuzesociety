from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from kuze.api.auth import current_user
from kuze.db.models import Bet, User, utcnow
from kuze.db.session import get_db
from kuze.learning import feedback, grading
from kuze.learning.loop import SYSTEM_USER

router = APIRouter(prefix="/api", tags=["bets"])


class BetIn(BaseModel):
    game_id: str
    market: str                     # spread / moneyline / total / prop / td / sgp
    selection: str
    odds: float
    stake: float
    side: str | None = None
    line: float | None = None
    player_id: str | None = None
    stat: str | None = None
    legs: dict | None = None
    model_prob: float | None = None
    model_ev: float | None = None
    fair_line: float | None = None
    label: str | None = None
    confidence: str | None = None
    notes: str | None = None


class BetPatch(BaseModel):
    stake: float | None = None
    odds: float | None = None
    line: float | None = None
    notes: str | None = None
    result: str | None = None       # manual grade: win / loss / push / void


def _out(b: Bet) -> dict:
    return {"id": b.id, "user": b.user.username if b.user else None, "game_id": b.game_id, "market": b.market,
            "side": b.side, "selection": b.selection, "line": b.line, "odds": b.odds, "stake": b.stake,
            "model_prob": b.model_prob, "model_ev": b.model_ev, "label": b.label, "confidence": b.confidence,
            "placed_at": b.placed_at.isoformat() if b.placed_at else None, "closing_line": b.closing_line,
            "closing_odds": b.closing_odds, "clv_points": b.clv_points, "clv_prob": b.clv_prob, "result": b.result,
            "profit": b.profit, "graded_at": b.graded_at.isoformat() if b.graded_at else None, "notes": b.notes,
            "legs": b.legs}


@router.get("/bets")
def list_bets(scope: str = "mine", status: str | None = None, limit: int = 300, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    q = select(Bet).order_by(desc(Bet.placed_at)).limit(limit)
    if scope == "mine":
        q = q.where(Bet.user_id == user.id)
    elif scope == "paper":
        sysu = db.scalar(select(User).where(User.username == SYSTEM_USER))
        q = q.where(Bet.user_id == (sysu.id if sysu else -1))
    elif scope == "team":
        sysu = db.scalar(select(User).where(User.username == SYSTEM_USER))
        if sysu:
            q = q.where(Bet.user_id != sysu.id)
    if status:
        q = q.where(Bet.result == status)
    return [_out(b) for b in db.scalars(q)]


@router.post("/bets")
def create_bet(body: BetIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.stake <= 0:
        raise HTTPException(400, "stake must be positive")
    if -100 < body.odds < 100:
        raise HTTPException(400, "American odds must be <= -100 or >= +100")
    b = Bet(user_id=user.id, **body.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return _out(b)


@router.patch("/bets/{bet_id}")
def patch_bet(bet_id: int, body: BetPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Bet, bet_id)
    if b is None or b.user_id != user.id:
        raise HTTPException(404, "bet not found")
    for k in ("stake", "odds", "line", "notes"):
        v = getattr(body, k)
        if v is not None:
            setattr(b, k, v)
    if body.result:
        from kuze.models.betting import american_to_decimal
        if body.result not in ("win", "loss", "push", "void", "pending"):
            raise HTTPException(400, "bad result")
        b.result = body.result
        b.profit = {"win": b.stake * (american_to_decimal(b.odds) - 1), "loss": -b.stake}.get(body.result, 0.0)
        b.graded_at = utcnow() if body.result != "pending" else None
    db.commit()
    return _out(b)


@router.delete("/bets/{bet_id}")
def delete_bet(bet_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Bet, bet_id)
    if b is None or b.user_id != user.id:
        raise HTTPException(404, "bet not found")
    db.delete(b)
    db.commit()
    return {"ok": True}


@router.post("/bets/grade")
def grade_now(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from kuze.pipeline import pipeline
    return grading.grade_bets(db, pipeline.state.keynum if pipeline._state else None)


@router.get("/performance")
def get_performance(scope: str = "me", user: User = Depends(current_user), db: Session = Depends(get_db)):
    if scope == "me":
        return feedback.performance(db, user.id)
    if scope == "paper":
        sysu = db.scalar(select(User).where(User.username == SYSTEM_USER))
        return feedback.performance(db, sysu.id if sysu else -1)
    return feedback.performance(db, None)
