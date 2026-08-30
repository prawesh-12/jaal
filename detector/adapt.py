"""An operator that learns from getting caught, and adapts.

Sophistication has been a dial we set, which invites the fair objection that we
wrote the fraud so of course we catch it. This closes that loop.

The operator never sees the detector's code, its weights, or its thresholds. It
sees what happened to its own rings, and how much of that it can see is a
setting. Each round it tries a spread of settings around where it stands,
measures which of its own five parameters tracks getting stopped, and moves that
one parameter toward evasion. Then it runs again.

How much it can see is `q`, the chance it notices a cluster being reviewed. At
q = 0 a reviewed cluster is indistinguishable from an allowed one, which is the
hardest case for the operator. At q = 1 a review is as visible as a block.

    python -m detector.adapt --rounds 5 --worlds 100
    python -m detector.adapt --visibility-sweep
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

# How much of a review the operator notices. A real one gets partial signal:
# delayed orders, manual verification, held payouts, accounts that go quiet
# without ever being blocked.
VISIBILITY = {"blocks_only": 0.0, "partial_25": 0.25, "partial_50": 0.50,
              "partial_75": 0.75, "full": 1.00}


def _clip(name: str, value: float) -> float:
    p = PARAMS[name]
    return float(np.clip(value, p["lo"], p["hi"]))


def starting_point() -> dict:
    return {k: float(config.TIERS[START_TIER][k]) for k in PARAMS}


def trial_settings(point: dict, rng: np.random.Generator) -> dict:
    out = {}
    for name, spec in PARAMS.items():
        span = (spec["hi"] - spec["lo"]) * TRIAL_SPREAD
        out[name] = _clip(name, point[name] + rng.uniform(-span, span))
    return out


def run_world(seed: int, settings: dict, n_accounts: int, priors: dict,
              link_params: dict, model: dict) -> dict:
    """One world at these settings. Returns what happened to its ring accounts.

    Reviewed clusters come back one by one, because whether the operator
    notices a review is decided per review, not per account.
    """
    world = generate(seed, START_TIER, n_accounts, priors, tier_params=settings)
    rows = features.world_rows(world, link_params)
    n_ring = int(world.truth["is_ring"].sum())
    del world

    if not rows:
        return {"n_ring": n_ring, "blocked": 0, "reviewed": 0,
                "reviewed_clusters": []}

    table = pd.DataFrame(rows)
    X = table[model["features"]]
    purity = np.clip(model["purity"].predict(X), 0.0, 1.0)
    actions = decide.best_action(purity, table["size"].to_numpy())

    ring = table["n_ring_members"].to_numpy()
    return {"n_ring": n_ring,
            "blocked": int(ring[actions == "block"].sum()),
            "reviewed": int(ring[actions == "review"].sum()),
            "reviewed_clusters": [int(x) for x in ring[actions == "review"]]}


def observed_stopped(outcome: dict, q: float, rng: np.random.Generator) -> int:
    """Ring accounts the operator believes were stopped.

    Blocks are always visible. Each review is noticed with probability q, and
    when it is, the whole cluster is noticed with it.
    """
    seen = outcome["blocked"]
    if q <= 0.0:
        return seen
    for ring_in_cluster in outcome["reviewed_clusters"]:
        if q >= 1.0 or rng.random() < q:
            seen += ring_in_cluster
    return seen


def run_round(point: dict, seeds: list[int], n_accounts: int, priors: dict,
              link_params: dict, model: dict, rng: np.random.Generator,
              vary: bool = True, q: float = 0.0,
              detect_rng: np.random.Generator | None = None) -> dict:
    detect_rng = detect_rng or np.random.default_rng(0)
    trials = []
    for seed in seeds:
        settings = trial_settings(point, rng) if vary else dict(point)
        outcome = run_world(seed, settings, n_accounts, priors, link_params,
                            model)
        stopped = outcome["blocked"] + outcome["reviewed"]
        seen = observed_stopped(outcome, q, detect_rng)
        n = outcome["n_ring"]
        trials.append({
            **settings,
            "seed": seed,
            "n_ring": n,
            "blocked": outcome["blocked"],
            "reviewed": outcome["reviewed"],
            "stopped_rate": stopped / n if n else 0.0,
            "blocked_rate": outcome["blocked"] / n if n else 0.0,
            # What the operator believes happened, which is what it acts on.
            "observed_rate": seen / n if n else 0.0,
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
    signal = frame["observed_rate"]
    if vary and signal.nunique() > 1:
        for name in PARAMS:
            rho, p = spearmanr(frame[name], signal)
            if np.isnan(rho):
                rho, p = 0.0, 1.0
            correlations[name] = {"rho": round(float(rho), 4),
                                  "p": round(float(p), 5)}
    summary["correlations"] = correlations
    summary["signal_had_variation"] = bool(signal.nunique() > 1)
    summary["review_visibility"] = q
    summary["observed_rate_mean"] = round(float(signal.mean()), 4)
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


def loop(rounds: int, worlds: int, n_accounts: int, rng_seed: int = 0,
         q: float = 0.0, label: str = "blocks_only",
         loaded: dict = None) -> dict:
    if loaded is None:
        priors = load_priors()
        with open("results/link_params.json") as f:
            link_params = json.load(f)
        with gzip.open("results/model.pkl", "rb") as f:
            model = pickle.load(f)
    else:
        priors, link_params, model = (loaded["priors"], loaded["link_params"],
                                      loaded["model"])
    # Two streams. The trial settings stream is seeded the same whatever the
    # visibility, so every setting starts from the same experiments and only
    # what the operator sees differs.
    rng = np.random.default_rng(rng_seed)
    detect_rng = np.random.default_rng(10_000 + rng_seed)

    point = starting_point()
    history, seed = [], FIRST_SEED
    for r in range(rounds + 1):
        seeds = list(range(seed, seed + worlds))
        seed += worlds
        t0 = time.perf_counter()
        # Round 0 is the operator standing still, so it has a clean starting
        # measurement. From then on it experiments around where it stands.
        summary = run_round(point, seeds, n_accounts, priors, link_params,
                            model, rng, vary=(r > 0), q=q,
                            detect_rng=detect_rng)
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
            "visibility": label, "review_visibility": q,
            "parameters": {k: {kk: vv for kk, vv in v.items()}
                           for k, v in PARAMS.items()},
            "history": history}


def visibility_sweep(rounds: int, worlds: int, n_accounts: int,
                     settings: dict = None, replicates: int = 1) -> dict:
    settings = settings or VISIBILITY
    priors = load_priors()
    with open("results/link_params.json") as f:
        link_params = json.load(f)
    with gzip.open("results/model.pkl", "rb") as f:
        model = pickle.load(f)
    loaded = {"priors": priors, "link_params": link_params, "model": model}

    out = {"rounds": rounds, "worlds_per_round": worlds,
           "n_accounts": n_accounts, "replicates": replicates,
           "visibility_levels": settings, "runs": {}}

    for label, q in settings.items():
        out["runs"][label] = []
        for rep in range(replicates):
            print(f"\n{label} (q = {q:.2f}), replicate {rep + 1} of "
                  f"{replicates}")
            r = loop(rounds, worlds, n_accounts, rng_seed=rep, q=q,
                     label=label, loaded=loaded)
            out["runs"][label].append(r)
    return out


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


def _mean_curve(runs: list[dict], key: str) -> list[float]:
    per_round = list(zip(*[[h[key] for h in r["history"]] for r in runs]))
    return [float(np.mean(v)) for v in per_round]


def _spread_curve(runs: list[dict], key: str) -> list[float]:
    if len(runs) < 2:
        return [0.0] * len(runs[0]["history"])
    per_round = list(zip(*[[h[key] for h in r["history"]] for r in runs]))
    return [float(np.std(v)) for v in per_round]


def plot_visibility(report: dict, path: str) -> None:
    """What the queue does as the operator gets more sight of it.

    Three panels. The first is the honest scale, zero to one, which shows that
    nothing collapses. The second is the same data zoomed, because the whole
    result lives in a band a tenth of that wide and would otherwise be invisible.
    """
    labels = list(report["runs"])
    rounds = list(range(len(report["runs"][labels[0]][0]["history"])))
    colours = plt.cm.viridis(np.linspace(0.05, 0.85, len(labels)))
    reps = report["replicates"]

    fig, (ax, axz, ax2) = plt.subplots(3, 1, figsize=(8.5, 10), sharex=True)
    for label, colour in zip(labels, colours):
        runs = report["runs"][label]
        q = report["visibility_levels"][label]
        stopped = _mean_curve(runs, "recall_including_review")
        blocked = _mean_curve(runs, "recall_blocked")
        spread = _spread_curve(runs, "recall_including_review")
        name = f"{label} (q = {q:.2f})"
        for target in (ax, axz):
            target.plot(rounds, stopped, "o-", color=colour, ms=4, label=name)
            if reps > 1:
                target.fill_between(
                    rounds,
                    [m - s for m, s in zip(stopped, spread)],
                    [m + s for m, s in zip(stopped, spread)],
                    color=colour, alpha=0.15)
        ax2.plot(rounds, blocked, "o-", color=colour, ms=4, label=name)

    ax.set_ylabel("blocked or reviewed")
    ax.set_ylim(-0.02, 1.02)
    ax.set_title("Does the review queue survive an operator who can see it?\n"
                 "q is the chance the operator notices a cluster being reviewed")
    ax.legend(fontsize=8.5, loc="lower left")
    ax.grid(alpha=0.3)

    axz.set_ylabel("blocked or reviewed, zoomed")
    axz.grid(alpha=0.3)
    if reps > 1:
        axz.set_title(f"the same lines, close up. shaded band is one standard "
                      f"deviation over {reps} replicates", fontsize=9)
    else:
        axz.set_title("the same lines, close up", fontsize=9)

    ax2.set_ylabel("blocked")
    ax2.set_xlabel("round")
    ax2.set_ylim(-0.02, 1.02)
    ax2.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def print_visibility(report: dict) -> None:
    labels = list(report["runs"])
    n_rounds = len(report["runs"][labels[0]][0]["history"])
    print(f"\nBlocked or reviewed, by round, "
          f"{report['replicates']} replicate(s) per setting")
    print(f"{'setting':<16}{'q':<7}" + "".join(f"{'r' + str(i):>9}"
                                               for i in range(n_rounds))
          + f"{'fall':>10}")
    print("-" * (23 + 9 * n_rounds + 10))
    for label in labels:
        runs = report["runs"][label]
        c = _mean_curve(runs, "recall_including_review")
        print(f"{label:<16}{report['visibility_levels'][label]:<7.2f}"
              + "".join(f"{v:>9.4f}" for v in c)
              + f"{c[0] - c[-1]:>+10.4f}")

    print(f"\nBlocked, by round")
    print(f"{'setting':<16}{'q':<7}" + "".join(f"{'r' + str(i):>9}"
                                               for i in range(n_rounds)))
    print("-" * (23 + 9 * n_rounds))
    for label in labels:
        c = _mean_curve(report["runs"][label], "recall_blocked")
        print(f"{label:<16}{report['visibility_levels'][label]:<7.2f}"
              + "".join(f"{v:>9.4f}" for v in c))

    print("\nWhat each operator moved")
    for label in labels:
        for rep, run in enumerate(report["runs"][label]):
            moves = [(h["round"], h["move"]) for h in run["history"]
                     if h.get("move")]
            trail = ", ".join(f"r{r}: {m['parameter']} "
                              f"{m['from']:g} to {m['to']:g}"
                              for r, m in moves) or "nothing, no signal"
            tag = f"{label} rep{rep + 1}" if report["replicates"] > 1 else label
            print(f"  {tag:<22} {trail}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rounds", type=int, default=5)
    ap.add_argument("--worlds", type=int, default=100)
    ap.add_argument("--accounts", type=int, default=config.N_ACCOUNTS)
    ap.add_argument("--visibility", default="blocks_only",
                    choices=sorted(VISIBILITY))
    ap.add_argument("--visibility-sweep", action="store_true",
                    help="run the loop at every level of review visibility")
    ap.add_argument("--replicates", type=int, default=1)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    announce(apply())
    print(f"\n{args.rounds} rounds of adaptation, {args.worlds} worlds each, "
          f"{args.accounts:,} accounts per world")
    print(f"starting from the {START_TIER} settings")

    if args.visibility_sweep:
        report = visibility_sweep(args.rounds, args.worlds, args.accounts,
                                  replicates=args.replicates)
        out = args.out or "results/adaptive_visibility.json"
        plot_visibility(report, "results/adaptive_visibility.png")
        print_visibility(report)
    else:
        q = VISIBILITY[args.visibility]
        print(f"review visibility: {args.visibility} (q = {q:.2f})\n")
        report = loop(args.rounds, args.worlds, args.accounts, q=q,
                      label=args.visibility)
        out = args.out or "results/adaptive_loop.json"
        plot_loop(report, "results/adaptive_loop.png")

    with open(out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
