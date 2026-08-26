"""Fellegi-Sunter scoring. The arithmetic is simple and easy to get subtly wrong."""

import json

import numpy as np
import pytest

from detector import blocking, link
from detector import generate_accounts as gen

SMALL = 3000


@pytest.fixture(scope="module")
def params():
    with open("results/link_params.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def world():
    return gen.generate(701, "moderate", SMALL)


def test_exactly_one_level_fires_per_comparison(world):
    """Summing 'within 1 hour' and 'within 24 hours' would count it twice."""
    pairs, _ = blocking.candidate_pairs(world.accounts)
    levels = link.compare(link.PairView(world.accounts, pairs))
    for name, idx in levels.items():
        assert idx.min() >= 0
        assert idx.max() < len(link.LEVELS[name]), name
        assert len(idx) == len(pairs)


def test_signup_levels_are_ordered_by_closeness():
    """Closer in time must never be worth fewer bits than further apart."""
    with open("results/link_params.json") as f:
        p = json.load(f)
    w = link.weight_table(p)["signup_gap"]
    assert w[0] > w[-1], "same hour should beat months apart"
    assert w[0] >= w[1] >= w[2], f"time levels out of order: {w}"


def test_no_u_is_zero(params):
    for name, u in params["u"].items():
        assert min(u) > 0, f"{name} has a zero u, which is an infinite weight"
        assert abs(sum(u) - 1.0) < 1e-6, f"{name} u is not a distribution"


def test_m_and_u_are_distributions(params):
    for key in ("m", "m_em"):
        for name, m in params[key].items():
            assert abs(sum(m) - 1.0) < 1e-6, f"{key}.{name}"
            assert min(m) > 0


def test_circular_hour_gap_wraps_midnight():
    a = np.array([23 * 3600])
    b = np.array([1 * 3600])
    assert link._circular_hour_gap(a, b)[0] == 2


def test_rarer_shared_values_are_worth_more(params, world):
    """The term frequency adjustment. A rare shared value is stronger evidence
    than a common one."""
    accounts = world.accounts
    counts = accounts["pincode"].value_counts()
    common, rare = counts.index[0], counts.index[-1]

    def bits_for(pincode):
        rows = np.where(accounts["pincode"].to_numpy() == pincode)[0][:2]
        pair = np.array([[rows[0], rows[1]]])
        _, contrib = link.score_pairs(accounts, pair, params)
        return float(contrib[0, link.SCORED_COMPARISONS.index("pincode")])

    if counts.iloc[-1] >= 2 and counts.iloc[0] >= 2:
        assert bits_for(rare) > bits_for(common)


def test_contributions_are_kept_for_every_pair(params, world):
    pairs, _ = blocking.candidate_pairs(world.accounts)
    bits, contrib = link.score_pairs(world.accounts, pairs, params)
    assert contrib.shape == (len(pairs), len(link.SCORED_COMPARISONS))
    assert np.allclose(contrib.sum(axis=1), bits, atol=1e-3)


def test_explain_pair_names_the_strongest_evidence(params, world):
    pairs, _ = blocking.candidate_pairs(world.accounts)
    bits, contrib = link.score_pairs(world.accounts, pairs, params)
    reasons = link.explain_pair(contrib[int(bits.argmax())])
    assert reasons
    assert all(isinstance(name, str) for name, _ in reasons)
    assert abs(reasons[0][1]) >= abs(reasons[-1][1])


def test_bits_convert_to_a_real_probability(params):
    prior = params["prior_odds"]
    p = link.bits_to_probability(np.array([0.0, 20.0, 60.0]), prior)
    assert p[0] < p[1] < p[2]
    assert 0 <= p[0] and p[2] <= 1


def test_the_two_excluded_comparisons_are_computed_but_not_scored():
    assert set(link.EXCLUDED_COMPARISONS) == {"coupon_floor", "order_value"}
    assert not set(link.EXCLUDED_COMPARISONS) & set(link.SCORED_COMPARISONS)
    assert set(link.EXCLUDED_COMPARISONS) < set(link.COMPARISONS)


def test_frozen_link_eval_recovers_the_hard_tiers():
    with open("results/link_eval.json") as f:
        report = json.load(f)
    t = report["threshold_bits"]
    rows = {tier: next(r for r in sweep if r["threshold_bits"] == t)
            for tier, sweep in report["sweep"].items()}
    assert rows["obvious"]["recall"] > 0.95
    assert rows["moderate"]["recall"] > 0.95
    # Exact matching scores zero on the sophisticated tier, so the bar is lower.
    assert rows["sophisticated"]["recall"] > 0.5
