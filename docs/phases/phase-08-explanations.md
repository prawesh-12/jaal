# Phase 8: Explanation layer

## What this phase does

Turns a flagged cluster into something a reviewer can act on in ten seconds.
Three sources in order: a committed cache, a live call to a language model, and
a template that never fails.

## Why it matters

A reviewer handed `cluster_id: 47, p=0.83, size=22` has been told nothing.

The design rule that shapes the whole stage: **the model does no detection.** It
reads structured output and writes a sentence. Disconnect the network and every
metric still computes, every decision is unchanged, and the notes fall back to a
template. That is what makes this reproducible by someone with no API key, which
is the situation this repository was actually built in.

## How it works

The prompt is built entirely from numbers the pipeline produced, and it opens
with "Use ONLY the facts below. Do not speculate and do not add any number that
is not listed here." That instruction is not politeness. Without it the model
invents plausible details, and an invented number in a fraud review note is
worse than no note at all.

The cache key is a SHA-256 of the rounded facts, the probability and the action,
truncated to 16 hex characters. Keying on the evidence rather than on a cluster
id means a re-run reproduces the same key, so a committed cache keeps working.
Every branch writes to the cache, including the template branch, so the source is
recorded honestly rather than silently recomputed.

See `docs/diagrams/seq-explain-cache.md` for the sequence.

## Results

```
$ python -m detector.explain --features results/features_holdout.csv --limit 40 --live
writing 40 review notes (live)
sources: live 40, template 0

$ python -m detector.explain --features results/features_holdout.csv --limit 2000
writing 1334 review notes (cache or template)
sources: live 40, template 1294 (1334 served from cache)
notes containing a number not in the feature dict: 0
```

Every cluster the holdout run did not simply allow gets a note: 260 blocked and
1,074 sent for review. All 1,334 are committed in `cache/explanations/`.

An example, from the adaptive tier, seed 977, cluster 1:

```
59 accounts created over 542.1 days, 80% of them in one pincode. 100% used the
first-order coupon and 0% ever ordered again, extracting Rs.11,800 in discounts.
Calibrated probability 1.00. Recommended: review.
Strongest linking evidence:
  - card bin agreement, average edge: +15.5 bits
  - weakest link inside the cluster: +14.1 bits
  - spread of edge strength: +1.7 bits
```

Every figure was checked against the feature row it came from:

```
size=59  span=542.1  pin_conc=0.80  coupon=1.00  repeat=0.00
discount=11800  mean_edge=15.5  min_edge=14.1  spread=1.7  dominant=card_bin
```

`audit_note` does this automatically for every note, comparing each numeric
token against the feature dict and the evidence bullets, and reports any that do
not trace back. Ten notes were also read by hand, because that check catches an
invented number and not a real one rephrased into a wrong claim.

**The audit earned its place immediately.** It flagged 7 notes out of 1,334
quoting bit values that were not on their own cluster. The cache key covered the
facts, the probability and the action but not the evidence bullets, so two
clusters with identical rounded facts and different edge strengths shared an
entry and the second was handed the first one's evidence. The key now covers
everything the note can contain, and
`test_the_cache_key_covers_the_evidence_too` fails if that regresses. Without
the audit this would have shipped, and it is exactly the class of error the
audit exists to catch: a real number, in the wrong place.

## Known limitations

**Most committed notes are templates, not model output.** 40 of the 1,334 cache
entries were written by `minimax-m3:cloud` and are labelled `"source": "live"`.
The other 1,294 are templates. One live call takes about 15 seconds, so writing
all 1,334 would take five and a half hours, and the 40 chosen are the highest
value clusters, which are the ones a person opens first. Every entry records
which model wrote it, or `null` for a template.

**The evidence bullets are coarse.** They report the dominant comparison and the
average, minimum and spread of edge weights inside the cluster. The full
per-comparison breakdown exists on every edge from Phase 2 and is not yet
surfaced per cluster.

**The template says "recommended: review" without saying what to check.** A
useful note would tell the analyst which two accounts to compare first. It does
not.
