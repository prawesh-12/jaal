"""What the review queue is worth once you stop making two easy assumptions.

The reviewer is not perfect, and there are not infinitely many of them. Both
assumptions sit underneath the headline saving, so both get priced here.

    python -m detector.review --accuracy
    python -m detector.review --capacity
"""

from __future__ import annotations

import argparse
import gzip
import json
import pickle

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config
from detector import decide

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


def expected_value_of_review(purity, n_accounts,
                             c_fn: int = config.COST_MISSED_ABUSER,
                             c_review: int = config.COST_ANALYST_REVIEW):
    """Rupees saved by reviewing one cluster instead of letting it through.

    Reviewing costs analyst time on every account. It saves the coupons the
    ring accounts inside would otherwise farm.
    """
    return np.asarray(purity) * np.asarray(n_accounts) * c_fn \
        - np.asarray(n_accounts) * c_review


def capacity_curve(table: pd.DataFrame, purity: np.ndarray,
                   actions: np.ndarray, n_worlds: int,
                   n_points: int = 60) -> dict:
    """Net saving as a function of how many clusters a person can get through.

    Clusters that do not fit the budget fall back to the cheaper of blocking and
    allowing, which is what a real queue does when it overflows.
    """
    sizes = table["size"].to_numpy()
    ev = expected_value_of_review(purity, sizes)

    reviewable = np.where(actions == "review")[0]
    order = reviewable[np.argsort(-ev[reviewable])]

    # What each overflowing cluster costs instead, once review is unavailable.
    fallback = decide.best_action(purity, sizes, c_review=10 ** 12)

    budgets = sorted(set(
        [0] + [int(round(x)) for x in
               np.linspace(1, len(order), n_points)] + [len(order)]))

    rows = []
    for k in budgets:
        chosen = actions.copy()
        chosen[order[k:]] = fallback[order[k:]]
        r = decide.score_policy(table, chosen)
        rows.append({
            "budget_clusters": int(k),
            "budget_per_world": round(k / n_worlds, 3),
            "net_rupees": r["net_vs_nothing_rupees"],
            "accounts_reviewed": r["accounts_reviewed"],
            "recall_including_review": r["recall_including_review"],
        })

    full = rows[-1]["net_rupees"]
    none = rows[0]["net_rupees"]
    # Blocking earns money with no review at all, so the share of the *total*
    # saving starts high and says little about the budget. The share of what
    # review itself adds is the number the budget actually controls.
    review_benefit = full - none
    for r in rows:
        r["share_of_full_benefit"] = (round(r["net_rupees"] / full, 5)
                                      if full else 0.0)
        r["share_of_review_benefit"] = (
            round((r["net_rupees"] - none) / review_benefit, 5)
            if review_benefit else 0.0)

    def first_k_reaching(share: float) -> dict | None:
        for r in rows:
            if r["share_of_review_benefit"] >= share:
                return r
        return None

    best = max(rows, key=lambda r: r["net_rupees"])
    dips = [{"from": rows[i]["budget_clusters"],
             "to": rows[i + 1]["budget_clusters"],
             "rupees": rows[i + 1]["net_rupees"] - rows[i]["net_rupees"]}
            for i in range(len(rows) - 1)
            if rows[i + 1]["net_rupees"] < rows[i]["net_rupees"]]

    return {
        "n_reviewable_clusters": int(len(order)),
        "n_worlds": n_worlds,
        "best_budget": best,
        "steps_where_more_capacity_paid_less": dips,
        "net_with_unlimited_review_rupees": full,
        "net_with_no_review_rupees": none,
        "review_attributable_benefit_rupees": review_benefit,
        "curve": rows,
        "reaches_50_percent": first_k_reaching(0.50),
        "reaches_80_percent": first_k_reaching(0.80),
        "reaches_90_percent": first_k_reaching(0.90),
        "reaches_95_percent": first_k_reaching(0.95),
        "ev_top": [{"rank": i + 1, "ev_rupees": int(round(float(ev[j]))),
                    "size": int(sizes[j]),
                    "predicted_purity": round(float(purity[j]), 4)}
                   for i, j in enumerate(order[:5])],
    }


def from_features(features_path: str = "results/features_holdout.csv",
                  model_path: str = "results/model.pkl") -> dict:
    with gzip.open(model_path, "rb") as f:
        model = pickle.load(f)
    table = pd.read_csv(features_path)
    X = table[model["features"]]
    purity = np.clip(model["purity"].predict(X), 0.0, 1.0)
    actions = decide.best_action(purity, table["size"].to_numpy())
    n_worlds = int(table.groupby(["tier", "seed"]).ngroups)
    return capacity_curve(table, purity, actions, n_worlds)


def plot_capacity(report: dict, path: str) -> None:
    rows = report["curve"]
    k = [r["budget_per_world"] for r in rows]
    net = [r["net_rupees"] / 1e6 for r in rows]
    full = report["net_with_unlimited_review_rupees"] / 1e6

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(k, net, lw=2, label="net saving")
    none = report["net_with_no_review_rupees"] / 1e6
    ax.axhline(full, ls="--", c="grey",
               label=f"unlimited review (Rs.{full:.2f}M)")
    ax.axhline(none, ls="-.", c="tab:red", alpha=0.6,
               label=f"blocking only, no analyst (Rs.{none:.2f}M)")
    for share, colour, offset in ((0.80, "tab:orange", (-210, -50)),
                                  (0.95, "tab:green", (-190, 22))):
        hit = report[f"reaches_{int(share * 100)}_percent"]
        if hit:
            ax.axvline(hit["budget_per_world"], c=colour, alpha=0.5)
            ax.annotate(f"{int(share * 100)}% of what review adds\n"
                        f"at {hit['budget_per_world']:.2f} clusters per batch",
                        (hit["budget_per_world"], hit["net_rupees"] / 1e6),
                        textcoords="offset points", xytext=offset,
                        fontsize=8.5,
                        arrowprops=dict(arrowstyle="->", color=colour))
    ax.set_xlabel("clusters a person can review per batch of 12,000 accounts")
    ax.set_ylabel("net saving, rupees (millions)")
    ax.set_title("What a bounded review queue is worth\n"
                 "clusters ranked by expected value of review, "
                 "overflow falls back to allow")
    ax.legend(fontsize=9, loc="lower right")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def print_capacity(report: dict) -> None:
    print(f"\nReview capacity, sealed holdout. "
          f"{report['n_reviewable_clusters']:,} clusters would be reviewed "
          f"with an unlimited queue, across {report['n_worlds']} batches.")
    print(f"That is worth Rs.{report['net_with_unlimited_review_rupees']:,}. "
          f"With no review at all the system nets "
          f"Rs.{report['net_with_no_review_rupees']:,}.\n")
    print(f"Review itself is worth "
          f"Rs.{report['review_attributable_benefit_rupees']:,} of that. The "
          f"rest comes from blocking, which needs no analyst.\n")
    print(f"{'clusters per batch':<20}{'total':<9}{'net':>15}"
          f"{'of review benefit':>19}{'recall incl review':>21}")
    print("-" * 84)
    step = max(1, len(report["curve"]) // 12)
    for r in report["curve"][::step] + [report["curve"][-1]]:
        print(f"{r['budget_per_world']:<20.2f}{r['budget_clusters']:<9}"
              f"{'Rs.' + format(r['net_rupees'], ','):>15}"
              f"{r['share_of_review_benefit']:>19.4f}"
              f"{r['recall_including_review']:>21.4f}")
    print()
    for share in (50, 80, 90, 95):
        hit = report[f"reaches_{share}_percent"]
        if hit:
            print(f"{share}% of what review adds needs "
                  f"{hit['budget_per_world']:.2f} clusters per batch "
                  f"({hit['budget_clusters']:,} across {report['n_worlds']})")
    dips = report["steps_where_more_capacity_paid_less"]
    best = report["best_budget"]
    if dips:
        print(f"\n{len(dips)} of {len(report['curve']) - 1} steps paid less "
              f"with more capacity, the worst by Rs.{min(d['rupees'] for d in dips):,}. "
              f"A cluster pushed out of the queue falls back to blocking, and "
              f"blocking a genuinely pure cluster costs nothing while reviewing "
              f"it costs Rs.{config.COST_ANALYST_REVIEW} an account.")
        print(f"Best budget on this holdout is {best['budget_per_world']:.2f} "
              f"clusters per batch at Rs.{best['net_rupees']:,}, "
              f"Rs.{best['net_rupees'] - report['net_with_unlimited_review_rupees']:,} "
              f"above an unlimited queue.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--accuracy", action="store_true",
                    help="review accuracy sensitivity")
    ap.add_argument("--capacity", action="store_true",
                    help="net saving against a bounded review budget")
    ap.add_argument("--holdout", default="results/holdout.json")
    ap.add_argument("--features", default="results/features_holdout.csv")
    args = ap.parse_args()

    both = not (args.accuracy or args.capacity)

    if args.accuracy or both:
        report = from_holdout(args.holdout)
        print_accuracy(report)
        with open("results/review_accuracy.json", "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print("\nwrote results/review_accuracy.json")

    if args.capacity or both:
        report = from_features(args.features)
        print_capacity(report)
        plot_capacity(report, "results/review_capacity.png")
        with open("results/review_capacity.json", "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print("\nwrote results/review_capacity.json, "
              "results/review_capacity.png")


if __name__ == "__main__":
    main()
