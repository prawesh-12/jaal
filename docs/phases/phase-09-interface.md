# Phase 9: Interface and packaging

## What this phase does

Makes the work legible in five minutes: a README with results above the fold,
`run.sh` that reproduces every published number offline, a two-endpoint Flask
API, and a React dashboard that reads what the pipeline wrote.

## Why it matters

The plan calls the README the highest-value hour of the project and it is right.
A judge skims. So the honest negative goes in the results table where they will
see it, not in a limitations section at the bottom.

The anti-goal matters as much: a plain terminal table with real numbers beats a
polished dashboard over a detector that scores zero on hard cases. The dashboard
was built last, after every number existed.

## Files

| File | What it does |
| ---- | ------------ |
| `README.md` | Results first, then why recall is low, then the baseline comparison |
| `run.sh` | The whole pipeline, offline, `full` or `quick` |
| `api/app.py` | `POST /score`, `GET /runs/<id>`, plus `/health` and `/features` |
| `ui/` | React, Vite, Tailwind and Recharts. Static, no backend needed. |

## Key decisions

**`run.sh` will not re-open the holdout.** If `results/holdout.json` exists it
prints why and moves on. A holdout opened twice is not a holdout.

**`run.sh quick` exists.** The full run takes about thirty minutes, most of it
building feature tables over 640 worlds. Quick mode uses 4,000-account worlds and
a tenth of the seeds and finishes in about four. Its numbers are real and
noisier, and the published ones come from the full run.

**BLAS threads are pinned.** `run.sh` exports `OMP_NUM_THREADS=4`. Without it
numpy and scikit-learn each claim every core, and the machine this runs on
belongs to someone who is using it.

**Tailwind is in after all.** D-023 kept the dashboard on 70 lines of plain
CSS. That held while the page was five tables. It stopped holding once the page
needed a theme, meters inside table cells, sticky filters and a responsive
layout, so the plan's original choice was restored and the components follow the
shadcn/ui conventions. See D-039.

**The dashboard computes nothing.** `npm run data` copies `results/*.json` and
`results/*.png` into `public/data` and the app fetches them. The two Recharts
plots, the cost sweep and the detection curve, are drawn from the same JSON the
Python charts were drawn from. If a route handler or a component starts
calculating a feature, it belongs in `detector/`.

## Results

```
$ cd ui && npm install && npm run build
copied 30 result files into public/data
dist/index.html                    0.69 kB
dist/assets/index-tV4faKpK.css    54.62 kB (gzip 20.56 kB)
dist/assets/index-Dj86wcBD.js    661.91 kB (gzip 200.48 kB)
built in 3.48s
```

Five tabs, each reachable by its own hash so a reviewer can link straight to
one. Results is the holdout matrix, the pooled figures and the baseline
comparison. Cost is the three-action table, the threshold sweep and the
sensitivity analysis. Where it fails holds both detection curves, the lookalike
stress test and the failure catalogue. Review queue is all 1,334 notes, filtered
by tier, action or free text, 24 at a time. Charts is the eight matplotlib PNGs
the pipeline drew, framed as paper so it stays obvious the page did not draw
them.

The self-hosted Inter and JetBrains Mono files are what the CSS bundle grew
into. Nothing on the page reaches the network at runtime.

The API, checked against a real cluster from the validation table:

```
POST /score
{ "probability": 1.0, "predicted_ring_purity": 0.7933, "action": "review",
  "expected_cost_rupees": { "block": 213915, "allow": 10948, "review": 10350 },
  "reason": "69 accounts created over 221.3 days, 99% of them in one pincode...",
  "reason_source": "template", "calibration": "isotonic" }
```

That response is the project in one payload. The classifier is certain this is a
ring cluster, at probability 1.00. The purity model says 79% of its members are
ring accounts, so blocking would destroy about fourteen real customers at a cost
of Rs.213,915. Reviewing costs Rs.10,350. A human looks at it.

## Known limitations

**The JavaScript bundle is 585 kB.** Recharts is most of it. It is not code
split, because the dashboard is a demo served from localhost.

**The dashboard has no live scoring.** It reads finished results. The `/score`
endpoint exists and nothing in the UI calls it.

**Nothing is authenticated.** Both servers bind to 127.0.0.1 only and neither
should ever be exposed.
