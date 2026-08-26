"""Blocking sets a hard ceiling on recall for every later stage."""

import json

import numpy as np
import pytest

import config
from detector import blocking
from detector import generate_accounts as gen

SMALL = 3000


@pytest.fixture(scope="module")
def world():
    return gen.generate(700, "moderate", SMALL)


def test_candidate_pairs_are_unique_and_ordered(world):
    pairs, _ = blocking.candidate_pairs(world.accounts)
    assert (pairs[:, 0] < pairs[:, 1]).all(), "pairs must be (low, high)"
    codes = pairs[:, 0] * len(world.accounts) + pairs[:, 1]
    assert len(np.unique(codes)) == len(codes), "duplicate pairs across rules"


def test_reduction_ratio_beats_ninety_nine_percent():
    """Checked at full size, which is where the target applies.

    Possible pairs grow with the square of the population and candidate pairs
    grow far more slowly, so the ratio improves with scale. A 3,000 account
    world reaches 0.9883 and a 12,000 account world 0.9923.
    """
    world = gen.generate(700, "moderate", config.N_ACCOUNTS)
    _, stats = blocking.candidate_pairs(world.accounts)
    assert stats["pair_reduction_ratio"] > 0.99


def test_oversized_blocks_are_skipped_not_expanded():
    """One /24 network covering 700 accounts would be 245,000 pairs alone."""
    idx = {"big": list(range(config.MAX_BLOCK_SIZE + 50)), "small": [0, 1, 2]}
    pairs, skipped = blocking._pairs_from_buckets(idx, config.MAX_BLOCK_SIZE)
    assert skipped == 1
    assert len(pairs) == 3          # only the small bucket survived


def test_the_pair_guard_actually_fires(world, monkeypatch):
    monkeypatch.setattr(config, "MAX_CANDIDATE_PAIRS", 10)
    with pytest.raises(RuntimeError, match="over the"):
        blocking.candidate_pairs(world.accounts)


def test_true_pairs_are_ring_pairs_only(world):
    """A family shares a device and a card and is still four different people."""
    truth = blocking.true_pair_codes(world)
    n = len(world.truth)
    is_ring = world.truth["is_ring"].to_numpy()
    left, right = truth // n, truth % n
    assert is_ring[left].all() and is_ring[right].all()

    ring_rows = np.where(is_ring)[0]
    group = world.truth["group_id"].to_numpy()
    expected = sum(c * (c - 1) // 2 for c in
                   np.unique(group[ring_rows], return_counts=True)[1])
    assert len(truth) == expected


def test_blocking_recall_holds_on_every_tier():
    """Below 0.90 recall here, no later stage can recover the difference."""
    priors = gen.load_priors()
    for tier in config.TIER_NAMES:
        recalls = [blocking.measure(gen.generate(s, tier, SMALL, priors))
                   ["blocking_recall"] for s in range(4)]
        assert np.mean(recalls) > 0.90, f"{tier}: {recalls}"


def test_frozen_blocking_report_is_honest():
    with open("results/blocking.json") as f:
        report = json.load(f)
    for tier, t in report["tiers"].items():
        assert t["blocking_recall"] > 0.90, tier
        assert t["pair_reduction_ratio"] > 0.99, tier
