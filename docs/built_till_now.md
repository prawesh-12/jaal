# What has been built

A full account of the Jaal codebase as it stands. Every number here was read out
of a file in `results/` that a run produced. Nothing is quoted from memory.

---

## 1. At a glance

| | |
| --- | --- |
| What it does | Finds groups of accounts run by one person farming a first-order promo discount |
| Unit of detection | The cluster, never the transaction |
| Detector code | 4,648 lines across `config.py` and `detector/` |
| Tests | 140, across 15 files, 1,378 lines |
| Documentation | 4,416 lines across 36 files |
| Dashboard | 461 lines, React and Vite |
| Dependencies | 10 Python packages |
| Commits | 19 |
| Reproducibility | The sealed holdout re-ran and returned 437 of 437 values identical |
| Runs offline | Yes, verified in a fresh clone with the network namespace disabled |

The headline result, from the sealed holdout: **+Rs.2,253,050 saved** against
Rs.7,680,000 for deploying nothing, at 0.9998 precision. The rules-only baseline
on the same worlds loses **Rs.48,028,800**.

---

## 2. The problem, and why it needs a different shape of solution

A merchant offers Rs.200 off a first order. One person creates fifty accounts
and claims it fifty times.

Each of those accounts places one perfectly ordinary order. The payment
succeeds. The goods are delivered. Nothing is stolen, no card is fraudulent. Any
single transaction, looked at alone, is a normal first-time customer, because in
isolation that is exactly what it is.

So there is no bad transaction to find. The fraud lives in the fact that fifty of
them share an operator. That forces three things:

1. **The unit of detection is a group.** A per-transaction scorer cannot see this
   at any model size, because the signal does not exist at the record level.
2. **The evaluation needs a known answer.** Real promo abuse is unlabelled, so
   the project generates its own worlds with a hidden answer key.
3. **The cost of a mistake is lopsided.** Blocking a real customer costs their
   lifetime value. Missing an abuser costs one coupon. That ratio drives every
   decision the system makes.

---

## 3. The synthetic world

`detector/generate_accounts.py`, 505 lines.

There is no public dataset that carries operator identity, so there is nothing to
measure a detector against. The generator produces populations where the answer
is known, and it is a test fixture, not a product.

### What a world contains

12,000 accounts. Exactly 0.80% of them belong to a ring. The rest are:

- **Singletons.** One person, one account. About 94% of the population.
- **Lookalike groups.** 40 per world, drawn evenly from four kinds. Real people
  who share something a ring shares, for an innocent reason.

| lookalike kind | shares | span | repeat rate |
| --- | --- | --- | --- |
| family | device, address, card | 200 to 900 days | 0.7 |
| flatmates | address | 30 to 400 days | 0.5 |
| hostel | address, network | 60 to 700 days | 0.3 |
| office | address | 1 to 14 days | 0.6 |

The `office` group is the one that matters. Twenty colleagues signing up in one
week from one address is structurally identical to a ring on every static
attribute. Only repeat behaviour separates them.

### Operator sophistication is a dial

| tier | device reuse | signup window | value jitter | camouflage | accounts per drop address |
| --- | --- | --- | --- | --- | --- |
| obvious | 100% | 1 hour | Rs.80 | none | 20 |
| moderate | 60% | 3 days | Rs.200 | none | 8 |
| sophisticated | 10% | 21 days | Rs.600 | none | 3 |
| adaptive | 0% | 45 days | Rs.1,200 | 15% | 1 |

Camouflage means a slice of the ring behaves like real customers: they order
again and half of them skip the coupon. It is aimed directly at the strongest
behavioural feature.

The last column is not in the original design and was added after measurement.
Without it, every ring shared three to five drop addresses whatever its tier, so
exact address matching found all of them and there was nothing for probabilistic
linking to earn. Measured over 10 worlds, address reuse inside rings now falls
907, 843, 655, 0 across the four tiers, and device reuse falls 919, 528, 65, 0.
At the top tier a ring shares nothing but a pincode.

### The distributions are real

`detector/calibrate_from_olist.py`. Order values, customer repeat rate and
signup hour-of-day come from the Olist Brazilian E-Commerce dataset: **99,441
orders** over **96,096 unique customers**.

- Order value is the sum of item prices within an order, not one line item.
- Prices are scaled by **5.1784**, chosen so the median order lands at Rs.450.
  That puts the Rs.400 coupon floor just under the median, which is where a
  merchant sets it. An FX conversion was rejected because it compares two
  consumer markets that are not comparable.
- Percentiles run to the 95th and 99th, not just deciles. Olist's top decile
  spans Rs.1,398 to Rs.69,597, so sampling uniformly inside it would give one
  order in ten a value near Rs.35,000.
- Population repeat rate: **0.031188**. Busiest hour: 16:00, carrying 6.7% of
  orders.

Only the derived JSON is committed. The raw CSVs are not vendored and are not
needed to run anything.

### Honesty properties that took real work

**Ordinary coupon users also cluster just above the floor.** 55% of first-time
customers claim the coupon, and those whose basket falls short top it up to clear
Rs.400. Without this, sitting on the coupon floor would be something only ring
accounts do and the whole problem would be trivial.

**Opaque ids carry no signal.** Rings are built first, so in the first version
every ring account held one of the lowest account ids and device ids in the
world. That is a fingerprint correlating perfectly with the answer, and a model
would have learned it instead of the actual structure. Ids are now assigned after
the rows are shuffled, and a test fails if that regresses.

**Determinism.** Seed 5 generated twice is byte identical. 100 worlds of 12,000
accounts generate in **5.32 seconds**, one at a time, never all in memory.

---

## 4. The rules baseline

`detector/baseline.py` and `detector/costs.py`.

Built before any model, so there is something to compare against. Exact matching
on device and address, merged with union-find, five hand-written rules, two
actions.

The interesting part is what it found. The first version also linked on IP
prefix. An IP prefix is a /24 network, and on one world a single prefix covered
694 accounts. Union-find chained those buckets together through shared devices
into one component of **5,754 accounts** that contained every ring in the world,
scored 0.30, and was never flagged. Recall was 0.000 on all four tiers including
the easiest one.

That is not a tuning detail. It is the argument for everything that follows:
exact matching plus transitive closure has no way to express a weak edge. It
merges completely or not at all, and one coarse field poisons every group it
touches.

**The cost model, written before the detector.** Blocking a real customer costs
Rs.15,000. Missing an abuser costs Rs.200, one coupon. Blocking a group therefore
pays only while you are right about it

```
p x 200 > (1 - p) x 15,000
```

which needs precision above **98.7%**. Every precision figure in this project
should be read against that line, not against 100%.

---

## 5. The pipeline

Seven stages. The unit changes twice: it starts as an account, becomes a pair,
becomes a cluster at stage three, and stays a cluster to the end.

### 5.1 Blocking

`detector/blocking.py`, 234 lines.

12,000 accounts is 72 million possible pairs. Six rules cut that to about 32,000
worth scoring, and any block over 400 members is skipped and counted.

| rule | keys |
| --- | --- |
| device | `device_id` |
| address | `address_id` |
| pin_bin | `pincode` + `card_bin` |
| pin_month | `pincode` + signup month |
| pin_month_shift | `pincode` + signup month, offset by half a month |
| bin_week | `card_bin` + signup week |

Nothing blocks on pincode or card BIN alone: the busiest pincode holds 2,639
accounts and the busiest BIN 2,964, which is over five million pairs from a
single bucket.

Measured over 10 worlds per tier:

| tier | recall | worst single world | pair reduction | candidate pairs |
| --- | --- | --- | --- | --- |
| obvious | 1.0000 | 1.0000 | 0.99234 | 551,801 |
| moderate | 1.0000 | 1.0000 | 0.99247 | 542,431 |
| sophisticated | 0.9949 | 0.9810 | 0.99245 | 543,506 |
| adaptive | 0.9528 | 0.8778 | 0.99234 | 551,733 |

What each rule finds on its own at the hardest tier:

| rule | recall alone |
| --- | --- |
| pin_bin | 0.8188 |
| pin_month | 0.5144 |
| pin_month_shift | 0.5108 |
| bin_week | 0.1178 |
| device | 0.0000 |
| address | 0.0000 |

Device and address find exactly nothing at the top tier. That is the whole
problem restated in one table.

A seventh rule, pincode with a Rs.100 value band, was measured and dropped: it
cost 291,868 pairs and found 0.0795 of hard-tier pairs on its own.

The worst single world reaching 0.8778 is reported because it is a ceiling. A
pair blocking never generates cannot be recovered by any later stage, however
good the model is.

### 5.2 Pair scoring

`detector/link.py` and `detector/link_train.py`.

Each comparison contributes `log2(m / u)` bits, where `m` is how often a field
agrees for one operator and `u` is how often it agrees by chance.

**Comparison levels are ordered and mutually exclusive.** A pair 30 minutes apart
satisfies "within an hour", "within a day" and "within a week" at once. Summing
all three counts the same evidence three times. Exactly one level of each
comparison fires.

The trained weight table:

| comparison | level | m | u | bits |
| --- | --- | --- | --- | --- |
| device | exact | 0.3139 | 0.000011 | **+14.83** |
| | no | 0.6861 | 0.999989 | -0.54 |
| address | exact | 0.5507 | 0.000142 | **+11.93** |
| | no | 0.4493 | 0.999858 | -1.15 |
| pincode | exact | 0.9937 | 0.072428 | +3.78 |
| | no | 0.0063 | 0.927572 | -7.20 |
| card_bin | exact | 0.7362 | 0.086722 | +3.09 |
| | no | 0.2638 | 0.913278 | -1.79 |
| ip_prefix | exact | 0.0083 | 0.007678 | **+0.12** |
| | no | 0.9917 | 0.992322 | -0.00 |
| signup_gap | within 1h | 0.7393 | 0.000127 | **+12.51** |
| | within 24h | 0.1348 | 0.002117 | +5.99 |
| | within 7d | 0.1181 | 0.013343 | +3.15 |
| | within 30d | 0.0015 | 0.050304 | -5.06 |
| | no | 0.0063 | 0.934109 | -7.22 |
| hour_of_day | within 1h | 0.7752 | 0.163751 | +2.24 |
| order_count | both one order | 0.9994 | 0.900276 | +0.15 |
| coupon_used | both used | 0.9959 | 0.306317 | +1.70 |

`ip_prefix` at +0.12 bits is the honest row. It agrees between true pairs almost
exactly as often as between strangers, so it carries no information, and the
model says so rather than being told.

**Term frequency.** Sharing a device that two accounts have is not the same
evidence as sharing one that three hundred accounts have. The adjustment strength
is a dial. At full strength it over-credits rare values of a low-cardinality
field, because a pincode held by twelve unrelated people is rare and is still
twelve unrelated people. Measured over ten worlds, strengths of 0.25, 0.5, 0.75
and 1.0 gave mean pair F1 of 0.6001, 0.6047, 0.6049 and 0.5957. It ships at 0.75.

**Learning m and u without labels.** `u` is easy: sample random pairs, and at
0.8% prevalence essentially all of them are strangers. `m` is the hard one, and
the standard recipe turned out to be backwards for this problem.

The usual approach seeds from pairs sharing a *rare* value, on the reasoning that
two records holding a value nobody else has are one entity. Measured here, pairs
sharing a device held by two or three accounts are **0.7% true matches**. The
reasoning assumes duplicates come in twos, which is right for deduplicating a
customer table. An operator runs eight to forty-five accounts, so their device is
not rare, it is popular, while a device held by exactly two accounts is a couple
sharing a phone.

Inverted to "a device carrying six or more accounts", six being one more than the
largest household in the config, purity is **99.3%** over **37,124 seed pairs**.

Address cannot be used the same way at any window: a hostel puts 20 to 60
unrelated students at one address, giving 3.3% purity. That rules out the obvious
cross-seeding trick, so `m` for the device comparison comes from a second pass
over pairs whose remaining evidence already puts the posterior above 0.99. Purity
there is 43.5%, and that is reported rather than hidden.

**Expectation Maximisation was built, measured, and lost.** It ran over 10,975,910
candidate pairs from 20 worlds. Left free, its match rate climbed to the ceiling
in nine iterations and every weight collapsed. Held fixed at the value the config
implies, and with Dirichlet smoothing on the M step, it produced a sensible table
and still lost on every tier: best pair F1 of 0.793 against 0.991 on the easiest
tier, 0.372 against 0.706 on the next. The bootstrap ships. EM stays in the file
under `m_em`, because a measured negative result is worth more than a deleted one.

**Two comparisons are computed and then not scored.** `coupon_floor` and
`order_value` both encode "the ring ordered near-identical amounts just above the
floor". That is true of a careless operator and false of a careful one, and
because `m` comes from careless operators their no-agreement levels carry -6.6 and
-7.0 bits. A ring that varies its order values is punished for it, which is
backwards. Measured on three independent blocks of ten worlds, removing them
lifts hard-tier pair recall from 0.60, 0.47 and 0.55 to 0.84, 0.74 and 0.86.
Capping negative weights instead was tried at seven settings and recovered about
half of it.

Pair quality at the operating threshold of 6 bits:

| tier | pair precision | pair recall | edges per world |
| --- | --- | --- | --- |
| obvious | 0.0468 | 1.0000 | 32,254 |
| moderate | 0.0404 | 0.9911 | 31,866 |
| sophisticated | 0.0336 | 0.7904 | 32,967 |
| adaptive | 0.0193 | 0.4905 | 31,719 |

Read the recall column against the baseline, which found 0.8373 of ring accounts
at the third tier and **nothing at all** at the fourth. Read the precision column
and do not be reassured: 96% of edges are wrong. This builds a graph, it does not
make a verdict.

Blocking and scoring one 12,000 account world takes **0.49 seconds**, and the
per-comparison breakdown is kept for every pair, a 543,285 by 9 matrix.

### 5.3 Clustering

`detector/cluster.py`, 316 lines.

Leiden over the weighted graph, because Louvain can return internally
disconnected communities, and a "ring" that is two unrelated clumps glued
together is not a finding. The seed is pinned, since community detection is
randomised and an unseeded run makes every downstream number unreproducible.

**This stage corrected the stage before it.** Pair scoring chose a 6 bit edge
threshold on an edge budget and flagged cluster quality as the real test. It
failed that test: at 6 bits Leiden returned clusters of up to **1,812 accounts**
and a pairwise F1 of **0.0014**. A graph where 96% of edges are wrong has no
structure left to find.

The threshold was swept against the recall ceiling the classifier inherits,
defined as the share of ring accounts sitting in a majority-ring cluster:

| threshold | obvious | moderate | sophisticated | adaptive | clusters per world |
| --- | --- | --- | --- | --- | --- |
| 10 bits | 0.9740 | 0.8802 | 0.7474 | 0.5729 | 430 |
| 12 bits | 1.0000 | 0.9193 | 0.9766 | 0.8047 | 419 |
| **14 bits** | **1.0000** | **1.0000** | **1.0000** | **0.7786** | **188** |
| 16 bits | 1.0000 | 1.0000 | 0.9948 | 0.6198 | 91 |
| 20 bits | 1.0000 | 1.0000 | 0.9583 | 0.2682 | 40 |
| 28 bits | 1.0000 | 1.0000 | 0.7995 | 0.0234 | 38 |

At 14 bits, over 10 worlds per tier:

| tier | clusters | pair F1 | largest cluster | Leiden disconnected | Louvain disconnected |
| --- | --- | --- | --- | --- | --- |
| obvious | 1,854 | 0.2255 | 62 | 0 | 0 |
| moderate | 1,915 | 0.2028 | 64 | 0 | 0 |
| sophisticated | 1,904 | 0.1822 | 69 | 0 | 0 |
| adaptive | 1,851 | 0.0844 | 64 | 0 | 0 |

**Resolution does not matter.** Swept 0.5 to 2.0 in steps of 0.1, pairwise F1
moves by less than 0.002 on every tier. A test fails if that stops being true.

**Louvain did not fail at the operating point, and that is reported as a
non-result.** It produced 8 internally disconnected communities across 20 worlds
on the dense 6 bit graph, against zero from Leiden. On the 14 bit graph that
ships it produces none and matches Leiden's pairwise F1 to four decimal places.
The honest sentence is "Louvain fails on a graph we rejected for other reasons",
not "Louvain produced broken rings".

### 5.4 Features

`detector/features.py`, 343 lines. 25 numbers per cluster.

The insight underneath: **real families share more than rings do.** A family
shares one actual card, one real address, one device, and orders for years. A
ring shares a device by accident and fakes the rest. So the separator is not how
much a group shares, it is whether their behaviour persists.

| group | structural | temporal | behavioural | economic |
| --- | --- | --- | --- | --- |
| 8 features | size, edge density, mean and min edge bits, weight spread, diameter, degree gini, top signal share | signup span, burstiness, hour concentration, median gap, lifespan | coupon rate, repeat rate, near-floor rate, value spread, BIN and device and address concentration | discount extracted, per account, over revenue |

Two are worth calling out. `hour_concentration` is one minus the normalised
entropy of signup hour-of-day: a script gives near zero and real people spread
across the day. The economic block exists because a cluster extracting Rs.400 is
noise and one extracting Rs.40,000 is the target, so the model's scores lean
toward what the decision actually cares about.

**Leakage audit.** The audit reads the source of every feature function and fails
if it mentions the answer key. It also checks correlations. No feature exceeds
0.95 against the label. The strongest is `total_discount` at 0.3923, then
`mean_edge_bits` at 0.3800 and `weight_spread` at 0.3766.

Four pairs exceed 0.90 correlation with each other. One of them,
`coupon_rate` against `discount_per_account`, is exactly 1.0000 because the
second is the first times Rs.200, and it is dropped.

**Two prevalences.** Accounts are 0.80% ring. Clusters are **2.356%**, because
clustering concentrates them. Both are reported everywhere.

240 worlds produce 45,324 clusters in 5 minutes 8 seconds.

### 5.5 Model and calibration

`detector/model.py`, 320 lines.

A random forest of 300 trees on 24 features, fitted on 45,324 clusters from seeds
0 to 44, calibrated on seeds 45 to 59, validated on 45,159 clusters from seeds 700
to 759. **The split is on the world seed, never on the row**, because clusters
from one world share generator artefacts and a random row split leaks them.

Random forests are badly calibrated by construction: the ensemble averages many
trees, so for it to output 0 every tree must output 0, and probabilities get
squeezed toward the middle. Raw, clusters it scored 0.55 were rings 21% of the
time. After Platt scaling that bin reads 36%.

| variant | PR-AUC | prevalence baseline | lift | Brier | ROC-AUC |
| --- | --- | --- | --- | --- | --- |
| forest, raw | 0.9418 | 0.0232 | 40.6x | 0.00527 | 0.9910 |
| forest, Platt | 0.9418 | 0.0232 | 40.6x | 0.00323 | 0.9910 |
| forest, isotonic | 0.9298 | 0.0232 | 40.1x | 0.00313 | 0.9904 |
| small MLP, raw | 0.9449 | 0.0232 | 40.8x | 0.00291 | 0.9929 |

**The small neural network beat the forest**, by 0.003 PR-AUC. That is inside the
noise of one validation split and neither is meaningfully better, but it is
reported the way it came out rather than the other way round. The forest ships
because it calibrates cleanly and its importances are readable.

Per tier, validation:

| tier | clusters | positives | PR-AUC | lift | Brier |
| --- | --- | --- | --- | --- | --- |
| obvious | 11,258 | 214 | 1.0000 | 52.6x | 0.00048 |
| moderate | 11,206 | 237 | 0.9998 | 47.3x | 0.00069 |
| sophisticated | 11,278 | 243 | 0.9562 | 44.4x | 0.00185 |
| adaptive | 11,417 | 353 | 0.8335 | 27.0x | 0.00942 |

The PR-AUC of 1.0000 was checked for leakage rather than celebrated. It is real
separation: an easy-tier ring cluster has a median 28 accounts at 57.5 bits per
edge with a value spread of 0.055, against 3 accounts at 16.7 bits and 0.395 for
a benign one. At the hardest tier there are 6,152 benign clusters scoring above
the weakest ring cluster, which is what 0.8335 looks like.

**A second model predicts cluster purity.** This is the single most consequential
correction in the project. The classifier answers "is this cluster majority
ring", which is not the question the cost model asks. Blocking a cluster blocks
everyone in it, so the bill is the innocent accounts caught in the net, and a
cluster that is 90% ring still costs 10% of its members at Rs.15,000 each. Priced
on the class probability, the rule blocked 20,081 accounts at 93.3% precision and
**lost Rs.16,355,550**. Priced on predicted purity it blocks 3,875 at 99.97% and
**makes Rs.1,317,750**.

The purity model's mean absolute error is 0.00756 overall and **0.15623 on ring
clusters**, which is a real weakness where it is load bearing.

Top features by permutation importance:

| feature | drop in average precision |
| --- | --- |
| distinct_bin_ratio | 0.02611 |
| total_discount | 0.02485 |
| value_cv | 0.01797 |
| near_min_rate | 0.01688 |
| discount_to_revenue | 0.01607 |

`repeat_rate`, expected to be the strongest single feature, ranks fifteenth at
0.00092. The Olist population repeat rate is 3.1%, so ordinary accounts rarely
reorder either, and the feature separates rings from families and offices but not
from ordinary strangers.

### 5.6 Decisions

`detector/decide.py`, 305 lines.

Three actions, priced in rupees, with no threshold anyone tunes:

```
block   (1 - purity) x n x 15,000
allow          purity x n x    200
review                  n x    150
```

Blocking beats allowing only above **98.7%** purity. Review beats blocking below
99%. So the rule blocks near-certain clusters, reviews the band between, and
allows the rest, and nobody chose those boundaries.

Measured on validation seeds, 240 worlds, 2,880,000 accounts:

| policy | precision | recall | accounts blocked | reviewed | net against doing nothing |
| --- | --- | --- | --- | --- | --- |
| block above F1-optimal threshold | 0.9162 | 0.9119 | 22,934 | 0 | **-Rs.24,642,800** |
| block above 0.50 | 0.9084 | 0.9169 | 23,256 | 0 | -Rs.27,740,000 |
| best two-action threshold | 0.0000 | 0.0000 | 0 | 0 | Rs.0, it blocks nobody |
| **three actions, expected cost** | **0.9997** | 0.1681 | 3,875 | 17,059 | **+Rs.1,317,750** |

**Of 101 blocking thresholds swept from 0.00 to 1.00, not one turns a profit.**
With block and allow alone, the correct deployment of this detector is not to
deploy it. The review queue changes the sign. It handles 1.395% of clusters.

Sensitivity, because Rs.15,000 is an assumption:

| cost ratio | a wrong block costs | best two-action threshold | net, three actions |
| --- | --- | --- | --- |
| 10:1 | Rs.2,000 | 0.99 | +Rs.2,015,900 |
| 25:1 | Rs.5,000 | 1.00 | +Rs.1,478,600 |
| 75:1 | Rs.15,000 | 1.00 | +Rs.1,317,750 |
| 200:1 | Rs.40,000 | 1.00 | +Rs.1,271,700 |

The conclusion survives disagreement about the number. From 25:1 upward no
two-action threshold turns a profit and the three-action rule always does.

### 5.7 Explanations

`detector/explain.py`, 262 lines.

Turns a flagged cluster into something a reviewer acts on in ten seconds. Three
sources in order: a committed cache, a live model call, and a template that never
fails.

**The model does no detection.** It reads structured output and writes a
sentence. Pull the network and every score, action and rupee figure is unchanged.

Primary model is `minimax-m3:cloud`, falling back to `gpt-oss:120b`. One call
takes about 15 seconds, so of the 1,334 clusters the holdout did not simply
allow, the 40 highest-value ones were written by the model and the other 1,294
are templates. All 1,334 are committed. Every entry records which model wrote it.

**Every number in every note is checked.** `audit_note` compares each numeric
token against the feature dict and the evidence bullets and reports anything that
does not trace back. Across all 1,334 notes: **zero**.

That check has already earned its place twice. It flagged 7 notes quoting bit
values from a different cluster, because the cache key covered the facts but not
the evidence bullets, so two clusters with identical rounded facts shared an
entry. And it flagged `Rs.10,800.` at the end of a sentence, which turned out to
be the regex swallowing the full stop rather than an invented figure. Both are
fixed and both have a test.

---

## 6. Results on the sealed holdout

Seeds 900 to 999 were sealed before any code existed and the protocol was
published before any result. 100 worlds per tier, 12,000 accounts each, 0.80%
account prevalence. Opened once.

| tier | PR-AUC | precision | recall, blocked | recall, blocked or reviewed | Brier | blocked | reviewed | net |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| obvious | 0.9974 | 1.0000 | 0.5016 | 0.9931 | 0.00067 | 4,815 | 5,054 | +Rs.1,148,700 |
| moderate | 0.9971 | 1.0000 | 0.1425 | 0.9609 | 0.00055 | 1,368 | 8,504 | +Rs.569,400 |
| sophisticated | 0.9763 | 0.9961 | 0.0266 | 0.9129 | 0.00162 | 256 | 9,298 | +Rs.343,100 |
| **adaptive** | 0.8046 | **0.0000** | **0.0000** | 0.5669 | 0.01035 | **0** | 5,977 | +Rs.191,850 |

Pooled: precision 0.9998, recall 0.1677, recall including review 0.8585, and
**+Rs.2,253,050** against Rs.7,680,000 for doing nothing.

**The adaptive row blocks nothing at all.** Against an operator who rotates every
device and address, spreads signups over six weeks and camouflages 15% of
accounts, this system does not detect. It still saves money because it routes 57%
of those ring accounts to a person, and a review queue is not a detection.

### Against the rules baseline, same worlds

| tier | rules precision | rules recall | rules net | Jaal net |
| --- | --- | --- | --- | --- |
| obvious | 0.9116 | 1.0000 | -Rs.12,045,000 | +Rs.1,148,700 |
| moderate | 0.9172 | 0.9997 | -Rs.11,070,600 | +Rs.569,400 |
| sophisticated | 0.9037 | 0.8291 | -Rs.11,128,200 | +Rs.343,100 |
| adaptive | 0.0000 | 0.0000 | -Rs.13,785,000 | +Rs.191,850 |
| **total** | | | **-Rs.48,028,800** | **+Rs.2,253,050** |

The baseline catches every ring account at the easiest tier and loses twelve
million rupees doing it. Jaal catches half as many and turns a profit.

### Where it stops working

Sophistication swept continuously, six worlds per point:

| sophistication | accounts per drop address | device reuse | recall, blocked | recall, incl. review |
| --- | --- | --- | --- | --- |
| 0.00 | 20.0 | 1.00 | 0.4809 | 0.9861 |
| 0.05 | 17.2 | 0.95 | 0.3715 | 0.9688 |
| 0.10 | 14.8 | 0.90 | 0.1615 | 0.9688 |
| 0.15 | 12.8 | 0.85 | 0.1267 | 0.9531 |
| 0.20 | 11.0 | 0.80 | 0.0677 | 0.9531 |
| 0.25 | 9.5 | 0.75 | 0.0521 | 0.9531 |
| 0.30 | 8.1 | 0.70 | 0.0243 | 0.9531 |
| 0.35 | 7.0 | 0.65 | 0.0000 | 0.9531 |

The two columns diverge, and that divergence is the shape of the result. Blocking
collapses as the operator rotates addresses. The share reaching a human barely
moves. **The system loses the ability to act automatically long before it loses
the ability to notice.**

**Rotating devices alone does not help the operator.** Sweeping device reuse from
1.00 to 0.00 with everything else fixed, recall drops once at the very top and
then shows no trend, wandering between 0.0156 and 0.0920 with the lowest settings
scoring higher than the middle ones. Rotating delivery addresses is what defeats
this system.

### False positives on data with no rings

20 worlds, 240,000 accounts, zero rings, built entirely of families, flatmates,
hostels and office groups.

| group kind | clusters | wrongly blocked | sent to review |
| --- | --- | --- | --- |
| family | 151 | 0 | 0 |
| flatmates | 60 | 0 | 0 |
| hostel | 211 | 0 | 0 |
| office | 206 | 0 | 0 |
| ordinary strangers | 3,221 | 0 | 1 |
| **total** | **3,849** | **0** | **1** |

Not one account blocked. The office trap, built specifically to break this
system, never fired. Two caveats: the rule blocks only above 98.7% predicted
purity, so a low false-positive rate is what it was designed to produce, and the
same discipline is why blocked recall is 0.1677.

### Failure catalogue

| failure | example | detail |
| --- | --- | --- |
| Ring accounts never form a cluster | adaptive, seed 954 | 55 of 96 ring accounts joined no cluster above 14 bits |
| Ring cluster found, then allowed | sophisticated, seed 906 | 38 ring accounts, predicted purity 0.75, probability 1.00 |
| Camouflaged repeat orders | adaptive, seed 946 | 8 accounts with repeat rate 0.38, allowed |
| One ring split across several clusters | adaptive, seed 912 | 11 separate ring clusters in a world holding at most 5 rings |
| Operator rotates delivery addresses | sophistication 0.30 | recall below 0.05 at 8.1 accounts per drop address |

---

## 7. The service

`detector/pipeline.py` and `api/app.py`.

The first version of the API asked callers for 24 computed features. A merchant
has 12 raw account fields and no way to build the rest, so it was not usable.
`POST /v1/scan` now takes raw accounts and runs every stage.

| endpoint | what it does |
| --- | --- |
| `GET /health` | is the service up, is the model loaded |
| `GET /v1/schema` | the fields to send, and the cost constants in force |
| `POST /v1/scan` | raw accounts in, one priced decision per cluster out |
| `POST /v1/score` | one cluster whose features you already computed |
| `GET /runs/<id>` | a saved batch result |

Measured over real HTTP, 12,000 accounts in one request:

| stage | time |
| --- | --- |
| blocking | 292 ms |
| pair scoring | 194 ms |
| clustering | 478 ms |
| features | 171 ms |
| model and decision | 125 ms |
| **round trip including JSON** | **1.35 s** |

Checked against the answer key the service never sees, on one holdout world:

- 96 ring accounts in the batch
- **83 of them, 86%, reached a human**
- 6 innocent accounts swept up
- predicted purity 91% / 95% / 98% against actual 89% / 96% / 100%

Under 400 MB, no GPU, no database, no queue. The response leads with
`expected_cost_rupees`, because on the largest flagged cluster the model was
certain it was a ring at probability 1.00 and the action was still `review`:
blocking 39 accounts that are 95% ring still throws away about two real
customers at a cost of Rs.26,421, against Rs.5,850 for a person to look.

A React dashboard reads the same result files and draws five tabs. It computes
nothing.

---

## 8. Testing and reproducibility

140 tests, 1,378 lines.

| area | tests |
| --- | --- |
| generator | 18 |
| pipeline and service | 16 |
| pair scoring | 11 |
| explanations | 11 |
| decisions | 11 |
| model | 10 |
| features | 10 |
| costs | 9 |
| clustering | 9 |
| baseline | 8 |
| blocking | 7 |
| README consistency | 6 |
| Olist priors | 6 |
| config | 5 |
| resources | 3 |

The tests are not decoration. Several assert findings rather than mechanics:
every two-action threshold loses money, Leiden never returns a disconnected
community, no feature function can read the answer key, results are stable across
Leiden resolution, and the README table matches `results/holdout.json` exactly.

**Reproducibility, measured rather than claimed.** The whole pipeline was re-run
from scratch after the code was rewritten. Comparing every value in every result
file against the committed ones:

- **437 of 437 holdout values identical.**
- 14,911 of 14,982 values identical overall.
- The 71 that differed were wall-clock timing (5.1s against 5.32s) and one script
  using 60 validation worlds where the published file used 100. That second one
  was a real bug in the runner and is fixed.

**Offline from a clean checkout.** Cloned fresh, installed, and run inside a
disabled network namespace: 135 tests pass, 5 skip with a message saying what to
build, and `./run.sh quick` completes in 67 seconds.

---

## 9. Resource discipline

This runs on a laptop someone else is using at the same time.

Every entry point calls `resources.apply()` before doing anything heavy. That
reads `MemAvailable`, reserves 3 GB for the desktop, refuses to run if less than
1.5 GB is left after that, and sets a hard address-space cap so a runaway job
dies instead of swapping. Worker counts derive from free threads and current
load, capped at four. `n_jobs=-1` appears nowhere.

Three specific blow-ups are guarded rather than hoped about:

- **Pair explosion.** A hard cap of 2,000,000 candidate pairs, and blocking
  raises if it produces more.
- **Degenerate blocks.** Any bucket over 400 members is skipped and counted.
- **Holding many worlds.** Feature tables are built one world at a time and each
  is deleted before the next. 640 worlds never coexist.

---

## 10. Where measurement contradicted the design

Ten places, all written down in `docs/DECISIONS.md` rather than quietly fixed.
The four that changed results:

1. **The linkage seed rule was backwards.** Seeding from rare shared values gives
   0.7% purity. Seeding from popular ones gives 99.3%.
2. **Pricing a block on the class probability was wrong.** A purity model turned
   a Rs.16.4 million loss into a Rs.1.3 million gain.
3. **The edge threshold had to move from 6 bits to 14.** At 6 bits the clustering
   returned one blob of 1,812 accounts.
4. **Two comparisons had to be dropped.** They punished a ring for varying its
   order values, and removing them lifted hard-tier pair recall from 0.14 to 0.50.

Three more were negative results kept rather than deleted: EM lost to the
bootstrap, Louvain did not fail at the operating point, and the small neural
network slightly beat the forest.

---

## 11. What is not built

**Not real time.** A batch job over an account population. The signal does not
exist at the moment of a single payment.

**Not a general fraud detector.** One loss class. Not chargebacks, not returns
abuse, not stolen cards.

**Not identity attribution.** It says these accounts appear to share an operator.
It never claims to identify a person.

**Not trained on real data.** Everything is synthetic. The linkage weights in
particular describe how often fields agree in one generator.

**A synthetic holdout tests the split, not the world.** Train, validation and
holdout are independent draws from the same generator, so there is no
distribution shift to generalise across. It proves no generator artefact leaked
between train and test, and says nothing about a real merchant.

**Review is priced as always correct.** Every "blocked or reviewed" figure
assumes a person resolves the cluster properly. A real review error rate would
reduce the gain, not reverse it.

**No fuzzy string matching.** Every comparison is exact agreement or a numeric
band. A real deployment would compare address strings, because "Flat 3, 12 MG
Road" and "12 M.G. Road, Flat 3" are the same door.

**Clusters are judged alone.** Two clusters in one pincode that are really one
ring are scored independently, so a fragmented ring is never reassembled.

---

## 12. Running it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh              # full reproduction, about 35 minutes, no network needed
./run.sh quick        # smaller worlds, about 70 seconds
.venv/bin/python -m pytest          # 140 tests
.venv/bin/python -m detector.report # every measured number, in one place
```

`run.sh` will not re-open the holdout if `results/holdout.json` exists.

Optional, and needed for no number above:

```bash
.venv/bin/python -m api.app          # 127.0.0.1:5001
cd ui && npm install && npm run dev  # 127.0.0.1:5173
```

Two environment variables, both optional, documented in `.env.example`.
`OLLAMA_API_KEY` turns on live review notes. `OMP_NUM_THREADS` caps the BLAS
thread pool and defaults to 4.

### Where to read next

| file | what is in it |
| --- | --- |
| `README.md` | Results above the fold |
| `docs/METRICS.md` | Every measured number, generated from `results/` |
| `docs/04-running-it.md` | How this runs as a backend, with the API contract |
| `docs/00-overview.md` | The project for someone who knows nothing |
| `docs/01-architecture.md` | How the pieces fit and the three boundaries |
| `docs/02-data-model.md` | Record shapes, and why operator is not group |
| `docs/03-glossary.md` | Every term in one line |
| `docs/DECISIONS.md` | 27 decisions, including the wrong turns |
| `docs/diagrams/` | Context, containers, pipeline, and one per stage |
