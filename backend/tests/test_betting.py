import math

import pytest

from kuze.models import betting as B
from kuze.models.distributions import Outcome


def test_price_conversions_round_trip():
    for odds in (-500, -150, -110, 100, 120, 350):
        assert B.decimal_to_american(B.american_to_decimal(odds)) == pytest.approx(odds)
    assert B.implied_prob(-110) == pytest.approx(110 / 210)
    assert B.implied_prob(+150) == pytest.approx(0.4)
    assert B.prob_to_american(0.5) == pytest.approx(100)
    assert B.prob_to_american(0.75) == pytest.approx(-300)


@pytest.mark.parametrize("method", ["multiplicative", "power", "shin"])
def test_devig_sums_to_one(method):
    a, b = B.devig(-150, +130, method)
    assert a + b == pytest.approx(1.0, abs=1e-9)
    assert a > 0.5 > b


def test_devig_symmetric_market_is_fifty_fifty():
    for method in ("multiplicative", "power", "shin"):
        a, b = B.devig(-110, -110, method)
        assert a == pytest.approx(0.5) and b == pytest.approx(0.5)


def test_power_devig_shades_the_longshot():
    # favorite-longshot bias: power de-vig gives the longshot less than proportional scaling
    _, dog_mult = B.devig(-400, +320, "multiplicative")
    _, dog_pow = B.devig(-400, +320, "power")
    assert dog_pow < dog_mult


def test_expected_value_and_pushes():
    assert B.expected_value(Outcome(0.55, 0.0, 0.45), -110) == pytest.approx(0.55 * 100 / 110 - 0.45)
    # a push refunds the stake: it neither wins nor loses
    assert B.expected_value(Outcome(0.50, 0.10, 0.40), +100) == pytest.approx(0.10)
    assert B.expected_value(Outcome(0.5238, 0.0, 0.4762), -110) == pytest.approx(0.0, abs=1e-3)


def test_kelly():
    b = 100 / 110
    assert B.kelly_fraction(Outcome(0.55, 0.0, 0.45), -110) == pytest.approx((b * 0.55 - 0.45) / b)
    assert B.kelly_fraction(Outcome(0.45, 0.0, 0.55), -110) == 0.0          # never bet negative EV
    # a push leaves the bankroll unchanged: Kelly equals the no-push bet on the conditional odds
    assert B.kelly_fraction(Outcome(0.50, 0.08, 0.42), -110) == pytest.approx(
        B.kelly_fraction(Outcome(0.50 / 0.92, 0.0, 0.42 / 0.92), -110))


def test_fair_price_excludes_pushes():
    assert B.fair_american(Outcome(0.45, 0.10, 0.45)) == pytest.approx(100)
    assert math.isnan(B.decimal_to_american(1.0))
    assert B.fmt_american(150.4) == "+150" and B.fmt_american(-110) == "-110" and B.fmt_american(None) == "—"
