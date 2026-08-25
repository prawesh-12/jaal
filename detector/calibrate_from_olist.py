"""Extract three real distributions from the Olist dataset.

The generator would otherwise invent order values, repeat rates and signup
hours out of thin air, which is the most attackable part of the submission.
This script reads the raw Olist CSVs once and writes a small JSON of derived
parameters. Only that JSON is committed. The raw data is not.

Olist is Brazilian marketplace data under CC BY-NC-SA 4.0. The shape of these
distributions transfers to an Indian merchant (long tail on order value, most
customers never come back, evening activity peak). The absolute values do not,
so prices are rescaled. See TARGET_MEDIAN_INR below.

    python -m detector.calibrate_from_olist --raw-dir data/raw
"""

import argparse
import json
import os

import numpy as np
import pandas as pd

from detector.resources import announce, apply

# Olist prices are BRL. Rather than apply an FX rate, which would compare two
# very different consumer markets, prices are scaled so the median order lands
# at a plausible Indian value. Rs.450 puts the Rs.400 coupon floor just under
# the median, which is where a merchant sets it: most customers have to add one
# more item to qualify. The factor is recorded in the output so it is auditable.
TARGET_MEDIAN_INR = 450

REQUIRED = ("olist_orders_dataset.csv",
            "olist_order_items_dataset.csv",
            "olist_customers_dataset.csv")


def _check_raw(raw_dir: str) -> None:
    missing = [f for f in REQUIRED if not os.path.exists(os.path.join(raw_dir, f))]
    if missing:
        raise SystemExit(
            f"missing {len(missing)} Olist file(s) in {raw_dir}: {', '.join(missing)}\n"
            f"Get them from https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce\n"
            f"and unzip into {raw_dir}. The raw data is never committed; only the\n"
            f"derived {os.path.basename('olist_priors.json')} is."
        )


PERCENTILE_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100]


def order_values(items: pd.DataFrame) -> tuple[dict, float]:
    """Order value distribution in rupees, plus the scale factor used.

    An order can hold several items, so order value is the sum of item prices
    within an order, not a single item's price.

    Deciles alone are not enough. Olist's top decile runs from Rs.1,398 to
    Rs.69,597, so a generator sampling uniformly inside it would give one order
    in ten an absurd value. The extra 95th and 99th points let the generator
    keep the long tail without inventing it.
    """
    per_order = items.groupby("order_id")["price"].sum()
    scale = TARGET_MEDIAN_INR / float(per_order.median())
    inr = per_order * scale
    values = [int(round(v)) for v in np.percentile(inr, PERCENTILE_POINTS)]
    deciles = [v for p, v in zip(PERCENTILE_POINTS, values) if p % 10 == 0]
    return {"value_percentile_points": PERCENTILE_POINTS,
            "value_percentile_values": values,
            "value_deciles": deciles}, scale


def repeat_rate(orders: pd.DataFrame, customers: pd.DataFrame) -> float:
    """Fraction of real people who ordered more than once.

    customer_id is per order in Olist. customer_unique_id is the person.
    """
    per_person = (orders.merge(customers, on="customer_id")
                        .groupby("customer_unique_id").size())
    return float((per_person > 1).mean())


def hour_weights(orders: pd.DataFrame) -> list[float]:
    """24 buckets, normalised, of when orders actually get placed."""
    hours = pd.to_datetime(orders["order_purchase_timestamp"]).dt.hour
    counts = hours.value_counts(normalize=True).reindex(range(24), fill_value=0.0)
    return [round(float(v), 6) for v in counts.tolist()]


def build(raw_dir: str) -> dict:
    _check_raw(raw_dir)
    items = pd.read_csv(os.path.join(raw_dir, "olist_order_items_dataset.csv"),
                        usecols=["order_id", "price"])
    orders = pd.read_csv(os.path.join(raw_dir, "olist_orders_dataset.csv"),
                         usecols=["order_id", "customer_id",
                                  "order_purchase_timestamp"])
    customers = pd.read_csv(os.path.join(raw_dir, "olist_customers_dataset.csv"),
                            usecols=["customer_id", "customer_unique_id"])

    values, scale = order_values(items)
    return {
        "source": "Olist Brazilian E-Commerce, CC BY-NC-SA 4.0",
        "source_url": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
        "n_orders": int(len(orders)),
        "n_order_items": int(len(items)),
        "n_customers": int(customers["customer_unique_id"].nunique()),
        "brl_to_inr_scale": round(scale, 4),
        "target_median_inr": TARGET_MEDIAN_INR,
        **values,
        "repeat_rate": round(repeat_rate(orders, customers), 6),
        "hour_weights": hour_weights(orders),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raw-dir", default="data/raw")
    p.add_argument("--out", default="data/olist_priors.json")
    args = p.parse_args()

    announce(apply())
    priors = build(args.raw_dir)
    with open(args.out, "w") as f:
        json.dump(priors, f, indent=1)
        f.write("\n")

    print(f"[olist] {priors['n_orders']:,} orders, "
          f"{priors['n_customers']:,} unique customers")
    print(f"[olist] BRL to INR scale {priors['brl_to_inr_scale']} "
          f"(median order Rs.{priors['value_deciles'][5]})")
    print(f"[olist] repeat rate {priors['repeat_rate']:.4f}")
    peak = int(np.argmax(priors["hour_weights"]))
    print(f"[olist] busiest hour {peak}:00 "
          f"({priors['hour_weights'][peak] * 100:.1f}% of orders)")
    print(f"[olist] wrote {args.out}")


if __name__ == "__main__":
    main()
