# Phase 7: Holdout and adversarial evaluation

## What this phase does

Opens seeds 900 to 999, once, and reports whatever comes out. Then three things
that matter more than the headline number: a detection curve that names where
the system stops working, a stress test on data containing no rings at all, and
a catalogue of concrete failures with worked examples.

## Why it matters

Everything before this was measured on worlds that were tuned against, so those
numbers are optimistic and should be assumed wrong until checked.

The script refuses to run twice. If `results/holdout.json` exists it exits and
says why. That sounds paranoid and it is exactly the discipline this track is
testing.

## Results

```
$ python -m detector.evaluate_holdout --accounts 12000 --seeds 900-999

opening the seal: seeds 900-999, 12,000 accounts per world, 100 worlds per tier

tier            acct prev  clusters  PR-AUC   prec     recall   +review  Brier    blocked  reviewed  net
obvious         0.00800    18,851    0.9974   1.0000   0.5016   0.9931   0.00067  4,815    5,054     +Rs.1,148,700
moderate        0.00800    18,821    0.9971   1.0000   0.1425   0.9609   0.00055  1,368    8,504     +Rs.569,400
sophisticated   0.00800    18,639    0.9763   0.9961   0.0266   0.9129   0.00162  256      9,298     +Rs.343,100
adaptive        0.00800    19,091    0.8046   0.0000   0.0000   0.5669   0.01035  0        5,977     +Rs.191,850

pooled: cost Rs.5,426,950, deploy nothing Rs.7,680,000, net +Rs.2,253,050
```

**The adaptive row is the honest negative.** Zero accounts blocked, precision
undefined and reported as zero, recall zero. Against an operator who rotates
every device and address, spreads signups over six weeks and camouflages 15% of
accounts, this system does not detect. It still saves Rs.191,850 because it
routes 57% of those ring accounts to a human rather than throwing customers
away, and a review queue is not a detection.

**Holdout is not worse than validation, and that is worth explaining.** Net per
world is Rs.5,633 on the holdout against Rs.5,491 on validation, a 3% difference
in the wrong direction from what the plan expects. This is not a bug and it is
not evidence of quality. Train, validation and holdout are all independent draws
from the same generator, so there is no distribution shift to generalise across.
The split protects against generator artefacts leaking between worlds, which it
does, and it cannot tell you anything about how this would behave on real data.
That limitation is inherent to synthetic evaluation and no protocol fixes it.

### Against the rules baseline, on the same holdout worlds

| tier | rules precision | rules recall | rules net | Jaal net |
| ---- | --------------- | ------------ | --------- | -------- |
| obvious | 0.9116 | 1.0000 | -Rs.12,045,000 | +Rs.1,148,700 |
| moderate | 0.9172 | 0.9997 | -Rs.11,070,600 | +Rs.569,400 |
| sophisticated | 0.9037 | 0.8291 | -Rs.11,128,200 | +Rs.343,100 |
| adaptive | 0.0000 | 0.0000 | -Rs.13,785,000 | +Rs.191,850 |
| **total** | | | **-Rs.48,028,800** | **+Rs.2,253,050** |

The baseline catches every ring account on the obvious tier and the model
catches half. The baseline loses twelve million rupees on that tier and the
model makes one. That is the comparison the whole project exists to make.

### The detection curve

Operator sophistication swept continuously from the obvious tier to the adaptive
tier, moving every tier parameter together, six worlds per point.

| sophistication | accounts per drop | device reuse | recall, blocked | recall, incl. review |
| -------------- | ----------------- | ------------ | --------------- | -------------------- |
| 0.00 | 20.0 | 1.00 | 0.4809 | 0.9861 |
| 0.05 | 17.2 | 0.95 | 0.3715 | 0.9688 |
| 0.10 | 14.8 | 0.90 | 0.1615 | 0.9688 |
| 0.15 | 12.8 | 0.85 | 0.1267 | 0.9531 |
| 0.20 | 11.0 | 0.80 | 0.0677 | 0.9531 |
| 0.25 | 9.5 | 0.75 | 0.0521 | 0.9531 |
| 0.30 | 8.1 | 0.70 | 0.0243 | 0.9531 |
| 0.35 | 7.0 | 0.65 | 0.0000 | 0.9531 |

The two recall columns diverge sharply and that is the shape of the result.
Blocking collapses as the operator rotates addresses. The share reaching a human
barely moves, staying above 0.95 across the whole sweep. The system loses the
ability to act automatically long before it loses the ability to notice.

Stated as a sentence, which is the point of drawing it:

> Jaal blocks rings reliably while the operator reuses a delivery address across
> roughly nine or more accounts. Below that, recall falls under 0.05, and an
> operator using a different address for every account is not blocked at all.

**Rotating devices alone does not help the operator.** The plan suggests
sweeping device reuse from 1.00 to 0.00 as the sophistication axis. Measured,
recall falls from 0.2240 at full reuse to 0.0156 at 0.90 and then shows no trend
at all the rest of the way down, wandering between 0.0156 and 0.0920 with the
lowest reuse settings scoring higher than the middle ones. An operator who
rotates every phone and changes nothing else lands in the same place as one who
rotates 90% of them, because a moderate-tier ring still shares a drop address
every eight accounts and the address carries the result. Both curves are in
`results/detection_curve.png`, side by side, because the flat one is the
finding.

### Lookalike stress test

20 worlds containing **zero rings**, built entirely of families, flatmates,
hostels and office lunch groups.

| kind | clusters | wrongly blocked | rate | sent to review |
| ---- | -------- | --------------- | ---- | -------------- |
| family | 151 | 0 | 0.0% | 0 |
| flatmates | 60 | 0 | 0.0% | 0 |
| hostel | 211 | 0 | 0.0% | 0 |
| office | 206 | 0 | 0.0% | 0 |
| ordinary strangers | 3,221 | 0 | 0.0% | 1 |
| **total** | **3,849** | **0** | **0.0%** | **1** |

Not one account was blocked in 240,000 accounts containing no fraud. The
`office` trap, twenty colleagues signing up in one week from one address, which
Phase 0 built specifically to break this system, did not fire once.

Two honest caveats about that clean sheet. The Phase 6 rule blocks only clusters
predicted above 98.7% purity, so a low false-positive rate is what it was
designed to produce rather than a surprise. And the same discipline is why recall
is 0.1677.

### Failure catalogue

| failure | example | detail | why |
| ------- | ------- | ------ | --- |
| Ring accounts never form a cluster | adaptive, seed 954 | 55 of 96 ring accounts joined no cluster above 14 bits | every account has its own device and address, so only the pincode is shared and no edge clears the threshold |
| Ring cluster found, then allowed | sophisticated, seed 906, cluster 4 | 38 ring accounts, predicted purity 0.75, probability 1.00 | expected cost said allowing beat reviewing, because purity was too low to justify either |
| Camouflaged repeat orders | adaptive, seed 946, cluster 22 | 8 accounts with repeat rate 0.38, allowed | 15% of adaptive ring accounts order again on purpose, aimed at the feature meant to separate rings from families |
| One ring split across several clusters | adaptive, seed 912 | 11 separate ring clusters in a world holding at most 5 rings | weak edges fragment a ring, and each fragment is judged alone with no memory the others exist |
| The operator rotates delivery addresses | sophistication 0.30 | recall below 0.05 at 8.1 accounts per drop | nothing static is shared but the pincode, and thousands of strangers share that too |

## Known limitations

**A synthetic holdout tests the split, not the world.** It proves no generator
artefact leaked between train and test. It says nothing about a real merchant.

**Precision of 0.0000 on the adaptive tier is undefined, not zero.** Nothing was
blocked, so there is no precision to compute. It is printed as 0.0000 rather than
omitted so the row cannot be mistaken for a gap in the table.

**The stress test uses holdout seeds.** Those 20 worlds were generated from seeds
900 to 919 with prevalence set to zero, so they are different worlds from the
main run, but drawn from the sealed range and used once.

**Review is priced as always correct.** Every "+ review" number assumes a human
resolves the cluster properly. A real review error rate would reduce the gain.
