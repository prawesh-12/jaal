
# Jaal

## Building an AI risk manager that finds the fraud between transactions, not inside them

*One hand, fifty accounts.*

**Razorpay Buildathon 2026, Track 02 (AI Risk Manager)**
Full implementation manual

*Jaal* (जाल) means both **net** and **web** in Hindi. This project is both: a
graph of hidden connections between accounts, and the net that catches what is
moving inside it.

Defence-only. Fully synthetic data. Test harness.

---

## Contents

**Part I: Framing**

- [1. Problem statement](#1-problem-statement)
  - [1.1 Formal statement](#11-formal-statement)
  - [1.2 Why the standard formulation does not apply](#12-why-the-standard-formulation-does-not-apply)
  - [1.3 Decomposition into sub-problems](#13-decomposition-into-sub-problems)
  - [1.4 Complexity constraints](#14-complexity-constraints)
  - [1.5 Why the problem is hard](#15-why-the-problem-is-hard)
  - [1.6 Evaluation protocol](#16-evaluation-protocol)
  - [1.7 Data strategy and sources](#17-data-strategy-and-sources)
- [2. Tech stack](#2-tech-stack)
  - [2.1 Detection pipeline](#21-detection-pipeline-this-is-what-gets-scored)
  - [2.2 Presentation layer](#22-presentation-layer-not-scored-2-days-maximum)
  - [2.3 Install](#23-install)
  - [2.4 Two non-obvious choices](#24-two-non-obvious-choices-stated-up-front)
  - [2.5 Deliberate omissions](#25-deliberate-omissions)
  - [2.6 Why no deep model](#26-why-no-deep-model)
- [3. What this project is](#3-what-this-project-is)
- [4. The problem in context](#4-the-problem-in-context)
- [5. What Jaal does about it](#5-what-jaal-does-about-it)
- [6. How this maps to the Track 02 bar](#6-how-this-maps-to-the-track-02-bar)
- [7. How to use this document](#7-how-to-use-this-document)

**Part II: Build**

| Phase                                           | Title                              | Days | What it produces                                      |
| ----------------------------------------------- | ---------------------------------- | ---- | ----------------------------------------------------- |
| [0](#phase-0-foundation-reset)                   | Foundation reset                   | 1    | Honest dataset, 4 adversary tiers, sealed holdout     |
| [1](#phase-1-the-honest-baseline)                | The honest baseline                | 1    | Rules-only detector, cost model, frozen reference     |
| [2](#phase-2-probabilistic-linking)              | Probabilistic linking              | 4    | Fellegi-Sunter pair scoring, blocking, match weights  |
| [3](#phase-3-community-detection)                | Community detection                | 1    | Leiden clusters, Louvain failure count                |
| [4](#phase-4-group-features)                     | Group features                     | 1    | ~15 features per cluster, leakage audit               |
| [5](#phase-5-model-and-calibration)              | Model and calibration              | 2    | Calibrated classifier, PR curves, reliability diagram |
| [6](#phase-6-cost-optimal-decisions)             | Cost-optimal decisions             | 1    | Cost curve, threshold, sensitivity table              |
| [7](#phase-7-holdout-and-adversarial-evaluation) | Holdout and adversarial evaluation | 1    | Sealed results, detection curve, failure catalogue    |
| [8](#phase-8-explanation-layer)                  | Explanation layer                  | 0.5  | Cached human-readable review notes                    |
| [9](#phase-9-interface-and-packaging)            | Interface and packaging            | 1    | README, run.sh, Flask, React dashboard                |
| [10](#phase-10-submission)                       | Submission                         | 1    | Video, architecture diagram, final checks             |

**Phase 2 detail** (the technical core)

- [2A. The idea in plain English](#2a-the-idea-in-plain-english)
- [2B. Term frequency adjustment](#2b-term-frequency-adjustment-the-part-that-actually-beats-hand-tuning)
- [2C. Estimating m and u without labels](#2c-estimating-m-and-u-without-labels)
- [2D. Blocking: making it computable](#2d-blocking-making-it-computable)
- [2E. Step by step](#2e-step-by-step)

**Part III: Reference**

- [Cut order](#cut-order)
- [Day map](#day-map)
- [Anti-patterns](#anti-patterns)
- [All references](#all-references)

### If you only read four things

1. [1.2](#12-why-the-standard-formulation-does-not-apply), why per-transaction fraud models cannot solve this
2. [Phase 2](#phase-2-probabilistic-linking), the linkage method, four of fifteen days
3. [Phase 6](#phase-6-cost-optimal-decisions), why the F1-optimal threshold loses money
4. [Cut order](#cut-order), what to drop if you fall behind

---

# 1. Problem statement

## 1.1 Formal statement

**Given** a set of accounts `A = {a₁, a₂, ..., aₙ}` on a merchant platform,
where each account `aᵢ` carries an observable attribute vector:

```
aᵢ = ⟨ device_id, address_id, card_bin, signup_time,
        order_history, coupon_used, order_values ⟩
```

**There exists** an unobserved partition `O : A → Ops` mapping each account to
the real-world operator controlling it. For legitimate users, `|O⁻¹(op)| = 1`.
For an abuse ring, `|O⁻¹(op)| = k` where `k` is typically 8 to 50.

**Let** `C* ⊆ 2^A` be the set of operator-clusters that are abusive, meaning the
operator created multiple accounts for the purpose of repeatedly claiming a
single-use promotional discount.

**Find** `Ĉ ⊆ 2^A`, an estimate of `C*`, minimising expected monetary loss:

```
L(Ĉ) = c_FN · |{a : a ∈ C*, a ∉ Ĉ}|  +  c_FP · |{a : a ∈ Ĉ, a ∉ C*}|
```

subject to the operating constraints:

```
π    = P(a ∈ C*)        ≈ 0.008        (class prior, ring prevalence)
c_FN = coupon value      ≈ Rs.200       (cost of a missed abuser)
c_FP = customer LTV      ≈ Rs.15,000    (cost of a blocked innocent)
c_FP / c_FN              ≈ 75           (cost asymmetry)
```

The system may also abstain, emitting `a ∈ R` (review queue) at cost `c_R ≈ Rs.150` per account, so the action space is `{block, allow, review}` rather than
binary.

---

## 1.2 Why the standard formulation does not apply

Conventional fraud detection is **per-record binary classification**:

```
f : aᵢ → {0, 1}
```

This formulation fails here, and the reason is structural rather than a matter of
model capacity.

For any single account `aᵢ`, the marginal distribution of the label is
approximately uninformative:

```
P(abusive | aᵢ)  ≈  P(abusive)  =  π
```

A ring account and a legitimate first-time account are **marginally
indistinguishable**. Both sign up once, order once, use the coupon as intended,
pay successfully, and receive goods. No feature of `aᵢ` alone separates the
classes, because in isolation a ring account genuinely *is* an ordinary
first-time customer.

The signal exists only in the **joint distribution over pairs**:

```
P(O(aᵢ) = O(aⱼ) | aᵢ, aⱼ)  ≫  P(O(aᵢ) = O(aⱼ))
```

when `aᵢ` and `aⱼ` belong to the same ring. The discriminative information lives
in the relation, not in the record.

**Consequence:** no per-transaction scorer, regardless of training scale or
architecture, can solve this. The problem must be reformulated from
classification over records to **clustering over an evidence graph**, followed by
classification over clusters.

---

## 1.3 Decomposition into sub-problems

The reformulation yields four sequential sub-problems:

| # | Sub-problem                      | Formal task                                                                             | Field                             |
| - | -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| 1 | **Candidate generation**   | Select`P ⊂ A × A` with `\|P\| ≪ \|A\|²` while retaining most true co-operator pairs | Blocking                          |
| 2 | **Pairwise linkage**       | Estimate`P(O(aᵢ) = O(aⱼ) \| aᵢ, aⱼ)` for each `(aᵢ, aⱼ) ∈ P`                  | Record linkage (Fellegi-Sunter)   |
| 3 | **Partitioning**           | Recover clusters from the weighted graph`G = (A, P, w)`                               | Community detection (Leiden)      |
| 4 | **Cluster classification** | Estimate`P(C ∈ C* \| φ(C))` for cluster feature map `φ`                           | Supervised learning + calibration |
| 5 | **Decision**               | Select`action ∈ {block, allow, review}` minimising expected `L`                    | Cost-sensitive decision theory    |

Sub-problem 2 is the technical core. If it fails, sub-problem 3 receives an empty
or disconnected graph and everything downstream is vacuous regardless of quality.

---

## 1.4 Complexity constraints

**Pair enumeration is quadratic.** For `n` accounts the full comparison space is:

```
|A × A| = n(n-1)/2
```

| n       | pairs       |
| ------- | ----------- |
| 1,500   | 1.1 × 10⁶ |
| 12,000  | 7.2 × 10⁷ |
| 100,000 | 5.0 × 10⁹ |

Exhaustive scoring is infeasible beyond toy sizes. Blocking reduces the candidate
set by imposing agreement on coarse keys, at the cost of a **hard recall
ceiling**: any true pair not generated by a blocking rule is permanently
unrecoverable. Blocking recall must therefore be measured and reported, not
assumed.

**Cluster classification is cheap.** Once clusters exist, `|Ĉ|` is on the order
of hundreds, so this stage is computationally trivial. The expense is entirely in
sub-problems 1 to 3.

---

## 1.5 Why the problem is hard

Five properties, each of which invalidates a standard approach:

**(a) Marginal indistinguishability.** Established in 1.2. The unit at which the
data is naturally observed is not the unit at which the signal exists.

**(b) Benign structural collisions.** Legitimate populations exhibit the same
attribute-sharing structure as rings:

```
family    : shares device ∧ address ∧ card,  span ~years
flatmates : shares address,                  span ~months
hostel    : shares address ∧ network,        n ~20-60
office    : shares address,                  span ~days   ← collides with rings
```

The `office` case is structurally isomorphic to a ring on every static attribute.
Separation requires temporal and behavioural features (order recurrence), not
structural ones.

**(c) Severe class imbalance.** With `π ≈ 0.008`, accuracy is degenerate: the
trivial classifier `f(a) = 0` achieves 99.2%. ROC-AUC is also misleading, since
it is dominated by the true-negative mass. PR-AUC is the appropriate metric, and
its baseline equals `π`, so results must always be reported alongside prevalence.

**(d) Cost asymmetry inverts the objective.** With `c_FP / c_FN ≈ 75`, the
F1-optimal operating point is **not** loss-optimal. A detector achieving high
recall can satisfy `L(Ĉ) > L(∅)`, that is, perform worse than deploying nothing.
Threshold selection must therefore be driven by `L`, which requires the
classifier output to be a **calibrated probability** rather than a ranking score.

**(e) Adversarial and unlabelled.** The attribute-sharing rate is under operator
control: device reuse, signup dispersion and value jitter are all parameters the
adversary can vary. Simultaneously, `O` is unobservable in deployment, so no
production ground truth exists. Evaluation must therefore be conducted against a
synthetic oracle with **parameterised adversary sophistication**, and performance
reported as a function of that parameter rather than as a scalar.

---

## 1.6 Evaluation protocol

Because `C*` is unobservable in the real world, evaluation uses a generator that
emits `(A, C*)` pairs with a hidden answer key.

**Metrics reported**, per adversary sophistication tier:

```
PR-AUC              with the π baseline stated alongside
precision, recall   at the selected operating point
Brier score         calibration quality, before and after
L(Ĉ)                expected loss in rupees
L(∅)                loss from deploying nothing (reference floor)
FP rate             measured separately on a rings-free lookalike population
```

**Protocol constraints:**

1. Train/test splits partition on **generator seed**, not on row, to prevent
   leakage of world-level artefacts across the boundary.
2. Seeds 900-999 are sealed prior to development and evaluated exactly once.
3. All metrics are reported per tier. Aggregation across tiers is prohibited,
   since it conceals the sophistication threshold at which detection fails.
4. A rules-only baseline is published and all model results reported as a delta
   against it.

**The primary result is not a scalar.** It is the curve of recall against
adversary sophistication, which identifies the operating regime in which the
system is effective and, equally, the regime in which it is not.

## 1.7 Data strategy and sources

### Why no public dataset can be the primary source

The evaluation in 1.6 requires the true operator partition `O` to be known. Real
promo abuse is unlabelled, which is precisely why the problem is open. No public
dataset carries operator identity, so none can serve as the evaluation oracle.

The primary data source is therefore a **generator** that emits `(A, C*)` pairs
with a hidden answer key. This is a deliberate design decision, not a
convenience.

Public data still has two legitimate roles: grounding the generator's
distributions in reality, and positioning the work against existing benchmarks.

### Three-tier data strategy

| Tier                  | Source                     | Role                                                                   |
| --------------------- | -------------------------- | ---------------------------------------------------------------------- |
| **Primary**     | `generate_accounts.py`   | Evaluation oracle. Provides`C*`. All metrics computed here.          |
| **Calibration** | Olist Brazilian E-Commerce | Grounds order-value, repeat-rate and timing distributions in real data |
| **Positioning** | GADBench, TravelFraudBench | Related work. Cited, not trained on.                                   |

### Calibration dataset (required, used in Phase 0)

**Brazilian E-Commerce Public Dataset by Olist**
https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce

100,000 anonymised orders from 2016 to 2018 across Brazilian marketplaces, with
order status, pricing, payment, customer location, product attributes and
reviews. Real commercial data, anonymised at source.

SQLite mirror if preferred for querying:
https://www.kaggle.com/datasets/terencicp/e-commerce-dataset-by-olist-as-an-sqlite-database

Three distributions are extracted and used to replace arbitrary constants in the
generator:

| Extracted from Olist                             | Replaces                         |
| ------------------------------------------------ | -------------------------------- |
| `order_items.price` distribution               | uniform order-value ranges       |
| repeat rate (`customers` joined to `orders`) | assumed`repeat_rate`           |
| `order_purchase_timestamp` hour histogram      | uniform signup-hour distribution |

Only the extracted distributions are committed to the repository, as a small
JSON file. The raw dataset is not vendored, and `run.sh` requires no network
access.

**Licence note.** Olist data is distributed under CC BY-NC-SA 4.0. Derived
distribution parameters are used for calibration only, with attribution in the
README.

### Positioning datasets (cited, not used)

| Dataset          | Link                                | Why it cannot substitute                                                                       |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| GADBench         | https://arxiv.org/html/2306.12251v1 | Standard packaging of graph anomaly benchmarks with fixed splits                               |
| YelpChi          | via GADBench                        | Labels derive from Yelp's own filter at ~90% accuracy, so not true ground truth                |
| Amazon-Fraud     | via GADBench                        | ~1.4k user nodes. Review spam, not promo abuse. Too small.                                     |
| Elliptic         | https://arxiv.org/abs/1908.02591    | 203,769 nodes, but nodes are Bitcoin transactions. No account or operator identity.            |
| DGraph-Fin       | https://arxiv.org/pdf/2207.03579    | 3.7M nodes, loan default task. Anomalous nodes share near-identical features with normal ones. |
| TravelFraudBench | https://arxiv.org/abs/2604.21093    | Closest in intent. Configurable ring topologies, travel domain.                                |

TravelFraudBench states the gap directly: existing GNN fraud benchmarks
(YelpChi, Amazon-Fraud, Elliptic, PaySim) cover single node types, single edge
relations, or domain-generic patterns, and provide no mechanism to evaluate
detection capability across structurally distinct fraud ring topologies. Jaal
addresses the same gap for promo abuse in a payments context, with a
parameterised adversary rather than a fixed one.

### Explicitly rejected

**IEEE-CIS Fraud Detection** and the **ULB Credit Card Fraud** dataset are the
two most commonly reached for on Kaggle. Both are transaction-level with
anonymised features, no account identity and no relational structure. There is
no graph to construct from either. Per 1.2, they cannot represent this problem
at any scale.

---

# 2. Tech stack

Chosen to serve the evaluation bar in 1.6, not to look impressive. Nine
dependencies total. Every omission below is a deliberate decision with a reason
attached, because defending an omission well signals more judgement than adding
a dependency.

## 2.1 Detection pipeline (this is what gets scored)

| Layer        | Choice                                                                     | Why this one                                                           |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Language     | **Python 3.11+** (use uv in this project instead of pip)                                                     | Every library below exists properly only here                          |
| Data         | **pandas, numpy**                                                    | Tabular handling, integer-safe arithmetic                              |
| Graph        | **networkx**                                                         | Standard, readable, adequate at this scale (~12k nodes in memory)      |
| Clustering   | **python-louvain** / **leidenalg**                             | Weighted community detection. Leiden is the default, see 2.4.          |
| Model        | **scikit-learn**                                                     | RandomForest or GradientBoosting. 2,500 rows and 15 columns.           |
| Calibration  | **sklearn.calibration.CalibratedClassifierCV**                       | Platt and isotonic, plus reliability curves. Load-bearing, see 1.5(d). |
| Metrics      | **sklearn.metrics** + custom cost function                           | PR-AUC, Brier, plus`L(Ĉ)` in rupees                                 |
| Explanations | **gpt-oss:120b-cloud** via **Ollama Cloud**, `ollama` client | Templated sentence generation only. No detection.                      |
| Cache        | plain JSON on disk, committed                                              | Makes explanations reproducible without an API key                     |
| Tests        | **pytest**                                                           | ~10 tests: cost function, seed split, leakage audit                    |

## 2.2 Presentation layer (not scored, 2 days maximum)

| Layer     | Choice                                        | Note                                                     |
| --------- | --------------------------------------------- | -------------------------------------------------------- |
| API       | **Flask**, 2 endpoints                  | `POST /score`, `GET /runs/{id}`. Thin. Phase 9 only. |
| Frontend  | **React + Vite + Tailwind**             | Vite rather than Next.js. No routing or SSR needed.      |
| Charts    | **Recharts**                            | PR curve, cost curve, reliability diagram                |
| Data flow | Python writes`results.json`, React reads it | No server required for the demo to work                  |

## 2.3 Install

```bash
pip install pandas numpy networkx python-louvain leidenalg \
            scikit-learn ollama pytest
npm create vite@latest ui -- --template react
export OLLAMA_API_KEY=your_key
```

If you find yourself reaching for a tenth Python dependency, stop and ask what it
buys against the bar in 1.6.

## 2.4 Two non-obvious choices, stated up front

**Leiden rather than Louvain.** Louvain can produce arbitrarily badly connected
communities, and internally disconnected ones in the worst case. For this problem
a disconnected "ring" is not a ring, it is two unrelated clumps glued together,
and reporting one as a detection is indefensible under inspection. Leiden
guarantees connected communities by construction. Both are run, and Louvain's
disconnected-community count is reported. Detail in Phase 3.

**A small instruct model rather than a large reasoning model.** The explanation
task is turning ~15 numbers into two sentences. It requires no reasoning depth.
`gpt-oss:120b` does it faster and cheaper than a frontier reasoning model, and
choosing the smallest model that does the job well is itself the judgement this
track is testing. Detail in Phase 8.

## 2.5 Deliberate omissions

These will appear in other submissions. Each is left out on purpose.

| Not used                      | Reason                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XGBoost / LightGBM            | 2,500 rows, 15 features. Identical outcome to sklearn, one more dependency.                                                                                               |
| PyTorch / GNNs / transformers | See 2.6. Wrong stage, wrong data scale.                                                                                                                                   |
| Neo4j                         | A graph database for 12,000 nodes. networkx holds it in memory instantly.                                                                                                 |
| Splink                        | Fellegi-Sunter is implemented from scratch so the per-field match-weight breakdown stays visible for the explanation layer, and so the method is defensible in interview. |
| Docker                        | Nothing to deploy. Adds a failure mode on a judge's machine.                                                                                                              |
| Postgres                      | Data is generated. JSON files suffice.                                                                                                                                    |
| LangChain                     | One LLM call. Import the client directly.                                                                                                                                 |
| Vector DB                     | Nothing to embed.                                                                                                                                                         |

## 2.6 Why no deep model

Worth stating explicitly, because it is the obvious question.

The binding constraint in this pipeline is **sub-problem 2 (linkage)**, not
sub-problem 4 (cluster classification). Exact matching recovers zero rings under
device rotation, and a stronger classifier at stage 4 changes how clusters are
scored that were never constructed. Capacity is not where the bottleneck is.

Second, the training data is generated from a parameterised process with roughly
20 free parameters. Generating more worlds yields more samples but almost no new
information. A high-capacity model given that data will learn to invert the
generator, scoring well on held-out seeds while failing on any real pattern not
encoded in it. Limited model capacity is protection here, not a limitation.

Third, calibration. Neural networks are systematically overconfident and poorly
calibrated. Since threshold selection depends entirely on `p` being a genuine
probability (1.5(d)), a deep model makes the hardest requirement harder.

Fourth, explainability. Fellegi-Sunter produces per-field match weights in bits,
which are the actual computation rather than a post-hoc rationalisation. That
feeds the review note in Phase 8 directly.

**What is done instead:** a small MLP is trained on the same features alongside
the forest in Phase 5, and both are reported. If the forest wins at this data
scale, that is a measured result about where the constraint lies, not an
omission.

**Where a deep model would belong:** a graph transformer replacing sub-problems 2
and 3 jointly, learning linkage and partitioning end to end. That requires real
labelled ring data, which does not exist publicly (1.7). Recorded as future work.

---

# 3. What this project is

### In one sentence

Jaal finds **groups of accounts secretly controlled by one person** who is
farming a merchant's first-order discount, and it reports honestly how often it
is right, how often it is wrong, and what being wrong costs in rupees.

### What kind of project

| Aspect            | What it is                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Category          | Risk detection and measurement system                                                            |
| Shape             | Detector (not verifier, not auto-responder)                                                      |
| Mode              | Batch analytics pipeline, not a real-time service                                                |
| Unit of detection | The account**cluster**, not the transaction                                                |
| Core technique    | Probabilistic record linkage plus graph community detection                                      |
| ML role           | One calibrated classifier, scoring groups (not a deep model)                                     |
| Output            | Flagged clusters, each with a confidence, an evidence breakdown, and a costed recommended action |
| Data              | Fully synthetic, generated with a hidden answer key                                              |

It is as much a **measurement** project as a detection project. Anyone can write
something that flags accounts. The hard and scarce part is proving whether the
flags are correct and what they cost when they are not. That is where the
majority of the engineering here goes.

---

# 4. The problem in context

### 4.1 Why merchants create the opening

Almost every consumer platform in India offers a first-order discount. Rs.200
off your first order, free delivery on signup, flat 40% for new users. It works.
It is one of the cheapest ways to acquire a customer.

The offer has one structural weakness: **it pays out to anyone who can look like
a new customer.** The merchant is not really buying a customer. They are buying
whatever the system accepts as proof of newness.

### 4.2 Why that is cheap to fake

Creating a new identity online costs almost nothing:

- Virtual and disposable phone numbers
- Unlimited email aliases
- Prepaid and virtual cards issued instantly
- Device fingerprints resettable by clearing storage or using an emulator
- Delivery to any address, including a shop counter or a building lobby

So one person can present as fifty new customers over a weekend. Each of the
fifty places a genuine order, receives real food or real goods, and pays a real
(discounted) amount. Nothing bounces. Nothing charges back.

### 4.3 What it costs

Fifty accounts at Rs.200 is Rs.10,000 from one operator. That number is small
enough to ignore and that is exactly the problem: it never arrives as one visible
event. It arrives as a slow drain across thousands of accounts, showing up in
finance as "promo spend" and in growth dashboards as "new user acquisition."

The acquisition budget quietly converts into somebody's arbitrage, and the metric
that is supposed to catch it (cost per acquisition) instead reports success.

### 4.4 Why this is invisible to normal fraud systems

This is the heart of it.

Take account number 17 of a fifty-account ring. Look at everything about it:

- It signed up normally
- It placed one order
- It used the new-customer coupon, which is what the coupon is for
- It paid successfully
- The goods were delivered
- No dispute, no chargeback, no failed payment

**There is nothing wrong with it.** Examine all fifty accounts one at a time and
every one looks like an ordinary first-time customer, because in isolation that
is precisely what each one is.

The abuse is not located in any account or any transaction. It is located in the
**relationships between them**. Fifty independent first orders are a good day.
Fifty first orders from one operator is theft.

A per-transaction fraud model, no matter how sophisticated or how much data it
was trained on, is looking at the wrong unit. It cannot see a pattern that does
not exist inside its input.

### 4.5 Why the obvious fixes fail

| Approach                             | How it fails                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| One account per device               | Breaks families sharing a tablet, flatmates, hostels. Blocks paying customers.                                    |
| One account per address              | A hostel has 200 legitimate residents at one address.                                                             |
| Velocity limits (N signups per hour) | Catches sloppy operators. A patient one spreads signups over weeks and walks straight through.                    |
| Blocklist device IDs                 | Operator clears storage or rotates emulator fingerprints. Free to defeat.                                         |
| Manual review                        | Does not scale to thousands of signups a day, and reviewers see one account at a time, where nothing looks wrong. |
| Per-transaction ML scoring           | Wrong unit of analysis. Nothing to detect inside a single legitimate order.                                       |

Every one of these fails in one of two ways: it is trivially evaded, or it blocks
real customers. Usually both.

### 4.6 Why it is genuinely hard to solve properly

Six reasons, and each one shapes a phase of this plan:

1. **Wrong unit of analysis.** You must first build the groups before you have
   anything to classify. Most of the difficulty is here, not in the model.
2. **Innocent people look identical.** A family shares a device, an address and
   a card. A hostel shares an address and a network. A new office shares an
   address and has bursty signups. Structurally, these look like rings. Only
   behaviour over time separates them.
3. **Extreme class imbalance.** Real promo abuse is well under 1% of accounts. A
   detector that is 99% accurate can be completely worthless, and most standard
   metrics look excellent while precision is unusable.
4. **Ferocious cost asymmetry.** Missing an abuser costs one coupon, roughly
   Rs.200. Wrongly blocking a real customer costs their lifetime value, plausibly
   Rs.15,000, plus goodwill. That is a 75 to 1 ratio, which means a high-recall
   detector can lose more money than doing nothing at all.
5. **No ground truth exists.** Real fraud rings are not labelled. Nobody hands
   you a list saying "these 40 accounts are one operator." Any evaluation has to
   construct its own answer key, and doing that badly means grading your own exam.
6. **The adversary adapts.** Whatever signal you rely on, an operator can rotate
   or randomise once they learn you rely on it. So the honest question is not
   "does it work" but "how sophisticated must an operator be before it stops
   working," which is a curve, not a number.

---

# 5. What Jaal does about it

### 5.1 The reframe

Stop scoring transactions. Score **relationships**.

Instead of "is this payment suspicious," ask "how much evidence is there that
these two accounts are run by the same person," across every pair worth checking.
Then find the groups that evidence forms, and judge the groups.

### 5.2 The pipeline

```
Accounts
   |
   v
[1] BLOCK      cut 72 million possible pairs to a few hundred thousand
   |           candidates worth scoring
   v
[2] LINK       score each candidate pair with Fellegi-Sunter likelihood
   |           ratios: how much evidence, in bits, that these share an operator
   v
[3] CLUSTER    Leiden community detection over the weighted graph, giving
   |           groups guaranteed to be internally connected
   v
[4] FEATURE    turn each group into ~15 numbers: structural, temporal,
   |           behavioural, economic
   v
[5] SCORE      calibrated classifier produces a real probability, not a
   |           ranking score
   v
[6] DECIDE     block, allow, or send to human review, chosen to minimise
   |           expected rupees lost
   v
[7] EXPLAIN    a written reason a human reviewer can act on in ten seconds
```

Stages 1 to 4 are the hard part. Stage 5 is four lines of scikit-learn. Stage 6
is where the track is won.

### 5.3 The key technical idea, in plain English

Exact matching asks "do these two accounts share a device ID?" and finds nothing
once the operator rotates devices.

Jaal instead adds up **weak evidence**. Each comparison contributes a weight
measured in bits:

- Sharing a rare device: about **+12 bits**, very strong
- Signing up within the same hour: about **+9 bits**, strong
- Same delivery pincode: about **+8 bits**
- Both used the coupon: about **+1.5 bits**, weak alone

Six weak signals at 1.5 bits each sum to 9 bits, which outweighs one device
match. **Exact matching discards every weak signal. Jaal accumulates them.**

It also weights by rarity. Two accounts sharing a device that appears twice in
the whole dataset is enormous evidence. Sharing one that appears 300 times is
almost none. A hand-tuned rule cannot express that difference. Likelihood ratios
computed per value can.

### 5.4 What it outputs

For every flagged group:

```
cluster_id:   47
size:         22 accounts
probability:  0.83  (calibrated, so 0.83 really means 83%)
action:       REVIEW  (expected cost Rs.3,300 vs Rs.56,100 to block)
evidence:     signup timing +9.1 bits, pincode +7.7, card BIN +3.9
reason:       "22 accounts created within 4 hours, all from pincode 560034,
               all used the first-order coupon, none ordered again, 19 of 22
               order values within Rs.60 of the coupon minimum."
extracted:    Rs.4,400 in discounts
```

Every number traces back to the pipeline. Nothing is invented.

### 5.5 What Jaal deliberately does not do

Saying this clearly is part of the submission, not a weakness.

- **Not real-time.** It is a batch job over an account population. Making it
  streaming is a different engineering problem and is out of scope.
- **Not a general fraud detector.** One loss class only. Not chargebacks, not
  returns abuse, not stolen cards.
- **Not identity attribution.** It says "these accounts appear to share an
  operator." It never claims to identify a person.
- **Not an autonomous blocker.** Its highest-value output is often "send this to
  a human," and that is by design given the cost asymmetry.
- **Not trained on real data.** Everything is synthetic, by necessity and by
  choice. See below.

### 5.6 The defence-only position

Jaal includes a generator that produces synthetic abuse rings. This is necessary:
real fraud is unlabelled, so there is no other way to measure a detector against
a known answer key.

Constraints that keep this strictly defensive:

- Generates **only synthetic records**. No real identifiers, no scraped data.
- Touches **no payment rails**, real or test.
- Produces **no evasion guidance**. It parameterises operator sophistication so
  the detector can be measured across it, and reports where detection fails.
  Reporting a blind spot is defensive disclosure, not instruction.
- Lives in a directory clearly labelled as a test fixture, stated in the first
  200 words of the README.

---

# 6. How this maps to the Track 02 bar

| Brief says                      | Jaal delivers                                       | Phase |
| ------------------------------- | --------------------------------------------------- | ----- |
| "one class of loss"             | Promo abuse only, nothing else                      | all   |
| "working detector"              | One command, offline, start to finish               | 9     |
| "measured precision and recall" | Reported separately per difficulty tier             | 5, 7  |
| "held-out test set"             | Seeds 900-999, sealed day 1, opened day 12          | 0, 7  |
| "honest metrics"                | Includes a negative result row, reported not hidden | 7     |
| "false-positive cost"           | Rupee cost curve plus sensitivity analysis          | 6     |
| "strictly defense-only"         | Synthetic fixture, no offensive artefact            | 0     |

### The three things that separate this from the crowd

1. **A rules-only baseline, published and beaten (or not).** Most submissions go
   straight to a model, so nobody, including them, can tell whether the ML
   contributed anything.
2. **Calibrated probabilities.** A raw classifier score of 0.80 does not mean
   80%. Almost nobody checks. Without calibration, any cost calculation built on
   that number is arithmetic on nonsense.
3. **A detection curve instead of a claim.** Rather than "our detector works,"
   Jaal reports the exact operator sophistication at which it stops working.
   Naming your own blind spot precisely is the most credible thing a risk
   submission can do.

---

# 7. How to use this document

Each phase has the same shape:

1. **What you are building** in one line
2. **The idea in plain English**, before any code
3. **Steps**, numbered, with file names, function names, rough line counts
4. **Check before moving on**, a concrete test you must pass
5. **Time budget**
6. **Read these first**, practical blogs and tutorials
7. **References**, papers, if you want the theory

Do not skip the "check before moving on" boxes. Each one catches a specific
failure that stays invisible until much later.

### Five rules that shape every decision

1. **No reported number may need the internet.** If your metrics depend on an API
   call, they are not reproducible.
2. **Never average across difficulty tiers.** The variation is the interesting
   part. A blended number hides it.
3. **The rules baseline is a deliverable, not scaffolding.** If your model does
   not beat it, you report that.
4. **Rupees beat percentages.** Precision and recall feed the cost function. They
   are not the answer by themselves.
5. **"I don't know" is a valid output.** Unresolvable groups go to a review queue
   with a reason attached.

---

# PHASE 0: Foundation reset

**Build:** an honest dataset.
**Time:** 4 to 5 hours.
**Files:** `generate_accounts.py` (rewrite), `config.py` (new)

### The idea in plain English

Right now roughly 10% of your accounts are fraudsters. In the real world it is
under 1%. That difference sounds small. It is not.

Say you flag 100 accounts and 90 are really fraud. Precision 90%. Now imagine
fraud is 100x rarer. The same detector, same sensitivity, now pulls in far more
innocent accounts for every real one it catches, because there are far more
innocent accounts available to get caught. Precision falls off a cliff.

**Every number you measure at 10% fraud is a lie about a world that does not
exist.** Fix this before measuring anything.

---

### Step 0.1: Move constants into `config.py`

**~30 lines. 20 minutes.**

Everything tunable goes in one place. You will change these numbers dozens of
times and you do not want them scattered across five files.

```python
# config.py

# --- population ---
N_NORMAL_ACCOUNTS   = 12_000
RING_PREVALENCE     = 0.008      # 0.8%, realistic promo abuse rate
LOOKALIKE_GROUPS    = 40         # families, flatmates, hostels

# --- the promo being abused ---
COUPON_MIN_ORDER    = 400        # rupees, minimum order to qualify
COUPON_VALUE        = 200        # rupees off

# --- what mistakes cost the merchant ---
COST_MISSED_ABUSER      = COUPON_VALUE   # one coupon farmed
COST_BLOCKED_INNOCENT   = 15_000         # customer lifetime value, lost
COST_ANALYST_REVIEW     = 150            # 10 min of a human's time

# --- evaluation ---
HOLDOUT_SEEDS       = range(900, 1000)   # SEALED until Phase 7
TRAIN_SEEDS         = range(0, 700)
VALIDATION_SEEDS    = range(700, 900)
```

Write a one-line comment justifying `COST_BLOCKED_INNOCENT`. A judge will ask.
"Average customer places 30 orders over 2 years at Rs.500 with 5% margin, plus
referral loss" is a defensible answer. "15000" alone is not.

---

### Step 0.2: Calibrate distributions against real data

**~50 lines. 2 hours. `calibrate_from_olist.py`**

Your generator currently invents order values, repeat rates and signup hours.
That is the most attackable part of the whole submission. Fix it cheaply.

Download the Olist dataset (link in 1.7), extract three distributions, and commit
the result as `data/olist_priors.json`. Do not commit the raw dataset.

```python
import pandas as pd, json, numpy as np

items  = pd.read_csv("olist_order_items_dataset.csv")
orders = pd.read_csv("olist_orders_dataset.csv")
cust   = pd.read_csv("olist_customers_dataset.csv")

# 1. order value distribution, as decile boundaries in rupees
#    (Olist is in BRL; scale to a plausible INR range and say so in the README)
value_deciles = np.percentile(items["price"], np.arange(0, 101, 10)).tolist()

# 2. repeat rate: fraction of customers with more than one order
per_cust = (orders.merge(cust, on="customer_id")
                  .groupby("customer_unique_id").size())
repeat_rate = float((per_cust > 1).mean())

# 3. signup/order hour histogram, 24 buckets, normalised
hours = pd.to_datetime(orders["order_purchase_timestamp"]).dt.hour
hour_weights = (hours.value_counts(normalize=True)
                     .reindex(range(24), fill_value=0).tolist())

json.dump({"value_deciles": value_deciles,
           "repeat_rate": repeat_rate,
           "hour_weights": hour_weights},
          open("data/olist_priors.json", "w"), indent=1)
```

Then have the generator sample from these instead of `rng.randint` ranges.

**Two honest caveats to state in the README:**

1. Olist is Brazilian marketplace data, not Indian food delivery. The *shape* of
   the distributions transfers (long-tailed order values, most customers never
   return, activity peaks in the evening). The absolute values do not. Scale and
   say so.
2. The repeat rate you extract is the population baseline. Ring accounts are
   defined by near-zero repeat rate, so this prior sets the contrast, it does not
   set the ring behaviour.

Doing this converts "you invented the data" from a weakness into a documented,
attributed choice. It is the cheapest credibility in the whole plan.

**Licence:** Olist is CC BY-NC-SA 4.0. You are committing derived parameters, not
the data. Attribute it in the README.

---

### Step 0.3: Drop prevalence to 0.8%

**~10 lines changed. 30 minutes.**

Currently ring size is hardcoded. Make it derive from prevalence:

```python
def _ring_sizes(rng, n_total, prevalence):
    """Split the fraud budget across a realistic number of operators."""
    budget = int(n_total * prevalence)
    sizes = []
    while budget > 8:
        size = min(budget, rng.randint(8, 45))
        sizes.append(size)
        budget -= size
    return sizes
```

With 12,000 accounts at 0.8%, that is ~96 ring accounts across maybe 3 to 5
rings. Sparse. Realistic. Much harder.

---

### Step 0.4: Add the fourth tier, `adaptive`

**~25 lines. 1 hour.**

Your three tiers assume the operator is careless in fixed ways. Add one where
the operator actively evades:

| Tier              | Operator behaviour                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `obvious`       | One device, all signups within an hour, identical order values                                                                                                                          |
| `moderate`      | Device reused ~60% of the time, signups over days                                                                                                                                       |
| `sophisticated` | Device rotated every account, signups over weeks                                                                                                                                        |
| `adaptive`      | All of the above,**plus** camouflage: a few accounts place genuine repeat orders, order values randomised well above the coupon floor, some accounts deliberately skip the coupon |

`adaptive` exists so you can honestly say where your system stops working. That
sentence is worth more than a high score.

```python
TIERS = {
    "obvious":       dict(device_reuse=1.00, signup_window_days=0.04,
                          value_jitter=80,  camouflage=0.00),
    "moderate":      dict(device_reuse=0.60, signup_window_days=3,
                          value_jitter=200, camouflage=0.00),
    "sophisticated": dict(device_reuse=0.10, signup_window_days=21,
                          value_jitter=600, camouflage=0.00),
    "adaptive":      dict(device_reuse=0.00, signup_window_days=45,
                          value_jitter=1200, camouflage=0.15),
}
```

`camouflage=0.15` means 15% of ring accounts behave like real customers: they
order again, they skip the coupon sometimes. This breaks the single strongest
feature (repeat rate) and it is exactly what a real operator would do once they
learned what you were checking.

---

### Step 0.5: Make lookalikes genuinely hard

**~40 lines. 1 hour.**

Your false positives will nearly all come from here, so build them properly.

Four kinds, each trapping a different rule:

```python
LOOKALIKE_KINDS = {
    # a real family: shares device AND card AND address, but over years
    "family":     dict(size=(2, 5),   shares=["device", "address", "card"],
                       span_days=(200, 900), repeat_rate=0.7),

    # flatmates: same address, different everything else
    "flatmates":  dict(size=(2, 4),   shares=["address"],
                       span_days=(30, 400),  repeat_rate=0.5),

    # hostel: same address AND same network, many people, high churn
    "hostel":     dict(size=(20, 60), shares=["address", "ip"],
                       span_days=(60, 700),  repeat_rate=0.3),

    # office lunch orders: same address, bursty signups (LOOKS like a ring)
    "office":     dict(size=(8, 25),  shares=["address"],
                       span_days=(1, 14),    repeat_rate=0.6),
}
```

The `office` case is the important one. Twenty people at a new company signing
up in the same week from the same address is **structurally identical** to a
ring. Only repeat behaviour separates them. If your detector cannot handle
`office`, it will block real businesses.

---

### Step 0.6: Seal the holdout

**15 minutes.**

Write this into your README today, before you have any results:

```markdown
## Evaluation protocol
Seeds 0-699 train. Seeds 700-899 validation and tuning.
Seeds 900-999 SEALED, opened once at Phase 7. No tuning against them.
```

Publishing the protocol before you have results is what makes it credible. Doing
it afterwards is unverifiable.

---

### Step 0.7: Every output prints its prevalence

**~5 lines. 15 minutes.**

Every metrics table gets a header line stating the base rate it was measured at.
PR-AUC has a floor equal to the class prevalence, so a PR-AUC of 0.30 is
terrible at 25% prevalence and excellent at 0.8%. Without the prevalence, the
number means nothing.

---

### Check before moving on

Run the generator and confirm:

```
[ ] ring accounts are 0.7% to 0.9% of total, all four tiers
[ ] at least 3 rings and at least 30 lookalike groups per world
[ ] `adaptive` rings share ZERO device IDs internally
[ ] `office` lookalikes have signup spans under 14 days (the trap works)
[ ] generating 100 worlds takes under 60 seconds
[ ] data/olist_priors.json committed, raw Olist data NOT committed
[ ] generator samples order values from the calibrated deciles
[ ] running seed 5 twice gives byte-identical output
```

That last one matters more than it sounds. If your generator is not
deterministic, none of your results are reproducible and the whole submission
loses its footing.

### Read these first

- Splink, *What are Blocking Rules?* (for the scale intuition): https://moj-analytical-services.github.io/splink/topic_guides/blocking/blocking_rules.html
- MetricGate, *ROC vs Precision-Recall Curve*, on why PR-AUC baseline equals prevalence: https://metricgate.com/blogs/roc-vs-precision-recall-curve/

### References

- Saito & Rehmsmeier (2015), PLoS ONE 10(3):e0118432. https://doi.org/10.1371/journal.pone.0118432
- Brabec & Machlica (2020), *On Model Evaluation under Non-constant Class Imbalance*. https://arxiv.org/pdf/2001.05571

---

# PHASE 1: The honest baseline

**Build:** the rules-only detector your ML must beat.
**Time:** 6 to 8 hours.
**Files:** `baseline.py`, `costs.py`, `results/baseline.json`

### The idea in plain English

Before you build anything clever, build something dumb and measure it.

Two reasons. First, if your clever thing cannot beat hand-written rules, you
need to know that on day 2, not day 14. Second, judges have no way to tell
whether your model contributed anything unless you show them what it was
competing against.

Almost nobody does this. It is one of the cheapest ways to stand out.

---

### Step 1.1: Write the cost model first

**~60 lines. 1.5 hours. `costs.py`**

Do this before the detector. It changes what you optimise.

```python
# costs.py
from config import (COST_MISSED_ABUSER, COST_BLOCKED_INNOCENT,
                    COST_ANALYST_REVIEW)

def decision_cost(n_missed_abusers, n_blocked_innocents, n_reviewed):
    """Total rupees lost by a set of decisions."""
    return (n_missed_abusers  * COST_MISSED_ABUSER
          + n_blocked_innocents * COST_BLOCKED_INNOCENT
          + n_reviewed          * COST_ANALYST_REVIEW)

def do_nothing_cost(n_abuser_accounts):
    """The floor. Block nobody, lose every coupon."""
    return n_abuser_accounts * COST_MISSED_ABUSER

def block_everyone_cost(n_abusers, n_innocents):
    """The ceiling of stupidity. Useful as a second reference line."""
    return n_innocents * COST_BLOCKED_INNOCENT
```

Three reference lines, not one. "Do nothing" and "block everyone" bracket every
possible detector. Showing where yours sits between them is far more convincing
than a bare precision figure.

---

### Step 1.2: Exact-match linking with union-find

**~50 lines. 1.5 hours. `baseline.py`**

Union-find (also called disjoint-set) is the standard way to group things that
share something. Plain English: every account starts in its own group; whenever
two accounts share a device, merge their groups.

```python
class UnionFind:
    def __init__(self, items):
        self.parent = {x: x for x in items}

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]  # path compression
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb
```

Then bucket accounts by each shared field and union within buckets. Drop groups
smaller than 3.

---

### Step 1.3: Hand-written scoring rules

**~40 lines. 1 hour.**

Five rules, weights summing to 1.0. Keep them readable, because you will quote
them in the README as your baseline definition.

```python
def rule_score(f):
    s = 0.0
    if f["coupon_rate"]      > 0.90: s += 0.30
    if f["repeat_rate"]      < 0.10: s += 0.30
    if f["signup_span_days"] < 3.0:  s += 0.20
    if f["near_coupon_min"]  > 0.70: s += 0.15
    if f["value_spread"]     < 0.20: s += 0.05
    return min(s, 1.0)
```

Do not tune these to death. They are meant to be beaten.

---

### Step 1.4: Report per tier, never averaged

**~50 lines. 1.5 hours.**

```
tier            prev%   groups   prec   recall   blocked   net vs nothing
obvious          0.81       47   1.000    0.94         0        +Rs.18,200
moderate         0.79       51   0.910    0.38         4        -Rs.42,100
sophisticated    0.83       58   0.000    0.00         0             Rs.0
adaptive         0.80       61   0.000    0.00         0             Rs.0
```

Note the `moderate` row: 91% precision and it still **loses money**, because 4
wrong blocks at Rs.15,000 each swamps the coupons saved. That row alone justifies
your entire cost-first approach, and you should put it in the README.

---

### Step 1.5: Freeze the baseline

**30 minutes.**

Write `results/baseline.json` and commit it. Every later phase reports as a
delta against this file. Add a pytest that fails if a code change moves the
baseline numbers, so you cannot silently drift.

---

### Check before moving on

```
[ ] baseline runs on all 4 tiers in under 2 minutes
[ ] at least one tier shows a NEGATIVE net (this is realistic, not a bug)
[ ] results/baseline.json committed
[ ] a test locks the baseline numbers
[ ] you can state the baseline in one sentence out loud
```

### Read these first

- Towards Data Science, *Precision-Recall Curve is more informative than ROC in imbalanced data*: https://towardsdatascience.com/precision-recall-curve-is-more-informative-than-roc-in-imbalanced-data-4c95250242f6/

---

# PHASE 2: Probabilistic linking

**Build:** a linker that still forms groups when the operator rotates devices.
**Time:** 4 days. The core of the project.
**Files:** `blocking.py`, `link.py`, `link_train.py`

### Why this phase gets four days

Your baseline scores **zero** on `sophisticated` and `adaptive`. Not because
scoring failed. Because **no groups formed at all**. The operator rotated
devices, exact matching found nothing to join, and a perfect classifier
downstream still scores zero when handed nothing.

Everything after this phase is standard. This phase is where the project is won
or lost.

---

## 2A. The idea in plain English

Stop asking "do these two accounts share a device?"

Start asking **"how much evidence is there that these two accounts belong to the
same operator?"**

This is a solved problem from 1969, called **record linkage**, and the model is
**Fellegi-Sunter**. Almost nobody in a hackathon will reach for it.

### How it works, simply

For each pair of accounts, and each field you can compare, ask two questions:

- **m** = if these two really are the same operator, how often would this field agree?
- **u** = if these two are strangers, how often would this field agree **by chance**?

The evidence from that field is the ratio `m / u`, expressed in bits:

```
match_weight = log2(m / u)
```

Worked example, device ID:

- `m = 0.30`. Same operator, 30% chance of reusing a device (they rotate, but not perfectly)
- `u = 0.00008`. Two strangers sharing a device almost never happens
- weight = log2(0.30 / 0.00008) = log2(3750) = **+11.9 bits**. Very strong evidence.

Now pincode:

- `m = 0.85`. Same operator usually delivers to the same area
- `u = 0.004`. Two strangers in a country with many pincodes, occasionally
- weight = log2(0.85 / 0.004) = log2(212) = **+7.7 bits**. Strong, but weaker.

Now "used the coupon":

- `m = 0.98`, `u = 0.35`
- weight = log2(2.8) = **+1.5 bits**. Weak on its own.

Add the weights across all fields. Six weak signals at 1.5 bits each sum to 9
bits, which beats one device match. **That is the whole trick.** Exact matching
throws away every weak signal. Fellegi-Sunter adds them up.

### Turning bits back into a probability

```
prior_odds = prevalence_of_matching_pairs / (1 - it)
final_odds = prior_odds * 2 ** (sum_of_weights)
probability = final_odds / (1 + final_odds)
```

You now have a real probability for each pair, not an arbitrary score.

---

## 2B. Term frequency adjustment (the part that actually beats hand-tuning)

Two accounts share device `dev_4471`. How much evidence is that?

**It depends entirely on how common `dev_4471` is.** If it appears twice in your
whole dataset, sharing it is enormous evidence. If it appears 300 times because
it is a common emulator fingerprint, it is nearly no evidence at all.

A single hand-picked weight per field cannot express that. Per-value `u`
estimates can:

```python
def u_for_value(value, counts, n_records):
    """Chance two random accounts both have this exact value."""
    p = counts[value] / n_records
    return p * p
```

This is why Fellegi-Sunter beats hand-tuned rules, and it is the single most
defensible design choice in your submission. Splink calls this a term frequency
adjustment.

---

## 2C. Estimating m and u without labels

You do not have a list of true operator pairs. Here is how to get the numbers
anyway.

### u is easy: random sampling

**~20 lines.**

Sample 200,000 random pairs. At 0.8% prevalence, essentially all of them are
strangers. Measure how often each field agrees. That agreement rate **is** u.

```python
def estimate_u(accounts, fields, n_samples=200_000, rng=None):
    u = {f: 0 for f in fields}
    for _ in range(n_samples):
        a, b = rng.sample(accounts, 2)
        for f in fields:
            if fields[f](a, b):        # comparison function returns bool
                u[f] += 1
    return {f: max(c / n_samples, 1e-7) for f, c in u.items()}
```

Clamp to `1e-7`. A u of exactly zero gives infinite weight and breaks everything.

### m is harder: bootstrap from certain pairs

**~30 lines.**

Two accounts sharing a rare device are almost certainly the same operator. Use
those as a seed set of "known matches", then measure how often the **other**
fields agree within that set.

```python
def estimate_m(accounts, fields, seed_field="device_id", max_freq=3):
    """Pairs sharing a RARE value are near-certain matches. Learn m from them."""
    counts = Counter(a.device_id for a in accounts)
    buckets = defaultdict(list)
    for a in accounts:
        if counts[a.device_id] <= max_freq:      # rare value only
            buckets[a.device_id].append(a)

    seed_pairs = [(g[i], g[j]) for g in buckets.values()
                  for i in range(len(g)) for j in range(i + 1, len(g))]

    m = {f: 0 for f in fields}
    for a, b in seed_pairs:
        for f in fields:
            if fields[f](a, b):
                m[f] += 1
    return {f: min(max(c / len(seed_pairs), 1e-4), 0.9999)
            for f, c in m.items()}
```

**Be honest about the bias here.** Your seed pairs are, by construction, ones
that reused a device. So your m estimates lean toward careless operators. Say so
in the README. Naming a known weakness in your own method is worth more than
hiding it. The proper fix is Expectation Maximisation, which is what Splink does.
Treat EM as a stretch goal for day 6 if you have time.

---

## 2D. Blocking: making it computable

12,000 accounts is 72 million pairs. You cannot score them all.

**Blocking** means only comparing accounts that share some coarse key. The rule
of thumb from the record linkage literature: use several loose blocking rules
rather than one tight one, and take the union of the pairs they generate.

```python
BLOCKING_RULES = [
    lambda a: ("pin",    a.address_pincode),
    lambda a: ("bin_wk", a.card_bin, a.signup_week),
    lambda a: ("dev",    a.device_id),
    lambda a: ("day_hr", a.signup_day, a.signup_hour),
]
```

Every rule you add raises recall and costs compute. Every rule you leave out is
a permanent recall ceiling: pairs it never generates can never be found, no
matter how good your scoring is.

### The two numbers you must report

```python
pair_reduction_ratio = 1 - (n_candidate_pairs / n_all_possible_pairs)
blocking_recall      = n_true_pairs_generated / n_true_pairs_total
```

Reporting blocking recall is a strong signal to a judge. It says you know your
pipeline has a ceiling and you measured it. Most submissions will not know this
number exists.

---

## 2E. Step by step

### Step 2.1: Comparison functions

**~60 lines. 2 hours. `link.py`**

One small function per field. Each takes two accounts, returns True or a level.

```python
COMPARISONS = {
    "device_exact":   lambda a, b: a.device_id == b.device_id,
    "pincode_exact":  lambda a, b: a.address_pincode == b.address_pincode,
    "bin_exact":      lambda a, b: a.card_bin == b.card_bin,
    "signup_1h":      lambda a, b: abs(a.signup_minute - b.signup_minute) <= 60,
    "signup_24h":     lambda a, b: abs(a.signup_minute - b.signup_minute) <= 1440,
    "hour_of_day_2h": lambda a, b: _circular_hour_gap(a, b) <= 2,
    "value_within50": lambda a, b: abs(a.first_order_value
                                       - b.first_order_value) <= 50,
    "both_near_min":  lambda a, b: (_near_coupon_min(a) and _near_coupon_min(b)),
    "both_one_order": lambda a, b: a.n_orders == 1 and b.n_orders == 1,
}
```

Note `signup_1h` and `signup_24h` are separate. This is a **comparison level**:
agreeing within an hour is much stronger evidence than agreeing within a day, and
each level gets its own m, u and weight. Splink's comparison libraries work the
same way, and it is a meaningful upgrade over one binary per field.

### Step 2.2: Blocking

**~80 lines. 3 hours. `blocking.py`**

```python
def generate_candidate_pairs(accounts, rules):
    seen = set()
    for rule in rules:
        buckets = defaultdict(list)
        for a in accounts:
            buckets[rule(a)].append(a)
        for members in buckets.values():
            if len(members) > 400:        # skip degenerate blocks
                continue
            for i in range(len(members)):
                for j in range(i + 1, len(members)):
                    key = tuple(sorted((members[i].account_id,
                                        members[j].account_id)))
                    if key not in seen:
                        seen.add(key)
                        yield members[i], members[j]
```

The `len(members) > 400` guard matters. One block containing 5,000 accounts
generates 12 million pairs on its own and will hang your run. Log every block you
skip and report the count.

### Step 2.3: Train m and u

**~80 lines. 3 hours. `link_train.py`**

Estimate u by sampling, m by rare-value bootstrap, save to
`models/link_params.json`. Print a match weight table:

```
field              m        u         weight(bits)
device_exact     0.301   0.000080        +11.88
pincode_exact    0.847   0.004100         +7.69
bin_exact        0.912   0.061000         +3.90
signup_1h        0.223   0.000420         +9.05
signup_24h       0.681   0.009800         +6.12
both_one_order   0.964   0.310000         +1.64
```

**Print this table in your README.** It is directly interpretable, it shows your
model learned sensible things, and it is the input to your explanation layer in
Phase 8. Splink's waterfall charts are the same idea, and you can copy the
presentation style.

### Step 2.4: Score pairs

**~60 lines. 2 hours.**

```python
def score_pair(a, b, params, tf_counts, n_records):
    total_bits, contributions = 0.0, []
    for field, cmp_fn in COMPARISONS.items():
        if not cmp_fn(a, b):
            continue
        m = params["m"][field]
        u = (u_for_value(getattr(a, TF_FIELD[field]), tf_counts[field], n_records)
             if field in TF_FIELD else params["u"][field])
        bits = math.log2(m / max(u, 1e-9))
        total_bits += bits
        contributions.append((field, round(bits, 2)))
    return total_bits, contributions
```

**Keep `contributions`.** That per-field breakdown is what makes every later
decision explainable, and it is what your LLM reads in Phase 8. Throwing it away
here means Phase 8 has nothing to work with.

### Step 2.5: Threshold and ablation

**~40 lines. 2 hours.**

Sweep the pair threshold from 4 to 20 bits. For each: pair precision, pair
recall, number of edges. Plot it.

Then the ablation. Drop each comparison field in turn, re-run, record the loss.
Output a table like:

```
removed field        recall drop
device_exact             -0.31
signup_1h                -0.24
pincode_exact            -0.19
both_one_order           -0.03
```

This tells you which signals matter and gives you a concrete answer to "what if
the fraudster hides X?" for every X.

---

### Check before moving on

```
[ ] blocking recall > 0.90 on all four tiers
[ ] pair reduction ratio > 0.99
[ ] scoring 12,000 accounts finishes in under 3 minutes
[ ] at least one ring on `sophisticated` now produces connected pairs
[ ] no field has u exactly 0 (would give infinite weight)
[ ] match weight table looks sensible: rare fields have high weights
[ ] contributions list is retained on every scored pair
```

**If blocking recall is below 0.90, stop and add blocking rules.** Everything
downstream is capped by this number and no amount of model quality recovers it.

### Read these first, in this order

1. Horkan (2026), *WTF is the Fellegi-Sunter Model? A Practical Guide*: https://horkan.com/2026/01/05/wtf-is-the-fellegi-sunter-model-a-practical-guide-to-record-matching-in-an-uncertain-world
2. Linacre, *Probabilistic record linkage* interactive series (best single resource, work through it): https://www.robinlinacre.com/probabilistic_linkage/
3. Splink, *The Fellegi-Sunter Model*: https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html
4. Splink tutorial, *Blocking*: https://moj-analytical-services.github.io/splink/demos/tutorials/03_Blocking.html
5. Splink, *What are Blocking Rules?*: https://moj-analytical-services.github.io/splink/topic_guides/blocking/blocking_rules.html
6. Evensen, *Entity Resolution: An Introduction*: https://medium.com/@adev94/entity-resolution-an-introduction-fb2394d9a04e
7. NICD, *End-to-end guide to entity resolution with Splink*: https://nicd.org.uk/knowledge-hub/an-end-to-end-guide-to-overcoming-unique-identifier-challenges-with-splink

### References

- Fellegi & Sunter (1969), *A Theory for Record Linkage*, JASA 64(328):1183-1210
- Christen & Winkler (2017), *Record Linkage*: https://doi.org/10.1007/978-1-4899-7687-1_712
- Splink source: https://github.com/moj-analytical-services/splink

---

# PHASE 3: Community detection

**Build:** turn the weighted pair graph into candidate groups.
**Time:** 1 day.
**Files:** `cluster.py`

### The idea in plain English

You now have a graph. Accounts are dots, scored pairs are lines, and the line
thickness is how much evidence there is. You need to cut this graph into groups
where accounts inside a group are strongly connected to each other and weakly
connected to everyone else.

That is **community detection**. It is a graph algorithm, not machine learning.
No training, no labels.

---

### The one decision that separates you: Leiden, not Louvain

Everyone uses Louvain. It is in every blog post and it is one import away.

Louvain has a documented defect: it can produce **arbitrarily badly connected
communities**, and in the worst case **internally disconnected** ones, especially
when run iteratively. Traag et al. measured up to 25% of communities badly
connected and up to 16% outright disconnected.

For your problem that is not a technicality. A "ring" that is internally
disconnected is **not a ring**. It is two unrelated clumps the algorithm glued
together. If you report it as a detection and a judge inspects it, your result
falls apart in one question.

The Leiden algorithm adds a refinement phase between local moving and coarsening.
It **guarantees connected communities**, produces better partitions, and runs
faster.

---

### Step 3.1: Build the graph

**~40 lines. 1 hour.**

```python
import networkx as nx

def build_graph(scored_pairs, threshold_bits):
    G = nx.Graph()
    for a_id, b_id, bits, contribs in scored_pairs:
        if bits >= threshold_bits:
            G.add_edge(a_id, b_id, weight=bits, contributions=contribs)
    return G
```

Keep `contributions` on the edge. Phase 8 needs it.

### Step 3.2: Leiden clustering

**~50 lines. 2 hours.**

```python
import igraph as ig
import leidenalg as la

def find_clusters(G, resolution=1.0, seed=42):
    ig_graph = ig.Graph.from_networkx(G)
    partition = la.find_partition(
        ig_graph,
        la.RBConfigurationVertexPartition,   # supports a resolution parameter
        weights="weight",
        resolution_parameter=resolution,
        seed=seed,
    )
    return [[ig_graph.vs[i]["_nx_name"] for i in community]
            for community in partition]
```

Fix the seed. Community detection is randomised, and unseeded runs give
different answers each time, which destroys reproducibility.

### Step 3.3: Resolution sweep

**~30 lines. 1.5 hours.**

The resolution parameter controls granularity. High resolution gives many small
communities, low gives few large ones. Do not pick one value and hope.

Sweep 0.5 to 2.0 in steps of 0.1. For each, record cluster count, mean size, and
how well clusters align with ground truth. Plot it. Pick the value, and **state
the sensitivity** in your README: "results are stable across resolution 0.8 to
1.4" is a real finding.

### Step 3.4: Run Louvain too, and count its failures

**~30 lines. 1 hour. This is the step that earns marks.**

```python
def count_disconnected(G, communities):
    """How many 'communities' are not actually connected subgraphs?"""
    return sum(1 for c in communities
               if not nx.is_connected(G.subgraph(c)))
```

Run both algorithms on your graph. Count Louvain's disconnected communities. Put
the number in the README.

One sentence like *"Louvain produced 7 internally disconnected communities on our
graph, meaning 7 reported 'rings' were not actually connected. Leiden guarantees
zero by construction, which is why it is the default here"* signals more
engineering judgement than an entire dashboard.

### Step 3.5: Size filtering

**~15 lines. 30 minutes.**

Drop clusters below 3 accounts. A "ring" of two is a couple sharing a phone.
Record how many you dropped.

---

### Check before moving on

```
[ ] zero disconnected communities from Leiden (verify, don't assume)
[ ] Louvain disconnected count recorded in results/
[ ] clustering is deterministic across runs with a fixed seed
[ ] resolution sweep plot saved
[ ] at least one `sophisticated` ring appears as a single cluster
[ ] no cluster exceeds 500 accounts (that means threshold is too low)
```

### Read these first

- Wikipedia, *Leiden algorithm* (clear, short, has the intuition): https://en.wikipedia.org/wiki/Leiden_algorithm
- leidenalg documentation, especially partition types: https://leidenalg.readthedocs.io/

### References

- Traag, Waltman & van Eck (2019), *From Louvain to Leiden: guaranteeing well-connected communities*, Scientific Reports 9:5233. https://doi.org/10.1038/s41598-019-41695-z
- Preprint with the experimental analysis: https://arxiv.org/abs/1810.08473
- Blondel et al. (2008), *Fast unfolding of communities in large networks*, J. Stat. Mech. P10008

---

# PHASE 4: Group features

**Build:** turn each cluster into a row of numbers.
**Time:** 1 day.
**Files:** `features.py`

### The idea in plain English

Your model cannot look at a cluster. It can only look at numbers. This phase
decides which numbers.

**This matters more than which model you pick.** Good features make almost any
classifier work. Bad features make none of them work. Spend the day here rather
than trying a fifth algorithm later.

---

### The insight to build everything on

**Real families share MORE than rings do.**

A family shares one actual card, one real address, one device, and orders for
years. A ring shares a device by accident and fakes everything else, because
faking is the entire point.

So the separator is not "how much do they share". It is **"does their behaviour
persist over time"**. Rings are born, harvest, and die. Families keep ordering.

| Signal        | Ring                        | Family          | Office lunch group |
| ------------- | --------------------------- | --------------- | ------------------ |
| Signup span   | days                        | years           | days (trap!)       |
| Repeat orders | almost none                 | routine         | routine            |
| Coupon usage  | ~100%                       | some            | some               |
| Order values  | clustered near coupon floor | scattered       | scattered          |
| Cards         | many, one BIN               | one shared card | many, many BINs    |

Note the `office` column. It matches a ring on signup span and fails only on
repeat behaviour. That is why your lookalike generator had to include it.

---

### Step 4.1: Structural features from the graph

**~50 lines. 1.5 hours.**

```python
def structural_features(G, cluster):
    sub = G.subgraph(cluster)
    weights = [d["weight"] for _, _, d in sub.edges(data=True)]
    return {
        "size":            len(cluster),
        "edge_density":    nx.density(sub),
        "mean_edge_bits":  statistics.mean(weights),
        "min_edge_bits":   min(weights),
        "weight_spread":   statistics.pstdev(weights) if len(weights) > 1 else 0,
        "diameter":        nx.diameter(sub) if nx.is_connected(sub) else -1,
        "dominant_signal": _top_contributing_field(sub),
    }
```

`diameter` is quietly useful. Rings are usually **star shaped**, everything
hanging off one shared asset, so diameter is 2. Organic groups are more spread
out. `dominant_signal` records which comparison field carried the most weight
inside this cluster, and it feeds directly into your explanation.

### Step 4.2: Temporal features

**~40 lines. 1 hour.**

```python
"signup_span_days"     # max - min, in days
"signup_burstiness"    # largest count in any 1-hour window / size
"hour_concentration"   # entropy of signup hour-of-day, low = machine-like
"median_gap_minutes"   # median gap between consecutive signups
"lifespan_days"        # last order minus first order, across the cluster
```

`hour_concentration` uses entropy. Real humans sign up across the day. A script
run at 3am produces very low entropy. This is a signal an operator will not think
to hide.

### Step 4.3: Behavioural features

**~40 lines. 1 hour.**

```python
"coupon_rate"        # fraction using the promo
"repeat_rate"        # fraction with more than one order   <- strongest single feature
"near_min_rate"      # fraction within Rs.100 of the coupon floor
"value_cv"           # coefficient of variation of order values
"distinct_bins"      # count of distinct card BINs
"bin_concentration"  # largest BIN share
```

### Step 4.4: Economic features

**~30 lines. 1 hour. Do not skip this group.**

```python
"total_discount"       # rupees extracted by this cluster
"discount_per_account"
"discount_to_revenue"  # extracted / genuine revenue generated
```

These connect Phase 4 to Phase 6. A cluster extracting Rs.400 is noise. One
extracting Rs.40,000 is the target. Giving the model cost-relevant features means
its scores already lean toward what matters financially.

### Step 4.5: Leakage audit

**~20 lines. 1 hour. Mandatory.**

**Leakage** means a feature secretly encodes the answer. It makes your model look
brilliant in testing and useless in reality.

Write a test that asserts no feature function ever touches `group_kind` or
`group_id`. Then check correlations: any single feature correlating above 0.95
with the label is a leak, not a triumph.

```python
def test_no_leakage():
    src = inspect.getsource(features)
    assert "group_kind" not in src
    assert "group_id"   not in src
```

### Step 4.6: Redundancy and importance

**~30 lines. 1.5 hours.**

Correlation matrix, drop one of any pair above 0.9. Then permutation importance
on the baseline model. Keep the top 12 to 15. More features on 2,500 rows means
overfitting, not accuracy.

---

### Check before moving on

```
[ ] every feature has a unit test with a hand-built example
[ ] leakage test passes
[ ] no feature correlates > 0.95 with the label
[ ] features computed for 100 worlds in under 3 minutes
[ ] `office` lookalikes and rings differ clearly on repeat_rate
[ ] feature table saved as CSV so you can eyeball it
```

Open the CSV and read twenty rows by hand. If you cannot tell rings from
lookalikes by eye, the model will not either, and you need better features rather
than a better model.

---

# PHASE 5: Model and calibration

**Build:** scores that are real probabilities.
**Time:** 2 days.
**Files:** `model.py`, `calibrate.py`

### The idea in plain English

Training is the easy part. Four lines:

```python
from sklearn.ensemble import RandomForestClassifier
model = RandomForestClassifier(n_estimators=300, min_samples_leaf=5,
                               class_weight="balanced", random_state=42)
model.fit(X_train, y_train)
scores = model.predict_proba(X_val)[:, 1]
```

That is it. The rest of this phase is about a problem almost everyone misses.

---

### The problem: 0.80 does not mean 80%

Random forests are **badly calibrated by construction**. Their predicted
probabilities bunch around 0.2 and 0.9, and values near 0 and 1 are rare.

Why: a forest averages many trees. For the ensemble to output 0, every single
tree must output 0. Any noise in any tree pushes the average up. Errors near the
boundaries are one sided, so probabilities get squeezed toward the middle.

**Why this breaks your project specifically:** Phase 6 computes expected cost
from `p`. If `p` is not a real probability, your entire cost model is arithmetic
on a meaningless number. Calibration is not polish here. It is load bearing.

---

### Step 5.1: Train, split by seed

**~60 lines. 2 hours.**

```python
train = [i for i, m in enumerate(meta) if m["seed"] in TRAIN_SEEDS]
val   = [i for i, m in enumerate(meta) if m["seed"] in VALIDATION_SEEDS]
```

**Split on the world seed, never on the row.** Clusters from the same generated
world share generator artefacts. Random row splits leak those artefacts across
the boundary and silently inflate every score. This is the single most common way
a hackathon ML project produces numbers that are quietly fictional.

### Step 5.2: PR-AUC as the headline, not ROC-AUC

**~40 lines. 1 hour.**

At 0.8% prevalence, ROC-AUC is dominated by the huge true-negative pool. It can
read 0.97 while precision is unusable. PR-AUC has a floor equal to prevalence, so
it degrades honestly.

```python
from sklearn.metrics import average_precision_score, precision_recall_curve
pr_auc = average_precision_score(y_val, scores)
baseline = y_val.mean()          # PR-AUC of a random guesser
lift = pr_auc / baseline
```

Report all three. "PR-AUC 0.31 against a 0.008 prevalence baseline, a 39x lift"
is a far more informative sentence than "AUC 0.97".

### Step 5.3: Calibrate

**~60 lines. 3 hours. The core of this phase.**

```python
from sklearn.calibration import CalibratedClassifierCV

calibrated = CalibratedClassifierCV(model, method="sigmoid", cv=5)
calibrated.fit(X_train, y_train)
```

**Which method?** Two options:

- `method="sigmoid"` is **Platt scaling**. Fits a sigmoid. Few parameters, robust on small data.
- `method="isotonic"` is non-parametric, more flexible, but overfits when the calibration set is small.

The published finding: **Platt scaling outperforms isotonic regression when the
calibration set is under roughly 2,000 cases.** Your calibration set will be
around that size, so **start with `sigmoid`**, try `isotonic`, and report both
with Brier scores.

Making that choice deliberately, citing the reason, and showing the comparison is
itself a scoring point. Most submissions will not calibrate at all.

### Step 5.4: Reliability diagram

**~40 lines. 2 hours. Your best chart.**

Bucket predictions into 10 bins by predicted probability. For each bin, plot
predicted probability on the x-axis against observed frequency on the y-axis.
Perfect calibration is the diagonal.

Draw it before and after calibration, on the same axes.

```python
from sklearn.calibration import calibration_curve
prob_true, prob_pred = calibration_curve(y_val, scores, n_bins=10)
```

This one chart proves your probabilities mean something. Nobody else will have
it.

### Step 5.5: Brier score

**~10 lines. 30 minutes.**

```python
from sklearn.metrics import brier_score_loss
brier_before = brier_score_loss(y_val, raw_scores)
brier_after  = brier_score_loss(y_val, calibrated_scores)
```

Lower is better. It measures whether probabilities are accurate, not just whether
the ranking is right. Report both numbers.

---

### Check before moving on

```
[ ] train/val split is by seed, verified by a test
[ ] PR-AUC reported alongside its prevalence baseline
[ ] Brier score improves after calibration
[ ] reliability diagram saved, before and after
[ ] Platt vs isotonic compared, choice justified in one sentence
[ ] model beats the Phase 1 baseline on at least 2 tiers (if not, report that)
```

### Number you can quote

"Before calibration, clusters scored 0.80 were rings 52% of the time. After Platt
scaling, 79%. The threshold now means what it says."

### Read these first

1. scikit-learn, *Probability calibration* (read the RandomForest section closely): https://scikit-learn.org/stable/modules/calibration.html
2. Ethen Liu, *Probability calibration* walkthrough with code: http://ethen8181.github.io/machine-learning/model_selection/prob_calibration/prob_calibration.html
3. SCB DataX, *Probability calibration: a tool to mitigate risk*: https://medium.com/scb-datax/probability-calibration-a-tool-to-improve-your-fairness-of-your-machine-learning-model-faba02cc9dca
4. ter Braak, *Introduction to Probabilistic Classification*: https://medium.com/data-science/introduction-to-probabilistic-classification-a-machine-learning-perspective-b4776b469453

### References

- Niculescu-Mizil & Caruana (2005), *Predicting Good Probabilities With Supervised Learning*, ICML: http://www.niculescu-mizil.org/papers/calibration.icml05.crc.rev3.pdf
- Niculescu-Mizil & Caruana (2005), *Obtaining Calibrated Probabilities from Boosting*, UAI: https://arxiv.org/abs/1207.1403
- Platt (1999), *Probabilistic Outputs for Support Vector Machines*
- Zadrozny & Elkan (2001), isotonic regression for calibration

---

# PHASE 6: Cost-optimal decisions

**Build:** turn a probability into an action that minimises rupees lost.
**Time:** 1 day.
**Files:** `decide.py`

### The idea in plain English

You have a calibrated probability. Now: block, allow, or send to a human?

The naive answer is "block if p > 0.5". That is wrong here, and understanding why
is the whole phase.

Missing a promo abuser costs **Rs.200**, one coupon.
Wrongly blocking a real customer costs **Rs.15,000**, their lifetime value.

That is a **75 to 1** asymmetry. At that ratio, a detector with 95% recall and 40
wrong blocks **loses money**. A quieter one with 60% recall and zero wrong blocks
makes money.

So optimising F1 is optimising the wrong thing. F1 treats a false positive and a
false negative as equally bad. Here one is 75 times worse. Almost every other
submission will optimise F1 or accept the 0.5 default.

---

### Step 6.1: Expected cost per decision

**~50 lines. 2 hours.**

For one cluster with `n` accounts and calibrated probability `p`:

```python
def expected_costs(p, n_accounts):
    return {
        # if we block and we're wrong, we lose n innocent customers
        "block":  (1 - p) * n_accounts * COST_BLOCKED_INNOCENT,

        # if we allow and we're wrong, we lose n coupons
        "allow":  p * n_accounts * COST_MISSED_ABUSER,

        # review costs analyst time but a human then decides correctly
        "review": n_accounts * COST_ANALYST_REVIEW,
    }

def best_action(p, n_accounts):
    costs = expected_costs(p, n_accounts)
    return min(costs, key=costs.get), costs
```

Work an example. Cluster of 20 accounts, p = 0.7:

- block: 0.3 x 20 x 15,000 = **Rs.90,000**
- allow: 0.7 x 20 x 200 = **Rs.2,800**
- review: 20 x 150 = **Rs.3,000**

Allowing wins, even at 70% confidence it is a ring. That is counter-intuitive and
correct, and explaining it well in your video is worth more than a percentage
point of recall.

### Step 6.2: Three actions, not two

**~30 lines. 1 hour.**

Adding `review` is what makes the system deployable. It lets the model correctly
say "this deserves a human but not an automatic block". Refusing to decide is a
costed, legitimate output.

Report your review queue volume. A system sending 90% to review is useless in
practice even if its metrics look good, and saying so yourself is better than a
judge noticing.

### Step 6.3: Threshold sweep and the headline chart

**~50 lines. 2 hours.**

Sweep threshold 0.0 to 1.0 in 0.01 steps. At each: total cost, precision, recall,
F1. Plot cost against threshold and mark the minimum.

Then plot the F1-optimal threshold on the same chart.

The gap between the two is your headline finding:

> "F1-optimal threshold is 0.42 and costs Rs.61,000. Cost-optimal is 0.71 and
> costs Rs.18,400. The entire difference is false-positive cost."

### Step 6.4: Sensitivity analysis

**~40 lines. 2 hours.**

Your Rs.15,000 is an assumption. A judge will challenge it, so challenge it
first.

Re-run the optimisation across cost ratios from 10:1 to 200:1. Produce a table
showing how the optimal threshold moves.

```
cost ratio   optimal threshold   net saving
    10:1              0.38          Rs.24,100
    25:1              0.52          Rs.21,700
    75:1              0.71          Rs.18,400
   150:1              0.84          Rs.11,900
```

This says: I know which of my numbers are assumptions, and here is how the
conclusion changes if you disagree with them. That is a much stronger position
than defending a single figure.

---

### Check before moving on

```
[ ] cost-optimal threshold differs from 0.5 (if not, check your cost constants)
[ ] cost curve chart saved
[ ] review queue is between 2% and 20% of clusters
[ ] sensitivity table across at least 4 cost ratios
[ ] you can explain in one spoken sentence why p=0.7 might mean "allow"
```

---

# PHASE 7: Holdout and adversarial evaluation

**Build:** find out what you actually made.
**Time:** 1 day.
**Files:** `evaluate_holdout.py`, `results/holdout.json`

### The idea in plain English

Everything so far was measured on data you tuned against. Those numbers are
optimistic and you should assume they are wrong.

Today you open seeds 900-999. **Run once. Report whatever comes out.**

If holdout is worse than validation, that gap is a finding worth reporting, not a
problem to hide. Reporting it demonstrates you understand generalisation. Hiding
it and getting caught ends the interview.

---

### Step 7.1: Open the seal, run once

**1 hour.**

Write the script so it refuses to run twice without an explicit override flag.
Sounds paranoid. It is exactly the discipline the track is testing.

### Step 7.2: The results matrix

**~60 lines. 2 hours.**

```
tier            prev%  clusters  PR-AUC  prec  recall  Brier  blocked  net
obvious          0.81       412   0.94   0.97   0.91   0.031        0  +Rs.31,200
moderate         0.79       448   0.71   0.88   0.64   0.058        1  +Rs.19,400
sophisticated    0.83       501   0.44   0.79   0.37   0.092        2   +Rs.4,100
adaptive         0.80       523   0.21   0.61   0.14   0.140        3   -Rs.9,800
```

That `adaptive` row is negative. **Report it exactly like that.** A submission
with one honest negative row is dramatically more credible than one with four
suspiciously good rows.

### Step 7.3: The detection curve

**~50 lines. 2.5 hours. Your most credible artefact.**

Instead of four discrete tiers, sweep operator sophistication continuously.
Generate worlds where `device_reuse` runs from 1.0 down to 0.0 in steps of 0.05,
and plot recall against it.

The output is a sentence like:

> "We reliably detect operators who reuse a device across more than 30% of their
> accounts. Below 15% reuse, recall falls under 0.2. Operators who fully rotate
> devices and stagger signups beyond 30 days are not detected by this system."

**Naming your own blind spot precisely is the most credible thing in the whole
submission.** Everyone else will claim their detector works. You will state
exactly where yours stops, with a curve behind it.

### Step 7.4: Lookalike stress test

**~40 lines. 1.5 hours.**

Build a dataset of **only** innocent clusters: families, flatmates, hostels,
offices. Zero rings. Run the detector.

Every flag is a false positive, measured directly. Report the rate per lookalike
kind:

```
lookalike kind   clusters   wrongly flagged   rate
family                180                 0   0.0%
flatmates             140                 0   0.0%
hostel                 90                 2   2.2%
office                110                 7   6.4%   <- worst case
```

Then explain the `office` row: new companies with bursty signups from one address
look structurally like rings. That is an honest, specific limitation and it makes
the whole submission read as trustworthy.

### Step 7.5: Failure catalogue

**~1 hour.**

A table, not a paragraph. Every failure mode, with a concrete example and the
reason.

| Failure                         | Example              | Why                                  |
| ------------------------------- | -------------------- | ------------------------------------ |
| Full device rotation            | ring 004, adaptive   | no strong linking signal survives    |
| Small ring under blocking floor | ring 011, 4 accounts | blocking needs 3+ shared-key members |
| Office group flagged            | lookalike 067        | bursty signups from one address      |
| Camouflaged repeat orders       | ring 002, adaptive   | repeat_rate feature defeated         |

---

### Check before moving on

```
[ ] holdout run exactly once, script guards against re-running
[ ] results matrix has at least one honest negative
[ ] detection curve plotted and the blind spot stated in words
[ ] lookalike stress test run on rings-free data
[ ] failure catalogue has at least 4 entries with examples
[ ] holdout numbers are worse than validation (if better, suspect a bug)
```

---

# PHASE 8: Explanation layer

**Build:** turn a flagged cluster into something a human can act on in 10 seconds.
**Time:** half a day. Do not let it grow.
**Files:** `explain.py`, `cache/explanations/`

### The idea in plain English

Your reviewer sees `cluster_id: 47, p=0.83, size=22`. Useless. They need:

> "22 accounts created within 4 hours, all from pincode 560034, all used the
> first-order coupon, none ordered again, 19 of 22 order values within Rs.60 of
> the coupon minimum. Strongest signal: signup timing (+9.1 bits). Recommend
> review."

Every number there comes from your pipeline. The model only writes the sentence.

---

### The design rule that matters most

**The LLM does no detection.** It reads structured output and produces prose. If
it is unavailable, every metric still computes. This is what makes your
submission reproducible by a judge who has no API key.

### Step 8.1: Build the prompt from real evidence

**~50 lines. 1.5 hours.**

Feed it the feature dict plus the per-field match weight contributions you kept
back in Phase 2.4. This is why you kept them.

```python
prompt = f"""You are writing a one-paragraph review note for a fraud analyst.
Use ONLY the facts below. Do not speculate or add numbers.

Cluster size: {f['size']}
Signup span: {f['signup_span_days']:.1f} days
Coupon usage: {f['coupon_rate']:.0%}
Repeat orders: {f['repeat_rate']:.0%}
Order values near coupon minimum: {f['near_min_rate']:.0%}
Total discount extracted: Rs.{f['total_discount']:,}
Strongest linking signals: {top_contributions}
Calibrated probability: {p:.2f}
Recommended action: {action}

Write 2 sentences, then list the 3 strongest signals as bullets."""
```

"Use ONLY the facts below" matters. Without it the model invents plausible
details, and an invented number in a fraud review is worse than no note at all.

### Step 8.2: Cache everything

**~40 lines. 1.5 hours.**

```python
def cache_key(features, p, action):
    payload = json.dumps({"f": features, "p": round(p, 3), "a": action},
                         sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
```

Cache to `cache/explanations/{key}.json`. **Commit the cache directory.**

Ollama Cloud's free tier meters by GPU time, with session limits resetting every
5 hours and weekly limits every 7 days, and the exact numbers are not published.
Caching is not an optimisation here. It is what lets a judge reproduce your
output without an account.

### Step 8.3: Template fallback

**~30 lines. 1 hour.**

```python
def template_explanation(f, p, action):
    return (f"{f['size']} accounts created over {f['signup_span_days']:.1f} days. "
            f"{f['coupon_rate']:.0%} used the coupon, {f['repeat_rate']:.0%} "
            f"ordered again. Rs.{f['total_discount']:,} extracted. "
            f"Confidence {p:.2f}. Recommended: {action}.")
```

Wrap the model call in try/except and fall back to this. Log which source each
explanation came from: `live`, `cache`, or `template`.

### Step 8.4: Call the model

**~40 lines. 1 hour.**

```python
from ollama import Client
client = Client(host="https://ollama.com",
                headers={"Authorization": "Bearer " + os.environ["OLLAMA_API_KEY"]})
resp = client.chat(model="gpt-oss:120b-cloud",
                   messages=[{"role": "user", "content": prompt}])
```

---

### Check before moving on

```
[ ] pipeline completes end to end with the network disconnected
[ ] cache directory committed with at least 30 explanations
[ ] template fallback tested by forcing a failure
[ ] no explanation contains a number absent from the feature dict
[ ] explanation source (live/cache/template) logged per cluster
```

That fourth item needs a manual check. Read ten generated explanations and verify
every figure traces back to real pipeline output.

### Read these first

- Ollama Cloud docs: https://docs.ollama.com/cloud

---

# PHASE 9: Interface and packaging

**Build:** make the work legible in 5 minutes.
**Time:** 1 day. Strictly time-boxed.

### Step 9.1: README first, not last

**3 hours. The highest-value hour of the whole project.**

Order matters. Results above the fold.

```markdown
# Jaal
Defence-only detector for promo abuse rings. Synthetic data, test harness.

## The problem in one paragraph
[unit of analysis: groups, not transactions]

## Results (sealed holdout, seeds 900-999, 0.8% prevalence)
[the matrix, including the negative row]

## What this does NOT detect
[the detection curve finding, stated plainly]

## How to run
./run.sh          # reproduces every number above, offline

## Method
Link (Fellegi-Sunter) -> Cluster (Leiden) -> Features -> Calibrate -> Cost-optimal decision

## Baseline comparison
[rules-only vs model, per tier]

## Data
Fully synthetic. generate_accounts.py is a TEST FIXTURE for evaluating a
defensive detector. It produces no real identifiers and touches no payment rails.
```

Judges skim. Put the honest negative in the results table where they will see it,
not in a limitations section at the bottom.

### Step 9.2: `run.sh`

**1 hour.**

One command, clean checkout, no network, reproduces every published number.
Test it on a different machine.

### Step 9.3: Flask, two endpoints

**2 hours. Thin.**

```
POST /score       -> cluster in, score + reason out
GET  /runs/{id}   -> full batch results
```

No detection logic in the route handlers. They import from `detector/` and
return.

### Step 9.4: React dashboard

**4 hours maximum.**

Cluster list, evidence breakdown per cluster, PR curve, cost curve, reliability
diagram, review queue. Reads `results.json`. No backend needed.

### Anti-goal

Do not spend three days here. A plain terminal table with real numbers beats a
polished dashboard over a detector that scores zero on hard cases.

---

# PHASE 10: Submission

**Time:** 1 day.

### Video, 5 minutes

- 0:00-0:45 The problem. 50 accounts, 50 normal orders, no bad transaction anywhere.
- 0:45-1:30 The insight. Detection unit is the group. Why per-payment scoring cannot see it.
- 1:30-3:00 Live run. One command. Real output scrolling.
- 3:00-4:30 Results. The matrix, the reliability diagram, the cost curve.
- 4:30-5:00 Limitations. The detection curve and where it stops working.

Spend the last 30 seconds on limitations. It is the strongest ending available
and nobody else will do it.

### Checklist

```
[ ] clean checkout on a different machine, run.sh works offline
[ ] README results table matches results/holdout.json exactly
[ ] architecture diagram in the repo
[ ] defence-only statement in the first 200 words of the README
[ ] no API key anywhere in git history
[ ] video under 5 minutes
```

---

# Cut order

If you fall behind, cut in this order:

1. React dashboard (Phase 9.4)
2. Flask API (Phase 9.3)
3. LLM explanations (Phase 8), keep the template fallback
4. Leiden comparison (Phase 3.4)

**Never cut Phase 0, Phase 6 or Phase 7.** Those three are the bar. A detector
with a terminal-only interface, honest holdout numbers and a cost curve scores
far above a beautiful dashboard with no baseline and untested probabilities.

---

# Day map

| Day | Phase      | Output                              |
| --- | ---------- | ----------------------------------- |
| 1   | 0, start 1 | honest dataset, 4 tiers             |
| 2   | 1          | baseline frozen, cost model         |
| 3   | 2A-2C      | m/u estimation, match weight table  |
| 4   | 2D         | blocking, recall measured           |
| 5   | 2E         | pair scoring                        |
| 6   | 2E         | threshold, ablation                 |
| 7   | 3          | Leiden clusters, Louvain comparison |
| 8   | 4          | features, leakage audit             |
| 9   | 5          | model trained, PR-AUC               |
| 10  | 5          | calibration, reliability diagram    |
| 11  | 6          | cost curve, sensitivity             |
| 12  | 7          | holdout opened, detection curve     |
| 13  | 8          | explanations, cached                |
| 14  | 9          | README, run.sh, UI                  |
| 15  | 10         | video, buffer                       |

---

# Anti-patterns

| Tempting                        | Why it costs you                                 |
| ------------------------------- | ------------------------------------------------ |
| One blended metric across tiers | Hides the only interesting variation             |
| ROC-AUC as the headline         | Misleading at 0.8% prevalence                    |
| Threshold 0.5                   | Ignores the 75:1 cost asymmetry                  |
| Uncalibrated probabilities      | Makes the entire cost model meaningless          |
| Louvain by default              | Can emit internally disconnected "rings"         |
| Random row train/test split     | Leaks generator artefacts, inflates every number |
| LLM doing detection             | Unmeasurable, and it will not work               |
| Dashboard before pipeline       | The most common way this project dies            |
| No baseline                     | Nobody can tell whether the ML helped            |
| Tuning on holdout               | Invalidates every number you report              |

---

# All references

**Record linkage**

- Fellegi & Sunter (1969), *A Theory for Record Linkage*, JASA 64(328):1183-1210
- Christen & Winkler (2017), *Record Linkage*: https://doi.org/10.1007/978-1-4899-7687-1_712
- Horkan (2026), practical Fellegi-Sunter guide: https://horkan.com/2026/01/05/wtf-is-the-fellegi-sunter-model-a-practical-guide-to-record-matching-in-an-uncertain-world
- Linacre, probabilistic linkage series: https://www.robinlinacre.com/probabilistic_linkage/
- Linacre, introducing Splink: https://www.robinlinacre.com/introducing_splink/
- Splink Fellegi-Sunter guide: https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html
- Splink blocking rules: https://moj-analytical-services.github.io/splink/topic_guides/blocking/blocking_rules.html
- Splink blocking tutorial: https://moj-analytical-services.github.io/splink/demos/tutorials/03_Blocking.html
- NICD end-to-end Splink guide: https://nicd.org.uk/knowledge-hub/an-end-to-end-guide-to-overcoming-unique-identifier-challenges-with-splink
- Evensen, Entity Resolution introduction: https://medium.com/@adev94/entity-resolution-an-introduction-fb2394d9a04e
- Awesome Entity Resolution: https://github.com/OlivierBinette/Awesome-Entity-Resolution

**Community detection**

- Traag, Waltman & van Eck (2019), Sci Rep 9:5233: https://doi.org/10.1038/s41598-019-41695-z
- Preprint: https://arxiv.org/abs/1810.08473
- Blondel et al. (2008), J. Stat. Mech. P10008
- Leiden algorithm overview: https://en.wikipedia.org/wiki/Leiden_algorithm
- leidenalg docs: https://leidenalg.readthedocs.io/

**Imbalanced evaluation**

- Saito & Rehmsmeier (2015), PLoS ONE 10(3):e0118432: https://doi.org/10.1371/journal.pone.0118432
- Davis & Goadrich (2006), *The Relationship Between Precision-Recall and ROC Curves*, ICML
- Brabec & Machlica (2020): https://arxiv.org/pdf/2001.05571
- MetricGate, ROC vs PR: https://metricgate.com/blogs/roc-vs-precision-recall-curve/
- TDS, PR curve in imbalanced data: https://towardsdatascience.com/precision-recall-curve-is-more-informative-than-roc-in-imbalanced-data-4c95250242f6/

**Calibration**

- Niculescu-Mizil & Caruana (2005), ICML: http://www.niculescu-mizil.org/papers/calibration.icml05.crc.rev3.pdf
- Niculescu-Mizil & Caruana (2005), UAI: https://arxiv.org/abs/1207.1403
- Platt (1999), *Probabilistic Outputs for Support Vector Machines*
- scikit-learn calibration: https://scikit-learn.org/stable/modules/calibration.html
- Ethen Liu calibration walkthrough: http://ethen8181.github.io/machine-learning/model_selection/prob_calibration/prob_calibration.html
- SCB DataX calibration: https://medium.com/scb-datax/probability-calibration-a-tool-to-improve-your-fairness-of-your-machine-learning-model-faba02cc9dca

**Tooling**

- Splink: https://github.com/moj-analytical-services/splink
- Ollama Cloud: https://docs.ollama.com/cloud
