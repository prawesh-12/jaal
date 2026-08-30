"""Train a cluster classifier, then make its scores mean what they say.

A random forest's 0.80 does not mean 80%. Averaging many trees makes errors near
the boundaries one sided and squeezes probabilities toward the middle. The
decision stage works out expected cost in rupees straight from p, so the
probabilities have to be right.

    python -m detector.model --train results/features_train.csv \
                             --val results/features_val.csv
"""

from __future__ import annotations

import argparse
import gzip
import json
import pickle

import matplotlib
matplotlib.use("Agg")               # no display, so write plots to file
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.frozen import FrozenEstimator
from sklearn.inspection import permutation_importance
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             precision_recall_curve, roc_auc_score)
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import config
from detector.features import FEATURE_NAMES
from detector.resources import announce, apply

RANDOM_STATE = 42
CALIBRATION_FRACTION = 0.25     # share of training seeds held back to calibrate

# discount_per_account is coupon_rate times Rs.200, correlation exactly 1.0000.
DROPPED_FEATURES = ("discount_per_account",)
MODEL_FEATURES = tuple(f for f in FEATURE_NAMES if f not in DROPPED_FEATURES)


def split_by_seed(table: pd.DataFrame, fraction: float = CALIBRATION_FRACTION
                  ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Hold back whole worlds to calibrate on, never individual rows.

    Clusters from one world share generator artefacts, so a random row split
    leaks them across the boundary and silently inflates every score.
    """
    seeds = np.sort(table["seed"].unique())
    cut = int(len(seeds) * (1 - fraction))
    fit_seeds = set(seeds[:cut])
    return (table[table["seed"].isin(fit_seeds)],
            table[~table["seed"].isin(fit_seeds)])


def make_forest(n_jobs: int) -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=300, min_samples_leaf=5, class_weight="balanced",
        random_state=RANDOM_STATE, n_jobs=n_jobs)


def make_purity_model(n_jobs: int) -> RandomForestRegressor:
    """Predicts what fraction of a cluster's accounts are really ring accounts.

    The cost model needs purity, not "is this cluster majority ring". Using the
    class probability lost Rs.16.4 million where purity gains Rs.1.3 million.
    """
    return RandomForestRegressor(
        n_estimators=300, min_samples_leaf=5,
        random_state=RANDOM_STATE, n_jobs=n_jobs)


def make_mlp() -> object:
    """A small network on the same features, used to compare against the forest."""
    return make_pipeline(
        StandardScaler(),
        MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=400,
                      early_stopping=True, random_state=RANDOM_STATE))


def evaluate(y: np.ndarray, p: np.ndarray) -> dict:
    """PR-AUC as the headline, with the prevalence it must be read against.

    At this prevalence ROC-AUC can read 0.97 while precision is unusable, so it
    is reported alongside rather than on its own.
    """
    prevalence = float(y.mean())
    pr_auc = float(average_precision_score(y, p)) if y.sum() else 0.0
    return {
        "n": int(len(y)),
        "positives": int(y.sum()),
        "prevalence": round(prevalence, 5),
        "pr_auc": round(pr_auc, 5),
        "pr_auc_baseline": round(prevalence, 5),
        "lift_over_baseline": round(pr_auc / prevalence, 2) if prevalence else 0.0,
        "roc_auc": round(float(roc_auc_score(y, p)), 5) if 0 < y.sum() < len(y) else 0.0,
        "brier": round(float(brier_score_loss(y, p)), 5),
    }


def per_tier(table: pd.DataFrame, p: np.ndarray) -> dict:
    y = table["label"].to_numpy()
    out = {"all_tiers_pooled": evaluate(y, p)}
    for tier in config.TIER_NAMES:
        mask = (table["tier"] == tier).to_numpy()
        if mask.sum():
            out[tier] = evaluate(y[mask], p[mask])
    return out


def train_and_calibrate(train: pd.DataFrame, val: pd.DataFrame,
                        n_jobs: int, features=MODEL_FEATURES) -> dict:
    fit_part, cal_part = split_by_seed(train)
    Xf, yf = fit_part[list(features)], fit_part["label"].to_numpy()
    Xc, yc = cal_part[list(features)], cal_part["label"].to_numpy()
    Xv, yv = val[list(features)], val["label"].to_numpy()

    print(f"  fit on {len(Xf):,} clusters from {fit_part['seed'].nunique()} "
          f"worlds, calibrate on {len(Xc):,} from {cal_part['seed'].nunique()}")

    forest = make_forest(n_jobs).fit(Xf, yf)
    raw = forest.predict_proba(Xv)[:, 1]

    # FrozenEstimator keeps the forest as fitted. It replaces the old cv="prefit".
    calibrators = {}
    models = {"forest_raw": raw}
    for method in ("sigmoid", "isotonic"):
        cal = CalibratedClassifierCV(FrozenEstimator(forest), method=method)
        cal.fit(Xc, yc)
        calibrators[method] = cal
        models[f"forest_{method}"] = cal.predict_proba(Xv)[:, 1]

    mlp = make_mlp().fit(Xf, yf)
    models["mlp_raw"] = mlp.predict_proba(Xv)[:, 1]

    purity = make_purity_model(n_jobs).fit(Xf, fit_part["ring_purity"])

    return {"models": models, "forest": forest, "purity": purity, "y_val": yv,
            "calibrators": calibrators,
            "fit_seeds": sorted(fit_part["seed"].unique().tolist()),
            "cal_seeds": sorted(cal_part["seed"].unique().tolist())}


def plot_pr_curves(val: pd.DataFrame, p: np.ndarray, path: str) -> None:
    fig, ax = plt.subplots(figsize=(7, 5))
    y = val["label"].to_numpy()
    for tier in config.TIER_NAMES:
        m = (val["tier"] == tier).to_numpy()
        if not m.sum() or not y[m].sum():
            continue
        prec, rec, _ = precision_recall_curve(y[m], p[m])
        ap = average_precision_score(y[m], p[m])
        ax.plot(rec, prec, label=f"{tier} (PR-AUC {ap:.3f})")
    ax.axhline(y.mean(), ls="--", c="grey",
               label=f"random guess ({y.mean():.4f})")
    ax.set_xlabel("recall")
    ax.set_ylabel("precision")
    ax.set_title("Precision-recall by adversary tier, cluster level\n"
                 f"validation seeds, prevalence {y.mean():.2%}")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_reliability(y: np.ndarray, curves: dict, path: str) -> None:
    """Predicted probability against observed frequency, in ten equal bins.

    Uniform bins, not quantile. At 2.3% prevalence a quantile split crams nine
    bins of ten into [0, 0.001] and hides the region we care about.
    """
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(6.5, 7.5),
                                  gridspec_kw={"height_ratios": [3, 1]},
                                  sharex=True)
    ax.plot([0, 1], [0, 1], ls="--", c="grey", label="perfect calibration")
    edges = np.linspace(0, 1, 11)
    colours = ("tab:blue", "tab:orange", "tab:green")
    for (label, p), colour in zip(curves.items(), colours):
        true, pred = calibration_curve(y, p, n_bins=10, strategy="uniform")
        ax.plot(pred, true, "o-", color=colour,
                label=f"{label} (Brier {brier_score_loss(y, p):.5f})")
        counts = np.histogram(p, bins=edges)[0]
        ax2.step(edges[:-1], np.maximum(counts, 0.1), where="post",
                 color=colour, label=label)

    ax.set_ylabel("observed frequency")
    ax.set_title("Reliability diagram, cluster level\n"
                 "does 0.80 actually mean 80%?")
    ax.legend(fontsize=9, loc="upper left")
    ax.grid(alpha=0.3)
    ax2.set_yscale("log")
    ax2.set_xlabel("predicted probability")
    ax2.set_ylabel("clusters (log)")
    ax2.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--train", default="results/features_train.csv")
    p.add_argument("--val", default="results/features_val.csv")
    p.add_argument("--out", default="results/model.json")
    p.add_argument("--model-out", default="results/model.pkl")
    args = p.parse_args()

    b = apply()
    announce(b)
    n_jobs = b["workers"]

    train = pd.read_csv(args.train)
    val = pd.read_csv(args.val)
    assert not set(train["seed"]) & set(val["seed"]), "train and val share a seed"

    print(f"\ntraining on {len(train):,} clusters, validating on {len(val):,}")
    fitted = train_and_calibrate(train, val, n_jobs)
    y = fitted["y_val"]

    report = {
        "features": list(MODEL_FEATURES),
        "dropped_features": list(DROPPED_FEATURES),
        "n_features": len(MODEL_FEATURES),
        "n_train_clusters": len(train),
        "n_val_clusters": len(val),
        "fit_seeds": [min(fitted["fit_seeds"]), max(fitted["fit_seeds"])],
        "cal_seeds": [min(fitted["cal_seeds"]), max(fitted["cal_seeds"])],
        "val_seeds": [int(val["seed"].min()), int(val["seed"].max())],
        "variants": {},
    }
    for name, p_hat in fitted["models"].items():
        report["variants"][name] = per_tier(val, p_hat)

    print(f"\n{'variant':<18} {'PR-AUC':<9} {'baseline':<10} {'lift':<8} "
          f"{'Brier':<9} {'ROC-AUC'}")
    print("-" * 65)
    for name, r in report["variants"].items():
        a = r["all_tiers_pooled"]
        print(f"{name:<18} {a['pr_auc']:<9.4f} {a['pr_auc_baseline']:<10.4f} "
              f"{a['lift_over_baseline']:<8.1f} {a['brier']:<9.5f} "
              f"{a['roc_auc']:.4f}")

    sig = report["variants"]["forest_sigmoid"]["all_tiers_pooled"]["brier"]
    iso = report["variants"]["forest_isotonic"]["all_tiers_pooled"]["brier"]
    # Both calibrators are saved, and the decision stage picks on cost.
    chosen = "sigmoid" if sig <= iso else "isotonic"
    report["calibration_method"] = chosen
    report["brier_sigmoid"] = sig
    report["brier_isotonic"] = iso
    report["brier_raw"] = report["variants"]["forest_raw"]["all_tiers_pooled"]["brier"]
    print(f"\ncalibration: Platt {sig:.5f} against isotonic {iso:.5f}, "
          f"choosing {chosen}")

    print(f"\nper tier, {chosen} calibrated forest")
    print(f"{'tier':<15} {'clusters':<10} {'positives':<11} {'prevalence':<12} "
          f"{'PR-AUC':<9} {'lift':<8} {'Brier'}")
    best = report["variants"][f"forest_{chosen}"]
    for tier in config.TIER_NAMES:
        r = best[tier]
        print(f"{tier:<15} {r['n']:<10,} {r['positives']:<11} "
              f"{r['prevalence']:<12.5f} {r['pr_auc']:<9.4f} "
              f"{r['lift_over_baseline']:<8.1f} {r['brier']:.5f}")

    # How well the purity model does, since the decision rule leans on it.
    purity_hat = fitted["purity"].predict(val[list(MODEL_FEATURES)])
    purity_true = val["ring_purity"].to_numpy()
    report["purity_model"] = {
        "mae": round(float(np.abs(purity_hat - purity_true).mean()), 5),
        "mae_on_ring_clusters": round(float(
            np.abs(purity_hat - purity_true)[y == 1].mean()), 5),
        "mean_predicted": round(float(purity_hat.mean()), 5),
        "mean_actual": round(float(purity_true.mean()), 5),
    }
    print(f"\npurity model: mean absolute error {report['purity_model']['mae']:.5f} "
          f"overall, {report['purity_model']['mae_on_ring_clusters']:.5f} on "
          f"ring clusters")

    p_best = fitted["models"][f"forest_{chosen}"]
    plot_pr_curves(val, p_best, "results/pr_curve.png")
    plot_reliability(y, {"raw forest": fitted["models"]["forest_raw"],
                         "Platt (sigmoid)": fitted["models"]["forest_sigmoid"],
                         "isotonic": fitted["models"]["forest_isotonic"]},
                     "results/reliability.png")

    # Which features matter, measured by shuffling each one on the validation set.
    print("\npermutation importance, top 15")
    imp = permutation_importance(
        fitted["forest"], val[list(MODEL_FEATURES)], y, n_repeats=3,
        random_state=RANDOM_STATE, n_jobs=n_jobs,
        scoring="average_precision")
    order = np.argsort(-imp.importances_mean)
    report["permutation_importance"] = {
        MODEL_FEATURES[i]: round(float(imp.importances_mean[i]), 5)
        for i in order}
    for i in order[:15]:
        print(f"  {MODEL_FEATURES[i]:<24} {imp.importances_mean[i]:>8.5f}")

    # gzip because an uncompressed forest pair is 16 MB and this file is committed.
    with gzip.open(args.model_out, "wb") as f:
        pickle.dump({"forest": fitted["forest"],
                     "purity": fitted["purity"],
                     "calibrator": fitted["calibrators"][chosen],
                     "calibrators": fitted["calibrators"],
                     "features": list(MODEL_FEATURES),
                     "method": chosen}, f)
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out}, {args.model_out}, "
          f"results/pr_curve.png, results/reliability.png")


if __name__ == "__main__":
    main()
