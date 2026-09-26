import pytest

from kuze.models.distributions import KeyNumberModel, moneyline_outcome, spread_outcome, total_outcome


@pytest.fixture(scope="module")
def km():
    return KeyNumberModel.load()


@pytest.mark.parametrize("mu", [-10.5, -3.0, 0.0, 2.5, 7.0, 13.5])
def test_margin_pmf_is_a_distribution_with_the_requested_mean(km, mu):
    k, p = km.margin_pmf(mu)
    assert p.min() >= 0
    assert p.sum() == pytest.approx(1.0, abs=1e-9)
    assert (k * p).sum() == pytest.approx(mu, abs=0.05)      # mean-anchored, not just located at mu


def test_key_numbers_carry_extra_mass(km):
    k, p = km.margin_pmf(-2.5)
    pm = dict(zip(k.tolist(), p.tolist()))
    # 3 and 7 are the NFL's key margins: more likely than their neighbours
    for key in (-3, -7, 3, 7):
        assert pm[key] > pm[key - 1] and pm[key] > pm[key + 1]


def test_margin_pmf_symmetry(km):
    k, p = km.margin_pmf(4.0)
    k2, p2 = km.margin_pmf(-4.0)
    pos, neg = dict(zip(k.tolist(), p.tolist())), dict(zip(k2.tolist(), p2.tolist()))
    for m in range(-30, 31):
        assert pos.get(m, 0.0) == pytest.approx(neg.get(-m, 0.0), abs=1e-6)


def test_total_pmf(km):
    t, p = km.total_pmf(44.5)
    assert p.sum() == pytest.approx(1.0, abs=1e-9)
    assert (t * p).sum() == pytest.approx(44.5, abs=0.1)


def test_spread_outcomes_are_complementary(km):
    k, p = km.margin_pmf(3.0)
    fav = spread_outcome(k, p, +1, -3.0)        # home -3
    dog = spread_outcome(k, p, -1, +3.0)        # away +3
    assert fav.win == pytest.approx(dog.loss) and fav.push == pytest.approx(dog.push)
    assert fav.push > 0.05                      # landing exactly on 3 is common
    half = spread_outcome(k, p, +1, -3.5)
    assert half.push == 0.0 and half.win + half.loss == pytest.approx(1.0)


def test_moneyline_ties_push(km):
    k, p = km.margin_pmf(0.0, allow_tie=True)
    home = moneyline_outcome(k, p, +1)
    away = moneyline_outcome(k, p, -1)
    assert home.win == pytest.approx(away.loss)
    assert home.win == pytest.approx(0.5, abs=0.02)


def test_total_outcome(km):
    t, p = km.total_pmf(47.0)
    over = total_outcome(t, p, "over", 47.0)
    under = total_outcome(t, p, "under", 47.0)
    assert over.win == pytest.approx(under.loss) and over.push == pytest.approx(under.push)
    assert over.win + over.push + over.loss == pytest.approx(1.0)
