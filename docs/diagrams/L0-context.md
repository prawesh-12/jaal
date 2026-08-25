# L0: Context

Who touches Jaal and what crosses the boundary. Look at the arrows into the box:
only account records go in, and only cluster decisions come out. Jaal never
touches a payment rail and never sees a real person's data.

```mermaid
flowchart LR
    M[Merchant<br/>account and order records] -->|batch of accounts| J
    J[Jaal<br/>promo abuse ring detector]
    J -->|block / allow / review<br/>with a written reason| An[Risk analyst]
    An -->|acts on the review queue| M
    G[(Synthetic generator<br/>test fixture)] -.->|worlds with a hidden<br/>answer key| J
    O[(Olist priors<br/>derived JSON)] -.-> G
```

The dotted arrows are the test harness, not production. In a real deployment the
generator is absent and the answer key does not exist, which is the whole reason
the generator has to exist here.

Take away: Jaal is a batch decision service over an account population, and its
most valuable output is often "a human should look at this".
