"""Estimate m and u without labels, and print the match weight table.

u is easy. Sample random pairs. At 0.8% prevalence essentially every one is a
pair of strangers, so how often a field agrees in that sample is u.

m is harder, because it needs pairs that really are the same operator and no
such list exists. The plan's bootstrap takes pairs sharing a *rare* value, on
the reasoning that two records holding a value nobody else has are one entity.
That is right for deduplicating a customer table. It is wrong here, and the
measurement says so: pairs sharing a device held by two or three accounts are
**0.7%** true matches. An operator does not run two accounts, they run eight to
forty-five, so their device is not rare, it is popular. Meanwhile a device held
by exactly two accounts is a couple sharing a phone.

So the seed rule is inverted. A device fingerprint carrying **six or more**
accounts is the seed, six being one more than the largest household in
`config.LOOKALIKE_KINDS["family"]`. Measured purity: **99.4%**.

Address cannot be used the same way. A hostel puts 20 to 60 unrelated students
at one address, so address-seeded pairs are 3.3% true matches whatever window
is used. That rules out the obvious cross-seeding trick, so m for the device
comparison, which the device seed cannot estimate without circularity, comes
from a second pass instead: score every candidate pair with the device
comparison switched off, keep the pairs whose remaining evidence alone puts the
posterior above 0.99, and measure device agreement inside that set. It is one
step of Expectation Maximisation, which is the proper fix the plan names.

    python -m detector.link_train --accounts 12000 --seeds 0-19
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

import config
from detector import link
from detector.blocking import candidate_pairs, true_pair_codes
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import World, generate, load_priors
from detector.resources import announce, apply

U_SAMPLES_PER_WORLD = 50_000

# One more than the largest family. Below this a shared device is a household,
# above it it is one person running accounts.
MIN_SEED_FREQ = max(config.LOOKALIKE_KINDS["family"]["size"]) + 1
SEED_FIELD = "device_id"

# Pass two keeps a pair only if the evidence excluding device already puts the
# posterior above this. Chosen from the cost of being wrong, not by tuning.
SEED_B_POSTERIOR = 0.99

# Expectation Maximisation, run after the seed bootstrap to undo its bias.
EM_WORLDS_PER_TIER = 5
EM_MAX_ITERS = 25
EM_TOLERANCE = 1e-4
# Dirichlet smoothing on the M step. Without it EM drives levels it cannot see
# to zero: order_value "no" came out at m = 0.0002, a weight of -11.95 bits,
# when the true pooled value across tiers is nearer 0.31. EM only learns from
# pairs it already believes are matches, so the careful operators it misses
# never get a vote, and their absence hardens into a huge penalty against
# exactly the pairs it should be learning from. Spreading 2% of the mass evenly
# over the levels puts a bound on how confident a single level may become.
EM_SMOOTHING = 0.02


def _empty_counts() -> dict[str, np.ndarray]:
    return {name: np.zeros(len(levels), dtype=np.int64)
            for name, levels in link.LEVELS.items()}


def _accumulate(counts: dict[str, np.ndarray], accounts: pd.DataFrame,
                pairs: np.ndarray) -> None:
    if len(pairs) == 0:
        return
    levels = link.compare(link.PairView(accounts, pairs))
    for name, idx in levels.items():
        counts[name] += np.bincount(idx, minlength=len(link.LEVELS[name]))


def _normalise(counts: dict[str, np.ndarray], floor: float) -> dict[str, list]:
    out = {}
    for name, c in counts.items():
        total = c.sum()
        p = (c / total) if total else np.full(len(c), 1.0 / len(c))
        p = np.maximum(p, floor)
        out[name] = [float(x) for x in p / p.sum()]
    return out


def random_pairs(n: int, k: int, rng: np.random.Generator) -> np.ndarray:
    """k random pairs of distinct row positions."""
    a = rng.integers(0, n, k)
    b = rng.integers(0, n, k)
    keep = a != b
    a, b = a[keep], b[keep]
    return np.column_stack((np.minimum(a, b), np.maximum(a, b)))


def popular_value_pairs(accounts: pd.DataFrame, field: str = SEED_FIELD,
                        min_freq: int = MIN_SEED_FREQ,
                        max_freq: int = config.MAX_BLOCK_SIZE) -> np.ndarray:
    """Pairs sharing a value held by more accounts than any household has."""
    chunks = []
    for positions in accounts.groupby(field).indices.values():
        k = len(positions)
        if min_freq <= k <= max_freq:
            i, j = np.triu_indices(k, k=1)
            pos = np.sort(np.asarray(positions))
            chunks.append(np.column_stack((pos[i], pos[j])))
    if not chunks:
        return np.empty((0, 2), dtype=np.int64)
    return np.vstack(chunks).astype(np.int64)


def purity(world: World, pairs: np.ndarray) -> tuple[int, int]:
    """How many of these pairs really are one operator.

    Only measurable because the data is synthetic. In production this number
    does not exist, which is exactly why the seed rule has to stand on domain
    reasoning rather than on this measurement.
    """
    if len(pairs) == 0:
        return 0, 0
    n = len(world.accounts)
    codes = pairs[:, 0] * n + pairs[:, 1]
    return int(np.isin(codes, true_pair_codes(world)).sum()), int(len(codes))


def expected_match_rate(n_accounts: int, n_candidate_pairs: int) -> float:
    """Roughly what share of candidate pairs are real matches.

    Derived from config, not from labels. The business states a ring prevalence
    and a ring size range, and those two give an expected number of within-ring
    pairs without anyone having to know which pairs they are.
    """
    ring_accounts = n_accounts * config.RING_PREVALENCE
    lo, hi = 8, 45                      # config.generate_accounts.ring_sizes
    mean_size = (lo + hi) / 2
    n_rings = max(ring_accounts / mean_size, 1.0)
    true_pairs = n_rings * mean_size * (mean_size - 1) / 2
    return min(max(true_pairs / max(n_candidate_pairs, 1), 1e-6), 0.05)


def em_refine(level_blocks: list[dict], m0: dict, u: dict, lam: float,
              max_iters: int = EM_MAX_ITERS, tol: float = EM_TOLERANCE
              ) -> tuple[dict, float, int]:
    """Soft Expectation Maximisation for m, over blocked candidate pairs.

    The seed bootstrap can only see operators careless enough to reuse a device,
    so its m for signup timing says 74% of true pairs sign up within an hour.
    That is true of the obvious tier and false everywhere else, and it would
    punish a careful ring for taking three weeks. EM fixes it by letting every
    candidate pair contribute to m in proportion to how likely it is to be a
    match, so pairs that look like matches for other reasons pull the timing
    estimate back out.

    u stays fixed at the random-sample estimate. Blocked pairs agree on
    something by construction, so re-estimating u on them would inflate it. This
    is what Splink does for the same reason.

    The match rate lambda is held fixed too. Left free it ran away: it climbed
    from 0.0098 to the 0.5 ceiling in nine iterations, concluding that half of
    all candidate pairs were matches, and every weight collapsed to zero as m
    converged on u. Blocked pairs all agree on something, so a free lambda lets
    EM explain the blocking structure instead of the ring structure. Fixing it
    at the value config implies removes that degree of freedom.
    """
    m = {k: np.asarray(v, dtype=float) for k, v in m0.items()}
    log_u = {k: np.log(np.maximum(np.asarray(v, dtype=float), link.U_FLOOR))
             for k, v in u.items()}
    iters = 0

    for iters in range(1, max_iters + 1):
        num = {k: np.zeros_like(v) for k, v in m.items()}
        denom = 0.0

        log_m = {k: np.log(np.maximum(v, link.M_FLOOR)) for k, v in m.items()}
        for levels in level_blocks:
            logit = np.full(len(next(iter(levels.values()))),
                            np.log(lam / (1 - lam)), dtype=np.float64)
            for name, idx in levels.items():
                logit += log_m[name][idx] - log_u[name][idx]
            gamma = 1.0 / (1.0 + np.exp(-np.clip(logit, -700, 700)))

            for name, idx in levels.items():
                num[name] += np.bincount(idx, weights=gamma,
                                         minlength=len(m[name]))
            denom += gamma.sum()

        new_m = {}
        shift = 0.0
        for name in m:
            k = len(m[name])
            pseudo = EM_SMOOTHING * denom / k
            p = ((num[name] + pseudo) / (denom + pseudo * k)
                 if denom else m[name])
            p = np.maximum(p, link.M_FLOOR)
            p = p / p.sum()
            shift = max(shift, float(np.abs(p - m[name]).max()))
            new_m[name] = p
        m = new_m
        if shift < tol:
            break

    return {k: [float(x) for x in v] for k, v in m.items()}, float(lam), iters


def train(seeds: list[int], n_accounts: int, tiers=None,
          rng_seed: int = 0, verbose: bool = True) -> dict:
    rng = np.random.default_rng(rng_seed)
    priors = load_priors()
    tiers = list(tiers or config.TIER_NAMES)

    u_counts = _empty_counts()
    m_counts = _empty_counts()
    seed_hits = seed_total = 0
    n_true_pairs = n_possible_pairs = 0

    if verbose:
        print(f"pass 1: u by sampling, m from devices with "
              f"{MIN_SEED_FREQ}+ accounts")
    for tier in tiers:
        for seed in seeds:
            world = generate(seed, tier, n_accounts, priors)
            n = len(world.accounts)
            _accumulate(u_counts, world.accounts,
                        random_pairs(n, U_SAMPLES_PER_WORLD, rng))
            sp = popular_value_pairs(world.accounts)
            _accumulate(m_counts, world.accounts, sp)
            hit, tot = purity(world, sp)
            seed_hits += hit
            seed_total += tot
            n_true_pairs += len(true_pair_codes(world))
            n_possible_pairs += n * (n - 1) // 2
            del world

    u = _normalise(u_counts, link.U_FLOOR)
    m = _normalise(m_counts, link.M_FLOOR)
    prior = n_true_pairs / n_possible_pairs
    prior_odds = prior / (1 - prior)

    # Pass two: m for the device comparison, which pass one cannot estimate
    # because every one of its seed pairs shares a device by construction.
    without_device = tuple(c for c in link.COMPARISONS if c != "device")
    threshold = float(np.log2(SEED_B_POSTERIOR / (1 - SEED_B_POSTERIOR)
                              / prior_odds))
    if verbose:
        print(f"pass 2: m for device, from pairs already over "
              f"{threshold:.1f} bits without it")

    stage1 = {"m": m, "u": u}
    dev_counts = np.zeros(len(link.LEVELS["device"]), dtype=np.int64)
    b_hits = b_total = 0
    for tier in tiers:
        for seed in seeds:
            world = generate(seed, tier, n_accounts, priors)
            pairs, _ = candidate_pairs(world.accounts)
            bits, _ = link.score_pairs(world.accounts, pairs, stage1,
                                       comparisons=without_device)
            keep = pairs[bits >= threshold]
            if len(keep):
                levels = link.compare(link.PairView(world.accounts, keep))
                dev_counts += np.bincount(levels["device"], minlength=2)
                hit, tot = purity(world, keep)
                b_hits += hit
                b_total += tot
            del world

    m["device"] = _normalise({"device": dev_counts}, link.M_FLOOR)["device"]
    m_bootstrap = {k: list(v) for k, v in m.items()}

    # Pass three: EM over blocked candidate pairs, to undo the seed bias.
    em_seeds = seeds[:EM_WORLDS_PER_TIER]
    if verbose:
        print(f"pass 3: EM over candidate pairs from "
              f"{len(em_seeds) * len(tiers)} worlds")
    level_blocks = []
    n_candidates = 0
    for tier in tiers:
        for seed in em_seeds:
            world = generate(seed, tier, n_accounts, priors)
            pairs, _ = candidate_pairs(world.accounts)
            level_blocks.append(link.compare(link.PairView(world.accounts, pairs)))
            n_candidates += len(pairs)
            del world

    lam = expected_match_rate(n_accounts,
                              n_candidates / max(len(level_blocks), 1))
    m_em, lam, em_iters = em_refine(level_blocks, m, u, lam)
    del level_blocks

    # EM was measured against the bootstrap on ten validation worlds and lost
    # on every tier that works at all. Best pair F1, bootstrap against EM:
    # obvious 0.991 / 0.793, moderate 0.706 / 0.372, sophisticated 0.118 / 0.101.
    # So the bootstrap estimate ships and EM is kept beside it, reported rather
    # than quietly dropped. See D-015.
    return {
        "trained_on": {"seeds": [seeds[0], seeds[-1]], "n_seeds": len(seeds),
                       "tiers": tiers, "n_accounts": n_accounts},
        "levels": {k: list(v) for k, v in link.LEVELS.items()},
        "m_source": "bootstrap",
        "m": m_bootstrap,
        "m_em": m_em,
        "u": u,
        "prior_match_rate": prior,
        "prior_odds": prior_odds,
        "u_samples": U_SAMPLES_PER_WORLD * len(seeds) * len(tiers),
        "seed_rule": f"{SEED_FIELD} shared by {MIN_SEED_FREQ}+ accounts",
        "seed_pairs": seed_total,
        "seed_purity": round(seed_hits / seed_total, 4) if seed_total else 0.0,
        "device_seed_threshold_bits": round(threshold, 2),
        "device_seed_pairs": b_total,
        "device_seed_purity": round(b_hits / b_total, 4) if b_total else 0.0,
        "em": {"worlds": len(em_seeds) * len(tiers),
               "candidate_pairs": n_candidates,
               "iterations": em_iters,
               "lambda_fixed": round(lam, 6)},
    }


def print_weight_table(params: dict) -> None:
    table = link.weight_table(params)
    print(f"\n{'comparison':<14} {'level':<17} {'m':>9} {'u':>11} "
          f"{'weight(bits)':>13}")
    print("-" * 68)
    for name in link.COMPARISONS:
        for k, level in enumerate(link.LEVELS[name]):
            print(f"{name if k == 0 else '':<14} {level:<17} "
                  f"{params['m'][name][k]:>9.4f} {params['u'][name][k]:>11.6f} "
                  f"{table[name][k]:>+13.2f}")
    print(f"\nprior match rate {params['prior_match_rate']:.3e} "
          f"(1 pair in {round(1 / params['prior_match_rate']):,})")
    print(f"seed set:        {params['seed_pairs']:,} pairs from "
          f"{params['seed_rule']}, {params['seed_purity']:.1%} truly one operator")
    print(f"device seed set: {params['device_seed_pairs']:,} pairs over "
          f"{params['device_seed_threshold_bits']} bits without device, "
          f"{params['device_seed_purity']:.1%} truly one operator")
    em = params["em"]
    print(f"EM:              {em['candidate_pairs']:,} candidate pairs from "
          f"{em['worlds']} worlds, {em['iterations']} iterations, "
          f"match rate held at {em['lambda_fixed']:.5f}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--out", default="results/link_params.json")
    args = p.parse_args()

    announce(apply())
    seeds = parse_seeds(args.seeds)
    if max(seeds) >= min(config.HOLDOUT_SEEDS):
        raise SystemExit("refusing to train on sealed holdout seeds 900-999")

    params = train(seeds, args.accounts)
    print_weight_table(params)
    with open(args.out, "w") as f:
        json.dump(params, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
