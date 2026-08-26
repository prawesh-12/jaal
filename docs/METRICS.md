# Measured results

Every number here was produced by a run and read back out of `results/`. Nothing is copied by hand.


## Generator

10 worlds per tier, 12,000 accounts each.

| tier | prevalence | rings | lookalike groups | device reuse in rings | address reuse in rings |
| --- | --- | --- | --- | --- | --- |
| obvious | 0.0080 | 3-5 | 40 | 919 | 907 |
| moderate | 0.0080 | 3-5 | 40 | 528 | 843 |
| sophisticated | 0.0080 | 3-5 | 40 | 65 | 655 |
| adaptive | 0.0080 | 3-5 | 40 | 0 | 0 |

Seed 5 generated twice, byte identical: **True**. 100 worlds in 5.32s.

## Blocking

Candidate pairs, and the ceiling they put on everything downstream.

| tier | recall | worst world | pair reduction | candidate pairs |
| --- | --- | --- | --- | --- |
| obvious | 1.0000 | 1.0000 | 0.99234 | 551,801 |
| moderate | 1.0000 | 1.0000 | 0.99247 | 542,431 |
| sophisticated | 0.9949 | 0.9810 | 0.99245 | 543,506 |
| adaptive | 0.9528 | 0.8778 | 0.99234 | 551,733 |

## Pair scoring

At 6 bits, term frequency weight 0.75.

| tier | pair precision | pair recall | edges per world |
| --- | --- | --- | --- |
| obvious | 0.0468 | 1.0000 | 32,254 |
| moderate | 0.0404 | 0.9911 | 31,866 |
| sophisticated | 0.0336 | 0.7904 | 32,967 |
| adaptive | 0.0193 | 0.4905 | 31,719 |

## Clustering

Leiden at resolution 1.0, edges over 14 bits.

| tier | clusters | pair F1 | largest cluster | Leiden disconnected | Louvain disconnected |
| --- | --- | --- | --- | --- | --- |
| obvious | 1,854 | 0.2255 | 62 | 0 | 0 |
| moderate | 1,915 | 0.2028 | 64 | 0 | 0 |
| sophisticated | 1,904 | 0.1822 | 69 | 0 | 0 |
| adaptive | 1,851 | 0.0844 | 64 | 0 | 0 |

## Model

45,324 clusters to train on, 45,159 to validate. Cluster prevalence 0.0232.

| variant | PR-AUC | baseline | lift | Brier | ROC-AUC |
| --- | --- | --- | --- | --- | --- |
| forest_raw | 0.9418 | 0.0232 | 40.6x | 0.00527 | 0.9910 |
| forest_sigmoid | 0.9418 | 0.0232 | 40.6x | 0.00323 | 0.9910 |
| forest_isotonic | 0.9298 | 0.0232 | 40.1x | 0.00313 | 0.9904 |
| mlp_raw | 0.9449 | 0.0232 | 40.8x | 0.00291 | 0.9929 |

Calibration chosen: **isotonic**. Brier 0.00527 raw, 0.00323 Platt, 0.00313 isotonic.

| tier | clusters | positives | PR-AUC | lift | Brier |
| --- | --- | --- | --- | --- | --- |
| obvious | 11,258 | 214 | 1.0000 | 52.6x | 0.00048 |
| moderate | 11,206 | 237 | 0.9998 | 47.3x | 0.00069 |
| sophisticated | 11,278 | 243 | 0.9562 | 44.4x | 0.00185 |
| adaptive | 11,417 | 353 | 0.8335 | 27.0x | 0.00942 |

Top features by permutation importance:

| feature | drop in average precision |
| --- | --- |
| distinct_bin_ratio | 0.02611 |
| total_discount | 0.02485 |
| value_cv | 0.01797 |
| near_min_rate | 0.01688 |
| discount_to_revenue | 0.01607 |
| size | 0.01140 |
| coupon_rate | 0.00805 |
| bin_concentration | 0.00793 |

## Decisions

Blocking an innocent customer costs Rs.15,000. Missing an abuser costs Rs.200. Blocking only pays above **98.7%** precision.

| policy | precision | recall | accounts blocked | reviewed | net against doing nothing |
| --- | --- | --- | --- | --- | --- |
| F1-optimal threshold | 0.9162 | 0.9119 | 22,934 | 0 | -Rs.24,642,800 |
| threshold 0.50 | 0.9084 | 0.9169 | 23,256 | 0 | -Rs.27,740,000 |
| best two-action threshold | 0.0000 | 0.0000 | 0 | 0 | +Rs.0 |
| three actions, expected cost | 0.9997 | 0.1681 | 3,875 | 17,059 | +Rs.1,317,750 |

Of 101 two-action thresholds swept, **0** turn a profit.

| cost ratio | a wrong block costs | best threshold | net, three actions |
| --- | --- | --- | --- |
| 10:1 | Rs.2,000 | 0.99 | +Rs.2,015,900 |
| 25:1 | Rs.5,000 | 1.00 | +Rs.1,478,600 |
| 50:1 | Rs.10,000 | 1.00 | +Rs.1,379,250 |
| 75:1 | Rs.15,000 | 1.00 | +Rs.1,317,750 |
| 100:1 | Rs.20,000 | 1.00 | +Rs.1,297,200 |
| 150:1 | Rs.30,000 | 1.00 | +Rs.1,277,250 |
| 200:1 | Rs.40,000 | 1.00 | +Rs.1,271,700 |

## Sealed holdout

Seeds 900 to 999, 100 worlds per tier, 12,000 accounts each. Opened once.

| tier | PR-AUC | precision | recall | blocked or reviewed | Brier | net |
| --- | --- | --- | --- | --- | --- | --- |
| obvious | 0.9974 | 1.0000 | 0.5016 | 0.9931 | 0.00067 | +Rs.1,148,700 |
| moderate | 0.9971 | 1.0000 | 0.1425 | 0.9609 | 0.00055 | +Rs.569,400 |
| sophisticated | 0.9763 | 0.9961 | 0.0266 | 0.9129 | 0.00162 | +Rs.343,100 |
| adaptive | 0.8046 | n/a (no blocks) | 0.0000 | 0.5669 | 0.01035 | +Rs.191,850 |

Pooled: precision 0.9998, recall 0.1677, recall including review 0.8585, **+Rs.2,253,050** against Rs.7,680,000 for doing nothing.

## Rules baseline, same worlds

| tier | precision | recall | net |
| --- | --- | --- | --- |
| obvious | 0.9116 | 1.0000 | -Rs.12,045,000 |
| moderate | 0.9172 | 0.9997 | -Rs.11,070,600 |
| sophisticated | 0.9037 | 0.8291 | -Rs.11,128,200 |
| adaptive | 0.0000 | 0.0000 | -Rs.13,785,000 |

Baseline total **-Rs.48,028,800** against Jaal's +Rs.2,253,050. Difference Rs.50,281,850.

## Where it stops working

| sophistication | accounts per drop address | device reuse | recall, blocked | recall, blocked or reviewed |
| --- | --- | --- | --- | --- |
| 0.00 | 20.0 | 1.00 | 0.4809 | 0.9861 |
| 0.05 | 17.2 | 0.95 | 0.3715 | 0.9688 |
| 0.10 | 14.8 | 0.90 | 0.1615 | 0.9688 |
| 0.15 | 12.8 | 0.85 | 0.1267 | 0.9531 |
| 0.20 | 11.0 | 0.80 | 0.0677 | 0.9531 |
| 0.25 | 9.5 | 0.75 | 0.0521 | 0.9531 |
| 0.30 | 8.1 | 0.70 | 0.0243 | 0.9531 |
| 0.35 | 7.0 | 0.65 | 0.0000 | 0.9531 |
| 0.40 | 6.0 | 0.60 | 0.0000 | 0.9531 |

## False positives on data with no rings

20 worlds, 240,000 accounts, zero rings.

| group kind | clusters | wrongly blocked | sent to review |
| --- | --- | --- | --- |
| family | 151 | 0 | 0 |
| flatmates | 60 | 0 | 0 |
| hostel | 211 | 0 | 0 |
| normal | 3,221 | 0 | 1 |
| office | 206 | 0 | 0 |

Total wrongly blocked: **0 accounts**, Rs.0.

## Failure modes

| failure | example | detail |
| --- | --- | --- |
| ring accounts never form a cluster | adaptive tier, seed 954 | 55 of 96 ring accounts joined no cluster above 14 bits |
| ring cluster found, then allowed | sophisticated tier, seed 906, cluster 4 | 38 ring accounts, predicted purity 0.75, probability 1.00 |
| camouflaged repeat orders | adaptive tier, seed 946, cluster 22 | 8 accounts with a repeat rate of 0.38, action taken: allow |
| one ring split across several clusters | adaptive tier, seed 912 | 11 separate ring clusters in a world that contains at most 5 rings |
| the operator rotates delivery addresses | sophistication 0.30 on the swept curve | recall falls below 0.05 once the operator is down to 8.1 accounts per drop address and 0.70 device reuse |

## How accurate does the reviewer have to be?

Every rupee above assumes a person resolves each reviewed cluster correctly. 26,527 ring accounts sit in that queue, so at Rs.200 a coupon the queue can cost at most Rs.5,305,400.

| reviewer accuracy | obvious | moderate | sophisticated | adaptive | pooled |
| --- | --- | --- | --- | --- | --- |
| 1.00 | +Rs.1,148,700 | +Rs.569,400 | +Rs.343,100 | +Rs.191,850 | +Rs.2,253,050 |
| 0.90 | +Rs.1,054,320 | +Rs.412,260 | +Rs.172,920 | +Rs.83,010 | +Rs.1,722,510 |
| 0.80 | +Rs.959,940 | +Rs.255,120 | +Rs.2,740 | -Rs.25,830 | +Rs.1,191,970 |
| 0.70 | +Rs.865,560 | +Rs.97,980 | -Rs.167,440 | -Rs.134,670 | +Rs.661,430 |
| 0.60 | +Rs.771,180 | -Rs.59,160 | -Rs.337,620 | -Rs.243,510 | +Rs.130,890 |
| 0.50 | +Rs.676,800 | -Rs.216,300 | -Rs.507,800 | -Rs.352,350 | -Rs.399,650 |
| **break-even** | never | 0.6376 | 0.7984 | 0.8237 | 0.5753 |

`never` means the tier stays ahead even if the reviewer resolves nothing at all, because blocking alone already pays for the queue.

## How many clusters can one person get through?

The queue holds 1,074 clusters across 400 batches, which is 2.69 per batch of 12,000 accounts. Blocking alone already nets Rs.1,440,000 with no analyst at all, so review adds Rs.813,050 on top.

Clusters are opened best first, ranked by expected value: predicted purity times accounts times the coupon, minus analyst time on every account. A cluster that does not fit the budget falls back to whichever of blocking and allowing is cheaper.

| clusters per batch | total | net | share of what review adds | recall incl. review |
| --- | --- | --- | --- | --- |
| 0.00 | 0 | Rs.1,440,000 | 0.0000 | 0.1953 |
| 0.23 | 92 | Rs.1,540,900 | 0.1241 | 0.2825 |
| 0.50 | 201 | Rs.1,688,300 | 0.3054 | 0.3839 |
| 0.78 | 310 | Rs.1,823,550 | 0.4717 | 0.4753 |
| 1.05 | 419 | Rs.1,936,750 | 0.6110 | 0.5567 |
| 1.32 | 528 | Rs.2,004,300 | 0.6940 | 0.6217 |
| 1.59 | 638 | Rs.2,067,200 | 0.7714 | 0.6817 |
| 1.87 | 747 | Rs.2,149,450 | 0.8726 | 0.7347 |
| 2.14 | 856 | Rs.2,203,450 | 0.9390 | 0.7794 |
| 2.41 | 965 | Rs.2,244,250 | 0.9892 | 0.8215 |
| 2.69 | 1,074 | Rs.2,253,050 | 1.0000 | 0.8585 |
| 2.69 | 1,074 | Rs.2,253,050 | 1.0000 | 0.8585 |

- 50% of what review adds needs **0.87 clusters per batch** (347 in total)
- 80% of what review adds needs **1.69 clusters per batch** (674 in total)
- 90% of what review adds needs **2.00 clusters per batch** (801 in total)
- 95% of what review adds needs **2.23 clusters per batch** (892 in total)

The curve is not perfectly monotonic. 4 of 60 steps paid less with more capacity, the worst by Rs.9,950. A cluster pushed out of the queue falls back to blocking, and blocking a genuinely pure cluster costs nothing while reviewing it costs Rs.150 an account. The best budget measured is 2.60 clusters per batch at Rs.2,256,850, which is Rs.3,800 above an unlimited queue.

## An operator that adapts

5 rounds, 100 worlds each, starting from the moderate settings. The operator sees only what share of its own accounts got blocked. A cluster sent to a human looks the same to it as one that was allowed.

| round | blocked | blocked or reviewed | parameter moved | from | to |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.1354 | 0.9631 | none, no signal to learn from | | |
| 1 | 0.0293 | 0.9557 | signup_window_days | 3.0 | 16.488 |
| 2 | 0.0000 | 0.9544 | none, no signal to learn from | | |
| 3 | 0.0000 | 0.9460 | none, no signal to learn from | | |
| 4 | 0.0050 | 0.9331 | signup_window_days | 16.488 | 29.976 |
| 5 | 0.0000 | 0.9283 | none, no signal to learn from | | |

Blocking fell from 0.1354 to 0.0000. The share reaching a human fell from 0.9631 to 0.9283.

## Rejoining split rings: measured and rejected

Clusters sharing a pincode and an overlapping signup window were merged, gated so the joined group could not be less pure than its parts. Measured on validation seeds 700 to 749, 200 worlds.

| | as is | reassembled |
| --- | --- | --- |
| clusters | 37,633 | 18,731 |
| accounts blocked | 3,159 | 1,825 |
| accounts reviewed | 14,230 | 18,576 |
| recall | 0.1645 | 0.0950 |
| recall incl. review | 0.8410 | 0.6379 |
| net against doing nothing | +Rs.1,079,900 | -Rs.351,800 |

47,212 merges proposed, 18,902 accepted, 11,566 rejected because the joined group would have been less pure, 16,744 rejected as too large.

It made things worse by Rs.1,431,700. Every cost in this system scales with cluster size: reviewing costs Rs.150 an account and blocking needs a higher purity to pay for a bigger group. The gate protected the purity ratio and could not protect the economics. The code is kept and is off by default.

## Review notes

1,334 notes for every cluster not simply allowed. Sources: live 40, template 1294. Notes quoting a number not from the pipeline: **0**.

## Charts

- `results/pr_curve.png`, Precision-recall by tier (yes)
- `results/reliability.png`, Reliability diagram, before and after calibration (yes)
- `results/cost_curve.png`, Cost against blocking threshold (yes)
- `results/detection_curve.png`, Where the detector stops working (yes)
