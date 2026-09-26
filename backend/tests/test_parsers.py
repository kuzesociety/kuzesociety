import datetime as dt

from kuze.data.odds import match_event, parse_events, parse_props
from kuze.data.weather import at_kickoff, classify

EVENTS = [{
    "id": "ev1", "commence_time": "2026-09-27T17:00:00Z", "home_team": "Buffalo Bills", "away_team": "Los Angeles Chargers",
    "bookmakers": [{"key": "hardrockbet", "last_update": "2026-09-26T12:00:00Z", "markets": [
        {"key": "h2h", "outcomes": [{"name": "Buffalo Bills", "price": -345}, {"name": "Los Angeles Chargers", "price": 275}]},
        {"key": "spreads", "outcomes": [{"name": "Buffalo Bills", "price": -110, "point": -7.0},
                                        {"name": "Los Angeles Chargers", "price": -110, "point": 7.0}]},
        {"key": "totals", "outcomes": [{"name": "Over", "price": -112, "point": 50.5},
                                       {"name": "Under", "price": -108, "point": 50.5}]}]}]}]


def test_parse_game_odds():
    (ev,) = parse_events(EVENTS)
    assert (ev.home, ev.away) == ("BUF", "LAC")
    hr = ev.books["hardrockbet"]
    assert (hr.home_spread, hr.home_spread_odds, hr.away_spread) == (-7.0, -110, 7.0)
    assert (hr.home_ml, hr.away_ml) == (-345, 275)
    assert (hr.total, hr.over_odds, hr.under_odds) == (50.5, -112, -108)
    assert match_event([ev], "BUF", "LAC") is ev
    assert match_event([ev], "LAC", "BUF") is None


def test_parse_props():
    payload = {"bookmakers": [{"key": "hardrockbet", "markets": [{"key": "player_pass_yds", "last_update": "x", "outcomes": [
        {"name": "Over", "description": "Josh Allen", "price": -115, "point": 249.5},
        {"name": "Under", "description": "Josh Allen", "price": -115, "point": 249.5}]}]}]}
    rows = parse_props(payload)
    assert len(rows) == 2 and rows[0]["player"] == "Josh Allen" and rows[0]["line"] == 249.5


def test_weather_at_kickoff_and_classification():
    ko = dt.datetime(2026, 11, 29, 18, 0, tzinfo=dt.timezone.utc)
    hours = [(ko + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(-3, 6)]
    payload = {"hourly": {"time": hours, "temperature_2m": [20.0] * 9, "wind_speed_10m": [22.0] * 9,
                          "wind_gusts_10m": [35.0] * 9, "precipitation_probability": [70] * 9,
                          "precipitation": [0.1] * 9, "snowfall": [0.2] * 9, "wind_direction_10m": [270.0] * 9}}
    wx = at_kickoff(payload, ko)
    assert wx["wind_mph"] == 22.0 and wx["gust_mph"] == 35.0
    c = classify(wx, indoor=False, hours_to_kickoff=20)
    assert c["status"] == "FORECAST" and c["impact"] == "high" and c["confirmed"]
    assert classify(wx, indoor=False, hours_to_kickoff=120)["status"] == "EARLY FORECAST"
    assert classify(None, indoor=False, hours_to_kickoff=5)["status"] == "UNKNOWN"
    assert classify(None, indoor=True, hours_to_kickoff=5)["status"] == "INDOOR"
