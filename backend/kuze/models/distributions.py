"""Discrete, key-number-aware distributions for NFL final margins and totals.

A plain normal curve says a game lands on exactly 3 about 3% of the time; in the modern NFL
it is ~15% of games (7: ~9%, 6: ~7%, 10/14: ~5%). Pricing a spread without this is how you
overpay for -3.5 or undervalue +3. We model

    P(margin = k | loc)  ∝  core(k; loc) * w(|k|)

* core: a narrow-core / wide-tail scale mixture of normals. A single normal with the residual
  sd (13) makes 7-point favorites lose outright 30% of the time (reality ~24%); the mixture
  matches the market's spread->moneyline conversion (Brier equal to de-vigged closing MLs).
* w: key-number weights by |margin|, fitted by iterative proportional fitting on 2011+ games,
  bucketed by how close the game is expected to be (shrunk toward the pooled weights).
* Mean anchoring: the weights push mass away from 0-2, so the pmf's mean is not ``loc``. All
  public functions take the EXPECTED margin (what the regression predicts / the market
  implies) and solve for the location that produces that mean. The weights are fitted the
  same way (closing spread = mean), so everything is on one consistent scale.

Totals get the same treatment with one (mildly keyed) weight vector.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

MARGIN_MAX = 80
TOTAL_MAX = 130
MU_BUCKETS = (3.75, 7.75)
_BUCKET_CENTERS = (1.75, 5.5, 11.0)
_LOC_GRID = np.round(np.arange(-45.0, 45.0001, 0.05), 4)
_TLOC_GRID = np.round(np.arange(5.0, 95.0001, 0.05), 4)
_STATIC = Path(__file__).resolve().parent / "fitted"
K = np.arange(-MARGIN_MAX, MARGIN_MAX + 1)
T = np.arange(0, TOTAL_MAX + 1)
MIXTURE_GRID = ((10, 13, 0.5), (11, 13, 0.35), (11, 15, 0.2), (11, 14, 0.3), (12, 13, 0.0), (10, 14, 0.4))


def _default_margin_weights() -> np.ndarray:
    return np.ones((len(MU_BUCKETS) + 1, MARGIN_MAX + 1))


def _interp_bucket(W: np.ndarray, a) -> np.ndarray:
    """Weights for |loc| = a, interpolated between bucket centers -> (n, MARGIN_MAX+1)."""
    c = np.array(_BUCKET_CENTERS)
    a = np.atleast_1d(np.asarray(a, dtype=float))
    idx = np.clip(np.searchsorted(c, a) - 1, 0, len(c) - 2)
    t = np.clip((a - c[idx]) / (c[idx + 1] - c[idx]), 0.0, 1.0)
    return (1 - t)[:, None] * W[idx] + t[:, None] * W[idx + 1]


@dataclass
class KeyNumberModel:
    margin_weights: np.ndarray = field(default_factory=_default_margin_weights)  # [bucket, |margin|]
    total_weights: np.ndarray = field(default_factory=lambda: np.ones(TOTAL_MAX + 1))
    margin_sd: float = 12.9      # sd of (result - closing line): scaling reference
    core_sd: float = 11.0
    tail_sd: float = 15.0
    tail_w: float = 0.2
    total_sd_a: float = 8.0      # total sd = a + b * expected total
    total_sd_b: float = 0.11
    fitted_on: str = "default"
    _loc_cache: dict = field(default_factory=dict, repr=False)

    # ------------------------------------------------------------------ location-parameterized
    def _core(self, k, loc, scale: float = 1.0):
        return ((1 - self.tail_w) * norm.pdf(k, loc=loc, scale=self.core_sd * scale)
                + self.tail_w * norm.pdf(k, loc=loc, scale=self.tail_sd * scale))

    def pmf_at_loc(self, loc: float, scale: float = 1.0) -> np.ndarray:
        w = _interp_bucket(self.margin_weights, abs(loc))[0]
        p = self._core(K, loc, scale) * w[np.abs(K)]
        return p / p.sum()

    def total_pmf_at_loc(self, loc: float, sd: float) -> np.ndarray:
        p = norm.pdf(T, loc=loc, scale=sd) * self.total_weights
        return p / p.sum()

    def _margin_loc(self, mean: float, scale: float = 1.0) -> float:
        key = ("m", round(scale, 3))
        if key not in self._loc_cache:
            means = np.array([(K * self.pmf_at_loc(l, scale)).sum() for l in _LOC_GRID])
            self._loc_cache[key] = np.maximum.accumulate(means)
        return float(np.interp(mean, self._loc_cache[key], _LOC_GRID))

    def _total_loc(self, mean: float) -> float:
        if "t" not in self._loc_cache:
            means = np.array([(T * self.total_pmf_at_loc(l, self.total_sd(l))).sum() for l in _TLOC_GRID])
            self._loc_cache["t"] = np.maximum.accumulate(means)
        return float(np.interp(mean, self._loc_cache["t"], _TLOC_GRID))

    # ------------------------------------------------------------------ public: mean-parameterized
    def margin_pmf(self, mu: float, sd: float | None = None, allow_tie: bool = True) -> tuple[np.ndarray, np.ndarray]:
        """Distribution of the HOME margin whose expected value is ``mu``.

        ``sd`` optionally widens the distribution relative to the fitted spread of results
        around the closing line (e.g. for extra model uncertainty).
        """
        scale = (sd / self.margin_sd) if sd else 1.0
        p = self.pmf_at_loc(self._margin_loc(mu, scale), scale)
        if not allow_tie:
            p = p.copy()
            p[K == 0] = 0.0
            p /= p.sum()
        return K, p

    def total_pmf(self, mu: float, sd: float | None = None) -> tuple[np.ndarray, np.ndarray]:
        if sd is not None:
            return T, self.total_pmf_at_loc(mu, sd)
        loc = self._total_loc(mu)
        return T, self.total_pmf_at_loc(loc, self.total_sd(loc))

    def total_sd(self, mu: float) -> float:
        return self.total_sd_a + self.total_sd_b * mu

    # ------------------------------------------------------------------ fitting
    @classmethod
    def fit(cls, games: pd.DataFrame, min_season: int = 2011, iters: int = 40, outer: int = 3,
            bucket_pseudo: float = 8.0) -> "KeyNumberModel":
        g = games[(games["season"] >= min_season) & games["result"].notna() & games["spread_line"].notna()
                  & games["total_line"].notna()]
        model = cls()
        model.margin_sd = float((g["result"] - g["spread_line"]).std())
        tres = (g["total"] - g["total_line"]).to_numpy()
        tl = g["total_line"].to_numpy()
        X = np.vstack([np.ones_like(tl), tl]).T
        coef = np.linalg.lstsq(X, np.abs(tres) * np.sqrt(np.pi / 2), rcond=None)[0]
        model.total_sd_a, model.total_sd_b = float(coef[0]), float(coef[1])

        means = g["spread_line"].to_numpy(float)
        res = np.clip(g["result"].to_numpy(float).astype(int), -MARGIN_MAX, MARGIN_MAX)
        best = None
        for core, tail, tw in MIXTURE_GRID:
            model.core_sd, model.tail_sd, model.tail_w = float(core), float(tail), float(tw)
            W, locs = model._fit_margin_weights(means, res, iters, outer, bucket_pseudo)
            ll = _loglik(model, locs, res, W)
            if best is None or ll > best[0]:
                best = (ll, core, tail, tw, W)
        _, core, tail, tw, W = best
        model.core_sd, model.tail_sd, model.tail_w, model.margin_weights = float(core), float(tail), float(tw), W
        model._loc_cache = {}

        # totals: mean-anchored IPF on one weight vector, shrunk toward 1 (totals are barely keyed)
        tmeans = g["total_line"].to_numpy(float)
        tobs = np.bincount(g["total"].to_numpy().astype(int).clip(0, TOTAL_MAX), minlength=TOTAL_MAX + 1).astype(float)
        v = np.ones(TOTAL_MAX + 1)
        locs = tmeans.copy()
        for _ in range(outer):
            sds = model.total_sd_a + model.total_sd_b * locs
            dens = norm.pdf(T[None, :], loc=locs[:, None], scale=sds[:, None])
            for _ in range(iters):
                p = dens * v[None, :]
                p /= p.sum(axis=1, keepdims=True)
                exp_t = p.sum(axis=0)
                v *= np.where(exp_t > 1.0, (tobs + 20) / (exp_t + 20), 1.0)
                v /= v[30:60].mean()
            v[:15] = np.minimum(v[:15], 1.0)
            v[80:] = 1.0
            model.total_weights = v.copy()
            model._loc_cache.pop("t", None)
            locs = np.array([model._total_loc(m) for m in tmeans])
        model._loc_cache = {}
        model.fitted_on = f"{min_season}-{int(g['season'].max())} ({len(g)} games)"
        return model

    def _fit_margin_weights(self, means, res, iters, outer, bucket_pseudo):
        """Alternate: fit weights given locations; re-anchor locations so pmf means = closing spreads."""
        locs = means.copy()
        W = _default_margin_weights()
        for _ in range(outer):
            pooled = _ipf(self, locs, res, np.ones(MARGIN_MAX + 1), iters, pseudo=0.5)
            bucket = np.digitize(np.abs(locs), MU_BUCKETS)
            for b in range(len(MU_BUCKETS) + 1):
                sel = bucket == b
                W[b] = _ipf(self, locs[sel], res[sel], pooled, iters, pseudo=bucket_pseudo)
            self.margin_weights = W.copy()
            self._loc_cache = {}
            locs = np.array([self._margin_loc(m) for m in means])
        return W.copy(), locs

    # ------------------------------------------------------------------ persistence
    def to_json(self) -> dict:
        return {"margin_weights": np.round(self.margin_weights, 5).tolist(),
                "total_weights": np.round(self.total_weights, 5).tolist(),
                "margin_sd": self.margin_sd, "core_sd": self.core_sd, "tail_sd": self.tail_sd, "tail_w": self.tail_w,
                "total_sd_a": self.total_sd_a, "total_sd_b": self.total_sd_b, "fitted_on": self.fitted_on}

    @classmethod
    def from_json(cls, d: dict) -> "KeyNumberModel":
        W = np.array(d["margin_weights"])
        if W.ndim == 3:   # legacy (fav/dog oriented) format
            W = W.mean(axis=1)
        return cls(margin_weights=W, total_weights=np.array(d["total_weights"]), margin_sd=d["margin_sd"],
                   core_sd=d.get("core_sd", 11.0), tail_sd=d.get("tail_sd", 15.0), tail_w=d.get("tail_w", 0.2),
                   total_sd_a=d["total_sd_a"], total_sd_b=d["total_sd_b"], fitted_on=d.get("fitted_on", "?"))

    def save(self, path: Path | None = None) -> Path:
        path = path or _STATIC / "key_numbers.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_json()))
        return path

    @classmethod
    def load(cls, path: Path | None = None) -> "KeyNumberModel":
        path = path or _STATIC / "key_numbers.json"
        if path.exists():
            return cls.from_json(json.loads(path.read_text()))
        return cls()


def _ipf(model: KeyNumberModel, locs, results, w0, iters, pseudo) -> np.ndarray:
    """Iterative proportional fitting of one |margin| weight vector for the given games.

    ``pseudo`` is a pseudo-count that shrinks thinly-populated cells back to the start weights.
    """
    dens = model._core(K[None, :], locs[:, None])
    obs = np.bincount(np.abs(results), minlength=MARGIN_MAX + 1).astype(float)
    w = np.asarray(w0, dtype=float).copy()
    for _ in range(iters):
        p = dens * w[np.abs(K)][None, :]
        p /= p.sum(axis=1, keepdims=True)
        exp = np.zeros(MARGIN_MAX + 1)
        np.add.at(exp, np.abs(K), p.sum(axis=0))
        w *= np.where(exp > 0.05, (obs + pseudo) / (exp + pseudo), 1.0)
        w /= w[25:40].mean()
    w[41:] = 1.0
    return _smooth_tail(w, 21)


def _loglik(model: KeyNumberModel, locs, results, W) -> float:
    wts = _interp_bucket(W, np.abs(locs))
    dens = model._core(K[None, :], locs[:, None]) * wts[:, np.abs(K)]
    dens /= dens.sum(axis=1, keepdims=True)
    return float(np.log(dens[np.arange(len(results)), results + MARGIN_MAX]).mean())


def _smooth_tail(w: np.ndarray, start: int) -> np.ndarray:
    """Keep exact weights for common margins, lightly smooth the noisy rarely-seen tail."""
    out = w.copy()
    for i in range(start, len(w) - 1):
        lo, hi = max(start, i - 1), min(len(w), i + 2)
        out[i] = 0.5 * w[i] + 0.5 * w[lo:hi].mean()
    return out


# ---------------------------------------------------------------------------------------
# Bet outcome probabilities from a pmf
# ---------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Outcome:
    win: float
    push: float
    loss: float

    @property
    def win_no_push(self) -> float:
        d = self.win + self.loss
        return self.win / d if d > 0 else 0.0


def spread_outcome(support: np.ndarray, pmf: np.ndarray, team_margin_sign: int, line: float) -> Outcome:
    """Bet on a team at ``line`` (e.g. -3.5 favorite, +7 dog).

    support/pmf are HOME margins. team_margin_sign=+1 for the home team, -1 for away.
    The bet wins when team_margin + line > 0.
    """
    val = support * team_margin_sign + line
    return Outcome(float(pmf[val > 1e-9].sum()), float(pmf[np.abs(val) <= 1e-9].sum()), float(pmf[val < -1e-9].sum()))


def moneyline_outcome(support: np.ndarray, pmf: np.ndarray, team_margin_sign: int) -> Outcome:
    """Moneyline: ties refund (push) at US books for 2-way NFL moneylines."""
    tm = support * team_margin_sign
    return Outcome(float(pmf[tm > 0].sum()), float(pmf[tm == 0].sum()), float(pmf[tm < 0].sum()))


def total_outcome(support: np.ndarray, pmf: np.ndarray, side: str, line: float) -> Outcome:
    over = support > line + 1e-9
    push = np.abs(support - line) <= 1e-9
    under = support < line - 1e-9
    if side == "over":
        return Outcome(float(pmf[over].sum()), float(pmf[push].sum()), float(pmf[under].sum()))
    return Outcome(float(pmf[under].sum()), float(pmf[push].sum()), float(pmf[over].sum()))
