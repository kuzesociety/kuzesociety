from __future__ import annotations

import os
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from kuze.api.auth import COOKIE, TOKEN_DAYS, current_user, hash_password, make_token, verify_password
from kuze.db.models import User
from kuze.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class SettingsIn(BaseModel):
    bankroll: float | None = None
    kelly_mult: float | None = None
    max_bet_pct: float | None = None
    unit_size: float | None = None
    display_name: str | None = None
    new_password: str | None = None


def _me(u: User) -> dict:
    return {"id": u.id, "username": u.username, "display_name": u.display_name or u.username, "bankroll": u.bankroll,
            "kelly_mult": u.kelly_mult, "max_bet_pct": u.max_bet_pct, "unit_size": u.unit_size}


# failed logins per client IP (in memory): 10 misses in 15 minutes locks that IP out for the window
_FAILS: dict[str, list[float]] = {}
MAX_FAILS, FAIL_WINDOW = 10, 900.0


def _recent_fails(ip: str) -> list[float]:
    now = time.time()
    _FAILS[ip] = [t for t in _FAILS.get(ip, []) if now - t < FAIL_WINDOW]
    return _FAILS[ip]


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    if len(_recent_fails(ip)) >= MAX_FAILS:
        raise HTTPException(429, "too many failed logins - try again in 15 minutes")
    u = db.scalar(select(User).where(User.username == body.username))
    if u is None or u.username == "system" or not verify_password(body.password, u.password_hash):
        _FAILS[ip].append(time.time())
        raise HTTPException(401, "wrong username or password")
    token = make_token(u)
    secure = request.url.scheme == "https" or os.environ.get("KUZE_SECURE_COOKIES") == "1"
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=secure, max_age=TOKEN_DAYS * 86400)
    return {"token": token, "user": _me(u)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return _me(user)


@router.put("/settings")
def update_settings(body: SettingsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    u = db.get(User, user.id)
    for k in ("bankroll", "kelly_mult", "max_bet_pct", "unit_size", "display_name"):
        v = getattr(body, k)
        if v is not None:
            setattr(u, k, v)
    if body.new_password:
        if len(body.new_password) < 8:
            raise HTTPException(400, "password must be at least 8 characters")
        u.password_hash = hash_password(body.new_password)
    if not (0 < u.kelly_mult <= 1) or not (0 < u.max_bet_pct <= 0.1):
        raise HTTPException(400, "kelly_mult must be in (0,1] and max_bet_pct in (0,0.1]")
    db.commit()
    return _me(u)
