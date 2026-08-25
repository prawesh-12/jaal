"""The decision rule. This is where the cost asymmetry is actually paid for."""

import json

import numpy as np
import pytest

import config
from detector import costs, decide


@pytest.fixture(scope="module")
def report():
    with open("results/decisions.json") as f:
        return json.load(f)


def test_the_plans_worked_example_still_holds():
    """20 accounts at 70% ring purity. Allowing wins, and that is correct."""
    ec = decide.expected_costs(0.7, 20)
    assert ec["block"] == pytest.approx(0.3 * 20 * 15_000)
    assert ec["allow"] == pytest.approx(0.7 * 20 * 200)
    assert ec["review"] == pytest.approx(20 * 150)
    assert decide.best_action(np.array([0.7]), np.array([20]))[0] == "allow"


def test_blocking_needs_near_certainty():
    """Below the breakeven purity the rule must never choose to block."""
    n = np.full(8, 30)
    purity = np.array([0.5, 0.8, 0.9, 0.95, 0.98, 0.99, 0.995, 1.0])
    actions = decide.best_action(purity, n)
    assert actions[0] in ("allow", "review")
    assert actions[-1] == "block"
    blocked = purity[actions == "block"]
    assert blocked.min() >= costs.breakeven_precision()


def test_review_is_never_chosen_when_it_is_the_most_expensive():
    ec = decide.expected_costs(np.array([0.0]), np.array([1000]))
    assert decide.best_action(np.array([0.0]), np.array([1000]))[0] == "allow"
    assert ec["allow"] < ec["review"] < ec["block"]


def test_realised_cost_bills_only_the_accounts_it_should():
    action = np.array(["block", "allow", "review"])
    n_ring = np.array([8, 5, 4])
    n_innocent = np.array([2, 1, 6])
    c = decide.realised_cost(action, n_ring, n_innocent)
    assert c[0] == 2 * config.COST_BLOCKED_INNOCENT     # only the innocents
    assert c[1] == 5 * config.COST_MISSED_ABUSER        # only the abusers
    assert c[2] == 10 * config.COST_ANALYST_REVIEW      # everyone, once


def test_every_two_action_threshold_loses_money(report):
    """The headline. If this stops being true, the write-up is wrong."""
    losing = [r for r in report["threshold_sweep"]
              if r["net_vs_nothing_rupees"] > 0]
    assert losing == [], f"{len(losing)} thresholds turned a profit"


def test_three_actions_is_the_only_policy_that_pays(report):
    assert report["three_action"]["net_vs_nothing_rupees"] > 0
    assert report["f1_optimal"]["net_vs_nothing_rupees"] < 0
    assert report["at_half"]["net_vs_nothing_rupees"] < 0


def test_the_f1_optimal_threshold_is_expensive(report):
    """The gap between these two numbers is the whole point of Phase 6."""
    f1 = report["f1_optimal"]["cost_rupees"]
    three = report["three_action"]["cost_rupees"]
    assert f1 > 5 * three


def test_the_rule_blocks_above_the_breakeven_precision(report):
    assert report["three_action"]["precision"] > costs.breakeven_precision()


def test_the_review_queue_is_a_sane_size(report):
    """A system sending 90% to review is useless however good its metrics look."""
    assert 0 < report["three_action"]["review_rate"] < 0.20


def test_sensitivity_covers_the_assumption_honestly(report):
    ratios = [s["cost_ratio"] for s in report["sensitivity"]]
    assert len(ratios) >= 4
    assert min(ratios) <= 25 and max(ratios) >= 150
    # Blocking gets less attractive as a wrong block gets dearer.
    nets = [s["three_action_net"] for s in report["sensitivity"]]
    assert nets == sorted(nets, reverse=True), nets


def test_the_three_action_rule_pays_at_every_cost_ratio(report):
    for s in report["sensitivity"]:
        assert s["three_action_net"] > 0, s["cost_ratio"]
