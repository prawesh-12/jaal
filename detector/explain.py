"""Turn a flagged cluster into something a human can act on in ten seconds.

A reviewer handed `cluster_id: 47, p=0.83, size=22` has been told nothing. What
they need is:

    22 accounts created within 4 hours, all from pincode 560034, all used the
    first-order coupon, none ordered again. Strongest linking signal: signup
    timing. Rs.4,400 extracted. Recommended: review.

Every number in that sentence comes from the pipeline. The model only writes
the prose.

**The design rule that matters most: the LLM does no detection.** It reads
structured output and produces a sentence. If it is unavailable, every metric
still computes and every decision is unchanged. That is what makes this
reproducible by someone with no API key, which is the situation this repository
was actually built in.

Three sources, in order of preference:

    cache     a committed JSON file, keyed on the evidence
    live      a call to gpt-oss:120b via Ollama Cloud, needs OLLAMA_API_KEY
    template  a hand-written sentence, always available, never fails

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
FALLBACK_MODEL = "gpt-oss:120b"     # used if the primary is unavailable
HOST = "https://ollama.com"

PROMPT_FIELDS = ("size", "signup_span_days", "coupon_rate", "repeat_rate",
                 "near_min_rate", "total_discount", "pincode_concentration",
                 "distinct_bin_ratio")


def cache_key(facts: dict, p: float, action: str,
              signals: list[tuple[str, float]] | None = None) -> str:
    """Keyed on everything that appears in the note, evidence included.

    The evidence bullets were left out of the key at first, and the audit caught
    it: two clusters with identical rounded facts but different edge strengths
    shared a cache entry, so the second one was handed a note quoting the
    first one's bits. Anything the note can contain has to be in the key.
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
    """The prompt is built entirely from numbers the pipeline produced.

    "Use ONLY the facts below" is not politeness. Without it the model invents
    plausible details, and an invented number in a fraud review note is worse
    than no note at all.
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
    """Always available, never fails. The fallback the whole layer rests on."""
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
        cached["source"] = "cache"
        return cached

    prompt = build_prompt(facts, p, action, top_signals)
    if live:
        try:
            note, used = call_ollama(prompt)
            record = {"key": key, "note": note, "source": "live",
                      "model": used, "action": action, "p": round(float(p), 3)}
            os.makedirs(cache_dir, exist_ok=True)
            with open(path, "w") as f:
                json.dump(record, f, indent=1)
                f.write("\n")
            return record
        except Exception as exc:                     # any failure falls back
            print(f"  live call failed ({type(exc).__name__}), using template")

    record = {"key": key,
              "note": template_explanation(facts, p, action, top_signals),
              "source": "template", "model": None, "action": action,
              "p": round(float(p), 3)}
    os.makedirs(cache_dir, exist_ok=True)
    with open(path, "w") as f:
        json.dump(record, f, indent=1)
        f.write("\n")
    return record


def top_signals(row) -> list[tuple[str, float]]:
    """The evidence bullets, all genuinely measured in bits.

    Cluster size is not a bit count and does not belong on this list, even
    though it is the most eye-catching number on the row.
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
    return set(re.findall(r"\d[\d,]*\.?\d*", text.replace("Rs.", "")))


def audit_note(note: str, facts: dict, p: float,
               signals: list[tuple[str, float]] | None = None) -> list[str]:
    """Numbers in the note that do not trace back to the pipeline.

    Every figure a note may contain comes from either the feature dict or the
    evidence bullets, so both go into the allowed set. Anything else was
    invented, and an invented number in a fraud review note is worse than no
    note at all.

    This catches obvious inventions. It does not catch a model that rephrases a
    real figure into a wrong claim, so ten notes still get read by hand.
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

    # Explain what a human would actually be handed: everything blocked or
    # queued for review, worst first.
    interesting = table.assign(p=p, action=action)
    interesting = interesting[interesting["action"] != "allow"]
    interesting = interesting.nlargest(args.limit, "total_discount")

    print(f"\nwriting {len(interesting)} review notes "
          f"({'live' if args.live else 'cache or template'})")
    notes, sources = [], {"cache": 0, "live": 0, "template": 0}
    flagged_numbers = 0
    for _, row in interesting.iterrows():
        facts = {k: float(row[k]) for k in PROMPT_FIELDS}
        signals = top_signals(row)
        rec = explain(facts, float(row["p"]), str(row["action"]), signals,
                      live=args.live)
        sources[rec["source"]] += 1
        stray = audit_note(rec["note"], facts, float(row["p"]), signals)
        flagged_numbers += bool(stray)
        notes.append({"seed": int(row["seed"]), "tier": row["tier"],
                      "cluster_id": int(row["cluster_id"]),
                      "size": int(row["size"]), "p": round(float(row["p"]), 3),
                      "action": row["action"], "source": rec["source"],
                      "note": rec["note"], "unverified_numbers": stray})

    print(f"sources: " + ", ".join(f"{k} {v}" for k, v in sources.items()))
    print(f"notes containing a number not in the feature dict: {flagged_numbers}")
    print(f"\nexample note ({notes[0]['tier']} tier, seed {notes[0]['seed']}, "
          f"cluster {notes[0]['cluster_id']}):\n")
    print(notes[0]["note"])

    with open(args.out, "w") as f:
        json.dump({"n_notes": len(notes), "sources": sources,
                   "notes_with_unverified_numbers": flagged_numbers,
                   "live_attempted": args.live, "notes": notes}, f, indent=1)
        f.write("\n")
    print(f"\nwrote {args.out} and {len(notes)} cache entries in {CACHE_DIR}/")


if __name__ == "__main__":
    main()
