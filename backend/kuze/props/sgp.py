"""Same-game parlay simulator (Gaussian copula over calibrated marginals).

Every leg keeps its own calibrated distribution (game legs: key-number margin/total; player
legs: out-of-sample ratio distributions). Dependence comes from shared latent factors whose
loadings were estimated out of sample (scripts/fit_sgp.py):

  * game script: team-perspective margin and total (e.g. RB carries +0.24 with margin,
    QB attempts -0.21 with margin, QB passing TDs +0.48 with total)
  * team passing factor (QB yards <-> WR yards ~0.26 partial correlation)
  * team rushing factor (RB1 rushing vs receivers slightly negative)

Output: joint hit probability, fair SGP odds, the naive independent product, and the
correlation lift. A leg only belongs in an SGP if it supports the same script.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.stats import norm

from kuze.analysis.matchups import simulate_scores
from kuze.models import betting as B
from kuze.models.distributions import KeyNumberModel

PARAMS_PATH = Path(__file__).resolve().parent / "sgp_params.json"


@dataclass
class Leg:
    kind: str                     # "spread" | "moneyline" | "total" | "player"
    side: str                     # home/away (spread, ML), over/under (total, player)
    line: float | None = None
    team: str | None = None       # player's team, or spread/ML team
    stat: str | None = None
    position: str | None = None
    projection: float | None = None
    player: str | None = None
    odds: float | None = None     # single-leg price, for display
    dist: object = field(default=None, repr=False)

    def describe(self) -> str:
        if self.kind == "player":
            return f"{self.player} {self.side.title()} {self.line:g} {self.stat.replace('_', ' ')}"
        if self.kind == "total":
            return f"{self.side.title()} {self.line:g}"
        if self.kind == "moneyline":
            return f"{self.team} ML"
        return f"{self.team} {'+' if self.line > 0 else ''}{self.line:g}"


class SGPSimulator:
    def __init__(self, km: KeyNumberModel, params: dict | None = None):
        self.km = km
        self.params = params or (json.loads(PARAMS_PATH.read_text()) if PARAMS_PATH.exists() else {"stats": {}})

    def _loadings(self, stat: str, pos: str) -> dict:
        s = self.params.get("stats", {}).get(stat, {})
        rec = s.get(pos) or (next(iter(s.values())) if s else {})
        lm, lt = rec.get("margin", 0.0), rec.get("total", 0.0)
        idio = max(1 - lm ** 2 - lt ** 2, 0.05)
        if stat == "passing_yards":
            lp = 0.9 * np.sqrt(idio)                    # the QB's yards define the team passing factor
        else:
            lp = rec.get("pass_factor", 0.0) * np.sqrt(idio)
        if stat == "rushing_yards" and pos == "RB":
            lr = 0.9 * np.sqrt(idio)
        else:
            lr = rec.get("rush_factor", 0.0) * np.sqrt(idio)
        rest = 1 - lm ** 2 - lt ** 2 - lp ** 2 - lr ** 2
        if rest < 0.02:  # keep the covariance valid
            scale = np.sqrt((1 - 0.02) / (lm ** 2 + lt ** 2 + lp ** 2 + lr ** 2))
            lm, lt, lp, lr = lm * scale, lt * scale, lp * scale, lr * scale
            rest = 0.02
        return {"m": lm, "t": lt, "p": lp, "r": lr, "e": np.sqrt(rest)}

    def simulate(self, home: str, away: str, fair_margin: float, fair_total: float, legs: list[Leg],
                 n: int = 40000, seed: int = 11, sgp_odds: float | None = None) -> dict:
        rng = np.random.default_rng(seed)
        margins, totals = simulate_scores(self.km, fair_margin, fair_total, n=n, seed=seed)
        k, pk = self.km.margin_pmf(fair_margin)
        t, pt = self.km.total_pmf(fair_total)
        cdf_m = np.cumsum(pk)
        cdf_t = np.cumsum(pt)
        u_m = np.interp(margins, k, cdf_m) - 0.5 * np.interp(margins, k, pk)
        u_t = np.interp(totals, t, cdf_t) - 0.5 * np.interp(totals, t, pt)
        z_m_home = norm.ppf(np.clip(u_m, 1e-4, 1 - 1e-4))
        z_t = norm.ppf(np.clip(u_t, 1e-4, 1 - 1e-4))
        f_pass = {home: rng.standard_normal(n), away: rng.standard_normal(n)}
        f_rush = {home: rng.standard_normal(n), away: rng.standard_normal(n)}
        hits = np.ones(n, dtype=bool)
        pushes = np.zeros(n, dtype=bool)
        singles = []
        for leg in legs:
            if leg.kind in ("spread", "moneyline"):
                tm = margins if leg.team == home else -margins
                val = tm + (leg.line if leg.kind == "spread" else 0.0)
                h, p = val > 0, val == 0
            elif leg.kind == "total":
                h = totals > leg.line if leg.side == "over" else totals < leg.line
                p = totals == leg.line
            else:
                L = self._loadings(leg.stat, leg.position or "WR")
                z_m = z_m_home if leg.team == home else -z_m_home
                z = L["m"] * z_m + L["t"] * z_t + L["p"] * f_pass[leg.team] + L["r"] * f_rush[leg.team] + \
                    L["e"] * rng.standard_normal(n)
                u = norm.cdf(z)
                samples = np.sort(leg.dist.samples(leg.projection))
                sim = np.quantile(samples, u)
                if float(leg.line).is_integer():
                    sim = np.round(sim)
                h = sim > leg.line if leg.side == "over" else sim < leg.line
                p = sim == leg.line
            singles.append({"leg": leg.describe(), "prob": float(h.mean()), "push": float(p.mean()),
                            "odds": leg.odds, "fair_odds": round(B.prob_to_american(max(float(h.mean()), 1e-4)))})
            hits &= h
            pushes |= p
        # Hard Rock (like most books) drops pushed legs from an SGP; we report the strict all-win probability
        joint = float(hits.mean())
        indep = float(np.prod([s["prob"] for s in singles]))
        out = {"legs": singles, "joint_prob": joint, "independent_prob": indep,
               "correlation_lift": (joint / indep) if indep > 0 else None,
               "fair_odds": round(B.prob_to_american(max(joint, 1e-5))), "sims": n}
        if sgp_odds is not None:
            ev = joint * (B.american_to_decimal(sgp_odds) - 1) - (1 - joint)
            out.update({"offered_odds": sgp_odds, "ev": ev, "implied_prob": B.implied_prob(sgp_odds)})
        return out


SCRIPT_TEMPLATES = {
    "A": {"name": "Favorite controls", "game": [("spread", "fav")],
          "players": [("fav", "RB", "carries", "over"), ("fav", "RB", "rushing_yards", "over"),
                      ("dog", "QB", "attempts", "over")]},
    "B": {"name": "Shootout", "game": [("total", "over")],
          "players": [("fav", "QB", "passing_yards", "over"), ("dog", "QB", "passing_yards", "over"),
                      ("fav", "WR", "receiving_yards", "over")]},
    "C": {"name": "Underdog keeps it close", "game": [("spread", "dog")],
          "players": [("dog", "QB", "completions", "over"), ("fav", "RB", "rushing_yards", "over")]},
    "D": {"name": "Blowout", "game": [("moneyline", "fav")],
          "players": [("fav", "RB", "rushing_yards", "over"), ("dog", "QB", "attempts", "over")]},
    "E": {"name": "Defensive grind", "game": [("total", "under")],
          "players": [("fav", "RB", "carries", "over"), ("fav", "QB", "passing_yards", "under"),
                      ("dog", "QB", "passing_yards", "under")]},
}
