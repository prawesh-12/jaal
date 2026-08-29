# Jaal documentation

Eight files. Each one answers a different question. Start wherever your
question is.

| if you want to know | read | how long |
| --- | --- | --- |
| what the scam is and why normal fraud models miss it | [01-problem.md](01-problem.md) | 3 min |
| what the system does, stage by stage | [02-how-it-works.md](02-how-it-works.md) | 5 min |
| what the model is, its maths, its weights | [03-the-model.md](03-the-model.md) | 10 min |
| every measured number | [04-results.md](04-results.md) | reference |
| where it stops working, and how we know | [05-where-it-fails.md](05-where-it-fails.md) | 5 min |
| how to run it, and how to call it | [06-run-and-integrate.md](06-run-and-integrate.md) | reference |
| what a word means | [glossary.md](glossary.md) | lookup |
| why something was built the way it was | [DECISIONS.md](DECISIONS.md) | 46 entries |

## If you only read one thing

[05-where-it-fails.md](05-where-it-fails.md). It has the adaptive tier where
Jaal blocks nothing, a claim we published and then disproved, and a feature
that cost Rs.1,431,700 and was kept in the tree switched off.

Most projects do not have that file. It is the one worth your time.

## Three rules these docs follow

**Every number comes from a file in `results/`.** If a figure is quoted here it
was produced by code that ran, and `tests/test_readme.py` asserts it still
matches its source. Nothing is estimated.

**Never averaged across tiers.** The four adversary tiers are reported
separately, always. Blending them hides the point where detection fails, which
is the most interesting result in the project.

**Bad results stay in.** The MLP beat the forest. The purity model is fifteen
times worse on the clusters that matter. The adaptive tier scores zero. All of
that is in here rather than in a footnote.
