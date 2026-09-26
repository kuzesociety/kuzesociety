"""Walk-forward backtest of the prop projection model. python -m scripts.backtest_props"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from kuze.config import settings
from kuze.data import nflverse as nv
from kuze.props import model as PM


def load_assembled() -> pd.DataFrame:
    out = settings.data_dir / "derived"
    pf = pd.read_parquet(out / "props_features.parquet")
    tf = pd.read_parquet(out / "props_team_features.parquet")
    dv = pd.read_parquet(out / "props_dv.parquet")
    dq = pd.read_parquet(out / "props_dq.parquet")
    games = nv.load_schedules()
    from kuze.features.pbp_prep import normalize_team
    for c in ("home_team", "away_team"):
        games[c] = normalize_team(games[c])
    gf_path = out / "game_features.parquet"
    gf = pd.read_parquet(gf_path) if gf_path.exists() else None
    return PM.assemble(pf, tf, dv, dq, games, gf)


def main():
    d = load_assembled()
    d = d[d["season"] >= 2017]
    oos = PM.walk_forward(d, range(2019, 2026))
    report = {}
    for stat, o in oos.items():
        o = o.dropna(subset=["proj", "actual"])
        mae = lambda c: float((o[c] - o["actual"]).abs().mean())
        # distribution calibration: fit ratio dists on 2019-2023, test on 2024-2025
        tr, te = o[o.season <= 2023], o[o.season >= 2024]
        dists = {pos: PM.RatioDistribution.fit(g["proj"].to_numpy(), g["actual"].to_numpy()) for pos, g in tr.groupby("position")}
        samp = [dists[pos].samples(p) for pos, p in zip(te.position, te.proj)]
        pit = np.array([(s < a).mean() + 0.5 * (s == a).mean() for s, a in zip(samp, te.actual)])
        med_hit = np.mean([a > np.median(s) for s, a in zip(samp, te.actual)])
        cover80 = np.mean([(np.quantile(s, 0.1) <= a <= np.quantile(s, 0.9)) for s, a in zip(samp, te.actual)])
        report[stat] = {"n": len(o), "mae_model": mae("proj"), "mae_struct": mae("struct"), "mae_naive": mae("naive"),
                        "pit_mean": float(pit.mean()), "pit_sd": float(pit.std()), "over_median_rate": float(med_hit),
                        "coverage_80": float(cover80)}
        print(stat, {k: round(v, 3) if isinstance(v, float) else v for k, v in report[stat].items()}, flush=True)
    for stat, o in oos.items():
        o.to_parquet(settings.data_dir / "derived" / f"props_oos_{stat}.parquet")
    (settings.data_dir / "props_backtest.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
