# L3: Inside pair scoring

How one candidate pair turns into a number of bits, and why the breakdown is
kept rather than summed away.

```mermaid
flowchart TB
    P[candidate pair a, b] --> C[compare on 9 comparisons]
    C --> L[each comparison returns<br/>exactly one level index]
    L --> W[look up log2 m over u<br/>for that level]
    W --> T{term frequency field?}
    T -->|device, address, pincode,<br/>card_bin, ip_prefix| F[shift the agreement weight<br/>by how rare the value is]
    T -->|no| K[keep the level weight]
    F --> S[sum to total bits]
    K --> S
    S --> B[bits + per-comparison row]
    B --> E{bits >= 6}
    E -->|yes| G[edge, weight = bits]
    E -->|no| X[no edge]
```

The `exactly one level` step is the part that is easy to get wrong. A pair 30
minutes apart satisfies "within an hour", "within a day" and "within a week" at
once. Adding all three counts the same evidence three times. Levels are ordered
and mutually exclusive, so `signup_gap` contributes +12.51 bits or +5.99 or
+3.15 or -5.06 or -7.22, never a sum of them.

Two comparisons, `coupon_floor` and `order_value`, are computed here and then
left out of the sum. Their m was learned from careless operators, so their
no-agreement levels punish a ring for jittering its order values, which is
backwards. Removing them raised adaptive pair recall from 0.14 to 0.50.

Take away: the output is two things. The total decides whether an edge exists.
The per-comparison row is what a human reviewer reads in Phase 8, and it is the
actual computation rather than a rationalisation invented afterwards.
