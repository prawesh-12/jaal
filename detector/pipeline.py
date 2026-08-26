"""One batch of accounts in, one decision per cluster out.

This is what a merchant calls. Everything the detector does is here in order:
block, score pairs, cluster, extract features, score the cluster, price the
three actions, write a reason.

    from detector.pipeline import Detector
    d = Detector.load()
    for cluster in d.scan(accounts_dataframe):
        print(cluster["action"], cluster["accounts"])
"""

from __future__ import annotations

import gzip
import json
import pickle
import time
from dataclasses import dataclass

import numpy as np
import pandas as pd

from detector import cluster as clustering
from detector import decide, explain, features, link
from detector.blocking import candidate_pairs

REQUIRED_COLUMNS = ("account_id", "device_id", "ip_prefix", "address_id",
                    "pincode", "card_bin", "signup_ts", "n_orders",
                    "coupon_used", "first_order_value", "total_order_value",
                    "days_to_second_order")


@dataclass
class Detector:
    params: dict
    model: dict

    @classmethod
    def load(cls, params_path: str = "results/link_params.json",
             model_path: str = "results/model.pkl") -> "Detector":
        with open(params_path) as f:
            params = json.load(f)
        with gzip.open(model_path, "rb") as f:
            model = pickle.load(f)
        return cls(params=params, model=model)

    def scan(self, accounts: pd.DataFrame, explain_notes: bool = True,
             live: bool = False) -> dict:
        """Run every stage over one batch and return what to do about it."""
        missing = [c for c in REQUIRED_COLUMNS if c not in accounts.columns]
        if missing:
            raise ValueError(f"accounts is missing {len(missing)} column(s): "
                             f"{', '.join(missing)}")

        accounts = accounts.reset_index(drop=True)
        timings, t0 = {}, time.perf_counter()

        pairs, block_stats = candidate_pairs(accounts)
        timings["block_ms"] = round((time.perf_counter() - t0) * 1000, 1)

        t = time.perf_counter()
        bits, contributions = link.score_pairs(accounts, pairs, self.params)
        timings["link_ms"] = round((time.perf_counter() - t) * 1000, 1)

        t = time.perf_counter()
        graph = clustering.build_graph(pairs, bits, len(accounts))
        keep = bits >= clustering.EDGE_THRESHOLD_BITS
        graph.es["contributions"] = contributions[keep].tolist()
        groups, _ = clustering.filter_by_size(clustering.leiden_clusters(graph))
        timings["cluster_ms"] = round((time.perf_counter() - t) * 1000, 1)

        if not groups:
            timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
            return {"n_accounts": len(accounts), "n_clusters": 0,
                    "clusters": [], "summary": _empty_summary(),
                    "timings_ms": timings, "blocking": block_stats}

        t = time.perf_counter()
        rows = []
        for members in groups:
            sub = graph.subgraph(members)
            contrib = (np.asarray(sub.es["contributions"], dtype=float)
                       if sub.ecount() else None)
            rows.append({**features.cluster_features(accounts, graph, members,
                                                     contrib),
                         "dominant_signal": features.dominant_signal(graph,
                                                                     members)})
        table = pd.DataFrame(rows)
        timings["features_ms"] = round((time.perf_counter() - t) * 1000, 1)

        t = time.perf_counter()
        X = table[self.model["features"]]
        probability = self.model["calibrator"].predict_proba(X)[:, 1]
        purity = np.clip(self.model["purity"].predict(X), 0.0, 1.0)
        sizes = table["size"].to_numpy()
        actions = decide.best_action(purity, sizes)
        timings["score_ms"] = round((time.perf_counter() - t) * 1000, 1)

        out = []
        for i, members in enumerate(groups):
            costs = decide.expected_costs(float(purity[i]), int(sizes[i]))
            record = {
                "cluster_id": i,
                "size": int(sizes[i]),
                "accounts": accounts.loc[members, "account_id"].tolist(),
                "probability": round(float(probability[i]), 4),
                "predicted_ring_purity": round(float(purity[i]), 4),
                "action": str(actions[i]),
                "expected_cost_rupees": {k: int(round(float(v)))
                                         for k, v in costs.items()},
                "discount_at_risk_rupees": int(table.at[i, "total_discount"]),
                "strongest_signal": table.at[i, "dominant_signal"],
                "evidence_bits": {
                    "mean_edge": round(float(table.at[i, "mean_edge_bits"]), 1),
                    "weakest_edge": round(float(table.at[i, "min_edge_bits"]), 1),
                },
            }
            if explain_notes and record["action"] != "allow":
                facts = {k: float(table.at[i, k]) for k in explain.PROMPT_FIELDS}
                note = explain.explain(facts, record["probability"],
                                       record["action"],
                                       explain.top_signals(table.iloc[i]),
                                       live=live)
                record["reason"] = note["note"]
                record["reason_source"] = note["source"]
            out.append(record)

        timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return {"n_accounts": len(accounts), "n_clusters": len(out),
                "clusters": out, "summary": _summarise(out),
                "timings_ms": timings, "blocking": block_stats}


def _empty_summary() -> dict:
    return {"block": 0, "review": 0, "allow": 0, "accounts_blocked": 0,
            "accounts_for_review": 0, "discount_at_risk_rupees": 0}


def _summarise(clusters: list[dict]) -> dict:
    s = _empty_summary()
    for c in clusters:
        s[c["action"]] += 1
        if c["action"] == "block":
            s["accounts_blocked"] += c["size"]
        elif c["action"] == "review":
            s["accounts_for_review"] += c["size"]
            s["discount_at_risk_rupees"] += c["discount_at_risk_rupees"]
    return s
