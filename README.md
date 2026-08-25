# Jaal

**Finding the fraud between transactions, not inside them.**

*Jaal* (जाल) means both net and web in Hindi. This project is both: a graph of
hidden connections between accounts, and the net that catches what moves inside
it.

Razorpay Buildathon 2026, Track 02 (AI Risk Manager). Work in progress.

## Defence only, synthetic data only

Jaal detects **groups of accounts run by one person** farming a merchant's
first-order promo discount. It is strictly defensive. It generates no evasion
guidance, touches no payment rails real or test, and contains no real personal
data. Every account record in this repository is synthetic, produced by
`detector/generate_accounts.py`, which is a **test fixture**. It exists because
real promo abuse is unlabelled, so there is no other way to measure a detector
against a known answer. The generator parameterises how careful an operator is,
so the project can report where detection fails. Naming a blind spot is
defensive disclosure, not instruction.

## The problem in one paragraph

Fifty accounts each place one perfectly ordinary order and each claim the
Rs.200 first-order coupon once. No single transaction looks wrong, because no
single transaction is wrong. The fraud lives in the relationships between the
accounts, not inside any one of them. So the unit of detection here is never the
transaction. It is the cluster.

## Evaluation protocol

Published before any results existed, which is what makes it worth anything.

```
Seeds 0-699    train
Seeds 700-899  validation and tuning
Seeds 900-999  SEALED. Opened once, at Phase 7. No tuning against them, ever.
```

Further rules that hold for every number in this repository:

1. **Metrics are reported per adversary tier, never averaged.** Blending hides
   the sophistication threshold at which detection fails, which is the most
   interesting result the project produces.
2. **Prevalence is stated alongside every metric.** PR-AUC has a floor equal to
   the class prior, so a PR-AUC of 0.30 is terrible at 25% prevalence and
   excellent at 0.8%. Without the base rate the number means nothing.
3. **Train and test split on generator seed, never on row.** Clusters from one
   world share generator artefacts, so a random row split leaks them.
4. **No reported number needs the internet.** Everything reproduces offline from
   `./run.sh`. The LLM explanation layer is cached and optional.
5. **A rules-only baseline is published and every model result is a delta
   against it.**

## Results

The sealed holdout has not been opened. Phases 0 and 1 of 10 are complete, so
the only numbers that exist are the rules-only baseline, measured on validation
seeds 700 to 799 at 0.8% prevalence, 100 worlds of 12,000 accounts per tier.

| tier | precision | recall | innocents blocked | net against deploying nothing |
| ---- | --------- | ------ | ----------------- | ----------------------------- |
| obvious | 0.9129 | 1.0000 | 916 | -Rs.11,820,000 |
| moderate | 0.9115 | 0.9995 | 932 | -Rs.12,061,000 |
| sophisticated | 0.9037 | 0.8373 | 857 | -Rs.11,247,400 |
| adaptive | 0.0000 | 0.0000 | 964 | -Rs.14,460,000 |

**Every row loses money.** The `obvious` row caught every ring account in 100
worlds at 91% precision and still destroyed Rs.11.8 million of value, because
blocking one real customer costs Rs.15,000 and a farmed coupon costs Rs.200.
Blocking pays only above **98.7%** precision. That is the number the rest of
this project is aimed at, and it is why there is a review queue rather than two
actions.

Model results, calibration and the cost curve arrive in Phases 5 to 7.

## How to run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m detector.check_phase0 --accounts 12000 --seeds 0-9
.venv/bin/python -m pytest
```

`./run.sh` arrives in Phase 9 and will run the whole pipeline offline in one
command.

## Data

Order values, customer repeat rate and signup hour-of-day are calibrated against
the **Brazilian E-Commerce Public Dataset by Olist** (99,441 orders, 2016 to
2018), licensed CC BY-NC-SA 4.0.
https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce

Only derived distribution parameters are committed, in
`data/olist_priors.json`. The raw dataset is not vendored and is not needed to
run anything.

Two honest caveats. Olist is Brazilian marketplace data, not Indian food
delivery, so prices are rescaled by a factor of 5.1784 chosen to put the median
order at Rs.450. The shape of the distributions transfers, the absolute values
do not. And the 3.1% repeat rate Olist shows is a marketplace baseline; it sets
the contrast for ring behaviour rather than describing a delivery merchant.

## Documentation

- `docs/STATUS.md`, current state
- `docs/DECISIONS.md`, why things are the way they are
- `docs/phases/`, one document per phase as it completes
- `docs/diagrams/`, context, containers, pipeline and per-stage diagrams
- `extras/plan.md`, the full implementation plan
