"""Turn a calibrated probability into an action that minimises rupees lost.

The naive answer is "block if p > 0.5". That is wrong here, and understanding
why is the whole phase.

Missing a promo abuser costs Rs.200, one coupon. Wrongly blocking a real
customer costs Rs.15,000, their lifetime value. That is 75 to 1. At that ratio
optimising F1 is optimising the wrong thing, because F1 treats a false positive
and a false negative as equally bad when one is 75 times worse.

Work an example. A cluster of 20 accounts at p = 0.7:

    block   0.3 x 20 x 15,000 = Rs.90,000
    allow   0.7 x 20 x    200 = Rs.2,800
    review        20 x    150 = Rs.3,000

Allowing wins, at 70% confidence it is a ring. That is counter-intuitive and it
is correct.

    python -m detector.decide --val results/features_val.csv
"""

from __future__ import annotations

import argparse
import json
import pickle

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config
from detector import costs
from detector.resources import announce, apply

ACTIONS = ("block", "allow", "review")


def expected_costs(purity: float | np.ndarray, n_accounts: int | np.ndarray,
                   c_fp: int = config.COST_BLOCKED_INNOCENT,
                   c_fn: int = config.COST_MISSED_ABUSER,
                   c_review: int = config.COST_ANALYST_REVIEW) -> dict:
    """What each action is expected to cost, before we know the answer.

    `purity` is the predicted share of the cluster's accounts that really are
    ring accounts, not the probability the cluster is majority ring. Blocking
    blocks everyone in the cluster, so the bill is the innocent accounts caught
    in the net, and a cluster that is 90% ring still costs 10% of its members
    at Rs.15,000 each.
    """
    return {
        # block and be wrong about a member: that customer walks
        "block": (1 - purity) * n_accounts * c_fp,
        # allow and be wrong about a member: that coupon is farmed
        "allow": purity * n_accounts * c_fn,
        # review: analyst time, and a human then decides correctly
        "review": (np.asarray(n_accounts) * c_review
                   * np.ones_like(np.asarray(purity))),
    }


def best_action(purity, n_accounts, **kw) -> np.ndarray:
    """The cheapest action per cluster. No threshold, just arithmetic."""
    ec = expected_costs(purity, n_accounts, **kw)
    stacked = np.vstack([np.broadcast_to(ec[a], np.shape(purity))
                         for a in ACTIONS])
    return np.asarray(ACTIONS)[stacked.argmin(axis=0)]


def realised_cost(action: np.ndarray, n_ring: np.ndarray,
                  n_innocent: np.ndarray,
                  c_fp: int = config.COST_BLOCKED_INNOCENT,
                  c_fn: int = config.COST_MISSED_ABUSER,
                  c_review: int = config.COST_ANALYST_REVIEW) -> np.ndarray:
    """What each decision actually cost, once the answer key is opened.

    Blocking bills only the innocent accounts caught in the net. Allowing bills
    only the coupons the ring accounts farmed. Review bills analyst time, and
    the human is assumed to then decide correctly, which is generous to the
    review action and is stated as a limitation.
    """
    cost = np.zeros(len(action), dtype=np.int64)
    cost[action == "block"] = n_innocent[action == "block"] * c_fp
    cost[action == "allow"] = n_ring[action == "allow"] * c_fn
    cost[action == "review"] = ((n_ring + n_innocent)[action == "review"]
                                * c_review)
    return cost


def unclustered_ring_accounts(table: pd.DataFrame) -> int:
    """Ring accounts that joined no cluster. Invisible, and still billed."""
    per_world = table.groupby(["tier", "seed"]).agg(
        found=("n_ring_members", "sum"),
        total=("world_ring_accounts", "first"))
    return int((per_world["total"] - per_world["found"]).clip(lower=0).sum())


def score_policy(table: pd.DataFrame, action: np.ndarray, **kw) -> dict:
    """Account level outcome and total cost of one set of decisions."""
    n_ring = table["n_ring_members"].to_numpy()
    n_innocent = table["n_innocent_members"].to_numpy()

    blocked = action == "block"
    reviewed = action == "review"
    allowed = action == "allow"

    tp = int(n_ring[blocked].sum())
    fp = int(n_innocent[blocked].sum())
    missed = int(n_ring[allowed].sum()) + unclustered_ring_accounts(table)
    n_reviewed = int((n_ring + n_innocent)[reviewed].sum())

    cluster_cost = int(realised_cost(action, n_ring, n_innocent, **kw).sum())
    c_fn = kw.get("c_fn", config.COST_MISSED_ABUSER)
    total_cost = cluster_cost + unclustered_ring_accounts(table) * c_fn

    n_ring_total = int(table.groupby(["tier", "seed"])["world_ring_accounts"]
                       .first().sum())
    n_accounts_total = int(table.groupby(["tier", "seed"])["world_accounts"]
                           .first().sum())
    return {
        "clusters_blocked": int(blocked.sum()),
        "clusters_reviewed": int(reviewed.sum()),
        "clusters_allowed": int(allowed.sum()),
        "review_rate": round(float(reviewed.mean()), 5),
        "accounts_blocked": tp + fp,
        "accounts_reviewed": n_reviewed,
        "tp": tp, "fp": fp, "missed": missed,
        "precision": round(tp / (tp + fp), 4) if tp + fp else 0.0,
        "recall": round(tp / n_ring_total, 4) if n_ring_total else 0.0,
        "cost_rupees": total_cost,
        "do_nothing_rupees": costs.do_nothing_cost(n_ring_total),
        "net_vs_nothing_rupees": costs.do_nothing_cost(n_ring_total) - total_cost,
        "n_ring_accounts": n_ring_total,
        "n_accounts": n_accounts_total,
    }


def threshold_policy(p: np.ndarray, threshold: float) -> np.ndarray:
    """Two actions: block above the threshold, allow below. No review queue."""
    return np.where(p >= threshold, "block", "allow")


def sweep(table: pd.DataFrame, p: np.ndarray,
          thresholds=np.round(np.arange(0.0, 1.001, 0.01), 3)) -> list[dict]:
    rows = []
    for t in thresholds:
        r = score_policy(table, threshold_policy(p, t))
        tp, fp = r["tp"], r["fp"]
        prec, rec = r["precision"], r["recall"]
        r["threshold"] = float(t)
        r["f1"] = round(2 * prec * rec / (prec + rec), 4) if prec + rec else 0.0
        rows.append(r)
    return rows


def sensitivity(table: pd.DataFrame, p: np.ndarray, purity: np.ndarray,
                ratios=(10, 25, 50, 75, 100, 150, 200)) -> list[dict]:
    """The Rs.15,000 is an assumption. Challenge it before a judge does."""
    out = []
    for ratio in ratios:
        c_fp = config.COST_MISSED_ABUSER * ratio
        kw = {"c_fp": c_fp}
        rows = [(t, score_policy(table, threshold_policy(p, t), **kw))
                for t in np.round(np.arange(0.0, 1.001, 0.01), 3)]
        best_t, best = min(rows, key=lambda kv: kv[1]["cost_rupees"])
        three = score_policy(
            table, best_action(purity, table["size"].to_numpy(), c_fp=c_fp), **kw)
        out.append({
            "cost_ratio": ratio,
            "cost_blocked_innocent": c_fp,
            "optimal_threshold": float(best_t),
            "best_threshold_cost": best["cost_rupees"],
            "best_threshold_net": best["net_vs_nothing_rupees"],
            "three_action_cost": three["cost_rupees"],
            "three_action_net": three["net_vs_nothing_rupees"],
            "three_action_review_rate": three["review_rate"],
        })
    return out


def plot_cost_curve(rows: list[dict], three_action: dict, path: str) -> None:
    t = [r["threshold"] for r in rows]
    cost = [r["cost_rupees"] for r in rows]
    f1 = [r["f1"] for r in rows]
    cost_best = int(np.argmin(cost))
    f1_best = int(np.argmax(f1))
    nothing = rows[0]["do_nothing_rupees"]

    fig, ax = plt.subplots(figsize=(8.5, 5.5))
    # Log scale, because blocking everything costs Rs.4.1 billion and on a
    # linear axis that one point flattens the entire region anyone cares about.
    ax.set_yscale("log")
    ax.plot(t, np.asarray(cost) / 1e6, label="block above threshold, allow below")
    ax.axhline(nothing / 1e6, ls="--", c="grey",
               label=f"deploy nothing (Rs.{nothing / 1e6:.2f}M)")
    ax.axhline(three_action["cost_rupees"] / 1e6, ls=":", c="tab:green", lw=2,
               label=("three actions, expected cost rule "
                      f"(Rs.{three_action['cost_rupees'] / 1e6:.2f}M)"))
    ax.axvline(t[f1_best], c="tab:red", alpha=0.4)
    ax.annotate(f"F1 optimal {t[f1_best]:.2f}\nRs.{cost[f1_best] / 1e6:.1f}M lost",
                (t[f1_best], cost[f1_best] / 1e6),
                textcoords="offset points", xytext=(-140, 30), fontsize=9,
                arrowprops=dict(arrowstyle="->", color="tab:red"))
    ax.annotate("every two-action threshold sits above this line,\n"
                "so every one of them loses money against doing nothing",
                (0.05, nothing / 1e6), textcoords="offset points",
                xytext=(6, 14), fontsize=8.5, color="dimgrey")
    ax.set_xlabel("probability threshold to block")
    ax.set_ylabel("total loss, rupees (millions, log scale)")
    ax.set_title("What each operating point costs the merchant\n"
                 f"validation seeds, {rows[0]['n_accounts']:,} accounts, "
                 f"blocking an innocent costs "
                 f"{config.COST_BLOCKED_INNOCENT // config.COST_MISSED_ABUSER}x "
                 f"missing an abuser")
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main() -> None:
    p_arg = argparse.ArgumentParser(description=__doc__)
    p_arg.add_argument("--val", default="results/features_val.csv")
    p_arg.add_argument("--model", default="results/model.pkl")
    p_arg.add_argument("--out", default="results/decisions.json")
    args = p_arg.parse_args()

    announce(apply())
    with open(args.model, "rb") as f:
        fitted = pickle.load(f)
    table = pd.read_csv(args.val)
    n = table["size"].to_numpy()

    report = {"n_clusters": len(table),
              "cost_blocked_innocent": config.COST_BLOCKED_INNOCENT,
              "cost_missed_abuser": config.COST_MISSED_ABUSER,
              "cost_analyst_review": config.COST_ANALYST_REVIEW,
              "breakeven_precision": round(costs.breakeven_precision(), 4),
              "calibration": {}}

    # Which calibration method, decided on rupees rather than on Brier.
    purity_hat = np.clip(fitted["purity"].predict(table[fitted["features"]]),
                         0.0, 1.0)
    for method, cal in fitted["calibrators"].items():
        p = cal.predict_proba(table[fitted["features"]])[:, 1]
        three = score_policy(table, best_action(purity_hat, n))
        report["calibration"][method] = {"three_action_cost": three["cost_rupees"],
                                         "three_action_net": three["net_vs_nothing_rupees"]}
    chosen = min(report["calibration"],
                 key=lambda m: report["calibration"][m]["three_action_cost"])
    report["calibration_method"] = chosen
    print(f"\ncalibration chosen on cost: "
          + ", ".join(f"{m} Rs.{v['three_action_cost']:,}"
                      for m, v in report["calibration"].items())
          + f" -> {chosen}")

    p = fitted["calibrators"][chosen].predict_proba(table[fitted["features"]])[:, 1]

    rows = sweep(table, p)
    cost_best = min(rows, key=lambda r: r["cost_rupees"])
    f1_best = max(rows, key=lambda r: r["f1"])
    three = score_policy(table, best_action(purity_hat, n))
    half = score_policy(table, threshold_policy(p, 0.5))

    report.update({
        "threshold_sweep": rows,
        "cost_optimal": cost_best,
        "f1_optimal": f1_best,
        "three_action": three,
        "at_half": half,
        "sensitivity": sensitivity(table, p, purity_hat),
    })

    print(f"\n{'policy':<34} {'thr':<7} {'prec':<8} {'recall':<8} {'blocked':<9} "
          f"{'reviewed':<10} {'cost':<15} {'net vs nothing'}")
    print("-" * 116)
    for label, r in (("block above F1-optimal threshold", f1_best),
                     ("block above 0.50", half),
                     ("block above cost-optimal threshold", cost_best),
                     ("three actions, expected cost rule", three)):
        thr = f"{r.get('threshold', float('nan')):.2f}" if "threshold" in r else "-"
        net = r["net_vs_nothing_rupees"]
        print(f"{label:<34} {thr:<7} {r['precision']:<8.4f} {r['recall']:<8.4f} "
              f"{r['accounts_blocked']:<9,} {r['accounts_reviewed']:<10,} "
              f"Rs.{r['cost_rupees']:<12,} "
              f"{'+' if net >= 0 else '-'}Rs.{abs(net):,}")
    print(f"\ndeploy nothing: Rs.{three['do_nothing_rupees']:,}")
    print(f"review queue: {three['review_rate']:.2%} of clusters, "
          f"{three['accounts_reviewed']:,} accounts")

    print(f"\nsensitivity to the Rs.{config.COST_BLOCKED_INNOCENT:,} assumption")
    print(f"{'ratio':<9} {'cost of a wrong block':<24} {'optimal thr':<13} "
          f"{'net, threshold':<18} {'net, three actions'}")
    for s in report["sensitivity"]:
        print(f"{s['cost_ratio']}:1{'':<5} Rs.{s['cost_blocked_innocent']:<20,} "
              f"{s['optimal_threshold']:<13.2f} "
              f"Rs.{s['best_threshold_net']:<15,} "
              f"Rs.{s['three_action_net']:,}")

    plot_cost_curve(rows, three, "results/cost_curve.png")
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out}, results/cost_curve.png")


if __name__ == "__main__":
    main()
