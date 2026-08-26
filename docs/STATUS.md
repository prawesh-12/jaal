# Status

Last updated: 2026-08-26
Finished. Every planned item is built, measured and committed. The last
round tested a claim the round before had published, and withdrew it.

## What exists

| stage | what it produces |
| ----- | ---------------- |
| generator | Worlds with a hidden answer key. Four adversary tiers, four lookalike kinds, 0.8% prevalence, distributions calibrated against 99,441 real Olist orders. Byte identical on a repeat run. |
| baseline | Rules-only detector with the cost model written first. Frozen and locked by a test. |
| blocking | Six rules, 72 million pairs down to about 32,000. Recall and pair reduction reported per tier. |
| linking | Fellegi-Sunter with ordered comparison levels and a term frequency adjustment. m and u learned without labels. EM built, measured, rejected. |
| clustering | Leiden, resolution swept and found not to matter, Louvain compared. Edge threshold corrected from 6 bits to 14. |
| features | 25 per cluster, with a leakage audit that reads the source of every feature function. |
| model | Calibrated forest, plus a second model predicting cluster purity because the cost model needs purity and not a class probability. |
| decisions | Three actions priced in rupees. Sensitivity across seven cost ratios, reviewer accuracy, and a bounded analyst budget. |
| holdout | Seeds 900 to 999, opened once, re-run twice since and identical each time. |
| adversarial loop | An operator that adapts to its own outcomes and drives blocking to zero in two moves. How much of the review queue it can see is a setting, swept from none to all. |
| explanations | 1,334 review notes, 40 written by a language model, every number audited against the pipeline. |
| interface | README opening in plain language, run.sh, a Flask service that answers what a caller with fewer columns would get, and a six-view React front end on Tailwind: overview, cost, failures, the pipeline stage by stage, a filterable review queue, and the charts the pipeline drew. Neutral by default, colour reserved for state, and every mark colour passes a colour-vision check. |

239 tests. 42 decisions recorded, including every wrong turn.

Full account: `docs/built_till_now.md`. Every measured number: `docs/METRICS.md`.

## Headline numbers, sealed holdout, seeds 900-999

| tier | PR-AUC | precision | recall | blocked or reviewed | net vs nothing |
| ---- | ------ | --------- | ------ | ------------------- | -------------- |
| obvious | 0.9974 | 1.0000 | 0.5016 | 0.9931 | +Rs.1,148,700 |
| moderate | 0.9971 | 1.0000 | 0.1425 | 0.9609 | +Rs.569,400 |
| sophisticated | 0.9763 | 0.9961 | 0.0266 | 0.9129 | +Rs.343,100 |
| adaptive | 0.8046 | n/a (no blocks) | 0.0000 | 0.5669 | +Rs.191,850 |

Pooled **+Rs.2,253,050** against Rs.7,680,000 for doing nothing. The rules
baseline on the same worlds loses **Rs.48,028,800**.

## Things a reader should not miss

- **The adaptive tier blocks nothing.** Precision there is undefined, not zero.
  It saves money only by routing 57% of those accounts to a human.
- **Every two-action threshold loses money.** All 101 of them.
- **The reviewer has to be right 57.5% of the time** for the system to break
  even. The hardest tier needs 82%.
- **80% of what the review queue adds** comes from the top 1.69 clusters per
  batch of 12,000 accounts.
- **An adapting operator kills blocking in two moves.** The review queue holds
  at 0.9222 when it cannot see reviews and 0.8867 when it can, so seeing the
  queue roughly doubles the erosion and does not collapse it.
- **We published a claim last round and then disproved it.** We said the queue
  is robust because it is invisible. It is not. It holds because evasion is
  superadditive: any one of the operator's five behaviours changed alone costs
  under 4 points of recall, all five together cost 39. A greedy operator that
  changes one thing a round never assembles all five. That is a search failure
  by the attacker, not a property of the defence.
- **Rejoining split rings was tried and made things worse** by Rs.1,431,700. The
  code is kept and disabled.
- **Zero false positives** across 3,849 clusters in 20 worlds containing no
  rings.

## Definition of done

| check | state |
| ----- | ----- |
| `./run.sh` works offline from a clean checkout | yes, fresh clone under `unshare -rn`, 68s in quick mode |
| precision and recall per tier on sealed holdout seeds | yes |
| false-positive cost in rupees, with a cost curve | yes |
| rules-only baseline published and compared against | yes, on the same holdout worlds |
| every flagged cluster carries a human-readable reason | yes, all 1,334 committed |
| failure catalogue with at least 4 entries | yes, 5 |
| detection curve showing where the system stops working | yes, plus an adversarial loop |
| review queue costed against accuracy and against capacity | yes |
| adversarial loop run at every level of review visibility | yes, 3 replicates on the two that decide it |
| docs complete | yes, 40 files |
| README opens with a plain-language summary | yes, also `docs/PITCH.md` |
| README numbers match results/ | yes, asserted by 10 tests |
| no API key anywhere in git history | yes, scanned |

## Not built

- Fuzzy string comparison. Every field comparison is exact or a numeric band.
- A detector that adapts back. The adversarial loop is one-sided.
- An attacker that moves more than one parameter at a time, or searches a grid
  instead of climbing greedily. That is what finds the corner at 0.5701, and it
  is not modelled.
- A delayed feedback model. Review visibility here is a probability, not a lag,
  and a real operator learns weeks later.
