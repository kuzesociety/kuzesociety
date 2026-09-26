"""Walk-forward backtest of the anytime-TD model (with / without QB-trust and contract features)."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss

from kuze.config import settings
from kuze.data import nflverse as nv
from kuze.features.pbp_prep import normalize_team
from kuze.props import model as PM
from kuze.props import td as TD
from scripts.backtest_props import load_assembled


def main():
    d = load_assembled()
    d = d[(d["season"] >= 2017) & d["position"].isin(["RB", "WR", "TE", "QB"])]
    d = d[(d["offense_pct"].fillna(0) > 0) | (d["tgt"] + d["designed"] + d["attempts"] > 0)]
    games = nv.load_schedules()
    for c in ("home_team", "away_team"):
        games[c] = normalize_team(games[c])
    qr = pd.read_parquet(settings.data_dir / "derived" / "props_qb_receiver.parquet")
    trust = TD.qb_trust_features(d, qr, TD.expected_starters(games))
    d = d.merge(trust, on=["game_id", "player_id"], how="left")
    for c in [c for c in trust.columns if c.startswith(("trust", "c_"))]:
        d[c] = d[c].fillna(0.0)
    d = d[~((d["position"] == "QB") & ~d["is_starting_qb"])]
    cf = TD.contract_features(nv.load("contracts", columns=["gsis_id", "year_signed", "years", "apy_cap_pct", "draft_overall"]),
                              range(2016, 2027))
    d = d.merge(cf, on=["player_id", "season"], how="left")
    d["apy_cap_pct"] = d["apy_cap_pct"].fillna(0.004)
    d["draft_overall"] = d["draft_overall"].fillna(300)
    # team TD expectations from the volume model (walk-forward inside the loop)
    res = {}
    preds = []
    for s in range(2019, 2026):
        tr, te = d[d["season"] < s].copy(), d[d["season"] == s].copy()
        tv = PM.TeamVolumeModel().fit(PM.team_rows(tr).dropna(subset=["team_targets"]))
        tr = pd.concat([tr.reset_index(drop=True), tv.predict(tr.reset_index(drop=True))], axis=1)
        te = pd.concat([te.reset_index(drop=True), tv.predict(te.reset_index(drop=True))], axis=1)
        for dd in (tr, te):
            dd["pos_code"] = dd["position"].map(PM.POS_CODE).fillna(2)
        full = TD.TDModel().fit(tr)
        no_trust = TD.TDModel(); no_trust.features = [f for f in TD.TD_FEATURES if not f.startswith("trust")]; no_trust.fit(tr)
        te["p_full"] = full.predict(te)
        withc = TD.TDModel(); withc.features = TD.TD_FEATURES + ["apy_cap_pct", "draft_overall"]; withc.fit(tr)
        te["p_contract"] = withc.predict(te)
        te["p_notrust"] = no_trust.predict(te)
        te["p_struct"] = TD.structural_td_prob(te)
        te["p_naive"] = (te["receiving_tds_ew"].fillna(0) + te["rushing_tds_ew"].fillna(0)).clip(0, 0.95)
        preds.append(te[["season", "game_id", "player_id", "name", "position", "any_td", "p_full", "p_contract", "p_notrust", "p_struct", "p_naive"]])
    p = pd.concat(preds)
    for col in ("p_full", "p_contract", "p_notrust", "p_struct", "p_naive"):
        pc = p[col].clip(0.005, 0.95)
        res[col] = {"logloss": float(log_loss(p["any_td"], pc)), "brier": float(brier_score_loss(p["any_td"], pc))}
        print(col, {k: round(v, 5) for k, v in res[col].items()})
    bins = pd.cut(p["p_full"], [0, .05, .1, .15, .2, .25, .3, .4, .5, 1])
    cal = p.groupby(bins, observed=True).agg(n=("any_td", "size"), pred=("p_full", "mean"), actual=("any_td", "mean"))
    print(cal.round(3))
    p.to_parquet(settings.data_dir / "derived" / "td_oos.parquet")
    (settings.data_dir / "td_backtest.json").write_text(json.dumps({"scores": res, "calibration": cal.reset_index().astype(str).to_dict("records")}, indent=2))


if __name__ == "__main__":
    main()
