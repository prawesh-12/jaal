"""Model and calibration. The split and the probabilities are what get checked."""

import gzip
import json
import pickle

import pandas as pd
import pytest

import config
from detector import model


@pytest.fixture(scope="module")
def report():
    with open("results/model.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def fitted():
    with gzip.open("results/model.pkl", "rb") as f:
        return pickle.load(f)


def test_split_by_seed_never_shares_a_world():
    """Clusters from one world must not land in both the fit and the
    calibration set."""
    table = pd.DataFrame({"seed": [0, 0, 1, 1, 2, 2, 3, 3],
                          "label": [0, 1, 0, 1, 0, 1, 0, 1]})
    fit, cal = model.split_by_seed(table, fraction=0.5)
    assert not set(fit["seed"]) & set(cal["seed"])
    assert len(fit) + len(cal) == len(table)


def test_train_and_validation_seeds_are_disjoint(report):
    fit_lo, fit_hi = report["fit_seeds"]
    cal_lo, cal_hi = report["cal_seeds"]
    val_lo, val_hi = report["val_seeds"]
    assert fit_hi < cal_lo
    assert cal_hi < val_lo


def test_nothing_touched_the_sealed_holdout(report):
    for key in ("fit_seeds", "cal_seeds", "val_seeds"):
        assert max(report[key]) < min(config.HOLDOUT_SEEDS), key


def test_pr_auc_is_reported_against_its_prevalence_baseline(report):
    for variant in report["variants"].values():
        for r in variant.values():
            assert r["pr_auc_baseline"] == r["prevalence"]
            assert r["lift_over_baseline"] > 1


def test_calibration_improves_the_brier_score(report):
    assert report["brier_sigmoid"] < report["brier_raw"]
    assert report["brier_isotonic"] < report["brier_raw"]


def test_the_raw_forest_is_underconfident(report):
    """The raw forest is underconfident, which is why calibration is applied."""
    assert report["brier_raw"] > min(report["brier_sigmoid"],
                                     report["brier_isotonic"])


def test_detection_degrades_with_sophistication(report):
    """PR-AUC has to fall as the operator gets more careful."""
    best = report["variants"][f"forest_{report['calibration_method']}"]
    aucs = [best[t]["pr_auc"] for t in config.TIER_NAMES]
    assert aucs == sorted(aucs, reverse=True), aucs
    assert best["adaptive"]["pr_auc"] < best["obvious"]["pr_auc"]


def test_the_model_beats_a_random_guesser_on_every_tier(report):
    best = report["variants"][f"forest_{report['calibration_method']}"]
    for tier in config.TIER_NAMES:
        assert best[tier]["lift_over_baseline"] > 10, tier


def test_the_dropped_feature_was_an_exact_duplicate(report):
    assert "discount_per_account" in report["dropped_features"]
    assert "discount_per_account" not in report["features"]


def test_saved_model_produces_probabilities(fitted, val_table_path):
    val = pd.read_csv(val_table_path).head(500)
    p = fitted["calibrator"].predict_proba(val[fitted["features"]])[:, 1]
    assert ((p >= 0) & (p <= 1)).all()
    assert len(fitted["calibrators"]) == 2
