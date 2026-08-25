# Status

Last updated: 2026-08-26
All 11 phases complete. Holdout opened once and reported.

## Done

| phase | what it produced |
| ----- | ---------------- |
| 0 foundation | Generator, 4 adversary tiers, 4 lookalike kinds, 0.8% prevalence, Olist-calibrated distributions, sealed holdout protocol published before any result |
| 1 baseline | Cost model first, exact-match union-find, five rules, frozen and locked by a test |
| 2 linking | Blocking, Fellegi-Sunter with comparison levels and term frequency, m and u without labels, EM measured and rejected, sweep and ablation |
| 3 clustering | Leiden, resolution sweep, Louvain comparison, edge threshold corrected from 6 to 14 bits |
| 4 features | 25 features per cluster, leakage audit, redundancy report |
| 5 model | Calibrated forest plus a purity regressor, PR-AUC per tier, reliability diagram, MLP comparison |
| 6 decisions | Three actions, cost curve, sensitivity across 7 cost ratios |
| 7 holdout | Opened once, results matrix, detection curve, rings-free stress test, 5 failure modes |
| 8 explanations | 40 cached review notes, template fallback, automatic invented-number audit |
| 9 interface | README, run.sh, Flask API, React dashboard |
| 10 submission | Clean-checkout check, secret scan, final checklist |

107 tests pass. 25 decisions recorded, including the wrong turns.

## Blocked or uncertain

- **No live LLM output.** `OLLAMA_API_KEY` is not set on this machine and no
  Ollama server is running, so all 40 committed explanations are template notes,
  labelled as such. The live path is implemented and one command fills the cache
  if a key is provided. This is the third item on the cut list in CLAUDE.md and
  the template fallback is what that item says to keep.

## Headline numbers, sealed holdout, seeds 900-999

100 worlds per tier, 12,000 accounts each, 0.80% account prevalence.

| tier | PR-AUC | precision | recall | + review | net vs nothing |
| ---- | ------ | --------- | ------ | -------- | -------------- |
| obvious | 0.9974 | 1.0000 | 0.5016 | 0.9931 | +Rs.1,148,700 |
| moderate | 0.9971 | 1.0000 | 0.1425 | 0.9609 | +Rs.569,400 |
| sophisticated | 0.9763 | 0.9961 | 0.0266 | 0.9129 | +Rs.343,100 |
| adaptive | 0.8046 | 0.0000 | 0.0000 | 0.5669 | +Rs.191,850 |

Pooled: precision 0.9998, net **+Rs.2,253,050** against Rs.7,680,000 for
deploying nothing.

Rules baseline on the same worlds: **-Rs.48,028,800**. Difference Rs.50.3M.

## Things a reader should not miss

- **The adaptive tier blocks nothing.** Zero accounts, zero recall. It only saves
  money by routing 57% of those ring accounts to a human.
- **Every two-action threshold loses money.** All 101 of them. The review queue
  is what changes the sign.
- **Zero false positives on 3,849 clusters containing no rings.** The `office`
  trap never fired.
- **Recall is 0.1677 pooled and that is deliberate.** Blocking pays only above
  98.7% precision.
