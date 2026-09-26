from __future__ import annotations

import json
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from kuze.api.auth import current_user
from kuze.config import settings
from kuze.db.models import JobRun, User
from kuze.db.session import get_db
from kuze.learning import feedback, loop
from kuze.pipeline import pipeline

router = APIRouter(prefix="/api", tags=["admin"])


def _spawn(job: str, fn, *args):
    if loop.STATUS["jobs"].get(job, {}).get("status") == "running":
        raise HTTPException(409, f"{job} is already running")
    threading.Thread(target=loop._run, args=(job, fn, *args), daemon=True).start()
    return {"started": job}


@router.get("/status")
def status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    runs = db.scalars(select(JobRun).order_by(desc(JobRun.started_at)).limit(15)).all()
    st = pipeline._state
    from kuze.props.engine import engine
    return {"ready": loop.STATUS["ready"], "building": loop.STATUS["building"], "last_error": loop.STATUS["last_error"],
            "model_version": st.model.version if st else None, "trained_through": st.model.trained_through if st else None,
            "data_built_at": st.built_at if st else None, "props_ready": engine.state is not None,
            "odds_api": bool(settings.odds_api_key), "analyst": bool(settings.anthropic_api_key),
            "jobs": [{"job": r.job, "status": r.status, "started": r.started_at.isoformat(),
                      "finished": r.finished_at.isoformat() if r.finished_at else None,
                      "detail": {k: v for k, v in (r.detail or {}).items() if k != "trace"}} for r in runs]}


@router.post("/admin/refresh")
def refresh(user: User = Depends(current_user)):
    return _spawn("refresh", loop.refresh_job)


@router.post("/admin/retrain")
def retrain(user: User = Depends(current_user)):
    return _spawn("retrain", loop.build_all, True)


@router.post("/admin/learn")
def learn(user: User = Depends(current_user)):
    return _spawn("weekly_learning", loop.weekly_learning_job)


@router.post("/admin/odds-sync")
def odds_sync(user: User = Depends(current_user)):
    return _spawn("odds", loop.odds_job)


@router.get("/model")
def model_info(user: User = Depends(current_user), db: Session = Depends(get_db)):
    st = pipeline._state
    if st is None:
        raise HTTPException(503, "warming up")
    m = st.model
    out = {"version": m.version, "trained_through": m.trained_through, "blend": m.blend.__dict__,
           "backtest": m.backtest, "key_numbers": {"fitted_on": st.keynum.fitted_on, "core_sd": st.keynum.core_sd,
                                                    "tail_sd": st.keynum.tail_sd, "tail_w": st.keynum.tail_w,
                                                    "margin_sd": st.keynum.margin_sd},
           "thresholds": feedback._kv(db, feedback.THRESHOLD_KEY) or {"values": feedback.current_thresholds(db)},
           "live_blend": feedback._kv(db, feedback.BLEND_KEY), "prop_corrections": feedback._kv(db, feedback.PROP_CORR_KEY),
           "features": {"margin": __import__("kuze.models.game_model", fromlist=["x"]).MARGIN_FEATURES,
                        "total": __import__("kuze.models.game_model", fromlist=["x"]).TOTAL_FEATURES}}
    for name in ("props_backtest.json", "td_backtest.json"):
        p = settings.data_dir / name
        if p.exists():
            out[name.replace(".json", "")] = json.loads(p.read_text())
    return out
