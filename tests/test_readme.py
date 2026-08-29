"""Published numbers are tested, not trusted.

Every figure quoted in README.md, docs/04-results.md and docs/05-where-it-fails.md
has to be the one in the results/ file it claims to summarise. A table that has
drifted from its source is worse than no table, so this fails rather than warns.

The split is deliberate. The README carries the headline only, so it stays
readable. The deep tables live in the results docs and are checked there.
"""

import json

import pytest

import config

README = "README.md"
RESULTS_DOC = "docs/04-results.md"
FAILURE_DOC = "docs/05-where-it-fails.md"


def read(path: str) -> str:
    with open(path) as f:
        return f.read()


@pytest.fixture(scope="module")
def readme():
    return read(README)


@pytest.fixture(scope="module")
def results_doc():
    return read(RESULTS_DOC)


@pytest.fixture(scope="module")
def failure_doc():
    return read(FAILURE_DOC)


@pytest.fixture(scope="module")
def holdout():
    with open("results/holdout.json") as f:
        return json.load(f)


def rupees(value) -> str:
    return f"Rs.{abs(int(value)):,}"


# ----------------------------------------------------------------- the README

def test_defence_only_statement_is_in_the_first_200_words(readme):
    """Readers skim the top of the file, so this cannot sit at the bottom."""
    head = " ".join(readme.split()[:200]).lower()
    assert "defence only" in head
    assert "synthetic" in head
    assert "test fixture" in head


def test_the_readme_results_table_matches_the_holdout_file(readme, holdout):
    from detector.decide import format_precision
    for tier, r in holdout["results_matrix"].items():
        row = next((line for line in readme.splitlines()
                    if line.strip().startswith(f"| {tier} |")
                    or line.strip().startswith(f"| **{tier}** |")), None)
        assert row, f"no README row for {tier}"
        for value in (f"{r['pr_auc']:.4f}", format_precision(r["precision"]),
                      f"{r['recall']:.4f}",
                      f"{r['recall_including_review']:.4f}"):
            assert value in row, f"{tier}: {value} missing from README row"
        assert rupees(r["net_vs_nothing_rupees"]) in row


def test_the_pooled_figure_matches(readme, holdout):
    from detector.decide import format_precision
    pooled = holdout["pooled"]
    assert rupees(pooled["net_vs_nothing_rupees"]) in readme
    assert rupees(pooled["do_nothing_rupees"]) in readme
    assert format_precision(pooled["precision"]) in readme


def test_the_baseline_comparison_uses_the_same_worlds(readme):
    with open("results/baseline_holdout.json") as f:
        base = json.load(f)
    assert tuple(base["seed_range"]) == (min(config.HOLDOUT_SEEDS),
                                         max(config.HOLDOUT_SEEDS))
    total = sum(t["net_vs_nothing_rupees"] for t in base["tiers"].values())
    assert rupees(total) in readme, (
        f"README does not quote the baseline total of {rupees(total)}")


def test_the_evaluation_protocol_is_published(readme):
    assert "900-999" in readme
    assert "SEALED" in readme


def test_the_readme_points_at_the_docs_that_carry_the_detail(readme):
    """The README is short on purpose. It has to say where the rest is."""
    for path in ("docs/03-the-model.md", "docs/04-results.md",
                 "docs/05-where-it-fails.md"):
        assert path in readme, f"README does not link {path}"


# ------------------------------------------------------------ 04-results.md

def test_the_results_doc_carries_every_holdout_figure(results_doc, holdout):
    from detector.decide import format_precision
    for tier, r in holdout["results_matrix"].items():
        for value in (f"{r['pr_auc']:.4f}", f"{r['recall']:.4f}",
                      f"{r['recall_including_review']:.4f}",
                      rupees(r["net_vs_nothing_rupees"])):
            assert value in results_doc, f"{tier}: {value} missing"
        assert format_precision(r["precision"]) in results_doc


def test_precision_on_a_tier_that_blocks_nothing_is_undefined(results_doc,
                                                              holdout):
    """No blocks means no denominator. Writing 0.0 there is simply wrong."""
    from detector.decide import NO_BLOCKS
    blocks_nothing = [t for t, r in holdout["results_matrix"].items()
                      if r["precision"] is None]
    assert blocks_nothing, "expected at least one tier that blocks nothing"
    assert NO_BLOCKS in results_doc


def test_the_review_accuracy_table_matches_its_file(results_doc):
    with open("results/review_accuracy.json") as f:
        ra = json.load(f)
    pooled = ra["pooled"]
    assert f"{pooled['ring_accounts_reviewed']:,}" in results_doc
    assert rupees(pooled["worst_case_review_loss_rupees"]) in results_doc
    assert f"{pooled['breakeven_accuracy']:.4f}" in results_doc
    for tier, block in ra["tiers"].items():
        for row in block["curve"]:
            assert rupees(row["net_rupees"]) in results_doc, (
                f"{tier} at accuracy {row['accuracy']}")


def test_the_capacity_figures_match_their_file(results_doc):
    with open("results/review_capacity.json") as f:
        rc = json.load(f)
    per_batch = rc["n_reviewable_clusters"] / rc["n_worlds"]
    assert f"{per_batch:.2f}" in results_doc
    assert rupees(rc["net_with_no_review_rupees"]) in results_doc
    for share in (80, 95):
        assert f"{rc[f'reaches_{share}_percent']['budget_per_world']:.2f}" \
            in results_doc


def test_the_baseline_per_tier_figures_match(results_doc):
    with open("results/baseline_holdout.json") as f:
        base = json.load(f)
    for tier, t in base["tiers"].items():
        assert rupees(t["net_vs_nothing_rupees"]) in results_doc, tier
        assert f"{t['recall']:.4f}" in results_doc, tier


# ------------------------------------------------------- 05-where-it-fails.md

def test_the_adversarial_table_matches_its_file(failure_doc):
    """Every figure in the adversarial table comes from the replicate run."""
    with open("results/adaptive_visibility_replicates.json") as f:
        rep = json.load(f)
    from detector import adapt

    assert str(rep["worlds_per_round"]) in failure_doc
    for label in ("blocks_only", "full"):
        runs = rep["runs"][label]
        curve = adapt._mean_curve(runs, "recall_including_review")
        assert f"{curve[0]:.4f}" in failure_doc, f"{label} round 0"
        assert f"{curve[-1]:.4f}" in failure_doc, f"{label} final round"
        assert f"{curve[0] - curve[-1]:.4f}" in failure_doc, f"{label} fall"
        for run in runs:
            final = run["history"][-1]["recall_including_review"]
            assert f"{final:.4f}" in failure_doc, f"{label} replicate {final}"


def test_the_doc_does_not_overlap_the_two_visibility_settings(failure_doc):
    """The claim that they separate has to hold in the file it came from."""
    with open("results/adaptive_visibility_replicates.json") as f:
        rep = json.load(f)
    worst_blind = min(r["history"][-1]["recall_including_review"]
                      for r in rep["runs"]["blocks_only"])
    best_seeing = max(r["history"][-1]["recall_including_review"]
                      for r in rep["runs"]["full"])
    assert worst_blind > best_seeing
    assert "do not overlap" in failure_doc


def test_the_mechanism_table_matches_its_file(failure_doc):
    with open("results/adaptive_mechanism.json") as f:
        mech = json.load(f)
    for label, block in mech["configs"].items():
        assert f"{block['recall_including_review']:.4f}" in failure_doc, label
    singles = [v["change_vs_ordinary"] for k, v in mech["configs"].items()
               if k not in ("ordinary", "both rotated",
                            "everything at its limit")]
    assert f"{sum(singles):.4f}" in failure_doc
    assert f"{mech['configs']['everything at its limit']['change_vs_ordinary']:.4f}" \
        in failure_doc


def test_the_doc_says_the_old_reading_was_wrong(failure_doc):
    """The invisibility claim was published and then falsified. Say so."""
    assert "was wrong" in failure_doc or "was\nwrong" in failure_doc
    assert "search failure by the attacker" in failure_doc


def test_the_disproved_feature_is_reported_as_disproved(failure_doc):
    with open("results/reassembly.json") as f:
        r = json.load(f)
    assert r["improves"] is False
    assert rupees(r["delta_net_rupees"]) in failure_doc


# ------------------------------------------------------------- all documents

@pytest.mark.parametrize("path", [README, RESULTS_DOC, FAILURE_DOC,
                                  "docs/01-problem.md",
                                  "docs/02-how-it-works.md",
                                  "docs/03-the-model.md",
                                  "docs/06-run-and-integrate.md",
                                  "docs/glossary.md"])
def test_no_placeholder_numbers_survive(path):
    text = read(path)
    for bad in ("TODO", "XXX", "roughly 90%", "should be around"):
        assert bad not in text, f"{path}: {bad}"


@pytest.mark.parametrize("path", [README, RESULTS_DOC, FAILURE_DOC,
                                  "docs/01-problem.md",
                                  "docs/02-how-it-works.md",
                                  "docs/03-the-model.md",
                                  "docs/06-run-and-integrate.md",
                                  "docs/glossary.md"])
def test_no_em_or_en_dashes(path):
    """House style. Commas, periods, colons or brackets instead."""
    text = read(path)
    for dash in ("—", "–"):
        assert dash not in text, f"{path} contains {dash!r}"
