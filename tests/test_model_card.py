"""The model card has to describe the model that shipped, not a stale copy."""

import gzip
import json
import pickle

import pytest

from detector import model_card


@pytest.fixture(scope="module")
def card():
    with open("results/model_card.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def shipped():
    with gzip.open("results/model.pkl", "rb") as f:
        return pickle.load(f)


def test_the_card_counts_the_trees_the_pickle_holds(card, shipped):
    assert card["classifier"] == {**model_card.trees(shipped["forest"]),
                                  "class_weight": str(shipped["forest"].class_weight)}
    assert card["purity"] == model_card.trees(shipped["purity"])


def test_decision_nodes_are_internal_nodes_only(card, shipped):
    total = sum(t.tree_.node_count for t in shipped["forest"].estimators_)
    assert card["classifier"]["decision_nodes"] == total - card["classifier"]["leaves"]


def test_the_calibrator_is_the_one_the_pipeline_uses(card, shipped):
    assert card["calibrator"]["method"] == shipped["method"]
    steps = shipped["calibrator"].calibrated_classifiers_[0].calibrators[0]
    assert card["calibrator"]["n_points"] == len(steps.X_thresholds_)
    # A calibrator maps a score to a probability, so both axes have to rise.
    assert card["calibrator"]["score"] == sorted(card["calibrator"]["score"])
    assert card["calibrator"]["probability"] == sorted(card["calibrator"]["probability"])


def test_every_feature_carries_both_importances(card, shipped):
    assert [r["feature"] for r in card["importance"]] == list(shipped["features"])
    with open("results/model.json") as f:
        report = json.load(f)
    for row in card["importance"]:
        assert row["permutation"] == report["permutation_importance"][row["feature"]]
