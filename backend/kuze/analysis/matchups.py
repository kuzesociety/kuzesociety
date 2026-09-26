"""Matchup exploit engine + game-script engine."""
from __future__ import annotations

import numpy as np
import pandas as pd

from kuze.models.distributions import KeyNumberModel

# (metric, label, plays per game that convert the per-play edge into points, higher_is_better_for_offense)
EPA_MATCHUPS = [
    ("pass_epa", "passing offense vs pass defense", 36.0),
    ("rush_epa", "rushing offense vs run defense", 25.0),
    ("early_epa", "early-down efficiency", 0.0),
]
RATE_MATCHUPS = [
    # metric, label, points per unit of rate (approx EPA cost x volume), higher is better for offense?
    ("sack_rate", "pass protection vs pass rush", -36.0 * 2.2, False),
    ("exp_pass", "explosive passing vs deep coverage", 36.0 * 2.5, True),
    ("exp_rush", "explosive runs vs run fits / tackling", 25.0 * 1.8, True),
    ("int_rate", "interception risk", -36.0 * 4.0, False),
    ("rz_td", "red-zone TD conversion", 3.5 * 3.5, True),
    ("third", "third-down conversion", 13.0 * 1.6, True),
]


def _rank(series: pd.Series, higher_better: bool) -> pd.Series:
    return series.rank(ascending=not higher_better, method="min").astype(int)


def exploits(ratings: pd.DataFrame, home: str, away: str, top: int = 4) -> list[dict]:
    """Biggest matchup edges (points-ish) from opponent-adjusted ratings; offense rating + defense rating.

    ``ratings``: one snapshot (one row per team) with off_<m>/def_<m> columns.
    """
    r = ratings.set_index("team")
    items = []
    for off_team, def_team in ((home, away), (away, home)):
        for m, label, vol in EPA_MATCHUPS:
            if vol == 0.0 or f"off_{m}" not in r:
                continue
            o, d = r.at[off_team, f"off_{m}"], r.at[def_team, f"def_{m}"]
            pts = (o + d) * vol
            items.append(_item(off_team, def_team, m, label, o, d, pts, r, True))
        for m, label, per_unit, hib in RATE_MATCHUPS:
            if f"off_{m}" not in r:
                continue
            o, d = r.at[off_team, f"off_{m}"], r.at[def_team, f"def_{m}"]
            pts = (o + d) * per_unit
            items.append(_item(off_team, def_team, m, label, o, d, pts, r, hib))
    items.sort(key=lambda x: -abs(x["points"]))
    return items[:top]


def _item(off_team, def_team, m, label, o, d, pts, r, hib):
    off_rank = int(_rank(r[f"off_{m}"], hib)[off_team])
    def_rank = int(_rank(r[f"def_{m}"], not hib)[def_team])  # defense: allowing less is better
    favored = off_team if pts > 0 else def_team
    side = "offense" if pts > 0 else "defense"
    return {"metric": m, "label": label, "offense": off_team, "defense": def_team, "off_rating": round(float(o), 4),
            "def_rating": round(float(d), 4), "off_rank": off_rank, "def_rank": def_rank,
            "points": round(float(pts), 2), "edge_to": favored,
            "text": f"{off_team} {label.split(' vs ')[0]} (#{off_rank}) vs {def_team} "
                    f"{label.split(' vs ')[-1] if ' vs ' in label else 'defense'} (#{def_rank}) -> {favored} {side} edge "
                    f"~{abs(pts):.1f} pts"}


def pass_rush_verdict(ratings: pd.DataFrame, off_team: str, def_team: str) -> dict:
    r = ratings.set_index("team")
    o, d = r.at[off_team, "off_sack_rate"], r.at[def_team, "def_sack_rate"]
    exp = o + d  # expected sack rate vs league average
    verdict = "PASS-RUSH ADVANTAGE" if exp > 0.008 else ("OFFENSIVE-LINE ADVANTAGE" if exp < -0.008 else "NEUTRAL")
    return {"offense": off_team, "defense": def_team, "expected_sack_rate_vs_avg": round(float(exp), 4),
            "ol_rank": int(_rank(r["off_sack_rate"], False)[off_team]),
            "rush_rank": int(_rank(r["def_sack_rate"], True)[def_team]), "verdict": verdict}


def simulate_scores(km: KeyNumberModel, fair_margin: float, fair_total: float, n: int = 20000,
                    rho: float = 0.05, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    """Joint (home margin, total) draws: discrete key-number marginals tied with a Gaussian copula.

    rho is the small positive correlation between the favorite's cover margin and the total.
    """
    rng = np.random.default_rng(seed)
    k, pk = km.margin_pmf(fair_margin)
    t, pt = km.total_pmf(fair_total)
    z1 = rng.standard_normal(n)
    sign = 1.0 if fair_margin >= 0 else -1.0
    z2 = rho * sign * z1 + np.sqrt(1 - rho ** 2) * rng.standard_normal(n)
    from scipy.stats import norm
    u1, u2 = norm.cdf(z1), norm.cdf(z2)
    margins = k[np.searchsorted(np.cumsum(pk), u1).clip(0, len(k) - 1)]
    totals = t[np.searchsorted(np.cumsum(pt), u2).clip(0, len(t) - 1)]
    # a total must have the same parity reachability as the margin: |margin| <= total
    totals = np.maximum(totals, np.abs(margins))
    return margins.astype(float), totals.astype(float)


def scripts(margins: np.ndarray, totals: np.ndarray, fair_margin: float, fair_total: float, home: str, away: str) -> list[dict]:
    fav, dog = (home, away) if fair_margin >= 0 else (away, home)
    fm = margins if fair_margin >= 0 else -margins
    out = [
        {"code": "A", "name": "Favorite controls", "desc": f"{fav} leads early and wins by 7-16",
         "prob": float(((fm >= 7) & (fm <= 16)).mean()),
         "effects": {"fav_rb_carries": "up", "dog_qb_attempts": "up", "fav_qb_attempts": "slightly down"}},
        {"code": "B", "name": "Shootout", "desc": "both offenses succeed, total 8+ over projection",
         "prob": float((totals >= fair_total + 8).mean()),
         "effects": {"qb_passing_yards": "up (both)", "wr_te_targets": "up", "total": "over"}},
        {"code": "C", "name": "Underdog keeps it close", "desc": f"{dog} within one score or wins",
         "prob": float((fm <= 6).mean()),
         "effects": {"dog_qb_attempts": "normal/up", "fav_rb_carries": "normal", "spread": f"{dog} side"}},
        {"code": "D", "name": "Blowout", "desc": f"{fav} wins by 17+",
         "prob": float((fm >= 17).mean()),
         "effects": {"fav_rb_carries": "way up", "dog_qb_attempts": "way up", "fav_qb_attempts": "down (4th qtr)"}},
        {"code": "E", "name": "Defensive grind", "desc": "slow, low-scoring: total 8+ under projection",
         "prob": float((totals <= fair_total - 8).mean()),
         "effects": {"rb_volume": "up", "qb_passing_yards": "down", "total": "under"}},
    ]
    for s in out:
        s["prob"] = round(s["prob"], 3)
    return out
