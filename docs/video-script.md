# Video script, five minutes

Timings are hard limits. The last thirty seconds are the most valuable and
should not be cut for more results.

---

## 0:00 to 0:45, the problem

**On screen:** a normal-looking order confirmation. Then fifty of them.

> A merchant offers two hundred rupees off your first order. It works, new
> customers arrive. Then one person creates fifty accounts and claims it fifty
> times.
>
> Here is what makes that hard. Every one of those fifty accounts places one
> perfectly ordinary order. The payment succeeds. The goods are delivered.
> Nothing is stolen and no card is fraudulent. Look at any single transaction
> and you see a normal first-time customer, because in isolation that is exactly
> what it is.
>
> There is no bad transaction anywhere in this fraud.

## 0:45 to 1:30, the insight

**On screen:** `docs/diagrams/L2-pipeline.md`, the seven-stage flow.

> So a per-transaction fraud model cannot see this, and not because it is not
> big enough. The signal does not exist at the record level. It exists in the
> relationship between records.
>
> Jaal stops scoring transactions and scores relationships instead. How much
> evidence is there that these two accounts are run by the same person? That is
> a solved problem from 1969 called Fellegi-Sunter, and almost nobody reaches
> for it.
>
> Each field comparison contributes evidence in bits. Sharing a rare device,
> about fifteen bits. Signing up in the same hour, twelve and a half. Sharing a
> pincode, under four. Weak on its own, but six weak signals outweigh one device
> match. Exact matching throws every weak signal away. This adds them up.
>
> Then Leiden community detection finds the groups, and the unit of every
> decision after that is the group, never the transaction.

## 1:30 to 3:00, the live run

**On screen:** a terminal. `./run.sh quick`. Let it scroll.

> One command. No network access. This is the whole pipeline on a laptop.

**Pause on the blocking output.**

> Seventy two million possible pairs down to thirty two thousand worth scoring,
> and it reports its own recall, because a pair blocking never generates can
> never be recovered by anything downstream. Most submissions will not know that
> number exists.

**Pause on the match weight table.**

> These weights were learned without labels. And this one is worth pointing at:
> IP prefix, plus nought point one two bits. It agrees between real matches
> almost exactly as often as between strangers, so it carries no information,
> and the model says so rather than being told.

## 3:00 to 4:30, the results

**On screen:** the holdout table, then `results/cost_curve.png`, then
`results/reliability.png`.

> Sealed holdout, seeds nine hundred to nine ninety nine, opened once. Four
> difficulty tiers, never averaged.
>
> Now the number that matters. Blocking a real customer costs fifteen thousand
> rupees. Missing an abuser costs two hundred. Seventy five to one.
>
> Here is a detector at ninety two percent precision and ninety one percent
> recall. On any ordinary scoreboard that is excellent. It destroys twenty four
> point six million rupees, because blocking pays only above ninety eight point
> seven percent precision.
>
> I swept a hundred and one blocking thresholds. **Not one of them turns a
> profit.** With block and allow alone, the correct deployment of this detector
> is not to deploy it.
>
> Adding a third action, send it to a human, changes the sign. Two point two
> five million rupees saved against doing nothing, where the rules baseline on
> the same worlds loses forty eight million.
>
> That arithmetic only works because these are calibrated probabilities. Raw,
> the forest scored clusters at nought point five five that were rings twenty
> one percent of the time. After calibration, thirty six.

## 4:30 to 5:00, limitations

**On screen:** `results/detection_curve.png`, left panel.

> Last thirty seconds, and this is the part I would keep if I had to cut
> everything else.
>
> Here is where my system stops working. It blocks rings while the operator
> reuses a delivery address across about nine or more accounts. Below that,
> recall falls under five percent. An operator using a different address for
> every account is not blocked at all.
>
> Rotating phones does not defeat it. Rotating delivery addresses does. On the
> hardest tier it blocks nothing, and it only saves money by sending fifty seven
> percent of those accounts to a person.
>
> Everyone else will tell you their detector works. This one tells you exactly
> where it stops.

---

## Recording notes

- Run `./run.sh quick` once beforehand so nothing is downloaded on camera.
- `git checkout results/` afterwards to restore the published numbers.
- Charts are in `results/`. Do not screenshot the dashboard for the results
  section, use the tables, they are denser.
- Do not say "our model achieves". Say what it costs.
