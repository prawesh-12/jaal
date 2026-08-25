# Sequence: cache hit and cache miss

Why the explanation layer is reproducible by someone with no API key.

```mermaid
sequenceDiagram
    participant D as decide.py
    participant E as explain.py
    participant C as cache/explanations/
    participant O as Ollama Cloud

    D->>E: features, probability, action, evidence
    E->>E: sha256 of the facts, first 16 hex chars
    E->>C: is {key}.json there?
    alt cache hit
        C-->>E: the note, source "cache"
    else cache miss, live enabled and a key is set
        E->>O: prompt built only from pipeline numbers
        O-->>E: two sentences and three bullets
        E->>C: write {key}.json, source "live"
    else cache miss, no key or the call failed
        E->>E: template_explanation(), source "template"
        E->>C: write {key}.json, source "template"
    end
    E-->>D: note plus the source it came from
```

Three things about this that are deliberate.

**The key is the evidence, not the cluster id.** Two clusters with identical
rounded facts share a note, and re-running the pipeline reproduces the same key,
so a committed cache keeps working.

**Every branch writes to the cache.** A template note is cached the same way a
live one is, so the source is recorded honestly rather than being recomputed and
silently changing.

**Failure is not an error.** Any exception from the live path falls through to
the template. The pipeline finishes with the network unplugged.

Take away: the model writes prose and nothing else. Pull the network out and
every number in this repository still computes.
