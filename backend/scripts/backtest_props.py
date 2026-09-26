"""Walk-forward backtest of the prop projection model. python -m scripts.backtest_props"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from kuze.config import settings
from kuze.data import nflverse as nv
from kuze.props import model as PM


def load_assembled() -> pd.DataFrame:
    """Historical player-game rows with features exactly as the live engine builds them."""
    from kuze.features.pbp_prep import normalize_team
    from kuze.props import features as F
    from kuze.props.engine import FIRST_SEASON, engine
    ds = engine._datasets(nv.current_season())
    pg, tg = ds["player_games"], ds["team_games"]
    pf = F.player_features(pg[pg["season"] >= FIRST_SEASON])
    tf = F.team_features(tg)
    dv, dq = F.defense_vs_position(pg)
    games = nv.load_schedules()
    for c in ("home_team", "away_team"):
        games[c] = normalize_team(games[c])
    gf_path = settings.data_dir / "derived" / "game_features.parquet"
    gf = pd.read_parquet(gf_path) if gf_path.exists() else None
    return PM.assemble(pf, tf, dv, dq, games, gf)


def nested_recal(o: pd.DataFrame) -> pd.Series:
    """Recalibrated projection where the shrink applied to season S is fitted on seasons < S only."""
    out = o["proj"].astype(float).copy()
    for s in sorted(o["season"].unique()):
        tr = o[o["season"] < s]
        if len(tr) < 300:
            continue
        ab = PM.fit_recal(tr["proj"].to_numpy(float), tr["actual"].to_numpy(float), tr["season"].to_numpy())
        sel = o["season"] == s
        out[sel] = PM.apply_recal(o.loc[sel, "proj"].to_numpy(float), ab)
    return out


def main(reuse: bool = False):
    derived = settings.data_dir / "derived"
    if reuse:   # re-score saved walk-forward projections without retraining
        oos = {stat: pd.read_parquet(derived / f"props_oos_{stat}.parquet") for stat in PM.STATS
               if (derived / f"props_oos_{stat}.parquet").exists()}
    else:
        d = load_assembled()
        d = d[d["season"] >= 2017]
        oos = PM.walk_forward(d, range(2019, 2026))
        for stat, o in oos.items():   # raw projections: the production model fits its recalibration on these
            o.to_parquet(derived / f"props_oos_{stat}.parquet")
    report = {}
    for stat, o in oos.items():
        o = o.dropna(subset=["proj", "actual"]).copy()
        o["model"] = nested_recal(o) if stat in PM.RECAL_STATS else o["proj"]
        mae = lambda c: float((o[c] - o["actual"]).abs().mean())
        # distribution calibration: fit ratio dists on 2019-2023, test on 2024-2025
        tr, te = o[o.season <= 2023], o[o.season >= 2024]
        dists = {pos: PM.RatioDistribution.fit(g["model"].to_numpy(), g["actual"].to_numpy()) for pos, g in tr.groupby("position")}
        samp = [dists[pos].samples(p) for pos, p in zip(te.position, te.model)]
        pit = np.array([(s < a).mean() + 0.5 * (s == a).mean() for s, a in zip(samp, te.actual)])
        med_hit = np.mean([a > np.median(s) for s, a in zip(samp, te.actual)])
        cover80 = np.mean([(np.quantile(s, 0.1) <= a <= np.quantile(s, 0.9)) for s, a in zip(samp, te.actual)])
        # calibration of the extremes: mean actual vs projection in the top and bottom deciles
        q = pd.qcut(o["model"], 10, labels=False, duplicates="drop")
        lo, hi = o[q == q.min()], o[q == q.max()]
        report[stat] = {"n": len(o), "mae_model": mae("model"), "mae_raw": mae("proj"), "mae_struct": mae("struct"),
                        "mae_naive": mae("naive"), "pit_mean": float(pit.mean()), "pit_sd": float(pit.std()),
                        "over_median_rate": float(med_hit), "coverage_80": float(cover80),
                        "bottom_decile": [float(lo["model"].mean()), float(lo["actual"].mean())],
                        "top_decile": [float(hi["model"].mean()), float(hi["actual"].mean())]}
        print(stat, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in report[stat].items()}, flush=True)
    (settings.data_dir / "props_backtest.json").write_text(json.dumps(report, indent=2))
    if not reuse:   # refresh the snapshot shipped with the code (used by fresh installs)
        PM.FITTED.mkdir(exist_ok=True)
        (PM.FITTED / "props_backtest.json").write_text(json.dumps(report, indent=2))
        snap = pd.concat([o[["season", "position", "proj", "actual"]].assign(stat=stat) for stat, o in oos.items()],
                         ignore_index=True)
        snap["season"] = snap["season"].astype("int16")
        snap[["proj", "actual"]] = snap[["proj", "actual"]].astype("float32")
        snap.to_parquet(PM.OOS_SNAPSHOT, index=False)


if __name__ == "__main__":
    import sys
    main(reuse="--reuse" in sys.argv)
