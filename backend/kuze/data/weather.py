"""Game-time weather from Open-Meteo (free, no API key). Indoor games short-circuit."""
from __future__ import annotations

import datetime as dt
import logging

import httpx

log = logging.getLogger(__name__)
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
HOURLY = "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation,wind_direction_10m,snowfall"


def fetch_forecast(lat: float, lon: float, days: int = 10, client: httpx.Client | None = None) -> dict | None:
    params = {"latitude": lat, "longitude": lon, "hourly": HOURLY, "temperature_unit": "fahrenheit",
              "wind_speed_unit": "mph", "precipitation_unit": "inch", "timezone": "UTC", "forecast_days": days}
    try:
        c = client or httpx.Client(timeout=15)
        r = c.get(OPEN_METEO, params=params)
        r.raise_for_status()
        return r.json()
    except Exception as exc:  # network blocked / API down -> weather UNKNOWN, never crash the report
        log.warning("weather fetch failed: %s", exc)
        return None


def at_kickoff(payload: dict | None, kickoff_utc: dt.datetime, window_hours: int = 3) -> dict | None:
    """Average conditions over the first ``window_hours`` of the game from an Open-Meteo payload."""
    if not payload or "hourly" not in payload:
        return None
    h = payload["hourly"]
    times = [dt.datetime.fromisoformat(t).replace(tzinfo=dt.timezone.utc) for t in h["time"]]
    idx = [i for i, t in enumerate(times) if kickoff_utc - dt.timedelta(minutes=30) <= t <= kickoff_utc + dt.timedelta(hours=window_hours)]
    if not idx:
        return None

    def avg(key):
        vals = [h[key][i] for i in idx if h.get(key) and h[key][i] is not None]
        return sum(vals) / len(vals) if vals else None

    def mx(key):
        vals = [h[key][i] for i in idx if h.get(key) and h[key][i] is not None]
        return max(vals) if vals else None

    return {"temp_f": avg("temperature_2m"), "wind_mph": avg("wind_speed_10m"), "gust_mph": mx("wind_gusts_10m"),
            "precip_prob": mx("precipitation_probability"), "precip_in": avg("precipitation"),
            "snow_in": avg("snowfall"), "wind_dir_deg": avg("wind_direction_10m")}


def classify(wx: dict | None, indoor: bool, hours_to_kickoff: float | None) -> dict:
    """Weather summary + whether it is confirmed (indoor or forecast inside ~48h)."""
    if indoor:
        return {"status": "INDOOR", "confirmed": True, "impact": "none", "temp_f": 70.0, "wind_mph": 0.0}
    if wx is None:
        return {"status": "UNKNOWN", "confirmed": False, "impact": "unknown"}
    wind = wx.get("wind_mph") or 0.0
    gust = wx.get("gust_mph") or wind
    temp = wx.get("temp_f")
    notes = []
    impact = "low"
    if wind >= 20 or gust >= 30:
        impact = "high"
        notes.append("strong wind: passing / deep ball / kicking downgrade, lean under")
    elif wind >= 15:
        impact = "medium"
        notes.append("wind 15+ mph affects deep passing and long field goals")
    if temp is not None and temp <= 25:
        notes.append("very cold")
        impact = "medium" if impact == "low" else impact
    if (wx.get("precip_prob") or 0) >= 60:
        notes.append("rain/snow likely: ball security, footing")
        impact = "medium" if impact == "low" else impact
    confirmed = hours_to_kickoff is not None and hours_to_kickoff <= 48
    return {"status": "FORECAST" if confirmed else "EARLY FORECAST", "confirmed": confirmed, "impact": impact,
            "notes": notes, **{k: (round(v, 1) if isinstance(v, float) else v) for k, v in wx.items()}}
