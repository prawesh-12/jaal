# L3: Inside the rules baseline

What happens to one world when the baseline runs over it, and where it goes
wrong. This is the reference every later phase reports against.

```mermaid
sequenceDiagram
    participant W as world.accounts
    participant B as baseline.py
    participant U as UnionFind
    participant C as costs.py
    W->>B: 12,000 accounts
    loop device_id, then address_id
        B->>B: bucket accounts by exact value
        alt bucket over 400 members
            B->>B: skip it, count it
        else
            B->>U: union every member with the first
        end
    end
    U-->>B: components, keep those with 3+ members
    loop each group
        B->>B: six features (coupon rate, repeat rate,<br/>signup span, near-floor share, value spread)
        B->>B: rule_score, five weighted rules
        B->>B: score >= 0.50 blocks every member
    end
    B->>C: missed abusers, blocked innocents
    C-->>B: rupees, against do-nothing and block-everyone
```

The single most important line is the `alt` branch. It exists because the first
version of this had no size guard and linked on IP prefix as well. One /24
network covering 694 accounts chained through shared devices into a component of
5,754 accounts, which held every ring in the world and was never flagged.

Take away: exact matching has no way to express a weak edge. It either merges
two accounts completely or not at all, and one coarse field is enough to merge
half the population. Phase 2 replaces this with an edge weight in bits.
