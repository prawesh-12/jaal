# Sequence: run.sh start to results

What one command does, in order, and roughly what each step costs.

```mermaid
sequenceDiagram
    participant U as ./run.sh
    participant R as resources.py
    participant G as generate_accounts.py
    participant P as pipeline modules
    participant O as results/

    U->>R: measure MemAvailable, set RLIMIT_AS
    R-->>U: budget and worker count, printed
    U->>P: check_phase0        (~10s, generator check list)
    U->>P: baseline            (~40s, rules-only reference)
    U->>P: blocking            (~30s, recall and reduction)
    U->>P: link_train          (~5m,  m and u, plus EM)
    U->>P: link_eval           (~2m,  threshold sweep and ablation)
    U->>P: cluster             (~1m,  Leiden and Louvain)
    loop 240 training worlds, one at a time
        P->>G: generate(seed, tier)
        G-->>P: accounts and truth
        P->>P: block, score, cluster, extract features
        P->>P: del world
    end
    U->>P: features train + val (~10m)
    U->>P: model               (~30s, fit and calibrate)
    U->>P: decide              (~1m,  cost curve and sensitivity)
    alt results/holdout.json exists
        U->>U: skip, a holdout opened twice is not a holdout
    else
        U->>P: evaluate_holdout (~15m, opens seeds 900-999)
    end
    U->>P: explain             (~5s,  review notes from the cache)
    P->>O: JSON and PNG for every number quoted anywhere
```

The loop is the part that matters for a laptop. Worlds are generated one at a
time and deleted before the next, so 240 worlds of 12,000 accounts never coexist.
Holding them all would be roughly 3 million account rows in memory at once.

`./run.sh quick` runs the same sequence on 4,000-account worlds and a tenth of
the seeds, in about four minutes. The numbers it produces are real but noisier,
and the ones published in the README come from the full run.

Take away: no network access anywhere in this diagram.
