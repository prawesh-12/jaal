"""The operator that adapts to its own outcomes."""

import json

import numpy as np
import pytest

from detector import adapt


@pytest.fixture(scope="module")
def report():
    with open("results/adaptive_loop.json") as f:
        return json.load(f)


def test_the_operator_only_moves_knobs_it_actually_controls(report):
    for s in report["history"]:
        move = s.get("move")
        if move:
            assert move["parameter"] in adapt.PARAMS


def test_moves_go_toward_evasion():
    """Down for device reuse and drop sharing, up for the rest."""
    point = adapt.starting_point()
    for name, spec in adapt.PARAMS.items():
        corr = {n: {"rho": 0.0, "p": 1.0} for n in adapt.PARAMS}
        corr[name] = {"rho": -0.9 * spec["evade"], "p": 0.001}
        move = adapt.choose_move(corr, point)
        assert move["parameter"] == name
        if spec["evade"] > 0:
            assert move["to"] > move["from"]
        else:
            assert move["to"] < move["from"]


def test_the_operator_chases_gain_not_correlation_size():
    """A large correlation pointing the wrong way is worth nothing to it."""
    point = adapt.starting_point()
    corr = {n: {"rho": 0.0, "p": 1.0} for n in adapt.PARAMS}
    # Spreading signups further goes with being blocked more: no use.
    corr["signup_window_days"] = {"rho": +0.9, "p": 0.001}
    # Sharing fewer drop addresses goes with being blocked less: useful.
    corr["accounts_per_drop"] = {"rho": +0.4, "p": 0.010}
    move = adapt.choose_move(corr, point)
    assert move["parameter"] == "accounts_per_drop"
    assert move["helps_evasion"]


def test_a_knob_already_at_its_limit_is_skipped():
    point = dict(adapt.starting_point())
    point["camouflage"] = adapt.PARAMS["camouflage"]["hi"]
    corr = {n: {"rho": 0.0, "p": 1.0} for n in adapt.PARAMS}
    corr["camouflage"] = {"rho": -0.9, "p": 0.001}
    corr["value_jitter"] = {"rho": -0.5, "p": 0.010}
    move = adapt.choose_move(corr, point)
    assert move["parameter"] != "camouflage"


def test_no_signal_means_no_move():
    """With nothing blocked there is nothing to correlate against."""
    assert adapt.choose_move({}, adapt.starting_point()) is None


def test_trials_stay_inside_the_operators_range():
    rng = np.random.default_rng(0)
    point = adapt.starting_point()
    for _ in range(200):
        t = adapt.trial_settings(point, rng)
        for name, spec in adapt.PARAMS.items():
            assert spec["lo"] <= t[name] <= spec["hi"]


def test_the_committed_run_had_enough_worlds_to_be_stable(report):
    assert report["worlds_per_round"] >= 100
    assert report["rounds"] >= 4
    for s in report["history"]:
        move = s.get("move")
        if move:
            assert move["significant"], (
                f"round {s['round']} moved on a correlation that was not "
                f"significant, p={move['p']}")


def test_blocking_collapses_while_the_review_queue_holds(report):
    """The finding. The operator kills the outcome it can see and barely
    touches the one it cannot."""
    h = report["history"]
    blocked = [s["recall_blocked"] for s in h]
    stopped = [s["recall_including_review"] for s in h]
    assert blocked[0] > 0.10
    assert blocked[-1] < 0.01
    assert stopped[-1] > 0.85

    # Relative, not absolute. Blocking loses nearly all of what it started
    # with. The share reaching a human loses a few percent of what it started
    # with.
    blocked_lost = (blocked[0] - blocked[-1]) / blocked[0]
    stopped_lost = (stopped[0] - stopped[-1]) / stopped[0]
    assert blocked_lost > 0.95
    assert stopped_lost < 0.10
    assert blocked_lost > 10 * stopped_lost


# how much of the review queue the operator can see

OUTCOME = {"n_ring": 96, "blocked": 10, "reviewed": 40,
           "reviewed_clusters": [20, 15, 5]}


def test_blocks_are_always_visible():
    """Whatever q is, a block is a block."""
    for q in (0.0, 0.25, 0.5, 0.75, 1.0):
        seen = adapt.observed_stopped(OUTCOME, q, np.random.default_rng(0))
        assert seen >= OUTCOME["blocked"]


def test_at_zero_visibility_a_review_looks_like_being_allowed():
    seen = adapt.observed_stopped(OUTCOME, 0.0, np.random.default_rng(0))
    assert seen == OUTCOME["blocked"]


def test_at_full_visibility_a_review_looks_like_a_block():
    seen = adapt.observed_stopped(OUTCOME, 1.0, np.random.default_rng(0))
    assert seen == OUTCOME["blocked"] + OUTCOME["reviewed"]


def test_partial_visibility_lands_in_between_on_average():
    for q in (0.25, 0.5, 0.75):
        seen = [adapt.observed_stopped(OUTCOME, q, np.random.default_rng(i))
                for i in range(400)]
        expected = OUTCOME["blocked"] + q * OUTCOME["reviewed"]
        assert abs(np.mean(seen) - expected) < 0.08 * OUTCOME["reviewed"]


def test_a_review_is_noticed_whole_or_not_at_all():
    """An operator notices a cluster being held, not individual accounts."""
    possible = {OUTCOME["blocked"] + sum(s)
                for r in range(8)
                for s in [[c for k, c in enumerate(OUTCOME["reviewed_clusters"])
                           if r >> k & 1]]}
    seen = {adapt.observed_stopped(OUTCOME, 0.5, np.random.default_rng(i))
            for i in range(300)}
    assert seen <= possible


def test_the_visibility_levels_span_none_to_all():
    assert min(adapt.VISIBILITY.values()) == 0.0
    assert max(adapt.VISIBILITY.values()) == 1.0
    assert adapt.VISIBILITY["blocks_only"] == 0.0
    assert adapt.VISIBILITY["full"] == 1.0


@pytest.fixture(scope="module")
def replicates():
    with open("results/adaptive_visibility_replicates.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def mechanism():
    with open("results/adaptive_mechanism.json") as f:
        return json.load(f)


def test_every_visibility_run_used_the_same_worlds_and_rounds(replicates):
    for runs in replicates["runs"].values():
        for run in runs:
            assert run["worlds_per_round"] == replicates["worlds_per_round"]
            assert len(run["history"]) == replicates["rounds"] + 1


def test_all_settings_start_from_the_same_place(replicates):
    """Round 0 is the operator watching, so visibility cannot change it."""
    starts = {run["history"][0]["recall_including_review"]
              for runs in replicates["runs"].values() for run in runs}
    assert len(starts) == 1


def test_seeing_the_queue_erodes_it_faster(replicates):
    from detector import adapt
    blind = adapt._mean_curve(replicates["runs"]["blocks_only"],
                              "recall_including_review")
    seeing = adapt._mean_curve(replicates["runs"]["full"],
                               "recall_including_review")
    assert (blind[0] - blind[-1]) < (seeing[0] - seeing[-1])


def test_the_two_settings_separate_across_every_replicate(replicates):
    """Three replicates were needed to see this. One was not enough."""
    blind = [r["history"][-1]["recall_including_review"]
             for r in replicates["runs"]["blocks_only"]]
    seeing = [r["history"][-1]["recall_including_review"]
              for r in replicates["runs"]["full"]]
    assert len(blind) == len(seeing) == 3
    assert min(blind) > max(seeing)


def test_the_queue_holds_even_at_full_visibility(replicates):
    """It erodes. It does not collapse. That is the result."""
    from detector import adapt
    seeing = adapt._mean_curve(replicates["runs"]["full"],
                               "recall_including_review")
    assert seeing[-1] > 0.85
    blocked = adapt._mean_curve(replicates["runs"]["full"], "recall_blocked")
    assert blocked[-1] < 0.01


def test_seeing_the_queue_points_the_operator_at_addresses(replicates):
    """The reproducible part. Blind, it chases signup timing. Seeing, it
    chases delivery addresses, which is what actually matters."""
    counts = {}
    for label, runs in replicates["runs"].items():
        c = {}
        for run in runs:
            for h in run["history"]:
                if h.get("move"):
                    c[h["move"]["parameter"]] = c.get(h["move"]["parameter"], 0) + 1
        counts[label] = c
    assert counts["full"].get("accounts_per_drop", 0) > \
        counts["blocks_only"].get("accounts_per_drop", 0)
    assert counts["blocks_only"].get("signup_window_days", 0) >= 4


def test_no_single_change_and_no_pair_defeats_the_queue(mechanism):
    c = mechanism["configs"]
    for label in ("addresses rotated only", "devices rotated only",
                  "both rotated", "signups spread only",
                  "values jittered only", "camouflage only"):
        assert c[label]["recall_including_review"] > 0.90, label


def test_all_five_changes_together_do_defeat_it(mechanism):
    c = mechanism["configs"]
    assert c["everything at its limit"]["recall_including_review"] < 0.65


def test_the_evasion_is_superadditive(mechanism):
    """The reason a greedy operator never gets there: any one change looks like
    noise next to what all of them together are worth."""
    c = mechanism["configs"]
    singles = [v["change_vs_ordinary"] for k, v in c.items()
               if k not in ("ordinary", "both rotated", "everything at its limit")]
    together = c["everything at its limit"]["change_vs_ordinary"]
    assert together < 3 * sum(singles)


def test_the_corner_is_the_tier_we_already_report(mechanism):
    """All five knobs at their limit is the adaptive tier by another route."""
    with open("results/holdout.json") as f:
        holdout = json.load(f)
    here = mechanism["configs"]["everything at its limit"]["recall_including_review"]
    there = holdout["results_matrix"]["adaptive"]["recall_including_review"]
    assert abs(here - there) < 0.02
