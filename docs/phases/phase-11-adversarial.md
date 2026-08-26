# Adversarial loop

## What this does

Operator sophistication has been a dial we set. That invites a fair objection:
we wrote the fraud, so of course we catch it.

This closes the loop. An operator starts at ordinary settings, watches what
happens to its own rings, works out which of its own behaviours is getting it
caught, changes that one thing, and tries again. It never sees the detector.

## What the operator can and cannot see

It controls five things about how it runs a ring:

| parameter | range | evasive direction |
| --- | --- | --- |
| device reuse | 0.00 to 1.00 | down |
| accounts per drop address | 1.0 to 20.0 | down |
| signup window, days | 0.04 to 45.0 | up |
| order value jitter, rupees | 80 to 1,200 | up |
| camouflage | 0.00 to 0.50 | up |

It observes exactly one thing: **the share of its accounts that were blocked.**

That is a deliberate and important restriction. A cluster sent to a human review
queue looks identical to one that was allowed, from the operator's side, until
somebody acts on it. Blocking is the only outcome an operator gets immediate
feedback on. Giving it the review outcome too would be giving it information a
real operator does not have.

It never sees the model, the weights, the thresholds, the features, or any
account that is not its own.

## Method

```mermaid
flowchart TB
    S[round 0: run at ordinary settings<br/>no experiments, just watch] --> M0[record blocked, reviewed, allowed<br/>for every ring account]
    M0 --> R[round N begins]
    R --> T[run 100 worlds, each with settings<br/>drawn within 30% of the current point]
    T --> P[full pipeline on each world<br/>block, link, cluster, score, decide]
    P --> O[per world: what share of<br/>ring accounts were blocked]
    O --> C[Spearman correlation of each<br/>of the five parameters against that share]
    C --> D{any parameter whose<br/>evasive direction<br/>goes with less blocking?}
    D -->|yes| MV[move that one parameter<br/>30% of its range toward evasion]
    D -->|no signal| W[change nothing, run again]
    MV --> R
    W --> R
```

The operator moves the parameter with the **largest gain**, not the largest
correlation. A strong correlation pointing the wrong way is worth nothing to it.
Only one parameter moves per round, so the cause of any change in outcome is
never ambiguous.

## Why 100 worlds per round

Chosen by measurement, not by feel. The question is whether the operator's read
on which parameter matters is stable, or whether it is chasing noise.

Three independent replicates of a single round, each on different seeds:

| worlds per round | replicate 1 | replicate 2 | replicate 3 |
| --- | --- | --- | --- |
| 20 | no variation in the blocked rate at all | | |
| 40 | no variation in the blocked rate at all | | |
| 60 | signup window (rho -0.288) | **accounts per drop** (rho +0.313) | |
| 100 | signup window (rho -0.320, p 0.001) | signup window (rho -0.368, p 0.000) | signup window (rho -0.456, p 0.000) |
| 150 | signup window (rho -0.425, p 0.000) | signup window (rho -0.379, p 0.000) | signup window (rho -0.483, p 0.000) |

At 20 and 40 worlds the blocked rate is constant across every world, so there is
nothing to correlate and the operator learns nothing. At 60 the answer flips
between replicates. At 100 all three replicates agree at p of 0.001 or better,
and 150 adds nothing. So 100.

## Results

Six rounds, 100 worlds each, 12,000 accounts per world, starting from the
ordinary settings. Seeds 100 to 699, which the model was never fitted on.

| round | signup window (days) | blocked | blocked or reviewed | what the operator did |
| --- | --- | --- | --- | --- |
| 0 | 3.0 | 0.1354 | 0.9631 | watched, no experiments |
| 1 | 3.0 | 0.0293 | 0.9557 | found signup window, rho -0.321, p 0.001. Moved it to 16.5 days |
| 2 | 16.5 | **0.0000** | 0.9544 | nothing was blocked, so no signal to learn from |
| 3 | 16.5 | **0.0000** | 0.9460 | nothing was blocked, so no signal to learn from |
| 4 | 16.5 | 0.0050 | 0.9331 | found signup window again, rho -0.228, p 0.023. Moved it to 30.0 days |
| 5 | 30.0 | **0.0000** | 0.9283 | nothing was blocked |

The other four parameters never moved. Device reuse stayed at 0.60, drop
addresses at 8.0 accounts each, value jitter at Rs.200, camouflage at zero.

What the operator found in round 1, ranked:

| parameter | rho against being blocked | p |
| --- | --- | --- |
| signup window | -0.321 | 0.001 |
| accounts per drop address | +0.254 | 0.011 |
| value jitter | -0.138 | 0.172 |
| camouflage | -0.082 | 0.416 |
| device reuse | -0.053 | 0.601 |

## What actually happened

**It did not converge on address rotation.** The failure catalogue and the
detection curve both point at delivery addresses as the thing that defeats this
system, and an operator with the same five knobs and no access to any of that
went for signup timing instead. Address rotation was the second strongest signal
in round 1, at rho +0.254 against +0.321, and it was never chosen.

That is worth sitting with. Address rotation is what breaks blocking *and*
review. Spreading signups breaks blocking only. The operator picked the one it
could measure, which is exactly the one that helps it least in the end.

**Blocking collapsed in a single move, and stayed collapsed.** From 0.1354 to
0.0293 after one change, to zero after two. The operator, judged on the only
thing it can see, has won completely by round 2.

**The review queue barely moved.** 0.9631 to 0.9283 across all six rounds, a
fall of 3.6% of where it started, while blocking fell by 100% of where it
started. 93% of the adapted operator's accounts still reach a human.

**The operator ran out of signal.** In rounds 2, 3 and 5 not a single ring
account was blocked in 100 worlds. With nothing to correlate against, the
operator cannot learn anything more. It has optimised itself into a blind spot
of its own making: it can no longer tell whether any further change helps,
because the outcome it measures is already zero.

## What this means

The honest reading is that the loop confirms a weakness and reveals a strength,
and neither was designed in.

The weakness: a naive operator, with no knowledge of the system, needs two moves
and about two hundred experiments to reduce automatic blocking to nothing. If
this shipped as a blocking-only system it would be defeated inside a week.

The strength: the same operator cannot see the review queue, so it cannot
optimise against it, and it does not. The three-action design turns out to be
adversarially robust for a reason that has nothing to do with modelling. Not
because the queue is hard to evade, but because it is **invisible**. An operator
learns from feedback, and a review queue gives none.

That also names the way to break it. An operator patient enough to watch which
accounts get closed weeks later, rather than which get blocked at signup, would
recover the missing signal and could then optimise against review as well. This
loop does not model that operator, and nothing here suggests the system would
survive one.

## Known limitations

**One parameter moves per round.** A real operator would change several things
at once. Moving one keeps attribution clean and makes the loop slower to evade
than reality.

**The step size is fixed at 30% of each range.** A finer search would find a
cheaper move. A coarser one would overshoot.

**Five parameters is the whole action space.** A real operator has more: parcel
lockers, aged accounts bought from someone else, orders placed through a
different merchant first. None of that is modelled.

**Six rounds is not convergence.** The operator stopped learning at round 2
because its signal went to zero, not because it had finished. A longer run would
show the same flat lines.

**The detector never adapts back.** This is one-sided. A real deployment would
retrain, and the interesting experiment, which is not run here, is what happens
when both sides move.

---

# What happens when the operator can see the queue

The result above rested on one restriction: the operator sees blocks and not
reviews. The reading we published was that the queue is robust because it is
**invisible**, not because it is hard to evade.

That reading is now measured, and it is wrong.

## What changed

One setting. `q` is the chance the operator notices a cluster being reviewed,
decided per review, because an operator notices a whole cluster being held
rather than individual accounts. Blocks are always visible.

| setting | q | what the operator sees |
| --- | --- | --- |
| blocks_only | 0.00 | a review is indistinguishable from being allowed |
| partial_25 | 0.25 | one review in four is noticed |
| partial_50 | 0.50 | half of reviews are noticed |
| partial_75 | 0.75 | three reviews in four are noticed |
| full | 1.00 | a review is as visible as a block |

Everything else is identical: the same five parameters, the same selection rule,
the same six rounds, the same 100 worlds a round. The trial settings come from
their own random stream, seeded the same at every visibility level, so the
operator starts from the same experiments and only its sight of them differs.

## The sweep, one replicate each

Blocked or reviewed, by round:

| setting | q | r0 | r1 | r2 | r3 | r4 | r5 | fall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| blocks_only | 0.00 | 0.9631 | 0.9557 | 0.9544 | 0.9460 | 0.9331 | 0.9283 | 0.0348 |
| partial_25 | 0.25 | 0.9631 | 0.9557 | 0.9663 | 0.9349 | 0.9181 | 0.9042 | 0.0589 |
| partial_50 | 0.50 | 0.9631 | 0.9557 | 0.9631 | 0.9390 | 0.8973 | 0.9042 | 0.0589 |
| partial_75 | 0.75 | 0.9631 | 0.9557 | 0.9544 | 0.9390 | 0.9171 | 0.8665 | 0.0966 |
| full | 1.00 | 0.9631 | 0.9557 | 0.9551 | 0.9301 | 0.9191 | 0.8918 | 0.0713 |

Blocking goes to zero in every setting, as before.

The trend is upward with q and it is not clean: `partial_75` eroded more than
`full`, and `partial_25` and `partial_50` finished identically. On one replicate
the spread between settings is about the size of the noise, so there is no
threshold in q to report and it would have been wrong to claim one.

## Three replicates of the two settings that decide it

`blocks_only` and `full`, three replicates each, same 100 worlds a round.

| setting | r0 | r1 | r2 | r3 | r4 | r5 | fall | sd at r5 | the three replicates |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| blocks_only | 0.9631 | 0.9507 | 0.9544 | 0.9481 | 0.9205 | **0.9222** | 0.0409 | 0.0094 | 0.9283, 0.9295, 0.9089 |
| full | 0.9631 | 0.9507 | 0.9542 | 0.9258 | 0.9038 | **0.8867** | 0.0764 | 0.0065 | 0.8918, 0.8907, 0.8775 |

The two do not overlap. The worst `blocks_only` replicate finished at 0.9089 and
the best `full` replicate at 0.8918. Three replicates were enough to separate
them and one was not.

**So: the queue holds under full visibility.** It erodes about twice as fast,
0.0764 against 0.0409 over five rounds, and it ends at 0.8867 rather than
collapsing.

## Visibility changes which knob the operator finds

This is the part that is reproducible and large. Across three replicates,
counting every move made:

| setting | accounts per drop | signup window | device reuse | camouflage |
| --- | --- | --- | --- | --- |
| blocks_only | 1 | 5 | 0 | 0 |
| full | **6** | 3 | 2 | 1 |

The blocks-only operator goes for signup timing almost every time. The
full-visibility operator goes for address rotation almost every time, and in two
replicates it drove drop sharing all the way to one account per address, its
evasive limit.

So visibility does matter, and it matters in the direction we guessed. Address
rotation is what the detection curve says defeats this system, and only the
operator that can see reviews reliably finds it.

It finds it, moves it to the limit, and the queue still holds at 0.8867.

## Why it holds, measured rather than argued

The first explanation was that the operator would need to move devices and
addresses together, and that a rule changing one thing per round never does.
That was tested and it is wrong.

Eight fixed configurations, no adaptation, 100 worlds each, everything not named
left at the ordinary settings:

| configuration | blocked | blocked or reviewed | change |
| --- | --- | --- | --- |
| ordinary | 0.1354 | 0.9631 | |
| addresses rotated only | 0.0000 | 0.9383 | -0.0248 |
| devices rotated only | 0.1514 | 0.9568 | -0.0064 |
| **both rotated** | 0.0000 | **0.9145** | -0.0486 |
| signups spread only | 0.0000 | 0.9277 | -0.0354 |
| values jittered only | 0.0000 | 0.9717 | +0.0085 |
| camouflage only | 0.0000 | 0.9405 | -0.0226 |
| **everything at its limit** | 0.0000 | **0.5701** | **-0.3930** |

Devices and addresses both rotated costs the detector 4.9 points of recall, not
a collapse. So that explanation fails.

The five single-knob effects sum to **-0.0807**. All five together cost
**-0.3930**, which is **4.9 times the sum of the parts**. The evasion is
strongly superadditive. No knob and no pair gets you anywhere. Every knob at
once gets you most of the way.

`values jittered only` moves the wrong way, by +0.0085. Spreading order values
on its own makes the operator very slightly easier to catch.

The last row is the adaptive tier. It reads 0.5701 here and 0.5669 on the sealed
holdout, so this is the same destination by another route.

## What this actually means

The destination exists and the operator does not reach it. It is not blocked
from reaching it by the design of the queue or by what it can see. It fails to
reach it because it changes one thing at a time and keeps it, and the payoff for
any single change is small enough to look like noise while the payoff for all
five is large.

That is a **search failure by the attacker**, not a property of the defence.
It is a much weaker guarantee than either of the readings we might have
preferred:

- It is not robust because it is invisible. Full visibility erodes it about
  twice as fast and still leaves it at 0.8867, and blindness was never what was
  protecting it.
- It is not structurally robust either. A configuration that takes it to 0.5701
  exists, is reachable with the five knobs the operator already has, and is the
  tier we already report as the one where this system blocks nothing.

An operator that changed several parameters at once, or ran a coarse grid rather
than a greedy hill climb, would find it. Our operator does neither. It would take
a slightly better attacker, not a fundamentally different one.

## Known limitations of this experiment

**Greedy hill climbing is a weak attacker.** One parameter per round, a fixed
step of 30% of range, and no memory of what it tried before. A random search over
the five-dimensional box would probably find the corner faster.

**Six rounds is short.** The operator did reach the corner in no replicate. With
twenty rounds and a rule that occasionally moves two things, it might.

**The visibility model is a single number.** A real operator's signal is
delayed, not just probabilistic. It learns weeks later, which changes which round
the information arrives in, and none of that is modelled.

**Only two settings got replicates.** `partial_25` through `partial_75` have one
run each, which is why no threshold in q is claimed. The one-replicate ordering
between them is not stable and is reported as noise rather than smoothed.
