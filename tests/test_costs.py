"""The cost model. Every decision and every rupee figure is arithmetic on it."""

import config
from detector import costs


def test_costs_are_integers():
    c = costs.decision_cost(10, 2, 5)
    assert isinstance(c, int)


def test_perfect_detector_costs_nothing():
    assert costs.decision_cost(0, 0, 0) == 0


def test_do_nothing_is_one_coupon_per_abuser():
    assert costs.do_nothing_cost(96) == 96 * config.COUPON_VALUE


def test_blocking_everyone_only_bills_the_innocents():
    """Abusers cost nothing when none of them get through."""
    assert (costs.block_everyone_cost(96, 11_904)
            == 11_904 * config.COST_BLOCKED_INNOCENT)


def test_one_wrong_block_costs_exactly_seventyfive_misses():
    assert costs.decision_cost(75, 0) == costs.decision_cost(0, 1)
    assert costs.decision_cost(74, 0) < costs.decision_cost(0, 1)


def test_breakeven_precision_is_brutal():
    p = costs.breakeven_precision()
    assert 0.98 < p < 0.99


def test_net_is_negative_when_a_detector_loses_money():
    # Catch 90 of 96 abusers but block 4 innocents doing it.
    cost = costs.decision_cost(n_missed_abusers=6, n_blocked_innocents=4)
    assert costs.net_vs_nothing(cost, 96) < 0


def test_net_is_positive_for_a_clean_catch():
    cost = costs.decision_cost(n_missed_abusers=6, n_blocked_innocents=0)
    assert costs.net_vs_nothing(cost, 96) == 90 * config.COUPON_VALUE


def test_review_is_cheap_but_not_free():
    assert 0 < config.COST_ANALYST_REVIEW < config.COST_BLOCKED_INNOCENT
    assert costs.decision_cost(0, 0, 100) == 100 * config.COST_ANALYST_REVIEW
