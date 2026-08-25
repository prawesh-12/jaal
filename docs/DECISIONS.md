# Decisions

Running log. Append, never rewrite.

## D-001: Virtualenv at `.venv`, not system Python
Date: 2026-08-26
Phase: 0

The system Python had numpy and networkx but nothing else, and installing into
it needs sudo on Ubuntu 24.04 (PEP 668 marks it externally managed). A local
`.venv` keeps the project reproducible and keeps the developer's system Python
untouched. `run.sh` will use `.venv/bin/python` if it exists and fall back to
whatever `python3` is on PATH, so a judge who pip-installs globally still works.

## D-002: matplotlib will be needed, flagged not added
**Resolved 2026-08-26: approved, see D-012.**
Date: 2026-08-26
Phase: 0

The plan asks for `results/*.png`: PR curves (5.2), reliability diagram (5.4)
and the cost curve (6.3). It also caps dependencies at nine and lists no
plotting library. Those two cannot both hold. CLAUDE.md makes adding a tenth
dependency a stop-and-ask, so matplotlib is not installed yet. Nothing before
Phase 5 needs it, so Phase 0 to Phase 4 proceed unaffected. If the answer is no,
the fallback is to write the curve data to JSON and render the charts in the
React dashboard in Phase 9, which keeps the numbers reproducible offline but
loses the static PNGs.

## D-003: Olist CSVs pulled from a GitHub mirror, not Kaggle
Date: 2026-08-26
Phase: 0

Kaggle needs an account and an API token, and neither exists on this machine.
The three files needed (orders, order_items, customers) are mirrored verbatim in
several public GitHub repos. Row counts were checked against the published
figures before use: 99,441 orders, 112,650 order items, 99,441 customer rows
over 96,096 unique people. That matches the Kaggle dataset exactly, so it is the
same data. The raw files live in `data/raw/`, which is gitignored. Only the
derived `data/olist_priors.json` is committed, as the plan requires.

## D-004: Order value is the sum of items in an order, not one item's price
Date: 2026-08-26
Phase: 0

The plan's sketch in step 0.2 takes deciles of `order_items.price`, which is the
price of a single line item. An order can hold several. Since the generator
needs order values, and the coupon floor of Rs.400 is checked against an order
total, the total is the right quantity. Grouping by order_id first moves the
median from Rs.388 to Rs.450 on the scaled figures. Both are in the output JSON
so the difference is visible.

## D-005: Extra tail percentiles beyond the ten deciles
Date: 2026-08-26
Phase: 0

Olist's top decile runs from Rs.1,398 to Rs.69,597. A generator sampling
uniformly inside that band would hand one order in ten a value near Rs.35,000,
which is not a long tail, it is a broken one. The priors also carry the 95th and
99th percentiles (Rs.2,071 and Rs.5,173) so the generator can subdivide the top
band and keep the real shape.

## D-006: Prices scaled to a target median, not by an FX rate
Date: 2026-08-26
Phase: 0

Olist is in BRL. Converting at a market FX rate compares two consumer markets
that are not comparable, and would put the median order at roughly Rs.1,100
against a Rs.400 coupon floor, making the floor meaningless. Instead prices are
multiplied by 5.1784, chosen so the median order lands at Rs.450. That puts the
coupon floor just below the median, which is where a merchant sets it: most
customers have to add one more item to qualify. The factor is written into the
priors JSON so anyone can undo it.

## D-007: `N_ACCOUNTS` means the whole population, not the normal-only count
Date: 2026-08-26
Phase: 0

The plan's config sketch calls it `N_NORMAL_ACCOUNTS = 12_000`. Prevalence has
to be measured against the total population, so if 12,000 were the normal-only
count the real prevalence would depend on how many lookalike accounts happened
to be generated. Renamed to `N_ACCOUNTS` and treated as the total. Rings,
lookalike groups and singletons all come out of that budget, so prevalence lands
on exactly 0.0080 in every world at every tier rather than drifting.

## D-008: Opaque ids are relabelled after the shuffle
Date: 2026-08-26
Phase: 0

Rings are generated before lookalikes and singletons, so the first version
handed every ring account one of the lowest account ids and device ids in the
world. Shuffling the rows did not fix it, because the id was already baked into
the row. That is a generator fingerprint correlating perfectly with the label,
and a model would have found it and scored beautifully while learning nothing.
Ids are now assigned after shuffling, and device and address ids are remapped
through a random permutation.
`tests/test_generator.py::test_opaque_ids_do_not_leak_group_membership` fails if
it comes back. Worth recording because it is the exact failure the Phase 4
leakage audit is meant to catch, found one phase early.

## D-009: Drop addresses thin out as the operator gets careful
Date: 2026-08-26
Phase: 1

The plan's tier table varies device reuse, signup window, value jitter and
camouflage. It does not vary addresses, so the generator gave every ring
`size // 8` drop addresses whatever its tier. Measured on seed 700, an adaptive
ring of 38 accounts rotated all 38 devices and still shared 4 addresses, so
exact address matching recovered every ring at every tier. The baseline scored
recall 1.0000 on `obvious` and 0.8373 on `sophisticated`.

That contradicts the premise Phase 2 rests on, stated in plan section 2.6:
"exact matching recovers zero rings under device rotation". If exact matching
recovers everything, Fellegi-Sunter scoring has nothing left to earn.

Added `accounts_per_drop` to each tier: 20, 8, 3, 1. An operator careful enough
to buy a new phone per account is careful enough to use a different door. The
pincode still holds at every tier, because goods have to arrive somewhere
reachable, so at the adaptive tier the neighbourhood is the only static
attribute a ring shares.

Two things worth stating plainly. This makes the generator harder, not easier.
And it was changed before any model existed, so it is not a result being tuned
into shape. Address reuse inside rings now falls 907, 843, 655, 0 across the
tiers, measured over 10 worlds in `results/phase0_check.json`.

## D-010: The baseline does not link on IP prefix
Date: 2026-08-26
Phase: 1

The first version linked on `device_id`, `address_id` and `ip_prefix`. An IP
prefix is a /24 network. On seed 700 a single prefix covered 694 accounts, and
union-find chained those buckets together through shared devices into one
component of 5,754 accounts. That component held all 96 ring accounts in the
world, scored 0.30 on the rules, and was never flagged. Recall was 0.000 on all
four tiers, including `obvious`, where the whole ring shares one device.

Dropped `ip_prefix`. Card BIN and pincode are excluded for the same reason: an
issuer and an area identify a group of strangers, not a person.

Recorded rather than quietly fixed, because it is the concrete failure that
justifies Phase 2. Exact matching plus transitive closure cannot express a weak
edge. It merges completely or not at all, and one coarse field is enough to
merge half the population into a blob that says nothing.

## D-011: The world window is 900 days, not 365
Date: 2026-08-26
Phase: 1

Family lookalikes span 200 to 900 days by the plan's own table, but the world
was 365 days long, so `_group_start` clamped their start to day zero and their
signups ran off the end of the world. One group spanned 724 days inside a
365-day window. The window is now 900 days, which is the longest span any group
needs. A world is the merchant's operating history, so it has to be at least as
long as the oldest customer relationship in it.

## D-012: matplotlib added as a tenth dependency
Date: 2026-08-26
Phase: 1, ahead of Phase 5

Raised as a stop-and-ask under CLAUDE.md and approved by the developer. The plan
requires `results/*.png` for the PR curves (5.2), the reliability diagram (5.4)
and the cost curve (6.3), and none of the nine listed libraries can draw one.

The alternative was to write curve data to JSON and render it in the Phase 9
React dashboard. Rejected because the cost curve is the single most important
chart in the submission, and under that plan it would only exist if the UI
shipped. The UI is first on the cut list.

Pinned at 3.11.1 in requirements.txt. Charts are written offline by `run.sh`
with no network access, and the backend is set to Agg so nothing needs a display.
