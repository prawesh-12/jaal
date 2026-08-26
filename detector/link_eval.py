"""Threshold sweep and ablation for the pair scorer.

Shows where the edge threshold should sit, and how much recall is lost when
each comparison is removed.

    python -m detector.link_eval --accounts 12000 --seeds 700-709
"""

from __future__ import annotations

import argparse
import json

import numpy as np

import config
from detector import link
from detector.blocking import candidate_pairs, true_pair_codes
from detector.cli import add_common_args, parse_seeds
from detector.generate_accounts import generate, load_priors
from detector.resources import announce, apply

THRESHOLDS = tuple(range(0, 61, 2))

# Edges per world the graph stage will carry. At 12,000 nodes, mean degree 8.
EDGE_BUDGET = 50_000


def _pooled(rows: list[list[dict]]) -> list[dict]:
    """Sum counts across worlds, then compute the rates. Never average rates."""
    out = []
    for k in range(len(rows[0])):
        tp = sum(r[k]["tp"] for r in rows)
        fp = sum(r[k]["fp"] for r in rows)
        edges = sum(r[k]["edges"] for r in rows)
        n_true = sum(r[k]["n_true"] for r in rows)
        out.append({
            "threshold_bits": rows[0][k]["threshold_bits"],
            "edges": edges, "tp": tp, "fp": fp,
            "precision": round(tp / edges, 4) if edges else 0.0,
            "recall": round(tp / n_true, 4) if n_true else 0.0,
        })
    return out


def sweep(seeds, n_accounts, params, tf_weight=link.TF_WEIGHT,
          comparisons=link.SCORED_COMPARISONS, thresholds=THRESHOLDS,
          tiers=None) -> dict:
    priors = load_priors()
    out = {}
    for tier in (tiers or config.TIER_NAMES):
        rows = []
        for seed in seeds:
            world = generate(seed, tier, n_accounts, priors)
            pairs, _ = candidate_pairs(world.accounts)
            bits, _ = link.score_pairs(world.accounts, pairs, params,
                                       tf_weight, comparisons)
            n = len(world.accounts)
            truth = true_pair_codes(world)
            is_true = np.isin(pairs[:, 0] * n + pairs[:, 1], truth)
            row = []
            for t in thresholds:
                keep = bits >= t
                tp = int((keep & is_true).sum())
                row.append({"threshold_bits": float(t), "edges": int(keep.sum()),
                            "tp": tp, "fp": int(keep.sum()) - tp,
                            "n_true": len(truth)})
            rows.append(row)
            del world
        out[tier] = _pooled(rows)
    return out


def best_threshold(sweep_out: dict, n_worlds: int,
                   edge_budget: int = EDGE_BUDGET) -> float:
    """The lowest threshold whose graph still fits the edge budget.

    Not the F1-optimal threshold: pair F1 picks 40 bits, where the moderate tier
    has already lost 71% of its true pairs and no later stage can recover them.
    """
    best = None
    for k in range(len(next(iter(sweep_out.values())))):
        t = next(iter(sweep_out.values()))[k]["threshold_bits"]
        worst_edges = max(rows[k]["edges"] for rows in sweep_out.values())
        if worst_edges / n_worlds <= edge_budget:
            best = t if best is None else min(best, t)
    return best if best is not None else max(
        r["threshold_bits"] for r in next(iter(sweep_out.values())))


def ablation(seeds, n_accounts, params, threshold: float, tiers=None,
             tf_weight=link.TF_WEIGHT) -> dict:
    """Drop one comparison at a time and record what recall loses."""
    full = sweep(seeds, n_accounts, params, tf_weight, thresholds=(threshold,),
                 tiers=tiers)
    base = {t: rows[0] for t, rows in full.items()}

    out = {"threshold_bits": threshold,
           "baseline": {t: {"precision": r["precision"], "recall": r["recall"]}
                        for t, r in base.items()},
           "dropped": {}}

    variants = [(name, tuple(c for c in link.SCORED_COMPARISONS if c != name))
                for name in link.SCORED_COMPARISONS]
    # Add the two excluded comparisons back, so leaving them out stays visible.
    variants += [(f"+{name}", link.SCORED_COMPARISONS + (name,))
                 for name in link.EXCLUDED_COMPARISONS]

    for label, comps in variants:
        got = sweep(seeds, n_accounts, params, tf_weight, comparisons=comps,
                    thresholds=(threshold,), tiers=tiers)
        out["dropped"][label] = {
            t: {"recall_drop": round(rows[0]["recall"] - base[t]["recall"], 4),
                "precision_drop": round(rows[0]["precision"]
                                        - base[t]["precision"], 4)}
            for t, rows in got.items()}
    return out


def print_sweep(sweep_out: dict, chosen: float) -> None:
    print(f"\n{'bits':<7}" + "".join(f"{t[:6]:>26}" for t in sweep_out))
    print(f"{'':<7}" + "".join(f"{'prec':>9}{'recall':>9}{'edges':>8}"
                               for _ in sweep_out))
    print("-" * (7 + 26 * len(sweep_out)))
    for k in range(len(next(iter(sweep_out.values())))):
        t = next(iter(sweep_out.values()))[k]["threshold_bits"]
        mark = " *" if t == chosen else "  "
        line = f"{t:<5.0f}{mark}"
        for rows in sweep_out.values():
            r = rows[k]
            line += f"{r['precision']:>9.4f}{r['recall']:>9.4f}{r['edges']:>8,}"
        print(line)
    print(f"\n* chosen threshold: {chosen:.0f} bits, the lowest that keeps "
          f"every tier inside {EDGE_BUDGET:,} edges per world")


def print_ablation(ab: dict) -> None:
    tiers = list(ab["baseline"])
    print(f"\nablation at {ab['threshold_bits']:.0f} bits. A minus sign is "
          f"recall lost by removing that comparison.\nRows prefixed + are the "
          f"two comparisons that are excluded by default, added back.")
    print(f"{'removed':<14}" + "".join(f"{t[:13]:>15}" for t in tiers))
    print("-" * (14 + 15 * len(tiers)))
    print(f"{'nothing':<14}" + "".join(
        f"{ab['baseline'][t]['recall']:>15.4f}" for t in tiers))
    rows = sorted(ab["dropped"].items(),
                  key=lambda kv: sum(v["recall_drop"] for v in kv[1].values()))
    for name, per_tier in rows:
        print(f"{name:<14}" + "".join(
            f"{per_tier[t]['recall_drop']:>+15.4f}" for t in tiers))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    p.add_argument("--params", default="results/link_params.json")
    p.add_argument("--m", choices=("bootstrap", "em"), default="bootstrap",
                   help="which m estimate to score with")
    p.add_argument("--tf", type=float, default=link.TF_WEIGHT,
                   help="term frequency adjustment strength, 0 to 1")
    p.add_argument("--skip-ablation", action="store_true")
    p.add_argument("--out", default=None)
    args = p.parse_args()

    announce(apply())
    with open(args.params) as f:
        params = json.load(f)
    if args.m == "em":
        params = {**params, "m": params["m_em"]}

    seeds = parse_seeds(args.seeds)
    print(f"\nPair scoring, m={args.m}, term frequency weight {args.tf}, "
          f"{args.accounts:,} accounts, seeds {seeds[0]}-{seeds[-1]}")

    sw = sweep(seeds, args.accounts, params, args.tf)
    chosen = best_threshold(sw, len(seeds))
    print_sweep(sw, chosen)

    report = {"m_source": args.m, "tf_weight": args.tf,
              "edge_budget": EDGE_BUDGET,
              "seeds": [seeds[0], seeds[-1]], "n_accounts": args.accounts,
              "threshold_bits": chosen, "sweep": sw}
    if not args.skip_ablation:
        ab = ablation(seeds, args.accounts, params, chosen,
                      tf_weight=args.tf)
        print_ablation(ab)
        report["ablation"] = ab

    if args.out:
        with open(args.out, "w") as f:
            json.dump(report, f, indent=1)
            f.write("\n")
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
