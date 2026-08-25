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
$ python -m detector.explain --features results/features_holdout.csv --limit 40

writing 40 review notes (cache or template)
sources: cache 0, live 0, template 40
notes containing a number not in the feature dict: 0
```

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

## Known limitations

**No live language model output exists in this repository.** `OLLAMA_API_KEY` is
not set on the machine this was built on and no Ollama server is running, so all
40 committed cache entries are template notes and are labelled `"source":
"template"`. The live path is implemented and wrapped in try/except, so setting
the key and re-running with `--live` fills the cache with written notes. Marking
them as templates rather than pretending otherwise is the point.

**The evidence bullets are coarse.** They report the dominant comparison and the
average, minimum and spread of edge weights inside the cluster. The full
per-comparison breakdown exists on every edge from Phase 2 and is not yet
surfaced per cluster.

**The template says "recommended: review" without saying what to check.** A
useful note would tell the analyst which two accounts to compare first. It does
not.
