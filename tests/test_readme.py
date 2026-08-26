"""The README quotes numbers. This checks they are the ones in results/.

A results table that has drifted from the file it claims to summarise is worse
than no table, so this fails rather than warns.
"""

import json
import re

import pytest

import config

README = "README.md"


@pytest.fixture(scope="module")
def readme():
    with open(README) as f:
        return f.read()


@pytest.fixture(scope="module")
def holdout():
    with open("results/holdout.json") as f:
        return json.load(f)


def test_defence_only_statement_is_in_the_first_200_words(readme):
    """Readers skim the top of the file, so this cannot sit at the bottom."""
    words = readme.split()[:200]
    head = " ".join(words).lower()
    assert "defence only" in head
    assert "synthetic" in head
    assert "test fixture" in head


def test_the_results_table_matches_the_holdout_file(readme, holdout):
    for tier, r in holdout["results_matrix"].items():
        row = next((line for line in readme.splitlines()
                    if line.strip().startswith(f"| {tier} |")
                    or line.strip().startswith(f"| **{tier}** |")), None)
        assert row, f"no README row for {tier}"
        from detector.decide import format_precision
        for value in (f"{r['pr_auc']:.4f}", format_precision(r["precision"]),
                      f"{r['recall']:.4f}",
                      f"{r['recall_including_review']:.4f}"):
            assert value in row, f"{tier}: {value} missing from README row"
        net = f"Rs.{abs(r['net_vs_nothing_rupees']):,}"
        assert net in row, f"{tier}: {net} missing from README row"


def test_the_pooled_figure_matches(readme, holdout):
    pooled = holdout["pooled"]
    assert f"Rs.{pooled['net_vs_nothing_rupees']:,}" in readme
    assert f"Rs.{pooled['do_nothing_rupees']:,}" in readme
    from detector.decide import format_precision
    assert format_precision(pooled["precision"]) in readme


def test_the_baseline_comparison_uses_the_same_worlds(readme):
    with open("results/baseline_holdout.json") as f:
        base = json.load(f)
    lo, hi = base["seed_range"]
    assert (lo, hi) == (min(config.HOLDOUT_SEEDS), max(config.HOLDOUT_SEEDS))
    total = sum(t["net_vs_nothing_rupees"] for t in base["tiers"].values())
    assert f"Rs.{abs(total):,}" in readme, (
        f"README does not quote the baseline total of Rs.{abs(total):,}")


def test_no_placeholder_numbers_survive(readme):
    for bad in ("TODO", "XXX", "roughly 90%", "should be around"):
        assert bad not in readme, bad


def test_the_evaluation_protocol_is_published(readme):
    assert "900-999" in readme
    assert "SEALED" in readme


def test_the_review_accuracy_table_matches_its_file(readme):
    with open("results/review_accuracy.json") as f:
        ra = json.load(f)
    pooled = ra["pooled"]
    assert f"{pooled['ring_accounts_reviewed']:,}" in readme
    assert f"Rs.{pooled['worst_case_review_loss_rupees']:,}" in readme
    assert f"{pooled['breakeven_accuracy']:.4f}" in readme
    for tier, block in ra["tiers"].items():
        for row in block["curve"]:
            v = row["net_rupees"]
            assert f"Rs.{abs(v):,}" in readme, f"{tier} at {row['accuracy']}"


def test_the_capacity_figures_match_their_file(readme):
    with open("results/review_capacity.json") as f:
        rc = json.load(f)
    per_batch = rc["n_reviewable_clusters"] / rc["n_worlds"]
    assert f"{per_batch:.2f}" in readme
    assert f"Rs.{rc['net_with_no_review_rupees']:,}" in readme
    for share in (80, 95):
        hit = rc[f"reaches_{share}_percent"]
        assert f"{hit['budget_per_world']:.2f}" in readme


def test_the_adversarial_figures_match_their_file(readme):
    with open("results/adaptive_loop.json") as f:
        al = json.load(f)
    first, last = al["history"][0], al["history"][-1]
    assert str(al["worlds_per_round"]) in readme
    for value in (f"{first['recall_blocked']:.4f}",
                  f"{first['recall_including_review']:.4f}",
                  f"{last['recall_including_review']:.4f}"):
        assert value in readme, value


def test_the_baseline_per_tier_figures_match(readme):
    with open("results/baseline_holdout.json") as f:
        base = json.load(f)
    for tier, t in base["tiers"].items():
        assert f"Rs.{abs(t['net_vs_nothing_rupees']):,}" in readme, tier
        assert f"{t['recall']:.4f}" in readme, tier
