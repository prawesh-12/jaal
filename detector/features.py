"""Turn one cluster into a row of numbers.

Real families share more than rings do: one real card, one address, years of
orders. A ring shares a device by accident and fakes the rest, so the separator
is whether the behaviour persists, not how much the group shares.
Nothing here may read the answer key, and tests/test_features.py checks that.
"""

from __future__ import annotations

import argparse
import json
import math

import igraph as ig
import numpy as np
import pandas as pd

import config
from detector import cluster, link
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import World, generate, load_priors
from detector.resources import announce, apply

NEAR_MIN_BAND = 100      # rupees above the coupon floor that count as "near"
HOUR = 3_600
DAY = 86_400

FEATURE_NAMES = (
    # structural, from the evidence graph
    "size", "edge_density", "mean_edge_bits", "min_edge_bits",
    "weight_spread", "diameter", "degree_gini",
    # how much of the cluster's evidence comes from one kind of agreement
    "top_signal_share",
    # temporal
    "signup_span_days", "signup_burstiness", "hour_concentration",
    "median_gap_minutes", "lifespan_days",
    # behavioural
    "coupon_rate", "repeat_rate", "near_min_rate", "value_cv",
    "distinct_bin_ratio", "bin_concentration",
    "distinct_device_ratio", "distinct_address_ratio", "pincode_concentration",
    # economic
    "total_discount", "discount_per_account", "discount_to_revenue",
)


def _gini(x: np.ndarray) -> float:
    """Concentration of a non-negative vector. 0 is flat, 1 is one dominant value."""
    if len(x) < 2 or x.sum() == 0:
        return 0.0
    s = np.sort(x.astype(float))
    n = len(s)
    return float((2 * np.arange(1, n + 1) - n - 1).dot(s) / (n * s.sum()))


def _entropy_of_hours(ts: np.ndarray) -> float:
    """Normalised entropy of signup hour-of-day. Low means machine-like."""
    hours = (ts // HOUR) % 24
    counts = np.bincount(hours, minlength=24).astype(float)
    p = counts / counts.sum()
    p = p[p > 0]
    return float(-(p * np.log(p)).sum() / math.log(24))


def _burstiness(ts: np.ndarray) -> float:
    """Largest share of the cluster that signed up inside any one hour window."""
    s = np.sort(ts)
    if len(s) < 2:
        return 1.0
    right = np.searchsorted(s, s + HOUR, side="right")
    return float((right - np.arange(len(s))).max() / len(s))


def structural(graph: ig.Graph, rows: list[int], contributions: np.ndarray | None,
               ) -> dict:
    sub = graph.subgraph(rows)
    weights = np.asarray(sub.es["weight"], dtype=float) if sub.ecount() else np.zeros(1)
    n = len(rows)
    possible = n * (n - 1) / 2
    degrees = np.asarray(sub.degree(), dtype=float)

    top_share = 0.0
    if contributions is not None and sub.ecount():
        per_field = np.abs(np.asarray(contributions)).sum(axis=0)
        if per_field.sum() > 0:
            top_share = float(per_field.max() / per_field.sum())

    return {
        "size": n,
        "edge_density": float(sub.ecount() / possible) if possible else 0.0,
        "mean_edge_bits": float(weights.mean()),
        "min_edge_bits": float(weights.min()),
        "weight_spread": float(weights.std()),
        # Rings hang off one shared asset, so they are star shaped and shallow.
        "diameter": float(sub.diameter(unconn=False)) if sub.ecount() else -1.0,
        "degree_gini": _gini(degrees),
        "top_signal_share": top_share,
    }


def temporal(block: pd.DataFrame) -> dict:
    ts = block["signup_ts"].to_numpy()
    gaps = np.diff(np.sort(ts))
    second = block["days_to_second_order"].to_numpy()
    return {
        "signup_span_days": float((ts.max() - ts.min()) / DAY),
        "signup_burstiness": _burstiness(ts),
        "hour_concentration": 1.0 - _entropy_of_hours(ts),
        "median_gap_minutes": float(np.median(gaps) / 60) if len(gaps) else 0.0,
        "lifespan_days": float(second.max()) if (second > 0).any() else 0.0,
    }


def behavioural(block: pd.DataFrame) -> dict:
    n = len(block)
    values = block["first_order_value"].to_numpy()
    bins = block["card_bin"].value_counts()
    pins = block["pincode"].value_counts()
    mean_value = float(values.mean())
    near = ((values >= config.COUPON_MIN_ORDER)
            & (values < config.COUPON_MIN_ORDER + NEAR_MIN_BAND))
    return {
        "coupon_rate": float(block["coupon_used"].mean()),
        # The strongest single feature. Camouflaged rings aim at it.
        "repeat_rate": float((block["n_orders"] > 1).mean()),
        "near_min_rate": float(near.mean()),
        "value_cv": float(values.std() / mean_value) if mean_value else 0.0,
        "distinct_bin_ratio": float(len(bins) / n),
        "bin_concentration": float(bins.iloc[0] / n),
        "distinct_device_ratio": float(block["device_id"].nunique() / n),
        "distinct_address_ratio": float(block["address_id"].nunique() / n),
        "pincode_concentration": float(pins.iloc[0] / n),
    }


def economic(block: pd.DataFrame) -> dict:
    """Rupees. This is what the decision step uses to price a cluster.

    A cluster extracting Rs.400 is noise. One extracting Rs.40,000 is the target.
    """
    n = len(block)
    discount = int(block["coupon_used"].sum()) * config.COUPON_VALUE
    revenue = int(block["total_order_value"].sum())
    return {
        "total_discount": float(discount),
        "discount_per_account": float(discount / n),
        "discount_to_revenue": float(discount / revenue) if revenue else 0.0,
    }


def cluster_features(accounts: pd.DataFrame, graph: ig.Graph, rows: list[int],
                     contributions: np.ndarray | None = None) -> dict:
    block = accounts.iloc[rows]
    f = {}
    f.update(structural(graph, rows, contributions))
    f.update(temporal(block))
    f.update(behavioural(block))
    f.update(economic(block))
    return {k: f[k] for k in FEATURE_NAMES}


def dominant_signal(graph: ig.Graph, rows: list[int]) -> str:
    """Which comparison carried most weight here. Feeds the review note."""
    sub = graph.subgraph(rows)
    if not sub.ecount() or "contributions" not in graph.es.attributes():
        return "unknown"
    per_field = np.abs(np.asarray(sub.es["contributions"], dtype=float)).sum(axis=0)
    return link.SCORED_COMPARISONS[int(per_field.argmax())]


def label_cluster(truth: pd.DataFrame, rows: list[int]) -> dict:
    """Ground truth for one cluster. Evaluation only, never a feature.

    Ring when most of its accounts are ring accounts. Per-account counts come
    too, because the cost model prices innocent accounts one by one.
    """
    block = truth.iloc[rows]
    n_ring = int(block["is_ring"].sum())
    kinds = block.loc[~block["is_ring"], "group_type"]
    return {
        "label": int(n_ring / len(rows) >= 0.5),
        "n_ring_members": n_ring,
        "n_innocent_members": len(rows) - n_ring,
        "ring_purity": round(n_ring / len(rows), 4),
        "dominant_benign_kind": (kinds.mode().iloc[0] if len(kinds) else ""),
    }


def world_rows(world: World, params: dict) -> list[dict]:
    clusters, graph, contributions = cluster.cluster_world(world, params)
    keep = np.asarray(graph.es["weight"]) >= 0
    del keep

    # Ring accounts in no cluster still cost money, so carry the world totals.
    world_ring_accounts = int(world.truth["is_ring"].sum())
    world_accounts = len(world.accounts)

    rows = []
    for cid, members in enumerate(clusters):
        sub_contrib = None
        if "contributions" in graph.es.attributes():
            sub = graph.subgraph(members)
            if sub.ecount():
                sub_contrib = np.asarray(sub.es["contributions"], dtype=float)
        f = cluster_features(world.accounts, graph, members, sub_contrib)
        rows.append({
            "seed": world.seed, "tier": world.tier, "cluster_id": cid,
            "world_accounts": world_accounts,
            "world_ring_accounts": world_ring_accounts,
            **f,
            "dominant_signal": dominant_signal(graph, members),
            **label_cluster(world.truth, members),
        })
    return rows


def build_table(seeds, tiers, n_accounts: int, params: dict,
                verbose: bool = True) -> pd.DataFrame:
    """One world at a time. Never hold 400 of them in memory at once."""
    priors = load_priors()
    rows: list[dict] = []
    for tier in tiers:
        for i, seed in enumerate(seeds):
            world = generate(seed, tier, n_accounts, priors)
            rows.extend(world_rows(world, params))
            del world
            if verbose and (i + 1) % 25 == 0:
                print(f"  {tier}: {i + 1}/{len(seeds)} worlds, "
                      f"{len(rows):,} clusters so far")
    return pd.DataFrame(rows)


def audit(table: pd.DataFrame, leak_limit: float = 0.95,
          redundancy_limit: float = 0.90) -> dict:
    """Leakage and redundancy check.

    A feature that correlates above 0.95 with the label is encoding the answer.
    That is a leak, not a good feature.
    """
    import inspect

    # Only feature functions are audited. label_cluster is meant to read truth.
    feature_source = "\n".join(
        inspect.getsource(fn) for fn in
        (structural, temporal, behavioural, economic, cluster_features,
         dominant_signal, _gini, _entropy_of_hours, _burstiness))
    forbidden = [name for name in ("is_ring", "operator_id", "group_id",
                                   "group_type", "truth", "label")
                 if name in feature_source]

    X = table[list(FEATURE_NAMES)]
    with np.errstate(invalid="ignore"):
        label_corr = {c: float(abs(np.corrcoef(X[c], table["label"])[0, 1]))
                      for c in FEATURE_NAMES}
    label_corr = {k: (0.0 if math.isnan(v) else round(v, 4))
                  for k, v in sorted(label_corr.items(),
                                     key=lambda kv: -kv[1])}

    corr = X.corr().to_numpy()
    redundant = []
    for i in range(len(FEATURE_NAMES)):
        for j in range(i + 1, len(FEATURE_NAMES)):
            if abs(corr[i, j]) > redundancy_limit and not math.isnan(corr[i, j]):
                redundant.append([FEATURE_NAMES[i], FEATURE_NAMES[j],
                                  round(float(corr[i, j]), 4)])

    leaks = [k for k, v in label_corr.items() if v > leak_limit]
    return {
        "n_clusters": len(table),
        "n_features": len(FEATURE_NAMES),
        "label_rate": round(float(table["label"].mean()), 5),
        "forbidden_columns_referenced": forbidden,
        "correlation_with_label": label_corr,
        "leaks": leaks,
        "redundant_pairs": redundant,
        "leak_limit": leak_limit,
        "redundancy_limit": redundancy_limit,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--params", default="results/link_params.json")
    p.add_argument("--out", default="results/features.csv")
    p.add_argument("--audit", default=None,
                   help="audit an existing feature CSV instead of building one")
    args = p.parse_args()

    announce(apply())
    if args.audit:
        table = pd.read_csv(args.audit)
        report = audit(table)
        print(f"\nleakage and redundancy audit, {report['n_clusters']:,} "
              f"clusters, {report['n_features']} features")
        print(f"cluster level label rate {report['label_rate']:.4f}\n")
        print("correlation with the label, strongest first")
        for k, v in report["correlation_with_label"].items():
            flag = "  LEAK" if v > report["leak_limit"] else ""
            print(f"  {k:<24} {v:>7.4f}{flag}")
        print(f"\nleaks (> {report['leak_limit']}): "
              f"{report['leaks'] or 'none'}")
        print(f"forbidden columns referenced by feature code: "
              f"{report['forbidden_columns_referenced'] or 'none'}")
        print(f"\nredundant pairs (|r| > {report['redundancy_limit']}):")
        for a, b, r in report["redundant_pairs"] or []:
            print(f"  {a:<24} {b:<24} {r:>7.4f}")
        if not report["redundant_pairs"]:
            print("  none")
        with open("results/feature_audit.json", "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print("\nwrote results/feature_audit.json")
        return

    with open(args.params) as f:
        params = json.load(f)
    seeds = parse_seeds(args.seeds)

    print(f"building the feature table, seeds {seeds[0]}-{seeds[-1]}, "
          f"{args.accounts:,} accounts per world")
    table = build_table(seeds, config.TIER_NAMES, args.accounts, params)
    table.to_csv(args.out, index=False)

    print(f"\n{len(table):,} clusters, {len(FEATURE_NAMES)} features")
    print(f"positives: {int(table['label'].sum()):,} "
          f"({table['label'].mean():.2%} of clusters)")
    print("\nby tier:")
    for tier, block in table.groupby("tier", sort=False):
        print(f"  {tier:<15} {len(block):>7,} clusters, "
              f"{int(block['label'].sum()):>5} labelled ring "
              f"({block['label'].mean():.2%})")
    print("\nring clusters against benign clusters, medians:")
    for col in ("repeat_rate", "coupon_rate", "signup_span_days",
                "near_min_rate", "hour_concentration", "total_discount"):
        a = table.loc[table["label"] == 1, col].median()
        b = table.loc[table["label"] == 0, col].median()
        print(f"  {col:<22} ring {a:>10.3f}   benign {b:>10.3f}")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
