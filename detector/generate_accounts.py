"""Synthetic account worlds with a hidden answer key.

This is a test fixture, not an attack tool. Real promo abuse is unlabelled, so
there is no other way to measure a detector against a known answer. Every
record here is invented. No real identifier appears anywhere.

One world holds three kinds of accounts:

  singletons  one person, one account. Most of the population.
  rings       one operator, many accounts, farming the first-order coupon.
              Sophistication is a parameter, see config.TIERS.
  lookalikes  families, flatmates, hostels and offices. Real people who share
              a device or an address and therefore look like a ring.

Only ring accounts share an operator. A family is four different people, so
their accounts are four different operators that happen to share a card. That
is what makes them the interesting false positive.

    python -m detector.generate_accounts --accounts 1500 --seeds 0-4 --tier obvious
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

import config
from detector.cli import add_common_args, parse_seeds
from detector.resources import announce, apply

# 2026-01-01 00:00:00 UTC. A world covers the merchant's operating history.
# It has to be at least as long as the longest lookalike span, since a family
# that has been ordering for 900 days needs 900 days to have signed up in.
EPOCH = 1_767_225_600
WORLD_DAYS = 900
DAY = 86_400

# How the ordinary population behaves.
COUPON_TAKEUP = 0.55       # fraction of first-time customers who claim the coupon
COUPON_TOPUP_MAX = 120     # rupees a coupon user adds to clear the Rs.400 floor
SHARED_DEVICE_RATE = 0.02  # cyber cafes, refurbished phones, emulators
MAX_ORDERS = 6

# Attribute pools. Sizes are chosen so rarity varies: a few pincodes and card
# BINs carry most of the population and the rest are thin. Phase 2 needs that
# spread, because sharing a rare value is strong evidence and sharing a common
# one is almost none.
N_SHARED_DEVICES = 200
N_IP_PREFIXES = 1_500
N_PINCODES = 150
N_CARD_BINS = 80
ZIPF_ALPHA = 1.1

CITY_PIN_BASES = (560_000, 400_000, 110_000, 600_000, 500_000, 700_000)

COLUMNS = ("account_id", "device_id", "ip_prefix", "address_id", "pincode",
           "card_bin", "signup_ts", "n_orders", "coupon_used",
           "first_order_value", "total_order_value", "days_to_second_order")

TRUTH_COLUMNS = ("account_id", "operator_id", "group_id", "group_type",
                 "is_ring", "tier")


@dataclass
class World:
    """One generated population plus the answer key that is hidden from the detector."""
    seed: int
    tier: str
    accounts: pd.DataFrame
    truth: pd.DataFrame

    @property
    def prevalence(self) -> float:
        return float(self.truth["is_ring"].mean())

    def summary(self) -> dict:
        n_ring = int(self.truth["is_ring"].sum())
        rings = self.truth.loc[self.truth["is_ring"], "group_id"]
        looks = self.truth.loc[self.truth["group_type"].isin(config.LOOKALIKE_KINDS),
                               "group_id"]
        return {
            "seed": self.seed,
            "tier": self.tier,
            "n_accounts": len(self.accounts),
            "n_ring_accounts": n_ring,
            "n_rings": int(rings.nunique()),
            "n_lookalike_groups": int(looks.nunique()),
            "n_lookalike_accounts": int(len(looks)),
            "prevalence": round(self.prevalence, 5),
        }


# --------------------------------------------------------------------------
# pools and samplers
# --------------------------------------------------------------------------

def _zipf_weights(n: int, alpha: float = ZIPF_ALPHA) -> np.ndarray:
    """Skewed weights so a few values are common and most are rare."""
    w = 1.0 / np.power(np.arange(1, n + 1), alpha)
    return w / w.sum()


def _make_pools(rng: np.random.Generator) -> dict:
    pins = []
    for i in range(N_PINCODES):
        base = CITY_PIN_BASES[i % len(CITY_PIN_BASES)]
        pins.append(f"{base + (i // len(CITY_PIN_BASES)) + 1:06d}")
    bins_ = [f"{int(x):06d}" for x in rng.integers(400_000, 700_000, N_CARD_BINS)]
    octets = rng.integers(1, 255, size=(N_IP_PREFIXES, 3))
    ips = [f"{a}.{b}.{c}" for a, b, c in octets]
    shared_devices = [f"dv{int(x):012x}" for x in
                      rng.integers(0, 2**44, N_SHARED_DEVICES)]
    return {
        "pincodes": np.array(pins),
        "pin_w": _zipf_weights(N_PINCODES),
        "bins": np.array(bins_),
        "bin_w": _zipf_weights(N_CARD_BINS),
        "ips": np.array(ips),
        "ip_w": _zipf_weights(N_IP_PREFIXES, alpha=0.8),
        "shared_devices": np.array(shared_devices),
    }


class _Counter:
    """Hands out unique ids so no two accounts collide by accident."""

    def __init__(self) -> None:
        self.device = 0
        self.address = 0
        self.account = 0
        self.operator = 0

    def devices(self, rng: np.random.Generator, n: int) -> np.ndarray:
        start = self.device
        self.device += n
        return np.array([f"dv{i:012x}" for i in range(start, start + n)])

    def addresses(self, n: int) -> np.ndarray:
        start = self.address
        self.address += n
        return np.array([f"ad{i:07d}" for i in range(start, start + n)])

    def accounts(self, n: int) -> np.ndarray:
        start = self.account
        self.account += n
        return np.array([f"a{i:06d}" for i in range(start, start + n)])

    def operators(self, n: int) -> np.ndarray:
        start = self.operator
        self.operator += n
        return np.array([f"op{i:07d}" for i in range(start, start + n)])


def _sample_values(rng: np.random.Generator, n: int, priors: dict) -> np.ndarray:
    """Order values in rupees, drawn from the real Olist distribution.

    Inverse transform sampling: draw a uniform percentile and read it off the
    percentile curve. Integers, because money is never a float here.
    """
    pts = np.asarray(priors["value_percentile_points"], dtype=float)
    vals = np.asarray(priors["value_percentile_values"], dtype=float)
    u = rng.random(n) * 100.0
    return np.rint(np.interp(u, pts, vals)).astype(np.int64)


def _sample_hours(rng: np.random.Generator, n: int, priors: dict) -> np.ndarray:
    return rng.choice(24, size=n, p=np.asarray(priors["hour_weights"]))


def _signup_times(rng: np.random.Generator, n: int, priors: dict,
                  start_ts: int, span_days: float) -> np.ndarray:
    """Signup timestamps inside a window, following the real hour-of-day curve.

    A window shorter than a day cannot carry an hour-of-day pattern, so those
    are laid out uniformly from a start time that itself has a realistic hour.
    """
    if span_days >= 1.0:
        day = rng.integers(0, max(1, int(round(span_days))), n)
        hour = _sample_hours(rng, n, priors)
        return (start_ts + day * DAY + hour * 3600
                + rng.integers(0, 3600, n)).astype(np.int64)
    return (start_ts + (rng.random(n) * span_days * DAY)).astype(np.int64)


def _group_start(rng: np.random.Generator, priors: dict, span_days: float) -> int:
    """A start time for a group, leaving room for its whole window in the year."""
    room = max(1, int(WORLD_DAYS - span_days))
    day = int(rng.integers(0, room))
    hour = int(_sample_hours(rng, 1, priors)[0])
    return int(EPOCH + day * DAY + hour * 3600 + int(rng.integers(0, 3600)))


def _order_history(rng: np.random.Generator, n: int, priors: dict,
                   repeat_rate: float, first: np.ndarray
                   ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """How many times each account ordered, what they spent, and the gap."""
    repeats = rng.random(n) < repeat_rate
    n_orders = np.where(repeats, rng.integers(2, MAX_ORDERS + 1, n), 1)
    total = first.copy()
    for k in range(2, MAX_ORDERS + 1):
        extra = _sample_values(rng, n, priors)
        total = total + np.where(n_orders >= k, extra, 0)
    gap = np.where(repeats, rng.integers(3, 180, n), -1)
    return n_orders.astype(np.int64), total.astype(np.int64), gap.astype(np.int64)


def _coupon(rng: np.random.Generator, n: int, first: np.ndarray,
            takeup: float) -> tuple[np.ndarray, np.ndarray]:
    """Who claims the coupon, and the top-up they add to clear the floor.

    Real coupon users pile up just above the Rs.400 minimum too. Without this
    the ring accounts would be the only orders sitting on the floor, which
    would make the whole problem trivially easy and dishonest.
    """
    wants = rng.random(n) < takeup
    topped = np.where(
        wants & (first < config.COUPON_MIN_ORDER),
        config.COUPON_MIN_ORDER + rng.integers(0, COUPON_TOPUP_MAX, n),
        first,
    )
    used = wants & (topped >= config.COUPON_MIN_ORDER)
    return used, topped.astype(np.int64)


# --------------------------------------------------------------------------
# group plans
# --------------------------------------------------------------------------

def ring_sizes(rng: np.random.Generator, n_total: int, prevalence: float) -> list[int]:
    """Split the fraud budget across a realistic number of operators.

    At 12,000 accounts and 0.8% that is about 96 ring accounts over three to
    five operators. Sparse, and much harder than a world where one in ten
    accounts is a fraudster.
    """
    budget = int(n_total * prevalence)
    sizes: list[int] = []
    while budget > 8:
        size = int(min(budget, rng.integers(8, 46)))
        sizes.append(size)
        budget -= size
    if sizes and budget > 0:
        sizes[-1] += budget          # spend the remainder so prevalence holds
    return sizes


def lookalike_plan(rng: np.random.Generator, n_groups: int) -> list[tuple[str, int]]:
    """Which benign groups exist in this world, and how big each one is."""
    kinds = list(config.LOOKALIKE_KINDS)
    plan: list[tuple[str, int]] = []
    for i in range(n_groups):
        kind = kinds[i % len(kinds)]          # even coverage, not luck
        lo, hi = config.LOOKALIKE_KINDS[kind]["size"]
        plan.append((kind, int(rng.integers(lo, hi + 1))))
    return plan


# --------------------------------------------------------------------------
# the three kinds of account block
# --------------------------------------------------------------------------

def _singletons(rng, n, priors, pools, ids) -> tuple[dict, dict]:
    account_id = ids.accounts(n)
    device = ids.devices(rng, n)
    shared = rng.random(n) < SHARED_DEVICE_RATE
    device = np.where(shared, rng.choice(pools["shared_devices"], n), device)

    pincode = rng.choice(pools["pincodes"], n, p=pools["pin_w"])
    first = _sample_values(rng, n, priors)
    used, first = _coupon(rng, n, first, COUPON_TAKEUP)
    n_orders, total, gap = _order_history(rng, n, priors,
                                          priors["repeat_rate"], first)

    accounts = {
        "account_id": account_id,
        "device_id": device,
        "ip_prefix": rng.choice(pools["ips"], n, p=pools["ip_w"]),
        "address_id": ids.addresses(n),
        "pincode": pincode,
        "card_bin": rng.choice(pools["bins"], n, p=pools["bin_w"]),
        "signup_ts": _signup_times(rng, n, priors, EPOCH, WORLD_DAYS),
        "n_orders": n_orders,
        "coupon_used": used,
        "first_order_value": first,
        "total_order_value": total,
        "days_to_second_order": gap,
    }
    operator_id = ids.operators(n)
    truth = {
        "account_id": account_id,
        "operator_id": operator_id,
        "group_id": np.char.replace(operator_id, "op", "solo"),
        "group_type": np.repeat("normal", n),
        "is_ring": np.zeros(n, dtype=bool),
        "tier": np.repeat("", n),
    }
    return accounts, truth


def _ring(rng, size, tier, priors, pools, ids, index) -> tuple[dict, dict]:
    """One operator running `size` accounts to farm the coupon `size` times."""
    t = config.TIERS[tier]
    account_id = ids.accounts(size)

    # Devices. The operator has one phone and reuses it with probability
    # device_reuse. At the adaptive tier that probability is zero, so no two
    # ring accounts ever share a device id.
    fresh = ids.devices(rng, size)
    shared_device = ids.devices(rng, 1)[0]
    reuse = rng.random(size) < t["device_reuse"]
    device = np.where(reuse, shared_device, fresh)

    # Goods have to be delivered somewhere. The operator can change which door
    # they knock on, but not which neighbourhood, so the pincode holds at every
    # tier while the number of drop addresses grows with sophistication. At the
    # adaptive tier every account has its own address and the pincode is the
    # only static attribute the ring still shares.
    pincode = str(rng.choice(pools["pincodes"], p=pools["pin_w"]))
    n_drops = max(1, min(size, round(size / t["accounts_per_drop"])))
    drops = ids.addresses(n_drops)
    address = (drops if n_drops == size else rng.choice(drops, size))

    # One or two prepaid card BINs.
    ring_bins = rng.choice(pools["bins"], size=int(rng.integers(1, 3)),
                           p=pools["bin_w"])
    card_bin = rng.choice(ring_bins, size)

    start = _group_start(rng, priors, t["signup_window_days"])
    signup_ts = _signup_times(rng, size, priors, start, t["signup_window_days"])

    # Order values sit just above the coupon floor, spread by the tier jitter.
    first = (config.COUPON_MIN_ORDER
             + rng.integers(0, int(t["value_jitter"]) + 1, size)).astype(np.int64)

    # Camouflage: a slice of the ring behaves like a real customer. They order
    # again, and some of them skip the coupon entirely. This is aimed straight
    # at the repeat-rate feature, which is the strongest one we have.
    camo = rng.random(size) < t["camouflage"]
    n_orders = np.where(camo, rng.integers(2, MAX_ORDERS + 1, size), 1)
    total = first.copy()
    for k in range(2, MAX_ORDERS + 1):
        extra = _sample_values(rng, size, priors)
        total = total + np.where(n_orders >= k, extra, 0)
    gap = np.where(camo, rng.integers(3, 180, size), -1)
    coupon_used = np.where(camo, rng.random(size) < 0.5, True)

    group_id = f"ring{index:02d}"
    accounts = {
        "account_id": account_id,
        "device_id": device,
        "ip_prefix": rng.choice(pools["ips"], size, p=pools["ip_w"]),
        "address_id": address,
        "pincode": np.repeat(pincode, size),
        "card_bin": card_bin,
        "signup_ts": signup_ts,
        "n_orders": n_orders.astype(np.int64),
        "coupon_used": coupon_used,
        "first_order_value": first,
        "total_order_value": total.astype(np.int64),
        "days_to_second_order": gap.astype(np.int64),
    }
    truth = {
        "account_id": account_id,
        "operator_id": np.repeat(group_id, size),
        "group_id": np.repeat(group_id, size),
        "group_type": np.repeat("ring", size),
        "is_ring": np.ones(size, dtype=bool),
        "tier": np.repeat(tier, size),
    }
    return accounts, truth


def _lookalike(rng, kind, size, priors, pools, ids, index) -> tuple[dict, dict]:
    """A benign group that shares what a ring shares, for a different reason."""
    spec = config.LOOKALIKE_KINDS[kind]
    shares = spec["shares"]
    account_id = ids.accounts(size)

    device = ids.devices(rng, size)
    if "device" in shares:
        device = np.repeat(ids.devices(rng, 1)[0], size)

    ip = rng.choice(pools["ips"], size, p=pools["ip_w"])
    if "ip" in shares:
        ip = np.repeat(str(rng.choice(pools["ips"], p=pools["ip_w"])), size)

    address = ids.addresses(size)
    pincode = rng.choice(pools["pincodes"], size, p=pools["pin_w"])
    if "address" in shares:
        address = np.repeat(ids.addresses(1)[0], size)
        pincode = np.repeat(str(rng.choice(pools["pincodes"], p=pools["pin_w"])), size)

    card_bin = rng.choice(pools["bins"], size, p=pools["bin_w"])
    if "card" in shares:
        card_bin = np.repeat(str(rng.choice(pools["bins"], p=pools["bin_w"])), size)

    span = float(rng.integers(*spec["span_days"]))
    start = _group_start(rng, priors, span)
    signup_ts = _signup_times(rng, size, priors, start, span)

    first = _sample_values(rng, size, priors)
    used, first = _coupon(rng, size, first, COUPON_TAKEUP)
    n_orders, total, gap = _order_history(rng, size, priors,
                                          spec["repeat_rate"], first)

    group_id = f"look_{kind}_{index:02d}"
    accounts = {
        "account_id": account_id,
        "device_id": device,
        "ip_prefix": ip,
        "address_id": address,
        "pincode": pincode,
        "card_bin": card_bin,
        "signup_ts": signup_ts,
        "n_orders": n_orders,
        "coupon_used": used,
        "first_order_value": first,
        "total_order_value": total,
        "days_to_second_order": gap,
    }
    truth = {
        "account_id": account_id,
        # Every member is a different person, so every account is its own
        # operator. Only rings share one. This is what makes them false positives.
        "operator_id": ids.operators(size),
        "group_id": np.repeat(group_id, size),
        "group_type": np.repeat(kind, size),
        "is_ring": np.zeros(size, dtype=bool),
        "tier": np.repeat("", size),
    }
    return accounts, truth


# --------------------------------------------------------------------------
# world assembly
# --------------------------------------------------------------------------

def load_priors(path: str = config.OLIST_PRIORS_PATH) -> dict:
    with open(path) as f:
        return json.load(f)


def generate(seed: int, tier: str, n_accounts: int = None,
             priors: dict = None, n_lookalike_groups: int = None) -> World:
    """One deterministic world. Same arguments always give the same accounts."""
    if tier not in config.TIERS:
        raise ValueError(f"unknown tier {tier!r}, expected one of {config.TIER_NAMES}")
    n_accounts = n_accounts or config.N_ACCOUNTS
    priors = priors or load_priors()
    if n_lookalike_groups is None:
        # Keep the lookalike share of the population steady when the world is
        # scaled down for development runs.
        n_lookalike_groups = max(8, round(config.LOOKALIKE_GROUPS
                                          * n_accounts / config.N_ACCOUNTS))

    rng = np.random.default_rng([seed, config.TIER_NAMES.index(tier)])
    pools = _make_pools(rng)
    ids = _Counter()

    blocks: list[tuple[dict, dict]] = []
    for i, size in enumerate(ring_sizes(rng, n_accounts, config.RING_PREVALENCE)):
        blocks.append(_ring(rng, size, tier, priors, pools, ids, i))
    for i, (kind, size) in enumerate(lookalike_plan(rng, n_lookalike_groups)):
        blocks.append(_lookalike(rng, kind, size, priors, pools, ids, i))

    used = sum(len(b[0]["account_id"]) for b in blocks)
    n_solo = n_accounts - used
    if n_solo < 1:
        raise ValueError(
            f"{used} accounts already spoken for by rings and lookalikes but the "
            f"world is only {n_accounts}. Raise --accounts or cut LOOKALIKE_GROUPS."
        )
    blocks.append(_singletons(rng, n_solo, priors, pools, ids))

    accounts = pd.DataFrame({c: np.concatenate([b[0][c] for b in blocks])
                             for c in COLUMNS})
    truth = pd.DataFrame({c: np.concatenate([b[1][c] for b in blocks])
                          for c in TRUTH_COLUMNS})

    # Rings are built first, so without this the ring accounts would hold the
    # lowest ids in every world. Shuffle the rows, then hand out fresh ids in
    # the shuffled order, so no opaque id leaks which group a row came from.
    order = rng.permutation(len(accounts))
    accounts = accounts.iloc[order].reset_index(drop=True)
    truth = truth.iloc[order].reset_index(drop=True)
    _relabel(accounts, truth, rng)

    return World(seed=seed, tier=tier, accounts=accounts, truth=truth)


def _relabel(accounts: pd.DataFrame, truth: pd.DataFrame,
             rng: np.random.Generator) -> None:
    """Replace opaque ids in place so their numbering says nothing about origin."""
    accounts["account_id"] = [f"a{i:06d}" for i in range(len(accounts))]
    truth["account_id"] = accounts["account_id"].values

    for col, prefix, width in (("device_id", "dv", 12), ("address_id", "ad", 7)):
        old = pd.unique(accounts[col])
        new = rng.permutation(len(old))
        mapping = {o: f"{prefix}{int(i):0{width}d}" for o, i in zip(old, new)}
        accounts[col] = accounts[col].map(mapping)


def main() -> None:
    p = argparse.ArgumentParser(description="Generate synthetic account worlds.")
    add_common_args(p)
    p.add_argument("--tier", default="all",
                   choices=config.TIER_NAMES + ["all"])
    p.add_argument("--out", default=None,
                   help="write the last world to this path prefix as CSV")
    args = p.parse_args()

    announce(apply())
    priors = load_priors()
    tiers = config.TIER_NAMES if args.tier == "all" else [args.tier]
    seeds = parse_seeds(args.seeds)

    world = None
    for tier in tiers:
        rows = []
        for seed in seeds:
            world = generate(seed, tier, args.accounts, priors)
            rows.append(world.summary())
        df = pd.DataFrame(rows)
        # Step 0.7: every output states the base rate it was measured at.
        print(f"\n[{tier}] {len(seeds)} worlds, {args.accounts:,} accounts each")
        print(f"  prevalence      {df['prevalence'].min():.4f} to "
              f"{df['prevalence'].max():.4f} (target {config.RING_PREVALENCE})")
        print(f"  ring accounts   {df['n_ring_accounts'].min()} to "
              f"{df['n_ring_accounts'].max()}")
        print(f"  rings           {df['n_rings'].min()} to {df['n_rings'].max()}")
        print(f"  lookalikes      {df['n_lookalike_groups'].min()} to "
              f"{df['n_lookalike_groups'].max()} groups, "
              f"{df['n_lookalike_accounts'].min()} to "
              f"{df['n_lookalike_accounts'].max()} accounts")

    if args.out and world is not None:
        world.accounts.to_csv(f"{args.out}_accounts.csv", index=False)
        world.truth.to_csv(f"{args.out}_truth.csv", index=False)
        print(f"\nwrote {args.out}_accounts.csv and {args.out}_truth.csv")


if __name__ == "__main__":
    main()
