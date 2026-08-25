# Decisions

Running log. Append, never rewrite.

## D-001: Virtualenv at `.venv`, not system Python
Date: 2026-08-26
Phase: 0

The system Python had numpy and networkx but nothing else, and installing into
it needs sudo on Ubuntu 24.04 (PEP 668 marks it externally managed). A local
`.venv` keeps the project reproducible and keeps the developer's system Python
untouched. `run.sh` will use `.venv/bin/python` if it exists and fall back to
whatever `python3` is on PATH, so a judge who pip-installs globally still works.

## D-002: matplotlib will be needed, flagged not added
Date: 2026-08-26
Phase: 0

The plan asks for `results/*.png`: PR curves (5.2), reliability diagram (5.4)
and the cost curve (6.3). It also caps dependencies at nine and lists no
plotting library. Those two cannot both hold. CLAUDE.md makes adding a tenth
dependency a stop-and-ask, so matplotlib is not installed yet. Nothing before
Phase 5 needs it, so Phase 0 to Phase 4 proceed unaffected. If the answer is no,
the fallback is to write the curve data to JSON and render the charts in the
React dashboard in Phase 9, which keeps the numbers reproducible offline but
loses the static PNGs.
