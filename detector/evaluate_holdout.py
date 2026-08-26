"""Open the seal, run once, report whatever comes out.

Everything before this was measured on worlds that were tuned against. Those
numbers are optimistic and should be assumed wrong. Seeds 900 to 999 were sealed
before any code existed and the protocol was published in the README before any
result did.

If the holdout is worse than validation, that gap is a finding worth reporting,
not a problem to hide.

The script refuses to run twice. That sounds paranoid and it is exactly the
discipline this is testing.

    python -m detector.evaluate_holdout --accounts 12000 --seeds 900-999
"""

from __future__ import annotations

import argparse
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config
from detector import costs, decide, features
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import generate, load_priors
from detector.resources import announce, apply

SEAL_PATH = "results/holdout.json"
CURVE_SEEDS = 6            # worlds per point on the detection curve
STRESS_SEEDS = 20          # rings-free worlds for the false positive test


def _load_model(path: str) -> dict:
    import gzip
    import pickle
    with gzip.open(path, "rb") as f:
        return pickle.load(f)


def score_table(table: pd.DataFrame, fitted: dict) -> tuple[np.ndarray, np.ndarray]:
    X = table[fitted["features"]]
    p = fitted["calibrator"].predict_proba(X)[:, 1]
    purity = np.clip(fitted["purity"].predict(X), 0.0, 1.0)
    return p, purity


def results_matrix(table: pd.DataFrame, fitted: dict) -> dict:
    """The headline table. Per tier, never averaged."""
    from sklearn.metrics import average_precision_score, brier_score_loss

    p, purity = score_table(table, fitted)
    action = decide.best_action(purity, table["size"].to_numpy())

    out = {}
    for tier in config.TIER_NAMES:
        m = (table["tier"] == tier).to_numpy()
        block = table[m]
        y = block["label"].to_numpy()
        r = decide.score_policy(block, action[m])
        r["tier"] = tier
        r["n_clusters"] = int(m.sum())
        r["cluster_prevalence"] = round(float(y.mean()), 5)
        r["account_prevalence"] = round(r["n_ring_accounts"] / r["n_accounts"], 5)
        r["pr_auc"] = round(float(average_precision_score(y, p[m])), 5) if y.sum() else 0.0
        r["pr_auc_baseline"] = r["cluster_prevalence"]
        r["brier"] = round(float(brier_score_loss(y, p[m])), 5)
        out[tier] = r
    return out


SWEPT_PARAMS = ("device_reuse", "signup_window_days", "value_jitter",
                "camouflage", "accounts_per_drop")


def interpolate_tier(s: float) -> dict:
    """Operator sophistication as one dial from 0 (obvious) to 1 (adaptive).

    The plan suggests sweeping device reuse alone. Measured, that curve is flat:
    recall does not move at all as device reuse falls from 1.00 to 0.00, because
    a moderate-tier ring still shares a drop address every eight accounts and
    address linking carries the whole result. Rotating devices does not defeat
    this system. Rotating delivery addresses does. So the sweep moves every tier
    parameter together, and the device-only sweep is reported beside it as the
    negative result it is. See D-023.
    """
    lo = config.TIERS["obvious"]
    hi = config.TIERS["adaptive"]
    # Signup window runs 0.04 days to 45 and value jitter Rs.80 to Rs.1,200.
    # Interpolated linearly, the first 5% step already takes the signup window
    # from one hour to 2.3 days, which is most of the difficulty in one jump.
    # These three move geometrically, which is how they actually vary.
    geometric = ("signup_window_days", "value_jitter", "accounts_per_drop")
    out = {}
    for k in SWEPT_PARAMS:
        if k in geometric:
            out[k] = float(lo[k] * (hi[k] / lo[k]) ** s)
        else:
            out[k] = float(lo[k] + (hi[k] - lo[k]) * s)
    return out


def sweep_worlds(fitted: dict, n_accounts: int, seeds: list[int],
                 tier_params: dict, base_tier: str = "moderate") -> dict:
    priors = load_priors()
    with open("results/link_params.json") as f:
        link_params = json.load(f)
    blocks = []
    for seed in seeds:
        world = generate(seed, base_tier, n_accounts, priors,
                         tier_params=tier_params)
        blocks.extend(features.world_rows(world, link_params))
        del world
    table = pd.DataFrame(blocks)
    if table.empty:
        return {}
    _, purity = score_table(table, fitted)
    action = decide.best_action(purity, table["size"].to_numpy())
    return decide.score_policy(table, action)


def device_only_curve(fitted: dict, n_accounts: int, seeds: list[int],
                      base_tier: str = "moderate") -> list[dict]:
    """The plan's suggested sweep, kept because its flatness is the finding."""
    rows = []
    for reuse in np.round(np.arange(1.0, -0.001, -0.1), 2):
        tp = dict(config.TIERS[base_tier])
        tp["device_reuse"] = float(reuse)
        r = sweep_worlds(fitted, n_accounts, seeds, tp, base_tier)
        if r:
            rows.append({"device_reuse": float(reuse), "recall": r["recall"],
                         "recall_including_review": r["recall_including_review"],
                         "precision": r["precision"]})
            print(f"  device reuse {reuse:.2f}: recall {r['recall']:.4f} "
                  f"(+review {r['recall_including_review']:.4f}), "
                  f"precision {r['precision']:.4f}")
    return rows


def detection_curve(fitted: dict, n_accounts: int, seeds: list[int],
                    base_tier: str = "moderate") -> list[dict]:
    """Recall against operator sophistication, swept continuously.

    Four tiers give four points. This gives twenty one, by moving every tier
    parameter together from careless to fully evasive.
    """
    rows = []
    for s_val in np.round(np.arange(0.0, 1.001, 0.05), 2):
        tp = interpolate_tier(float(s_val))
        blocks = []
        del blocks
        r = sweep_worlds(fitted, n_accounts, seeds, tp, base_tier)
        if not r:
            continue
        rows.append({
            "sophistication": float(s_val),
            "device_reuse": round(tp["device_reuse"], 3),
            "accounts_per_drop": round(tp["accounts_per_drop"], 2),
            "signup_window_days": round(tp["signup_window_days"], 1),
            "recall": r["recall"],
            "recall_including_review": r["recall_including_review"],
            "precision": r["precision"],
            "accounts_blocked": r["accounts_blocked"],
            "accounts_reviewed": r["accounts_reviewed"],
            "net_vs_nothing_rupees": r["net_vs_nothing_rupees"],
        })
        print(f"  sophistication {s_val:.2f} (device reuse "
              f"{tp['device_reuse']:.2f}, {tp['accounts_per_drop']:.1f} accounts "
              f"per drop): recall {r['recall']:.4f}, "
              f"precision {r['precision']:.4f}")
    return rows


def lookalike_stress(fitted: dict, n_accounts: int, seeds: list[int]) -> dict:
    """Worlds with zero rings. Every flag is a false positive, measured directly."""
    priors = load_priors()
    with open("results/link_params.json") as f:
        link_params = json.load(f)

    blocks = []
    for seed in seeds:
        world = generate(seed, "moderate", n_accounts, priors, prevalence=0.0)
        assert world.truth["is_ring"].sum() == 0, "stress world must hold no rings"
        blocks.extend(features.world_rows(world, link_params))
        del world
    table = pd.DataFrame(blocks)

    _, purity = score_table(table, fitted)
    action = decide.best_action(purity, table["size"].to_numpy())
    table = table.assign(action=action)

    by_kind = {}
    for kind, block in table.groupby("dominant_benign_kind"):
        if not kind:
            continue
        blocked = (block["action"] == "block").sum()
        reviewed = (block["action"] == "review").sum()
        by_kind[str(kind)] = {
            "clusters": int(len(block)),
            "wrongly_blocked": int(blocked),
            "sent_to_review": int(reviewed),
            "block_rate": round(float(blocked / len(block)), 5),
            "review_rate": round(float(reviewed / len(block)), 5),
            "accounts_blocked": int(block.loc[block["action"] == "block",
                                              "size"].sum()),
        }
    total_blocked = int(table.loc[table["action"] == "block", "size"].sum())
    return {
        "worlds": len(seeds),
        "n_accounts": int(len(seeds) * n_accounts),
        "n_clusters": int(len(table)),
        "accounts_wrongly_blocked": total_blocked,
        "cost_of_those_blocks_rupees": total_blocked * config.COST_BLOCKED_INNOCENT,
        "by_kind": dict(sorted(by_kind.items())),
    }


def failure_catalogue(table: pd.DataFrame, fitted: dict, stress: dict,
                      curve: list[dict]) -> list[dict]:
    """Concrete failures with a named example, not a paragraph of hedging."""
    p, purity = score_table(table, fitted)
    action = decide.best_action(purity, table["size"].to_numpy())
    t = table.assign(action=action, purity=purity, p=p)

    out = []

    # 1. Rings that never became a cluster at all.
    per_world = t.groupby(["tier", "seed"]).agg(
        found=("n_ring_members", "sum"), total=("world_ring_accounts", "first"))
    lost = (per_world["total"] - per_world["found"]).clip(lower=0)
    worst = lost.idxmax()
    out.append({
        "failure": "ring accounts never form a cluster",
        "example": f"{worst[0]} tier, seed {worst[1]}",
        "detail": (f"{int(lost.loc[worst])} of {int(per_world.loc[worst, 'total'])} "
                   f"ring accounts joined no cluster above 14 bits"),
        "why": ("every account has its own device and address, so the only shared "
                "attribute is a pincode and no edge clears the threshold"),
        "cost": ("invisible to every later stage, so this is a hard ceiling on "
                 "recall"),
    })

    # 2. Ring clusters the model saw and allowed.
    missed = t[(t["label"] == 1) & (t["action"] == "allow")]
    if len(missed):
        w = missed.nlargest(1, "n_ring_members").iloc[0]
        out.append({
            "failure": "ring cluster found, then allowed",
            "example": f"{w['tier']} tier, seed {int(w['seed'])}, "
                       f"cluster {int(w['cluster_id'])}",
            "detail": (f"{int(w['n_ring_members'])} ring accounts, predicted "
                       f"purity {w['purity']:.2f}, probability {w['p']:.2f}"),
            "why": ("expected cost said allowing was cheaper than reviewing, "
                    "because the purity estimate was too low to justify either"),
            "cost": f"Rs.{int(w['n_ring_members']) * config.COST_MISSED_ABUSER:,} "
                    f"in farmed coupons",
        })

    # 3. Benign clusters that got blocked.
    fp = t[(t["label"] == 0) & (t["action"] == "block")]
    if len(fp):
        w = fp.nlargest(1, "size").iloc[0]
        out.append({
            "failure": "benign cluster blocked",
            "example": f"{w['tier']} tier, seed {int(w['seed'])}, "
                       f"cluster {int(w['cluster_id'])}, mostly "
                       f"{w['dominant_benign_kind'] or 'ordinary strangers'}",
            "detail": (f"{int(w['size'])} accounts, {int(w['n_innocent_members'])} "
                       f"of them innocent, predicted purity {w['purity']:.2f}"),
            "why": ("a group sharing an address with bursty signups and no repeat "
                    "orders is structurally a ring"),
            "cost": (f"Rs.{int(w['n_innocent_members']) * config.COST_BLOCKED_INNOCENT:,} "
                     f"in lost lifetime value"),
        })

    # 4. Camouflage defeating the repeat-rate feature.
    camo = t[(t["tier"] == "adaptive") & (t["label"] == 1) & (t["repeat_rate"] > 0)]
    if len(camo):
        w = camo.nlargest(1, "repeat_rate").iloc[0]
        out.append({
            "failure": "camouflaged repeat orders",
            "example": f"adaptive tier, seed {int(w['seed'])}, "
                       f"cluster {int(w['cluster_id'])}",
            "detail": (f"{int(w['size'])} accounts with a repeat rate of "
                       f"{w['repeat_rate']:.2f}, action taken: {w['action']}"),
            "why": ("15% of adaptive ring accounts order again on purpose, which "
                    "is aimed straight at the feature meant to separate rings "
                    "from families"),
            "cost": "the strongest behavioural signal stops discriminating",
        })

    # 5. Rings that were found but split across several clusters.
    ring_clusters = t[t["label"] == 1]
    if len(ring_clusters):
        frag = ring_clusters.groupby(["tier", "seed"]).size()
        worst_frag = frag.idxmax()
        out.append({
            "failure": "one ring split across several clusters",
            "example": f"{worst_frag[0]} tier, seed {worst_frag[1]}",
            "detail": (f"{int(frag.loc[worst_frag])} separate ring clusters in a "
                       f"world that contains at most 5 rings"),
            "why": ("weak edges break a ring into fragments, and each fragment is "
                    "judged alone with no memory that the others exist"),
            "cost": ("a fragment small enough to look harmless is allowed, so part "
                     "of a caught ring still gets through"),
        })

    # 6. The worst lookalike kind, if any of them actually got blocked.
    blocked_kinds = {k: v for k, v in stress["by_kind"].items()
                     if v["wrongly_blocked"] > 0}
    worst_kind = max(blocked_kinds.items(),
                     key=lambda kv: kv[1]["block_rate"], default=(None, None))
    if worst_kind[0]:
        k, v = worst_kind
        out.append({
            "failure": f"{k} groups wrongly blocked on rings-free data",
            "example": f"{stress['worlds']} worlds containing zero rings",
            "detail": (f"{v['wrongly_blocked']} of {v['clusters']} {k} clusters "
                       f"blocked, {v['block_rate']:.2%}"),
            "why": ("real people sharing an address with bursty signups are "
                    "structurally identical to a ring on static attributes"),
            "cost": f"Rs.{v['accounts_blocked'] * config.COST_BLOCKED_INNOCENT:,}",
        })

    # 7. Where the detection curve gives out.
    dead = [c for c in curve if c["recall"] < 0.05]
    if dead:
        edge = min(c["sophistication"] for c in dead)
        row = next(c for c in curve if c["sophistication"] == edge)
        out.append({
            "failure": "the operator rotates delivery addresses",
            "example": f"sophistication {edge:.2f} on the swept curve",
            "detail": (f"recall falls below 0.05 once the operator is down to "
                       f"{row['accounts_per_drop']:.1f} accounts per drop address "
                       f"and {row['device_reuse']:.2f} device reuse"),
            "why": ("nothing static is shared but the pincode, and thousands of "
                    "strangers share that too"),
            "cost": "the system stops working, and this curve is how it says so",
        })
    return out


def plot_detection_curve(curve: list[dict], device_curve: list[dict],
                         path: str) -> None:
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    x = [c["sophistication"] for c in curve]
    ax.plot(x, [c["recall_including_review"] for c in curve], "^-",
            c="tab:green", label="recall (blocked or reviewed)")
    ax.plot(x, [c["recall"] for c in curve], "o-", label="recall (blocked)")
    ax.plot(x, [c["precision"] for c in curve], "s-", alpha=0.6,
            label="precision")
    ax.axhline(costs.breakeven_precision(), ls="--", c="grey",
               label=f"breakeven precision ({costs.breakeven_precision():.3f})")
    ax.set_xlabel("operator sophistication\n"
                  "(0.0 = obvious tier, 1.0 = adaptive tier)")
    ax.set_ylabel("account level rate")
    ax.set_title("Where this detector stops working")
    ax.legend(fontsize=9)
    ax.grid(alpha=0.3)

    xd = [c["device_reuse"] for c in device_curve]
    ax2.plot(xd, [c["recall"] for c in device_curve], "o-", c="tab:red",
             label="recall (blocked)")
    ax2.set_ylim(ax.get_ylim())
    ax2.invert_xaxis()
    ax2.set_xlabel("device reuse, everything else held at the moderate tier\n"
                   "(1.0 careless, 0.0 fully rotated)")
    ax2.set_title("Rotating devices alone does not help the operator")
    ax2.legend(fontsize=9)
    ax2.grid(alpha=0.3)
    fig.suptitle("Detection curve, sealed holdout seeds", y=1.0)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--model", default="results/model.pkl")
    p.add_argument("--out", default=SEAL_PATH)
    p.add_argument("--force", action="store_true",
                   help="re-open a holdout that has already been run")
    args = p.parse_args()

    seeds = parse_seeds(args.seeds)
    sealed = set(config.HOLDOUT_SEEDS)
    if not set(seeds) <= sealed and args.out == SEAL_PATH:
        raise SystemExit(f"seeds {seeds[0]}-{seeds[-1]} are not the sealed "
                         f"holdout. Use --out to write somewhere else.")
    if os.path.exists(args.out) and not args.force:
        raise SystemExit(
            f"{args.out} already exists, so the holdout has been opened once "
            f"already. That is the point of a holdout. Pass --force only if you "
            f"know why you are re-opening it, and say so in docs/DECISIONS.md."
        )

    announce(apply())
    fitted = _load_model(args.model)
    with open("results/link_params.json") as f:
        link_params = json.load(f)

    print(f"\nopening the seal: seeds {seeds[0]}-{seeds[-1]}, "
          f"{args.accounts:,} accounts per world, {len(seeds)} worlds per tier")
    priors = load_priors()
    rows = []
    for tier in config.TIER_NAMES:
        for i, seed in enumerate(seeds):
            world = generate(seed, tier, args.accounts, priors)
            rows.extend(features.world_rows(world, link_params))
            del world
            if (i + 1) % 25 == 0:
                print(f"  {tier}: {i + 1}/{len(seeds)}")
    table = pd.DataFrame(rows)

    matrix = results_matrix(table, fitted)
    print(f"\n{'tier':<15} {'acct prev':<11} {'clusters':<9} {'PR-AUC':<9} "
          f"{'prec':<9} {'recall':<9} {'+review':<9} {'Brier':<9} "
          f"{'blocked':<9} {'reviewed':<10} {'net'}")
    print("-" * 126)
    for tier, r in matrix.items():
        net = r["net_vs_nothing_rupees"]
        print(f"{tier:<15} {r['account_prevalence']:<11.5f} {r['n_clusters']:<9,} "
              f"{r['pr_auc']:<9.4f} {r['precision']:<9.4f} {r['recall']:<9.4f} "
              f"{r['recall_including_review']:<9.4f} "
              f"{r['brier']:<9.5f} {r['accounts_blocked']:<9,} "
              f"{r['accounts_reviewed']:<10,} "
              f"{'+' if net >= 0 else '-'}Rs.{abs(net):,}")

    p_all, purity_all = score_table(table, fitted)
    pooled = decide.score_policy(
        table, decide.best_action(purity_all, table["size"].to_numpy()))
    print(f"\npooled across tiers: cost Rs.{pooled['cost_rupees']:,}, "
          f"deploy nothing Rs.{pooled['do_nothing_rupees']:,}, net "
          f"{'+' if pooled['net_vs_nothing_rupees'] >= 0 else '-'}"
          f"Rs.{abs(pooled['net_vs_nothing_rupees']):,}")

    print(f"\ndetection curve, {CURVE_SEEDS} worlds per point")
    curve = detection_curve(fitted, args.accounts, seeds[:CURVE_SEEDS])
    print(f"\nthe plan's device-only sweep, for comparison")
    device_curve = device_only_curve(fitted, args.accounts, seeds[:CURVE_SEEDS])

    print(f"\nlookalike stress test, {STRESS_SEEDS} worlds containing zero rings")
    stress = lookalike_stress(fitted, args.accounts, seeds[:STRESS_SEEDS])
    print(f"{'kind':<12} {'clusters':<10} {'blocked':<9} {'rate':<9} "
          f"{'reviewed':<10} {'review rate'}")
    for kind, v in stress["by_kind"].items():
        print(f"{kind:<12} {v['clusters']:<10,} {v['wrongly_blocked']:<9} "
              f"{v['block_rate']:<9.4f} {v['sent_to_review']:<10} "
              f"{v['review_rate']:.4f}")
    print(f"total wrongly blocked: {stress['accounts_wrongly_blocked']:,} accounts, "
          f"Rs.{stress['cost_of_those_blocks_rupees']:,}")

    catalogue = failure_catalogue(table, fitted, stress, curve)
    print(f"\nfailure catalogue, {len(catalogue)} entries")
    for i, f in enumerate(catalogue, 1):
        print(f"  {i}. {f['failure']}  ({f['example']})")
        print(f"     {f['detail']}")

    plot_detection_curve(curve, device_curve, "results/detection_curve.png")
    report = {
        "opened": "seeds 900-999, once",
        "n_accounts_per_world": args.accounts,
        "n_seeds": len(seeds),
        "n_clusters": len(table),
        "calibration_method": fitted["method"],
        "results_matrix": matrix,
        "pooled": pooled,
        "detection_curve": curve,
        "device_only_curve": device_curve,
        "lookalike_stress": stress,
        "failure_catalogue": catalogue,
    }
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    table.to_csv("results/features_holdout.csv", index=False)
    print(f"\nwrote {args.out}, results/detection_curve.png")


if __name__ == "__main__":
    main()
