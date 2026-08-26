"""What the review queue is worth when the reviewer is not perfect."""

import json

import pytest

import config
from detector import review


@pytest.fixture(scope="module")
def report():
    with open("results/review_accuracy.json") as f:
        return json.load(f)


def test_a_perfect_reviewer_changes_nothing():
    assert review.net_at_accuracy(2_253_050, 26_527, 1.00) == 2_253_050


def test_each_failed_cluster_costs_one_coupon_per_account():
    """Ten percent of a thousand reviewed ring accounts is Rs.20,000."""
    assert (review.net_at_accuracy(1_000_000, 1_000, 0.90)
            == 1_000_000 - 100 * config.COST_MISSED_ABUSER)


def test_breakeven_is_where_net_reaches_zero():
    net, reviewed = 2_253_050, 26_527
    a = review.breakeven_accuracy(net, reviewed)
    assert review.net_at_accuracy(net, reviewed, a) == 0


def test_breakeven_is_none_when_blocking_already_pays_for_the_queue():
    """Net larger than the worst the queue can cost means it never loses."""
    assert review.breakeven_accuracy(1_148_700, 4_719) is None
    assert review.net_at_accuracy(1_148_700, 4_719, 0.0) > 0


def test_the_committed_breakeven_matches_the_committed_counts(report):
    """The published figure has to fall out of the published holdout numbers."""
    with open("results/holdout.json") as f:
        holdout = json.load(f)
    pooled = holdout["pooled"]
    expected = review.breakeven_accuracy(pooled["net_vs_nothing_rupees"],
                                         pooled["ring_accounts_reviewed"])
    assert report["pooled"]["breakeven_accuracy"] == pytest.approx(expected)
    assert report["pooled"]["ring_accounts_reviewed"] == pooled["ring_accounts_reviewed"]
    assert report["pooled"]["net_when_perfect_rupees"] == pooled["net_vs_nothing_rupees"]


def test_every_committed_row_recomputes(report):
    """Each row in the table must follow from the two numbers above it."""
    for block in [report["pooled"]] + list(report["tiers"].values()):
        for row in block["curve"]:
            assert row["net_rupees"] == review.net_at_accuracy(
                block["net_when_perfect_rupees"],
                block["ring_accounts_reviewed"], row["accuracy"])


def test_net_falls_as_the_reviewer_gets_worse(report):
    for block in [report["pooled"]] + list(report["tiers"].values()):
        nets = [r["net_rupees"] for r in block["curve"]]
        assert nets == sorted(nets, reverse=True), nets


def test_the_harder_tiers_lean_harder_on_the_reviewer(report):
    """Blocking carries the easy tier. Review carries the hard ones."""
    b = {t: report["tiers"][t]["breakeven_accuracy"] for t in config.TIER_NAMES}
    assert b["obvious"] is None
    assert b["adaptive"] > b["moderate"]
