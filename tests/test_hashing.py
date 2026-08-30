"""The engine never needs a raw identifier.

Device, address, pincode, card BIN and IP prefix are only ever tested for
equality. So a caller can salt and hash them before sending anything and get
the same answer back. That is the difference between an integration that needs
a data protection review and one that does not, so it is asserted rather than
claimed.
"""

import numpy as np
import pandas as pd
import pytest

from detector import cluster, features, link, profiles
from detector.blocking import candidate_pairs
from detector.generate_accounts import generate, load_priors

SALT = "tenant-7c1f"
ACCOUNTS = 1500
SEED = 704


@pytest.fixture(scope="module")
def world():
    return generate(SEED, "moderate", ACCOUNTS, load_priors())


@pytest.fixture(scope="module")
def hashed(world):
    return profiles.hash_identifiers(world.accounts, SALT)


def test_hashing_actually_replaced_the_values(world, hashed):
    for col in profiles.HASHABLE_COLUMNS:
        assert not hashed[col].equals(world.accounts[col]), f"{col} unchanged"
        assert hashed[col].str.len().eq(64).all(), f"{col} is not a sha256 digest"


def test_hashing_preserves_which_accounts_agree(world, hashed):
    """A digest collision would merge two accounts that share nothing."""
    for col in profiles.HASHABLE_COLUMNS:
        assert hashed[col].nunique() == world.accounts[col].nunique(), \
            f"{col} lost distinct values, a digest collided"


def test_blocking_produces_the_same_candidate_pairs(world, hashed):
    raw, _ = candidate_pairs(world.accounts)
    hsh, _ = candidate_pairs(hashed)
    assert np.array_equal(raw, hsh)


def test_pair_scores_are_identical(world, hashed, params):
    pairs, _ = candidate_pairs(world.accounts)
    raw_bits, raw_contrib = link.score_pairs(world.accounts, pairs, params)
    hsh_bits, hsh_contrib = link.score_pairs(hashed, pairs, params)
    assert np.array_equal(raw_bits, hsh_bits)
    assert np.array_equal(raw_contrib, hsh_contrib)


def test_the_same_clusters_come_out(world, hashed, params):
    raw, _, _ = cluster.cluster_world(world, params)
    swapped = world.__class__(**{**world.__dict__, "accounts": hashed})
    hsh, _, _ = cluster.cluster_world(swapped, params)
    assert [sorted(c) for c in raw] == [sorted(c) for c in hsh]


def test_every_feature_comes_out_the_same(world, hashed, params):
    raw = pd.DataFrame(features.world_rows(world, params))
    swapped = world.__class__(**{**world.__dict__, "accounts": hashed})
    hsh = pd.DataFrame(features.world_rows(swapped, params))
    assert list(raw.columns) == list(hsh.columns)
    pd.testing.assert_frame_equal(raw, hsh)


def test_a_different_salt_gives_a_different_digest(world):
    a = profiles.hash_identifiers(world.accounts, "tenant-a")
    b = profiles.hash_identifiers(world.accounts, "tenant-b")
    assert not a["device_id"].equals(b["device_id"]), \
        "two tenants produced the same digest for the same device"
