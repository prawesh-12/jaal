"""Which account columns a caller can actually send, and what that costs them.

Every published number assumes all twelve columns are present. Not every caller
has them. A merchant knows the delivery address and when the account was
created. A payment aggregator sees the same device across every merchant it
processes, but never sees a delivery address and never sees that a coupon was
applied, because the promo is applied merchant side.

A profile is a named set of columns the caller can supply. Three things follow
from it, and nothing else in the pipeline changes:

  - which blocking rules can still key on something
  - which comparisons the pair scorer can still add up
  - which cluster features can still be computed

The third one matters as much as the first two. Narrowing the comparisons only
changes the graph. A caller who cannot send `address_id` also loses
`distinct_address_ratio`, and an ablation that forgets that flatters them.

    python -m detector.profiles          print the table
"""

from __future__ import annotations

from dataclasses import dataclass

from detector import link
from detector.blocking import BLOCKING_RULES

# Present in every profile. Without it there is nothing to hang a decision on.
ALWAYS = ("account_id",)

ALL_COLUMNS = ("account_id", "device_id", "ip_prefix", "address_id", "pincode",
               "card_bin", "signup_ts", "n_orders", "coupon_used",
               "first_order_value", "total_order_value", "days_to_second_order")

# The account columns each comparison reads.
FIELD_COLUMNS = {
    "device":       ("device_id",),
    "address":      ("address_id",),
    "pincode":      ("pincode",),
    "card_bin":     ("card_bin",),
    "ip_prefix":    ("ip_prefix",),
    "signup_gap":   ("signup_ts",),
    "hour_of_day":  ("signup_ts",),
    "order_value":  ("first_order_value",),
    "coupon_floor": ("first_order_value", "coupon_used"),
    "order_count":  ("n_orders",),
    "coupon_used":  ("coupon_used",),
}

# The account columns each cluster feature reads. The structural ones come off
# the evidence graph and are listed with no columns, so they always survive.
#
# `near_min_rate` needs the order value and the promo terms. Knowing an order
# sits near a coupon floor means knowing the floor, which is the merchant's
# number, so it is tied to `coupon_used` as well as to the value.
FEATURE_COLUMNS = {
    "size": (), "edge_density": (), "mean_edge_bits": (), "min_edge_bits": (),
    "weight_spread": (), "diameter": (), "degree_gini": (),
    "top_signal_share": (),

    "signup_span_days": ("signup_ts",),
    "signup_burstiness": ("signup_ts",),
    "hour_concentration": ("signup_ts",),
    "median_gap_minutes": ("signup_ts",),
    "lifespan_days": ("days_to_second_order",),

    "coupon_rate": ("coupon_used",),
    "repeat_rate": ("n_orders",),
    "near_min_rate": ("first_order_value", "coupon_used"),
    "value_cv": ("first_order_value",),
    "distinct_bin_ratio": ("card_bin",),
    "bin_concentration": ("card_bin",),
    "distinct_device_ratio": ("device_id",),
    "distinct_address_ratio": ("address_id",),
    "pincode_concentration": ("pincode",),

    "total_discount": ("coupon_used",),
    "discount_per_account": ("coupon_used",),
    "discount_to_revenue": ("coupon_used", "total_order_value"),
}

# Values that are only ever tested for equality, by the scorer, by the blocking
# rules and by the count features. A caller can send a salted digest instead of
# the real thing. tests/test_hashing.py holds that to account.
HASHABLE_COLUMNS = ("device_id", "address_id", "pincode", "card_bin",
                    "ip_prefix")

ALL_FIELDS = tuple(FIELD_COLUMNS)


@dataclass(frozen=True)
class Profile:
    name: str
    columns: tuple[str, ...]
    description: str

    def has(self, *cols: str) -> bool:
        return all(c in self.columns for c in cols)

    @property
    def comparisons(self) -> tuple[str, ...]:
        """Comparisons the scorer can still use, in the shipped order."""
        return tuple(c for c in link.SCORED_COMPARISONS
                     if self.has(*FIELD_COLUMNS[c]))

    @property
    def rules(self) -> tuple:
        """Blocking rules whose every key column is available."""
        have = set(self.columns)
        if "signup_ts" in have:
            have |= {"signup_week", "signup_month", "signup_month_shift"}
        return tuple((name, cols) for name, cols in BLOCKING_RULES
                     if all(c in have for c in cols))

    @property
    def features(self) -> tuple[str, ...]:
        """Cluster features that can still be computed, in the shipped order."""
        from detector.model import MODEL_FEATURES
        return tuple(f for f in MODEL_FEATURES if self.has(*FEATURE_COLUMNS[f]))

    @property
    def missing_columns(self) -> tuple[str, ...]:
        return tuple(c for c in ALL_COLUMNS if c not in self.columns)

    @property
    def missing_comparisons(self) -> tuple[str, ...]:
        kept = set(self.comparisons)
        return tuple(c for c in link.SCORED_COMPARISONS if c not in kept)

    @property
    def missing_features(self) -> tuple[str, ...]:
        from detector.model import MODEL_FEATURES
        kept = set(self.features)
        return tuple(f for f in MODEL_FEATURES if f not in kept)


def _columns(*names: str) -> tuple[str, ...]:
    for n in names:
        if n not in ALL_COLUMNS:
            raise ValueError(f"unknown account column: {n}")
    return ALWAYS + tuple(n for n in names if n not in ALWAYS)


# What the aggregator has on its own rails. It charges the card, so it knows the
# amount, the running count and whether a second charge came later. It sees the
# device through its own checkout, and the IP the request came from.
_RAILS = ("device_id", "ip_prefix", "card_bin", "n_orders",
          "first_order_value", "total_order_value", "days_to_second_order")

_EVERYTHING = tuple(c for c in ALL_COLUMNS if c not in ALWAYS)

PROFILES = (
    Profile(
        "full", _columns(*_EVERYTHING),
        "Every column. What every published number in this project uses.",
    ),
    Profile(
        "aggregator_strict", _columns(*_RAILS),
        "A payment aggregator reading nothing but its own rails. No clock, no "
        "billing pincode, no delivery address, no idea a promo was applied.",
    ),
    Profile(
        "aggregator", _columns(*_RAILS, "pincode", "signup_ts"),
        "The same, allowing a billing pincode and a transaction clock. In this "
        "data every account transacts at signup, so one column serves as both "
        "clocks, which flatters this profile rather than penalising it.",
    ),
    Profile(
        "aggregator_plus_address",
        _columns(*_RAILS, "pincode", "signup_ts", "address_id"),
        "The aggregator, plus a delivery address the merchant passes through. "
        "One field, and it is one of the three strongest signals in the model.",
    ),
    Profile(
        "sdk_payload",
        _columns(*_RAILS, "pincode", "signup_ts", "address_id", "coupon_used"),
        "The full integration: the aggregator's own columns plus the two the "
        "merchant has to send, a hashed delivery address and a coupon flag.",
    ),
    Profile(
        "no_device",
        _columns(*[c for c in _EVERYTHING if c != "device_id"]),
        "Everything except the device. What is left when the operator rotates "
        "phones perfectly, or the caller has no fingerprint to send.",
    ),
)

BY_NAME = {p.name: p for p in PROFILES}
FULL = BY_NAME["full"]


def get(name: str) -> Profile:
    if name not in BY_NAME:
        raise KeyError(f"no profile {name!r}. Known: {', '.join(BY_NAME)}")
    return BY_NAME[name]


def match(columns) -> Profile:
    """The richest profile a caller with these columns can actually run.

    Used to answer "what do I get with what I already have" before anyone
    writes an integration. Falls back to the narrowest profile rather than
    raising, because "you get very little" is a useful answer and an exception
    is not.
    """
    have = set(columns)
    usable = [p for p in PROFILES if set(p.columns) <= have]
    if not usable:
        return min(PROFILES, key=lambda p: len(p.columns))
    return max(usable, key=lambda p: len(p.columns))


def coverage(columns) -> dict:
    """What a caller with these columns can and cannot do. Plain data."""
    have = set(columns)
    p = match(columns)
    return {
        "profile": p.name,
        "description": p.description,
        "columns_sent": sorted(have),
        "columns_recognised": [c for c in ALL_COLUMNS if c in have],
        "columns_ignored": sorted(have - set(ALL_COLUMNS)),
        "columns_missing": list(p.missing_columns),
        "comparisons_kept": list(p.comparisons),
        "comparisons_lost": list(p.missing_comparisons),
        "blocking_rules_kept": [n for n, _ in p.rules],
        "features_kept": len(p.features),
        "features_lost": list(p.missing_features),
    }


def field_weights(params: dict) -> dict[str, float]:
    """The best bits any level of each comparison is worth, from a real run.

    This is what makes a column worth asking a merchant for, so the integration
    doc quotes it instead of calling fields important.
    """
    table = link.weight_table(params)
    return {name: round(float(max(table[name])), 2) for name in ALL_FIELDS}


def hash_identifiers(accounts, salt: str, columns=HASHABLE_COLUMNS):
    """Replace identifier values with a salted digest, in place of the real ones.

    Each of these is only ever tested for equality, so a caller can salt and
    hash them before sending anything and the pipeline cannot tell. The salt is
    per tenant, so two tenants never produce the same digest for one device.

    Returns a copy. The frame passed in is untouched.
    """
    import hashlib

    out = accounts.copy()
    for col in columns:
        if col not in out.columns:
            continue
        digest = {v: hashlib.sha256(f"{salt}:{v}".encode()).hexdigest()
                  for v in out[col].unique()}
        out[col] = out[col].map(digest)
    return out


def print_table(params: dict | None = None) -> None:
    weights = field_weights(params) if params else {}

    print(f"\n{len(PROFILES)} profiles over {len(ALL_COLUMNS)} columns, "
          f"{len(link.SCORED_COMPARISONS)} scored comparisons, "
          f"{len(BLOCKING_RULES)} blocking rules")
    head = (f"{'profile':<24} {'columns':<9} {'cmp':<5} {'rules':<7} "
            f"{'features':<10} {'bits kept'}")
    print()
    print(head)
    print("-" * len(head))
    for p in PROFILES:
        kept = (round(sum(weights[c] for c in p.comparisons), 1)
                if weights else 0.0)
        print(f"{p.name:<24} {len(p.columns):<9} {len(p.comparisons):<5} "
              f"{len(p.rules):<7} {len(p.features):<10} {kept}")

    if weights:
        print("\nwhat each comparison is worth at its strongest level")
        for name, bits in sorted(weights.items(), key=lambda kv: -kv[1]):
            note = "" if name in link.SCORED_COMPARISONS else "  (not scored)"
            print(f"  {name:<14} {bits:>7.2f} bits{note}")

    print("\nwhat each profile gives up")
    for p in PROFILES:
        if p.name == "full":
            continue
        print(f"\n  {p.name}")
        print(f"    columns:     {', '.join(p.missing_columns)}")
        print(f"    comparisons: {', '.join(p.missing_comparisons) or 'none'}")
        print(f"    features:    {', '.join(p.missing_features) or 'none'}")


def main() -> None:
    import json
    try:
        with open("results/link_params.json") as f:
            params = json.load(f)
    except FileNotFoundError:
        params = None
        print("no results/link_params.json, printing without weights")
    print_table(params)


if __name__ == "__main__":
    main()
