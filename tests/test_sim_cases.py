"""The cases the site replays have to agree with the pipeline that made them.

The simulation page shows a probability, a purity, three expected costs and an
action for each case. If any of those drift apart the page is telling a story
the detector did not.
"""

import json

import numpy as np
import pytest

import config
from detector import decide
from detector.sim_cases import BENIGN_KINDS, TIERS


@pytest.fixture(scope="module")
def cases():
    with open("results/sim_cases.json") as f:
        return json.load(f)


def every_case(report):
    for scenario in ("ring", "lookalike"):
        for tier in TIERS:
            for case in report["cases"][scenario][tier]:
                yield scenario, tier, case


def test_every_tier_has_both_scenarios(cases):
    for scenario in ("ring", "lookalike"):
        for tier in TIERS:
            assert cases["cases"][scenario][tier], f"no {scenario} case for {tier}"


def test_the_action_is_the_one_the_cost_rule_picks(cases):
    for scenario, tier, c in every_case(cases):
        purity = np.array([c["predicted_ring_purity"]])
        size = np.array([c["shape"]["size"]])
        expected = decide.best_action(purity, size)[0]
        assert c["action"] == expected, f"{scenario}/{tier} seed {c['seed']}"


def test_the_expected_costs_are_the_published_formula(cases):
    for scenario, tier, c in every_case(cases):
        ec = decide.expected_costs(c["predicted_ring_purity"], c["shape"]["size"])
        for action, value in c["expected_cost_rupees"].items():
            assert value == round(float(ec[action])), (
                f"{scenario}/{tier} seed {c['seed']} {action}")


def test_the_chosen_action_is_the_cheapest_one(cases):
    for scenario, tier, c in every_case(cases):
        costs = c["expected_cost_rupees"]
        assert costs[c["action"]] == min(costs.values())


def test_a_ring_case_is_a_ring_and_a_lookalike_is_not(cases):
    for scenario, tier, c in every_case(cases):
        if scenario == "ring":
            assert c["is_ring"] and c["ring_members"] > 0
            assert c["benign_kind"] is None
        else:
            assert not c["is_ring"]
            assert c["benign_kind"] in BENIGN_KINDS


def test_the_prices_match_config(cases):
    assert cases["costs_rupees"] == {
        "blocked_innocent": config.COST_BLOCKED_INNOCENT,
        "missed_abuser": config.COST_MISSED_ABUSER,
        "analyst_review": config.COST_ANALYST_REVIEW,
    }


def test_members_add_up_to_the_cluster(cases):
    for scenario, tier, c in every_case(cases):
        assert c["ring_members"] + c["innocent_members"] == c["shape"]["size"]
