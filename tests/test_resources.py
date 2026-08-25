"""The budget helper is what stops a run freezing the developer's laptop."""

from detector import resources


def test_available_mb_reads_something_plausible():
    assert resources.available_mb() > 0


def test_budget_never_hands_out_more_than_four_workers():
    b = resources.budget()
    assert 1 <= b["workers"] <= resources.MAX_WORKERS


def test_budget_reserves_the_desktop():
    b = resources.budget()
    assert b["mem_mb"] == b["available_mb"] - resources.DESKTOP_RESERVE_MB
    assert b["mem_mb"] >= resources.FLOOR_MB
