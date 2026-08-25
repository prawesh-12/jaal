"""Argument helpers shared by every entry point.

Every script takes --accounts and --seeds so a small job can be run while
developing and the full one only when a step is finished.
"""

import argparse


def parse_seeds(spec: str) -> list[int]:
    """Turn "0-4", "7" or "0-4,9,20-22" into a sorted list of seeds."""
    seeds: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part.lstrip("-"):
            lo, hi = part.split("-", 1)
            lo, hi = int(lo), int(hi)
            if hi < lo:
                raise argparse.ArgumentTypeError(f"empty seed range: {part}")
            seeds.extend(range(lo, hi + 1))
        else:
            seeds.append(int(part))
    if not seeds:
        raise argparse.ArgumentTypeError(f"no seeds in {spec!r}")
    return sorted(set(seeds))


def add_common_args(p: argparse.ArgumentParser) -> None:
    import config
    p.add_argument("--accounts", type=int, default=config.N_ACCOUNTS,
                   help="total accounts per world, rings and lookalikes included")
    p.add_argument("--seeds", default="0-4",
                   help='seed range, e.g. "0-4" or "0-699"')
