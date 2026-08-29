"""A profile has to be an honest account of what a caller loses.

The failure mode this guards against is a profile that quietly keeps a feature
whose column it cannot supply. That would flatter every ablation result and
turn the integration contract into a sales sheet.
"""

import pytest

from detector import link, profiles
from detector.blocking import BLOCKING_RULES
from detector.features import FEATURE_NAMES
from detector.model import MODEL_FEATURES


def test_every_feature_declares_the_columns_it_reads():
    assert set(profiles.FEATURE_COLUMNS) == set(FEATURE_NAMES)


def test_every_comparison_declares_the_columns_it_reads():
    assert set(profiles.FIELD_COLUMNS) == set(link.COMPARISONS)


def test_declared_columns_are_real_columns():
    for name, cols in profiles.FEATURE_COLUMNS.items():
        for c in cols:
            assert c in profiles.ALL_COLUMNS, f"{name} reads unknown {c}"
    for name, cols in profiles.FIELD_COLUMNS.items():
        for c in cols:
            assert c in profiles.ALL_COLUMNS, f"{name} reads unknown {c}"


def test_the_full_profile_keeps_everything():
    p = profiles.FULL
    assert p.comparisons == link.SCORED_COMPARISONS
    assert len(p.rules) == len(BLOCKING_RULES)
    assert p.features == MODEL_FEATURES
    assert p.missing_columns == ()


def test_the_sdk_payload_is_the_full_column_set():
    """The two fields the merchant sends are what closes the gap. If this ever
    stops holding, the integration story in docs/06-run-and-integrate.md is wrong."""
    sdk = profiles.get("sdk_payload")
    assert set(sdk.columns) == set(profiles.ALL_COLUMNS)
    assert sdk.comparisons == profiles.FULL.comparisons
    assert sdk.features == profiles.FULL.features


@pytest.mark.parametrize("profile", profiles.PROFILES, ids=lambda p: p.name)
def test_a_profile_never_keeps_what_it_cannot_compute(profile):
    for f in profile.features:
        for col in profiles.FEATURE_COLUMNS[f]:
            assert col in profile.columns, f"{profile.name} kept {f} without {col}"
    for c in profile.comparisons:
        for col in profiles.FIELD_COLUMNS[c]:
            assert col in profile.columns, f"{profile.name} kept {c} without {col}"
    for name, cols in profile.rules:
        for col in cols:
            derived = col.startswith("signup_")
            assert col in profile.columns or derived, \
                f"{profile.name} kept rule {name} without {col}"


@pytest.mark.parametrize("profile", profiles.PROFILES, ids=lambda p: p.name)
def test_a_profile_always_has_something_to_work_with(profile):
    assert profile.rules, f"{profile.name} has no blocking rule"
    assert profile.comparisons, f"{profile.name} has no comparison"
    assert "account_id" in profile.columns


def test_dropping_the_signup_clock_drops_the_rules_that_key_on_it():
    strict = profiles.get("aggregator_strict")
    assert "signup_ts" not in strict.columns
    kept = [n for n, _ in strict.rules]
    assert kept == ["device"], kept


def test_matching_picks_the_richest_profile_the_caller_can_run():
    agg = profiles.get("aggregator")
    assert profiles.match(agg.columns).name == "aggregator"
    # Extra columns we do not know about must not change the answer.
    assert profiles.match(list(agg.columns) + ["merchant_id"]).name == "aggregator"
    assert profiles.match(profiles.ALL_COLUMNS).name in ("full", "sdk_payload")


def test_coverage_reports_what_was_ignored():
    cols = list(profiles.get("aggregator").columns) + ["merchant_id"]
    report = profiles.coverage(cols)
    assert report["columns_ignored"] == ["merchant_id"]
    assert "address_id" in report["columns_missing"]
    assert "address" in report["comparisons_lost"]
