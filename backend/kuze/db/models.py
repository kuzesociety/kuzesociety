"""SQLite (SQLAlchemy 2.0) schema: users, lines & line history, predictions log, bets, learning state."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64), default="")
    password_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    bankroll: Mapped[float] = mapped_column(Float, default=1000.0)
    kelly_mult: Mapped[float] = mapped_column(Float, default=0.25)
    max_bet_pct: Mapped[float] = mapped_column(Float, default=0.02)
    unit_size: Mapped[float] = mapped_column(Float, default=10.0)


class HardRockLine(Base):
    """Every Hard Rock line entry is kept: the latest is 'current', the history is line movement."""
    __tablename__ = "hr_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    home_spread: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_spread_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    away_spread: Mapped[float | None] = mapped_column(Float, nullable=True)
    away_spread_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    away_ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    total: Mapped[float | None] = mapped_column(Float, nullable=True)
    over_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    under_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")
    entered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class MarketSnapshot(Base):
    """Consensus / individual-book market state over time (opening vs current vs closing, CLV)."""
    __tablename__ = "market_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    source: Mapped[str] = mapped_column(String(32))          # consensus / nflverse / <book key>
    margin: Mapped[float | None] = mapped_column(Float, nullable=True)   # implied expected home margin
    total: Mapped[float | None] = mapped_column(Float, nullable=True)    # implied expected total
    home_spread: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_spread_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    away_spread_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_line: Mapped[float | None] = mapped_column(Float, nullable=True)
    over_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    under_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    away_ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    taken_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Prediction(Base):
    """Every model run on a game is logged: the learning loop fits blend weights from these."""
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    model_version: Mapped[str] = mapped_column(String(32))
    raw_margin: Mapped[float] = mapped_column(Float)
    raw_total: Mapped[float] = mapped_column(Float)
    fair_margin: Mapped[float] = mapped_column(Float)
    fair_total: Mapped[float] = mapped_column(Float)
    market_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    hours_to_kickoff: Mapped[float | None] = mapped_column(Float, nullable=True)
    taken_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PropLine(Base):
    __tablename__ = "prop_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    player_id: Mapped[str] = mapped_column(String(32), index=True)
    player_name: Mapped[str] = mapped_column(String(64))
    stat: Mapped[str] = mapped_column(String(32))
    line: Mapped[float | None] = mapped_column(Float, nullable=True)      # None for anytime TD
    over_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    under_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PropPrediction(Base):
    __tablename__ = "prop_predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    player_id: Mapped[str] = mapped_column(String(32), index=True)
    stat: Mapped[str] = mapped_column(String(32))
    projection: Mapped[float] = mapped_column(Float)
    line: Mapped[float | None] = mapped_column(Float, nullable=True)
    p_over: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    taken_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("game_id", "player_id", "stat", name="uq_prop_pred"),)


class Bet(Base):
    __tablename__ = "bets"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    market: Mapped[str] = mapped_column(String(16))           # spread / moneyline / total / prop / td / sgp
    side: Mapped[str | None] = mapped_column(String(16), nullable=True)   # home/away/over/under/yes
    selection: Mapped[str] = mapped_column(String(160))
    player_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    stat: Mapped[str | None] = mapped_column(String(32), nullable=True)
    line: Mapped[float | None] = mapped_column(Float, nullable=True)
    odds: Mapped[float] = mapped_column(Float)
    stake: Mapped[float] = mapped_column(Float)
    model_prob: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_ev: Mapped[float | None] = mapped_column(Float, nullable=True)
    fair_line: Mapped[float | None] = mapped_column(Float, nullable=True)
    label: Mapped[str | None] = mapped_column(String(16), nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    legs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    placed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # filled after the game
    closing_line: Mapped[float | None] = mapped_column(Float, nullable=True)
    closing_odds: Mapped[float | None] = mapped_column(Float, nullable=True)
    clv_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    clv_prob: Mapped[float | None] = mapped_column(Float, nullable=True)    # no-vig prob at close - breakeven at bet price
    result: Mapped[str] = mapped_column(String(8), default="pending")   # win / loss / push / void / pending
    profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    graded_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    user: Mapped[User] = relationship()


class QBOverride(Base):
    __tablename__ = "qb_overrides"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[str] = mapped_column(String(8))
    qb_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    qb_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    set_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("game_id", "side", name="uq_qb_override"),)


class InjuryOverride(Base):
    __tablename__ = "injury_overrides"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    player: Mapped[str] = mapped_column(String(64))     # gsis id or display name
    p_play: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    set_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("game_id", "player", name="uq_injury_override"),)


class KV(Base):
    """Learning state and misc settings (JSON values)."""
    __tablename__ = "kv"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AnalystReport(Base):
    __tablename__ = "analyst_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(String(32), index=True)
    model: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JobRun(Base):
    __tablename__ = "job_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16))
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
