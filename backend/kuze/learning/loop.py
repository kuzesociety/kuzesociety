"""Scheduled jobs: data refresh, paper trading at kickoff, weekly learning + retraining."""
from __future__ import annotations

import datetime as dt
import logging
import secrets
import threading
import traceback

import numpy as np
import pandas as pd
from sqlalchemy import select

from kuze.config import settings
from kuze.db.models import Bet, JobRun, PropLine, PropPrediction, User, utcnow
from kuze.db.session import session_scope
from kuze.learning import feedback, grading
from kuze.pipeline import pipeline
from kuze.props import model as PM

log = logging.getLogger(__name__)
SYSTEM_USER = "system"
_job_lock = threading.Lock()
STATUS: dict = {"ready": False, "building": False, "last_error": None, "jobs": {}}


def system_user(db) -> User:
    u = db.scalar(select(User).where(User.username == SYSTEM_USER))
    if u is None:
        from kuze.api.auth import hash_password
        u = User(username=SYSTEM_USER, display_name="Model (paper)", password_hash=hash_password(secrets.token_hex(32)),
                 bankroll=1000.0)
        db.add(u)
        db.commit()
    return u


def _run(job: str, fn, *args, **kwargs):
    with session_scope() as db:
        jr = JobRun(job=job, status="running")
        db.add(jr)
        db.flush()
        jr_id = jr.id
    STATUS["jobs"][job] = {"status": "running", "started": utcnow().isoformat()}
    try:
        detail = fn(*args, **kwargs)
        status = "ok"
    except Exception as exc:  # jobs must never take the API down
        log.exception("job %s failed", job)
        detail, status = {"error": str(exc), "trace": traceback.format_exc()[-2000:]}, "error"
    with session_scope() as db:
        jr = db.get(JobRun, jr_id)
        jr.status, jr.detail, jr.finished_at = status, _safe(detail), utcnow()
    STATUS["jobs"][job] = {"status": status, "finished": utcnow().isoformat(), "detail": _safe(detail)}
    return detail


def _safe(x):
    try:
        import json
        json.dumps(x, default=str)
        return x if isinstance(x, dict) else {"result": x}
    except TypeError:
        return {"result": str(x)}


# ----------------------------------------------------------------------------- jobs
def build_all(retrain: bool = False) -> dict:
    """(Re)build the game pipeline and the props engine."""
    from kuze.props.engine import engine
    with _job_lock:
        STATUS["building"] = True
        try:
            st = pipeline.build(retrain=retrain)
            _apply_live_blend(st)
            with session_scope() as db:
                corr = feedback._kv(db, feedback.PROP_CORR_KEY) or {}
            engine.corrections = {k: v["factor"] for k, v in corr.get("corrections", {}).items() if v.get("n", 0) >= 50}
            try:
                engine.build(st, retrain=retrain)
            except Exception as exc:
                log.exception("props engine build failed")
                STATUS["last_error"] = f"props: {exc}"
            STATUS["ready"] = True
            return {"model": st.model.version, "trained_through": st.model.trained_through}
        finally:
            STATUS["building"] = False


def _apply_live_blend(st) -> None:
    with session_scope() as db:
        live = feedback._kv(db, feedback.BLEND_KEY) or {}
    b = live.get("blend")
    if b:
        from kuze.models.game_model import Blend
        st.model.blend = Blend(**{k: v for k, v in b.items() if k in Blend.__dataclass_fields__})


def refresh_job() -> dict:
    from kuze import services
    out = {"data": pipeline.refresh_data()}
    out["build"] = build_all(retrain=False)
    with session_scope() as db:
        out["market_snapshots"] = services.record_schedule_market(db)
        out["odds"] = services.sync_odds(db)
        out["grading"] = grading.grade_bets(db, pipeline.state.keynum)
    return out


def odds_job() -> dict:
    """Game lines from every book (hourly, ~9 quota credits per run)."""
    from kuze import services
    with session_scope() as db:
        return services.sync_odds(db)


def prop_odds_job() -> dict:
    """Hard Rock props for games in the next 48 hours (every 4 hours, ~10 credits per game)."""
    from kuze import services
    with session_scope() as db:
        return services.sync_prop_odds(db)


def odds_now_job() -> dict:
    """Manual sync from the Settings page: lines and near-term props."""
    return {"lines": odds_job(), "props": prop_odds_job()}


def paper_trade_job(window_minutes: int = 75) -> dict:
    """Shortly before kickoff, record the model's PLAY/SMALLER calls as paper bets + log prop predictions."""
    from kuze import services
    from kuze.analysis.game_report import kickoff_utc
    from kuze.props.engine import engine
    st = pipeline.state
    now = utcnow()
    f = st.features[st.features["result"].isna()]
    placed = logged = 0
    with session_scope() as db:
        sysu = system_user(db)
        for _, g in f.iterrows():
            ko = kickoff_utc(g)
            if not (dt.timedelta(0) <= ko - now <= dt.timedelta(minutes=window_minutes)):
                continue
            gid = g["game_id"]
            if db.scalar(select(Bet).where(Bet.user_id == sysu.id, Bet.game_id == gid)) is not None:
                continue
            rep = services.analyze_game(db, gid, sysu, include_context=False)
            for b in rep["bets"]:
                if b.get("label") in ("PLAY", "SMALLER"):
                    stake = max(b["stake"]["amount"], 1.0)
                    db.add(Bet(user_id=sysu.id, game_id=gid, market=b["market"], side=b.get("side"),
                               selection=b["selection"], line=b.get("line"), odds=b["odds"], stake=stake,
                               model_prob=b.get("win_pct_no_push"), model_ev=b["ev"], label=b["label"],
                               confidence=b.get("confidence"), notes="auto paper bet at kickoff"))
                    placed += 1
            # props: log the raw projection of every expected player's stats at kickoff (feeds the online
            # drift correction), with the Hard Rock line where one was entered; paper-bet PLAY/SMALLER props
            if engine.state is not None:
                lines = {(pl.player_id, pl.stat): pl for pl in db.scalars(select(PropLine).where(PropLine.game_id == gid))
                         if pl.stat != "anytime_td"}
                seen = {(x.player_id, x.stat) for x in db.scalars(select(PropPrediction).where(PropPrediction.game_id == gid))}
                rows = engine.state.rows[engine.state.rows["game_id"] == gid]
                for _, r in rows.iterrows():
                    if float(r.get("p_play", 1.0) or 0) < 0.5:
                        continue
                    for stat in PM.STATS:
                        raw = r.get(f"raw_{stat}")
                        if raw is None or pd.isna(raw) or (r["player_id"], stat) in seen:
                            continue
                        pl = lines.get((r["player_id"], stat))
                        p_over = None
                        if pl is not None:
                            p_over = engine.price(gid, pl.player_id, stat, pl.line, None, None)["p_over"]
                        db.add(PropPrediction(game_id=gid, player_id=r["player_id"], stat=stat, projection=float(raw),
                                              line=pl.line if pl is not None else None, p_over=p_over))
                        seen.add((r["player_id"], stat))
                        logged += 1
                for (pid, stat), pl in lines.items():
                    try:
                        pr = engine.price(gid, pid, stat, pl.line, pl.over_odds, pl.under_odds)
                    except KeyError:
                        continue
                    for s in pr["sides"]:
                        if s["label"] in ("PLAY", "SMALLER"):
                            db.add(Bet(user_id=sysu.id, game_id=gid, market="prop", side=s["side"],
                                       selection=f"{pl.player_name} {s['side'].title()} {pl.line:g} {pl.stat.replace('_', ' ')}",
                                       player_id=pl.player_id, stat=pl.stat, line=pl.line, odds=s["odds"],
                                       stake=10.0, model_prob=s["win"], model_ev=s["ev"], label=s["label"],
                                       confidence=s["confidence"], notes="auto paper bet at kickoff"))
                            placed += 1
    return {"paper_bets": placed, "prop_predictions": logged}


def weekly_learning_job() -> dict:
    """Grade -> thresholds -> prop corrections -> retrain (champion/challenger) -> live blend."""
    from kuze.data import nflverse as nv
    out = {}
    with session_scope() as db:
        out["grading"] = grading.grade_bets(db, pipeline.state.keynum)
        out["thresholds"] = feedback.update_thresholds(db)
        out["prop_corrections"] = feedback.update_prop_corrections(db)
    # champion / challenger for the game model
    champion = pipeline.state.model
    out["retrain"] = challenger_gate(champion)
    # live blend posterior (uses the promoted model's backtest blend as prior)
    sched = nv.load_schedules()
    with session_scope() as db:
        out["blend"] = feedback.update_blend(db, pipeline.state.model, sched[sched["result"].notna()])
    _apply_live_blend(pipeline.state)
    pipeline.state.model.save(settings.models_dir / "game_model.pkl")
    # props: retrain weekly on the newest games
    try:
        from kuze.props.engine import engine
        engine.build(pipeline.state, retrain=True)
        out["props"] = "retrained"
    except Exception as exc:
        out["props"] = f"failed: {exc}"
    return out


def challenger_gate(champion) -> dict:
    """Retrain on all completed games; promote only if predictions are sane and backtest is not worse."""
    st = pipeline.state
    prev_bt = champion.backtest.get("by_season", [])
    challenger = pipeline.train(st.features)   # saves as game_model.pkl, champion moved to _prev
    up = pipeline.upcoming()
    pc = challenger.predict(up)
    pm = champion.predict(up)
    diff = float(np.abs(pc["model_margin"].to_numpy() - pm["model_margin"].to_numpy()).mean()) if len(up) else 0.0
    corr = float(np.corrcoef(pc["model_margin"], pm["model_margin"])[0, 1]) if len(up) > 2 else 1.0

    def recent_mae(bt):
        rows = [r for r in bt if r["season"] >= max(r2["season"] for r2 in bt) - 2] if bt else []
        return float(np.mean([r["mae_fair"] for r in rows])) if rows else None
    m_new, m_old = recent_mae(challenger.backtest.get("by_season", [])), recent_mae(prev_bt)
    ok = (corr > 0.85 or len(up) <= 2) and diff < 2.0 and (m_old is None or m_new is None or m_new <= m_old + 0.05)
    if ok:
        st.model = challenger
        verdict = "promoted"
    else:
        st.model = champion
        champion.save(settings.models_dir / "game_model.pkl")
        verdict = "kept champion"
    return {"verdict": verdict, "upcoming_corr": corr, "upcoming_mean_abs_diff": diff,
            "recent_mae_fair_new": m_new, "recent_mae_fair_old": m_old, "version": st.model.version}


# ----------------------------------------------------------------------------- scheduler
def start_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler
    sched = BackgroundScheduler(timezone="America/New_York")
    sched.add_job(lambda: _run("refresh", refresh_job), "cron", hour="5,11,15,19", minute=7, id="refresh")
    sched.add_job(lambda: _run("paper_trade", paper_trade_job), "cron", minute="*/20", id="paper")
    sched.add_job(lambda: _run("weekly_learning", weekly_learning_job), "cron", day_of_week="tue", hour=9, minute=13,
                  id="learning")
    if settings.odds_api_key:
        # ~15K credits/month in season: fits The Odds API's 20K plan
        sched.add_job(lambda: _run("odds", odds_job), "cron", minute=5, id="odds")
        sched.add_job(lambda: _run("prop_odds", prop_odds_job), "cron", hour="*/4", minute=35, id="prop_odds")
    sched.start()
    return sched
