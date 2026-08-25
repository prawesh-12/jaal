"""Fellegi-Sunter pair scoring.

Exact matching asks "do these two accounts share a device?" and finds nothing
once the operator buys a new phone for each account. This asks a different
question: how much evidence is there that these two accounts belong to the same
operator, added up across every field worth comparing?

Each comparison contributes a weight in bits:

    weight = log2(m / u)

    m = how often this field agrees when the two really are one operator
    u = how often it agrees between two strangers, by chance

Six weak signals at 1.5 bits each sum to 9 bits, which outweighs one device
match. Exact matching throws every weak signal away. This adds them up.

Two details matter more than the formula.

**Comparison levels.** Agreeing within an hour is much stronger evidence than
agreeing within a day, so a comparison has ordered levels and exactly one fires
per pair. Summing "within 1h" and "within 24h" separately would count the same
evidence twice.

**Term frequency.** Two accounts sharing a device seen twice in the whole
population is enormous evidence. Sharing one seen 300 times is almost none. A
single weight per field cannot say that. A per-value u can, and it is the reason
this beats hand-tuned rules.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

import config

HOUR = 3_600
DAY = 86_400

# Levels are ordered and mutually exclusive. The last one is always the
# catch-all, so every pair lands on exactly one level of every comparison.
LEVELS = {
    "device":      ("exact", "no"),
    "address":     ("exact", "no"),
    "pincode":     ("exact", "no"),
    "card_bin":    ("exact", "no"),
    "ip_prefix":   ("exact", "no"),
    "signup_gap":  ("within_1h", "within_24h", "within_7d", "within_30d", "no"),
    "hour_of_day": ("within_1h", "within_3h", "no"),
    "order_value": ("within_50", "within_200", "no"),
    "coupon_floor": ("both_near_floor", "no"),
    "order_count": ("both_one_order", "equal", "no"),
    "coupon_used": ("both_used", "both_unused", "no"),
}
COMPARISONS = tuple(LEVELS)

# Two comparisons are computed and then deliberately left out of the score.
#
# Both say "the ring ordered near-identical amounts, just above the coupon
# floor". That is true of a careless operator and false of a careful one, and
# because m is estimated from a seed set of careless operators, their
# no-agreement levels carry weights of -6.6 and -7.0 bits. So a ring that
# jitters its order values is actively punished for it, which is exactly
# backwards: the harder the case, the bigger the penalty.
#
# Measured on three independent blocks of ten validation worlds, removing them
# lifts sophisticated pair recall from 0.60, 0.47 and 0.55 to 0.84, 0.74 and
# 0.86, and adaptive recall from 0.14, 0.17 and 0.20 to 0.50, 0.49 and 0.56.
# Precision and edge count both improve too. Capping negative weights was tried
# instead and recovered only about half of it. See D-016.
EXCLUDED_COMPARISONS = ("coupon_floor", "order_value")
SCORED_COMPARISONS = tuple(c for c in COMPARISONS
                           if c not in EXCLUDED_COMPARISONS)

# Comparisons whose agreement level gets a per-value u instead of a global one.
# All five are identifiers where rarity is the whole point.
TF_FIELDS = {
    "device": "device_id",
    "address": "address_id",
    "pincode": "pincode",
    "card_bin": "card_bin",
    "ip_prefix": "ip_prefix",
}

NEEDED_COLUMNS = ("device_id", "address_id", "pincode", "card_bin", "ip_prefix",
                  "signup_ts", "n_orders", "coupon_used", "first_order_value")

U_FLOOR = 1e-7      # a u of exactly zero gives infinite weight
M_FLOOR = 1e-4

# How hard the term frequency adjustment pulls. 0 turns it off and every
# agreement on a field is worth the same. 1 applies it in full, so agreement on
# a value held by two accounts is worth log2 of the squared rarity. Splink
# exposes the same knob as tf_adjustment_weight, because the full adjustment
# over-credits rare values of a low cardinality field: a pincode held by twelve
# unrelated people is rare, and it is still twelve unrelated people. Measured
# over ten validation worlds: 0.25, 0.5, 0.75 and 1.0 gave mean pair F1 of
# 0.6001, 0.6047, 0.6049 and 0.5957 across the three tiers that work at all.
TF_WEIGHT = 0.75


class PairView:
    """Column values for the left and right side of every candidate pair."""

    def __init__(self, accounts: pd.DataFrame, pairs: np.ndarray):
        self.n = len(accounts)
        self.n_pairs = len(pairs)
        self.i = pairs[:, 0]
        self.j = pairs[:, 1]
        self._col = {c: accounts[c].to_numpy() for c in NEEDED_COLUMNS}

    def left(self, col: str) -> np.ndarray:
        return self._col[col][self.i]

    def right(self, col: str) -> np.ndarray:
        return self._col[col][self.j]

    def column(self, col: str) -> np.ndarray:
        return self._col[col]


def _circular_hour_gap(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Hours apart on a 24 hour clock, so 23:00 and 01:00 are two apart."""
    ha = (a // HOUR) % 24
    hb = (b // HOUR) % 24
    d = np.abs(ha - hb)
    return np.minimum(d, 24 - d)


def compare(view: PairView) -> dict[str, np.ndarray]:
    """Which level each comparison lands on, for every pair. Vectorised.

    Returns integer level indices, not booleans, because exactly one level of
    each comparison fires and the index is what the weight table is keyed on.
    """
    out: dict[str, np.ndarray] = {}

    for name, col in TF_FIELDS.items():
        agree = view.left(col) == view.right(col)
        out[name] = np.where(agree, 0, 1).astype(np.int8)

    gap = np.abs(view.left("signup_ts") - view.right("signup_ts"))
    out["signup_gap"] = np.digitize(
        gap, [HOUR + 1, DAY + 1, 7 * DAY + 1, 30 * DAY + 1]).astype(np.int8)

    hour_gap = _circular_hour_gap(view.left("signup_ts"), view.right("signup_ts"))
    out["hour_of_day"] = np.digitize(hour_gap, [2, 4]).astype(np.int8)

    dv = np.abs(view.left("first_order_value") - view.right("first_order_value"))
    out["order_value"] = np.digitize(dv, [51, 201]).astype(np.int8)

    lo, hi = config.COUPON_MIN_ORDER, config.COUPON_MIN_ORDER + 200
    near_a = ((view.left("first_order_value") >= lo)
              & (view.left("first_order_value") < hi))
    near_b = ((view.right("first_order_value") >= lo)
              & (view.right("first_order_value") < hi))
    out["coupon_floor"] = np.where(near_a & near_b, 0, 1).astype(np.int8)

    na, nb = view.left("n_orders"), view.right("n_orders")
    out["order_count"] = np.where((na == 1) & (nb == 1), 0,
                                  np.where(na == nb, 1, 2)).astype(np.int8)

    ca, cb = view.left("coupon_used"), view.right("coupon_used")
    out["coupon_used"] = np.where(ca & cb, 0,
                                  np.where(~ca & ~cb, 1, 2)).astype(np.int8)
    return out


def weight_table(params: dict) -> dict[str, np.ndarray]:
    """log2(m / u) per level, as arrays the scorer can index straight into."""
    table = {}
    for name in COMPARISONS:
        m = np.asarray(params["m"][name], dtype=float)
        u = np.asarray(params["u"][name], dtype=float)
        table[name] = np.log2(np.maximum(m, M_FLOOR) / np.maximum(u, U_FLOOR))
    return table


def value_frequencies(accounts: pd.DataFrame) -> dict[str, dict]:
    """How common each value of each term frequency field is, in this world."""
    n = len(accounts)
    out = {}
    for name, col in TF_FIELDS.items():
        counts = accounts[col].value_counts()
        out[name] = (counts / n).to_dict()
    return out


def score_pairs(accounts: pd.DataFrame, pairs: np.ndarray, params: dict,
                tf_weight: float = TF_WEIGHT, comparisons=SCORED_COMPARISONS
                ) -> tuple[np.ndarray, np.ndarray]:
    """Total bits per pair, and the per-comparison breakdown that produced it.

    The breakdown is returned, not discarded. It is what makes a flagged cluster
    explainable later: "matched on signup timing +9.1 bits, pincode +7.7" is a
    sentence a reviewer can act on. A bare total is not.
    """
    view = PairView(accounts, pairs)
    levels = compare(view)
    table = weight_table(params)

    contributions = np.zeros((view.n_pairs, len(comparisons)), dtype=np.float32)
    for k, name in enumerate(comparisons):
        bits = table[name][levels[name]]

        if tf_weight > 0 and name in TF_FIELDS:
            # Correct the agreement weight by how rare the shared value is.
            # Sharing a device that two accounts have is not the same evidence
            # as sharing one that three hundred accounts have.
            col = TF_FIELDS[name]
            agreed = levels[name] == 0
            if agreed.any():
                freq = pd.Series(view.column(col)).value_counts(normalize=True)
                p = freq.reindex(view.left(col)[agreed]).to_numpy()
                u0 = max(float(params["u"][name][0]), U_FLOOR)
                shift = np.log2(u0 / np.maximum(p * p, U_FLOOR))
                bits = bits.copy()
                bits[agreed] = bits[agreed] + tf_weight * shift

        contributions[:, k] = bits

    return contributions.sum(axis=1), contributions


def bits_to_probability(bits: np.ndarray, prior_odds: float) -> np.ndarray:
    """Turn a match weight back into a real probability of sharing an operator."""
    odds = prior_odds * np.exp2(np.clip(bits, -200, 200))
    return odds / (1.0 + odds)


def explain_pair(contributions_row: np.ndarray, comparisons=SCORED_COMPARISONS,
                 top: int = 5) -> list[tuple[str, float]]:
    """The strongest few reasons one pair scored what it did."""
    order = np.argsort(-np.abs(contributions_row))[:top]
    return [(comparisons[k], round(float(contributions_row[k]), 2))
            for k in order if abs(contributions_row[k]) > 0.01]


# --------------------------------------------------------------------------
# evaluation: threshold sweep and ablation (step 2.5)
# --------------------------------------------------------------------------

def pair_metrics(world, pairs: np.ndarray, bits: np.ndarray,
                 thresholds) -> list[dict]:
    """Pair precision and recall at each match weight threshold.

    Recall counts every true pair in the world, including pairs blocking never
    generated. That is the honest denominator: a pair no rule produced is a
    pair this pipeline can never recover, and hiding it behind the candidate
    set would flatter the number.
    """
    from detector.blocking import true_pair_codes

    n = len(world.accounts)
    codes = pairs[:, 0] * n + pairs[:, 1]
    truth = true_pair_codes(world)
    is_true = np.isin(codes, truth)
    n_true_total = len(truth)

    out = []
    for t in thresholds:
        keep = bits >= t
        tp = int((keep & is_true).sum())
        predicted = int(keep.sum())
        out.append({
            "threshold_bits": float(t),
            "edges": predicted,
            "tp": tp,
            "fp": predicted - tp,
            "precision": round(tp / predicted, 4) if predicted else 0.0,
            "recall": round(tp / n_true_total, 4) if n_true_total else 0.0,
        })
    return out


def evaluate_world(world, params, thresholds, tf_weight: float = TF_WEIGHT,
                   comparisons=SCORED_COMPARISONS) -> list[dict]:
    from detector.blocking import candidate_pairs

    pairs, _ = candidate_pairs(world.accounts)
    bits, _ = score_pairs(world.accounts, pairs, params, tf_weight, comparisons)
    return pair_metrics(world, pairs, bits, thresholds)
