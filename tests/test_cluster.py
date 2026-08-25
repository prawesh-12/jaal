"""Community detection. The guarantees are the point, so they get asserted."""

import json

import igraph as ig
import numpy as np
import pytest

import config
from detector import cluster, link
from detector import generate_accounts as gen
from detector.blocking import candidate_pairs

SMALL = 4000


@pytest.fixture(scope="module")
def params():
    with open("results/link_params.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def clustered(params):
    world = gen.generate(700, "moderate", SMALL)
    clusters, graph, _ = cluster.cluster_world(world, params)
    return world, clusters, graph


def test_leiden_never_returns_a_disconnected_community(clustered):
    """The whole reason Leiden is here rather than Louvain."""
    _, clusters, graph = clustered
    assert cluster.count_disconnected(graph, clusters) == 0


def test_clustering_is_deterministic(params):
    world = gen.generate(701, "sophisticated", SMALL)
    a, _, _ = cluster.cluster_world(world, params)
    b, _, _ = cluster.cluster_world(world, params)
    assert a == b


def test_no_cluster_is_a_blob(clustered):
    """A cluster over 500 accounts means the edge threshold is too low."""
    _, clusters, _ = clustered
    assert max(len(c) for c in clusters) <= cluster.MAX_CLUSTER_SIZE


def test_pairs_of_two_are_dropped():
    kept, dropped = cluster.filter_by_size([[1, 2], [3, 4, 5], [6, 7, 8, 9]])
    assert [len(c) for c in kept] == [3, 4]
    assert dropped == 1


def test_count_disconnected_spots_a_glued_community():
    g = ig.Graph(n=6, edges=[(0, 1), (1, 2), (3, 4), (4, 5)])
    g.es["weight"] = [1.0] * 4
    assert cluster.count_disconnected(g, [[0, 1, 2, 3, 4, 5]]) == 1
    assert cluster.count_disconnected(g, [[0, 1, 2], [3, 4, 5]]) == 0


def test_pairwise_quality_punishes_a_giant_cluster(params):
    """One blob containing every ring scores near zero, as it should."""
    world = gen.generate(702, "obvious", SMALL)
    blob = [list(range(len(world.accounts)))]
    q = cluster.pairwise_quality(world, blob)
    assert q["pair_recall"] == 1.0
    assert q["pair_precision"] < 0.01


def test_a_sophisticated_ring_survives_as_one_cluster(params):
    """Phase 1 exact matching fragmented these. This is what Phase 2 bought."""
    world = gen.generate(700, "sophisticated", config.N_ACCOUNTS)
    clusters, _, _ = cluster.cluster_world(world, params)
    is_ring = world.truth["is_ring"].to_numpy()
    assert any(is_ring[np.asarray(c)].mean() > 0.9 and len(c) >= 8
               for c in clusters)


def test_frozen_clustering_report_meets_the_phase_three_bar():
    with open("results/clustering.json") as f:
        report = json.load(f)
    for tier, t in report["tiers"].items():
        assert t["leiden_disconnected"] == 0, tier
        assert t["max_cluster_size"] <= cluster.MAX_CLUSTER_SIZE, tier


def test_results_are_stable_across_resolution():
    """The sensitivity claim in the README, asserted."""
    with open("results/clustering_sweep.json") as f:
        sweep = json.load(f)["sweep"]
    for tier in config.TIER_NAMES:
        f1s = [v[tier]["pair_f1"] for v in sweep.values()]
        assert max(f1s) - min(f1s) < 0.02, f"{tier} moves with resolution: {f1s}"
