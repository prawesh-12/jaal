"""The routes an integrator hits before writing any code."""

import pytest

from api.app import app
from detector import profiles


@pytest.fixture()
def client():
    return app.test_client()


def test_the_bare_host_lists_the_routes(client):
    """A 404 on / is the first thing anyone sees and the worst first thing."""
    body = client.get("/").get_json()
    assert "POST /v1/coverage" in body["endpoints"]
    assert body["data"] == "synthetic, defence only"


def test_coverage_names_the_profile_and_what_it_loses(client):
    strict = profiles.get("aggregator_strict")
    body = client.post("/v1/coverage",
                       json={"columns": list(strict.columns)}).get_json()
    assert body["profile"] == "aggregator_strict"
    assert body["can_scan"] is False
    assert "address" in body["comparisons_lost"]
    assert "total_discount" in body["features_lost"]


def test_coverage_says_yes_when_every_column_is_there(client):
    body = client.post("/v1/coverage",
                       json={"columns": list(profiles.ALL_COLUMNS)}).get_json()
    assert body["can_scan"] is True
    assert body["comparisons_lost"] == []


def test_coverage_rejects_an_empty_request(client):
    r = client.post("/v1/coverage", json={})
    assert r.status_code == 400
    assert "all_columns" in r.get_json()


def test_the_profile_list_covers_every_profile(client):
    body = client.get("/v1/profiles").get_json()
    assert [p["name"] for p in body["profiles"]] == \
        [p.name for p in profiles.PROFILES]
    assert body["hashable_columns"] == list(profiles.HASHABLE_COLUMNS)


def test_a_short_scan_payload_says_which_profile_it_matched(client):
    strict = profiles.get("aggregator_strict")
    row = {c: "x" for c in strict.columns}
    r = client.post("/v1/scan", json={"accounts": [row]})
    assert r.status_code == 400
    assert r.get_json()["closest_profile"]["profile"] == "aggregator_strict"


def test_a_malformed_batch_is_a_400_not_a_500(client):
    """A list holding a dict and a list breaks the DataFrame constructor with a
    TypeError, which used to escape the handler and return a 500."""
    r = client.post("/v1/scan", json={"accounts": [{"account_id": "a"}, [1, 2]]})
    assert r.status_code == 400
    assert "not a list of records" in r.get_json()["error"]


def test_a_batch_of_scalars_is_a_400(client):
    r = client.post("/v1/scan", json={"accounts": [1, 2, 3]})
    assert r.status_code == 400


def test_coverage_rejects_a_column_list_that_is_not_strings(client):
    """A null in the list used to reach sorted() and return a 500."""
    r = client.post("/v1/coverage", json={"columns": ["account_id", 7, None]})
    assert r.status_code == 400
    assert "must be a string" in r.get_json()["error"]
