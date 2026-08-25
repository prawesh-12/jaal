"""Community detection over the weighted evidence graph.

Accounts are nodes, scored pairs are edges, and edge weight is how many bits of
evidence say the two share an operator. The job is to cut that graph into groups
that are strongly tied inside and weakly tied to everything else.

This is a graph algorithm, not machine learning. No training, no labels.

**Leiden, not Louvain.** Louvain can produce badly connected communities and, in
the worst case, internally disconnected ones. For this problem that is not a
technicality: a "ring" that is internally disconnected is not a ring, it is two
unrelated clumps the algorithm glued together, and reporting one as a detection
falls apart under the first question a reviewer asks. Leiden guarantees
connected communities by construction. Both are run and Louvain's failures are
counted, in `results/clustering.json`.

    python -m detector.cluster --accounts 12000 --seeds 700-704
"""

from __future__ import annotations

import argparse
import json

import community as community_louvain
import igraph as ig
import leidenalg as la
import networkx as nx
import numpy as np

import config
from detector import link
from detector.blocking import candidate_pairs
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import World, generate, load_priors
from detector.resources import announce, apply

# Phase 2 chose 6 bits on an edge budget and said the real test was cluster
# quality. It failed that test: at 6 bits Leiden returned clusters of up to
# 1,812 accounts and a pairwise F1 of 0.0014, because a graph where 96% of
# edges are wrong has no structure left to find. Raised to 14 bits, which is
# where every tier's recall ceiling is highest. See D-018.
EDGE_THRESHOLD_BITS = 14.0
RESOLUTION = 1.0              # confirmed by the sweep in step 3.3
MIN_CLUSTER_SIZE = 3          # a "ring" of two is a couple sharing a phone
MAX_CLUSTER_SIZE = 500        # above this the threshold is too low
CLUSTER_SEED = 42             # community detection is randomised. Pin it.


def build_graph(pairs: np.ndarray, bits: np.ndarray, n_accounts: int,
                threshold: float = EDGE_THRESHOLD_BITS) -> ig.Graph:
    """Weighted graph over account row positions. Isolated accounts stay isolated."""
    keep = bits >= threshold
    edges = pairs[keep]
    weights = bits[keep].astype(float)
    g = ig.Graph(n=n_accounts, edges=[(int(a), int(b)) for a, b in edges])
    g.es["weight"] = weights.tolist()
    return g


def leiden_clusters(graph: ig.Graph, resolution: float = RESOLUTION,
                    seed: int = CLUSTER_SEED) -> list[list[int]]:
    """Communities that are connected by construction."""
    part = la.find_partition(
        graph,
        la.RBConfigurationVertexPartition,   # supports a resolution parameter
        weights="weight",
        resolution_parameter=resolution,
        seed=seed,
    )
    return [sorted(c) for c in part if len(c) > 1]


def louvain_clusters(graph: ig.Graph, seed: int = CLUSTER_SEED
                     ) -> list[list[int]]:
    """The same job with the algorithm everyone reaches for, for comparison."""
    nxg = nx.Graph()
    nxg.add_nodes_from(range(graph.vcount()))
    for e in graph.es:
        nxg.add_edge(e.source, e.target, weight=e["weight"])
    partition = community_louvain.best_partition(nxg, weight="weight",
                                                 random_state=seed)
    groups: dict[int, list[int]] = {}
    for node, comm in partition.items():
        groups.setdefault(comm, []).append(node)
    return [sorted(c) for c in groups.values() if len(c) > 1]


def count_disconnected(graph: ig.Graph, clusters: list[list[int]]) -> int:
    """How many 'communities' are not actually connected subgraphs?"""
    bad = 0
    for c in clusters:
        sub = graph.subgraph(c)
        if not sub.is_connected():
            bad += 1
    return bad


def filter_by_size(clusters: list[list[int]], min_size: int = MIN_CLUSTER_SIZE
                   ) -> tuple[list[list[int]], int]:
    kept = [c for c in clusters if len(c) >= min_size]
    return kept, len(clusters) - len(kept)


def cluster_world(world: World, params: dict,
                  threshold: float = EDGE_THRESHOLD_BITS,
                  resolution: float = RESOLUTION,
                  min_size: int = MIN_CLUSTER_SIZE
                  ) -> tuple[list[list[int]], ig.Graph, np.ndarray]:
    """Blocking, scoring and clustering for one world. The usual entry point."""
    pairs, _ = candidate_pairs(world.accounts)
    bits, contributions = link.score_pairs(world.accounts, pairs, params)
    graph = build_graph(pairs, bits, len(world.accounts), threshold)

    # Keep the winning contribution row per edge so Phase 8 can say why.
    keep = bits >= threshold
    graph.es["contributions"] = contributions[keep].tolist()

    clusters, _ = filter_by_size(leiden_clusters(graph, resolution), min_size)
    return clusters, graph, contributions[keep]


# --------------------------------------------------------------------------
# evaluation
# --------------------------------------------------------------------------

def pairwise_quality(world: World, clusters: list[list[int]]) -> dict:
    """Precision and recall over pairs the partition puts together.

    The measure that matters. "Every ring account landed in some cluster" is
    trivially true if the partition is one giant blob, and a blob is not a
    detection. Counting pairs punishes that: a cluster of 1,800 accounts
    containing a ring of 30 claims 1.6 million co-operator pairs and gets
    credit for 435 of them.
    """
    from detector.blocking import true_pair_codes

    n = len(world.truth)
    truth = true_pair_codes(world)
    chunks = []
    for c in clusters:
        k = len(c)
        if k < 2:
            continue
        pos = np.asarray(c)
        i, j = np.triu_indices(k, k=1)
        chunks.append(pos[i] * n + pos[j])
    got = np.unique(np.concatenate(chunks)) if chunks else np.empty(0, np.int64)

    tp = int(len(np.intersect1d(got, truth, assume_unique=True)))
    precision = tp / len(got) if len(got) else 0.0
    recall = tp / len(truth) if len(truth) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"pair_precision": round(precision, 5),
            "pair_recall": round(recall, 5),
            "pair_f1": round(f1, 5),
            "pairs_claimed": int(len(got))}


def score_clusters(world: World, clusters: list[list[int]]) -> dict:
    """How well the partition lines up with the operators that actually exist."""
    is_ring = world.truth["is_ring"].to_numpy()
    group = world.truth["group_id"].to_numpy()

    ring_ids = np.unique(group[is_ring])
    ring_sizes = {r: int((group == r).sum()) for r in ring_ids}

    # For each real ring, the largest slice of it that landed in one cluster.
    best_overlap = {r: 0 for r in ring_ids}
    intact = 0
    for c in clusters:
        members = np.asarray(c)
        counts = {}
        for r in np.unique(group[members][is_ring[members]]):
            counts[r] = int((group[members] == r).sum())
        for r, n in counts.items():
            best_overlap[r] = max(best_overlap[r], n)
            if n == ring_sizes[r] and len(members) == n:
                intact += 1

    recovered = {r: best_overlap[r] / ring_sizes[r] for r in ring_ids}
    sizes = [len(c) for c in clusters]
    return {
        "n_clusters": len(clusters),
        "n_rings": len(ring_ids),
        "rings_fully_intact": intact,
        "mean_ring_recovered": round(float(np.mean(list(recovered.values())))
                                     if recovered else 0.0, 4),
        "rings_over_half_recovered": int(sum(v >= 0.5 for v in recovered.values())),
        "max_cluster_size": max(sizes) if sizes else 0,
        "mean_cluster_size": round(float(np.mean(sizes)), 2) if sizes else 0.0,
        "clustered_accounts": int(sum(sizes)),
        "ring_accounts_clustered": int(sum(
            int(is_ring[np.asarray(c)].sum()) for c in clusters)),
        "n_ring_accounts": int(is_ring.sum()),
        **pairwise_quality(world, clusters),
    }


def run(seeds, n_accounts, params, resolution=RESOLUTION,
        threshold=EDGE_THRESHOLD_BITS, tiers=None, with_louvain=True) -> dict:
    priors = load_priors()
    out = {"resolution": resolution, "edge_threshold_bits": threshold,
           "min_cluster_size": MIN_CLUSTER_SIZE, "seed": CLUSTER_SEED,
           "seed_range": [seeds[0], seeds[-1]], "n_seeds": len(seeds),
           "n_accounts": n_accounts, "tiers": {}}

    for tier in (tiers or config.TIER_NAMES):
        rows, lou = [], []
        for seed in seeds:
            world = generate(seed, tier, n_accounts, priors)
            pairs, _ = candidate_pairs(world.accounts)
            bits, _ = link.score_pairs(world.accounts, pairs, params)
            graph = build_graph(pairs, bits, len(world.accounts), threshold)

            leiden = leiden_clusters(graph, resolution)
            kept, dropped = filter_by_size(leiden)
            row = score_clusters(world, kept)
            row["leiden_disconnected"] = count_disconnected(graph, leiden)
            row["dropped_small"] = dropped
            row["edges"] = graph.ecount()

            if with_louvain:
                lv = louvain_clusters(graph)
                lv_kept, _ = filter_by_size(lv)
                lou.append({
                    "disconnected": count_disconnected(graph, lv),
                    "n_clusters": len(lv_kept),
                    "max_cluster_size": max((len(c) for c in lv_kept), default=0),
                    "mean_ring_recovered": score_clusters(
                        world, lv_kept)["mean_ring_recovered"],
                    "pair_f1": pairwise_quality(world, lv_kept)["pair_f1"],
                })
            rows.append(row)
            del world

        agg = {k: (round(float(np.mean([r[k] for r in rows])), 4)
                   if isinstance(rows[0][k], float)
                   else int(np.sum([r[k] for r in rows])))
               for k in rows[0]}
        for key in ("mean_ring_recovered", "pair_precision", "pair_recall",
                    "pair_f1"):
            agg[key] = round(float(np.mean([r[key] for r in rows])), 5)
        agg["max_cluster_size"] = int(max(r["max_cluster_size"] for r in rows))
        agg["mean_cluster_size"] = round(
            float(np.mean([r["mean_cluster_size"] for r in rows])), 2)
        if with_louvain:
            agg["louvain"] = {
                "disconnected": int(sum(l["disconnected"] for l in lou)),
                "n_clusters": int(sum(l["n_clusters"] for l in lou)),
                "max_cluster_size": int(max(l["max_cluster_size"] for l in lou)),
                "mean_ring_recovered": round(
                    float(np.mean([l["mean_ring_recovered"] for l in lou])), 4),
                "pair_f1": round(float(np.mean([l["pair_f1"] for l in lou])), 5),
            }
        out["tiers"][tier] = agg
    return out


def resolution_sweep(seeds, n_accounts, params, values, tiers=None) -> dict:
    out = {}
    for r in values:
        rep = run(seeds, n_accounts, params, resolution=r, tiers=tiers,
                  with_louvain=False)
        out[str(r)] = {t: {"pair_f1": v["pair_f1"],
                           "pair_precision": v["pair_precision"],
                           "pair_recall": v["pair_recall"],
                           "n_clusters": v["n_clusters"],
                           "max_cluster_size": v["max_cluster_size"]}
                       for t, v in rep["tiers"].items()}
    return out


def print_report(report: dict) -> None:
    print(f"\nClustering, resolution {report['resolution']}, edges over "
          f"{report['edge_threshold_bits']:.0f} bits, clusters of "
          f"{report['min_cluster_size']}+, seed {report['seed']}")
    print(f"seeds {report['seed_range'][0]}-{report['seed_range'][1]}, "
          f"{report['n_seeds']} worlds per tier\n")
    head = (f"{'tier':<15} {'clusters':<9} {'pair prec':<11} {'pair recall':<13} "
            f"{'pair F1':<9} {'max size':<10} {'leiden bad':<12} "
            f"{'louvain bad':<12} {'louvain F1'}")
    print(head)
    print("-" * len(head))
    for tier, t in report["tiers"].items():
        lv = t.get("louvain", {})
        print(f"{tier:<15} {t['n_clusters']:<9} {t['pair_precision']:<11.4f} "
              f"{t['pair_recall']:<13.4f} {t['pair_f1']:<9.4f} "
              f"{t['max_cluster_size']:<10} {t['leiden_disconnected']:<12} "
              f"{lv.get('disconnected', '-'):<12} "
              f"{lv.get('pair_f1', 0):.4f}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--params", default="results/link_params.json")
    p.add_argument("--resolution", type=float, default=RESOLUTION)
    p.add_argument("--threshold", type=float, default=EDGE_THRESHOLD_BITS)
    p.add_argument("--sweep", action="store_true",
                   help="sweep resolution 0.5 to 2.0 instead of a single run")
    p.add_argument("--out", default=None)
    args = p.parse_args()

    announce(apply())
    with open(args.params) as f:
        params = json.load(f)
    seeds = parse_seeds(args.seeds)

    if args.sweep:
        values = [round(0.5 + 0.1 * i, 1) for i in range(16)]
        sw = resolution_sweep(seeds, args.accounts, params, values)
        print(f"\nresolution sweep, seeds {seeds[0]}-{seeds[-1]}")
        print(f"{'res':<6}" + "".join(f"{t[:13]:>26}" for t in config.TIER_NAMES))
        print(f"{'':<6}" + "".join(f"{'pairF1':>9}{'clusters':>9}{'max':>8}"
                                   for _ in config.TIER_NAMES))
        for r, v in sw.items():
            print(f"{r:<6}" + "".join(
                f"{v[t]['pair_f1']:>9.4f}{v[t]['n_clusters']:>9}"
                f"{v[t]['max_cluster_size']:>8}" for t in config.TIER_NAMES))
        report = {"sweep": sw, "seeds": [seeds[0], seeds[-1]]}
    else:
        report = run(seeds, args.accounts, params, args.resolution,
                     args.threshold)
        print_report(report)

    if args.out:
        with open(args.out, "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
