# Video script, five minutes

Timestamps are hard limits. The last forty seconds are the most valuable part
and should not be cut to fit more results in.

923 spoken words. That is 5 minutes 8 seconds at 180 words a minute, which is a
normal pace for a demo. If you narrate slowly, at 150, it runs to 6 minutes and
you need to cut. Cut from the live run in section three, not from the ending.

Nothing here is recorded. This is the script only.

---

## 0:00 to 0:50, the unit of analysis

**On screen:** one order confirmation. Then the same thing, fifty times.

> A merchant offers two hundred rupees off your first order. One person opens
> fifty accounts and takes it fifty times.
>
> All fifty orders are placed once, paid for, and delivered. Look at any single
> payment and you see a normal first-time customer, because that is what it is.
>
> There is no bad transaction anywhere in this fraud. A model that scores
> payments one at a time cannot see it, and not because it is too small. What is
> wrong is not inside any payment. It is that fifty of them belong to one person,
> and that only exists in the comparison between records.
>
> So we score relationships instead. The unit of detection here is the group.

## 0:50 to 1:40, the finding that reframes everything

**On screen:** `results/cost_curve.png`, log scale, do-nothing line marked.

> Before any model we wrote down what mistakes cost. Missing an abuser costs two
> hundred rupees, one coupon. Wrongly blocking a real customer costs fifteen
> thousand. Seventy five to one.
>
> Then we swept a hundred and one blocking thresholds. **Not one turns a
> profit.** Here is the F1-optimal one: ninety two percent precision, ninety one
> percent recall, and it destroys twenty four point six million rupees.
>
> If block and allow are your only two actions, the correct deployment of this
> detector is not to deploy it.
>
> A third action changes the sign. Block, allow, or send to a person, whichever
> loses fewest rupees. Two and a quarter million saved, where a rules baseline on
> the same accounts loses forty eight.

## 1:40 to 2:40, a live run

**On screen:** a terminal. `./run.sh quick`. Let it scroll, and stay quiet
through it.

> One command, no network access, the whole pipeline.

**Pause on the blocking output.**

> Seventy two million possible pairs down to thirty two thousand, and it reports
> its own recall, because a pair we never generate can never be recovered later.
> That is a ceiling, and we measure it.

**Pause on the match weight table.**

> Learned without labels. This row is the one to point at: IP prefix, plus
> nought point one two bits. It agrees between real matches about as often as
> between strangers, so it carries nothing, and the model says so rather than
> being told.

**Switch to the API.** `POST /v1/scan`, twelve thousand accounts.

> Raw fields a merchant already has. One and a third seconds. Against the answer
> key the service never sees, eighty six percent of that batch's ring accounts
> reached a human and six innocent accounts were swept up.

## 2:40 to 3:30, the correction that mattered most

**On screen:** one cluster's response. Probability 1.00, purity 0.79, `review`.

> This is a mistake we shipped and then found.
>
> The classifier answers "is this cluster a ring", and we priced blocking off
> that. It is wrong. Blocking a cluster blocks everyone in it, so the bill is the
> innocent people caught in the net. A cluster that is ninety percent ring still
> costs ten percent of its members at fifteen thousand each.
>
> Priced that way it blocked twenty thousand accounts and **lost sixteen point
> four million**. We trained a second model to predict what share of a cluster is
> really ring accounts. Same data, same detector, priced on that instead: four
> thousand blocked, and it **makes one point three million**.
>
> Here it is on one cluster. Certain it is a ring. Only seventy nine percent of
> its members are. Blocking costs two hundred and fourteen thousand. A person
> costs ten thousand. So a person looks at it.

## 3:30 to 4:20, we let the operator fight back

**On screen:** `results/adaptive_loop.png`.

> Sophistication was a dial we set, and you could fairly say we wrote the fraud
> so of course we catch it. So we built an operator that adapts.
>
> It sees one thing: what share of its own accounts got blocked. Not our code,
> not our weights, and not the review queue, which from its side looks exactly
> like being allowed. Each round it runs a hundred worlds, correlates its five
> behaviours against getting blocked, and changes the strongest one.
>
> **In two moves it drove blocking from thirteen and a half percent to zero.**
> The share reaching a human went from ninety six to ninety three.
>
> And it did not do what we expected. Our own detection curve says rotating
> delivery addresses defeats this system. It went for spreading signups instead,
> because that is the one it could measure.
>
> So the queue is not robust because it is hard to evade. It is robust because it
> is **invisible**. An operator learns from feedback and a queue gives none. A
> patient one, watching which accounts close weeks later, would get that signal
> back. We do not model that operator.

## 4:20 to 5:00, where it stops working

**On screen:** the holdout results table, on the `adaptive` row.

> Last forty seconds, and this is the part I would keep over everything else.
>
> Sealed holdout, opened once. The hardest tier: a fresh device and a fresh
> delivery address for every account, signups over six weeks, fifteen percent of
> accounts behaving like real customers.
>
> Against that, **this system blocks nothing at all.** Zero accounts. The
> precision cell reads not applicable, because zero out of zero is undefined and
> printing it as zero would say something untrue.
>
> It still saves money, by sending fifty seven percent of those accounts to a
> person. That is a queue, not detection.
>
> And all of it assumes that person is right. They have to be right fifty seven
> and a half percent of the time for this to break even. On the hardest tier,
> eighty two.
>
> Everyone else will tell you their detector works. This one tells you where it
> stops, what it costs when it is wrong, and who it depends on.

---

## Recording notes

- Run `./run.sh quick` beforehand so nothing downloads on camera, then
  `git checkout results/` to restore the published numbers.
- Charts, in order: `cost_curve.png`, `adaptive_loop.png`. The holdout table is
  denser as text than as a dashboard screenshot, so use the table.
- Do not say "our model achieves". Say what it costs and who it needs.
- The adaptive row is the ending. Do not soften it and do not apologise for it.
