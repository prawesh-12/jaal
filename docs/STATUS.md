# Status

Last updated: 2026-08-26
Current phase: 2 (probabilistic linking), complete. Phase 3 next.

## Done
- **Phase 0**, foundation. Generator with four adversary tiers, four lookalike
  kinds, 0.8% prevalence, Olist-calibrated distributions, sealed holdout
  protocol published before any results existed. All 8 check list items pass.
- **Phase 1**, honest baseline. Cost model first, exact-match union-find, five
  hand-written rules, frozen in `results/baseline.json` and locked by a test.
- **Phase 2**, probabilistic linking. Blocking, Fellegi-Sunter scoring with
  comparison levels and term frequency, m and u learned without labels, EM
  implemented and measured, threshold sweep and ablation. All 7 check list
  items pass.
- 67 tests pass.

## In progress
- nothing, between phases

## Next
- Phase 3, community detection.
  - 3.1 build the weighted graph, 3.2 Leiden, 3.3 resolution sweep,
    3.4 Louvain comparison and its disconnected-community count, 3.5 size filter
- Phase 3 also decides whether the 6 bit edge threshold survives. It was chosen
  on an edge budget, and cluster quality is the real test.

## Blocked or uncertain
- nothing blocking.
- Open question carried into Phase 3: at 6 bits, 96% of edges are wrong. The
  bet is that a ring of 30 forms a near-clique while false edges scatter, so
  Leiden separates them. If it does not, the threshold moves. See D-017.

## Numbers so far (all real, from committed runs)

### Generator, `check_phase0 --accounts 12000 --seeds 0-9`

| tier | prevalence | rings | lookalike groups | device reuse in rings | address reuse in rings |
| ---- | ---------- | ----- | ---------------- | --------------------- | ---------------------- |
| obvious | 0.0080 | 3-5 | 40 | 919 | 907 |
| moderate | 0.0080 | 3-5 | 40 | 528 | 843 |
| sophisticated | 0.0080 | 3-5 | 40 | 65 | 655 |
| adaptive | 0.0080 | 3-5 | 40 | 0 | 0 |

- seed 5 twice: byte identical. 100 worlds of 12,000 accounts: 5.1 seconds.
- Olist priors: 99,441 orders, 96,096 customers, repeat rate 0.0312,
  busiest hour 16:00, BRL to INR scale 5.1784 giving a Rs.450 median order

### Rules baseline, seeds 700-799, 100 worlds per tier, prevalence 0.80%

| tier | precision | recall | FP accounts | net vs nothing |
| ---- | --------- | ------ | ----------- | -------------- |
| obvious | 0.9129 | 1.0000 | 916 | -Rs.11,820,000 |
| moderate | 0.9115 | 0.9995 | 932 | -Rs.12,061,000 |
| sophisticated | 0.9037 | 0.8373 | 857 | -Rs.11,247,400 |
| adaptive | 0.0000 | 0.0000 | 964 | -Rs.14,460,000 |

- **every tier loses money.** Blocking pays only above 98.7% precision.

### Blocking, seeds 0-9

| tier | recall | worst world | reduction | candidate pairs |
| ---- | ------ | ----------- | --------- | --------------- |
| obvious | 1.0000 | 1.0000 | 0.99234 | 551,801 |
| moderate | 1.0000 | 1.0000 | 0.99247 | 542,431 |
| sophisticated | 0.9949 | 0.9810 | 0.99245 | 543,506 |
| adaptive | 0.9528 | 0.8778 | 0.99234 | 551,733 |

### Pair scoring at 6 bits, seeds 700-709

| tier | pair precision | pair recall | edges per world |
| ---- | -------------- | ----------- | --------------- |
| obvious | 0.0468 | 1.0000 | 32,254 |
| moderate | 0.0404 | 0.9911 | 31,866 |
| sophisticated | 0.0336 | 0.7904 | 32,967 |
| adaptive | 0.0193 | 0.4905 | 31,719 |

- Phase 1 exact matching found 0.8373 of ring accounts on `sophisticated` and
  nothing at all on `adaptive`. Linking recovers 0.79 and 0.49 of true pairs.
- m seed purity 0.9932 over 37,124 pairs. EM implemented, measured, lost.
- blocking plus scoring one 12,000 account world: 0.49 seconds
- holdout seeds 900-999 remain sealed and unopened
