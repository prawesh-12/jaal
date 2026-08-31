# CLAUDE.md

## Project

Jaal is a fraud-risk system for detecting coordinated first-order promotional abuse.

The core problem is that individual transactions can look completely legitimate while many accounts are actually controlled by one operator.

The detection unit is the **cluster, not the transaction**.

Jaal's core pipeline is:

Account data
→ Blocking
→ Pair linkage
→ Graph
→ Clustering
→ Cluster features
→ Ring probability + purity
→ Cost-based decision
→ Block / Review / Allow

Jaal is a defence-only project and all evaluation data is synthetic.

The actual detection engine is separate from the frontend/demo experience.

## Source of truth

Use the existing project code, configuration, result files, tests, and documentation as the source of truth.

Read `end_to_end.md` for the current product/frontend implementation plan.

Read `docs/` for technical details and measured results.

Do not invent metrics, model behavior, API behavior, or product capabilities.

Do not silently change the underlying detection logic or published results.

## Non-negotiable rules

1. Never invent a number. Use measured project data.
2. Never fabricate a result, simulation state, API response, or model capability.
3. Never change the ML/detection logic while working on the frontend unless explicitly required.
4. Never present Jaal as a checkout authorization gate. It is a triage/risk layer.
5. Never claim the shipped model is universally transferable to real merchants.
6. Never expose or commit secrets.
7. Preserve the existing tests and keep them passing.
8. Preserve the distinction between validation data and sealed holdout data.
9. Never tune against sealed holdout results.
10. Keep synthetic evaluation data clearly identified as synthetic.
11. Do not duplicate detection logic inside the frontend.
12. Do not create fake demo logic to make the UI appear functional.

## Frontend rules

The frontend is a product experience, not a research paper.

Use Three.js / React Three Fiber as the primary visual system.

Use:

- Three.js: https://threejs.org/docs/
- React Three Fiber: https://r3f.docs.pmnd.rs/
- Drei: https://drei.docs.pmnd.rs/
- shadcn/ui: https://ui.shadcn.com/

Use React/HTML controls where they are better for readability or accessibility, but maintain one coherent Three.js-first visual language.

Prefer visual explanation over long explanatory text.

Do not add:

- unnecessary cards
- decorative UI
- fake statistics
- generic AI marketing copy
- unnecessary animations
- random particles/glows
- purple/neon/cyberpunk styling
- unrelated illustrations
- unnecessary pages
- unnecessary comments
- unnecessary dependencies

Every visual element must communicate product behavior, data, risk, scale, or a decision.

## Commenting rules

Comments are allowed only when they explain something that is genuinely non-obvious from the code itself.

Default rule:

**Prefer no comment over a bad comment.**

Do not add comments that describe obvious code.

Never add comments such as:

```ts
// Render the component
// Handle the click
// Update the state
// Set the theme
// Create the scene
// Add the nodes
// Loop through accounts
// Fetch the data
// This component is responsible for...
// This function handles...
// This section shows...
```

## Simulation rules

The Simulation must represent the real Jaal pipeline.

It must use:

- real execution, or
- deterministic replay of genuine Jaal outputs.

If replay is used, label it clearly.

Do not fabricate:

- accounts
- edges
- clusters
- scores
- probabilities
- purity
- costs
- decisions

The simulation must show:

Dataset
→ Accounts
→ Blocking
→ Pair evidence
→ Graph
→ Clusters
→ Probability + purity
→ Cost
→ Block / Review / Allow

Do not render the full possible-pair space literally.

Use efficient Three.js rendering and aggregate representations where necessary.

## UI content rules

The primary experience must quickly answer:

- What is Jaal?
- Why is transaction-level detection insufficient?
- How does Jaal work?
- What result did it achieve?
- Where does it fail?
- How can a merchant integrate it?

Keep technical depth available in Deep Dive without forcing every visitor to read it.

## Code quality

Inspect existing code before changing it.

Reuse working components and data sources where possible.

Do not rewrite functioning backend or detection code unnecessarily.

Do not create duplicate sources of truth.

Do not leave dead routes, dead controls, fake buttons, or placeholder functionality.

Do not add verbose comments explaining obvious code.

Only add comments when they clarify genuinely non-obvious implementation behavior.

## Validation

Before declaring work complete:

- run the relevant tests
- build the application
- run the application in a real browser
- visually inspect every affected page
- test all important interactions
- verify displayed metrics against the source data
- verify API examples against the actual implementation
- verify the Simulation uses real data/results
- verify no unsupported product claims were introduced

Do not declare success based only on a successful build.

## Priority

When instructions conflict, prioritize in this order:

1. Correctness of the Jaal detection system
2. Truthfulness of data/results
3. Project safety and integrity
4. Product clarity
5. Visual quality
6. Convenience

Do not sacrifice correctness or truthfulness for visual polish.
