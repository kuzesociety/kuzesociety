import pytest

from kuze.models.distributions import KeyNumberModel
from kuze.models.market import implied_margin_from_ml, implied_margin_from_spread, implied_total


@pytest.fixture(scope="module")
def km():
    return KeyNumberModel.load()


def test_spread_price_moves_the_implied_margin(km):
    base = implied_margin_from_spread(km, -3.0, -110, -110)
    juiced = implied_margin_from_spread(km, -3.0, -130, +110)   # favorite -3 at -130: market expects more
    cheap = implied_margin_from_spread(km, -3.0, +105, -125)
    assert 2.0 < base < 4.0
    assert juiced > base > cheap


def test_missing_prices_fall_back_to_the_line(km):
    assert implied_margin_from_spread(km, -6.5, None, None) == 6.5
    assert implied_total(km, 44.5, None, None) == 44.5


def test_moneyline_inversion(km):
    even = implied_margin_from_ml(km, -110, -110)
    fav = implied_margin_from_ml(km, -300, +240)
    assert abs(even) < 0.5
    assert 5.0 < fav < 9.0


def test_total_price_moves_the_implied_total(km):
    assert implied_total(km, 44.5, -125, +105) > implied_total(km, 44.5, -110, -110) > implied_total(km, 44.5, +105, -125)
