"""Review notes. The rule is that every number traces back to the pipeline."""

import json
import os

import pytest

from detector import explain

FACTS = {"size": 22.0, "signup_span_days": 4.2, "coupon_rate": 1.0,
         "repeat_rate": 0.0, "near_min_rate": 0.86, "total_discount": 4400.0,
         "pincode_concentration": 1.0, "distinct_bin_ratio": 0.09}
SIGNALS = [("device agreement, average edge", 41.3),
           ("weakest link inside the cluster", 18.7),
           ("spread of edge strength", 5.2)]


def test_the_cache_key_covers_the_evidence_too():
    """Regression. Two clusters with identical facts and different edge
    strengths shared a cache entry, so the second was handed a note quoting the
    first one's bits. The audit caught it, which is what the audit is for."""
    a = explain.cache_key(FACTS, 0.83, "review", SIGNALS)
    other = [("device agreement, average edge", 55.8)] + SIGNALS[1:]
    b = explain.cache_key(FACTS, 0.83, "review", other)
    assert a != b


def test_the_cache_key_is_stable_across_runs():
    a = explain.cache_key(FACTS, 0.83, "review", SIGNALS)
    b = explain.cache_key(dict(FACTS), 0.8299, "review", list(SIGNALS))
    assert a == b


def test_the_template_never_fails():
    note = explain.template_explanation(FACTS, 0.83, "review", SIGNALS)
    assert "22 accounts" in note
    assert "Rs.4,400" in note
    assert "review" in note


def test_the_template_invents_nothing():
    note = explain.template_explanation(FACTS, 0.83, "review", SIGNALS)
    assert explain.audit_note(note, FACTS, 0.83, SIGNALS) == []


def test_the_audit_catches_an_invented_number():
    """The stray token is returned as it appears in the note, so a human
    reading the report can find it."""
    note = "22 accounts, and 7,913 rupees that came from nowhere."
    assert explain.audit_note(note, FACTS, 0.83, SIGNALS) == ["7,913"]


def test_a_missing_key_falls_back_rather_than_raising(monkeypatch, tmp_path):
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    rec = explain.explain(FACTS, 0.83, "review", SIGNALS, live=True,
                          cache_dir=str(tmp_path))
    assert rec["source"] == "template"
    assert os.path.exists(tmp_path / f"{rec['key']}.json")


def test_the_prompt_forbids_speculation():
    prompt = explain.build_prompt(FACTS, 0.83, "review", SIGNALS)
    assert "Use ONLY the facts below" in prompt
    assert "do not add any number" in prompt


def test_every_committed_note_traces_back():
    path = "results/explanations.json"
    if not os.path.exists(path):
        pytest.skip("results/explanations.json not built yet. Run ./run.sh.")
    with open(path) as f:
        report = json.load(f)
    assert report["notes_with_unverified_numbers"] == 0
    assert report["n_notes"] > 30


def test_every_flagged_cluster_has_a_reason():
    path = "results/explanations.json"
    if not os.path.exists(path):
        pytest.skip("results/explanations.json not built yet.")
    with open(path) as f:
        report = json.load(f)
    actions = {n["action"] for n in report["notes"]}
    assert actions <= {"block", "review"}, "an allowed cluster got a note"
    assert "block" in actions and "review" in actions
