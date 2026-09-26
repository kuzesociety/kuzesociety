"""Odds math: implied probability, de-vig, EV, Kelly, fair prices and playable thresholds."""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import brentq

from kuze.models.distributions import KeyNumberModel, Outcome, moneyline_outcome, spread_outcome, total_outcome


# ----------------------------------------------------------------------------- conversions
def american_to_decimal(odds: float) -> float:
    return 1 + (odds / 100.0 if odds > 0 else 100.0 / -odds)


def decimal_to_american(dec: float) -> float:
    if dec <= 1:
        return float("nan")
    return (dec - 1) * 100.0 if dec >= 2 else -100.0 / (dec - 1)


def implied_prob(odds: float) -> float:
    """Break-even probability of an American price (includes the vig)."""
    return 1.0 / american_to_decimal(odds)


def prob_to_american(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return decimal_to_american(1.0 / p)


def fmt_american(odds: float | None) -> str:
    if odds is None or (isinstance(odds, float) and math.isnan(odds)):
        return "—"
    o = int(round(odds))
    return f"+{o}" if o > 0 else str(o)


# ----------------------------------------------------------------------------- de-vig
def devig(odds_a: float, odds_b: float, method: str = "power") -> tuple[float, float]:
    """No-vig probabilities for a two-way market.

    multiplicative: proportional scaling (standard)
    power:          p_i = q_i^k with k solving sum = 1 (handles favorite-longshot bias better)
    shin:           Shin (1993) insider-trading model
    """
    qa, qb = implied_prob(odds_a), implied_prob(odds_b)
    if method == "multiplicative":
        s = qa + qb
        return qa / s, qb / s
    if method == "power":
        k = brentq(lambda k: qa ** k + qb ** k - 1.0, 0.5, 3.0)
        return qa ** k, qb ** k
    if method == "shin":
        s = qa + qb
        def z_eq(z):
            pa = (math.sqrt(z ** 2 + 4 * (1 - z) * qa ** 2 / s) - z) / (2 * (1 - z))
            pb = (math.sqrt(z ** 2 + 4 * (1 - z) * qb ** 2 / s) - z) / (2 * (1 - z))
            return pa + pb - 1
        z = brentq(z_eq, 0.0, 0.4) if z_eq(0.0) * z_eq(0.4) < 0 else 0.0
        pa = (math.sqrt(z ** 2 + 4 * (1 - z) * qa ** 2 / s) - z) / (2 * (1 - z))
        return pa, 1 - pa
    raise ValueError(method)


def hold(odds_a: float, odds_b: float) -> float:
    return implied_prob(odds_a) + implied_prob(odds_b) - 1.0


# ----------------------------------------------------------------------------- EV & staking
def expected_value(outcome: Outcome, odds: float) -> float:
    """Expected profit per 1 unit staked (pushes refund the stake)."""
    b = american_to_decimal(odds) - 1
    return outcome.win * b - outcome.loss


def kelly_fraction(outcome: Outcome, odds: float) -> float:
    """Full-Kelly stake as a fraction of bankroll, accounting for pushes."""
    b = american_to_decimal(odds) - 1
    pw, pl = outcome.win, outcome.loss
    if pw + pl <= 0:
        return 0.0
    f = (b * pw - pl) / (b * (pw + pl))
    return max(0.0, f)


def fair_american(outcome: Outcome) -> float:
    """Price at which the bet is exactly zero-EV (pushes excluded)."""
    return prob_to_american(outcome.win_no_push)


# ----------------------------------------------------------------------------- market evaluation
@dataclass
class BetEval:
    market: str            # spread / moneyline / total
    selection: str         # e.g. "GB -3.5", "Over 44.5"
    line: float | None
    odds: float
    win: float
    push: float
    loss: float
    ev: float              # per unit staked
    kelly: float
    fair_odds: float
    breakeven: float       # win probability needed (pushes excluded)

    def as_dict(self) -> dict:
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


def eval_spread(km: KeyNumberModel, fair_margin: float, side: str, team: str, line: float, odds: float,
                sd: float | None = None) -> BetEval:
    """side: 'home' or 'away'; line from that team's perspective (e.g. -3.5)."""
    k, p = km.margin_pmf(fair_margin, sd)
    o = spread_outcome(k, p, 1 if side == "home" else -1, line)
    sign = "+" if line > 0 else ""
    return BetEval("spread", f"{team} {sign}{line:g}", line, odds, o.win, o.push, o.loss, expected_value(o, odds),
                   kelly_fraction(o, odds), fair_american(o), implied_prob(odds) * (1.0))


def eval_moneyline(km: KeyNumberModel, fair_margin: float, side: str, team: str, odds: float,
                   sd: float | None = None) -> BetEval:
    k, p = km.margin_pmf(fair_margin, sd)
    o = moneyline_outcome(k, p, 1 if side == "home" else -1)
    return BetEval("moneyline", f"{team} ML", None, odds, o.win, o.push, o.loss, expected_value(o, odds),
                   kelly_fraction(o, odds), fair_american(o), implied_prob(odds))


def eval_total(km: KeyNumberModel, fair_total: float, side: str, line: float, odds: float,
               sd: float | None = None) -> BetEval:
    t, p = km.total_pmf(fair_total, sd)
    o = total_outcome(t, p, side, line)
    return BetEval("total", f"{side.title()} {line:g}", line, odds, o.win, o.push, o.loss, expected_value(o, odds),
                   kelly_fraction(o, odds), fair_american(o), implied_prob(odds))


def spread_thresholds(km: KeyNumberModel, fair_margin: float, side: str, odds: float, min_ev_play: float,
                      min_ev_lean: float, sd: float | None = None) -> dict:
    """Best / playable / pass lines for a side at a given price, computed from the model.

    Scans lines in half points and reports the worst line still worth a PLAY, the worst still
    worth a LEAN, and the first line that is a PASS.
    """
    sign = 1 if side == "home" else -1
    k, p = km.margin_pmf(fair_margin, sd)
    rows = []
    for line in np.arange(-30, 30.5, 0.5):
        o = spread_outcome(k, p, sign, float(line))
        rows.append((float(line), expected_value(o, odds)))
    # EV increases with the line (more points is better) -> find crossing points
    def worst(th):
        ok = [ln for ln, ev in rows if ev >= th]
        return min(ok) if ok else None
    play_to, lean_to, zero = worst(min_ev_play), worst(min_ev_lean), worst(0.0)
    return {"playable_to": play_to, "lean_to": lean_to, "breakeven_line": zero,
            "pass_at": (lean_to - 0.5) if lean_to is not None else None}


def total_thresholds(km: KeyNumberModel, fair_total: float, side: str, odds: float, min_ev_play: float,
                     min_ev_lean: float, sd: float | None = None) -> dict:
    t, p = km.total_pmf(fair_total, sd)
    rows = []
    for line in np.arange(20, 80.5, 0.5):
        o = total_outcome(t, p, side, float(line))
        rows.append((float(line), expected_value(o, odds)))
    ok = lambda th: [ln for ln, ev in rows if ev >= th]
    if side == "over":   # lower totals are better for overs
        f = lambda th: max(ok(th)) if ok(th) else None
        step = 0.5
    else:
        f = lambda th: min(ok(th)) if ok(th) else None
        step = -0.5
    play_to, lean_to, zero = f(min_ev_play), f(min_ev_lean), f(0.0)
    return {"playable_to": play_to, "lean_to": lean_to, "breakeven_line": zero,
            "pass_at": (lean_to + step) if lean_to is not None else None}


def ml_thresholds(win_prob_no_push: float, min_ev_play: float, min_ev_lean: float) -> dict:
    """Worst American price still worth a PLAY / LEAN, and the zero-EV fair price."""
    def price_for(ev):
        dec = (1 + ev) / max(win_prob_no_push, 1e-9)
        return decimal_to_american(dec)
    return {"playable_to": price_for(min_ev_play), "lean_to": price_for(min_ev_lean),
            "fair_price": price_for(0.0)}
