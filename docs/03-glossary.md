# Glossary

One line each. Terms are defined where they first appear in the phase docs too.

**Account.** One customer record. The thing the merchant sees.

**Ablation.** Removing one comparison and measuring what recall loses, which
answers "what if the operator hides X" for every X.

**Adaptive tier.** The most careful operator the generator models: rotates every
device and address, spreads signups over 45 days, jitters order values, and has
15% of accounts behave like real customers.

**Blocking.** Only comparing accounts that agree on some coarse key, so 72
million pairs become about 32,000. Buys speed at the price of a hard recall
ceiling.

**Blocking recall.** The fraction of true co-operator pairs that blocking
generates as candidates. Anything it misses is unrecoverable by any later stage.

**Brier score.** How accurate probabilities are, not just how well they rank.
Lower is better.

**Calibration.** Making a score mean what it says, so clusters scored 0.80 really
are rings 80% of the time. Load bearing here because the cost model is arithmetic
on that number.

**Camouflage.** A slice of a ring behaving like real customers, aimed at the
repeat-rate feature.

**Cluster.** A group of accounts the pipeline believes share an operator. The
unit of every decision after Phase 3.

**Comparison level.** One of several ordered, mutually exclusive outcomes of a
comparison, for example "within an hour", "within a day", "further apart".
Exactly one fires per pair.

**Cost asymmetry.** Blocking an innocent customer costs 75 times what missing an
abuser does. Rs.15,000 against Rs.200.

**Breakeven precision.** 98.7%. Below it, blocking loses money however much
recall it buys.

**Detection curve.** Recall plotted against operator sophistication. The
project's most credible artefact, because it names its own blind spot.

**Fellegi-Sunter.** The 1969 record linkage model. Each field comparison
contributes `log2(m / u)` bits of evidence and the bits add up.

**Holdout.** Seeds 900 to 999, sealed before any code existed and opened exactly
once.

**Leiden.** The community detection algorithm used here. Guarantees connected
communities, unlike Louvain.

**Lookalike.** A benign group that shares what a ring shares, for an innocent
reason: family, flatmates, hostel, office.

**m.** How often a field agrees when two accounts really do share an operator.

**Operator.** The real person controlling a set of accounts. Unobservable in
deployment, known in the generator, which is why the generator exists.

**PR-AUC.** Area under the precision-recall curve. Its floor equals the
prevalence, so it is always quoted with the base rate beside it.

**Prevalence.** The share of accounts that belong to a ring: 0.80%. At cluster
level it is 2.3%, because clustering concentrates them. Both are reported.

**Purity.** The share of a cluster's accounts that really are ring accounts.
What the cost model needs, and what the class probability does not tell you.

**Review queue.** The third action. Costs Rs.150 an account and hands the
decision to a person.

**Ring.** A set of accounts run by one operator to farm the first-order coupon.

**Term frequency adjustment.** Weighting agreement by how rare the shared value
is. Sharing a device two accounts have is not the same evidence as sharing one
three hundred accounts have.

**u.** How often a field agrees between two strangers, by chance.

**Union-find.** The disjoint-set structure the Phase 1 baseline uses to merge
accounts that share an identifier exactly.

**World.** One generated population of accounts plus its hidden answer key.
Identified by a seed and a tier.
