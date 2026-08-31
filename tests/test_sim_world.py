"""The site draws results/sim_world_*.json directly, so its shape is a contract."""

import json
import os

import pytest

import config
from detector import cluster as clustering
from detector import decide, link
from detector.generate_accounts import generate, load_priors
from detector.pipeline import REQUIRED_COLUMNS, Detector
from detector.sim_world import build

WORLDS = [f"results/sim_world_{t}_{s}.json"
          for s in (975, 932, 977) for t in config.TIER_NAMES]


@pytest.fixture(scope="module")
def small_world():
    return build(701, "obvious", 2_000, load_priors(), Detector.load())


def test_trace_is_off_unless_asked():
    accounts = generate(701, "obvious", 2_000, load_priors()).accounts
    detector = Detector.load()
    assert "trace" not in detector.scan(accounts, explain_notes=False)

    trace = detector.scan(accounts, explain_notes=False, trace=True)["trace"]
    assert len(trace["bits"]) == len(trace["pairs"])
    assert trace["contributions"].shape == (len(trace["bits"]),
                                            len(link.SCORED_COMPARISONS))


def test_every_row_is_present(small_world):
    assert small_world["n_accounts"] == 2_000
    assert list(small_world["columns"]) == list(REQUIRED_COLUMNS)
    assert all(len(small_world["accounts"][c]) == 2_000 for c in REQUIRED_COLUMNS)
    assert len(small_world["truth"]["is_ring"]) == 2_000


def test_edges_are_above_threshold_and_in_range(small_world):
    edges = small_world["edges"]
    n = small_world["link"]["n_edges"]
    assert len(edges["source"]) == len(edges["target"]) == len(edges["bits"]) == n
    assert min(edges["bits"]) >= clustering.EDGE_THRESHOLD_BITS
    assert max(edges["source"] + edges["target"]) < 2_000
    assert all(len(row) == len(small_world["link"]["comparisons"])
               for row in edges["contributions"])


def test_clusters_carry_their_members_and_a_priced_action(small_world):
    for c in small_world["clusters"]:
        assert len(c["members"]) == c["size"] >= clustering.MIN_CLUSTER_SIZE
        assert c["action"] in decide.ACTIONS
        assert 0.0 <= c["predicted_ring_purity"] <= 1.0
        priced = decide.expected_costs(c["predicted_ring_purity"], c["size"])
        assert c["expected_cost_rupees"] == {k: round(float(v))
                                             for k, v in priced.items()}


@pytest.mark.skipif(not all(os.path.exists(p) for p in WORLDS),
                    reason="run.sh has not written the replay worlds yet")
@pytest.mark.parametrize("path", WORLDS)
def test_published_world_is_a_full_population(path):
    with open(path) as f:
        world = json.load(f)
    assert world["n_accounts"] == config.N_ACCOUNTS
    assert world["blocking"]["n_possible_pairs"] == (
        config.N_ACCOUNTS * (config.N_ACCOUNTS - 1) // 2)
    assert world["clustering"]["n_clusters"] == len(world["clusters"])


@pytest.mark.skipif(not os.path.exists("results/api_example.json"),
                    reason="run.sh has not written the API example yet")
def test_api_example_is_a_real_call():
    """The Using Jaal page publishes this verbatim, so it has to be true."""
    with open("results/api_example.json") as f:
        example = json.load(f)

    assert example["endpoint"] == "POST /v1/scan"
    for row in example["request"]["accounts"]:
        assert set(row) == set(REQUIRED_COLUMNS)
        assert isinstance(row["signup_ts"], int)
        assert isinstance(row["days_to_second_order"], int)

    cluster = example["response"]["clusters"][0]
    priced = decide.expected_costs(cluster["predicted_ring_purity"],
                                   cluster["size"])
    assert cluster["expected_cost_rupees"] == {k: round(float(v))
                                               for k, v in priced.items()}
    assert cluster["action"] == min(cluster["expected_cost_rupees"],
                                    key=cluster["expected_cost_rupees"].get)
