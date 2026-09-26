from kuze.analysis.recommend import DEFAULT_THRESHOLDS, Flag, data_confidence, label_bet, stake


def test_labels_follow_the_thresholds():
    th = DEFAULT_THRESHOLDS["spread"]
    assert label_bet(th["lean"] - 0.001, "spread", "HIGH") == "PASS"
    assert label_bet(th["lean"] + 0.001, "spread", "HIGH") == "LEAN"
    assert label_bet(th["play"] * 2, "spread", "HIGH") == "PLAY"


def test_uncertainty_downgrades_the_call():
    ev = DEFAULT_THRESHOLDS["spread"]["play"] * 2
    assert label_bet(ev, "spread", "MEDIUM") == "SMALLER"
    assert label_bet(ev, "spread", "LOW") == "LEAN"
    assert label_bet(ev, "spread", "UNKNOWN") == "UNKNOWN"             # e.g. QB status unknown
    assert label_bet(ev, "spread", "HIGH", edge_vs_swing=0.6) == "LEAN"   # an injury swing could erase it


def test_confidence_levels():
    minor = Flag("WX", "wind", 1)
    meaningful = Flag("Q", "questionable WR1", 2)
    critical = Flag("QB_OUT", "QB unknown", 3)
    assert data_confidence([], "spread") == "HIGH"
    assert data_confidence([minor, minor], "spread") == "MEDIUM+"
    assert data_confidence([meaningful], "spread") == "MEDIUM"
    assert data_confidence([meaningful, meaningful], "spread") == "LOW"
    assert data_confidence([critical], "spread") == "UNKNOWN"
    assert data_confidence([Flag("WX", "wind", 3, markets=("total",))], "spread") == "HIGH"


def test_stakes():
    assert stake(0.10, "PASS", "HIGH", 1000)["amount"] == 0
    full = stake(0.04, "PLAY", "HIGH", 1000, kelly_mult=0.25, max_pct=0.05)
    half = stake(0.04, "SMALLER", "HIGH", 1000, kelly_mult=0.25, max_pct=0.05)
    assert full["pct"] == 0.01 and half["pct"] == 0.005
    assert stake(0.50, "PLAY", "HIGH", 1000, max_pct=0.02)["amount"] == 20.0   # capped
