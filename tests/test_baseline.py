"""Locks the frozen baseline so it cannot drift without someone noticing.

Later results are reported as a delta against results/baseline.json. If a
change to the generator or the linker quietly moves those numbers, the delta is
measured against a different world and means nothing.
"""

import json

import pytest

import config
from detector import baseline, costs

LOCK_SEEDS = [700, 701, 702]
LOCK_PATH = "results/baseline_lock.json"
FROZEN_PATH = "results/baseline.json"


@pytest.fixture(scope="module")
def frozen():
    with open(FROZEN_PATH) as f:
        return json.load(f)


def test_union_find_merges_only_what_shares_something():
    uf = baseline.UnionFind(range(5))
    uf.union(0, 1)
    uf.union(1, 2)
    assert uf.find(0) == uf.find(2)
    assert uf.find(0) != uf.find(3)
    sizes = sorted(len(g) for g in uf.groups().values())
    assert sizes == [1, 1, 3]


def test_rule_score_caps_at_one():
    perfect = {"coupon_rate": 1.0, "repeat_rate": 0.0, "signup_span_days": 0.1,
               "near_coupon_min": 1.0, "value_spread": 0.01}
    assert baseline.rule_score(perfect) == 1.0
    nothing = {"coupon_rate": 0.1, "repeat_rate": 0.9, "signup_span_days": 400.0,
               "near_coupon_min": 0.0, "value_spread": 3.0}
    assert baseline.rule_score(nothing) == 0.0


def test_baseline_numbers_have_not_drifted():
    """Re-runs three worlds per tier and compares against the committed lock."""
    with open(LOCK_PATH) as f:
        locked = json.load(f)
    fresh = baseline.run(LOCK_SEEDS, locked["n_accounts_per_world"],
                         locked["threshold"])
    for tier in config.TIER_NAMES:
        a, b = locked["tiers"][tier], fresh["tiers"][tier]
        for key in ("tp", "fp", "missed", "groups_found", "groups_flagged",
                    "precision", "recall", "cost_rupees"):
            assert a[key] == b[key], f"{tier}.{key}: frozen {a[key]}, now {b[key]}"


def test_every_tier_loses_money(frozen):
    """Ninety percent precision still loses money at this cost ratio."""
    for tier, t in frozen["tiers"].items():
        assert t["net_vs_nothing_rupees"] < 0, f"{tier} unexpectedly turned a profit"


def test_the_baseline_is_blind_to_the_adaptive_tier(frozen):
    assert frozen["tiers"]["adaptive"]["recall"] == 0.0
    assert frozen["tiers"]["adaptive"]["tp"] == 0


def test_precision_is_far_below_the_breakeven_point(frozen):
    """The reported precision reads well but sits below breakeven."""
    breakeven = costs.breakeven_precision()
    for tier, t in frozen["tiers"].items():
        assert t["precision"] < breakeven, tier


def test_frozen_baseline_was_measured_at_the_right_base_rate(frozen):
    for t in frozen["tiers"].values():
        assert abs(t["prevalence"] - config.RING_PREVALENCE) < 0.001


def test_frozen_baseline_never_touched_the_holdout(frozen):
    lo, hi = frozen["seed_range"]
    assert hi < min(config.HOLDOUT_SEEDS), "the baseline ran on sealed seeds"
