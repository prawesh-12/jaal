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
