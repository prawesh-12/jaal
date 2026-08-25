# Status

Last updated: 2026-08-26
Current phase: 1 (honest baseline), complete. Phase 2 next.

## Done
- **Phase 0**, foundation. Generator with four adversary tiers, four lookalike
  kinds, 0.8% prevalence, Olist-calibrated distributions, sealed holdout
  protocol published in README before any results existed. All 8 check list
  items pass.
- **Phase 1**, honest baseline. Cost model written first, exact-match linking
  with union-find, five hand-written rules, per-tier reporting, frozen into
  `results/baseline.json` and locked by a test.
- 49 tests pass.

## In progress
- nothing, between phases

## Next
- Phase 2, probabilistic linking. Four days, the technical core.
  - 2.1 comparison functions, 2.2 blocking, 2.3 estimate m and u,
    2.4 score pairs, 2.5 threshold and ablation

## Blocked or uncertain
- nothing. The matplotlib question is resolved: approved as a tenth dependency,
  pinned at 3.11.1. See D-012.

## Numbers so far (all real, from committed runs)

### Generator, `python -m detector.check_phase0 --accounts 12000 --seeds 0-9`

| tier | prevalence | rings | lookalike groups | device reuse in rings | address reuse in rings | ring signup span, median days |
| ---- | ---------- | ----- | ---------------- | --------------------- | ---------------------- | ----------------------------- |
| obvious | 0.0080 | 3-5 | 40 | 919 | 907 | 0.037 |
| moderate | 0.0080 | 3-5 | 40 | 528 | 843 | 2.560 |
| sophisticated | 0.0080 | 3-5 | 40 | 65 | 655 | 19.342 |
| adaptive | 0.0080 | 3-5 | 40 | 0 | 0 | 42.249 |

- office lookalike signup span, max over 10 worlds: 12.90 days (trap holds)
- seed 5 generated twice: byte identical
- 100 worlds of 12,000 accounts: 5.1 seconds
- Olist priors: 99,441 orders, 96,096 customers, repeat rate 0.0312,
  busiest hour 16:00, BRL to INR scale 5.1784 giving a Rs.450 median order

### Rules baseline, `--seeds 700-799`, 100 worlds per tier, prevalence 0.80%

| tier | groups | flagged | precision | recall | FP accounts | net vs nothing |
| ---- | ------ | ------- | --------- | ------ | ----------- | -------------- |
| obvious | 5985 | 656 | 0.9129 | 1.0000 | 916 | -Rs.11,820,000 |
| moderate | 5885 | 697 | 0.9115 | 0.9995 | 932 | -Rs.12,061,000 |
| sophisticated | 7092 | 1824 | 0.9037 | 0.8373 | 857 | -Rs.11,247,400 |
| adaptive | 5501 | 298 | 0.0000 | 0.0000 | 964 | -Rs.14,460,000 |

- **every tier loses money.** Blocking pays only above 98.7% precision.
- baseline runs 400 worlds in 38 seconds
- holdout seeds 900-999 remain sealed and unopened
