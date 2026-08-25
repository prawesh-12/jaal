# L1: Containers

The runnable parts and where data rests between them. Everything that produces a
number lives in `detector/`. The API and the UI only read what it wrote.

```mermaid
flowchart TB
    subgraph det[detector/ , Python, the only place detection happens]
        RUN[run.py<br/>end to end pipeline]
        GEN[generate_accounts.py<br/>test fixture]
    end
    PRI[(data/olist_priors.json)] --> GEN
    GEN --> RUN
    RUN --> RES[(results/*.json, *.png<br/>metrics, curves, decisions)]
    RUN --> CACHE[(cache/explanations/<br/>committed LLM responses)]
    RES --> API[api/ , Flask<br/>two endpoints]
    RES --> UI[ui/ , React + Vite]
    API --> UI
    OLL{{Ollama Cloud<br/>optional, cached}} -.-> RUN
```

`run.sh` drives `detector/run.py` and needs no network. The Ollama call is the
only outbound arrow in the whole system, it only writes review sentences, and
its answers are committed to `cache/explanations/` so a judge with no API key
reproduces every result.

Take away: there is a hard boundary at `results/`. No detection logic exists on
the far side of it.
