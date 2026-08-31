#!/usr/bin/env bash
#
# Jaal, end to end. No network access required.
#
#   ./run.sh          full run, reproduces every published number (~35 minutes)
#   ./run.sh quick     smaller worlds and fewer seeds, for a look around (~2 min)
#
# Two experiments are not in here because they take another 40 minutes between
# them. Run them yourself when you want to:
#
#   python -m detector.adapt --rounds 5 --worlds 100   an operator that adapts
#   python -m detector.adapt --visibility-sweep        the same, at every level
#                                                      of what it can see
#   python -m detector.reassemble --seeds 700-749      rejoining split rings
#   python -m detector.ablate                          what a caller with
#                                                      fewer columns gets
#   python -m detector.throughput                      how long a batch takes
#
# Everything runs at nice 10 so the machine stays usable, and every entry point
# measures free memory before it starts and refuses to run if there is not
# enough. See detector/resources.py.

set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-full}"
PY="python3"
[ -x .venv/bin/python ] && PY=".venv/bin/python"

# One BLAS thread per worker. Without this, numpy and scikit-learn each grab
# every core and the desktop stops responding.
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-4}"
export OPENBLAS_NUM_THREADS="$OMP_NUM_THREADS"
export MKL_NUM_THREADS="$OMP_NUM_THREADS"

if [ "$MODE" = "quick" ]; then
  ACCOUNTS=4000
  GEN_SEEDS="0-4"; TRAIN_SEEDS="0-9"; VAL_SEEDS="700-709"
  LINK_SEEDS="0-4"; EVAL_SEEDS="700-702"; BASELINE_SEEDS="700-709"
else
  ACCOUNTS=12000
  GEN_SEEDS="0-9"; TRAIN_SEEDS="0-59"; VAL_SEEDS="700-759"
  LINK_SEEDS="0-19"; EVAL_SEEDS="700-709"; BASELINE_SEEDS="700-799"
fi

run() {
  echo
  echo "=============================================================="
  echo "  $1"
  echo "=============================================================="
  shift
  nice -n 10 $PY "$@"
}

echo "Jaal, $MODE run, $ACCOUNTS accounts per world"
if [ "$MODE" = "quick" ]; then
  echo
  echo "NOTE: quick mode overwrites results/*.json with smaller, noisier runs."
  echo "The numbers published in the README come from the full run. To put the"
  echo "committed ones back afterwards:  git checkout results/"
  echo
fi
$PY -c "from detector.resources import apply, announce; announce(apply())"

if [ ! -f data/olist_priors.json ]; then
  echo "data/olist_priors.json is missing. Rebuild it with:"
  echo "  $PY -m detector.calibrate_from_olist --raw-dir data/raw"
  echo "It is committed, so this should not happen from a clean checkout."
  exit 1
fi

run "Generator check list"            -m detector.check_generator \
    --accounts "$ACCOUNTS" --seeds "$GEN_SEEDS"

run "Rules-only baseline"             -m detector.baseline \
    --accounts "$ACCOUNTS" --seeds "$BASELINE_SEEDS" --out results/baseline.json

run "Blocking, recall and reduction"  -m detector.blocking \
    --accounts "$ACCOUNTS" --seeds "$GEN_SEEDS" --out results/blocking.json

run "Linkage weights, estimate m and u"               -m detector.link_train \
    --accounts "$ACCOUNTS" --seeds "$LINK_SEEDS" --out results/link_params.json

run "Pair scoring, threshold and ablation"   -m detector.link_eval \
    --accounts "$ACCOUNTS" --seeds "$EVAL_SEEDS" --out results/link_eval.json

run "Clustering with Leiden"               -m detector.cluster \
    --accounts "$ACCOUNTS" --seeds "$EVAL_SEEDS" --out results/clustering.json

run "Feature table, training seeds"  -m detector.features \
    --accounts "$ACCOUNTS" --seeds "$TRAIN_SEEDS" --out results/features_train.csv

run "Feature table, validation seeds"      -m detector.features \
    --accounts "$ACCOUNTS" --seeds "$VAL_SEEDS" --out results/features_val.csv

run "Leakage and redundancy audit"   -m detector.features \
    --audit results/features_train.csv

run "Train and calibrate"             -m detector.model

run "Cost-optimal decisions"          -m detector.decide

if [ -f results/holdout.json ]; then
  echo
  echo "=============================================================="
  echo "  Holdout already opened, not re-running"
  echo "=============================================================="
  echo "results/holdout.json exists. A holdout opened twice is not a holdout."
  echo "Its numbers are in the README and in that file."
else
  run "Open the sealed holdout"       -m detector.evaluate_holdout \
      --accounts "$ACCOUNTS" --seeds "900-999"
fi

if [ -f results/holdout.json ] && [ -f results/features_holdout.csv ]; then
  run "Review queue, accuracy and capacity"    -m detector.review
fi

if [ -f results/features_holdout.csv ]; then
  run "Review notes"                  -m detector.explain \
      --features results/features_holdout.csv
fi

if [ -f results/features_holdout.csv ]; then
  run "Cases the site replays"        -m detector.sim_cases \
      --features results/features_holdout.csv
fi

run "Worlds the site replays"        -m detector.sim_world --seeds 975 932 977

run "Every measured number, in one file"     -m detector.report \
    --out results/metrics.md \
    --integration docs/06-run-and-integrate.md

echo
echo "=============================================================="
echo "  done"
echo "=============================================================="
echo "results/       every number, as JSON"
echo "results/metrics.md  the same numbers as one generated report"
echo "results/*.png  PR curves, reliability diagram, cost curve, detection curve"
echo "docs/          start at docs/README.md"
