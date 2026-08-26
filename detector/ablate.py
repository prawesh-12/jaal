"""What the detector is worth when the caller cannot supply every field.

Every published number assumes all eleven comparison fields are present. A
payment aggregator does not have a delivery address and does not know a coupon
was applied. A merchant that never fingerprints a device does not have one. This
runs the whole pipeline once per field profile and reports what changes.

Nothing is reused between profiles. Each one re-blocks, re-scores, re-clusters,
re-extracts features and refits the model, because a narrower field set changes
the graph and therefore changes what the model should learn. Reusing the shipped
model would report a bug, not an ablation.

Validation seeds only. Seeds 900 to 999 are sealed and an ablation study is
exactly the kind of thing that must not touch them.

    python -m detector.ablate --accounts 12000 \
        --train-seeds 0-59 --val-seeds 700-759
"""

from __future__ import annotations

import argparse
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

import config
from detector import decide, features, model, profiles
from detector.cli import parse_seeds
from detector.resources import announce, apply, budget

# The four mark colours the dashboard uses, checked for colour-vision
# separation. Nothing here invents a fifth.
GREEN, BLUE, AMBER, RED = "#2baf60", "#3e8be9", "#c38700", "#c3292e"


def evaluate_profile(profile: profiles.Profile, train_seeds: list[int],
                     val_seeds: list[int], n_accounts: int, params: dict,
                     n_jobs: int, features_from_full: bool = False) -> dict:
    """One profile, end to end: build both tables, refit, decide, score."""
    print(f"\n  fields: {', '.join(profile.comparisons) or 'none'}")
    print(f"  blocking rules: "
          f"{', '.join(n for n, _ in profile.rules) or 'none'}")

    if not profile.comparisons or not profile.rules:
        return {"name": profile.name, "usable": False,
                "reason": "no comparisons or no blocking rules survive"}

    train = features.build_table(train_seeds, config.TIER_NAMES, n_accounts,
                                 params, verbose=False,
                                 rules=profile.rules,
                                 comparisons=profile.comparisons)
    val = features.build_table(val_seeds, config.TIER_NAMES, n_accounts,
                               params, verbose=False,
                               rules=profile.rules,
                               comparisons=profile.comparisons)
    print(f"  {len(train):,} training clusters, {len(val):,} validation")

    if train.empty or val.empty or train["label"].sum() == 0:
        return {"name": profile.name, "usable": False,
                "reason": "no clusters, or no ring cluster to learn from"}

    feature_set = (model.MODEL_FEATURES if features_from_full
                   else profile.features)
    print(f"  {len(feature_set)} of {len(model.MODEL_FEATURES)} features usable")
    fitted = model.train_and_calibrate(train, val, n_jobs, feature_set)

    # Same rule model.py uses: whichever calibrator gives the better Brier.
    y = fitted["y_val"]
    from sklearn.metrics import average_precision_score, brier_score_loss
    briers = {k: brier_score_loss(y, fitted["models"][f"forest_{k}"])
              for k in ("sigmoid", "isotonic")}
    chosen = min(briers, key=briers.get)

    p = fitted["models"][f"forest_{chosen}"]
    X = val[list(feature_set)]
    purity = np.clip(fitted["purity"].predict(X), 0.0, 1.0)
    action = decide.best_action(purity, val["size"].to_numpy())

    tiers = {}
    for tier in config.TIER_NAMES:
        m = (val["tier"] == tier).to_numpy()
        if not m.any():
            continue
        r = decide.score_policy(val[m], action[m])
        yt = val.loc[m, "label"].to_numpy()
        r["pr_auc"] = (round(float(average_precision_score(yt, p[m])), 5)
                       if yt.sum() else 0.0)
        r["brier"] = round(float(brier_score_loss(yt, p[m])), 5)
        r["n_clusters"] = int(m.sum())
        tiers[tier] = r

    pooled = decide.score_policy(val, action)
    pooled["pr_auc"] = round(float(average_precision_score(y, p)), 5)
    pooled["brier"] = round(float(brier_score_loss(y, p)), 5)

    return {
        "name": profile.name,
        "usable": True,
        "description": profile.description,
        "comparisons": list(profile.comparisons),
        "missing_comparisons": list(profile.missing_comparisons),
        "n_comparisons": len(profile.comparisons),
        "blocking_rules": [n for n, _ in profile.rules],
        "n_blocking_rules": len(profile.rules),
        "calibration_method": chosen,
        "features": list(feature_set),
        "n_features": len(feature_set),
        "missing_features": list(profile.missing_features),
        "missing_columns": list(profile.missing_columns),
        "n_train_clusters": int(len(train)),
        "n_val_clusters": int(len(val)),
        "pooled": pooled,
        "tiers": tiers,
    }


def run(names: list[str], train_seeds: list[int], val_seeds: list[int],
        n_accounts: int, params: dict, features_from_full: bool = False) -> dict:
    out = {
        "train_seeds": [train_seeds[0], train_seeds[-1]],
        "val_seeds": [val_seeds[0], val_seeds[-1]],
        "n_accounts_per_world": n_accounts,
        "field_weights_bits": profiles.field_weights(params),
        "features_from_full": features_from_full,
        "profiles": [],
    }
    for i, name in enumerate(names):
        p = profiles.get(name)
        b = budget()
        print(f"\n{'=' * 62}\n  {i + 1}/{len(names)}  {p.name}\n{'=' * 62}")
        print(f"  [resources] {b['available_mb']} MB free, {b['workers']} workers")
        out["profiles"].append(
            evaluate_profile(p, train_seeds, val_seeds, n_accounts, params,
                             b["workers"], features_from_full))
    return out


def _net(row: dict) -> int:
    return row["pooled"]["net_vs_nothing_rupees"] if row["usable"] else 0


def print_report(report: dict) -> None:
    rows = report["profiles"]
    full = next((r for r in rows if r["name"] == "full" and r["usable"]), None)
    base = _net(full) if full else 0

    print(f"\n\nField ablation, validation seeds "
          f"{report['val_seeds'][0]}-{report['val_seeds'][1]}, "
          f"{report['n_accounts_per_world']:,} accounts per world\n")
    head = (f"{'profile':<24} {'cmp':<5} {'rules':<7} {'feat':<6} "
            f"{'precision':<16} {'recall':<9} {'with review':<13} "
            f"{'net':<18} {'of full'}")
    print(head)
    print("-" * len(head))
    for r in rows:
        if not r["usable"]:
            print(f"{r['name']:<24} {r['reason']}")
            continue
        p = r["pooled"]
        share = f"{_net(r) / base:.0%}" if base else "n/a"
        print(f"{r['name']:<24} {r['n_comparisons']:<5} "
              f"{r['n_blocking_rules']:<7} {r['n_features']:<6} "
              f"{decide.format_precision(p['precision']):<16} "
              f"{p['recall']:<9.4f} {p['recall_including_review']:<13.4f} "
              f"{'+' if p['net_vs_nothing_rupees'] >= 0 else '-'}"
              f"Rs.{abs(p['net_vs_nothing_rupees']):<14,} {share}")

    print("\nrecall including review, per tier. Never averaged.")
    head = f"{'profile':<24} " + " ".join(f"{t:<15}" for t in config.TIER_NAMES)
    print(head)
    print("-" * len(head))
    for r in rows:
        if not r["usable"]:
            continue
        cells = " ".join(
            f"{r['tiers'][t]['recall_including_review']:<15.4f}"
            if t in r["tiers"] else f"{'-':<15}" for t in config.TIER_NAMES)
        print(f"{r['name']:<24} {cells}")


def plot(report: dict, path: str) -> None:
    rows = [r for r in report["profiles"] if r["usable"]]
    if not rows:
        return
    names = [r["name"] for r in rows]
    y = np.arange(len(names))[::-1]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 1.0 + 0.62 * len(names)),
                                   sharey=True)

    nets = [r["pooled"]["net_vs_nothing_rupees"] / 1e5 for r in rows]
    ax1.barh(y, nets, height=0.55,
             color=[GREEN if v >= 0 else RED for v in nets])
    ax1.axvline(0, color="#444", lw=1)
    ax1.set_yticks(y, names)
    ax1.set_xlabel("net against doing nothing, Rs. lakh")
    ax1.set_title("What the caller keeps", loc="left", fontsize=11)
    for yy, v in zip(y, nets):
        ax1.text(v + (0.4 if v >= 0 else -0.4), yy, f"{v:+.1f}",
                 va="center", ha="left" if v >= 0 else "right", fontsize=9)

    width = 0.19
    for k, tier in enumerate(config.TIER_NAMES):
        vals = [r["tiers"].get(tier, {}).get("recall_including_review", 0.0)
                for r in rows]
        ax2.barh(y + (1.5 - k) * width, vals, height=width,
                 color=[GREEN, BLUE, AMBER, RED][k], label=tier)
    ax2.set_xlim(0, 1)
    ax2.set_xlabel("recall, blocked or reviewed")
    ax2.set_title("What it still reaches, per tier", loc="left", fontsize=11)
    ax2.legend(fontsize=8, loc="lower right")

    for ax in (ax1, ax2):
        ax.grid(axis="x", color="#e6e6e6", lw=0.8)
        ax.set_axisbelow(True)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)

    fig.suptitle("Every field the caller cannot send costs recall\n"
                 f"validation seeds {report['val_seeds'][0]}"
                 f"-{report['val_seeds'][1]}, "
                 f"{report['n_accounts_per_world']:,} accounts per world",
                 fontsize=12, x=0.02, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.90))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    print(f"\nwrote {path}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--accounts", type=int, default=config.N_ACCOUNTS)
    p.add_argument("--train-seeds", default="0-59")
    p.add_argument("--val-seeds", default="700-759")
    p.add_argument("--profiles", default=",".join(profiles.BY_NAME))
    p.add_argument("--params", default="results/link_params.json")
    p.add_argument("--features-from-full", action="store_true",
                   help="keep every cluster feature even when the profile "
                        "cannot supply the column behind it. Isolates what "
                        "linkage alone loses, and overstates what a real "
                        "caller with that profile would get.")
    p.add_argument("--out", default="results/field_ablation.json")
    p.add_argument("--plot", default="results/field_ablation.png")
    args = p.parse_args()

    announce(apply())
    train_seeds = parse_seeds(args.train_seeds)
    val_seeds = parse_seeds(args.val_seeds)
    if set(train_seeds) & set(val_seeds):
        raise SystemExit("train and validation seeds overlap")
    if set(val_seeds) & set(config.HOLDOUT_SEEDS):
        raise SystemExit("the holdout is sealed. Use validation seeds.")

    with open(args.params) as f:
        params = json.load(f)

    names = [n.strip() for n in args.profiles.split(",") if n.strip()]
    report = run(names, train_seeds, val_seeds, args.accounts, params,
                 args.features_from_full)
    print_report(report)
    plot(report, args.plot)

    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
