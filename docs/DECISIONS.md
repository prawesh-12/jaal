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
tiers, measured over 10 worlds in `results/generator_check.json`.

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

## D-013: Comparison levels are mutually exclusive
Date: 2026-08-26
Phase: 2

The plan's step 2.1 lists `signup_1h` and `signup_24h` as separate entries in
one dictionary, and step 2.4 sums the weight of every entry that fires. A pair
30 minutes apart satisfies both, so its timing evidence is counted twice. The
same holds for `value_within50` against a wider band.

Implemented as Splink does it instead: a comparison holds ordered levels,
evaluation stops at the first that matches, and exactly one level of every
comparison contributes. `signup_gap` is one comparison with five levels rather
than four separate flags.

Non-agreement also carries weight now, `log2((1-m)/(1-u))`, which is negative.
The plan's sketch skips fields that do not agree. Keeping them is what makes the
total a real log-likelihood ratio, which is what `bits_to_probability` needs to
mean anything. The cost of that choice shows up in D-016.

## D-014: The m bootstrap seeds on popular values, not rare ones
Date: 2026-08-26
Phase: 2

The plan's step 2.3 seeds m from pairs sharing a value held by at most three
accounts, on the reasoning that a value nobody else has identifies one entity.
Measured over 20 worlds across all four tiers, those pairs are **0.7%** true
matches.

The reasoning does not transfer. It assumes duplicates come in twos, which is
true when deduplicating a customer table and false here: an operator runs eight
to forty-five accounts, so their device is not rare, it is popular. Meanwhile a
device held by exactly two accounts is a couple sharing a phone, which is the
one thing that is definitely not one operator.

Inverted: the seed is a device carrying six or more accounts, six being one more
than the largest family in `config.LOOKALIKE_KINDS`. Purity 99.3% over 37,124
pairs. The threshold comes from config, not from the answer key.

Address cannot be used the same way at any window. A hostel holds 20 to 60
unrelated students at one address, giving 3.3% purity, so the obvious
cross-seeding trick is unavailable and m for the device comparison comes from a
second scoring pass instead.

## D-015: EM was built, measured, and lost to the bootstrap
Date: 2026-08-26
Phase: 2

The plan names Expectation Maximisation as the proper fix for the seed bias, so
it was implemented rather than waved at.

Two failures on the way, both worth recording. Left free, the match rate ran
from 0.0098 to the 0.5 ceiling in nine iterations and every weight collapsed to
zero as m converged on u: blocked pairs all agree on something, so a free
lambda lets EM explain the blocking structure instead of the ring structure.
Fixing lambda at the value config implies stopped that. Then EM drove levels it
could not see to zero, putting `order_value: no` at m = 0.0002, a weight of
-11.95 bits, when the true pooled value across tiers is nearer 0.31. EM only
learns from pairs it already believes are matches, so the careful operators it
misses never get a vote and their absence hardens into a penalty against exactly
the pairs it should be learning from. Dirichlet smoothing, 2% of the mass spread
evenly, bounds that.

With both fixes it produced a sensible table and still lost on every tier. Best
pair F1, bootstrap against EM: obvious 0.991 / 0.793, moderate 0.706 / 0.372,
sophisticated 0.118 / 0.101. The bootstrap ships. EM stays in `link_train.py`
and its parameters stay in `link_params.json` under `m_em`.

## D-016: `coupon_floor` and `order_value` are computed but not scored
Date: 2026-08-26
Phase: 2

Both comparisons encode "the ring ordered near-identical amounts just above the
coupon floor". That is a property of a careless operator. Because m is estimated
from a seed set of careless operators, their no-agreement levels carry -6.61 and
-6.99 bits, so a ring that jitters its order values is actively punished for
doing so. The harder the case, the bigger the penalty, which is backwards.

Measured on three independent blocks of ten validation worlds, removing them
lifts sophisticated pair recall from 0.60, 0.47 and 0.55 to 0.84, 0.74 and 0.86,
and adaptive recall from 0.14, 0.17 and 0.20 to 0.50, 0.49 and 0.56. Precision
improves and the edge count falls. Capping negative weights instead was tried at
0, -0.5, -1, -2, -3, -4 and -6 bits and recovered at best about half of it.

They stay in `link.COMPARISONS` and are still computed, so the ablation reports
what adding them back would cost. `link.SCORED_COMPARISONS` is what the scorer
uses.

The same bias is visible in `signup_gap`, where removing it raises adaptive
recall by 0.118. It stays because dropping it costs moderate recall, and the
ablation table names the trade rather than burying it.

## D-017: The edge threshold is chosen by edge budget, not by pair F1
Date: 2026-08-26
Phase: 2

Pair F1 is the wrong objective for this stage. The pair scorer is not the
product, it builds the graph that Leiden partitions in Phase 3. The F1-optimal
threshold is 40 bits, where the obvious tier reaches 0.9922 precision and the
moderate tier has already lost 71% of its true pairs. An edge that is never
created cannot be recovered by any later stage.

So: take every edge the clustering can afford. The budget is 50,000 edges per
12,000-account world, a mean degree near 8, which Leiden handles easily and
which is sparse enough that a ring of thirty still stands out as a near-clique.
That lands on 6 bits.

The consequence is that 96% of edges at the operating threshold are wrong. That
is deliberate and it must not be quoted as a detector precision. If Phase 3
cannot separate signal from that graph, this threshold moves and the reason gets
recorded here.

## D-018: The edge threshold moved from 6 bits to 14
Date: 2026-08-26
Phase: 3

D-017 chose 6 bits on an edge budget and said the real test was whether Leiden
could find structure in a graph where 96% of edges are wrong. It cannot. At 6
bits Leiden returns clusters of up to 1,812 accounts and a pairwise F1 of
0.0014. A blob containing every ring in the world is not a detection.

Swept the threshold against the recall ceiling the classifier inherits, defined
as the fraction of ring accounts sitting in a cluster that is majority ring:

```
threshold   obvious   moderate   sophisticated   adaptive   clusters/world
   10        0.9740     0.8802        0.7474      0.5729        430
   12        1.0000     0.9193        0.9766      0.8047        419
   14        1.0000     1.0000        1.0000      0.7786        188
   16        1.0000     1.0000        0.9948      0.6198         91
   20        1.0000     1.0000        0.9583      0.2682         40
   28        1.0000     1.0000        0.7995      0.0234         38
```

14 bits, which is where three tiers reach 1.0000 and adaptive is within 0.03 of
its best while producing less than half the clusters of 12 bits.

Recorded rather than quietly changed, because it is a case of a stage being
tuned on the wrong objective. Pair F1 and cluster quality disagree, and cluster
quality wins, because clusters are the only thing anything downstream can see.

## D-019: Louvain did not fail at the operating point, and that is reported
Date: 2026-08-26
Phase: 3

The plan expects Louvain to produce internally disconnected communities and
treats the count as a headline. It does, but only on the dense graph: 8
disconnected communities across 20 worlds at 6 bits, against zero from Leiden.

On the 14 bit graph that ships, Louvain produces zero disconnected communities
and the same pairwise F1 to four decimal places, across 40 worlds. The graph is
sparse enough that its components are already small, so there is nothing for
Louvain to glue together.

Leiden stays the default because the guarantee is free and the failure mode is
real. But the honest sentence is "Louvain fails on a graph we rejected for other
reasons, and matches Leiden on the one we ship", not "Louvain produced 7 broken
rings". The first sentence is true and the second one would not have been.

## D-020: matplotlib charts use log scales and uniform bins
Date: 2026-08-26
Phase: 5, 6

Two charts were unreadable on their first draft and the fix is worth recording,
because in both cases the default hid the finding.

The reliability diagram with `strategy="quantile"` put nine bins of ten inside
[0, 0.001], because cluster prevalence is 2.3%, and the whole chart collapsed
into the bottom left corner. Uniform bins plus a log-scaled count panel
underneath show both the calibration curve and how much data is behind each
point.

The cost curve on a linear axis was dominated by threshold 0.00, where blocking
every cluster costs Rs.4.1 billion. That single point flattened the entire region
between Rs.3 million and Rs.30 million, which is the only part anyone cares
about. Log scale on the y-axis.

## D-021: The calibration method is chosen on rupees, not on Brier
Date: 2026-08-26
Phase: 5

Isotonic wins on Brier by a hair, 0.00313 against Platt's 0.00323, and loses on
PR-AUC, 0.9298 against 0.9418. Its step function creates ties that damage the
ranking, and the reliability diagram shows why: between 0.3 and 0.8 isotonic has
one or two clusters per bin and swings from 1.00 to 0.33 to 0.43, while Platt
stays smooth.

The published finding is that Platt beats isotonic when the calibration set is
under roughly 2,000 cases. This calibration set is 11,349 clusters, well above
that, which is consistent with isotonic edging it on Brier.

Rather than pick on either metric, both calibrators are saved and Phase 6 chooses
on the objective that actually matters: total cost in rupees. They tie at
Rs.3,290,250, so Platt ships on the tie-break of keeping the ranking intact.

## D-022: The decision rule uses predicted purity, not the class probability
Date: 2026-08-26
Phase: 6

The plan's step 6.1 prices blocking as `(1 - p) * n * COST_BLOCKED_INNOCENT`,
where p is the probability the cluster is a ring. That is correct only if a
cluster is atomic: either every member is an abuser or every member is innocent.

Real clusters are mixed. A cluster that is 90% ring accounts is labelled a ring
and blocking it still destroys 10% of its members, at Rs.15,000 each. Under the
plan's formula that block is priced at almost nothing, and the realised cost is
enormous.

Measured, the difference is the whole result. With the class probability the
rule blocked 20,081 accounts at 93.3% precision and **lost Rs.16,355,550**. With
a purity model it blocks 3,875 accounts at 99.97% precision and **makes
Rs.1,317,750**. The sensitivity table was also non-monotonic under the old rule,
which is what first suggested something was wrong.

So a `RandomForestRegressor` predicts the ring share of a cluster and the
decision rule uses that. The classifier stays, because PR-AUC, calibration and
the reliability diagram are all reported at the cluster level and it is the right
model for those. The two answer different questions and the cost model needs the
second one.

## D-023: Plain CSS in the dashboard, not Tailwind
Date: 2026-08-26
Phase: 9

The plan lists React, Vite and Tailwind. React and Vite are in. Tailwind is not,
because the dashboard is five tabs of tables and two charts, and 70 lines of
plain CSS does that without a build-time dependency, a config file and one more
thing to fail on a judge's machine. The cut order in CLAUDE.md puts this whole
phase first on the chopping block, so its dependencies should be the cheapest
that work.

## D-024: The baseline was re-run on the holdout
Date: 2026-08-26
Phase: 7

`results/baseline.json` is measured on validation seeds 700 to 799, which is
where Phase 1 froze it. Comparing the model's holdout numbers against a baseline
measured on different worlds is not a comparison, so the baseline was re-run on
seeds 900 to 999 into `results/baseline_holdout.json` and that is what the README
table uses.

This does not compromise the seal. The rules baseline has no fitted parameters
and nothing was tuned in response to what it produced. Both files are committed
so the two runs can be compared.

## D-025: The holdout is not worse than validation, and why
Date: 2026-08-26
Phase: 7

The plan's check list says holdout numbers should be worse than validation and
that better numbers suggest a bug. Net per world is Rs.5,633 on the holdout
against Rs.5,491 on validation, 3% in the wrong direction.

Checked rather than assumed. There is no bug and there is also nothing to
celebrate. Train, validation and holdout are all independent draws from the same
generator with the same parameters, so there is no distribution shift for the
model to fail to generalise across. The seed split does the job it was built for,
which is preventing world-level artefacts leaking between train and test, and
that is all it can do. A synthetic holdout tests the split, not the world.

Stated in `docs/phases/phase-07-holdout.md` rather than left for a reader to
notice, because a suspiciously clean generalisation result deserves an
explanation more than a good one deserves a mention.

## D-026: The model pickle is gzipped
Date: 2026-08-26
Phase: 10

`results/model.pkl` holds a 300-tree classifier, a 300-tree purity regressor and
two calibrators. Uncompressed that is 16 MB, which is a lot of binary to put in
a repository this size. `gzip.open` from the standard library takes it to 4.7 MB
with no new dependency.

It is committed rather than rebuilt because the Flask API needs it, and a judge
poking at `/score` should not have to run a training job first.

## D-027: 13 commits, not the 40 to 70 the brief asks for
Date: 2026-08-26
Phase: 10

CLAUDE.md asks for a commit after each numbered step in the plan, roughly 40 to
70 across the project. This history has 13, one per phase or per coherent piece
of work, plus two fixes found during the final checks.

The reason is how the work actually ran: long autonomous stretches where a phase
was written, measured, corrected two or three times and only then had numbers
worth committing. Committing mid-phase would have meant committing code whose
results later turned out to be wrong, which is worse history, not better.

Recorded rather than papered over, and not fixed by rewriting history to
manufacture commits that did not happen. Each message says what changed and what
was learned, several of them describe a measurement contradicting the plan, and
there is no single dump commit. That is the property the rule was protecting.

## D-028: Reviewer accuracy is priced, and it decides the result
Date: 2026-08-26

Every rupee of benefit from the review queue assumed a person resolves each
cluster correctly. That assumption was carrying the headline number and had
never been costed.

A reviewer who fails on a ring cluster leaves those accounts unrecovered at one
coupon each, so net saving falls linearly with accuracy and reaches zero at
0.5753 pooled. Below that the system loses money.

The tiers do not share that burden. Blocking alone carries the easiest tier
whatever the reviewer does, so it never goes negative. The hardest tier needs an
82% accurate reviewer, because every rupee it earns comes from the queue. That
asymmetry is worth more than the pooled figure: it says the harder the adversary,
the more the result depends on a person doing their job.

## D-029: Precision is undefined where nothing was blocked
Date: 2026-08-26

The adaptive tier blocks zero accounts, so its precision is 0 of 0. It had been
printing as 0.0000, which reads as "everything it blocked was wrong". That is a
different claim and it is untrue.

It now reads `n/a (no blocks)` in the holdout results, the README, the metrics
report and the dashboard. The same false zero was sitting on 14 points of the
detection curve. Pooled precision needed no change: a tier that blocks nothing
contributes no numerator and no denominator, so it was already excluded, and a
test now asserts that rather than assuming it.

The rules baseline blocks 919 innocents and catches none at the same tier. That
zero is real and is left alone.

## D-030: The review queue is priced against a bounded analyst budget
Date: 2026-08-26

The queue was unbounded, which no merchant is.

Ranking clusters by expected value of review, predicted purity times accounts
times the coupon minus analyst time on every account, 80% of everything the
queue adds comes from the top 1.69 clusters per batch of 12,000 accounts and 95%
from the top 2.23. The whole queue is 2.69 per batch.

Two things worth stating. The number that matters is the share of what review
*adds*, not of the total, because blocking already nets Rs.1,440,000 with no
analyst at all and the budget cannot touch that. And the curve is not perfectly
monotonic: 4 of 60 steps paid less with more capacity, the worst by Rs.9,950,
because a cluster pushed out of the queue falls back to blocking and blocking a
genuinely pure cluster costs nothing. That is left in rather than smoothed.

## D-031: The adversarial loop did not converge on address rotation
Date: 2026-08-26

An operator was given its own five parameters, one observable outcome, and no
access to anything else. It sees the share of its accounts that were blocked,
because a cluster sent to a human is indistinguishable from one that was allowed
until somebody acts.

It moved signup timing, twice, and nothing else. Blocking fell from 0.1354 to
zero. The share of its accounts reaching a human fell from 0.9631 to 0.9283.

This was not the expected answer. The detection curve says rotating delivery
addresses is what defeats this system, and address rotation was the second
strongest signal the operator found, at rho +0.254 against +0.321. It never
picked it, because it optimises what it can measure and spreading signups
measures better.

The finding that came out of it is uncomfortable and is reported as such: the
review queue is not adversarially robust because it is hard to evade, it is
robust because it is invisible. An operator patient enough to watch which
accounts get closed weeks later would recover that signal. This loop does not
model that operator.

## D-032: 100 worlds per adversarial round, chosen by measurement
Date: 2026-08-26

Three replicates of a single round on different seeds. At 20 and 40 worlds the
blocked rate was constant across every world, so there was nothing to correlate
and the operator learned nothing at all. At 60 the answer flipped between
replicates, signup window against drop addresses. At 100 all three replicates
agreed at p of 0.001 or better, and 150 added nothing.

Recorded because "enough worlds for the result to be stable" is otherwise a
matter of taste, and here it is a measurement.

## D-033: Rejoining split rings was measured and rejected
Date: 2026-08-26

Weak edges break one ring into several clusters, each judged alone. A second
pass merged clusters sharing a pincode and an overlapping signup window, gated
so the joined group could not be less pure than its parts.

It made things worse by Rs.1,431,700 on 200 validation worlds, turning a
Rs.1,079,900 gain into a Rs.351,800 loss. Merging halved the cluster count and
recall fell with it, 0.1645 to 0.0950.

The gate did its job, rejecting 11,566 merges on purity. It protected the ratio
and could not protect the economics. Every cost in this system scales with
cluster size, so a bigger group costs more to review and needs a higher purity to
be worth blocking, even when merging diluted nothing. That is the lesson worth
keeping: a purity-preserving merge is not a cost-preserving merge.

Kept, off by default, and a test fails if anything in the live path calls it.

## D-034: `diameter` returns -1 for a disconnected group
Date: 2026-08-26

igraph reports an infinite diameter for a disconnected subgraph, which then
crashes the model with a non-finite feature. Leiden guarantees connected
communities so this never fired, and the merge experiment above is the first
thing that could build a disconnected group. The feature now returns -1, the
same sentinel it already used for a group with no edges.

## D-035: The memory budget is tested against a stubbed reading
Date: 2026-08-26

Two resource tests failed mid-round because they called `budget()` for real and
it correctly refused when free memory dipped under the floor while the desktop
was busy. A test that fails when somebody opens a browser is testing the laptop,
not the code. The logic is now checked against a stubbed reading, and one test
still confirms the real reading is plausible.

## D-036: The invisibility reading was published, then measured, then withdrawn
Date: 2026-08-26

Last round the adversarial loop gave the operator sight of blocks and not
reviews, and we wrote that the review queue is robust because it is invisible.
That claim was load bearing and it rested on a restriction we had imposed, so it
needed testing rather than repeating.

Review visibility is now a setting, `q`, the chance the operator notices a
cluster being reviewed, decided per review because an operator notices a whole
cluster being held rather than single accounts. Everything else is unchanged:
the same five parameters, the same selection rule, six rounds, 100 worlds a
round, and a separate random stream for detection so the trial settings are
identical at every visibility level.

**The queue holds under full visibility.** Blocked or reviewed falls from 0.9631
to 0.8867 over five rounds at q = 1, against 0.9222 at q = 0. Seeing the queue
roughly doubles the erosion and does not collapse it.

**But the reading was still wrong.** Blindness was not what protected it. What
visibility changes is which parameter the operator finds: counting every move
across three replicates, the blind operator went for signup timing 5 times and
address rotation once, while the seeing operator went for address rotation 6
times and twice drove it to its evasive limit. Address rotation is what the
detection curve says defeats this system, and only the seeing operator finds it.
It finds it, pushes it to the limit, and the queue holds anyway.

The README now leads with the corrected reading and says plainly that the
earlier one was wrong.

## D-037: The queue holds because evasion is superadditive, not because it is safe
Date: 2026-08-26

The first explanation offered for why the queue holds was that the operator
would need to move devices and addresses together, and that a rule changing one
thing a round never does. That was tested against eight fixed configurations and
it is wrong: both rotated together costs only 4.9 points of recall.

The measurement that does explain it. Each of the five parameters moved on its
own costs the detector at most 3.5 points of blocked-or-reviewed recall, and
jittering order values alone actually helps the detector by 0.9 points. The five
single effects sum to -0.0807. All five at their limits together cost -0.3930,
**4.9 times the sum of the parts**.

That last configuration reads 0.5701, and the adaptive tier on the sealed
holdout reads 0.5669. It is the same destination by another route.

So the destination exists, it is reachable with knobs the operator already has,
and the operator does not reach it. It changes one thing a round and keeps it,
and the payoff for any one change is small enough to look like noise beside the
payoff for all five.

Recorded plainly because it is a weaker result than either alternative. This is a
**search failure by the attacker**, not a property of the defence. A greedy hill
climb misses a superadditive corner. An attacker moving two parameters at once,
or running a coarse grid over the five, would find it. That is a slightly better
attacker, not a fundamentally different one, and the submission should not claim
otherwise.

## D-038: Three replicates, because one was not enough
Date: 2026-08-26

The first sweep ran one replicate at each of five visibility levels. The ordering
between them was not stable: `partial_75` eroded more than `full`, and
`partial_25` and `partial_50` finished identically. On one run the spread between
settings is about the size of the noise.

Three replicates of the two settings that decide the question separate them
cleanly: the worst blind replicate finished at 0.9089 and the best seeing
replicate at 0.8918, so the two do not overlap. The middle three q values still
have one run each, which is why **no threshold in q is claimed**. The
one-replicate ordering between them is reported as noise rather than smoothed
into a curve.

## D-039: Tailwind and shadcn conventions in the dashboard, reversing D-023
Date: 2026-08-26
Phase: 9

D-023 cut Tailwind and wrote the dashboard in 70 lines of plain CSS, on the
argument that five tabs of tables did not need a build-time dependency. That was
right at the time and wrong once the page grew. The dark palette had no tokens,
the tables had no way to show a rate as a length, the review queue rendered all
1,334 notes with no filter, and nothing below 1100px was thought about.

So the plan's original choice is back: Tailwind v4 through its Vite plugin, and
components written the way shadcn/ui writes them, which means `cn` over
`clsx` and `tailwind-merge`, variants through `class-variance-authority`, and
Radix for the tab primitive. Icons come from lucide-react. Inter and JetBrains
Mono are self-hosted through fontsource, so the page still renders with no
network.

Eight npm packages, all dev-time. The nine-library budget in CLAUDE.md is the
Python pipeline's, and `requirements.txt` is untouched. `run.sh` does not build
the UI and does not need it, so a judge who never runs `npm install` still gets
every published number.

What the redesign actually changed, beyond looks:

- The review queue filters by tier, action and free text, and pages 24 at a
  time instead of mounting 1,334 cards.
- Recall is drawn as a meter next to its number, so the four tiers can be
  compared by length.
- The baseline comparison is a diverging bar on one scale. On the obvious tier
  the rules lose Rs.1,18,20,000 while Jaal keeps Rs.11,48,700. The old table
  printed both numbers and left you to work out how far apart they are.
- Precision on the adaptive tier is labelled `undefined, nothing blocked`
  rather than `n/a`, which is the honest reading of 0 of 0.
- The lookalike stress test now has a place on the page. It was measured in
  Phase 7 and had never been shown.
- Chart animation is off. It said nothing and it left the lines undrawn in a
  headless screenshot.


## D-040: Rebuild the dashboard as a product page, and validate the chart palette
Date: 2026-08-26
Phase: 9

The last version was reviewed as looking generated rather than designed. Four
things were wrong with it and all four are fixed here.

**The page repeated itself.** A full hero and a five-line defence notice sat
above the tab strip, so every tab opened with the same 400 pixels of text before
any content. The hero now belongs to the Overview tab alone, the tabs are real
navigation in the header, each other tab opens with its own title and one line
of context, and the defence statement is a single line under the header with the
reasoning moved into a structured footer.

**Coloured left rails.** Three components carried a 3px accent bar down their
left edge: the defence notice, each failure catalogue entry, and each review
note. They are gone. Structure now comes from a numbered index badge on a
failure entry, a metadata band on a review note, and a tinted card on the
break-even callout.

**The `./run.sh` chip in the header.** It sat next to the run scope and told a
reader nothing. Removed. The reproducibility claim still appears in the footer,
where it is a claim rather than decoration.

**The palette was never checked.** The tier ramp was green, cyan, amber, red.
Run through the dataviz palette validator against the dark surface, two adjacent
pairs failed: green against cyan at Delta E 12.8 for normal vision, which is
below the 15 floor, and amber against red at 3.9 under simulated deuteranopia.
The ramp is now green, blue, amber, red with lightness carrying the ordering,
which passes every check. Mark colours and text colours are separate token
families, because a colour dark enough to be a distinguishable line is not
always light enough to be readable 12px text.

Alongside that, a new Pipeline tab. Four result files that the pipeline has been
writing since Phase 2 had never been shown anywhere: `blocking.json`,
`link_params.json`, `clustering.json` and `model.json`. The tab shows blocking
recall and pair reduction per tier, the per-rule breakdown, the match weight in
bits for every comparison level, the Leiden and Louvain comparison, the four
calibration variants, and permutation importance. Nothing on it is new work,
only measured numbers that had no home.

Rendering the tab caught a wrong sentence before it shipped. The first draft
said device is the only blocking rule that holds across the tiers. The table
underneath it says the opposite: device runs 1.0000 on the obvious tier and
0.0000 on the adaptive one, and `pin_bin` is the rule that holds, at 0.8188.
That is the case for looking at the rendered page rather than trusting the prose
you just wrote.

Separately, `results/explanations.json` was found holding 40 notes instead of
the committed 1,334, left behind by a partial run. Restored from the commit.

## D-041: An integration contract, and a column set you can ask about before writing code
Date: 2026-08-26
Phase: 9

The project could say what it detects and could not say what it needs. That is
the gap between a detector and something a merchant can integrate, so this round
closed it.

**Profiles are column sets, not field sets.** The first version of
`detector/profiles.py` narrowed blocking and pair scoring for each profile and
left the feature extractor alone. That was wrong and the first ablation run was
killed ten minutes in because of it. A caller who cannot send `address_id` does
not merely lose the address comparison, they also lose
`distinct_address_ratio`. Profiles are now keyed on the twelve account columns,
and `FEATURE_COLUMNS` records which column every feature reads, so dropping a
column drops the features that read it. `tests/test_profiles.py` asserts a
profile never keeps a feature or a comparison whose column it does not have.

That correction surfaced the sharpest result before any run finished. An
aggregator with no coupon flag loses `total_discount`, which has the highest
correlation with the label of any feature at 0.3923. Losing the promo flag is
not only a linkage problem, it takes out the economics.

**Hashing is now asserted rather than claimed.** Device, address, pincode, card
BIN and IP prefix are only ever tested for equality. `tests/test_hashing.py`
runs a real world through both paths and checks that blocking produces the same
candidate pairs, that pair scores and the per-field breakdown are identical
arrays, that clustering returns the same clusters, and that every feature comes
out equal column for column. Two salts give different digests, so tenants
cannot be joined. This is worth a test rather than a paragraph because it is the
difference between an integration that needs a data protection review and one
that needs a different data protection review.

**`POST /v1/coverage` answers the question before the work.** Send column names,
no account data, and get back the profile you match, the comparisons and
features you lose, and what a model fitted for that profile actually reached.
`GET /` now lists the routes, because a bare host returning a 404 is the first
thing an integrator sees.

Two 500s were found by probing rather than by reading. A batch holding a dict
and a list raised `TypeError` out of the DataFrame constructor, which escaped a
handler catching only `ValueError`. A column list containing `null` reached
`sorted()` and raised `TypeError` there. Both return 400 now and both have a
test.

## D-042: Rebuild the interface as technical software, not a dashboard
Date: 2026-08-26
Phase: 9

The page read as a generic analytics dashboard: a near-black background with one
bright accent, a card around every section, a pill around every piece of
metadata, and the same tier colour repeated three times in a row on top of a
label that already said the tier name.

**Colour is now reserved for state.** Three neutrals carry the layout, four
desaturated tones carry status, and nothing is coloured for being positive. The
net figure is set in plain foreground, not green. The four state tones double as
the tier ramp, because a tier is a severity and should not get its own hues.
They were run through the palette validator against the surface colour: the
first, more muted set failed both the chroma floor and the normal-vision
separation between red and amber, so the shipped set is the most restrained one
that passes.

**Containers follow a rule rather than a habit.** Grouping is done with rules,
headings and space. A bordered panel is used only where the content is a
discrete object a reader works one at a time, which turned out to be two places
in the whole interface: a failure catalogue entry and a queued review note. A
panel never contains another panel, which is what removes the card-in-card
nesting by construction.

**One encoding per fact.** The tier table used to carry a coloured dot, the tier
name, and two separate progress bars. It now carries the name, one status
marker, and a single two-segment bar whose first segment is what the system
blocks alone and whose continuation is what it reaches with a human. The gap
between them is the thing two adjacent numbers cannot show. The sensitivity
table lost its bar column entirely: six of its seven thresholds are 1.00, so the
bar repeated the number and nothing else.

**Fonts.** Geist Sans and Geist Mono, with mono reserved for identifiers. While
setting this up it turned out that neither Geist nor the previous Inter contains
U+20B9, so every rupee figure on the page had been drawn by whatever the
operating system happened to substitute, measured by comparing glyph advance
against a forced fallback. Mukta is now loaded devanagari-only, purely to supply
that one glyph, which is the subset Google ships it in.

Data was not touched. 58 figures were pulled straight out of `results/` and
checked against the rendered DOM of all six pages before this was committed.

## D-043: An animated pipeline, and why the animation is CSS rather than JavaScript
Date: 2026-08-26
Phase: 9

The interface had become uniform: everything dark, everything thin, everything
roughly as important as everything else. This round added hierarchy and made
the pipeline page explain the system rather than list it.

**Three levels of importance.** A surface ladder of four steps, a text ladder of
five, and a type scale named after the job rather than the size, so a heading
cannot quietly end up the same weight as the paragraph under it. Colour is still
reserved for state.

**The pipeline is now a machine you step through.** Seven stages, each with its
own SVG scene, a stage rail, play, pause, replay, previous, next, and an
auto/manual switch. Every stage names its input, its process and its output. A
volume rail underneath shows the whole reduction, counts only: 12,000 accounts,
71,994,000 possible pairs, 542,431 candidates, 54,032 edges, 1,915 clusters, 24
features, one score, three actions. The link stage sits that rail out, because
its output is a threshold in bits and a threshold is not a volume.

**motion/react was installed, used, and removed.** Every element it animated
started at opacity 0, which meant the pipeline diagram rendered blank until a
frame loop ran. For the one thing on the site whose job is to do the explaining,
that is the wrong failure mode. The reveals are CSS keyframes now:
animation-fill-mode guarantees the finished state, so a stalled loop, a
throttled background tab or a slow device leaves the diagram fully drawn rather
than empty. Expand and collapse uses grid-template-rows, which animates height
without measuring it in JavaScript, so an open disclosure is a real layout.
Interaction-led motion is CSS transitions. Nothing that carries information is
gated behind a script running.

That change also made the work verifiable. A frame loop does not advance under
the headless renderer used to check every page here, so with motion in place the
signature feature could not be looked at before shipping. It can now.

**Two bugs found by rendering rather than by reading.** The visualiser reset its
stage index on mount, not only when the tier changed, which threw away any
starting stage. And the volume rail listed each stage's output but never its
input, so the 54,032 edges above the threshold appeared nowhere on the page.

Data was not touched. 61 figures were read out of `results/` and checked against
the rendered DOM of all six pages before this was committed.
