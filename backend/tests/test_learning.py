import datetime as dt

import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from kuze.db.models import Base, PropPrediction
from kuze.learning import feedback


@pytest.fixture()
def db():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    with Session(eng) as s:
        yield s


def _add(db, stat, proj, actual):
    now = dt.datetime.now(dt.timezone.utc)
    for i, (p, a) in enumerate(zip(proj, actual)):
        db.add(PropPrediction(game_id=f"g{i}", player_id=f"p{i}", stat=stat, projection=float(p), actual=float(a),
                              taken_at=now - dt.timedelta(days=int(i % 30))))
    db.commit()


def test_unbiased_skewed_projections_are_left_alone(db):
    # zero-inflated, right-skewed outcomes with an unbiased mean: a mean-of-log-ratios estimator
    # would "learn" to cut these projections roughly in half
    rng = np.random.default_rng(3)
    proj = rng.uniform(15, 80, 3000)
    actual = np.where(rng.random(proj.size) < 0.25, 0.0, proj / 0.75 * rng.gamma(2.0, 0.5, proj.size))
    _add(db, "receiving_yards", proj, actual)
    corr = feedback.update_prop_corrections(db)
    assert corr["receiving_yards"]["factor"] == pytest.approx(1.0, abs=0.04)


def test_real_drift_is_corrected_and_bounded(db):
    rng = np.random.default_rng(4)
    proj = rng.uniform(25, 40, 2000)
    _add(db, "attempts", proj, 0.92 * proj + rng.normal(0, 5, proj.size))
    _add(db, "passing_yards", np.full(500, 200.0), np.full(500, 20.0))
    corr = feedback.update_prop_corrections(db)
    assert corr["attempts"]["factor"] == pytest.approx(0.92, abs=0.02)
    assert corr["passing_yards"]["factor"] == 0.85          # clipped: never trust a huge swing blindly
