"""All tunable constants for Jaal. Single source of truth.

Money is always int rupees, never float.
"""

# The whole population, rings and lookalikes included. Ring prevalence below
# is measured against this number.
N_ACCOUNTS = 12_000
RING_PREVALENCE = 0.008      # 0.8%, realistic promo abuse rate
LOOKALIKE_GROUPS = 40        # families, flatmates, hostels, offices

COUPON_MIN_ORDER = 400       # rupees, minimum order value to qualify
COUPON_VALUE = 200

# One farmed coupon is a direct Rs.200 giveaway.
COST_MISSED_ABUSER = COUPON_VALUE
# Lost lifetime value (about Rs.750 margin) plus referral loss, rounded up.
COST_BLOCKED_INNOCENT = 15_000
# Ten minutes of an analyst's time at a fully loaded Rs.900/hour.
COST_ANALYST_REVIEW = 150

# Seeds 900-999 are sealed. They are used once, for the final holdout run.
# Never tune against them.
TRAIN_SEEDS = range(0, 700)
VALIDATION_SEEDS = range(700, 900)
HOLDOUT_SEEDS = range(900, 1000)

# accounts_per_drop is how many ring accounts share one delivery address.
# Careful operators rotate addresses, so exact address matching finds nothing.
TIERS = {
    "obvious":       dict(device_reuse=1.00, signup_window_days=0.04,
                          value_jitter=80,   camouflage=0.00,
                          accounts_per_drop=20),
    "moderate":      dict(device_reuse=0.60, signup_window_days=3,
                          value_jitter=200,  camouflage=0.00,
                          accounts_per_drop=8),
    "sophisticated": dict(device_reuse=0.10, signup_window_days=21,
                          value_jitter=600,  camouflage=0.00,
                          accounts_per_drop=3),
    "adaptive":      dict(device_reuse=0.00, signup_window_days=45,
                          value_jitter=1200, camouflage=0.15,
                          accounts_per_drop=1),
}
TIER_NAMES = list(TIERS)

# Benign groups that share what a ring shares, for innocent reasons.
LOOKALIKE_KINDS = {
    # a real family: shares device AND card AND address, but over years
    "family":    dict(size=(2, 5),   shares=("device", "address", "card"),
                      span_days=(200, 900), repeat_rate=0.7),
    # flatmates: same address, different everything else
    "flatmates": dict(size=(2, 4),   shares=("address",),
                      span_days=(30, 400),  repeat_rate=0.5),
    # hostel: same address and same network, many people, high churn
    "hostel":    dict(size=(20, 60), shares=("address", "ip"),
                      span_days=(60, 700),  repeat_rate=0.3),
    # office lunch orders: identical to a ring except for repeat behaviour
    "office":    dict(size=(8, 25),  shares=("address",),
                      span_days=(1, 14),    repeat_rate=0.6),
}

MAX_CANDIDATE_PAIRS = 2_000_000
MAX_BLOCK_SIZE = 400              # skip any blocking key with more members

OLIST_PRIORS_PATH = "data/olist_priors.json"
RESULTS_DIR = "results"
CACHE_DIR = "cache/explanations"
