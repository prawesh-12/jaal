# Status

Last updated: 2026-08-26
Current phase: 0 (foundation reset), complete. Phase 1 next.

## Done
- Repo skeleton, git on `main`, venv with the nine pinned dependencies
- Step 0.1: `config.py`, every tunable constant in one place
- Step 0.2: Olist priors extracted from 99,441 real orders into
  `data/olist_priors.json`. Raw CSVs stay out of git.
- Step 0.3: prevalence derived from a budget, lands on 0.0080 exactly
- Step 0.4: four tiers, `adaptive` included
- Step 0.5: four lookalike kinds, including the `office` trap
- Step 0.6: evaluation protocol published in README.md before any results exist
- Step 0.7: every generator output prints the prevalence it was measured at
- `detector/resources.py`, the memory budget helper. Every entry point calls it.
- Phase 0 check list passes at full size, all 8 items. 29 tests pass.

## In progress
- nothing, between phases

## Next
- Phase 1, step 1.1: `costs.py`, the cost model, written before the detector
- Then 1.2 exact-match linking with union-find, 1.3 hand-written rules,
  1.4 per-tier reporting, 1.5 freeze the baseline into `results/baseline.json`

## Blocked or uncertain
- **Needs a decision from the developer.** The plan asks for `results/*.png`
  (PR curves in 5.2, reliability diagram in 5.4, cost curve in 6.3) but caps
  dependencies at nine and lists no plotting library. matplotlib is not
  installed. Nothing before Phase 5 needs it, so this is not blocking yet. See
  D-002 for the fallback if the answer is no.

## Numbers so far (all real, from committed runs)

`python -m detector.check_phase0 --accounts 12000 --seeds 0-9`

| tier | prevalence | rings | lookalike groups | device reuse inside rings | ring signup span, median days |
| ---- | ---------- | ----- | ---------------- | ------------------------- | ----------------------------- |
| obvious | 0.0080 | 3-5 | 40 | 919 | 0.037 |
| moderate | 0.0080 | 3-5 | 40 | 527 | 2.515 |
| sophisticated | 0.0080 | 3-5 | 40 | 64 | 19.43 |
| adaptive | 0.0080 | 3-5 | 40 | 0 | 41.27 |

- office lookalike signup span, max over 10 worlds: 12.78 days (trap holds, under 14)
- seed 5 generated twice: byte identical
- 100 worlds of 12,000 accounts: 5.04 seconds
- Olist priors: 99,441 orders, 96,096 customers, repeat rate 0.0312,
  busiest hour 16:00, BRL to INR scale 5.1784 giving a Rs.450 median order
- generated world, seed 0: population repeat rate 0.0284, coupon use 0.5516,
  ring repeat rate 0.0000 (obvious) and 0.1354 (adaptive)
- no detection numbers yet, no baseline yet, holdout unopened
