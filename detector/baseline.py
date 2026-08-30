"""The rules-only detector that the model has to beat.

Deliberately dumb. It links accounts that share an identifier exactly, groups
them with union-find, and scores each group with five hand-written rules. No
probabilities, no learning, no tuning.

This exists so there is something to compare against. Without it there is no
way to tell whether the machine learning helped.

    python -m detector.baseline --accounts 12000 --seeds 700-899
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np
import pandas as pd

import config
from detector import costs
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import World, generate, load_priors
from detector.resources import announce, apply

# Fields an analyst would actually link on. Three are left out on purpose.
# A card BIN identifies an issuer and a pincode identifies an area, so neither
# says anything about a person. ip_prefix is a /24 network: on seed 700 one
# prefix covered 694 accounts, and union-find chained those buckets through
# shared devices into one component of 5,754 accounts holding every ring in the
# world. That component scores 0.3, so nothing is flagged.
# Transitive closure cannot express a weak edge. It merges completely or not
# at all.
LINK_FIELDS = ("device_id", "address_id")

MIN_GROUP_SIZE = 3
NEAR_COUPON_BAND = 200      # rupees above the floor that still counts as "near"
FLAG_THRESHOLD = 0.50       # rule score at or above this gets blocked


class UnionFind:

    def __init__(self, items):
        self.parent = {x: x for x in items}

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]   # path compression
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb

    def groups(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = defaultdict(list)
        for x in self.parent:
            out[self.find(x)].append(x)
        return out


def exact_match_groups(accounts: pd.DataFrame,
                       fields=LINK_FIELDS,
                       min_size: int = MIN_GROUP_SIZE
                       ) -> tuple[list[list[int]], int]:
    """Group accounts that share an identifier exactly.

    Returns row positions, not account ids, so feature extraction stays cheap.
    Buckets above config.MAX_BLOCK_SIZE are skipped and counted: a single ISP
    prefix can cover hundreds of unrelated customers, and merging all of them
    produces one meaningless blob rather than a finding.
    """
    n = len(accounts)
    uf = UnionFind(range(n))
    skipped = 0

    for field in fields:
        for _value, positions in sorted(accounts.groupby(field).indices.items()):
            if len(positions) < 2:
                continue
            if len(positions) > config.MAX_BLOCK_SIZE:
                skipped += 1
                continue
            first = int(positions[0])
            for p in positions[1:]:
                uf.union(first, int(p))

    groups = [sorted(members) for members in uf.groups().values()
              if len(members) >= min_size]
    groups.sort(key=lambda g: g[0])          # deterministic order
    return groups, skipped


def cluster_features(accounts: pd.DataFrame, rows: list[int]) -> dict:
    block = accounts.iloc[rows]
    first = block["first_order_value"].to_numpy()
    span = (block["signup_ts"].max() - block["signup_ts"].min()) / 86_400
    mean_value = float(first.mean())
    near = ((first >= config.COUPON_MIN_ORDER)
            & (first < config.COUPON_MIN_ORDER + NEAR_COUPON_BAND))
    return {
        "size": len(rows),
        "coupon_rate": float(block["coupon_used"].mean()),
        "repeat_rate": float((block["n_orders"] > 1).mean()),
        "signup_span_days": float(span),
        "near_coupon_min": float(near.mean()),
        "value_spread": float(first.std() / mean_value) if mean_value else 0.0,
    }


def rule_score(f: dict) -> float:
    """Five rules, weights summing to 1.0. Meant to be beaten, not tuned."""
    s = 0.0
    if f["coupon_rate"] > 0.90:
        s += 0.30
    if f["repeat_rate"] < 0.10:
        s += 0.30
    if f["signup_span_days"] < 3.0:
        s += 0.20
    if f["near_coupon_min"] > 0.70:
        s += 0.15
    if f["value_spread"] < 0.20:
        s += 0.05
    return min(s, 1.0)


def score_world(world: World, threshold: float = FLAG_THRESHOLD) -> dict:
    groups, skipped = exact_match_groups(world.accounts)
    is_ring = world.truth["is_ring"].to_numpy()
    group_type = world.truth["group_type"].to_numpy()

    flagged_rows: list[int] = []
    n_flagged_groups = 0
    for rows in groups:
        if rule_score(cluster_features(world.accounts, rows)) >= threshold:
            n_flagged_groups += 1
            flagged_rows.extend(rows)

    flagged = np.zeros(len(world.accounts), dtype=bool)
    flagged[flagged_rows] = True

    tp = int((flagged & is_ring).sum())
    fp = int((flagged & ~is_ring).sum())
    n_ring = int(is_ring.sum())

    fp_by_kind: dict[str, int] = defaultdict(int)
    for kind in group_type[flagged & ~is_ring]:
        fp_by_kind[str(kind)] += 1

    return {
        "seed": world.seed,
        "tier": world.tier,
        "n_accounts": len(world.accounts),
        "n_ring_accounts": n_ring,
        "n_groups": len(groups),
        "n_flagged_groups": n_flagged_groups,
        "skipped_buckets": skipped,
        "tp": tp,
        "fp": fp,
        "missed": n_ring - tp,
        "fp_by_kind": dict(fp_by_kind),
    }


def aggregate(rows: list[dict]) -> dict:
    """Micro-average over worlds: sum the counts, then compute the rates.

    Averaging per-world precision would let a world with three flagged accounts
    weigh as much as one with three hundred.
    """
    tp = sum(r["tp"] for r in rows)
    fp = sum(r["fp"] for r in rows)
    missed = sum(r["missed"] for r in rows)
    n_ring = sum(r["n_ring_accounts"] for r in rows)
    n_acc = sum(r["n_accounts"] for r in rows)
    flagged = tp + fp

    fp_by_kind: dict[str, int] = defaultdict(int)
    for r in rows:
        for kind, c in r["fp_by_kind"].items():
            fp_by_kind[kind] += c

    money = costs.summarise(n_abusers=n_ring, n_innocents=n_acc - n_ring,
                            n_missed=missed, n_blocked_innocents=fp)
    return {
        "n_worlds": len(rows),
        "n_accounts": n_acc,
        "n_ring_accounts": n_ring,
        "prevalence": round(n_ring / n_acc, 5),
        "groups_found": sum(r["n_groups"] for r in rows),
        "groups_flagged": sum(r["n_flagged_groups"] for r in rows),
        "skipped_buckets": sum(r["skipped_buckets"] for r in rows),
        "accounts_flagged": flagged,
        "tp": tp, "fp": fp, "missed": missed,
        "precision": round(tp / flagged, 4) if flagged else 0.0,
        "recall": round(tp / n_ring, 4) if n_ring else 0.0,
        "fp_by_kind": dict(sorted(fp_by_kind.items())),
        **money,
    }


def run(seeds: list[int], n_accounts: int, threshold: float = FLAG_THRESHOLD,
        tiers=None) -> dict:
    priors = load_priors()
    out = {
        "threshold": threshold,
        "link_fields": list(LINK_FIELDS),
        "min_group_size": MIN_GROUP_SIZE,
        "n_seeds": len(seeds),
        "seed_range": [seeds[0], seeds[-1]],
        "n_accounts_per_world": n_accounts,
        "breakeven_precision": round(costs.breakeven_precision(), 4),
        "tiers": {},
    }
    for tier in (tiers or config.TIER_NAMES):
        rows = []
        for seed in seeds:
            world = generate(seed, tier, n_accounts, priors)
            rows.append(score_world(world, threshold))
            del world                      # one world at a time
        out["tiers"][tier] = aggregate(rows)
    return out


def print_report(report: dict) -> None:
    print(f"\nRules baseline, {report['n_accounts_per_world']:,} accounts per "
          f"world, seeds {report['seed_range'][0]}-{report['seed_range'][1]} "
          f"({report['n_seeds']} worlds per tier)")
    print(f"linked on {', '.join(report['link_fields'])}, groups of "
          f"{report['min_group_size']}+, flagged at rule score "
          f">= {report['threshold']}")
    print(f"blocking pays only above {report['breakeven_precision']:.1%} precision\n")

    head = (f"{'tier':<15} {'prev':<7} {'groups':<8} {'flagged':<8} "
            f"{'prec':<9} {'recall':<9} {'FP accts':<10} {'net vs nothing'}")
    print(head)
    print("-" * len(head))
    for tier, t in report["tiers"].items():
        net = t["net_vs_nothing_rupees"]
        sign = "+" if net >= 0 else "-"
        print(f"{tier:<15} {t['prevalence'] * 100:<7.2f} {t['groups_found']:<8} "
              f"{t['groups_flagged']:<8} {t['precision']:<9.4f} "
              f"{t['recall']:<9.4f} {t['fp']:<10} "
              f"{sign}Rs.{abs(net):,}")

    print("\nfalse positives by group type")
    for tier, t in report["tiers"].items():
        kinds = t["fp_by_kind"] or {"none": 0}
        detail = ", ".join(f"{k} {v}" for k, v in kinds.items())
        print(f"  {tier:<15} {detail}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--threshold", type=float, default=FLAG_THRESHOLD)
    p.add_argument("--out", default=None,
                   help="write the report as JSON, e.g. results/baseline.json")
    args = p.parse_args()

    announce(apply())
    report = run(parse_seeds(args.seeds), args.accounts, args.threshold)
    print_report(report)

    if args.out:
        with open(args.out, "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
