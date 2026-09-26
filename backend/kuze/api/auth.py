"""Tiny two-user auth: bcrypt passwords, JWT in an HttpOnly cookie (or Bearer header)."""
from __future__ import annotations

import datetime as dt
import os

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from kuze.config import settings
from kuze.db.models import User
from kuze.db.session import get_db

COOKIE = "kuze_token"
TOKEN_DAYS = 30


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user: User) -> str:
    payload = {"sub": str(user.id), "name": user.username,
               "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not logged in")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid session")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown user")
    return user


def seed_users(db: Session) -> list[str]:
    """Create users from KUZE_USERS="name:password,name2:password2" (existing users are left alone)."""
    spec = os.environ.get("KUZE_USERS", "")
    created = []
    for item in filter(None, (s.strip() for s in spec.split(","))):
        if ":" not in item:
            continue
        name, pw = item.split(":", 1)
        if db.scalar(select(User).where(User.username == name)) is None:
            db.add(User(username=name, display_name=name, password_hash=hash_password(pw)))
            created.append(name)
    db.commit()
    return created
