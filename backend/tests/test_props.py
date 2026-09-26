import numpy as np
import pandas as pd
import pytest

from kuze.props import model as PM


def test_recalibration_recovers_an_over_dispersed_projection():
    rng = np.random.default_rng(0)
    truth = rng.normal(32, 3, 5000)
    proj = 32 + 1.6 * (truth - 32)                   # projection 60% too extreme
    actual = truth + rng.normal(0, 6, truth.size)
    a, b = PM.fit_recal(proj, actual, np.full(truth.size, 2025))
    assert b == pytest.approx(1 / 1.6, abs=0.05)
    fixed = PM.apply_recal(proj, (a, b))
    lo = proj < np.quantile(proj, 0.1)
    assert abs(fixed[lo].mean() - actual[lo].mean()) < abs(proj[lo].mean() - actual[lo].mean())


def test_recalibration_slope_is_bounded():
    x = np.linspace(10, 50, 200)
    a, b = PM.fit_recal(x, 3 * x, np.full(x.size, 2024))    # absurd slope gets clipped
    assert b == 1.0
    assert PM.apply_recal(np.array([-5.0]), (0.0, 1.0))[0] == pytest.approx(0.05)
    assert PM.apply_recal(np.array([3.0]), None)[0] == 3.0


def test_ratio_distribution_probabilities_add_up():
    rng = np.random.default_rng(1)
    proj = rng.uniform(20, 80, 4000)
    actual = proj * rng.gamma(4, 0.25, proj.size)
    dist = PM.RatioDistribution.fit(proj, actual)
    over, push, under = dist.prob_over(50.0, 49.5)
    assert push == 0 and over + under == pytest.approx(1.0)
    over, push, under = dist.prob_over(50.0, 50.0)
    assert over + push + under == pytest.approx(1.0)
    q = dist.quantiles(50.0)
    assert q["p10"] < q["p50"] < q["p90"]


def test_calibration_matrix_hides_irrelevant_features():
    cols = {c: [1.0, 2.0] for c in PM.CAL_FEATURES if c not in ("s_proj", "pos_code")}
    d = pd.DataFrame({"position": ["QB", "WR"], **cols})
    X = PM.cal_matrix(d, pd.Series([30.0, 60.0]))
    assert (X.loc[0, list(PM.RECEIVING_ONLY)] == PM.MASKED).all()     # a QB's "yards per target"
    assert (X.loc[1, [c for c in PM.PASSING_ONLY if c in X]] == PM.MASKED).all()
    assert X.loc[1, "f_ypt"] == 2.0 and X.loc[0, "f_ypa"] == 1.0
    assert list(X["s_proj"]) == [30.0, 60.0]
