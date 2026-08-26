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

140 tests pass. 27 decisions recorded, including the wrong turns.

A full account of everything built is in `docs/built_till_now.md`.

## Closing round, in progress

| item | state |
| ---- | ----- |
| 1. Review accuracy sensitivity | done. Break-even reviewer accuracy 0.5753 pooled |
| 2. Undefined precision | done. Adaptive precision reads `n/a (no blocks)` everywhere |
| 3. Bounded review capacity | done. 80% of what review adds needs 1.69 clusters per batch |
| 4. Ninety-second version | done. `docs/PITCH.md`, and prepended to the README |
| 5. Adversarial loop | done. Blocking driven to zero in two moves, review queue held at 0.93 |
| 6. Vulcan positioning | not started |
| 7. Ring reassembly | not started |

## Definition of done

| check | state |
| ----- | ----- |
| `./run.sh` works offline from a clean checkout | yes, verified in a fresh clone under `unshare -rn`, 67s in quick mode |
| precision and recall per tier on sealed holdout seeds | yes, `results/holdout.json` |
| false-positive cost in rupees, with a cost curve | yes, `results/cost_curve.png` |
| rules-only baseline published and compared against | yes, re-run on the same holdout worlds |
| every flagged cluster carries a human-readable reason | yes, all 1,334 committed |
| failure catalogue with at least 4 entries | yes, 5 |
| detection curve showing where the system stops working | yes, both panels |
| docs complete: overview, architecture, data model, phases, diagrams | yes, 33 files |
| README states defence-only and synthetic in the first 200 words | yes, asserted by a test |
| no API key anywhere in git history | yes, scanned |
| commit history reads as incremental work, no dump commit | 13 commits, see D-027 |

## Blocked or uncertain

- **Most review notes are templates.** 40 of 1,334 were written by
  `minimax-m3:cloud`, the rest are templates. One live call takes about 15
  seconds, so writing all of them would take five and a half hours. The 40
  chosen are the highest value clusters. Nothing depends on the model: pull the
  network and every score, action and rupee figure is unchanged.

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
