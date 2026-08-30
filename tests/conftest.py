"""Shared test helpers.

Some tests read tables that `run.sh` rebuilds rather than files that are
committed, because the full feature tables are 45,000 rows each. On a clean
checkout those tests skip with a message saying what to run, instead of erroring
out and making the suite look broken.
"""

import json
import os

import pytest


def require(path: str) -> str:
    if not os.path.exists(path):
        pytest.skip(f"{path} not built yet. Run ./run.sh, or ./run.sh quick.")
    return path


@pytest.fixture(scope="session")
def train_table_path():
    return require("results/features_train.csv")


@pytest.fixture(scope="session")
def val_table_path():
    return require("results/features_val.csv")


@pytest.fixture(scope="module")
def params():
    with open("results/link_params.json") as f:
        return json.load(f)
