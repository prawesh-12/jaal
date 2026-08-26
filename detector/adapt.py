"""An operator that learns from getting caught, and adapts.

Sophistication has been a dial we set, which invites the fair objection that we
wrote the fraud so of course we catch it. This closes that loop.

The operator never sees the detector's code, its weights, or its thresholds. It
sees one thing: for each ring it ran, what share of its accounts got blocked.
Blocking is the only outcome an operator can actually observe, because a cluster
sent to a human looks exactly like one that was allowed until somebody acts on
it. Each round the operator tries a spread of settings around where it stands,
measures which of its own five parameters tracks getting blocked, and moves that
one parameter toward evasion. Then it runs again.

    python -m detector.adapt --rounds 5 --worlds 60
"""

from __future__ import annotations

import argparse
import gzip
import json
import pickle
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

import config
from detector import decide, features
from detector.generate_accounts import generate, load_priors
from detector.resources import announce, apply

# What the operator can change, the range it can move within, and which
# direction makes it harder to catch. +1 means larger is more evasive.
PARAMS = {
    "device_reuse":       {"lo": 0.00, "hi": 1.00, "evade": -1},
    "accounts_per_drop":  {"lo": 1.00, "hi": 20.0, "evade": -1},
    "signup_window_days": {"lo": 0.04, "hi": 45.0, "evade": +1},
    "value_jitter":       {"lo": 80.0, "hi": 1200.0, "evade": +1},
    "camouflage":         {"lo": 0.00, "hi": 0.50, "evade": +1},
}

# How widely the operator experiments around its current settings, and how far
# it commits once it has decided. Both as a share of each parameter's range.
TRIAL_SPREAD = 0.30
STEP = 0.30

START_TIER = "moderate"
FIRST_SEED = 100          # the model was fitted on seeds 0 to 59


def _clip(name: str, value: float) -> float:
    p = PARAMS[name]
    return float(np.clip(value, p["lo"], p["hi"]))


def starting_point() -> dict:
    return {k: float(config.TIERS[START_TIER][k]) for k in PARAMS}


def trial_settings(point: dict, rng: np.random.Generator) -> dict:
    """One experiment the operator runs, near where it currently stands."""
    out = {}
    for name, spec in PARAMS.items():
        span = (spec["hi"] - spec["lo"]) * TRIAL_SPREAD
        out[name] = _clip(name, point[name] + rng.uniform(-span, span))
    return out


def run_world(seed: int, settings: dict, n_accounts: int, priors: dict,
              link_params: dict, model: dict) -> dict:
    """One world at these settings. Returns what happened to its ring accounts."""
    world = generate(seed, START_TIER, n_accounts, priors, tier_params=settings)
    rows = features.world_rows(world, link_params)
    n_ring = int(world.truth["is_ring"].sum())
    del world

    if not rows:
        return {"n_ring": n_ring, "blocked": 0, "reviewed": 0}

    table = pd.DataFrame(rows)
    X = table[model["features"]]
    purity = np.clip(model["purity"].predict(X), 0.0, 1.0)
    actions = decide.best_action(purity, table["size"].to_numpy())

    ring = table["n_ring_members"].to_numpy()
    return {"n_ring": n_ring,
            "blocked": int(ring[actions == "block"].sum()),
            "reviewed": int(ring[actions == "review"].sum())}


def run_round(point: dict, seeds: list[int], n_accounts: int, priors: dict,
              link_params: dict, model: dict, rng: np.random.Generator,
              vary: bool = True) -> dict:
    """A round of experiments, then the operator's read on what to change."""
    trials = []
    for seed in seeds:
        settings = trial_settings(point, rng) if vary else dict(point)
        outcome = run_world(seed, settings, n_accounts, priors, link_params,
                            model)
        stopped = outcome["blocked"] + outcome["reviewed"]
        trials.append({
            **settings,
            "seed": seed,
            "n_ring": outcome["n_ring"],
            "blocked": outcome["blocked"],
            "reviewed": outcome["reviewed"],
            "stopped_rate": stopped / outcome["n_ring"] if outcome["n_ring"] else 0.0,
            # What the operator can see. A reviewed cluster looks allowed to it.
            "blocked_rate": (outcome["blocked"] / outcome["n_ring"]
                             if outcome["n_ring"] else 0.0),
        })

    frame = pd.DataFrame(trials)
    n_ring = int(frame["n_ring"].sum())
    summary = {
        "n_worlds": len(trials),
        "n_ring_accounts": n_ring,
        "blocked": int(frame["blocked"].sum()),
        "reviewed": int(frame["reviewed"].sum()),
        "recall_blocked": round(float(frame["blocked"].sum() / n_ring), 4),
        "recall_including_review": round(
            float((frame["blocked"].sum() + frame["reviewed"].sum()) / n_ring), 4),
        "settings": {k: round(v, 4) for k, v in point.items()},
    }

    # What the operator learns: which of its own knobs tracks getting stopped.
    # With no variation there is nothing to correlate, which is the case in the
    # opening round where it simply behaves normally and watches.
    correlations = {}
    signal = frame["blocked_rate"]
    if vary and signal.nunique() > 1:
        for name in PARAMS:
            rho, p = spearmanr(frame[name], signal)
            if np.isnan(rho):
                rho, p = 0.0, 1.0
            correlations[name] = {"rho": round(float(rho), 4),
                                  "p": round(float(p), 5)}
    summary["correlations"] = correlations
    summary["signal_had_variation"] = bool(signal.nunique() > 1)
    summary["trials"] = trials
    return summary


def choose_move(correlations: dict, point: dict) -> dict | None:
    """Move the one knob that most reduces being stopped.

    A rational operator does not chase the largest correlation, it chases the
    largest gain. Turning a knob its evasive way helps when doing so goes with
    being stopped less often, which is a negative correlation for a knob whose
    evasive direction is up. Knobs already at their limit are skipped.
    """
    if not correlations:
        return None

    scored = []
    for name, c in correlations.items():
        spec = PARAMS[name]
        step = (spec["hi"] - spec["lo"]) * STEP * spec["evade"]
        after = _clip(name, point[name] + step)
        if after == point[name]:
            continue
        benefit = -c["rho"] * spec["evade"]
        scored.append((benefit, name, c, after))

    if not scored:
        return None
    scored.sort(reverse=True)
    benefit, name, c, after = scored[0]
    return {"parameter": name, "rho": c["rho"], "p": c["p"],
            "from": round(point[name], 4), "to": round(after, 4),
            "expected_gain": round(float(benefit), 4),
            "helps_evasion": bool(benefit > 0),
            "significant": bool(c["p"] < 0.05)}


def loop(rounds: int, worlds: int, n_accounts: int, rng_seed: int = 0) -> dict:
    priors = load_priors()
    with open("results/link_params.json") as f:
        link_params = json.load(f)
    with gzip.open("results/model.pkl", "rb") as f:
        model = pickle.load(f)
    rng = np.random.default_rng(rng_seed)

    point = starting_point()
    history, seed = [], FIRST_SEED
    for r in range(rounds + 1):
        seeds = list(range(seed, seed + worlds))
        seed += worlds
        t0 = time.perf_counter()
        # Round 0 is the operator standing still, so it has a clean starting
        # measurement. From then on it experiments around where it stands.
        summary = run_round(point, seeds, n_accounts, priors, link_params,
                            model, rng, vary=(r > 0))
        summary["round"] = r
        summary["seeds"] = [seeds[0], seeds[-1]]
        summary["seconds"] = round(time.perf_counter() - t0, 1)

        if r < rounds:
            move = choose_move(summary["correlations"], point)
            if move:
                summary["move"] = move
                point = dict(point)
                point[move["parameter"]] = move["to"]
        history.append(summary)

        m = summary.get("move")
        print(f"  round {r}: blocked {summary['recall_blocked']:.4f}, "
              f"+review {summary['recall_including_review']:.4f}"
              + (f"  ->  moves {m['parameter']} "
                 f"{m['from']} to {m['to']} (rho {m['rho']:+.3f}, "
                 f"p {m['p']:.3f}{'' if m['significant'] else ', not significant'})"
                 if m else "  (watching only)")
              + f"   [{summary['seconds']}s]")

    return {"rounds": rounds, "worlds_per_round": worlds,
            "n_accounts": n_accounts, "start_tier": START_TIER,
            "trial_spread": TRIAL_SPREAD, "step": STEP,
            "parameters": {k: {kk: vv for kk, vv in v.items()}
                           for k, v in PARAMS.items()},
            "history": history}


def plot_loop(report: dict, path: str) -> None:
    h = report["history"]
    rounds = [s["round"] for s in h]
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(8, 7.5),
                                  gridspec_kw={"height_ratios": [3, 2]},
                                  sharex=True)
    ax.plot(rounds, [s["recall_including_review"] for s in h], "^-",
            c="tab:green", label="stopped (blocked or reviewed)")
    ax.plot(rounds, [s["recall_blocked"] for s in h], "o-", c="tab:blue",
            label="blocked")
    ax.set_ylabel("share of ring accounts")
    ax.set_ylim(-0.02, 1.02)
    ax.set_title("An operator adapting to its own outcomes\n"
                 "it never sees the detector, only what happened to its rings")
    ax.legend(fontsize=9)
    ax.grid(alpha=0.3)
    for s in h:
        m = s.get("move")
        if m:
            ax.annotate(f"raises {m['parameter']}",
                        (s["round"], s["recall_blocked"]),
                        textcoords="offset points", xytext=(6, 16),
                        fontsize=8, color="dimgrey",
                        arrowprops=dict(arrowstyle="->", color="dimgrey",
                                        alpha=0.6))
    first, last = h[0], h[-1]
    ax.annotate(f"blocking falls {first['recall_blocked']:.3f} to "
                f"{last['recall_blocked']:.3f}\nreaching a human barely moves, "
                f"{first['recall_including_review']:.3f} to "
                f"{last['recall_including_review']:.3f}",
                (len(h) - 1, 0.55), ha="right", fontsize=8.5, color="dimgrey")

    names = list(PARAMS)
    for name in names:
        span = PARAMS[name]["hi"] - PARAMS[name]["lo"]
        ax2.plot(rounds,
                 [(s["settings"][name] - PARAMS[name]["lo"]) / span for s in h],
                 "o-", label=name, alpha=0.8, ms=4)
    ax2.set_xlabel("round")
    ax2.set_ylabel("setting, scaled to its range")
    ax2.legend(fontsize=7.5, ncol=2)
    ax2.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rounds", type=int, default=5)
    ap.add_argument("--worlds", type=int, default=60)
    ap.add_argument("--accounts", type=int, default=config.N_ACCOUNTS)
    ap.add_argument("--out", default="results/adaptive_loop.json")
    args = ap.parse_args()

    announce(apply())
    print(f"\n{args.rounds} rounds of adaptation, {args.worlds} worlds each, "
          f"{args.accounts:,} accounts per world")
    print(f"starting from the {START_TIER} settings\n")

    report = loop(args.rounds, args.worlds, args.accounts)
    plot_loop(report, "results/adaptive_loop.png")
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out}, results/adaptive_loop.png")


if __name__ == "__main__":
    main()
