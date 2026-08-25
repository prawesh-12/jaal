# What Jaal is

Written for someone who knows nothing about this project.

## The problem

A merchant offers Rs.200 off your first order. It works: new customers arrive.

Then one person creates fifty accounts and claims the coupon fifty times.

Here is what makes that hard to catch. Each of those fifty accounts places one
perfectly ordinary order. The payment succeeds. The goods are delivered. Nothing
is stolen and no card is fraudulent. If you look at any single transaction you
see a normal first-time customer, because in isolation that is exactly what it
is.

The fraud is not inside any transaction. It is in the fact that fifty of them
belong to the same person.

## What Jaal does about it

Stop scoring transactions. Score relationships.

Instead of asking "is this payment suspicious", ask "how much evidence is there
that these two accounts are run by the same person", across every pair worth
checking. Then find the groups that evidence forms, and judge the groups.

The whole pipeline is seven steps:

1. **Block.** Cut 72 million possible account pairs down to about 32,000 worth
   scoring.
2. **Link.** Score each pair by how much evidence, in bits, says the two share
   an operator.
3. **Cluster.** Cut the resulting graph into groups.
4. **Feature.** Turn each group into 25 numbers.
5. **Score.** Produce a calibrated probability, so 0.80 really means 80%.
6. **Decide.** Block, allow, or send to a human, whichever loses fewest rupees.
7. **Explain.** Write a reason a reviewer can act on in ten seconds.

The unit of detection is never the transaction. It is the cluster.

## The one number that shapes everything

Missing a promo abuser costs Rs.200, one coupon.
Wrongly blocking a real customer costs Rs.15,000, their lifetime value.

That is 75 to 1, and it changes what a good detector looks like. Blocking a
group only pays if you are right about it **98.7%** of the time. A detector with
92% precision and 91% recall, which sounds excellent, loses Rs.24.6 million on
this data. That is why Jaal has three actions rather than two, and why "send
this to a person" is often its most valuable output.

## What it does not do

- **Not real time.** It is a batch job over an account population.
- **Not a general fraud detector.** One loss class. Not chargebacks, not returns
  abuse, not stolen cards.
- **Not identity attribution.** It says "these accounts appear to share an
  operator". It never claims to identify a person.
- **Not an autonomous blocker.** Given the cost asymmetry, its highest-value
  output is frequently a review queue.
- **Not trained on real data.** Everything is synthetic, by necessity. Real
  promo abuse is unlabelled, so there is no other way to measure a detector
  against a known answer.

## Where it stops working

This is the part worth reading twice.

Jaal is measured against a generator with a dial on it: how careful is the
operator? At one end they use one phone, sign up in an hour, and order identical
amounts. At the other they rotate every device, use a different address for every
account, spread signups over six weeks, and have a few accounts behave like real
customers as camouflage.

The results are reported per setting of that dial, never averaged, because the
average hides the only interesting thing: where the system stops working.

## Reading order

1. This file
2. `docs/01-architecture.md`, how the pieces fit
3. `docs/diagrams/L2-pipeline.md`, the seven stages
4. `docs/phases/`, one document per phase, in order
5. `docs/03-glossary.md` when a word is unfamiliar
