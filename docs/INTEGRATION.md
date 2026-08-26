# Integrating Jaal

Jaal finds groups of accounts run by one person farming a merchant's first-order
promo discount. It works on the **cluster**, never the transaction, because no
single order in a fifty-account ring looks wrong.

This page is the contract. It says exactly what you send, what comes back, what
each field is worth, and what happens when you cannot send one of them. Every
number here came out of a run and can be rebuilt offline with `./run.sh`.

Defence only. All data in this project is synthetic.

---

## The short version

1. You send a batch of account records, twelve columns.
2. Five of those twelve can be a salted hash. We never need the real value.
3. You get back one decision per cluster: **block**, **review** or **allow**,
   each priced in rupees, each with a sentence saying why.
4. If you cannot send all twelve, `POST /v1/coverage` tells you what you lose
   before you write any code.

---

## What you send

One row per account.

| column | type | what it is | can be hashed |
| --- | --- | --- | --- |
| `account_id` | string | your identifier, returned untouched | no, it is the key |
| `device_id` | string | device fingerprint | **yes** |
| `address_id` | string | delivery address, normalised by you | **yes** |
| `pincode` | string | postcode | **yes** |
| `card_bin` | string | first six of the card | **yes** |
| `ip_prefix` | string | first three octets | **yes** |
| `signup_ts` | int | unix seconds, when the account was created | no, it is compared as a gap |
| `n_orders` | int | orders placed so far | no |
| `coupon_used` | bool | did this account claim the first-order promo | no |
| `first_order_value` | int | rupees, integer | no |
| `total_order_value` | int | rupees, integer | no |
| `days_to_second_order` | int | -1 if there was never a second order | no |

Money is an integer number of rupees throughout. Float drift on currency looks
exactly like a real discrepancy.

`GET /v1/schema` returns this list, so a client can check itself.

---

## You never send a raw identifier

The five hashable columns are **only ever tested for equality**. The pair scorer
asks whether two accounts agree on a device, not what the device was. The
blocking rules group on the value. The cluster features count distinct values.
Nothing anywhere reads the value itself.

So salt them per tenant and hash them, and the pipeline cannot tell:

```python
from detector.profiles import hash_identifiers

payload = hash_identifiers(accounts, salt="tenant-7c1f")
```

This is asserted, not claimed. `tests/test_hashing.py` runs a real world through
both paths and checks that:

- blocking produces the **same candidate pairs**
- pair scores and the per-field breakdown are **identical arrays**
- clustering returns the **same clusters**
- every cluster feature comes out **equal, column for column**
- two different salts produce different digests, so tenants cannot be joined

What this does and does not buy you. It means Jaal never holds a raw device ID
or address. It does not make the data anonymous: a salted digest is still a
pseudonymous identifier, and under the DPDP Act it is still personal data. It
changes the conversation from "send us your customer database" to "send us
one-way digests", which is a different review, not the absence of one.

---

## What each field is worth

A pair of accounts starts at the prior odds of sharing an operator, about **one
in 53,544**. Every field they agree on adds evidence, measured as
`log2(m / u)`: how much more often a real match agrees than two strangers do.

| comparison | best level | bits |
| --- | --- | --- |
| `device` | exact | **+14.83** |
| `signup_gap` | within 1 hour | **+12.51** |
| `address` | exact | **+11.93** |
| `pincode` | exact | +3.78 |
| `card_bin` | exact | +3.09 |
| `hour_of_day` | within 1 hour | +2.24 |
| `coupon_used` | both used | +1.70 |
| `order_count` | both one order | +0.15 |
| `ip_prefix` | exact | +0.12 |

From `results/link_params.json`, estimated without labels on training seeds.
Disagreement carries negative weight and is not shown. An edge is drawn at
**14 bits**.

Two things worth reading off that table. `ip_prefix` is worth 0.12 bits, which
is nothing, so do not spend engineering time on it. And the top three are worth
more than the other six put together.

`order_value` and `coupon_floor` are computed but not scored. Both punish a ring
for varying its order values, and dropping them lifted pair recall on the
hardest tier from 0.14 to 0.50.

---

## Blocking is a ceiling, and it is not the fields you would guess

Before anything is scored, six rules decide which pairs are worth comparing at
all. A true pair no rule produces can never be recovered later.

| rule | obvious | moderate | sophisticated | adaptive |
| --- | --- | --- | --- | --- |
| `device` | 1.0000 | 0.3449 | 0.0115 | 0.0000 |
| `address` | 0.7070 | 0.2977 | 0.1150 | 0.0000 |
| `pin_bin` | 0.6877 | 0.7832 | 0.7036 | **0.8188** |
| `pin_month` | 1.0000 | 0.9590 | 0.6975 | 0.5144 |
| `pin_month_shift` | 1.0000 | 0.9882 | 0.8280 | 0.5108 |
| `bin_week` | 0.7172 | 0.6426 | 0.2094 | 0.1178 |
| **all six together** | 1.0000 | 1.0000 | 0.9949 | 0.9528 |

Device is perfect against a careless operator and worth exactly nothing against
a careful one, because a careful operator gives every account its own phone.
Address goes the same way. The rule that holds is `pin_bin`, pincode paired with
card BIN, at 0.8188 on the hardest tier.

This is the argument for asking a merchant for a delivery pincode even though
pincode agreement is only worth 3.78 bits on its own. Its value is in blocking,
not in scoring.

---

## What happens when you cannot send a column

TODO: not yet measured. `python -m detector.ablate` is running now. It rebuilds
the whole pipeline once per column set, on validation seeds, and writes
`results/field_ablation.json`. This section is filled from that file and from
nowhere else.

<!-- ABLATION -->

---

## Where this runs

**Cluster discovery is a batch job.** Leiden runs over the whole account graph.
It cannot score one signup inline in 40ms and nothing here pretends otherwise.
Run it nightly or hourly over the population and it produces a queue.

**Cluster assignment can be online.** Attaching a new account to a cluster that
already exists is blocking plus pair scoring, with no graph partition, and that
part is fast.

Do not put Jaal in a checkout path. It is a triage layer that fills a review
queue, not a gate.

---

## The three prices are yours, not ours

Every rupee figure in this project rests on three numbers, and all three belong
to your finance team:

| what | this project uses | where |
| --- | --- | --- |
| blocking a real customer | Rs.15,000 | `config.COST_BLOCKED_INNOCENT` |
| missing an abuser | Rs.200 | `config.COST_MISSED_ABUSER` |
| one analyst review | Rs.150 | `config.COST_ANALYST_REVIEW` |

They decide everything. At these three, blocking only pays above **98.68%**
precision, which is why there is a third action at all. `docs/METRICS.md` has
the sensitivity across every cost ratio from 10:1 to 200:1, and three actions
pay at all of them.

---

## Calling it

```
GET  /                what routes exist
GET  /health          is the model loaded
GET  /v1/schema       columns to send, features, prices
GET  /v1/profiles     every column set and what it is measured to reach
POST /v1/coverage     your column names in, what you would get out
POST /v1/scan         a batch of accounts in, priced decisions out
POST /v1/score        one cluster whose features you already computed
GET  /features        the cluster features the model reads
GET  /runs/<id>       a saved result file, for example /runs/holdout
```

Start with coverage. It needs no account data at all:

```bash
curl -s localhost:5001/v1/coverage -X POST -H 'content-type: application/json' \
  -d '{"columns": ["account_id","device_id","ip_prefix","card_bin",
                   "n_orders","first_order_value","total_order_value",
                   "days_to_second_order"]}'
```

Then a real batch:

```bash
curl -s localhost:5001/v1/scan -X POST -H 'content-type: application/json' \
  -d '{"accounts": [ ... ], "include_allowed": false}'
```

Each returned cluster carries the accounts, a calibrated probability, a
predicted ring purity, the action, the expected cost of each action in rupees,
the strongest signal, and a sentence a human can read.

Batches are capped at 20,000 accounts. Send a bigger population in slices, or
call the pipeline directly:

```python
from detector.pipeline import Detector
result = Detector.load().scan(accounts_dataframe)
```

---

## What this does not promise

- **It does not block much.** On the sealed holdout it blocks 16.77% of ring
  accounts on its own and reaches 85.85% once a human works the queue. On the
  hardest tier it blocks nothing at all. The product is the queue.
- **The model does not transfer.** It is fitted on a generator at 0.8%
  prevalence. Anyone shipping these weights to a real merchant is guessing.
  What transfers is the method, and the label bootstrap: seeding from a
  high-precision rule, here a device shared by six or more accounts, gave
  99.32% pure seed pairs to learn from without a single label.
- **`u` is per population.** How often two strangers share a pincode is a fact
  about your customers, not about ours. Re-estimate it on your data.
- **No fuzzy matching.** Every comparison is exact or a numeric band. A typo in
  an address is a miss.
- **The adversary here is one-sided.** Our operator adapts; the detector does
  not adapt back.
