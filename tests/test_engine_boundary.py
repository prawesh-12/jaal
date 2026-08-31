"""The detection engine has to be usable without the visualisation.

A merchant installs `detector/` and `api/`. If either ever reaches into `ui/`,
the download stops being self-contained and this fails.
"""

import pathlib

import pytest

ENGINE = ("config.py", "detector", "api")
ROOT = pathlib.Path(__file__).resolve().parent.parent


def engine_sources():
    for name in ENGINE:
        path = ROOT / name
        if path.is_file():
            yield path
        else:
            yield from sorted(path.glob("*.py"))


@pytest.mark.parametrize("path", list(engine_sources()),
                         ids=lambda p: p.name)
def test_engine_never_reads_the_lab(path):
    text = path.read_text()
    assert "ui/" not in text and "from ui" not in text and "import ui" not in text


def test_requirements_hold_no_frontend_packages():
    text = (ROOT / "requirements.txt").read_text().lower()
    for name in ("three", "react", "vite", "tailwind"):
        assert name not in text


def test_the_lab_computes_nothing():
    """Every number the site shows comes out of a file, never out of the browser."""
    hook = (ROOT / "ui/src/lib/useJson.js").read_text()
    assert "fetch(" in hook
    world = (ROOT / "ui/src/lib/world.js").read_text()
    for banned in ("predict", "log2(", "purity =", "threshold ="):
        assert banned not in world
