"""The Phase 0 check list, written as tests so it stays true.

These run on small worlds. The full-size checks live in
scripts/check_phase0.py, which is what produces the numbers in the phase doc.
"""

import numpy as np
import pytest

import config
from detector import generate_accounts as gen

SMALL = 1500


@pytest.fixture(scope="module")
def priors():
    return gen.load_priors()


@pytest.fixture(scope="module")
def worlds(priors):
    return {t: gen.generate(3, t, SMALL, priors) for t in config.TIER_NAMES}


def test_world_is_the_size_asked_for(worlds):
    for w in worlds.values():
        assert len(w.accounts) == SMALL
        assert len(w.truth) == SMALL


def test_prevalence_lands_between_seven_and_nine_per_thousand(worlds):
    for tier, w in worlds.items():
        assert 0.007 <= w.prevalence <= 0.009, f"{tier}: {w.prevalence}"


def test_at_least_three_rings_and_thirty_lookalike_groups(priors):
    """Checked at full size, where the plan's counts apply."""
    w = gen.generate(0, "moderate", config.N_ACCOUNTS, priors)
    s = w.summary()
    assert s["n_rings"] >= 3
    assert s["n_lookalike_groups"] >= 30


def test_adaptive_rings_share_zero_devices(priors):
    """The trap: at the top tier there is no device edge to find."""
    for seed in range(6):
        w = gen.generate(seed, "adaptive", SMALL, priors)
        rings = w.truth.loc[w.truth["is_ring"], ["account_id", "group_id"]]
        merged = rings.merge(w.accounts[["account_id", "device_id"]], on="account_id")
        for group_id, block in merged.groupby("group_id"):
            assert block["device_id"].nunique() == len(block), (
                f"seed {seed} {group_id} reused a device at the adaptive tier")


def test_obvious_rings_all_share_one_device(priors):
    w = gen.generate(1, "obvious", SMALL, priors)
    rings = w.truth.loc[w.truth["is_ring"], ["account_id", "group_id"]]
    merged = rings.merge(w.accounts[["account_id", "device_id"]], on="account_id")
    for _, block in merged.groupby("group_id"):
        assert block["device_id"].nunique() == 1


def test_office_lookalikes_sign_up_inside_two_weeks(priors):
    """If this trap does not fire, the false-positive test is not testing anything."""
    for seed in range(4):
        w = gen.generate(seed, "moderate", SMALL, priors)
        offices = w.truth.loc[w.truth["group_type"] == "office",
                              ["account_id", "group_id"]]
        assert len(offices) > 0
        merged = offices.merge(w.accounts[["account_id", "signup_ts"]],
                               on="account_id")
        for group_id, block in merged.groupby("group_id"):
            span_days = (block["signup_ts"].max() - block["signup_ts"].min()) / 86400
            assert span_days <= 14, f"{group_id} spans {span_days:.1f} days"


def test_only_rings_share_an_operator(worlds):
    for w in worlds.values():
        counts = w.truth["operator_id"].value_counts()
        shared = counts[counts > 1].index
        multi = w.truth[w.truth["operator_id"].isin(shared)]
        assert multi["is_ring"].all(), "a benign group was given a shared operator"


def test_same_seed_gives_byte_identical_output(priors, tmp_path):
    """If the generator is not deterministic, no result is reproducible."""
    a = gen.generate(5, "sophisticated", SMALL, priors)
    b = gen.generate(5, "sophisticated", SMALL, priors)
    pa, pb = tmp_path / "a.csv", tmp_path / "b.csv"
    a.accounts.to_csv(pa, index=False)
    b.accounts.to_csv(pb, index=False)
    assert pa.read_bytes() == pb.read_bytes()
    assert a.truth.equals(b.truth)


def test_different_seeds_give_different_worlds(priors):
    a = gen.generate(5, "moderate", SMALL, priors)
    b = gen.generate(6, "moderate", SMALL, priors)
    assert not a.accounts["device_id"].equals(b.accounts["device_id"])


def test_money_columns_are_integers(worlds):
    for w in worlds.values():
        for col in ("first_order_value", "total_order_value"):
            assert np.issubdtype(w.accounts[col].dtype, np.integer), col


def test_order_values_follow_the_olist_curve(priors):
    """Median of the ordinary population should land near the calibrated median."""
    w = gen.generate(2, "moderate", 6000, priors)
    solo = w.truth["group_type"] == "normal"
    non_coupon = w.accounts.loc[solo.values & ~w.accounts["coupon_used"].values,
                                "first_order_value"]
    target = priors["value_percentile_values"][
        priors["value_percentile_points"].index(50)]
    assert 0.5 * target < non_coupon.median() < 1.6 * target


def test_ring_orders_sit_above_the_coupon_floor(worlds):
    for tier, w in worlds.items():
        vals = w.accounts.loc[w.truth["is_ring"].values, "first_order_value"]
        assert vals.min() >= config.COUPON_MIN_ORDER
        ceiling = config.COUPON_MIN_ORDER + config.TIERS[tier]["value_jitter"]
        assert vals.max() <= ceiling


def test_camouflage_only_exists_at_the_adaptive_tier(worlds):
    for tier, w in worlds.items():
        ring_rows = w.accounts.loc[w.truth["is_ring"].values]
        repeaters = (ring_rows["n_orders"] > 1).mean()
        if config.TIERS[tier]["camouflage"] == 0:
            assert repeaters == 0
        else:
            assert repeaters > 0


def test_normal_coupon_users_also_cluster_above_the_floor(priors):
    """Otherwise 'ordered just above Rs.400' would be a giveaway that rings alone have."""
    w = gen.generate(4, "moderate", 6000, priors)
    solo = (w.truth["group_type"] == "normal").values
    used = w.accounts["coupon_used"].values
    vals = w.accounts.loc[solo & used, "first_order_value"]
    assert vals.min() >= config.COUPON_MIN_ORDER
    near_floor = (vals < config.COUPON_MIN_ORDER + gen.COUPON_TOPUP_MAX).mean()
    assert near_floor > 0.2


def test_opaque_ids_do_not_leak_group_membership(priors):
    """Rings are built first. If ids were handed out in build order, every ring
    account would carry a low id and a model could read the answer off it."""
    for tier in ("obvious", "adaptive"):
        w = gen.generate(7, tier, config.N_ACCOUNTS, priors)
        n = len(w.accounts)
        ring_pos = np.array([int(a[1:]) for a in
                             w.truth.loc[w.truth["is_ring"], "account_id"]])
        # A ring holding the lowest ids would push this mean far below n / 2.
        assert 0.30 * n < ring_pos.mean() < 0.70 * n, f"{tier}: {ring_pos.mean()}"

        dev = w.accounts.loc[w.truth["is_ring"].values, "device_id"]
        dev_pos = np.array([int(d[2:], 16) for d in dev])
        assert dev_pos.mean() > 0.15 * w.accounts["device_id"].nunique()
