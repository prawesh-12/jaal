"""HTTP service over the detector.

Two ways in. `/v1/scan` takes raw account records, runs every stage and returns
one decision per cluster. `/v1/score` takes a cluster whose features are already
computed, which is what an offline batch job has to hand.

There is no detection logic in this file and there must not be. The handlers
call `detector/` and return what it says.

    python -m api.app        then http://127.0.0.1:5001/health
"""

from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request

import config
from detector import decide, explain
from detector.features import FEATURE_NAMES
from detector.pipeline import REQUIRED_COLUMNS, Detector

MAX_ACCOUNTS_PER_SCAN = 20_000

app = Flask(__name__)
_detector = None
_started = time.time()


def detector() -> Detector:
    global _detector
    if _detector is None:
        _detector = Detector.load()
    return _detector


@app.get("/health")
def health():
    ready = os.path.exists("results/model.pkl")
    return jsonify({"ok": ready,
                    "model_loaded": _detector is not None,
                    "uptime_seconds": round(time.time() - _started, 1)})


@app.get("/v1/schema")
def schema():
    """What to send. Useful when wiring up a client."""
    return jsonify({
        "scan": {"required_columns": list(REQUIRED_COLUMNS),
                 "max_accounts": MAX_ACCOUNTS_PER_SCAN},
        "score": {"required_features": detector().model["features"]},
        "actions": list(decide.ACTIONS),
        "costs_rupees": {"blocked_innocent": config.COST_BLOCKED_INNOCENT,
                         "missed_abuser": config.COST_MISSED_ABUSER,
                         "analyst_review": config.COST_ANALYST_REVIEW},
    })


@app.post("/v1/scan")
def scan():
    """A batch of accounts in, one priced decision per cluster out."""
    payload = request.get_json(silent=True) or {}
    accounts = payload.get("accounts")
    if not isinstance(accounts, list) or not accounts:
        return jsonify({"error": "send {\"accounts\": [ ... ]}",
                        "required_columns": list(REQUIRED_COLUMNS)}), 400
    if len(accounts) > MAX_ACCOUNTS_PER_SCAN:
        return jsonify({"error": "batch too large",
                        "sent": len(accounts),
                        "max_accounts": MAX_ACCOUNTS_PER_SCAN}), 413

    try:
        frame = pd.DataFrame(accounts)
        result = detector().scan(frame,
                                 explain_notes=payload.get("explain", True),
                                 live=payload.get("live", False))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not payload.get("include_allowed", False):
        result["clusters"] = [c for c in result["clusters"]
                              if c["action"] != "allow"]
    return jsonify(result)


@app.post("/v1/score")
def score():
    """One cluster whose features are already computed."""
    payload = request.get_json(silent=True) or {}
    m = detector().model
    missing = [f for f in m["features"] if f not in payload]
    if missing:
        return jsonify({"error": "missing features", "missing": missing,
                        "expected": m["features"]}), 400

    row = pd.DataFrame([{f: float(payload[f]) for f in m["features"]}])
    p = float(m["calibrator"].predict_proba(row)[0, 1])
    purity = float(np.clip(m["purity"].predict(row)[0], 0.0, 1.0))
    size = int(payload["size"])

    costs = decide.expected_costs(purity, size)
    action = str(decide.best_action(np.array([purity]), np.array([size]))[0])

    facts = {k: float(payload.get(k, 0.0)) for k in explain.PROMPT_FIELDS}
    signals = [
        (f"{payload.get('dominant_signal', 'unknown')} agreement, average edge",
         float(payload.get("mean_edge_bits", 0.0))),
        ("weakest link inside the cluster", float(payload.get("min_edge_bits", 0.0))),
        ("spread of edge strength", float(payload.get("weight_spread", 0.0))),
    ]
    note = explain.explain(facts, p, action, signals, live=False)

    return jsonify({"probability": round(p, 4),
                    "predicted_ring_purity": round(purity, 4),
                    "action": action,
                    "expected_cost_rupees": {k: int(round(float(v)))
                                             for k, v in costs.items()},
                    "reason": note["note"],
                    "reason_source": note["source"],
                    "calibration": m["method"]})


@app.get("/runs/<run_id>")
def run(run_id: str):
    """A saved batch result by name, for example /runs/holdout."""
    safe = os.path.basename(run_id) + ".json"
    path = os.path.join(config.RESULTS_DIR, safe)
    if not os.path.exists(path):
        available = sorted(f[:-5] for f in os.listdir(config.RESULTS_DIR)
                           if f.endswith(".json"))
        return jsonify({"error": "no such run", "available": available}), 404
    with open(path) as f:
        return jsonify(json.load(f))


@app.get("/features")
def feature_list():
    return jsonify({"features": list(FEATURE_NAMES),
                    "model_features": detector().model["features"]})


if __name__ == "__main__":
    # Loopback only. Nothing here should be reachable from the network.
    app.run(host="127.0.0.1", port=5001, debug=False)
