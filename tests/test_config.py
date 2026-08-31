"""Config invariants that the rest of the pipeline quietly depends on."""

import config


def test_money_is_integers():
    for name in ("COUPON_MIN_ORDER", "COUPON_VALUE", "COST_MISSED_ABUSER",
                 "COST_BLOCKED_INNOCENT", "COST_ANALYST_REVIEW"):
        assert isinstance(getattr(config, name), int), f"{name} must be int rupees"


def test_cost_asymmetry_is_the_one_the_plan_assumes():
    ratio = config.COST_BLOCKED_INNOCENT / config.COST_MISSED_ABUSER
    assert 70 <= ratio <= 80


def test_seed_ranges_do_not_overlap():
    train = set(config.TRAIN_SEEDS)
    val = set(config.VALIDATION_SEEDS)
    holdout = set(config.HOLDOUT_SEEDS)
    assert not train & val
    assert not train & holdout
    assert not val & holdout
    assert holdout == set(range(900, 1000))


def test_four_tiers_ordered_from_careless_to_evasive():
    assert config.TIER_NAMES == ["obvious", "moderate", "sophisticated", "adaptive"]
    reuse = [config.TIERS[t]["device_reuse"] for t in config.TIER_NAMES]
    assert reuse == sorted(reuse, reverse=True)
    windows = [config.TIERS[t]["signup_window_days"] for t in config.TIER_NAMES]
    assert windows == sorted(windows)


def test_adaptive_tier_shares_no_devices():
    assert config.TIERS["adaptive"]["device_reuse"] == 0.0
