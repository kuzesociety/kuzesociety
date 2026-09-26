"""FastAPI app: REST API under /api + the built React frontend (if present) at /."""
from __future__ import annotations

import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from kuze.api.auth import seed_users
from kuze.api.routes import admin, auth, bets, games, props
from kuze.config import settings
from kuze.db.session import SessionLocal, init_db
from kuze.learning import loop

logging.basicConfig(level=os.environ.get("KUZE_LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("kuze")
FRONTEND = Path(os.environ.get("KUZE_FRONTEND_DIR", Path(__file__).resolve().parents[3] / "frontend" / "dist"))


def _warm_up():
    """Build features/models in the background so the API answers immediately (503 until ready)."""
    try:
        loop._run("startup_build", loop.build_all, False)
        with SessionLocal() as db:
            from kuze import services
            services.record_schedule_market(db)
            loop.system_user(db)
    except Exception:
        log.exception("warm-up failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        created = seed_users(db)
        if created:
            log.info("created users: %s", created)
    if settings.jwt_secret == "change-me-in-production":
        log.warning("KUZE_JWT_SECRET is not set - set it before exposing the app")
    threading.Thread(target=_warm_up, daemon=True).start()
    scheduler = None
    if os.environ.get("KUZE_SCHEDULER", "1") == "1":
        scheduler = loop.start_scheduler()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


class SafeJSONResponse(JSONResponse):
    """JSON response that turns NaN / inf (common in pandas output) into null instead of failing."""

    def render(self, content) -> bytes:
        from kuze.analysis.game_report import _jsonable
        return super().render(_jsonable(content))


app = FastAPI(title="Kuze Edge", version="1.0", lifespan=lifespan, default_response_class=SafeJSONResponse)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("KUZE_CORS", "http://localhost:5173").split(","),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, games.router, props.router, bets.router, admin.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True, "ready": loop.STATUS["ready"]}


if FRONTEND.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = FRONTEND / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(FRONTEND / "index.html")
