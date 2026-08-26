"""Candidate pair generation.

12,000 accounts make 72 million possible pairs. So we only compare accounts
that agree on some coarse key. That is fast, but it sets a ceiling: a true pair
that no rule produces can never be found later. Every run measures that ceiling,
as pair reduction ratio and blocking recall.

    python -m detector.blocking --accounts 12000 --seeds 0-4
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np
import pandas as pd

import config
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import World, generate, load_priors
from detector.resources import announce, apply

WEEK = 7 * 86_400
MONTH = 30 * 86_400

# Several loose rules. Each one finds a different set of pairs. No rule blocks
# on pincode alone, because the busiest pincode holds 2,639 accounts.
BLOCKING_RULES = (
    ("device", ("device_id",)),
    ("address", ("address_id",)),
    ("pin_bin", ("pincode", "card_bin")),
    ("pin_month", ("pincode", "signup_month")),
    ("pin_month_shift", ("pincode", "signup_month_shift")),
    ("bin_week", ("card_bin", "signup_week")),
)


def derive_keys(accounts: pd.DataFrame) -> pd.DataFrame:
    """Coarse columns the rules block on. `signup_month_shift` moves the monthly
    bucket forward by half a month. That catches pairs a month boundary would
    otherwise split.
    """
    return pd.DataFrame({
        "signup_week": accounts["signup_ts"] // WEEK,
        "signup_month": accounts["signup_ts"] // MONTH,
        "signup_month_shift": (accounts["signup_ts"] + MONTH // 2) // MONTH,
    })


def _pairs_from_buckets(indices: dict, max_block: int) -> tuple[np.ndarray, int]:
    """All within-bucket pairs, as a 2-column array of row positions."""
    chunks, skipped = [], 0
    for positions in indices.values():
        k = len(positions)
        if k < 2:
            continue
        if k > max_block:
            skipped += 1
            continue
        i, j = np.triu_indices(k, k=1)
        pos = np.asarray(positions)
        chunks.append(np.column_stack((pos[i], pos[j])))
    if not chunks:
        return np.empty((0, 2), dtype=np.int64), skipped
    return np.vstack(chunks).astype(np.int64), skipped


def candidate_pairs(accounts: pd.DataFrame, rules=BLOCKING_RULES,
                    max_block: int = config.MAX_BLOCK_SIZE
                    ) -> tuple[np.ndarray, dict]:
    """Row-position pairs worth scoring, deduplicated across rules. Also returns
    a count per rule, so you can see how much each rule contributes.
    """
    n = len(accounts)
    keyed = pd.concat([accounts, derive_keys(accounts)], axis=1)

    codes = []
    stats: dict[str, dict] = {}
    for name, cols in rules:
        idx = keyed.groupby(list(cols)).indices
        pairs, skipped = _pairs_from_buckets(idx, max_block)
        # One int64 per pair, so deduplication is a numpy sort, not a set.
        code = pairs[:, 0] * n + pairs[:, 1]
        codes.append(code)
        stats[name] = {"pairs": int(len(code)), "blocks_skipped": int(skipped)}

    if not codes:
        return np.empty((0, 2), dtype=np.int64), {"rules": stats}

    all_codes = np.unique(np.concatenate(codes))
    n_pairs = len(all_codes)
    if n_pairs > config.MAX_CANDIDATE_PAIRS:
        raise RuntimeError(
            f"blocking produced {n_pairs:,} pairs, over the "
            f"{config.MAX_CANDIDATE_PAIRS:,} limit. Tighten the blocking rules "
            f"before running this."
        )

    pairs = np.column_stack((all_codes // n, all_codes % n))
    total_possible = n * (n - 1) // 2
    stats_out = {
        "n_accounts": n,
        "n_candidate_pairs": int(n_pairs),
        "n_possible_pairs": int(total_possible),
        "pair_reduction_ratio": round(1 - n_pairs / total_possible, 6),
        "blocks_skipped": sum(s["blocks_skipped"] for s in stats.values()),
        "rules": stats,
    }
    return pairs, stats_out


def true_pair_codes(world: World) -> np.ndarray:
    """Every pair of accounts that really does share an operator. Only rings
    share one, so a family on one device and one card is not in here.
    """
    n = len(world.truth)
    operator = world.truth["operator_id"].to_numpy()
    groups: dict[str, list[int]] = defaultdict(list)
    for pos, op in enumerate(operator):
        groups[op].append(pos)

    chunks = []
    for positions in groups.values():
        k = len(positions)
        if k < 2:
            continue
        i, j = np.triu_indices(k, k=1)
        pos = np.asarray(sorted(positions))
        chunks.append(pos[i] * n + pos[j])
    if not chunks:
        return np.empty(0, dtype=np.int64)
    return np.unique(np.concatenate(chunks))


def measure(world: World, rules=BLOCKING_RULES) -> dict:
    """Blocking recall and reduction for one world, plus per-rule recall."""
    n = len(world.accounts)
    pairs, stats = candidate_pairs(world.accounts, rules)
    got = pairs[:, 0] * n + pairs[:, 1]
    truth = true_pair_codes(world)

    found = np.intersect1d(got, truth, assume_unique=True)
    stats["n_true_pairs"] = int(len(truth))
    stats["n_true_pairs_found"] = int(len(found))
    stats["blocking_recall"] = (round(len(found) / len(truth), 6)
                                if len(truth) else 0.0)

    # What each rule finds on its own. A rule that finds nothing can be dropped.
    keyed = pd.concat([world.accounts, derive_keys(world.accounts)], axis=1)
    for name, cols in rules:
        idx = keyed.groupby(list(cols)).indices
        rp, _ = _pairs_from_buckets(idx, config.MAX_BLOCK_SIZE)
        rc = np.unique(rp[:, 0] * n + rp[:, 1]) if len(rp) else np.empty(0, np.int64)
        hit = np.intersect1d(rc, truth, assume_unique=True)
        stats["rules"][name]["recall_alone"] = (round(len(hit) / len(truth), 6)
                                                if len(truth) else 0.0)
    return stats


def run(seeds: list[int], n_accounts: int, tiers=None) -> dict:
    priors = load_priors()
    out = {
        "n_seeds": len(seeds),
        "seed_range": [seeds[0], seeds[-1]],
        "n_accounts_per_world": n_accounts,
        "rules": [name for name, _ in BLOCKING_RULES],
        "max_block_size": config.MAX_BLOCK_SIZE,
        "tiers": {},
    }
    for tier in (tiers or config.TIER_NAMES):
        rows = [measure(generate(seed, tier, n_accounts, priors)) for seed in seeds]
        per_rule = {name: round(float(np.mean([r["rules"][name]["recall_alone"]
                                               for r in rows])), 4)
                    for name, _ in BLOCKING_RULES}
        out["tiers"][tier] = {
            "blocking_recall": round(float(np.mean([r["blocking_recall"]
                                                    for r in rows])), 4),
            "recall_min": round(float(np.min([r["blocking_recall"] for r in rows])), 4),
            "pair_reduction_ratio": round(float(np.mean(
                [r["pair_reduction_ratio"] for r in rows])), 6),
            "candidate_pairs_mean": int(np.mean([r["n_candidate_pairs"]
                                                 for r in rows])),
            "true_pairs_mean": int(np.mean([r["n_true_pairs"] for r in rows])),
            "blocks_skipped_mean": round(float(np.mean(
                [r["blocks_skipped"] for r in rows])), 1),
            "recall_by_rule": per_rule,
        }
    return out


def print_report(report: dict) -> None:
    print(f"\nBlocking, {report['n_accounts_per_world']:,} accounts per world, "
          f"seeds {report['seed_range'][0]}-{report['seed_range'][1]} "
          f"({report['n_seeds']} worlds per tier)")
    print(f"rules: {', '.join(report['rules'])}, blocks over "
          f"{report['max_block_size']} members skipped\n")
    head = (f"{'tier':<15} {'recall':<9} {'worst':<9} {'reduction':<11} "
            f"{'candidate pairs':<17} {'true pairs':<11} {'blocks skipped'}")
    print(head)
    print("-" * len(head))
    for tier, t in report["tiers"].items():
        print(f"{tier:<15} {t['blocking_recall']:<9.4f} {t['recall_min']:<9.4f} "
              f"{t['pair_reduction_ratio']:<11.5f} "
              f"{t['candidate_pairs_mean']:<17,} {t['true_pairs_mean']:<11,} "
              f"{t['blocks_skipped_mean']}")

    print("\nrecall each rule reaches on its own")
    names = report["rules"]
    print(f"{'tier':<15} " + " ".join(f"{n:<16}" for n in names))
    for tier, t in report["tiers"].items():
        print(f"{tier:<15} " + " ".join(f"{t['recall_by_rule'][n]:<16.4f}"
                                        for n in names))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--out", default=None)
    args = p.parse_args()

    announce(apply())
    report = run(parse_seeds(args.seeds), args.accounts)
    print_report(report)
    if args.out:
        with open(args.out, "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
