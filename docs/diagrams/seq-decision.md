# Sequence: one cluster to an action

What happens between a cluster existing and a decision being made about it. The
surprise is in the last step.

```mermaid
sequenceDiagram
    participant C as cluster (69 accounts)
    participant F as features.py
    participant M as model.pkl
    participant D as decide.py
    participant X as explain.py

    C->>F: accounts and subgraph
    F-->>D: 25 numbers
    F->>M: the 24 the model uses
    M-->>D: probability 1.00 (is this a ring cluster?)
    M-->>D: predicted purity 0.79 (what share of it is?)
    D->>D: block  = (1 - 0.79) x 69 x 15,000 = Rs.213,915
    D->>D: allow  =      0.79  x 69 x    200 = Rs.10,948
    D->>D: review =              69 x    150 = Rs.10,350
    D-->>X: cheapest is review
    X-->>C: "69 accounts created over 221.3 days, 99% in one pincode..."
```

Read the two model outputs together. The classifier is **certain** this is a
ring cluster, at probability 1.00. The purity model says only 79% of its members
are actually ring accounts, so blocking it would destroy roughly 14 real
customers.

Blocking costs Rs.213,915. Reviewing costs Rs.10,350. A human looks at it.

That is the whole argument for the third action, in one worked example. A
two-action system with a threshold anywhere below 1.00 blocks this cluster and
loses two hundred thousand rupees being right about it.

Take away: certainty that a group contains fraud is not the same as certainty
about every member of it, and the cost model needs the second one.
