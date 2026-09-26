"""Stadium coordinates / time zones (nflverse ``stadium_id`` keys) for travel, body-clock and weather."""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Stadium:
    lat: float
    lon: float
    tz: str
    elevation_ft: int = 0


STADIUMS: dict[str, Stadium] = {
    "ATL00": Stadium(33.7577, -84.4008, "America/New_York", 1050),
    "ATL97": Stadium(33.7554, -84.4008, "America/New_York", 1050),
    "BAL00": Stadium(39.2780, -76.6227, "America/New_York", 30),
    "BOS00": Stadium(42.0909, -71.2643, "America/New_York", 290),
    "BRG00": Stadium(30.4120, -91.1838, "America/Chicago", 50),
    "BUF00": Stadium(42.7738, -78.7870, "America/New_York", 650),
    "BUF01": Stadium(43.6414, -79.3894, "America/Toronto", 270),
    "CAR00": Stadium(35.2258, -80.8528, "America/New_York", 750),
    "CHI98": Stadium(41.8623, -87.6167, "America/Chicago", 595),
    "CHI99": Stadium(40.0992, -88.2360, "America/Chicago", 730),
    "CIN00": Stadium(39.0955, -84.5161, "America/New_York", 490),
    "CLE00": Stadium(41.5061, -81.6995, "America/New_York", 580),
    "DAL00": Stadium(32.7473, -97.0945, "America/Chicago", 600),
    "DAL99": Stadium(32.8400, -96.9110, "America/Chicago", 450),
    "DEN00": Stadium(39.7439, -105.0201, "America/Denver", 5280),
    "DET00": Stadium(42.3400, -83.0456, "America/New_York", 600),
    "FRA00": Stadium(50.0686, 8.6455, "Europe/Berlin", 330),
    "GER00": Stadium(48.2188, 11.6247, "Europe/Berlin", 1700),
    "GNB00": Stadium(44.5013, -88.0622, "America/Chicago", 640),
    "HOU00": Stadium(29.6847, -95.4107, "America/Chicago", 50),
    "IND00": Stadium(39.7601, -86.1639, "America/New_York", 715),
    "IND99": Stadium(39.7637, -86.1631, "America/New_York", 715),
    "JAX00": Stadium(30.3239, -81.6373, "America/New_York", 15),
    "KAN00": Stadium(39.0489, -94.4839, "America/Chicago", 850),
    "LAX01": Stadium(33.9535, -118.3392, "America/Los_Angeles", 100),
    "LAX97": Stadium(33.8644, -118.2611, "America/Los_Angeles", 40),
    "LAX99": Stadium(34.0141, -118.2879, "America/Los_Angeles", 200),
    "LON00": Stadium(51.5560, -0.2796, "Europe/London", 150),
    "LON01": Stadium(51.4560, -0.3415, "Europe/London", 30),
    "LON02": Stadium(51.6043, -0.0664, "Europe/London", 60),
    "MAD01": Stadium(40.4531, -3.6883, "Europe/Madrid", 2150),
    "MEL00": Stadium(-37.8200, 144.9834, "Australia/Melbourne", 100),
    "MEX00": Stadium(19.3029, -99.1505, "America/Mexico_City", 7200),
    "MIA00": Stadium(25.9580, -80.2389, "America/New_York", 10),
    "MIN00": Stadium(44.9737, -93.2581, "America/Chicago", 830),
    "MIN01": Stadium(44.9735, -93.2575, "America/Chicago", 830),
    "MIN98": Stadium(44.9765, -93.2246, "America/Chicago", 830),
    "MUN01": Stadium(48.2188, 11.6247, "Europe/Berlin", 1700),
    "NAS00": Stadium(36.1665, -86.7713, "America/Chicago", 400),
    "NOR00": Stadium(29.9511, -90.0812, "America/Chicago", 5),
    "NYC00": Stadium(40.8128, -74.0742, "America/New_York", 10),
    "NYC01": Stadium(40.8135, -74.0745, "America/New_York", 10),
    "OAK00": Stadium(37.7516, -122.2005, "America/Los_Angeles", 10),
    "PAR00": Stadium(48.9245, 2.3602, "Europe/Paris", 110),
    "PHI00": Stadium(39.9008, -75.1675, "America/New_York", 10),
    "PHI99": Stadium(39.9061, -75.1665, "America/New_York", 10),
    "PHO00": Stadium(33.5276, -112.2626, "America/Phoenix", 1070),
    "PHO99": Stadium(33.4264, -111.9325, "America/Phoenix", 1170),
    "PIT00": Stadium(40.4468, -80.0158, "America/New_York", 730),
    "RIO00": Stadium(-22.9121, -43.2302, "America/Sao_Paulo", 20),
    "SAN00": Stadium(29.4169, -98.4789, "America/Chicago", 650),
    "SAO00": Stadium(-23.5453, -46.4742, "America/Sao_Paulo", 2500),
    "SDG00": Stadium(32.7831, -117.1196, "America/Los_Angeles", 60),
    "SEA00": Stadium(47.5952, -122.3316, "America/Los_Angeles", 20),
    "SFO00": Stadium(37.7136, -122.3861, "America/Los_Angeles", 10),
    "SFO01": Stadium(37.4030, -121.9700, "America/Los_Angeles", 20),
    "STL00": Stadium(38.6328, -90.1885, "America/Chicago", 460),
    "TAM00": Stadium(27.9759, -82.5033, "America/New_York", 30),
    "VEG00": Stadium(36.0909, -115.1833, "America/Los_Angeles", 2030),
    "WAS00": Stadium(38.9076, -76.8645, "America/New_York", 170),
}

# Where each franchise plays home games in the current era (for teams whose schedule
# row is a neutral-site game we still need the team's normal home base).
TEAM_HOME: dict[str, str] = {
    "ARI": "PHO00", "ATL": "ATL97", "BAL": "BAL00", "BUF": "BUF00", "CAR": "CAR00", "CHI": "CHI98",
    "CIN": "CIN00", "CLE": "CLE00", "DAL": "DAL00", "DEN": "DEN00", "DET": "DET00", "GB": "GNB00",
    "HOU": "HOU00", "IND": "IND00", "JAX": "JAX00", "KC": "KAN00", "LA": "LAX01", "LAC": "LAX01",
    "LV": "VEG00", "MIA": "MIA00", "MIN": "MIN01", "NE": "BOS00", "NO": "NOR00", "NYG": "NYC01",
    "NYJ": "NYC01", "PHI": "PHI00", "PIT": "PIT00", "SEA": "SEA00", "SF": "SFO01", "TB": "TAM00",
    "TEN": "NAS00", "WAS": "WAS00", "OAK": "OAK00", "SD": "SDG00", "STL": "STL00",
}


def haversine_miles(a: Stadium, b: Stadium) -> float:
    r = 3958.8
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp = p2 - p1
    dl = math.radians(b.lon - a.lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))
