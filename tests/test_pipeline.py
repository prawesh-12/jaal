"""The batch entry point and the HTTP service over it."""

import pytest

from detector.generate_accounts import generate
from detector.pipeline import REQUIRED_COLUMNS, Detector

SMALL = 3000


@pytest.fixture(scope="module")
def detector():
    return Detector.load()


@pytest.fixture(scope="module")
def result(detector):
    world = generate(702, "moderate", SMALL)
    return detector.scan(world.accounts)


def test_scan_needs_only_raw_account_columns():
    """A caller has these twelve fields. It should not have to build features."""
    world = generate(702, "moderate", 500)
    assert set(REQUIRED_COLUMNS) <= set(world.accounts.columns)
    assert len(REQUIRED_COLUMNS) == 12


def test_scan_rejects_a_frame_that_is_missing_a_column(detector):
    world = generate(702, "moderate", 500)
    with pytest.raises(ValueError, match="missing"):
        detector.scan(world.accounts.drop(columns=["card_bin"]))


def test_every_cluster_carries_a_priced_decision(result):
    assert result["n_clusters"] > 0
    for c in result["clusters"]:
        assert c["action"] in ("block", "allow", "review")
        assert set(c["expected_cost_rupees"]) == {"block", "allow", "review"}
        cheapest = min(c["expected_cost_rupees"],
                       key=c["expected_cost_rupees"].get)
        assert c["action"] == cheapest


def test_flagged_clusters_carry_a_reason(result):
    for c in result["clusters"]:
        if c["action"] != "allow":
            assert c["reason"]
            assert c["reason_source"] in ("cache", "live", "template")


def test_accounts_are_returned_by_id_not_row_number(result):
    for c in result["clusters"]:
        assert len(c["accounts"]) == c["size"]
        assert all(isinstance(a, str) for a in c["accounts"])


def test_no_account_appears_in_two_clusters(result):
    seen = set()
    for c in result["clusters"]:
        assert not seen & set(c["accounts"])
        seen |= set(c["accounts"])


def test_the_summary_adds_up(result):
    s = result["summary"]
    counts = {"block": 0, "review": 0, "allow": 0}
    for c in result["clusters"]:
        counts[c["action"]] += 1
    assert counts == {k: s[k] for k in counts}


def test_timings_are_reported_for_every_stage(result):
    for stage in ("block_ms", "link_ms", "cluster_ms", "features_ms",
                  "score_ms", "total_ms"):
        assert result["timings_ms"][stage] >= 0


def test_an_empty_looking_batch_does_not_crash(detector):
    """A tiny batch forms no clusters. That is an answer, not an error."""
    world = generate(702, "moderate", 500)
    out = detector.scan(world.accounts.head(20))
    assert out["n_clusters"] >= 0
    assert out["summary"]["block"] == 0


# the http service

@pytest.fixture(scope="module")
def client():
    from api.app import app
    return app.test_client()


def test_health_answers_without_loading_the_model(client):
    assert client.get("/health").json["ok"] is True


def test_schema_tells_a_client_what_to_send(client):
    body = client.get("/v1/schema").json
    assert set(body["scan"]["required_columns"]) == set(REQUIRED_COLUMNS)
    assert body["costs_rupees"]["blocked_innocent"] == 15_000


def test_scan_endpoint_takes_raw_accounts(client):
    world = generate(703, "obvious", 2000)
    body = client.post("/v1/scan",
                       json={"accounts": world.accounts.to_dict("records")}).json
    assert body["n_accounts"] == 2000
    assert "summary" in body
    assert all(c["action"] != "allow" for c in body["clusters"])


def test_scan_endpoint_can_return_the_allowed_clusters_too(client):
    world = generate(703, "obvious", 2000)
    body = client.post("/v1/scan",
                       json={"accounts": world.accounts.to_dict("records"),
                             "include_allowed": True}).json
    assert len(body["clusters"]) == body["n_clusters"]


def test_scan_endpoint_rejects_a_bad_body(client):
    assert client.post("/v1/scan", json={}).status_code == 400
    assert client.post("/v1/scan", json={"accounts": [{"account_id": "a"}]}
                       ).status_code == 400


def test_scan_endpoint_refuses_an_oversized_batch(client):
    from api.app import MAX_ACCOUNTS_PER_SCAN
    too_many = [{"account_id": f"a{i}"} for i in range(MAX_ACCOUNTS_PER_SCAN + 1)]
    assert client.post("/v1/scan", json={"accounts": too_many}
                       ).status_code == 413


def test_unknown_run_lists_what_is_available(client):
    body = client.get("/runs/does-not-exist")
    assert body.status_code == 404
    assert "holdout" in body.json["available"]


def test_scan_timing_covers_every_stage():
    """The Using Jaal page quotes these per stage, so a missing key would show
    up as a blank column rather than as an error."""
    import json
    import os

    if not os.path.exists("results/scan_timing.json"):
        pytest.skip("no results/scan_timing.json, run python -m detector.throughput")
    with open("results/scan_timing.json") as f:
        report = json.load(f)

    assert report["sizes"], "no batch sizes measured"
    for row in report["sizes"]:
        for stage in ("block_ms", "link_ms", "cluster_ms", "features_ms", "score_ms"):
            assert stage in row["timings_ms"], f"{stage} missing at {row['n_accounts']}"
        assert row["total_ms"] > 0
        assert row["accounts_per_second"] > 0
    assert report["growth"]["exponent"] > 0
