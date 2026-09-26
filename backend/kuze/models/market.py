"""Market-implied expected margin / total from prices, and the no-vig consensus across books.

A line is not just a number: -3 (-125) and -3 (+100) imply different expected margins.
We invert the key-number distribution: find mu such that P(cover | mu, line) equals the
no-vig probability of the book's price. That gives every book's opinion on one scale, so
Hard Rock can be compared to the sharp consensus and the model blends with a real number.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import brentq

from kuze.models.betting import devig
from kuze.models.distributions import KeyNumberModel, moneyline_outcome, spread_outcome, total_outcome


def implied_margin_from_spread(km: KeyNumberModel, home_line: float, home_odds: float | None,
                               away_odds: float | None) -> float:
    """Expected HOME margin implied by a spread and its two prices."""
    if home_odds is None or away_odds is None:
        return -home_line
    p_home, _ = devig(home_odds, away_odds, "multiplicative")

    def f(mu):
        k, p = km.margin_pmf(mu)
        o = spread_outcome(k, p, +1, home_line)
        return o.win_no_push - p_home
    try:
        return float(brentq(f, -40, 40))
    except ValueError:
        return -home_line


def implied_margin_from_ml(km: KeyNumberModel, home_ml: float, away_ml: float) -> float:
    p_home, _ = devig(home_ml, away_ml, "power")

    def f(mu):
        k, p = km.margin_pmf(mu)
        return moneyline_outcome(k, p, +1).win_no_push - p_home
    try:
        return float(brentq(f, -40, 40))
    except ValueError:
        return float("nan")


def implied_total(km: KeyNumberModel, line: float, over_odds: float | None, under_odds: float | None) -> float:
    if over_odds is None or under_odds is None:
        return line
    p_over, _ = devig(over_odds, under_odds, "multiplicative")

    def f(mu):
        t, p = km.total_pmf(mu)
        return total_outcome(t, p, "over", line).win_no_push - p_over
    try:
        return float(brentq(f, 10, 90))
    except ValueError:
        return line


@dataclass
class MarketView:
    source: str
    margin: float | None          # expected home margin (no-vig)
    total: float | None
    books: dict                   # per-book implied numbers for display

    def as_dict(self):
        return {"source": self.source, "margin": None if self.margin is None else round(self.margin, 2),
                "total": None if self.total is None else round(self.total, 2), "books": self.books}


def book_implied(km: KeyNumberModel, bl) -> dict:
    out = {}
    if bl.home_spread is not None:
        out["spread_margin"] = implied_margin_from_spread(km, bl.home_spread, bl.home_spread_odds, bl.away_spread_odds)
    if bl.home_ml is not None and bl.away_ml is not None:
        out["ml_margin"] = implied_margin_from_ml(km, bl.home_ml, bl.away_ml)
    if bl.total is not None:
        out["total"] = implied_total(km, bl.total, bl.over_odds, bl.under_odds)
    return out


def consensus(km: KeyNumberModel, books: dict, sharp: tuple[str, ...], exclude: tuple[str, ...] = ()) -> MarketView:
    """Sharp books weighted 3x; spread-implied margins weighted over ML-implied."""
    margins, mw, totals, tw, detail = [], [], [], [], {}
    for key, bl in books.items():
        if key in exclude:
            continue
        imp = book_implied(km, bl)
        detail[key] = {k: round(v, 2) for k, v in imp.items() if v == v}
        w = 3.0 if key in sharp else 1.0
        if "spread_margin" in imp:
            margins.append(imp["spread_margin"]); mw.append(w)
        if "ml_margin" in imp and imp["ml_margin"] == imp["ml_margin"]:
            margins.append(imp["ml_margin"]); mw.append(0.5 * w)
        if "total" in imp:
            totals.append(imp["total"]); tw.append(w)
    m = float(np.average(margins, weights=mw)) if margins else None
    t = float(np.average(totals, weights=tw)) if totals else None
    return MarketView("consensus", m, t, detail)


def schedule_market(km: KeyNumberModel, row) -> MarketView:
    """Fallback market from the nflverse schedule (current consensus line + prices when present)."""
    def val(x):
        return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)
    spread = val(row.get("spread_line"))
    margin = None
    if spread is not None:
        margin = implied_margin_from_spread(km, -spread, val(row.get("home_spread_odds")), val(row.get("away_spread_odds")))
    total = val(row.get("total_line"))
    if total is not None:
        total = implied_total(km, total, val(row.get("over_odds")), val(row.get("under_odds")))
    return MarketView("nflverse", margin, total, {})
