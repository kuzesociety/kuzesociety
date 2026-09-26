"""The auto-learning loop.

Every week (and on demand) the system updates itself from what actually happened:

1. Grade bets (real + paper) -> profit and closing-line value.
2. Edge thresholds per market move with CLV evidence: if our PLAYs in a market keep losing to
   the closing line, the bar to bet that market goes up; if they beat it, it relaxes (bounded).
3. Market-blend weights (how much to trust the model vs the market, by hours to kickoff) are
   re-estimated from logged predictions vs results, with Bayesian shrinkage to the backtest.
4. Prop projections get an online multiplicative bias correction per stat from logged
   predictions vs actual stats (league passing volume drifts during a season).
5. Models are retrained with the newest games; a challenger replaces the champion only if it
   is not worse on recent out-of-sample games.
Everything is logged so the Performance page can show what changed and why.
"""
from __future__ import annotations

import datetime as dt
import logging
import math

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from kuze.analysis.recommend import DEFAULT_THRESHOLDS
from kuze.db.models import KV, Bet, Prediction, PropPrediction, utcnow

log = logging.getLogger(__name__)
THRESHOLD_KEY = "thresholds"
BLEND_KEY = "blend_live"
PROP_CORR_KEY = "prop_corrections"
MIN_BETS_FOR_ADJUST = 25


def _kv(db: Session, key: str, default=None):
    row = db.get(KV, key)
    return row.value if row else default


def _set(db: Session, key: str, value) -> None:
    row = db.get(KV, key)
    if row is None:
        db.add(KV(key=key, value=value))
    else:
        row.value = value
        row.updated_at = utcnow()
    db.commit()


def current_thresholds(db: Session) -> dict:
    stored = _kv(db, THRESHOLD_KEY)
    out = {k: dict(v) for k, v in DEFAULT_THRESHOLDS.items()}
    if stored and "values" in stored:
        for k, v in stored["values"].items():
            out.setdefault(k, {}).update(v)
    return out


def update_thresholds(db: Session) -> dict:
    """Move each market's PLAY bar by the evidence in closing-line value (shrunk by sample size)."""
    bets = db.scalars(select(Bet).where(Bet.result.in_(["win", "loss", "push"]), Bet.clv_prob.isnot(None))).all()
    by_kind: dict = {}
    for b in bets:
        kind = b.market if b.market in DEFAULT_THRESHOLDS else "prop"
        by_kind.setdefault(kind, []).append(b)
    values, notes = {}, {}
    for kind, base in DEFAULT_THRESHOLDS.items():
        rows = by_kind.get(kind, [])
        n = len(rows)
        if n < MIN_BETS_FOR_ADJUST:
            values[kind] = dict(base)
            notes[kind] = f"{n} graded bets with CLV (<{MIN_BETS_FOR_ADJUST}): using defaults"
            continue
        clv = np.array([b.clv_prob for b in rows])
        mean, se = float(clv.mean()), float(clv.std(ddof=1) / math.sqrt(n))
        # shrink toward 0 by evidence: t-stat scaled, capped
        z = mean / se if se > 0 else 0.0
        shift = float(np.clip(-0.004 * z, -0.01, 0.03))   # negative CLV -> raise the bar
        values[kind] = {"play": round(max(base["play"] * 0.75, base["play"] + shift), 4),
                        "lean": round(max(base["lean"] * 0.75, base["lean"] + shift / 2), 4)}
        notes[kind] = f"n={n}, mean CLV {mean:+.2%} (t={z:+.1f}) -> play bar {values[kind]['play']:.1%}"
    _set(db, THRESHOLD_KEY, {"values": values, "notes": notes, "updated": utcnow().isoformat()})
    return {"values": values, "notes": notes}


def update_blend(db: Session, model, results: pd.DataFrame) -> dict:
    """Re-estimate beta (model weight vs market) from logged predictions, by hours-to-kickoff bucket.

    Posterior mean = precision-weighted average of the backtest prior (the model's current blend)
    and the live estimate. Needs ~100+ graded games per bucket to move meaningfully.
    """
    preds = pd.DataFrame([{"game_id": p.game_id, "raw_margin": p.raw_margin, "market_margin": p.market_margin,
                           "raw_total": p.raw_total, "market_total": p.market_total, "hours": p.hours_to_kickoff,
                           "taken_at": p.taken_at} for p in db.scalars(select(Prediction))])
    report = {"n_predictions": int(len(preds))}
    if preds.empty:
        _set(db, BLEND_KEY, report)
        return report
    preds = preds.merge(results[["game_id", "result", "total"]], on="game_id").dropna(subset=["market_margin", "result"])
    # one prediction per game per bucket (the latest in that bucket)
    preds["bucket"] = np.where(preds["hours"] >= 48, "early", "close")
    preds = preds.sort_values("taken_at").groupby(["game_id", "bucket"]).tail(1)
    prior_sd = 0.08
    new = dict(model.blend.__dict__)
    for bucket in ("early", "close"):
        d = preds[preds["bucket"] == bucket]
        for mkt, raw, mk, act in (("spread", "raw_margin", "market_margin", "result"), ("total", "raw_total", "market_total", "total")):
            dd = d.dropna(subset=[mk, act])
            key = f"{mkt}_{bucket}"
            prior = new[key]
            if len(dd) < 30:
                report[key] = {"n": int(len(dd)), "beta": prior, "note": "not enough games yet"}
                continue
            e = (dd[raw] - dd[mk]).to_numpy()
            r = (dd[act] - dd[mk]).to_numpy()
            em = e - e.mean()
            b = float((em * (r - r.mean())).sum() / (em ** 2).sum())
            resid = r - r.mean() - b * em
            se = float(np.sqrt(resid.var() / (em ** 2).sum()))
            post = (prior / prior_sd ** 2 + b / se ** 2) / (1 / prior_sd ** 2 + 1 / se ** 2)
            new[key] = float(np.clip(post, 0.0, 0.6))
            report[key] = {"n": int(len(dd)), "live_beta": b, "se": se, "prior": prior, "posterior": new[key]}
    report["blend"] = new
    report["updated"] = utcnow().isoformat()
    _set(db, BLEND_KEY, report)
    return report


def update_prop_corrections(db: Session, half_life_days: float = 42.0, k: float = 150.0) -> dict:
    """Online multiplicative bias correction per stat from logged projections vs actual stats."""
    rows = db.scalars(select(PropPrediction).where(PropPrediction.actual.isnot(None))).all()
    now = utcnow()
    acc: dict = {}
    for r in rows:
        age = (now - (r.taken_at if r.taken_at.tzinfo else r.taken_at.replace(tzinfo=dt.timezone.utc))).days
        w = 0.5 ** (age / half_life_days)
        lr = math.log((max(r.actual, 0) + 1) / (max(r.projection, 0) + 1))
        s = acc.setdefault(r.stat, [0.0, 0.0, 0])
        s[0] += w * lr
        s[1] += w
        s[2] += 1
    corr = {stat: {"factor": round(math.exp(v[0] / (v[1] + k)), 4), "n": v[2]} for stat, v in acc.items()}
    _set(db, PROP_CORR_KEY, {"corrections": corr, "updated": now.isoformat()})
    return corr


def performance(db: Session, user_id: int | None = None) -> dict:
    """Bankroll curve, ROI / CLV by market and label, for real bets (user) and paper bets (system)."""
    q = select(Bet)
    if user_id is not None:
        q = q.where(Bet.user_id == user_id)
    bets = db.scalars(q).all()
    df = pd.DataFrame([{"id": b.id, "user": b.user.username if b.user else None, "market": b.market, "label": b.label,
                        "stake": b.stake, "odds": b.odds, "result": b.result, "profit": b.profit, "clv_prob": b.clv_prob,
                        "clv_points": b.clv_points, "model_ev": b.model_ev, "placed_at": b.placed_at,
                        "graded_at": b.graded_at} for b in bets])
    if df.empty:
        return {"n": 0}
    done = df[df["result"].isin(["win", "loss", "push"])].copy()
    out = {"n": int(len(df)), "graded": int(len(done)), "pending": int((df["result"] == "pending").sum())}
    if done.empty:
        return out

    def summarize(g: pd.DataFrame) -> dict:
        staked = g["stake"].sum()
        wins, losses = (g["result"] == "win").sum(), (g["result"] == "loss").sum()
        return {"bets": int(len(g)), "record": f"{wins}-{losses}-{(g['result'] == 'push').sum()}",
                "staked": round(float(staked), 2), "profit": round(float(g["profit"].sum()), 2),
                "roi": round(float(g["profit"].sum() / staked), 4) if staked else None,
                "avg_clv_prob": round(float(g["clv_prob"].mean()), 4) if g["clv_prob"].notna().any() else None,
                "beat_close_pct": round(float((g["clv_prob"] > 0).mean()), 3) if g["clv_prob"].notna().any() else None,
                "avg_model_ev": round(float(g["model_ev"].mean()), 4) if g["model_ev"].notna().any() else None}
    out["overall"] = summarize(done)
    out["by_market"] = {m: summarize(g) for m, g in done.groupby("market")}
    out["by_label"] = {str(m): summarize(g) for m, g in done.groupby("label")}
    done = done.sort_values("graded_at")
    done["cum_profit"] = done["profit"].cumsum()
    out["curve"] = [{"at": r.graded_at.isoformat() if r.graded_at else None, "cum_profit": round(float(r.cum_profit), 2)}
                    for r in done.itertuples()]
    return out
