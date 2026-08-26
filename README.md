# Jaal

A merchant offers two hundred rupees off your first order. One person opens
fifty accounts and takes it fifty times. Jaal finds those fifty accounts.

What makes it hard is that there is no bad transaction anywhere in it. All fifty
orders are placed once, paid for, and delivered. Look at any single payment and
you see a normal first-time customer. A model that scores payments one at a time
cannot see this, however large it is, because the thing that is wrong is not
inside any payment. It is that fifty of them belong to one person. So Jaal
scores the relationships between accounts and decides about the group.

We tested it on 4.8 million synthetic accounts across four hundred sealed
worlds, opened once, holding 38,400 accounts that really were in a ring. The
generator is a test fixture and this is defence only. Real promo abuse is
unlabelled, so there is no other way to check a detector against a known answer.

On those accounts a rules detector loses 48 million rupees. Jaal saves 2.25
million. The rules catch more rings and block about nine hundred real customers
doing it, and one wrongly blocked customer costs what seventy five farmed
coupons cost. That ratio is the whole problem, and it is why Jaal blocks rarely
and sends the uncertain cases to a person.

Here is the part worth keeping. Against the most careful operator we modelled, a
fresh device and a fresh address for every account, Jaal blocks nothing at all.
It still sends 57 percent of those accounts to a human, which is worth something
and is not detection. We know where this stops working, and it is in the results
table, not the footnotes.

---

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

## Where this sits next to Vulcan

Razorpay shipped Vulcan on 18 August 2026: a transformer trained on roughly four
billion payments, using about three thousand signals per transaction, covering
routing, fraud detection, risk assessment and checkout personalisation.

Jaal is not an alternative to that. It answers a question a payment model cannot
be asked.

A per-transaction scorer takes one payment and returns a judgement about it. That
works whenever the payment carries the evidence. A stolen card, an odd amount, a
device that has failed twenty times tonight, a shipping country the customer has
never used: all of it sits inside the transaction, and three thousand signals
will read it better than anything here does.

Promo abuse of this kind has a different shape. Fifty accounts each place one
order. Every one of those orders is a real first purchase as far as any single
record can tell: the card works, the address is deliverable, the amount is
ordinary, the coupon is used exactly as intended. There is no anomalous payment
to find, because none of the payments are anomalous. What is wrong is that fifty
of them share an operator, and that fact exists only in the comparison between
records. It is not in any one of them, at any resolution.

So the two run at different levels. Vulcan scores payments as they happen. Jaal
scores the relationships between accounts, in a batch, after the fact, and hands
a person a short list. A merchant would want both, and neither replaces the
other. Nothing measured in this repository says anything about Vulcan's
performance, and no claim is made against it.

## We let the operator fight back

Sophistication had been a dial we set, which invites the fair objection that we
wrote the fraud so of course we catch it. So we built an operator that adapts.

It starts at ordinary settings, runs 100 worlds a round with settings scattered
around where it stands, correlates each of its own five behaviours against
getting caught, and changes the strongest one. It never sees our code, our
weights or our thresholds.

**How much it can see of the review queue is a setting**, because a real operator
gets partial signal from a review: delayed orders, manual verification, held
payouts, accounts that go quiet without ever being blocked. At q = 0 a review
looks exactly like being allowed. At q = 1 it is as visible as a block.

Blocking goes to zero within two or three rounds whatever the operator can see.
The queue does not. Three replicates each:

| what the operator can see | round 0 | round 5 | fall | replicates |
| --- | --- | --- | --- | --- |
| blocks only (q = 0.00) | 0.9631 | **0.9222** | 0.0409 | 0.9283, 0.9295, 0.9089 |
| everything (q = 1.00) | 0.9631 | **0.8867** | 0.0764 | 0.8918, 0.8907, 0.8775 |

*(share of ring accounts blocked or reviewed; the two do not overlap across
replicates)*

**Seeing the queue roughly doubles how fast it erodes, and does not collapse
it.** What visibility really changes is which knob the operator finds. Counting
every move across three replicates, the blocks-only operator went for signup
timing 5 times and address rotation once. The full-visibility operator went for
address rotation 6 times, and twice drove it to one account per delivery address,
its evasive limit. Address rotation is what our own detection curve says defeats
this system, and only the operator that can see reviews reliably finds it.

It finds it, pushes it to the limit, and the queue still holds.

### Why it holds, and why that is a weaker result than it sounds

Last round we wrote that the queue is robust because it is invisible. **That was
wrong and this measurement is what showed it.** Blindness was not what protected
it.

Eight fixed configurations, no adaptation, 100 worlds each:

| what the operator changes | blocked or reviewed | change |
| --- | --- | --- |
| nothing | 0.9631 | |
| rotates every delivery address | 0.9383 | -0.0248 |
| rotates every device | 0.9568 | -0.0064 |
| both of those | 0.9145 | -0.0486 |
| spreads signups over six weeks | 0.9277 | -0.0354 |
| jitters order values | 0.9717 | +0.0085 |
| camouflages some accounts | 0.9405 | -0.0226 |
| **all five at once** | **0.5701** | **-0.3930** |

The five changes made separately sum to -0.0807. Made together they cost
**-0.3930**, nearly five times the sum of the parts. No single change and no pair
gets the operator anywhere. All five at once gets it most of the way, and that
last row is the same place as the `adaptive` tier in the results table above.

So the destination exists, it is reachable with knobs the operator already has,
and our operator does not reach it. It changes one thing at a time and keeps it,
and the payoff for any one change looks like noise next to the payoff for all
five.

**That is a search failure by the attacker, not a property of our defence.** A
slightly better attacker, one that moved two things at once or ran a coarse grid
instead of a greedy climb, would find it. We report this as the weak guarantee it
is rather than the strong one we would have preferred.

Round by round, the sweep at every visibility level, and the method:
`docs/phases/phase-11-adversarial.md`. Charts:
`results/adaptive_visibility_replicates.png` and `results/adaptive_loop.png`.

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
.venv/bin/python -m pytest    # 239 tests
```

`run.sh` will not re-open the holdout if `results/holdout.json` exists. A
holdout opened twice is not a holdout.

Optional, and not needed for any number above:

```bash
.venv/bin/python -m api.app          # Flask service, 127.0.0.1:5001
cd ui && npm install && npm run dev  # React dashboard, 127.0.0.1:5173
```

To see what Jaal would give a caller who cannot send every column, without
sending any account data:

```bash
curl -s localhost:5001/v1/coverage -X POST -H 'content-type: application/json' \
  -d '{"columns": ["account_id","device_id","card_bin","ip_prefix","n_orders",
                   "first_order_value","total_order_value","days_to_second_order"]}'
```

`docs/INTEGRATION.md` is the contract behind that: the twelve columns, which
five can arrive as a salted hash, what each is worth in bits, and what a
narrower column set is measured to reach.

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
| `docs/INTEGRATION.md` | What to send, what it is worth, and what fewer columns cost |
| `docs/PITCH.md` | The opening above, on its own, for reading aloud |
| `docs/VIDEO_SCRIPT.md` | Five minute script with timestamps |
| `docs/phases/phase-11-adversarial.md` | The operator that adapts, round by round |
| `docs/built_till_now.md` | Everything built so far, in depth, with every measured number |
| `docs/00-overview.md` | What this is, for someone who knows nothing |
| `docs/01-architecture.md` | How the pieces fit, and the three boundaries |
| `docs/02-data-model.md` | Record shapes, and why operator is not group |
| `docs/03-glossary.md` | Every term in one line |
| `docs/phases/` | One document per phase, with real numbers |
| `docs/diagrams/` | Context, containers, pipeline, and one per stage |
| `docs/DECISIONS.md` | 41 decisions, including the ones that were wrong |
| `extras/plan.md` | The implementation plan this was built from |

Ten places where measurement contradicted the plan are recorded in
`docs/DECISIONS.md` rather than quietly fixed. The most consequential is D-022:
pricing a block on the class probability rather than on predicted cluster purity
turned a Rs.1.3 million gain into a Rs.16.4 million loss.
