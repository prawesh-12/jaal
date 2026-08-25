"""What a decision costs the merchant, in rupees.

Written before the detector on purpose. Once the numbers are in front of you it
becomes obvious that the F1-optimal detector is not the one you want: blocking
one innocent customer costs 75 times what letting one abuser through costs.

Every value here is an integer. Money is never a float in this project.
"""

from config import (COST_ANALYST_REVIEW, COST_BLOCKED_INNOCENT,
                    COST_MISSED_ABUSER)


def decision_cost(n_missed_abusers: int, n_blocked_innocents: int,
                  n_reviewed: int = 0) -> int:
    """Total rupees lost by a set of decisions.

    Correct decisions cost nothing. Blocking a real abuser saves the coupon and
    letting a real customer through is what the business is for.
    """
    return (n_missed_abusers * COST_MISSED_ABUSER
            + n_blocked_innocents * COST_BLOCKED_INNOCENT
            + n_reviewed * COST_ANALYST_REVIEW)


def do_nothing_cost(n_abuser_accounts: int) -> int:
    """The floor. Deploy nothing, block nobody, lose every coupon.

    Any detector that costs more than this is worse than not existing, which
    is a far easier thing to check than it is to notice by accident.
    """
    return n_abuser_accounts * COST_MISSED_ABUSER


def block_everyone_cost(n_abusers: int, n_innocents: int) -> int:
    """The ceiling of stupidity. Useful as the second reference line.

    Abusers contribute nothing because none of them get through. The whole bill
    is the innocent customers you threw away.
    """
    del n_abusers
    return n_innocents * COST_BLOCKED_INNOCENT


def net_vs_nothing(cost: int, n_abuser_accounts: int) -> int:
    """Rupees saved against deploying nothing. Negative means it lost money."""
    return do_nothing_cost(n_abuser_accounts) - cost


def breakeven_precision() -> float:
    """The precision below which blocking loses money, ignoring recall.

    Block k accounts at precision p. You save p*k coupons and destroy (1-p)*k
    customers, so blocking pays only while

        p * COST_MISSED_ABUSER > (1 - p) * COST_BLOCKED_INNOCENT

    which is 98.7% here. That number is the whole reason this project has a
    review queue rather than two actions.
    """
    return COST_BLOCKED_INNOCENT / (COST_BLOCKED_INNOCENT + COST_MISSED_ABUSER)


def summarise(n_abusers: int, n_innocents: int, n_missed: int,
              n_blocked_innocents: int, n_reviewed: int = 0) -> dict:
    """One decision set, priced against both reference lines."""
    cost = decision_cost(n_missed, n_blocked_innocents, n_reviewed)
    return {
        "cost_rupees": cost,
        "do_nothing_rupees": do_nothing_cost(n_abusers),
        "block_everyone_rupees": block_everyone_cost(n_abusers, n_innocents),
        "net_vs_nothing_rupees": net_vs_nothing(cost, n_abusers),
    }
