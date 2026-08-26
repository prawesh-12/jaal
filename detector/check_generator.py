"""Run the generator check list at full size and write the numbers.

Every line it prints comes from a world it just generated. No number is copied
from an earlier run.

    python -m detector.check_generator --accounts 12000 --seeds 0-9
"""

import argparse
import json
import time

import config
from detector import generate_accounts as gen
from detector.cli import add_common_args, parse_seeds
from detector.resources import announce, apply

TIMING_WORLDS = 100


def _span_days(ts) -> float:
    return float(ts.max() - ts.min()) / 86_400


def run(n_accounts: int, seeds: list[int]) -> dict:
    priors = gen.load_priors()
    out: dict = {"n_accounts": n_accounts, "seeds": [seeds[0], seeds[-1]],
                 "n_seeds": len(seeds), "tiers": {}}

    for tier in config.TIER_NAMES:
        prev, rings, looks, dev_shared, ring_span = [], [], [], [], []
        addr_shared, office_span = [], []
        for seed in seeds:
            w = gen.generate(seed, tier, n_accounts, priors)
            s = w.summary()
            prev.append(s["prevalence"])
            rings.append(s["n_rings"])
            looks.append(s["n_lookalike_groups"])

            merged = w.truth.merge(w.accounts, on="account_id")
            for gid, block in merged[merged["is_ring"]].groupby("group_id"):
                dev_shared.append(len(block) - block["device_id"].nunique())
                addr_shared.append(len(block) - block["address_id"].nunique())
                ring_span.append(_span_days(block["signup_ts"]))
            for gid, block in merged[merged["group_type"] == "office"].groupby("group_id"):
                office_span.append(_span_days(block["signup_ts"]))

        out["tiers"][tier] = {
            "prevalence_min": round(min(prev), 5),
            "prevalence_max": round(max(prev), 5),
            "rings_min": min(rings), "rings_max": max(rings),
            "lookalike_groups_min": min(looks), "lookalike_groups_max": max(looks),
            "device_collisions_within_rings": int(sum(dev_shared)),
            "address_collisions_within_rings": int(sum(addr_shared)),
            "ring_signup_span_days_median": round(
                sorted(ring_span)[len(ring_span) // 2], 3),
            "office_signup_span_days_max": round(max(office_span), 2),
        }
    return out


def timing(n_accounts: int) -> dict:
    priors = gen.load_priors()
    t0 = time.perf_counter()
    for seed in range(TIMING_WORLDS):
        w = gen.generate(seed, "moderate", n_accounts, priors)
        del w                      # one world at a time, never hold them all
    elapsed = time.perf_counter() - t0
    return {"worlds": TIMING_WORLDS, "accounts_each": n_accounts,
            "seconds": round(elapsed, 2),
            "under_60s": bool(elapsed < 60)}


def determinism(n_accounts: int) -> dict:
    priors = gen.load_priors()
    a = gen.generate(5, "sophisticated", n_accounts, priors)
    b = gen.generate(5, "sophisticated", n_accounts, priors)
    same = (a.accounts.to_csv(index=False) == b.accounts.to_csv(index=False)
            and a.truth.to_csv(index=False) == b.truth.to_csv(index=False))
    return {"seed": 5, "tier": "sophisticated", "byte_identical": bool(same)}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--out", default="results/phase0_check.json")
    args = p.parse_args()

    announce(apply())
    seeds = parse_seeds(args.seeds)
    report = run(args.accounts, seeds)
    report["determinism"] = determinism(args.accounts)
    report["timing"] = timing(args.accounts)

    print(f"\nGenerator check, {args.accounts:,} accounts per world, "
          f"seeds {seeds[0]}-{seeds[-1]}")
    print(f"{'tier':<15} {'prevalence':<18} {'rings':<8} {'lookalikes':<12} "
          f"{'dev reuse':<11} {'addr reuse':<12} {'ring span (d)':<14} "
          f"{'office span (d)'}")
    for tier, t in report["tiers"].items():
        print(f"{tier:<15} "
              f"{t['prevalence_min']:.4f}-{t['prevalence_max']:.4f}   "
              f"{t['rings_min']}-{t['rings_max']:<6} "
              f"{t['lookalike_groups_min']}-{t['lookalike_groups_max']:<10} "
              f"{t['device_collisions_within_rings']:<11} "
              f"{t['address_collisions_within_rings']:<12} "
              f"{t['ring_signup_span_days_median']:<14} "
              f"{t['office_signup_span_days_max']}")

    d, tm = report["determinism"], report["timing"]
    print(f"\nseed 5 generated twice, byte identical: {d['byte_identical']}")
    print(f"{tm['worlds']} worlds of {tm['accounts_each']:,} accounts: "
          f"{tm['seconds']}s (under 60s: {tm['under_60s']})")

    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
