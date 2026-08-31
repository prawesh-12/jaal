"""Write one whole scanned world for the site to replay.

`sim_cases.py` publishes single clusters. This publishes everything around them:
the twelve columns of all 12,000 accounts, what blocking kept, every edge the
linkage drew and the bits behind it, and every cluster the run scored. The site
draws that file. It computes nothing.

One seed is one population across all four tiers: `generate` varies only the
operator, so a reader can watch the same world get harder.

    python -m detector.sim_world --seeds 975 932 977
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np

import config
from detector import decide, features, link
from detector import cluster as clustering
from detector.generate_accounts import generate, load_priors
from detector.pipeline import Detector
from detector.resources import announce, apply

BITS_BIN_WIDTH = 2.0
BITS_RANGE = (-40.0, 80.0)


def _histogram(bits: np.ndarray) -> dict:
    """Every candidate pair's score, bucketed. This is what the edge threshold
    cuts through, and there are half a million of them, so it goes as counts.
    """
    lo, hi = BITS_RANGE
    edges = np.arange(lo, hi + BITS_BIN_WIDTH, BITS_BIN_WIDTH)
    counts, _ = np.histogram(np.clip(bits, lo, hi - 1e-9), bins=edges)
    return {"bin_width": BITS_BIN_WIDTH, "from_bits": lo,
            "counts": counts.astype(int).tolist(),
            "below_range": int((bits < lo).sum()),
            "above_range": int((bits >= hi).sum())}


def build(seed: int, tier: str, n_accounts: int, priors, detector: Detector) -> dict:
    world = generate(seed, tier, n_accounts, priors)
    accounts = world.accounts
    result = detector.scan(accounts, explain_notes=False, trace=True)
    trace = result.pop("trace")

    keep = trace["bits"] >= clustering.EDGE_THRESHOLD_BITS
    pairs = trace["pairs"][keep]
    edge_bits = trace["bits"][keep]
    edge_contributions = trace["contributions"][keep]

    table = trace["features"]
    clusters = []
    for record, members in zip(result["clusters"], trace["groups"]):
        row = table.iloc[record["cluster_id"]]
        # Price from the purity this file publishes, not the unrounded one the
        # run held, so a reader who recomputes the costs gets these numbers.
        priced = decide.expected_costs(record["predicted_ring_purity"],
                                       record["size"])
        clusters.append({
            **record,
            "expected_cost_rupees": {k: int(round(float(v)))
                                     for k, v in priced.items()},
            "members": [int(m) for m in members],
            "truth": features.label_cluster(world.truth, members),
            "features": {k: round(float(row[k]), 4) for k in features.FEATURE_NAMES},
        })

    truth = world.truth
    return {
        "generated_by": "detector.sim_world",
        "replay_of": "detector.pipeline.Detector.scan",
        "seed": seed,
        "tier": tier,
        "sealed_holdout_seed": seed in config.HOLDOUT_SEEDS,
        "n_accounts": int(len(accounts)),
        "columns": list(accounts.columns),
        "accounts": {c: accounts[c].tolist() for c in accounts.columns},
        # Never an input to anything the model sees. The site reveals it only
        # after a decision, and labels it as the answer key.
        "truth": {
            "is_ring": truth["is_ring"].astype(int).tolist(),
            "group_type": truth["group_type"].tolist(),
            "group_id": truth["group_id"].tolist(),
        },
        "population": {
            "ring_accounts": int(truth["is_ring"].sum()),
            "ring_groups": int(truth.loc[truth["is_ring"], "group_id"].nunique()),
            "benign_groups": int(truth.loc[
                truth["group_type"].isin(config.LOOKALIKE_KINDS),
                "group_id"].nunique()),
            "ring_prevalence": round(float(truth["is_ring"].mean()), 5),
        },
        "blocking": result["blocking"],
        "link": {
            "threshold_bits": clustering.EDGE_THRESHOLD_BITS,
            "comparisons": list(link.SCORED_COMPARISONS),
            "excluded_comparisons": list(link.EXCLUDED_COMPARISONS),
            "n_scored_pairs": int(len(trace["bits"])),
            "n_edges": int(keep.sum()),
            "bits_histogram": _histogram(trace["bits"]),
        },
        "edges": {
            "source": pairs[:, 0].astype(int).tolist(),
            "target": pairs[:, 1].astype(int).tolist(),
            "bits": np.round(edge_bits.astype(float), 2).tolist(),
            "contributions": np.round(edge_contributions.astype(float),
                                      2).tolist(),
        },
        "clustering": {
            "algorithm": "leiden",
            "resolution": clustering.RESOLUTION,
            "min_cluster_size": clustering.MIN_CLUSTER_SIZE,
            "seed": clustering.CLUSTER_SEED,
            "n_clusters": result["n_clusters"],
            "n_clustered_accounts": int(sum(len(g) for g in trace["groups"])),
        },
        "clusters": clusters,
        "summary": result["summary"],
        "timings_ms": result["timings_ms"],
    }


def api_example(world: dict, accounts, cluster: dict, rows: int = 2) -> dict:
    """A request and a response that a real run actually produced.

    The request is truncated to a couple of rows, because the response beside it
    is what `POST /v1/scan` returned for the whole batch, not for those two.
    """
    members = cluster["members"][:rows]
    return {
        "endpoint": "POST /v1/scan",
        "from": f"seed {world['seed']}, {world['tier']} tier",
        "request": {
            "note": f"truncated to {rows} of {world['n_accounts']:,} rows",
            "accounts": [
                {c: accounts.at[m, c].item() if hasattr(accounts.at[m, c], "item")
                 else accounts.at[m, c] for c in accounts.columns}
                for m in members
            ],
        },
        "response": {
            "n_accounts": world["n_accounts"],
            "n_clusters": world["clustering"]["n_clusters"],
            "clusters": [{k: cluster[k] for k in (
                "cluster_id", "size", "probability", "predicted_ring_purity",
                "action", "expected_cost_rupees", "discount_at_risk_rupees",
                "strongest_signal", "evidence_bits")}],
            "summary": world["summary"],
            "timings_ms": world["timings_ms"],
        },
    }


FIELD_W = 200
FIELD_H = 60
TILE = 10


def overview_scene(world: dict, focus: dict) -> dict:
    """The population laid out as a lattice, for the site's opening scene.

    Accounts are given a position on a `FIELD_W` by `FIELD_H` grid. Everything
    an edge can reach is placed contiguously, so every edge in the file is a
    short local mark and no edge crosses the field. The runs are spread evenly
    through the population, so a community is found by looking at where the
    edges gather rather than at where the accounts were put.
    """
    n = world["n_accounts"]
    source = world["edges"]["source"]
    target = world["edges"]["target"]

    parent = list(range(n))

    def root(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b in zip(source, target):
        ra, rb = root(a), root(b)
        if ra != rb:
            parent[ra] = rb

    members: dict[int, list[int]] = {}
    for i in range(n):
        members.setdefault(root(i), []).append(i)

    in_cluster = {m: c["cluster_id"] for c in world["clusters"] for m in c["members"]}
    focus_members = set(focus["members"])

    linked = [g for g in members.values() if len(g) > 1]
    alone = [g[0] for g in members.values() if len(g) == 1]

    def shape(group: list[int]) -> list[int]:
        """Members of one kept cluster stay together inside their component."""
        return sorted(group, key=lambda m: (m not in focus_members,
                                            in_cluster.get(m, 1 << 30), m))

    # Sizes are mixed across the field rather than sorted, so the population
    # does not read as "everything interesting is on the left".
    linked.sort(key=lambda g: ((min(g) * 2654435761) % 65536, min(g)))
    holds_focus = next(g for g in linked if focus_members & set(g))
    linked.remove(holds_focus)
    linked.insert(len(linked) // 2, holds_focus)

    at = [0] * n
    runs = []
    order, spare = 0, 0
    gap = len(alone) / (len(linked) + 1)

    tile = TILE * TILE
    for k, group in enumerate(linked):
        while spare < min(len(alone), round((k + 1) * gap)):
            at[alone[spare]] = order
            order += 1
            spare += 1
        # The cluster the scene ends on starts on a tile boundary, so its
        # members read as one clean block rather than wrapping across two.
        if focus_members & set(group):
            while order % tile and spare < len(alone):
                at[alone[spare]] = order
                order += 1
                spare += 1
        first = order
        for m in shape(group):
            at[m] = order
            order += 1
        if focus_members & set(group):
            runs.append({"cluster_id": focus["cluster_id"], "start": first,
                         "size": focus["size"], "focus": True})

    while spare < len(alone):
        at[alone[spare]] = order
        order += 1
        spare += 1

    contributions = np.asarray(world["edges"]["contributions"], dtype=float)

    return {
        "seed": world["seed"],
        "tier": world["tier"],
        "n_accounts": n,
        "field": [FIELD_W, FIELD_H],
        "comparisons": world["link"]["comparisons"],
        "threshold_bits": world["link"]["threshold_bits"],
        "n_components": len(linked),
        "runs": runs,
        "edges": {
            "source": [at[i] for i in source],
            "target": [at[i] for i in target],
            "bits": world["edges"]["bits"],
            "signal": (contributions.argmax(axis=1).tolist()
                       if len(contributions) else []),
        },
        "focus": {k: focus[k] for k in (
            "cluster_id", "size", "probability", "predicted_ring_purity",
            "action", "expected_cost_rupees", "strongest_signal")},
        "blocking": {k: world["blocking"][k] for k in (
            "n_possible_pairs", "n_candidate_pairs")},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seeds", type=int, nargs="+", default=[975, 932, 977])
    ap.add_argument("--accounts", type=int, default=config.N_ACCOUNTS)
    ap.add_argument("--tiers", nargs="*", default=config.TIER_NAMES)
    ap.add_argument("--out-dir", default=config.RESULTS_DIR)
    args = ap.parse_args()

    announce(apply())
    priors = load_priors()
    detector = Detector.load()

    index = []
    example = None
    scene = None
    for seed in args.seeds:
        for tier in args.tiers:
            world = build(seed, tier, args.accounts, priors, detector)
            if example is None:
                blocked = [c for c in world["clusters"] if c["action"] == "block"]
                if blocked:
                    accounts = generate(seed, tier, args.accounts, priors).accounts
                    example = api_example(world, accounts,
                                          max(blocked, key=lambda c: c["size"]))
            if scene is None:
                rings = [c for c in world["clusters"] if c["truth"]["label"] == 1]
                if rings:
                    scene = overview_scene(world, max(
                        rings, key=lambda c: c["features"]["total_discount"]))
            name = f"sim_world_{tier}_{seed}"
            path = os.path.join(args.out_dir, f"{name}.json")
            with open(path, "w") as f:
                json.dump(world, f, separators=(",", ":"))
                f.write("\n")
            index.append({
                "file": name,
                "tier": tier,
                "seed": seed,
                "n_accounts": world["n_accounts"],
                "n_edges": world["link"]["n_edges"],
                "n_clusters": world["clustering"]["n_clusters"],
                "summary": world["summary"],
                "bytes": os.path.getsize(path),
            })
            print(f"seed {seed}  {tier:<15} {world['link']['n_edges']:>6,} edges  "
                  f"{world['clustering']['n_clusters']:>4} clusters  "
                  f"{os.path.getsize(path) / 1e6:.1f} MB")

    scene_path = os.path.join(args.out_dir, "overview_scene.json")
    with open(scene_path, "w") as f:
        json.dump(scene, f, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {scene_path}")

    example_path = os.path.join(args.out_dir, "api_example.json")
    with open(example_path, "w") as f:
        json.dump(example, f, indent=1)
        f.write("\n")
    print(f"wrote {example_path}")

    index_path = os.path.join(args.out_dir, "sim_worlds.json")
    with open(index_path, "w") as f:
        json.dump({"seeds": args.seeds,
                   "tiers": args.tiers,
                   "n_accounts": args.accounts,
                   "edge_threshold_bits": clustering.EDGE_THRESHOLD_BITS,
                   "costs_rupees": {
                       "blocked_innocent": config.COST_BLOCKED_INNOCENT,
                       "missed_abuser": config.COST_MISSED_ABUSER,
                       "analyst_review": config.COST_ANALYST_REVIEW},
                   "worlds": index}, f, indent=1)
        f.write("\n")
    print(f"\nwrote {index_path}")


if __name__ == "__main__":
    main()
