from __future__ import annotations

from fastapi import HTTPException, status

from kuze.learning.loop import STATUS


def require_ready() -> None:
    if not STATUS.get("ready"):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "The model is warming up (downloading data / building features). Try again in a minute.")
