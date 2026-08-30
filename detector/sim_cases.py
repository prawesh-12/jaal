"""Pick real scored clusters for the simulation on the site to replay.

The site animates a pipeline. Everything it shows about a cluster has to come
from a cluster that actually went through the pipeline, so this reads the
holdout feature table, scores it with the shipped model exactly as
`detector/explain.py` does, and writes a handful of cases per tier.

Both scenarios are real. A ring case is a cluster the answer key marks as a
ring. A lookalike case is a cluster of a family, flatmates, a hostel or an
office that shares the attributes a ring shares and is not one.

    python -m detector.sim_cases
"""

from __future__ import annotations

import argparse
import gzip
import json
import pickle

import joblib
import numpy as np
import pandas as pd

import config
from detector import decide
from detector.resources import announce, apply

TIERS = ("obvious", "moderate", "sophisticated", "adaptive")
BENIGN_KINDS = ("family", "flatmates", "hostel", "office")
PER_CASE = 4

# What the animation reads. Every one is a column the pipeline wrote.
SHAPE = ("size", "edge_density", "mean_edge_bits", "min_edge_bits",
         "weight_spread", "diameter", "degree_gini", "top_signal_share")
BEHAVIOUR = ("signup_span_days", "coupon_rate", "repeat_rate",
             "pincode_concentration", "distinct_device_ratio",
             "distinct_address_ratio", "distinct_bin_ratio", "total_discount")


def _case(row) -> dict:
    # Round first, then price. The site recomputes the costs from the purity it
    # is given, so the published purity has to be the one they were priced at.
    purity = round(float(row["predicted_purity"]), 4)
    size = int(row["size"])
    costs = decide.expected_costs(purity, size)
    return {
        "seed": int(row["seed"]),
        "tier": str(row["tier"]),
        "cluster_id": int(row["cluster_id"]),
        "is_ring": bool(row["label"]),
        "benign_kind": (None if row["label"]
                        else str(row.get("dominant_benign_kind") or "normal")),
        "probability": round(float(row["p"]), 4),
        "predicted_ring_purity": purity,
        "true_ring_purity": round(float(row["ring_purity"]), 4),
        "ring_members": int(row["n_ring_members"]),
        "innocent_members": int(row["n_innocent_members"]),
        "action": str(row["action"]),
        "strongest_signal": str(row["dominant_signal"]),
        "expected_cost_rupees": {k: int(round(float(v))) for k, v in costs.items()},
        "shape": {k: round(float(row[k]), 4) for k in SHAPE},
        "behaviour": {k: round(float(row[k]), 4) for k in BEHAVIOUR},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features", default="results/features_holdout.csv")
    ap.add_argument("--model", default="results/model.pkl")
    ap.add_argument("--out", default="results/sim_cases.json")
    ap.add_argument("--per-case", type=int, default=PER_CASE)
    args = ap.parse_args()

    announce(apply())

    with gzip.open(args.model, "rb") as f:
        fitted = pickle.load(f)

    # Only the columns this writes, so the frame stays well inside the budget.
    keep = ["seed", "tier", "cluster_id", "label", "ring_purity",
            "n_ring_members", "n_innocent_members", "dominant_signal",
            "dominant_benign_kind", *SHAPE, *BEHAVIOUR]
    columns = list(dict.fromkeys([*keep, *fitted["features"]]))
    table = pd.read_csv(args.features, usecols=columns)

    # A forest predicting over the whole holdout at once wants more address
    # space than the budget allows, so this goes through in slices on one
    # thread. Same numbers, a fraction of the peak.
    X = table[fitted["features"]]
    p, purity = [], []
    with joblib.parallel_backend("sequential"):
        for start in range(0, len(X), 5000):
            chunk = X.iloc[start:start + 5000]
            p.append(fitted["calibrator"].predict_proba(chunk)[:, 1])
            purity.append(np.clip(fitted["purity"].predict(chunk), 0.0, 1.0))

    table["p"] = np.concatenate(p)
    table["predicted_purity"] = np.concatenate(purity)
    table["action"] = decide.best_action(table["predicted_purity"].to_numpy(),
                                         table["size"].to_numpy())

    cases = {"ring": {}, "lookalike": {}}
    for tier in TIERS:
        at_tier = table[table["tier"] == tier]

        # Worst first by rupees extracted, which is the order the queue uses.
        rings = at_tier[at_tier["label"] == 1].nlargest(args.per_case,
                                                        "total_discount")
        cases["ring"][tier] = [_case(r) for _, r in rings.iterrows()]

        # A lookalike has to be a named benign group, not a stray pair of
        # strangers, or the contrast the page is drawing does not hold.
        benign = at_tier[(at_tier["label"] == 0)
                         & (at_tier["dominant_benign_kind"].isin(BENIGN_KINDS))]
        # One of each kind where the tier has one, biggest first: a bigger
        # group shares more and is the harder call.
        picked = []
        for kind in BENIGN_KINDS:
            of_kind = benign[benign["dominant_benign_kind"] == kind]
            if len(of_kind):
                picked.append(of_kind.nlargest(1, "size").iloc[0])
        cases["lookalike"][tier] = [_case(r) for r in picked]

    report = {
        "source": args.features,
        "model": args.model,
        "calibration": fitted["method"],
        "costs_rupees": {"blocked_innocent": config.COST_BLOCKED_INNOCENT,
                         "missed_abuser": config.COST_MISSED_ABUSER,
                         "analyst_review": config.COST_ANALYST_REVIEW},
        "n_clusters_scored": int(len(table)),
        "cases": cases,
    }
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")

    for scenario in ("ring", "lookalike"):
        for tier in TIERS:
            rows = cases[scenario][tier]
            actions = ", ".join(sorted({r["action"] for r in rows})) or "none"
            print(f"{scenario:10s} {tier:14s} {len(rows)} case(s), action: {actions}")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
