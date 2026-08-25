"""All tunable constants for Jaal. Single source of truth.

Money is always int rupees. Never float. See CLAUDE.md rule 6.
"""

# --- population ---
# Total accounts in one generated world, rings and lookalike groups included.
# The plan calls this N_NORMAL_ACCOUNTS, but prevalence has to be measured
# against the whole population, so this is the whole population. See D-007.
N_ACCOUNTS = 12_000
RING_PREVALENCE = 0.008      # 0.8%, realistic promo abuse rate
LOOKALIKE_GROUPS = 40        # families, flatmates, hostels, offices

# --- the promo being abused ---
COUPON_MIN_ORDER = 400       # rupees, minimum order value to qualify
COUPON_VALUE = 200           # rupees off

# --- what mistakes cost the merchant ---
# One farmed coupon is a direct Rs.200 giveaway.
COST_MISSED_ABUSER = COUPON_VALUE
# Blocking a real customer loses their lifetime value: roughly 30 orders over
# two years at Rs.500 with a 5% contribution margin (Rs.750), plus the referral
# and word-of-mouth loss a wrongly blocked customer causes. Rounded to Rs.15,000.
COST_BLOCKED_INNOCENT = 15_000
# Ten minutes of an analyst's time at a fully loaded Rs.900/hour.
COST_ANALYST_REVIEW = 150

# --- evaluation ---
# Seeds 900-999 are SEALED. Opened once, in Phase 7. Never tune against them.
TRAIN_SEEDS = range(0, 700)
VALIDATION_SEEDS = range(700, 900)
HOLDOUT_SEEDS = range(900, 1000)

# --- adversary sophistication tiers ---
# device_reuse:        probability an account reuses the ring's device
# signup_window_days:  how long the ring takes to create all its accounts
# value_jitter:        rupee spread of order values above the coupon floor
# camouflage:          fraction of ring accounts that behave like real customers
# accounts_per_drop:   how many accounts share one delivery address. An operator
#                      careful enough to rotate devices rotates drop points too.
#                      Not in the plan's table, added because without it exact
#                      address matching finds every ring at every tier and
#                      Phase 2 has nothing left to do. See D-009.
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

# --- benign groups that look structurally like rings ---
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
    # office lunch orders: same address, bursty signups. Looks exactly like a
    # ring on every static attribute. Only repeat behaviour separates them.
    "office":    dict(size=(8, 25),  shares=("address",),
                      span_days=(1, 14),    repeat_rate=0.6),
}

# --- memory guards, see CLAUDE.md "Memory discipline" ---
MAX_CANDIDATE_PAIRS = 2_000_000   # refuse to proceed beyond this
MAX_BLOCK_SIZE = 400              # skip any blocking key with more members

# --- paths ---
OLIST_PRIORS_PATH = "data/olist_priors.json"
RESULTS_DIR = "results"
CACHE_DIR = "cache/explanations"
