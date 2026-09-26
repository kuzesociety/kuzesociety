"""Sportsbook odds from The Odds API (https://the-odds-api.com) - Hard Rock Bet + sharp consensus.

Needs ODDS_API_KEY. Without it the app runs on manually entered Hard Rock lines and the
nflverse schedule's market line. Parsing is separated from HTTP so it is unit-testable.
"""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass, field

import httpx

from kuze.config import settings

log = logging.getLogger(__name__)
API = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"
SHARP_BOOKS = ("pinnacle", "lowvig", "betonlineag", "circasports", "bookmaker")
PROP_MARKETS = ("player_pass_yds", "player_pass_attempts", "player_pass_completions", "player_pass_tds",
                "player_rush_yds", "player_rush_attempts", "player_receptions", "player_reception_yds",
                "player_rush_reception_yds", "player_anytime_td")

TEAM_ABBR = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LA", "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}


@dataclass
class BookLines:
    book: str
    last_update: str | None = None
    home_spread: float | None = None
    home_spread_odds: float | None = None
    away_spread: float | None = None
    away_spread_odds: float | None = None
    home_ml: float | None = None
    away_ml: float | None = None
    total: float | None = None
    over_odds: float | None = None
    under_odds: float | None = None


@dataclass
class EventOdds:
    event_id: str
    commence_time: str
    home: str
    away: str
    books: dict[str, BookLines] = field(default_factory=dict)


def parse_events(payload: list[dict]) -> list[EventOdds]:
    out = []
    for ev in payload:
        home, away = TEAM_ABBR.get(ev["home_team"], ev["home_team"]), TEAM_ABBR.get(ev["away_team"], ev["away_team"])
        e = EventOdds(ev["id"], ev["commence_time"], home, away)
        for bk in ev.get("bookmakers", []):
            bl = BookLines(bk["key"], bk.get("last_update"))
            for m in bk.get("markets", []):
                for o in m.get("outcomes", []):
                    team = TEAM_ABBR.get(o.get("name"), o.get("name"))
                    if m["key"] == "h2h":
                        if team == home:
                            bl.home_ml = o["price"]
                        elif team == away:
                            bl.away_ml = o["price"]
                    elif m["key"] == "spreads":
                        if team == home:
                            bl.home_spread, bl.home_spread_odds = o.get("point"), o["price"]
                        elif team == away:
                            bl.away_spread, bl.away_spread_odds = o.get("point"), o["price"]
                    elif m["key"] == "totals":
                        if o["name"] == "Over":
                            bl.total, bl.over_odds = o.get("point"), o["price"]
                        elif o["name"] == "Under":
                            bl.under_odds = o["price"]
            e.books[bk["key"]] = bl
        out.append(e)
    return out


def parse_props(payload: dict) -> list[dict]:
    """Event-odds payload -> rows {book, market, player, side, line, odds}."""
    rows = []
    for bk in payload.get("bookmakers", []):
        for m in bk.get("markets", []):
            for o in m.get("outcomes", []):
                rows.append({"book": bk["key"], "market": m["key"], "player": o.get("description"),
                             "side": o.get("name"), "line": o.get("point"), "odds": o.get("price"),
                             "last_update": m.get("last_update") or bk.get("last_update")})
    return rows


class OddsClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.odds_api_key
        self.remaining: str | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _get(self, path: str, params: dict) -> list | dict | None:
        if not self.enabled:
            return None
        try:
            with httpx.Client(timeout=20) as c:
                r = c.get(f"{API}{path}", params={"apiKey": self.api_key, **params})
            self.remaining = r.headers.get("x-requests-remaining")
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            log.warning("odds api error %s: %s", path, exc)
            return None

    def game_odds(self) -> list[EventOdds]:
        data = self._get(f"/sports/{SPORT}/odds", {"regions": "us,us2,eu", "markets": "h2h,spreads,totals",
                                                    "oddsFormat": "american"})
        return parse_events(data or [])

    def event_props(self, event_id: str, markets: tuple[str, ...] = PROP_MARKETS) -> list[dict]:
        data = self._get(f"/sports/{SPORT}/events/{event_id}/odds",
                         {"regions": "us,us2", "markets": ",".join(markets), "oddsFormat": "american"})
        return parse_props(data or {})


def match_event(events: list[EventOdds], home: str, away: str, kickoff: dt.datetime | None = None) -> EventOdds | None:
    cands = [e for e in events if e.home == home and e.away == away]
    if not cands:
        return None
    if kickoff is None or len(cands) == 1:
        return cands[0]
    return min(cands, key=lambda e: abs(dt.datetime.fromisoformat(e.commence_time.replace("Z", "+00:00")) - kickoff))
