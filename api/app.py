"""Two endpoints over results the pipeline already produced.

There is no detection logic here and there must never be. If you are computing
a feature in this file, it belongs in `detector/features.py`.

    POST /score       cluster features in, probability, action and reason out
    GET  /runs/<id>   a whole batch result, by name

    python -m api.app        then http://127.0.0.1:5001
"""

from __future__ import annotations

import gzip
import json
import os
import pickle

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request

import config
from detector import decide, explain
from detector.features import FEATURE_NAMES

RESULTS_DIR = config.RESULTS_DIR
MODEL_PATH = os.path.join(RESULTS_DIR, "model.pkl")

app = Flask(__name__)
_model = None


def model() -> dict:
    global _model
    if _model is None:
        with gzip.open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
    return _model


@app.get("/health")
def health():
    return jsonify({"ok": True, "model_loaded": os.path.exists(MODEL_PATH)})


@app.post("/score")
def score():
    """One cluster's features in, a priced decision and a reason out."""
    payload = request.get_json(silent=True) or {}
    missing = [f for f in model()["features"] if f not in payload]
    if missing:
        return jsonify({"error": "missing features", "missing": missing,
                        "expected": model()["features"]}), 400

    m = model()
    # A DataFrame, not an array: the models were fitted with feature names.
    row = pd.DataFrame([{f: float(payload[f]) for f in m["features"]}])
    p = float(m["calibrator"].predict_proba(row)[0, 1])
    purity = float(np.clip(m["purity"].predict(row)[0], 0.0, 1.0))
    size = int(payload["size"])

    ec = decide.expected_costs(purity, size)
    action = str(decide.best_action(np.array([purity]), np.array([size]))[0])

    facts = {k: float(payload.get(k, 0.0)) for k in explain.PROMPT_FIELDS}
    signals = [
        (f"{payload.get('dominant_signal', 'unknown')} agreement, average edge",
         float(payload.get("mean_edge_bits", 0.0))),
        ("weakest link inside the cluster",
         float(payload.get("min_edge_bits", 0.0))),
        ("spread of edge strength", float(payload.get("weight_spread", 0.0))),
    ]
    note = explain.explain(facts, p, action, signals, live=False)

    return jsonify({
        "probability": round(p, 4),
        "predicted_ring_purity": round(purity, 4),
        "action": action,
        "expected_cost_rupees": {k: int(round(float(v))) for k, v in ec.items()},
        "reason": note["note"],
        "reason_source": note["source"],
        "calibration": m["method"],
    })


@app.get("/runs/<run_id>")
def run(run_id: str):
    """A whole batch result by name, for example /runs/holdout."""
    safe = os.path.basename(run_id) + ".json"
    path = os.path.join(RESULTS_DIR, safe)
    if not os.path.exists(path):
        available = sorted(f[:-5] for f in os.listdir(RESULTS_DIR)
                           if f.endswith(".json"))
        return jsonify({"error": "no such run", "available": available}), 404
    with open(path) as f:
        return jsonify(json.load(f))


@app.get("/features")
def feature_list():
    return jsonify({"features": list(FEATURE_NAMES),
                    "model_features": model()["features"]})


if __name__ == "__main__":
    # Loopback only. Nothing here should be reachable from the network.
    app.run(host="127.0.0.1", port=5001, debug=False)
