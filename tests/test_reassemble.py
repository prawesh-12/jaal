"""The second pass that tries to rejoin a split ring. It made things worse."""

import json

import pytest

from detector import reassemble


@pytest.fixture(scope="module")
def report():
    with open("results/reassembly.json") as f:
        return json.load(f)


def test_it_is_not_wired_into_the_pipeline():
    """Measured and rejected, so nothing in the live path may call it."""
    import inspect

    from detector import evaluate_holdout, pipeline
    for module in (pipeline, evaluate_holdout):
        assert "reassemble" not in inspect.getsource(module)


def test_candidates_need_a_shared_pincode_and_an_overlapping_window():
    import pandas as pd

    day = 86_400
    accounts = pd.DataFrame({
        "pincode": ["560001", "560001", "560001", "560001",
                    "400001", "400001"],
        "signup_ts": [0, day, 5 * day, 400 * day, 0, day],
    })
    clusters = [[0, 1], [2], [3], [4, 5]]
    pairs = reassemble.candidate_merges(accounts, clusters, window_days=30)
    assert (0, 1) in pairs                      # same pincode, days apart
    assert (0, 2) not in pairs                  # same pincode, a year apart
    assert not any(3 in p for p in pairs)       # different pincode entirely


def test_the_measured_result_is_a_loss(report):
    a = report["arms"]["as_is"]
    b = report["arms"]["reassembled"]
    assert b["net_vs_nothing_rupees"] < a["net_vs_nothing_rupees"]
    assert report["improves"] is False


def test_merging_halved_the_cluster_count_and_recall_with_it(report):
    a = report["arms"]["as_is"]
    b = report["arms"]["reassembled"]
    assert b["n_clusters"] < a["n_clusters"]
    assert b["recall"] < a["recall"]
    assert b["recall_including_review"] < a["recall_including_review"]


def test_the_purity_gate_did_reject_merges(report):
    """It was not a no-op gate. It stopped a third of what was proposed."""
    s = report["arms"]["reassembled"]["merge_stats"]
    assert s["rejected_purity"] > 0
    assert s["proposed"] > s["accepted"]


def test_it_never_touched_the_sealed_seeds(report):
    import config
    assert report["seeds"][1] < min(config.HOLDOUT_SEEDS)
