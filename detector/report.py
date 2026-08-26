"""Print every measured number in one place, and write it as markdown.

Reads results/ and formats it. Computes nothing, so anything it prints can be
traced back to the file that produced it.

    python -m detector.report
    python -m detector.report --out docs/METRICS.md
"""

from __future__ import annotations

import argparse
import json
import os

import config
from detector.decide import format_precision

RESULTS = config.RESULTS_DIR


def load(name: str):
    path = os.path.join(RESULTS, f"{name}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def rupees(n: int) -> str:
    sign = "+" if n >= 0 else "-"
    return f"{sign}Rs.{abs(int(n)):,}"


def section(title: str) -> str:
    return f"\n## {title}\n"


def build() -> str:
    out = ["# Measured results",
           "",
           "Every number here was produced by a run and read back out of "
           "`results/`. Nothing is copied by hand.", ""]

    gen = load("generator_check")
    if gen:
        out.append(section("Generator"))
        out.append(f"{gen['n_seeds']} worlds per tier, "
                   f"{gen['n_accounts']:,} accounts each.\n")
        out.append("| tier | prevalence | rings | lookalike groups | "
                   "device reuse in rings | address reuse in rings |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for tier, t in gen["tiers"].items():
            out.append(f"| {tier} | {t['prevalence_min']:.4f} | "
                       f"{t['rings_min']}-{t['rings_max']} | "
                       f"{t['lookalike_groups_min']} | "
                       f"{t['device_collisions_within_rings']} | "
                       f"{t['address_collisions_within_rings']} |")
        d, tm = gen["determinism"], gen["timing"]
        out.append(f"\nSeed {d['seed']} generated twice, byte identical: "
                   f"**{d['byte_identical']}**. "
                   f"{tm['worlds']} worlds in {tm['seconds']}s.")

    blk = load("blocking")
    if blk:
        out.append(section("Blocking"))
        out.append("Candidate pairs, and the ceiling they put on everything "
                   "downstream.\n")
        out.append("| tier | recall | worst world | pair reduction | "
                   "candidate pairs |")
        out.append("| --- | --- | --- | --- | --- |")
        for tier, t in blk["tiers"].items():
            out.append(f"| {tier} | {t['blocking_recall']:.4f} | "
                       f"{t['recall_min']:.4f} | "
                       f"{t['pair_reduction_ratio']:.5f} | "
                       f"{t['candidate_pairs_mean']:,} |")

    ev = load("link_eval")
    if ev:
        thr = ev["threshold_bits"]
        out.append(section("Pair scoring"))
        out.append(f"At {thr:.0f} bits, term frequency weight {ev['tf_weight']}.\n")
        out.append("| tier | pair precision | pair recall | edges per world |")
        out.append("| --- | --- | --- | --- |")
        n = ev["seeds"][1] - ev["seeds"][0] + 1
        for tier, rows in ev["sweep"].items():
            r = next(x for x in rows if x["threshold_bits"] == thr)
            out.append(f"| {tier} | {r['precision']:.4f} | {r['recall']:.4f} "
                       f"| {r['edges'] // n:,} |")

    cl = load("clustering")
    if cl:
        out.append(section("Clustering"))
        out.append(f"Leiden at resolution {cl['resolution']}, edges over "
                   f"{cl['edge_threshold_bits']:.0f} bits.\n")
        out.append("| tier | clusters | pair F1 | largest cluster | "
                   "Leiden disconnected | Louvain disconnected |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for tier, t in cl["tiers"].items():
            lv = t.get("louvain", {})
            out.append(f"| {tier} | {t['n_clusters']:,} | {t['pair_f1']:.4f} | "
                       f"{t['max_cluster_size']} | {t['leiden_disconnected']} "
                       f"| {lv.get('disconnected', '-')} |")

    md = load("model")
    if md:
        out.append(section("Model"))
        best = md["variants"][f"forest_{md['calibration_method']}"]
        pooled = best["all_tiers_pooled"]
        out.append(f"{md['n_train_clusters']:,} clusters to train on, "
                   f"{md['n_val_clusters']:,} to validate. "
                   f"Cluster prevalence {pooled['prevalence']:.4f}.\n")
        out.append("| variant | PR-AUC | baseline | lift | Brier | ROC-AUC |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for name, v in md["variants"].items():
            a = v["all_tiers_pooled"]
            out.append(f"| {name} | {a['pr_auc']:.4f} | "
                       f"{a['pr_auc_baseline']:.4f} | "
                       f"{a['lift_over_baseline']:.1f}x | {a['brier']:.5f} | "
                       f"{a['roc_auc']:.4f} |")
        out.append(f"\nCalibration chosen: **{md['calibration_method']}**. "
                   f"Brier {md['brier_raw']:.5f} raw, "
                   f"{md['brier_sigmoid']:.5f} Platt, "
                   f"{md['brier_isotonic']:.5f} isotonic.\n")
        out.append("| tier | clusters | positives | PR-AUC | lift | Brier |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for tier in config.TIER_NAMES:
            r = best[tier]
            out.append(f"| {tier} | {r['n']:,} | {r['positives']} | "
                       f"{r['pr_auc']:.4f} | {r['lift_over_baseline']:.1f}x | "
                       f"{r['brier']:.5f} |")
        imp = list(md["permutation_importance"].items())[:8]
        out.append("\nTop features by permutation importance:\n")
        out.append("| feature | drop in average precision |")
        out.append("| --- | --- |")
        for k, v in imp:
            out.append(f"| {k} | {v:.5f} |")

    dec = load("decisions")
    if dec:
        out.append(section("Decisions"))
        out.append(f"Blocking an innocent customer costs "
                   f"Rs.{dec['cost_blocked_innocent']:,}. Missing an abuser "
                   f"costs Rs.{dec['cost_missed_abuser']:,}. Blocking only pays "
                   f"above **{dec['breakeven_precision']:.1%}** precision.\n")
        out.append("| policy | precision | recall | accounts blocked | "
                   "reviewed | net against doing nothing |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for label, key in (("F1-optimal threshold", "f1_optimal"),
                           ("threshold 0.50", "at_half"),
                           ("best two-action threshold", "cost_optimal"),
                           ("three actions, expected cost", "three_action")):
            r = dec[key]
            out.append(f"| {label} | {format_precision(r['precision'])} | "
                       f"{r['recall']:.4f} "
                       f"| {r['accounts_blocked']:,} | "
                       f"{r['accounts_reviewed']:,} | "
                       f"{rupees(r['net_vs_nothing_rupees'])} |")
        losing = [r for r in dec["threshold_sweep"]
                  if r["net_vs_nothing_rupees"] > 0]
        out.append(f"\nOf {len(dec['threshold_sweep'])} two-action thresholds "
                   f"swept, **{len(losing)}** turn a profit.\n")
        out.append("| cost ratio | a wrong block costs | best threshold | "
                   "net, three actions |")
        out.append("| --- | --- | --- | --- |")
        for s in dec["sensitivity"]:
            out.append(f"| {s['cost_ratio']}:1 | "
                       f"Rs.{s['cost_blocked_innocent']:,} | "
                       f"{s['optimal_threshold']:.2f} | "
                       f"{rupees(s['three_action_net'])} |")

    ho = load("holdout")
    if ho:
        out.append(section("Sealed holdout"))
        out.append(f"Seeds 900 to 999, {ho['n_seeds']} worlds per tier, "
                   f"{ho['n_accounts_per_world']:,} accounts each. Opened once.\n")
        out.append("| tier | PR-AUC | precision | recall | blocked or reviewed "
                   "| Brier | net |")
        out.append("| --- | --- | --- | --- | --- | --- | --- |")
        for tier, r in ho["results_matrix"].items():
            out.append(f"| {tier} | {r['pr_auc']:.4f} | "
                       f"{format_precision(r['precision'])} | "
                       f"{r['recall']:.4f} | "
                       f"{r['recall_including_review']:.4f} | "
                       f"{r['brier']:.5f} | "
                       f"{rupees(r['net_vs_nothing_rupees'])} |")
        p = ho["pooled"]
        out.append(f"\nPooled: precision {format_precision(p['precision'])}, recall "
                   f"{p['recall']:.4f}, recall including review "
                   f"{p['recall_including_review']:.4f}, "
                   f"**{rupees(p['net_vs_nothing_rupees'])}** against "
                   f"Rs.{p['do_nothing_rupees']:,} for doing nothing.")

        base = load("baseline_holdout")
        if base:
            total = sum(t["net_vs_nothing_rupees"]
                        for t in base["tiers"].values())
            out.append(section("Rules baseline, same worlds"))
            out.append("| tier | precision | recall | net |")
            out.append("| --- | --- | --- | --- |")
            for tier, t in base["tiers"].items():
                out.append(f"| {tier} | {t['precision']:.4f} | "
                           f"{t['recall']:.4f} | "
                           f"{rupees(t['net_vs_nothing_rupees'])} |")
            out.append(f"\nBaseline total **{rupees(total)}** against Jaal's "
                       f"{rupees(p['net_vs_nothing_rupees'])}. "
                       f"Difference Rs.{abs(total - p['net_vs_nothing_rupees']):,}.")

        out.append(section("Where it stops working"))
        out.append("| sophistication | accounts per drop address | device reuse "
                   "| recall, blocked | recall, blocked or reviewed |")
        out.append("| --- | --- | --- | --- | --- |")
        for c in ho["detection_curve"][:9]:
            out.append(f"| {c['sophistication']:.2f} | "
                       f"{c['accounts_per_drop']:.1f} | "
                       f"{c['device_reuse']:.2f} | {c['recall']:.4f} | "
                       f"{c['recall_including_review']:.4f} |")

        st = ho["lookalike_stress"]
        out.append(section("False positives on data with no rings"))
        out.append(f"{st['worlds']} worlds, {st['n_accounts']:,} accounts, "
                   f"zero rings.\n")
        out.append("| group kind | clusters | wrongly blocked | sent to review |")
        out.append("| --- | --- | --- | --- |")
        for kind, v in st["by_kind"].items():
            out.append(f"| {kind} | {v['clusters']:,} | "
                       f"{v['wrongly_blocked']} | {v['sent_to_review']} |")
        out.append(f"\nTotal wrongly blocked: "
                   f"**{st['accounts_wrongly_blocked']} accounts**, "
                   f"Rs.{st['cost_of_those_blocks_rupees']:,}.")

        out.append(section("Failure modes"))
        out.append("| failure | example | detail |")
        out.append("| --- | --- | --- |")
        for f in ho["failure_catalogue"]:
            out.append(f"| {f['failure']} | {f['example']} | {f['detail']} |")

    ra = load("review_accuracy")
    if ra:
        out.append(section("How accurate does the reviewer have to be?"))
        pooled = ra["pooled"]
        out.append(f"Every rupee above assumes a person resolves each reviewed "
                   f"cluster correctly. {pooled['ring_accounts_reviewed']:,} ring "
                   f"accounts sit in that queue, so at Rs."
                   f"{ra['cost_missed_abuser']} a coupon the queue can cost at "
                   f"most Rs.{pooled['worst_case_review_loss_rupees']:,}.\n")
        tiers = list(ra["tiers"])
        out.append("| reviewer accuracy | "
                   + " | ".join(tiers) + " | pooled |")
        out.append("| --- |" + " --- |" * (len(tiers) + 1))
        for i, a in enumerate(ra["accuracies"]):
            cells = [rupees(ra["tiers"][t]["curve"][i]["net_rupees"])
                     for t in tiers]
            cells.append(rupees(pooled["curve"][i]["net_rupees"]))
            out.append(f"| {a:.2f} | " + " | ".join(cells) + " |")
        beven = [("never" if ra["tiers"][t]["breakeven_accuracy"] is None
                  else f"{ra['tiers'][t]['breakeven_accuracy']:.4f}")
                 for t in tiers]
        beven.append("never" if pooled["breakeven_accuracy"] is None
                     else f"{pooled['breakeven_accuracy']:.4f}")
        out.append("| **break-even** | " + " | ".join(beven) + " |")
        out.append("\n`never` means the tier stays ahead even if the reviewer "
                   "resolves nothing at all, because blocking alone already pays "
                   "for the queue.")

    rc = load("review_capacity")
    if rc:
        out.append(section("How many clusters can one person get through?"))
        out.append(f"The queue holds {rc['n_reviewable_clusters']:,} clusters "
                   f"across {rc['n_worlds']} batches, which is "
                   f"{rc['n_reviewable_clusters'] / rc['n_worlds']:.2f} per "
                   f"batch of 12,000 accounts. Blocking alone already nets "
                   f"Rs.{rc['net_with_no_review_rupees']:,} with no analyst at "
                   f"all, so review adds "
                   f"Rs.{rc['review_attributable_benefit_rupees']:,} on top.\n")
        out.append("Clusters are opened best first, ranked by expected value: "
                   "predicted purity times accounts times the coupon, minus "
                   "analyst time on every account. A cluster that does not fit "
                   "the budget falls back to whichever of blocking and allowing "
                   "is cheaper.\n")
        out.append("| clusters per batch | total | net | share of what review adds | recall incl. review |")
        out.append("| --- | --- | --- | --- | --- |")
        step = max(1, len(rc["curve"]) // 10)
        for r in rc["curve"][::step] + [rc["curve"][-1]]:
            out.append(f"| {r['budget_per_world']:.2f} | "
                       f"{r['budget_clusters']:,} | "
                       f"Rs.{r['net_rupees']:,} | "
                       f"{r['share_of_review_benefit']:.4f} | "
                       f"{r['recall_including_review']:.4f} |")
        out.append("")
        for share in (50, 80, 90, 95):
            hit = rc[f"reaches_{share}_percent"]
            if hit:
                out.append(f"- {share}% of what review adds needs "
                           f"**{hit['budget_per_world']:.2f} clusters per "
                           f"batch** ({hit['budget_clusters']:,} in total)")
        dips = rc["steps_where_more_capacity_paid_less"]
        best = rc["best_budget"]
        if dips:
            out.append(f"\nThe curve is not perfectly monotonic. "
                       f"{len(dips)} of {len(rc['curve']) - 1} steps paid less "
                       f"with more capacity, the worst by "
                       f"Rs.{abs(min(d['rupees'] for d in dips)):,}. A cluster "
                       f"pushed out of the queue falls back to blocking, and "
                       f"blocking a genuinely pure cluster costs nothing while "
                       f"reviewing it costs Rs.{config.COST_ANALYST_REVIEW} an "
                       f"account. The best budget measured is "
                       f"{best['budget_per_world']:.2f} clusters per batch at "
                       f"Rs.{best['net_rupees']:,}, which is "
                       f"Rs.{best['net_rupees'] - rc['net_with_unlimited_review_rupees']:,} "
                       f"above an unlimited queue.")

    al = load("adaptive_loop")
    if al:
        out.append(section("An operator that adapts"))
        out.append(f"{al['rounds']} rounds, {al['worlds_per_round']} worlds "
                   f"each, starting from the {al['start_tier']} settings. The "
                   f"operator sees only what share of its own accounts got "
                   f"blocked. A cluster sent to a human looks the same to it as "
                   f"one that was allowed.\n")
        out.append("| round | blocked | blocked or reviewed | parameter moved "
                   "| from | to |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for h in al["history"]:
            m = h.get("move")
            tail = (f"{m['parameter']} | {m['from']} | {m['to']} |"
                    if m else "none, no signal to learn from | | |")
            out.append(f"| {h['round']} | {h['recall_blocked']:.4f} | "
                       f"{h['recall_including_review']:.4f} | " + tail)
        first, last = al["history"][0], al["history"][-1]
        out.append(f"\nBlocking fell from {first['recall_blocked']:.4f} to "
                   f"{last['recall_blocked']:.4f}. The share reaching a human "
                   f"fell from {first['recall_including_review']:.4f} to "
                   f"{last['recall_including_review']:.4f}.")

    rs = load("reassembly")
    if rs:
        out.append(section("Rejoining split rings: measured and rejected"))
        a, b = rs["arms"]["as_is"], rs["arms"]["reassembled"]
        out.append(f"Clusters sharing a pincode and an overlapping signup "
                   f"window were merged, gated so the joined group could not "
                   f"be less pure than its parts. Measured on validation "
                   f"seeds {rs['seeds'][0]} to {rs['seeds'][1]}, "
                   f"{rs['n_worlds']} worlds.\n")
        out.append("| | as is | reassembled |")
        out.append("| --- | --- | --- |")
        out.append(f"| clusters | {a['n_clusters']:,} | {b['n_clusters']:,} |")
        out.append(f"| accounts blocked | {a['accounts_blocked']:,} | "
                   f"{b['accounts_blocked']:,} |")
        out.append(f"| accounts reviewed | {a['accounts_reviewed']:,} | "
                   f"{b['accounts_reviewed']:,} |")
        out.append(f"| recall | {a['recall']:.4f} | {b['recall']:.4f} |")
        out.append(f"| recall incl. review | "
                   f"{a['recall_including_review']:.4f} | "
                   f"{b['recall_including_review']:.4f} |")
        out.append(f"| net against doing nothing | "
                   f"{rupees(a['net_vs_nothing_rupees'])} | "
                   f"{rupees(b['net_vs_nothing_rupees'])} |")
        st = b["merge_stats"]
        out.append(f"\n{st['proposed']:,} merges proposed, {st['accepted']:,} "
                   f"accepted, {st['rejected_purity']:,} rejected because the "
                   f"joined group would have been less pure, "
                   f"{st['rejected_size']:,} rejected as too large.\n")
        out.append(f"It made things worse by "
                   f"Rs.{abs(rs['delta_net_rupees']):,}. Every cost in this "
                   f"system scales with cluster size: reviewing costs "
                   f"Rs.{config.COST_ANALYST_REVIEW} an account and blocking "
                   f"needs a higher purity to pay for a bigger group. The gate "
                   f"protected the purity ratio and could not protect the "
                   f"economics. The code is kept and is off by default.")

    vr = load("adaptive_visibility_replicates")
    mech = load("adaptive_mechanism")
    if vr:
        from detector.adapt import _mean_curve
        out.append(section("What happens when the operator can see the queue"))
        out.append(f"`q` is the chance the operator notices a cluster being "
                   f"reviewed. {vr['replicates']} replicates of each setting, "
                   f"{vr['worlds_per_round']} worlds a round.\n")
        out.append("| what the operator sees | round 0 | round 5 | fall | "
                   "replicates |")
        out.append("| --- | --- | --- | --- | --- |")
        for label, runs in vr["runs"].items():
            c = _mean_curve(runs, "recall_including_review")
            finals = ", ".join(
                f"{r['history'][-1]['recall_including_review']:.4f}"
                for r in runs)
            q = vr["visibility_levels"][label]
            out.append(f"| {label} (q = {q:.2f}) | {c[0]:.4f} | {c[-1]:.4f} | "
                       f"{c[0] - c[-1]:.4f} | {finals} |")
        out.append("\nSeeing the queue roughly doubles how fast it erodes and "
                   "does not collapse it. What it changes is which parameter "
                   "the operator finds.")

    if mech:
        out.append(section("Why the queue holds"))
        out.append(f"Fixed settings, no adaptation, {mech['n_worlds']} worlds "
                   f"each.\n")
        out.append("| what the operator changes | blocked | blocked or reviewed "
                   "| change |")
        out.append("| --- | --- | --- | --- |")
        for label, c in mech["configs"].items():
            out.append(f"| {label} | {c['recall_blocked']:.4f} | "
                       f"{c['recall_including_review']:.4f} | "
                       f"{c['change_vs_ordinary']:+.4f} |")
        singles = [v["change_vs_ordinary"] for k, v in mech["configs"].items()
                   if k not in ("ordinary", "both rotated",
                                "everything at its limit")]
        together = mech["configs"]["everything at its limit"]["change_vs_ordinary"]
        out.append(f"\nThe five single changes sum to {sum(singles):.4f}. "
                   f"Together they cost {together:.4f}, "
                   f"{together / sum(singles):.1f} times the sum of the parts. "
                   f"No one change and no pair gets the operator anywhere, and "
                   f"a rule that moves one thing a round never assembles all "
                   f"five.")

    ex = load("explanations")
    if ex:
        out.append(section("Review notes"))
        out.append(f"{ex['n_notes']:,} notes for every cluster not simply "
                   f"allowed. Sources: "
                   + ", ".join(f"{k} {v}" for k, v in ex["sources"].items())
                   + f". Notes quoting a number not from the pipeline: "
                   f"**{ex['notes_with_unverified_numbers']}**.")

    out.append(section("Charts"))
    for f, what in (("pr_curve.png", "Precision-recall by tier"),
                    ("reliability.png", "Reliability diagram, before and after calibration"),
                    ("cost_curve.png", "Cost against blocking threshold"),
                    ("detection_curve.png", "Where the detector stops working")):
        mark = "yes" if os.path.exists(os.path.join(RESULTS, f)) else "missing"
        out.append(f"- `results/{f}`, {what} ({mark})")

    return "\n".join(out) + "\n"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default=None)
    args = p.parse_args()
    text = build()
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
