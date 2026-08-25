"""The committed priors must be usable without the raw Olist data present."""

import json

import pandas as pd
import pytest

import config
from detector import calibrate_from_olist as cal


@pytest.fixture(scope="module")
def priors():
    with open(config.OLIST_PRIORS_PATH) as f:
        return json.load(f)


def test_hour_weights_are_a_distribution(priors):
    w = priors["hour_weights"]
    assert len(w) == 24
    assert all(x >= 0 for x in w)
    assert abs(sum(w) - 1.0) < 1e-4


def test_value_percentiles_are_monotonic_integers(priors):
    v = priors["value_percentile_values"]
    assert len(v) == len(priors["value_percentile_points"])
    assert all(isinstance(x, int) for x in v)
    assert v == sorted(v)


def test_repeat_rate_is_a_fraction(priors):
    assert 0.0 < priors["repeat_rate"] < 1.0


def test_median_order_sits_just_above_the_coupon_floor(priors):
    """The Rs.400 floor should be a real constraint, not a formality."""
    median = priors["value_percentile_values"][
        priors["value_percentile_points"].index(50)]
    assert config.COUPON_MIN_ORDER < median < 2 * config.COUPON_MIN_ORDER


def test_repeat_rate_counts_people_not_orders():
    orders = pd.DataFrame({"order_id": list("abcd"),
                           "customer_id": ["c1", "c2", "c3", "c4"]})
    customers = pd.DataFrame({"customer_id": ["c1", "c2", "c3", "c4"],
                              "customer_unique_id": ["p1", "p1", "p2", "p3"]})
    # p1 ordered twice, p2 and p3 once each: 1 of 3 people repeated.
    assert cal.repeat_rate(orders, customers) == pytest.approx(1 / 3)


def test_order_value_sums_items_within_an_order():
    items = pd.DataFrame({"order_id": ["a", "a", "b", "c"],
                          "price": [10.0, 10.0, 20.0, 60.0]})
    values, scale = cal.order_values(items)
    # order totals are 20, 20, 60 so the median is 20, scaled to the target.
    assert scale == pytest.approx(cal.TARGET_MEDIAN_INR / 20.0)
    mid = values["value_percentile_values"][
        values["value_percentile_points"].index(50)]
    assert mid == cal.TARGET_MEDIAN_INR
