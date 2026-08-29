# Glossary

For: anyone who hits a word in these docs and wants one line on it. Alphabetical.

**Account** One customer record. Twelve columns. The row Jaal reads. Never
scored on its own.

**Adaptive tier** The most careful operator modelled: a fresh device and a
fresh address for every account, signups spread over 45 days. Jaal blocks
nothing on this tier. See `docs/05-where-it-fails.md`.

**Answer key** The hidden truth the generator writes alongside each world:
which accounts really are in a ring. Nothing in `detector/` outside the
generator and the evaluators may read it, and `tests/test_features.py` enforces
that.

**Bits** The unit of pair evidence. One bit doubles the odds that two accounts
share an operator. A device match is worth 14.83 bits. An edge is drawn at 14.

**Blocking** Deciding which pairs are worth scoring at all. Six rules cut 72
million possible pairs to about 550,000. A true pair no rule produces can never
be recovered later, so blocking recall is the ceiling on everything downstream.

**Brier score** Mean squared error of a probability against the outcome. Lower
is better. Measures whether 0.80 really means 80%, which PR-AUC does not.

**Calibration** Making a score mean what it says. A raw forest's 0.80 does not
mean 80%. Platt (sigmoid) and isotonic are the two methods fitted here.

**Camouflage** A generator setting. The share of a ring's accounts given fake
normal behaviour, such as a second order, to look like real customers.

**Cluster** A group of accounts the pipeline believes share one operator. The
unit of detection in this project. Never the transaction.

**Cost asymmetry** Blocking a real customer costs Rs.15,000, missing an abuser
costs Rs.200. A false positive is worth 75 false negatives. This single ratio
drives every design choice here.

**Break-even precision** The precision below which blocking loses money. It is
0.9868 at these three prices. `detector/costs.py`.

**Edge** A scored link between two accounts, drawn when their pair score passes
14 bits.

**Fellegi-Sunter** The pair scoring method. Each field comparison contributes
`log2(m / u)` bits, and the bits are summed. `detector/link.py`.

**Holdout** Seeds 900 to 999. Sealed. Opened once, in the final evaluation.
Never tuned against.

**Leiden** The community detection algorithm that cuts the graph into clusters.
Louvain was compared against it and matched.

**Lookalike** A benign group that shares what a ring shares, for innocent
reasons. Four kinds: family, flatmates, hostel, office. These are what make the
problem hard.

**m** How often a field agrees when two accounts really are one operator.
Estimated without labels, by bootstrapping from a high-precision seed rule.

**Net against doing nothing** Rupees saved compared with deploying no detector
at all and losing every farmed coupon. The headline figure in every results
table.

**PR-AUC** Area under the precision-recall curve. Reported instead of ROC-AUC
because at 2% prevalence ROC-AUC can read 0.99 while precision is unusable.
Always read it against the prevalence baseline.

**Prevalence** The share that are positive. Account-level prevalence is 0.8%.
Cluster-level prevalence is about 2.3%. They are different numbers and both
appear in these docs.

**Purity** The fraction of a cluster's accounts that really are ring accounts.
Predicted by a second model. The cost rule uses this, not the class
probability, because blocking bills you for the innocent members.

**Review** The third action. Send the cluster to a human. Costs Rs.150 per
account. Exists because at 75:1, blocking on anything short of near-certainty
loses money.

**Ring** A group of accounts run by one person to farm the first-order promo.
What Jaal is looking for.

**Seed** The integer that determines a generated world. Fixed everywhere, so
the same input gives byte-identical output. Splits are by seed, never by row,
because clusters from one world share generator artefacts.

**Term frequency adjustment** Weighting a match by how rare the matched value
is. Sharing a rare device is stronger evidence than sharing a common one.
Applied at 75% strength.

**Tier** How careful the operator is. Four of them: obvious, moderate,
sophisticated, adaptive. Results are never averaged across tiers, because the
variation is the finding.

**u** How often a field agrees between two strangers, by chance. A property of
your customer population, not of the fraud. Re-estimate it on your own data.

**World** One generated population: 12,000 accounts, 0.8% in a ring, 40
lookalike groups, plus a hidden answer key. One seed makes one world.
