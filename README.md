# Jaal

**Finding the fraud between transactions, not inside them.**

*Jaal* (जाल) means both net and web in Hindi. This project is both: a graph of
hidden connections between accounts, and the net that catches what moves inside
it.

Razorpay Buildathon 2026, Track 02 (AI Risk Manager).

## Defence only, synthetic data only

Jaal detects **groups of accounts run by one person** farming a merchant's
first-order promo discount. It is strictly defensive. It generates no evasion
guidance, touches no payment rails real or test, and contains no real personal
data. Every account record in this repository is synthetic, produced by
`detector/generate_accounts.py`, which is a **test fixture**. It exists because
real promo abuse is unlabelled, so there is no other way to measure a detector
against a known answer. The fixture parameterises how careful an operator is
precisely so the project can report where detection fails, and naming a blind
spot is defensive disclosure rather than instruction.

## The problem in one paragraph

A merchant offers Rs.200 off your first order. One person creates fifty
accounts and claims it fifty times. Each of those accounts places one perfectly
ordinary order: the payment succeeds, the goods are delivered, nothing is stolen
and no card is fraudulent. Look at any single transaction and you see a normal
first-time customer, because in isolation that is exactly what it is. The fraud
is not inside any transaction. It is in the fact that fifty of them belong to
the same person. So the unit of detection here is never the transaction. It is
the cluster.

## Results, sealed holdout, seeds 900 to 999

100 worlds per tier, 12,000 accounts each, 0.80% of accounts in a ring. Opened
once. Never averaged across tiers, because the variation is the finding.

| tier | PR-AUC | precision | recall, blocked | recall, blocked or reviewed | Brier | accounts blocked | sent to review | net against deploying nothing |
| ---- | ------ | --------- | --------------- | --------------------------- | ----- | ---------------- | -------------- | ----------------------------- |
| obvious | 0.9974 | 1.0000 | 0.5016 | 0.9931 | 0.00067 | 4,815 | 5,054 | **+Rs.1,148,700** |
| moderate | 0.9971 | 1.0000 | 0.1425 | 0.9609 | 0.00055 | 1,368 | 8,504 | **+Rs.569,400** |
| sophisticated | 0.9763 | 0.9961 | 0.0266 | 0.9129 | 0.00162 | 256 | 9,298 | **+Rs.343,100** |
| **adaptive** | 0.8046 | **n/a (no blocks)** | **0.0000** | 0.5669 | 0.01035 | **0** | 5,977 | +Rs.191,850 |

Pooled: precision **0.9998**, recall 0.1677, recall including review 0.8585,
total loss Rs.5,426,950 against Rs.7,680,000 for deploying nothing, so
**+Rs.2,253,050 saved**.

Read the `adaptive` row before anything else. Against an operator who rotates
every device, uses a different delivery address for every account, spreads
signups over six weeks and has 15% of accounts behave like real customers, this
system **blocks nothing at all**. Its precision is reported as `n/a` rather than
0.0000, because 0 of 0 blocked is undefined. Printing it as a zero would read as
"everything it blocked was wrong", which is a different and untrue claim. It still saves money, because it routes 57% of
those ring accounts to a human instead of throwing customers away, but as an
automatic detector it does not work there and the table says so.

Read the recall column second. It is low on purpose, and the next section is why.

## Why recall is low and that is correct

Missing a promo abuser costs Rs.200, one coupon.
Wrongly blocking a real customer costs Rs.15,000, their lifetime value.

That is 75 to 1, and it means blocking a group only pays while you are right
about it **98.7%** of the time. On the same holdout worlds:

| policy | precision | recall | net against deploying nothing |
| ------ | --------- | ------ | ----------------------------- |
| block above the F1-optimal threshold | 0.9162 | 0.9119 | **-Rs.24,642,800** |
| block above 0.50 | 0.9084 | 0.9169 | -Rs.27,740,000 |
| best two-action threshold of 101 swept | 0.0000 | 0.0000 | Rs.0, it blocks nobody |
| **three actions, expected cost rule** | **0.9997** | 0.1681 | **+Rs.1,317,750** |

*(policy comparison measured on validation seeds 700 to 799)*

Of 101 blocking thresholds swept from 0.00 to 1.00, **not one turns a profit**.
With block and allow alone, the correct deployment of this detector is not to
deploy it. The third action changes the sign.

That result holds if you disagree with the Rs.15,000 figure. At every cost ratio
from 10:1 to 200:1 the three-action rule saves money, and from 25:1 upward no
two-action threshold does.

### And if the reviewer is not perfect

The saving above assumes a person resolves every reviewed cluster correctly.
26,527 ring accounts sit in that queue on the holdout, so at Rs.200 a coupon the
queue can cost at most Rs.5,305,400 if the reviewer resolves none of them.

| reviewer accuracy | obvious | moderate | sophisticated | adaptive | pooled |
| --- | --- | --- | --- | --- | --- |
| 1.00 | +Rs.1,148,700 | +Rs.569,400 | +Rs.343,100 | +Rs.191,850 | +Rs.2,253,050 |
| 0.90 | +Rs.1,054,320 | +Rs.412,260 | +Rs.172,920 | +Rs.83,010 | +Rs.1,722,510 |
| 0.80 | +Rs.959,940 | +Rs.255,120 | +Rs.2,740 | -Rs.25,830 | +Rs.1,191,970 |
| 0.70 | +Rs.865,560 | +Rs.97,980 | -Rs.167,440 | -Rs.134,670 | +Rs.661,430 |
| 0.60 | +Rs.771,180 | -Rs.59,160 | -Rs.337,620 | -Rs.243,510 | +Rs.130,890 |
| 0.50 | +Rs.676,800 | -Rs.216,300 | -Rs.507,800 | -Rs.352,350 | -Rs.399,650 |
| **break-even** | never | 0.6376 | 0.7984 | 0.8237 | **0.5753** |

**The reviewer has to be right about 57.5% of the time for the system to break
even.** Below that it loses money. The tiers do not share that burden evenly:
blocking alone carries the easy tier whatever the reviewer does, while the
hardest tier needs an 82% accurate reviewer, because every rupee it earns comes
from the queue.

### And if there are only so many analysts

The queue holds 2.69 clusters per batch of 12,000 accounts. Ranked best first by
expected value of review, **80% of everything the queue adds comes from the top
1.69 clusters per batch**, and 95% from the top 2.23. Blocking alone, with no
analyst at all, already nets Rs.1,440,000 of the Rs.2,253,050 total.

The curve is in `results/review_capacity.png`. It is not perfectly monotonic: 4
of 60 steps paid slightly less with more capacity, worst case Rs.9,950, because
a cluster pushed out of the queue falls back to blocking, and blocking a
genuinely pure cluster costs nothing while reviewing it costs Rs.150 an account.

## Baseline comparison

A rules-only detector, published before the model existed: exact matching on
device and address with union-find, five hand-written rules, two actions. Run on
**the same holdout worlds**.

| tier | rules precision | rules recall | rules net | Jaal net | difference |
| ---- | --------------- | ------------ | --------- | -------- | ---------- |
| obvious | 0.9116 | 1.0000 | -Rs.12,045,000 | +Rs.1,148,700 | Rs.13.2M |
| moderate | 0.9172 | 0.9997 | -Rs.11,070,600 | +Rs.569,400 | Rs.11.6M |
| sophisticated | 0.9037 | 0.8291 | -Rs.11,128,200 | +Rs.343,100 | Rs.11.5M |
| adaptive | 0.0000 | 0.0000 | -Rs.13,785,000 | +Rs.191,850 | Rs.14.0M |
| **total** | | | **-Rs.48,028,800** | **+Rs.2,253,050** | **Rs.50.3M** |

Look at the recall columns. The rules baseline catches **every** ring account on
the obvious tier and loses twelve million rupees doing it. Jaal catches half as
many and turns a profit. That comparison is the entire argument of this project,
and without a published baseline nobody, the author included, could have made it.

## What this does not detect

The detector was swept across operator sophistication continuously rather than
at four fixed points. `results/detection_curve.png`.

> Jaal blocks rings reliably while the operator reuses a delivery address across
> roughly nine or more accounts. Below that, recall falls under 0.05, and an
> operator using a different address for every account is not blocked at all.
> Rotating devices does not defeat it. Sweeping device reuse from 1.00 to 0.00
> with everything else fixed, recall drops once at the top and then shows no
> trend at all, wandering between 0.0156 and 0.0920 with the lowest reuse
> settings scoring higher than the middle ones. **Rotating delivery addresses
> is what defeats it.** Those rings are still routed to human review 57% of the
> time, which is worth something and is not detection.

On 20 worlds containing **zero rings**, built entirely of families, flatmates,
hostels and office lunch groups, the system blocked **0 accounts** and sent 1
cluster of 3,849 to review. The `office` trap, twenty colleagues signing up in
one week from one address, did not fire once.

Five more failure modes with worked examples are in `results/holdout.json` and
`docs/phases/phase-07-holdout.md`.

## How to run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh              # full reproduction, about 30 minutes, no network needed
./run.sh quick        # smaller worlds, about 4 minutes
.venv/bin/python -m pytest    # 140 tests
```

`run.sh` will not re-open the holdout if `results/holdout.json` exists. A
holdout opened twice is not a holdout.

Optional, and not needed for any number above:

```bash
.venv/bin/python -m api.app          # Flask, two endpoints, 127.0.0.1:5001
cd ui && npm install && npm run dev  # React dashboard, 127.0.0.1:5173
```

## Method

```
BLOCK       72 million pairs down to ~32,000 worth scoring, recall measured
LINK        Fellegi-Sunter, evidence in bits, weighted by how rare the shared value is
CLUSTER     Leiden community detection, connected communities by construction
FEATURE     25 numbers per cluster, audited for leakage
SCORE       calibrated probability, plus a second model for cluster purity
DECIDE      block, allow or review, whichever loses fewest rupees
EXPLAIN     a written reason, every number traceable to the pipeline
```

The linkage stage is where the work is. Exact matching finds **nothing** on the
adaptive tier, because every account has its own device and its own address.
Accumulating weak evidence recovers 49% of its true pairs.

Ten dependencies. Every omission is deliberate and argued in
`extras/plan.md` section 2.5.

## Evaluation protocol

Published in this file before any result existed, which is what makes it worth
anything.

```
Seeds 0-699    train
Seeds 700-899  validation and tuning
Seeds 900-999  SEALED. Opened once, at Phase 7. No tuning against them, ever.
```

1. **Metrics are per tier, never averaged.** Blending hides the sophistication
   threshold where detection fails.
2. **Prevalence is stated beside every metric.** PR-AUC has a floor equal to the
   class prior. Accounts are 0.80% ring; clusters are 2.3%, because clustering
   concentrates them. Both are reported.
3. **Train and test split on generator seed, never on row.**
4. **No reported number needs the internet.** The LLM layer is cached and
   optional.
5. **A rules-only baseline is published and every result is a delta against it.**

## Data

Order values, customer repeat rate and signup hour-of-day are calibrated against
the **Brazilian E-Commerce Public Dataset by Olist** (99,441 real orders, 2016 to
2018), licensed CC BY-NC-SA 4.0.
https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce

Only derived distribution parameters are committed, in
`data/olist_priors.json`. The raw dataset is not vendored and is not needed to
run anything.

Two honest caveats. Olist is Brazilian marketplace data, not Indian food
delivery, so prices are rescaled by 5.1784 to put the median order at Rs.450.
The shape transfers, the absolute values do not. And Olist's 3.1% repeat rate is
a marketplace baseline, which makes `repeat_rate` a much weaker feature here than
it would be at a merchant with real repeat business. It ranks fifteenth of
twenty-four by permutation importance, and that is documented rather than hidden.

## Documentation

| Path | What is in it |
| ---- | ------------- |
| `docs/built_till_now.md` | Everything built so far, in depth, with every measured number |
| `docs/00-overview.md` | What this is, for someone who knows nothing |
| `docs/01-architecture.md` | How the pieces fit, and the three boundaries |
| `docs/02-data-model.md` | Record shapes, and why operator is not group |
| `docs/03-glossary.md` | Every term in one line |
| `docs/phases/` | One document per phase, with real numbers |
| `docs/diagrams/` | Context, containers, pipeline, and one per stage |
| `docs/DECISIONS.md` | 22 decisions, including the ones that were wrong |
| `extras/plan.md` | The implementation plan this was built from |

Ten places where measurement contradicted the plan are recorded in
`docs/DECISIONS.md` rather than quietly fixed. The most consequential is D-022:
pricing a block on the class probability rather than on predicted cluster purity
turned a Rs.1.3 million gain into a Rs.16.4 million loss.
