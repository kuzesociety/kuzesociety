"""Turn model probabilities + exact Hard Rock prices into PLAY / SMALLER / LEAN / PASS / UNKNOWN.

Rules (from the master prompt, made quantitative):
* Model prediction and betting value are separate: we only act on EV at the exact price.
* Every threshold comes from the model: "playable to" is the worst line/price where EV still
  clears the PLAY bar; "pass at" is where it drops under the LEAN bar.
* Uncertainty (QB status, questionable starters, weather, stale lines) downgrades the call.
* Stakes are fractional Kelly, scaled by confidence and capped.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Minimum expected value per unit staked. Defaults; the learning loop adjusts them from CLV /
# results per market (see kuze.learning.feedback).
DEFAULT_THRESHOLDS = {
    "spread": {"play": 0.030, "lean": 0.010},
    "total": {"play": 0.030, "lean": 0.010},
    "moneyline": {"play": 0.040, "lean": 0.015},
    "prop": {"play": 0.050, "lean": 0.020},
    "td": {"play": 0.080, "lean": 0.030},
    "sgp": {"play": 0.100, "lean": 0.040},
}
CONFIDENCE_ORDER = ["UNKNOWN", "LOW", "MEDIUM", "MEDIUM+", "HIGH"]
CONFIDENCE_STAKE = {"HIGH": 1.0, "MEDIUM+": 0.8, "MEDIUM": 0.6, "LOW": 0.3, "UNKNOWN": 0.0}


@dataclass
class Flag:
    code: str
    text: str
    severity: int            # 1 = minor, 2 = meaningful, 3 = critical
    markets: tuple = ("spread", "moneyline", "total")
    swing: float = 0.0       # how many points the fair line could move if it resolves badly

    def as_dict(self):
        return {"code": self.code, "text": self.text, "severity": self.severity, "markets": list(self.markets),
                "swing": round(self.swing, 2)}


@dataclass
class Confidence:
    level: str
    flags: list[Flag] = field(default_factory=list)

    def as_dict(self):
        return {"level": self.level, "flags": [f.as_dict() for f in self.flags]}


def data_confidence(flags: list[Flag], market: str) -> str:
    """HIGH: nothing meaningful open. MEDIUM: one meaningful uncertainty. LOW: several. UNKNOWN: critical."""
    rel = [f for f in flags if market in f.markets]
    if any(f.severity >= 3 for f in rel):
        return "UNKNOWN"
    meaningful = sum(1 for f in rel if f.severity == 2)
    minor = sum(1 for f in rel if f.severity == 1)
    if meaningful >= 2:
        return "LOW"
    if meaningful == 1:
        return "MEDIUM"
    if minor >= 2:
        return "MEDIUM+"
    return "HIGH"


def label_bet(ev: float, market_kind: str, confidence: str, edge_vs_swing: float | None = None,
              thresholds: dict | None = None) -> str:
    th = (thresholds or DEFAULT_THRESHOLDS)[market_kind]
    if confidence == "UNKNOWN":
        return "UNKNOWN" if ev >= th["lean"] else "PASS"
    if ev < th["lean"]:
        return "PASS"
    if ev < th["play"]:
        return "LEAN"
    # EV clears the PLAY bar: downgrade for uncertainty
    if edge_vs_swing is not None and edge_vs_swing < 1.0:
        return "LEAN"          # an unresolved injury/QB swing could erase the whole edge
    if confidence == "LOW":
        return "LEAN"
    if confidence == "MEDIUM":
        return "SMALLER"
    if ev < 1.5 * th["play"] and confidence != "HIGH":
        return "SMALLER"
    return "PLAY"


def stake(kelly_full: float, label: str, confidence: str, bankroll: float, kelly_mult: float = 0.25,
          max_pct: float = 0.02, unit_pct: float = 0.01) -> dict:
    if label not in ("PLAY", "SMALLER"):
        return {"pct": 0.0, "amount": 0.0, "units": 0.0}
    pct = kelly_full * kelly_mult * CONFIDENCE_STAKE.get(confidence, 0.0)
    if label == "SMALLER":
        pct *= 0.5
    pct = min(pct, max_pct)
    return {"pct": round(pct, 4), "amount": round(pct * bankroll, 2), "units": round(pct / unit_pct, 2)}
