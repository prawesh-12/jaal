# Status

Last updated: 2026-08-26
Current phase: 0 (foundation reset), step 0.2

## Done
- Repo skeleton, git init on main
- Virtualenv at `.venv` with the nine dependencies from plan 2.3, pinned in requirements.txt
- Step 0.1: config.py holds every tunable constant
- detector/resources.py, the memory budget helper from CLAUDE.md
- 8 tests pass

## In progress
- Step 0.2: extracting Olist priors into data/olist_priors.json

## Next
- Step 0.3 to 0.5: generator with 0.8% prevalence, four tiers, four lookalike kinds
- Step 0.6: publish the evaluation protocol before any results exist
- Phase 0 check list, then Phase 1

## Blocked or uncertain
- The plan requires PR curves, a cost curve and a reliability diagram as
  `results/*.png` (Phases 5 and 6) but lists no plotting library among the nine
  dependencies. matplotlib will be needed by Phase 5. Flagged to the developer,
  see docs/DECISIONS.md D-002. Nothing before Phase 5 depends on it.
- The Olist raw dataset needs a Kaggle account to download. No Kaggle
  credentials on this machine. See D-003 for how this is handled.

## Numbers so far (all real, from committed runs)
- none yet
