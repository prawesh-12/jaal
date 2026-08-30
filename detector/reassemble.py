"""A second pass that tries to put a split ring back together.

Weak edges break one ring into several clusters, and each is then judged alone
with no memory that the others exist. The worst case measured was eleven ring
clusters in a world holding at most five rings.

This tries to undo that. Two clusters are candidates for merging when they sit
in the same pincode and their signups overlap in time. A merge is only accepted
if the model's predicted purity for the joined cluster is at least the
size-weighted purity of its parts, so the pass can never build a diluted cluster
that then gets blocked.

Off by default. Turn it on with --reassemble to measure it.

    python -m detector.reassemble --seeds 700-799
"""

from __future__ import annotations

import argparse
import gzip
import json
import pickle

import numpy as np
import pandas as pd

import config
from detector import cluster as clustering
from detector import decide, features, link
from detector.blocking import candidate_pairs
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import generate, load_priors
from detector.resources import announce, apply

MERGE_WINDOW_DAYS = 30.0    # how far apart two signup windows may sit
MERGE_MAX_SIZE = 200        # never build something larger than this
DAY = 86_400


def cluster_shape(accounts: pd.DataFrame, members: list[int]) -> dict:
    block = accounts.iloc[members]
    return {"pincode": block["pincode"].mode().iloc[0],
            "first": int(block["signup_ts"].min()),
            "last": int(block["signup_ts"].max())}


def candidate_merges(accounts: pd.DataFrame, clusters: list[list[int]],
                     window_days: float = MERGE_WINDOW_DAYS) -> list[tuple[int, int]]:
    shapes = [cluster_shape(accounts, c) for c in clusters]
    by_pincode: dict[str, list[int]] = {}
    for i, s in enumerate(shapes):
        by_pincode.setdefault(s["pincode"], []).append(i)

    gap = window_days * DAY
    out = []
    for members in by_pincode.values():
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                i, j = members[a], members[b]
                si, sj = shapes[i], shapes[j]
                if si["first"] - sj["last"] <= gap and sj["first"] - si["last"] <= gap:
                    out.append((i, j))
    return out


def _purity_of(accounts, graph, members, model) -> tuple[float, dict]:
    sub = graph.subgraph(members)
    contrib = (np.asarray(sub.es["contributions"], dtype=float)
               if sub.ecount() and "contributions" in graph.es.attributes()
               else None)
    f = features.cluster_features(accounts, graph, sorted(members), contrib)
    row = pd.DataFrame([{k: f[k] for k in model["features"]}])
    return float(np.clip(model["purity"].predict(row)[0], 0.0, 1.0)), f


def reassemble(accounts: pd.DataFrame, graph, clusters: list[list[int]],
               model: dict, window_days: float = MERGE_WINDOW_DAYS
               ) -> tuple[list[list[int]], dict]:
    if len(clusters) < 2:
        return clusters, {"proposed": 0, "accepted": 0, "rejected_purity": 0,
                          "rejected_size": 0}

    current = {i: list(c) for i, c in enumerate(clusters)}
    purity = {i: _purity_of(accounts, graph, c, model)[0]
              for i, c in current.items()}

    stats = {"proposed": 0, "accepted": 0, "rejected_purity": 0,
             "rejected_size": 0}
    parent = {i: i for i in current}

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in candidate_merges(accounts, clusters, window_days):
        ri, rj = root(i), root(j)
        if ri == rj:
            continue
        stats["proposed"] += 1
        merged = current[ri] + current[rj]
        if len(merged) > MERGE_MAX_SIZE:
            stats["rejected_size"] += 1
            continue

        joined, _ = _purity_of(accounts, graph, merged, model)
        # The parts, weighted by how many accounts each brings.
        wa, wb = len(current[ri]), len(current[rj])
        expected = (purity[ri] * wa + purity[rj] * wb) / (wa + wb)
        if joined + 1e-9 < expected:
            stats["rejected_purity"] += 1
            continue

        parent[rj] = ri
        current[ri] = sorted(merged)
        purity[ri] = joined
        del current[rj]
        stats["accepted"] += 1

    return [current[k] for k in sorted(current)], stats


def score_world(seed: int, tier: str, n_accounts: int, priors: dict,
                link_params: dict, model: dict, merge: bool) -> dict:
    world = generate(seed, tier, n_accounts, priors)
    pairs, _ = candidate_pairs(world.accounts)
    bits, contributions = link.score_pairs(world.accounts, pairs, link_params)
    graph = clustering.build_graph(pairs, bits, len(world.accounts))
    graph.es["contributions"] = contributions[
        bits >= clustering.EDGE_THRESHOLD_BITS].tolist()
    groups, _ = clustering.filter_by_size(clustering.leiden_clusters(graph))

    stats = {"proposed": 0, "accepted": 0, "rejected_purity": 0,
             "rejected_size": 0}
    if merge:
        groups, stats = reassemble(world.accounts, graph, groups, model)

    rows = []
    for members in groups:
        sub = graph.subgraph(members)
        contrib = (np.asarray(sub.es["contributions"], dtype=float)
                   if sub.ecount() else None)
        rows.append({**features.cluster_features(world.accounts, graph, members,
                                                 contrib),
                     **features.label_cluster(world.truth, members),
                     "seed": seed, "tier": tier,
                     "world_accounts": len(world.accounts),
                     "world_ring_accounts": int(world.truth["is_ring"].sum())})
    del world
    return {"rows": rows, "merge_stats": stats}


def run(seeds: list[int], n_accounts: int, tiers=None) -> dict:
    priors = load_priors()
    with open("results/link_params.json") as f:
        link_params = json.load(f)
    with gzip.open("results/model.pkl", "rb") as f:
        model = pickle.load(f)

    out = {"seeds": [seeds[0], seeds[-1]], "n_worlds": 0,
           "merge_window_days": MERGE_WINDOW_DAYS, "arms": {}}

    for merge in (False, True):
        rows, stats = [], {"proposed": 0, "accepted": 0,
                           "rejected_purity": 0, "rejected_size": 0}
        for tier in (tiers or config.TIER_NAMES):
            for seed in seeds:
                r = score_world(seed, tier, n_accounts, priors, link_params,
                                model, merge)
                rows.extend(r["rows"])
                for k in stats:
                    stats[k] += r["merge_stats"][k]

        table = pd.DataFrame(rows)
        X = table[model["features"]]
        purity = np.clip(model["purity"].predict(X), 0.0, 1.0)
        actions = decide.best_action(purity, table["size"].to_numpy())
        result = decide.score_policy(table, actions)
        result["n_clusters"] = len(table)
        result["merge_stats"] = stats
        out["arms"]["reassembled" if merge else "as_is"] = result
        out["n_worlds"] = int(table.groupby(["tier", "seed"]).ngroups)

    a, b = out["arms"]["as_is"], out["arms"]["reassembled"]
    out["delta_net_rupees"] = b["net_vs_nothing_rupees"] - a["net_vs_nothing_rupees"]
    out["improves"] = bool(out["delta_net_rupees"] > 0)
    return out


def print_report(r: dict) -> None:
    a, b = r["arms"]["as_is"], r["arms"]["reassembled"]
    print(f"\nRing reassembly, seeds {r['seeds'][0]}-{r['seeds'][1]}, "
          f"{r['n_worlds']} worlds, merge window {r['merge_window_days']:.0f} days\n")
    print(f"{'':<22}{'as is':>18}{'reassembled':>18}")
    print("-" * 58)
    for label, key in (("clusters", "n_clusters"),
                       ("accounts blocked", "accounts_blocked"),
                       ("accounts reviewed", "accounts_reviewed"),
                       ("true positives", "tp"), ("false positives", "fp"),
                       ("recall", "recall"),
                       ("recall incl review", "recall_including_review")):
        fa, fb = a[key], b[key]
        fmt = (lambda v: f"{v:.4f}") if isinstance(fa, float) else (lambda v: f"{v:,}")
        print(f"{label:<22}{fmt(fa):>18}{fmt(fb):>18}")
    print(f"{'precision':<22}{decide.format_precision(a['precision']):>18}"
          f"{decide.format_precision(b['precision']):>18}")
    print(f"{'net vs nothing':<22}{'Rs.' + format(a['net_vs_nothing_rupees'], ','):>18}"
          f"{'Rs.' + format(b['net_vs_nothing_rupees'], ','):>18}")

    s = b["merge_stats"]
    print(f"\nmerges proposed {s['proposed']:,}, accepted {s['accepted']:,}, "
          f"rejected on purity {s['rejected_purity']:,}, "
          f"rejected on size {s['rejected_size']:,}")
    verdict = "improves" if r["improves"] else "does not improve"
    print(f"\nreassembly {verdict} net saving, by "
          f"Rs.{abs(r['delta_net_rupees']):,}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    add_common_args(ap)
    ap.add_argument("--out", default="results/reassembly.json")
    args = ap.parse_args()

    announce(apply())
    seeds = parse_seeds(args.seeds)
    if max(seeds) >= min(config.HOLDOUT_SEEDS):
        raise SystemExit("this is a tuning experiment, not a holdout run")

    report = run(seeds, args.accounts)
    print_report(report)
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
