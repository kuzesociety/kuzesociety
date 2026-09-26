"""Central configuration. Everything is overridable through environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(_env("KUZE_DATA_DIR", str(ROOT / "data"))))
    db_url: str = field(default_factory=lambda: _env("KUZE_DB_URL", f"sqlite:///{ROOT / 'data' / 'kuze.db'}"))
    # How long an in-season (still changing) nflverse file is trusted before re-download.
    live_ttl_hours: float = field(default_factory=lambda: float(_env("KUZE_LIVE_TTL_HOURS", "6")))
    first_season: int = field(default_factory=lambda: int(_env("KUZE_FIRST_SEASON", "2006")))
    jwt_secret: str = field(default_factory=lambda: _env("KUZE_JWT_SECRET", "change-me-in-production"))
    odds_api_key: str | None = field(default_factory=lambda: _env("ODDS_API_KEY"))
    anthropic_api_key: str | None = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    analyst_model: str = field(default_factory=lambda: _env("KUZE_ANALYST_MODEL", "claude-opus-5-5"))
    # Hard Rock Bet key on The Odds API.
    book_key: str = field(default_factory=lambda: _env("KUZE_BOOK_KEY", "hardrockbet"))

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"


settings = Settings()
