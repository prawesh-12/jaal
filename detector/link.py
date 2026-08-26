"""Fellegi-Sunter pair scoring.

Scores how much evidence there is that two accounts belong to one operator.
Each comparison adds log2(m / u) bits, where m is how often a field agrees for
one operator and u is how often it agrees by chance. Six weak signals can add up
to more than one device match. Exact matching cannot do that.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

import config

HOUR = 3_600
DAY = 86_400

# Ordered, mutually exclusive levels, catch-all last, so exactly one fires.
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

# Both punish a ring for varying its order values. Dropping them lifts pair
# recall on the hardest tier from 0.14 to 0.50.
EXCLUDED_COMPARISONS = ("coupon_floor", "order_value")
SCORED_COMPARISONS = tuple(c for c in COMPARISONS
                           if c not in EXCLUDED_COMPARISONS)

# Identifiers that get a per-value u instead of a global one. For these fields
# a rare value is much better evidence than a common one.
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

# How much of the term frequency adjustment to apply. 0.75 gave the best mean
# pair F1 over ten validation worlds, 0.6049 against 0.5957 for the full
# adjustment.
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

    Returns level indices, not booleans: the weight table is keyed on the index.
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

    We keep the breakdown so a flagged cluster can be explained later.
    """
    view = PairView(accounts, pairs)
    levels = compare(view)
    table = weight_table(params)

    contributions = np.zeros((view.n_pairs, len(comparisons)), dtype=np.float32)
    for k, name in enumerate(comparisons):
        bits = table[name][levels[name]]

        if tf_weight > 0 and name in TF_FIELDS:
            # A device two accounts share is far stronger evidence than one
            # three hundred accounts share.
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


def pair_metrics(world, pairs: np.ndarray, bits: np.ndarray,
                 thresholds) -> list[dict]:
    """Pair precision and recall at each match weight threshold.

    Recall counts every true pair in the world, including the ones blocking
    never produced. Those missed pairs still count against us.
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
