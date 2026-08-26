"""Blocking nothing gives 0 of 0, which is undefined rather than zero.

Reporting it as 0.0000 reads as "everything it blocked was wrong", when in fact
it blocked nothing at all. Those are different claims.
"""

import json

import numpy as np
import pandas as pd
import pytest

import config
from detector import decide


def _table(sizes, ring, innocent):
    return pd.DataFrame({"size": sizes, "n_ring_members": ring,
                         "n_innocent_members": innocent,
                         "tier": ["adaptive"] * len(sizes),
                         "seed": range(len(sizes)),
                         "world_accounts": [12000] * len(sizes),
                         "world_ring_accounts": [96] * len(sizes)})


def test_precision_is_none_when_nothing_was_blocked():
    table = _table([10, 10], [5, 0], [5, 10])
    r = decide.score_policy(table, np.array(["review", "allow"]))
    assert r["accounts_blocked"] == 0
    assert r["precision"] is None


def test_precision_is_a_real_zero_when_only_innocents_were_blocked():
    """0 of 919 is defined and is genuinely zero. It must not become n/a."""
    table = _table([10], [0], [10])
    r = decide.score_policy(table, np.array(["block"]))
    assert r["accounts_blocked"] == 10
    assert r["precision"] == 0.0


def test_the_formatter_says_what_undefined_means():
    assert decide.format_precision(None) == "n/a (no blocks)"
    assert decide.format_precision(0.0) == "0.0000"
    assert decide.format_precision(0.9961) == "0.9961"


def test_pooled_precision_leaves_the_undefined_tier_out():
    """A tier that blocked nothing contributes no numerator and no denominator,
    so it cannot drag the pooled figure down."""
    with open("results/holdout.json") as f:
        holdout = json.load(f)
    matrix = holdout["results_matrix"]
    tp = sum(r["tp"] for r in matrix.values())
    fp = sum(r["fp"] for r in matrix.values())
    assert holdout["pooled"]["precision"] == pytest.approx(tp / (tp + fp), abs=1e-4)

    undefined = [t for t, r in matrix.items() if r["precision"] is None]
    for t in undefined:
        assert matrix[t]["tp"] == 0 and matrix[t]["fp"] == 0


def test_the_adaptive_tier_blocked_nothing_on_the_holdout():
    with open("results/holdout.json") as f:
        holdout = json.load(f)
    adaptive = holdout["results_matrix"]["adaptive"]
    assert adaptive["accounts_blocked"] == 0
    assert adaptive["precision"] is None, (
        "blocking nothing must report as undefined, not 0.0000")


def test_the_baseline_zero_is_left_alone():
    """The rules baseline blocked 919 innocents and caught none. That is a
    measured zero and must keep reading as one."""
    with open("results/baseline_holdout.json") as f:
        base = json.load(f)
    adaptive = base["tiers"]["adaptive"]
    assert adaptive["fp"] > 0
    assert adaptive["precision"] == 0.0
