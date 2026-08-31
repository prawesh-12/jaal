# Jaal documentation

Seven files. Each answers one question. Start wherever your question is.

| if you want to know | read |
| --- | --- |
| what the scam is, and why normal fraud models miss it | [01-problem.md](01-problem.md) |
| what the system does, stage by stage | [02-how-it-works.md](02-how-it-works.md) |
| what the models are, their maths and their weights | [03-the-model.md](03-the-model.md) |
| every measured number | [04-results.md](04-results.md) |
| where it stops working, and how we know | [05-where-it-fails.md](05-where-it-fails.md) |
| how to run it, call it, and serve the site | [06-run-and-integrate.md](06-run-and-integrate.md) |
| what a word means | [glossary.md](glossary.md) |

## How to read the numbers

Every figure comes from a file in `results/`, named next to the table it appears
in. `tests/test_readme.py` re-reads those files and fails if a published number
has drifted from its source, so nothing here is estimated or carried over from
an older run.

Results are never averaged across the four adversary tiers. A pooled row appears
where a merchant would see one queue, but no tier number is blended into
another, because the spread between tiers is the finding.

Negative results stay in: the MLP that scored better than the shipped forest,
the purity model that is twenty times worse on the clusters that decide the
action, the adaptive tier where blocking finds nothing, and the reassembly pass
that lost Rs.1,431,700 and was kept in the tree switched off.
