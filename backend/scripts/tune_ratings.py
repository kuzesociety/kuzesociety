"""Grid-search rating hyper-parameters (half-life, off-season gap, ridge strength) per metric.

Objective: walk-forward weighted MSE of predicting the NEXT game's value of the metric
(2009-2025). Run: python -m scripts.tune_ratings
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from kuze.config import settings
from kuze.features import ratings as R


def main(metrics: list[str] | None = None):
    tg = pd.read_parquet(settings.cache_dir / "team_games.parquet")
    data = R.RatingData(tg)
    best = {}
    for name, spec in R.METRICS.items():
        if metrics and name not in metrics:
            continue
        lams = [spec.lam * f for f in (0.5, 1, 2)]
        res = R.tune_metric(data, spec, range(2009, 2026), [12, 16, 24, 32, 48], [3, 6, 12, 20, 32, 48], lams)
        top = res.iloc[0]
        best[name] = {k: float(top[k]) for k in ("half_life", "gap", "lam", "mse", "r2_vs_mean")}
        print(name, best[name], flush=True)
    out = settings.data_dir / "tuned_ratings.json"
    out.write_text(json.dumps(best, indent=2))
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1:] or None)
