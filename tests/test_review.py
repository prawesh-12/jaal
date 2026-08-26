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


# --------------------------------------------------------------------------
# bounded review capacity
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def capacity():
    with open("results/review_capacity.json") as f:
        return json.load(f)


def test_expected_value_prices_analyst_time_against_coupons_saved():
    """A cluster of 20 accounts that is 90% ring: 18 coupons against 20 reviews."""
    ev = review.expected_value_of_review(0.9, 20)
    assert ev == pytest.approx(0.9 * 20 * config.COST_MISSED_ABUSER
                               - 20 * config.COST_ANALYST_REVIEW)


def test_expected_value_goes_negative_on_a_cluster_not_worth_opening():
    """Below 75% purity the analyst costs more than the coupons are worth."""
    assert review.expected_value_of_review(0.9, 30) > 0
    assert review.expected_value_of_review(0.5, 30) < 0


def test_the_queue_is_ranked_by_expected_value(capacity):
    """The point of a budget is that the best clusters get opened first."""
    evs = [c["ev_rupees"] for c in capacity["ev_top"]]
    assert evs == sorted(evs, reverse=True), evs
    assert capacity["ev_top"][0]["rank"] == 1


def test_more_capacity_pays_more_overall(capacity):
    """The trend, not every step. Local dips are explained below."""
    nets = [r["net_rupees"] for r in capacity["curve"]]
    assert nets[-1] > nets[0]
    quarter = len(nets) // 4
    for i in range(3):
        assert nets[(i + 1) * quarter] > nets[i * quarter]


def test_the_local_dips_are_small_and_understood(capacity):
    """A cluster pushed out of the queue falls back to blocking. Blocking a
    genuinely pure cluster costs nothing, while reviewing it costs analyst time,
    so a slightly smaller queue can pay slightly more."""
    dips = capacity["steps_where_more_capacity_paid_less"]
    gain = (capacity["net_with_unlimited_review_rupees"]
            - capacity["net_with_no_review_rupees"])
    worst = min((d["rupees"] for d in dips), default=0)
    assert abs(worst) < 0.05 * gain, (worst, gain)
    assert len(dips) < 0.2 * len(capacity["curve"])


def test_the_budget_axis_is_monotonic(capacity):
    ks = [r["budget_clusters"] for r in capacity["curve"]]
    assert ks == sorted(ks)
    assert ks[0] == 0
    assert ks[-1] == capacity["n_reviewable_clusters"]


def test_blocking_alone_already_pays_before_any_analyst(capacity):
    """The curve starts well above zero, so review is an addition, not the base."""
    assert capacity["net_with_no_review_rupees"] > 0
    assert (capacity["net_with_unlimited_review_rupees"]
            > capacity["net_with_no_review_rupees"])


def test_early_clusters_are_worth_more_than_late_ones(capacity):
    """If ranking by expected value did nothing, the curve would be a line."""
    rows = capacity["curve"]
    k = [r["budget_clusters"] for r in rows]
    n = [r["net_rupees"] for r in rows]
    fifth = max(1, len(rows) // 5)
    early = (n[fifth] - n[0]) / (k[fifth] - k[0])
    late = (n[-1] - n[-1 - fifth]) / (k[-1] - k[-1 - fifth])
    assert early > late
