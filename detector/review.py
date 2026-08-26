"""What the review queue is worth once you stop assuming the reviewer is perfect.

Two questions live here.

How accurate does the reviewer have to be? Every rupee of benefit from the
review queue assumes a person resolves each cluster correctly. That assumption
is unpriced, so this measures what happens as it weakens.

    python -m detector.review --accuracy
"""

from __future__ import annotations

import argparse
import json

import config

ACCURACIES = (1.00, 0.90, 0.80, 0.70, 0.60, 0.50)


def net_at_accuracy(net_when_perfect: int, ring_accounts_reviewed: int,
                    accuracy: float,
                    c_fn: int = config.COST_MISSED_ABUSER) -> int:
    """Net saving when a reviewer resolves only `accuracy` of ring clusters.

    A reviewer who fails leaves those ring accounts unrecovered, so each one
    costs a farmed coupon. Nothing else in the cost model moves.
    """
    return int(round(net_when_perfect
                     - (1.0 - accuracy) * ring_accounts_reviewed * c_fn))


def breakeven_accuracy(net_when_perfect: int, ring_accounts_reviewed: int,
                       c_fn: int = config.COST_MISSED_ABUSER) -> float | None:
    """The accuracy at which net saving reaches zero.

    Returns None when even a reviewer who resolves nothing still leaves the
    system ahead, which happens if blocking alone already pays for the queue.
    """
    worst_case_loss = ring_accounts_reviewed * c_fn
    if worst_case_loss == 0 or net_when_perfect >= worst_case_loss:
        return None
    return 1.0 - net_when_perfect / worst_case_loss


def accuracy_curve(result: dict, accuracies=ACCURACIES) -> dict:
    """The table, for one policy result that carries the counts it needs."""
    net = result["net_vs_nothing_rupees"]
    reviewed = result["ring_accounts_reviewed"]
    return {
        "net_when_perfect_rupees": net,
        "ring_accounts_reviewed": reviewed,
        "worst_case_review_loss_rupees": reviewed * config.COST_MISSED_ABUSER,
        "breakeven_accuracy": breakeven_accuracy(net, reviewed),
        "curve": [{"accuracy": a,
                   "net_rupees": net_at_accuracy(net, reviewed, a)}
                  for a in accuracies],
    }


def from_holdout(path: str = "results/holdout.json") -> dict:
    with open(path) as f:
        holdout = json.load(f)
    out = {"source": path,
           "cost_missed_abuser": config.COST_MISSED_ABUSER,
           "accuracies": list(ACCURACIES),
           "pooled": accuracy_curve(holdout["pooled"]),
           "tiers": {t: accuracy_curve(r)
                     for t, r in holdout["results_matrix"].items()}}
    return out


def print_accuracy(report: dict) -> None:
    p = report["pooled"]
    print(f"\nReview accuracy, sealed holdout. "
          f"{p['ring_accounts_reviewed']:,} ring accounts sit in the review "
          f"queue.")
    print(f"A reviewer who fails on one leaves it unrecovered at "
          f"Rs.{report['cost_missed_abuser']} each, so the queue can cost at "
          f"most Rs.{p['worst_case_review_loss_rupees']:,}.\n")

    tiers = list(report["tiers"])
    print(f"{'reviewer accuracy':<20}" + "".join(f"{t[:13]:>16}" for t in tiers)
          + f"{'pooled':>16}")
    print("-" * (20 + 16 * (len(tiers) + 1)))
    for i, a in enumerate(report["accuracies"]):
        row = f"{a:<20.2f}"
        for t in tiers:
            v = report["tiers"][t]["curve"][i]["net_rupees"]
            row += f"{('+' if v >= 0 else '-') + 'Rs.' + format(abs(v), ','):>16}"
        v = p["curve"][i]["net_rupees"]
        row += f"{('+' if v >= 0 else '-') + 'Rs.' + format(abs(v), ','):>16}"
        print(row)

    print(f"\n{'break-even':<20}", end="")
    for t in tiers:
        b = report["tiers"][t]["breakeven_accuracy"]
        print(f"{('never' if b is None else f'{b:.4f}'):>16}", end="")
    b = p["breakeven_accuracy"]
    print(f"{('never' if b is None else f'{b:.4f}'):>16}")
    print("\n'never' means the tier stays ahead even if the reviewer resolves "
          "nothing at all.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--accuracy", action="store_true",
                    help="review accuracy sensitivity")
    ap.add_argument("--holdout", default="results/holdout.json")
    ap.add_argument("--out", default="results/review_accuracy.json")
    args = ap.parse_args()

    if args.accuracy or True:
        report = from_holdout(args.holdout)
        print_accuracy(report)
        with open(args.out, "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
