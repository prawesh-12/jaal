"""What the shipped model actually is, read out of the shipped model.

results/model.json says how well the model scores. This says what it is: how
many trees, how deep they grew, how many decision nodes they hold, and what
the calibrator on the end of them does. Every number is read from
results/model.pkl, so it describes the artifact that runs, not the settings it
was asked for.

    python -m detector.model_card
"""

from __future__ import annotations

import argparse
import gzip
import json
import pickle

import numpy as np


def trees(estimator) -> dict:
    """One forest, tree by tree, with the totals a reader would have to add up."""
    depth = [int(t.tree_.max_depth) for t in estimator.estimators_]
    leaves = [int(t.tree_.n_leaves) for t in estimator.estimators_]
    nodes = [int(t.tree_.node_count) for t in estimator.estimators_]
    return {
        "kind": type(estimator).__name__,
        "n_trees": len(depth),
        "min_samples_leaf": int(estimator.min_samples_leaf),
        "depth_min": min(depth),
        "depth_mean": round(float(np.mean(depth)), 2),
        "depth_max": max(depth),
        "leaves": sum(leaves),
        # One learned threshold each: the count behind "how many parameters".
        "decision_nodes": sum(nodes) - sum(leaves),
        "tree_depth": depth,
        "tree_leaves": leaves,
    }


def isotonic(calibrator) -> dict:
    """The step function the score is passed through. Its breakpoints are the
    whole model, so they are written out rather than described.
    """
    fitted = calibrator.calibrated_classifiers_[0].calibrators[0]
    x = [round(float(v), 5) for v in fitted.X_thresholds_]
    y = [round(float(v), 5) for v in fitted.y_thresholds_]
    return {
        "kind": type(fitted).__name__,
        "method": calibrator.method,
        "n_points": len(x),
        "score": x,
        "probability": y,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", default="results/model.pkl")
    p.add_argument("--report", default="results/model.json")
    p.add_argument("--out", default="results/model_card.json")
    args = p.parse_args()

    with gzip.open(args.model, "rb") as f:
        shipped = pickle.load(f)
    with open(args.report) as f:
        report = json.load(f)

    forest = shipped["forest"]
    card = {
        "features": list(shipped["features"]),
        "classifier": trees(forest),
        "purity": trees(shipped["purity"]),
        "calibrator": isotonic(shipped["calibrator"]),
        # Impurity is the forest's own bookkeeping. Permutation is measured on
        # validation data and is the one to trust when they disagree.
        "importance": [
            {"feature": name,
             "impurity": round(float(gain), 5),
             "permutation": report["permutation_importance"][name]}
            for name, gain in zip(shipped["features"], forest.feature_importances_)
        ],
    }
    card["classifier"]["class_weight"] = str(forest.class_weight)

    with open(args.out, "w") as f:
        json.dump(card, f, indent=1)
        f.write("\n")

    c = card["classifier"]
    print(f"{c['kind']}, {c['n_trees']} trees, depth {c['depth_min']} to "
          f"{c['depth_max']}, {c['decision_nodes']:,} decision nodes")
    print(f"{card['calibrator']['method']} calibration, "
          f"{card['calibrator']['n_points']} breakpoints")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
