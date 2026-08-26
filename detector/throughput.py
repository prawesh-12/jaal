"""How long one batch takes, stage by stage.

Everything else in results/ answers whether the detector is any good. This
answers whether it can be run, which is a different question and the first one
an operator asks. It scans a batch at several sizes and records where the
milliseconds go.

Explanations are off. They are cached lookups, not computation, and including
them would say more about the cache than about the pipeline.

    python -m detector.throughput --sizes 3000,6000,12000
"""

from __future__ import annotations

import argparse
import json
import time

import config
from detector.generate_accounts import generate, load_priors
from detector.pipeline import Detector
from detector.resources import announce, apply

STAGES = ("block_ms", "link_ms", "cluster_ms", "features_ms", "score_ms")


def measure(detector: Detector, n_accounts: int, seed: int, tier: str,
            priors, repeats: int) -> dict:
    """One batch, scanned `repeats` times. The best run is the one reported,
    because the slower ones are measuring whatever else the machine was doing.
    """
    world = generate(seed, tier, n_accounts, priors)
    runs = []
    for _ in range(repeats):
        result = detector.scan(world.accounts, explain_notes=False)
        runs.append(result)
    best = min(runs, key=lambda r: r["timings_ms"]["total_ms"])
    t = best["timings_ms"]

    return {
        "n_accounts": n_accounts,
        "n_clusters": best["n_clusters"],
        "candidate_pairs": best["blocking"]["n_candidate_pairs"],
        "possible_pairs": best["blocking"]["n_possible_pairs"],
        "timings_ms": {k: t[k] for k in STAGES if k in t},
        "total_ms": t["total_ms"],
        "accounts_per_second": round(n_accounts / (t["total_ms"] / 1000), 1),
        "repeats": repeats,
    }


def run(sizes: list[int], seed: int, tier: str, repeats: int) -> dict:
    priors = load_priors()
    detector = Detector.load()
    rows = [measure(detector, n, seed, tier, priors, repeats) for n in sizes]

    # How the cost grows with the batch. Two points are enough to say whether
    # it is closer to linear or to quadratic, which is the thing that decides
    # whether a big merchant has to be sliced.
    growth = None
    if len(rows) >= 2:
        a, b = rows[0], rows[-1]
        size_ratio = b["n_accounts"] / a["n_accounts"]
        time_ratio = b["total_ms"] / a["total_ms"]
        growth = {
            "from_accounts": a["n_accounts"],
            "to_accounts": b["n_accounts"],
            "size_ratio": round(size_ratio, 2),
            "time_ratio": round(time_ratio, 2),
            # log base size_ratio of time_ratio: 1.0 is linear, 2.0 is quadratic.
            "exponent": round(
                __import__("math").log(time_ratio) / __import__("math").log(size_ratio), 2),
        }

    return {
        "tier": tier,
        "seed": seed,
        "repeats": repeats,
        "explanations": "off, they are cached lookups rather than computation",
        "sizes": rows,
        "growth": growth,
    }


def print_report(report: dict) -> None:
    print(f"\nOne batch, scanned {report['repeats']} times at each size, "
          f"{report['tier']} tier, seed {report['seed']}")
    print("Best run reported. Explanations off.\n")
    head = (f"{'accounts':<10} {'block':<9} {'link':<9} {'cluster':<9} "
            f"{'features':<10} {'score':<9} {'total':<10} {'accounts/s'}")
    print(head)
    print("-" * len(head))
    for r in report["sizes"]:
        t = r["timings_ms"]
        print(f"{r['n_accounts']:<10,} {t.get('block_ms', 0):<9.1f} "
              f"{t.get('link_ms', 0):<9.1f} {t.get('cluster_ms', 0):<9.1f} "
              f"{t.get('features_ms', 0):<10.1f} {t.get('score_ms', 0):<9.1f} "
              f"{r['total_ms']:<10.1f} {r['accounts_per_second']:,.0f}")

    g = report["growth"]
    if g:
        print(f"\n{g['size_ratio']}x the accounts costs {g['time_ratio']}x the "
              f"time, an exponent of {g['exponent']}. "
              f"{'Closer to linear.' if g['exponent'] < 1.5 else 'Closer to quadratic.'}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sizes", default="3000,6000,12000")
    p.add_argument("--seed", type=int, default=700)
    p.add_argument("--tier", default="moderate", choices=config.TIER_NAMES)
    p.add_argument("--repeats", type=int, default=3)
    p.add_argument("--out", default="results/scan_timing.json")
    args = p.parse_args()

    announce(apply())
    sizes = [int(s) for s in args.sizes.split(",")]
    report = run(sizes, args.seed, args.tier, args.repeats)
    print_report(report)

    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
