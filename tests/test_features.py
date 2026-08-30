"""Features, and the leakage audit that keeps them honest."""

import inspect

import numpy as np
import pandas as pd
import pytest

import config
from detector import features


@pytest.fixture(scope="module")
def table(train_table_path):
    return pd.read_csv(train_table_path)


def test_no_feature_function_can_see_the_answer():
    """A feature that encodes the label would make the model look good in
    testing and fail in use."""
    src = "\n".join(inspect.getsource(fn) for fn in
                    (features.structural, features.temporal,
                     features.behavioural, features.economic,
                     features.cluster_features))
    for forbidden in ("is_ring", "group_id", "group_type", "operator_id",
                      "truth", "label"):
        assert forbidden not in src, f"feature code touches {forbidden}"


def test_no_feature_correlates_above_the_leak_limit(table):
    report = features.audit(table)
    assert report["leaks"] == [], report["leaks"]
    assert report["forbidden_columns_referenced"] == []


def test_every_feature_is_present_and_finite(table):
    for name in features.FEATURE_NAMES:
        assert name in table.columns, name
        assert np.isfinite(table[name]).all(), f"{name} has NaN or inf"


def test_burstiness_on_a_hand_built_example():
    """Ten accounts inside one hour, two far away."""
    ts = np.array([0, 60, 120, 180, 240, 300, 360, 420, 480, 540,
                   10 * 86400, 20 * 86400])
    assert features._burstiness(ts) == pytest.approx(10 / 12)


def test_hour_entropy_is_zero_for_a_script_and_high_for_people():
    same_hour = np.array([3 * 3600 + i for i in range(50)])
    assert features._entropy_of_hours(same_hour) == pytest.approx(0.0)
    spread = np.array([h * 3600 for h in range(24)] * 3)
    assert features._entropy_of_hours(spread) == pytest.approx(1.0)


def test_gini_is_zero_when_flat_and_high_when_concentrated():
    assert features._gini(np.array([5.0, 5.0, 5.0, 5.0])) == pytest.approx(0.0)
    assert features._gini(np.array([0.0, 0.0, 0.0, 100.0])) > 0.7


def test_economic_features_price_the_coupon_correctly():
    block = pd.DataFrame({"coupon_used": [True, True, False, True],
                          "total_order_value": [500, 600, 400, 700]})
    e = features.economic(block)
    assert e["total_discount"] == 3 * config.COUPON_VALUE
    assert e["discount_per_account"] == pytest.approx(3 * config.COUPON_VALUE / 4)
    assert e["discount_to_revenue"] == pytest.approx(600 / 2200)


def test_rings_and_office_lookalikes_differ_on_repeat_rate(table):
    """Rings and office groups have to differ on repeat rate. If they look the
    same, the model has nothing to separate them with."""
    rings = table[table["label"] == 1]["repeat_rate"]
    office = table[(table["label"] == 0)
                   & (table["dominant_benign_kind"] == "office")]["repeat_rate"]
    assert len(office) > 20
    assert office.mean() > rings.mean() + 0.2, (office.mean(), rings.mean())


def test_labels_use_majority_not_presence():
    truth = pd.DataFrame({"is_ring": [True, True, False, False, False],
                          "group_type": ["ring", "ring", "normal",
                                         "office", "office"]})
    mostly_benign = features.label_cluster(truth, [0, 1, 2, 3, 4])
    assert mostly_benign["label"] == 0
    assert mostly_benign["n_ring_members"] == 2
    assert mostly_benign["dominant_benign_kind"] == "office"
    mostly_ring = features.label_cluster(truth, [0, 1, 2])
    assert mostly_ring["label"] == 1


def test_feature_table_split_by_seed_never_overlaps(train_table_path,
                                                    val_table_path):
    train = pd.read_csv(train_table_path)["seed"].unique()
    val = pd.read_csv(val_table_path)["seed"].unique()
    assert not set(train) & set(val)
    assert max(train) < min(config.HOLDOUT_SEEDS)
    assert max(val) < min(config.HOLDOUT_SEEDS)
