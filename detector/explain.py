"""Turn a flagged cluster into something a human can act on in ten seconds.

The LLM does no detection. Every number in a note comes from the pipeline and
the model only writes the prose, so with no API key every metric and every
decision is unchanged.

Three sources, in order: cache (a committed JSON file, keyed on the evidence),
live (Ollama Cloud, needs OLLAMA_API_KEY), template (hand written, never fails).

    python -m detector.explain --holdout results/holdout.json --limit 40
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os

import numpy as np
import pandas as pd

import config
from detector.resources import announce, apply

CACHE_DIR = config.CACHE_DIR
MODEL = "minimax-m3:cloud"
FALLBACK_MODEL = "gpt-oss:120b"
HOST = "https://ollama.com"

PROMPT_FIELDS = ("size", "signup_span_days", "coupon_rate", "repeat_rate",
                 "near_min_rate", "total_discount", "pincode_concentration",
                 "distinct_bin_ratio")


def cache_key(facts: dict, p: float, action: str,
              signals: list[tuple[str, float]] | None = None) -> str:
    """Keyed on everything a note can contain, evidence bullets included.

    Leaving the bullets out gave 7 notes out of 1,334 another cluster's bit
    values.
    """
    payload = json.dumps({"f": {k: round(float(facts[k]), 4)
                                for k in sorted(facts)},
                          "p": round(float(p), 3), "a": action,
                          "s": [[n, round(float(b), 2)]
                                for n, b in (signals or [])]},
                         sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def build_prompt(facts: dict, p: float, action: str,
                 top_signals: list[tuple[str, float]]) -> str:
    """Built only from numbers the pipeline produced.

    "Use ONLY the facts below" stops the model from inventing details.
    """
    signals = ", ".join(f"{name} {bits:+.1f} bits" for name, bits in top_signals)
    return f"""You are writing a one-paragraph review note for a fraud analyst.
Use ONLY the facts below. Do not speculate and do not add any number that is
not listed here.

Cluster size: {facts['size']:.0f} accounts
Signup span: {facts['signup_span_days']:.1f} days
Coupon usage: {facts['coupon_rate']:.0%} of accounts
Repeat orders: {facts['repeat_rate']:.0%} of accounts
Order values near the coupon minimum: {facts['near_min_rate']:.0%}
Largest share in one pincode: {facts['pincode_concentration']:.0%}
Distinct card BINs per account: {facts['distinct_bin_ratio']:.2f}
Total discount extracted: Rs.{facts['total_discount']:,.0f}
Strongest linking signals: {signals}
Calibrated probability this is a ring: {p:.2f}
Recommended action: {action}

Write 2 sentences, then list the 3 strongest signals as bullets."""


def template_explanation(facts: dict, p: float, action: str,
                         top_signals: list[tuple[str, float]]) -> str:
    """Always available and never fails. Used when there is no cache entry and
    no live call."""
    bullets = "\n".join(f"  - {name.replace('_', ' ')}: {bits:+.1f} bits"
                        for name, bits in top_signals[:3])
    return (
        f"{facts['size']:.0f} accounts created over "
        f"{facts['signup_span_days']:.1f} days, "
        f"{facts['pincode_concentration']:.0%} of them in one pincode. "
        f"{facts['coupon_rate']:.0%} used the first-order coupon and "
        f"{facts['repeat_rate']:.0%} ever ordered again, extracting "
        f"Rs.{facts['total_discount']:,.0f} in discounts. "
        f"Calibrated probability {p:.2f}. Recommended: {action}.\n"
        f"Strongest linking evidence:\n{bullets}"
    )


def call_ollama(prompt: str, timeout: float = 90.0) -> tuple[str, str]:
    """Live call, primary model then fallback. Raises if both fail."""
    from ollama import Client

    key = os.environ.get("OLLAMA_API_KEY")
    if not key:
        raise RuntimeError("OLLAMA_API_KEY is not set")
    client = Client(host=HOST, headers={"Authorization": f"Bearer {key}"},
                    timeout=timeout)

    last = None
    for model in (MODEL, FALLBACK_MODEL):
        try:
            resp = client.chat(model=model,
                               messages=[{"role": "user", "content": prompt}])
            return resp["message"]["content"].strip(), model
        except Exception as exc:
            last = exc
    raise RuntimeError(f"both models failed, last error: {last}")


def explain(facts: dict, p: float, action: str,
            top_signals: list[tuple[str, float]], live: bool = False,
            cache_dir: str = CACHE_DIR) -> dict:
    """One review note, with the source it came from recorded."""
    key = cache_key(facts, p, action, top_signals)
    path = os.path.join(cache_dir, f"{key}.json")

    if os.path.exists(path):
        with open(path) as f:
            cached = json.load(f)
        cached["from_cache"] = True
        return cached

    prompt = build_prompt(facts, p, action, top_signals)
    if live:
        try:
            note, used = call_ollama(prompt)
            record = {"key": key, "note": note, "source": "live",
                      "from_cache": False, "model": used, "action": action,
                      "p": round(float(p), 3)}
            os.makedirs(cache_dir, exist_ok=True)
            with open(path, "w") as f:
                json.dump(record, f, indent=1)
                f.write("\n")
            return record
        except Exception as exc:                     # any failure falls back
            print(f"  live call failed ({type(exc).__name__}), using template")

    record = {"key": key,
              "note": template_explanation(facts, p, action, top_signals),
              "source": "template", "from_cache": False, "model": None,
              "action": action, "p": round(float(p), 3)}
    os.makedirs(cache_dir, exist_ok=True)
    with open(path, "w") as f:
        json.dump(record, f, indent=1)
        f.write("\n")
    return record


def top_signals(row) -> list[tuple[str, float]]:
    """The evidence bullets, all genuinely measured in bits.

    Cluster size is left out because it is not measured in bits.
    """
    return [
        (f"{row['dominant_signal']} agreement, average edge",
         float(row["mean_edge_bits"])),
        ("weakest link inside the cluster", float(row["min_edge_bits"])),
        ("spread of edge strength", float(row["weight_spread"])),
    ]


def numbers_in(text: str) -> set[str]:
    """Every numeric token in a note, for the invented-number check."""
    import re
    return set(re.findall(r"\d[\d,]*(?:\.\d+)?", text.replace("Rs.", "")))


def audit_note(note: str, facts: dict, p: float,
               signals: list[tuple[str, float]] | None = None) -> list[str]:
    """Numbers in the note that do not trace back to the pipeline.

    Allowed figures come from the feature dict and the evidence bullets. This
    catches an invented number, not a real one rephrased into a wrong claim.
    """
    allowed = {"0", "1", "2", "3"}
    values = list(facts.values()) + [p]
    values += [bits for _, bits in (signals or [])]
    for v in values:
        for form in (f"{v:.0f}", f"{v:.1f}", f"{v:.2f}",
                     f"{abs(v):.1f}", f"{v * 100:.0f}", f"{v:,.0f}"):
            allowed.add(form.replace(",", ""))
    return sorted(n for n in numbers_in(note)
                  if n.replace(",", "") not in allowed)


def main() -> None:
    p_arg = argparse.ArgumentParser(description=__doc__)
    p_arg.add_argument("--features", default="results/features_holdout.csv")
    p_arg.add_argument("--model", default="results/model.pkl")
    p_arg.add_argument("--limit", type=int, default=40)
    p_arg.add_argument("--live", action="store_true",
                       help="try Ollama Cloud, needs OLLAMA_API_KEY")
    p_arg.add_argument("--out", default="results/explanations.json")
    args = p_arg.parse_args()

    import gzip
    import pickle

    from detector import decide

    announce(apply())
    with gzip.open(args.model, "rb") as f:
        fitted = pickle.load(f)
    table = pd.read_csv(args.features)

    X = table[fitted["features"]]
    p = fitted["calibrator"].predict_proba(X)[:, 1]
    purity = np.clip(fitted["purity"].predict(X), 0.0, 1.0)
    action = decide.best_action(purity, table["size"].to_numpy())

    # A human is only ever handed the blocked and reviewed clusters, worst first.
    interesting = table.assign(p=p, action=action)
    interesting = interesting[interesting["action"] != "allow"]
    interesting = interesting.nlargest(args.limit, "total_discount")

    print(f"\nwriting {len(interesting)} review notes "
          f"({'live' if args.live else 'cache or template'})")
    notes, sources = [], {"live": 0, "template": 0}
    from_cache = 0
    flagged_numbers = 0
    for _, row in interesting.iterrows():
        facts = {k: float(row[k]) for k in PROMPT_FIELDS}
        signals = top_signals(row)
        rec = explain(facts, float(row["p"]), str(row["action"]), signals,
                      live=args.live)
        sources[rec["source"]] += 1
        from_cache += bool(rec.get("from_cache"))
        stray = audit_note(rec["note"], facts, float(row["p"]), signals)
        flagged_numbers += bool(stray)
        notes.append({"seed": int(row["seed"]), "tier": row["tier"],
                      "cluster_id": int(row["cluster_id"]),
                      "size": int(row["size"]), "p": round(float(row["p"]), 3),
                      "action": row["action"], "source": rec["source"],
                      "from_cache": bool(rec.get("from_cache")),
                      "model": rec.get("model"),
                      "note": rec["note"], "unverified_numbers": stray})

    print(f"sources: " + ", ".join(f"{k} {v}" for k, v in sources.items())
          + f" ({from_cache} served from cache)")
    print(f"notes containing a number not in the feature dict: {flagged_numbers}")
    print(f"\nexample note ({notes[0]['tier']} tier, seed {notes[0]['seed']}, "
          f"cluster {notes[0]['cluster_id']}):\n")
    print(notes[0]["note"])

    with open(args.out, "w") as f:
        json.dump({"n_notes": len(notes), "sources": sources,
                   "served_from_cache": from_cache,
                   "notes_with_unverified_numbers": flagged_numbers,
                   "live_attempted": args.live, "notes": notes}, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out} and {len(notes)} cache entries in {CACHE_DIR}/")


if __name__ == "__main__":
    main()
