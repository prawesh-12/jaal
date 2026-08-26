"""The budget helper is what stops a run freezing the developer's laptop.

The logic is tested against a stubbed reading, not against whatever the machine
happens to have free right now. A test that fails when the desktop is busy tells
you nothing about the code.
"""

import pytest

from detector import resources


def test_available_mb_reads_something_plausible():
    assert resources.available_mb() > 0


def test_budget_reserves_the_desktop(monkeypatch):
    monkeypatch.setattr(resources, "available_mb", lambda: 9000)
    b = resources.budget()
    assert b["available_mb"] == 9000
    assert b["mem_mb"] == 9000 - resources.DESKTOP_RESERVE_MB


def test_budget_never_hands_out_more_than_four_workers(monkeypatch):
    monkeypatch.setattr(resources, "available_mb", lambda: 32000)
    assert resources.budget()["workers"] <= resources.MAX_WORKERS


def test_budget_hands_out_at_least_one_worker(monkeypatch):
    monkeypatch.setattr(resources, "available_mb", lambda: 9000)
    assert resources.budget()["workers"] >= 1


def test_budget_refuses_rather_than_running_a_job_that_would_swap(monkeypatch):
    """Below the floor it raises. It does not quietly run a smaller job."""
    monkeypatch.setattr(resources, "available_mb",
                        lambda: resources.DESKTOP_RESERVE_MB + 100)
    with pytest.raises(RuntimeError, match="below the"):
        resources.budget()


def test_the_refusal_says_what_to_do(monkeypatch):
    monkeypatch.setattr(resources, "available_mb", lambda: 3200)
    with pytest.raises(RuntimeError) as exc:
        resources.budget()
    assert "Close something" in str(exc.value)
