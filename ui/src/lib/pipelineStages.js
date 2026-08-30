import { count, dp2, dp4, pct, rupees } from "@/lib/format";

/*
  The pipeline visualisation runs off this model and nothing else. Every value
  in it is read out of a results file the pipeline wrote: blocking.json,
  link_params.json, clustering.json, model.json and decisions.json. Nothing is
  computed here except the pair count, which is n choose 2 of the accounts in
  a world, and the bits per comparison level, which is log2(m / u) exactly as
  detector/link.py defines it.
*/

export const SCORED = ["device", "address", "pincode", "card_bin", "ip_prefix",
                       "signup_gap", "hour_of_day", "order_count", "coupon_used"];

export const bitsFor = (params, field, level) =>
  Math.log2(params.m[field][level] / params.u[field][level]);

export function agreementWeights(params) {
  const out = [];
  for (const field of SCORED) {
    params.levels[field].forEach((level, i) => {
      const v = bitsFor(params, field, i);
      if (level !== "no" && v > 0) out.push({ field, level, bits: v });
    });
  }
  return out.sort((a, b) => b.bits - a.bits);
}

export function buildStages({ blocking, link, clustering, model, decisions, tier }) {
  const b = blocking.tiers[tier];
  const c = clustering.tiers[tier];
  const n = blocking.n_accounts_per_world;
  const possiblePairs = (n * (n - 1)) / 2;
  const weights = agreementWeights(link);

  const topFeatures = Object.entries(model.permutation_importance)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  return [
    {
      id: "input",
      name: "Accounts",
      what: "One merchant's population arrives as a batch.",
      process: "A batch of account records, one row per account.",
      input: null,
      output: { value: n, display: count(n), label: "accounts" },
      scale: n,
      rail: { value: n, display: count(n), label: "accounts" },
      facts: [
        ["Accounts per world", count(n)],
        ["Worlds measured", count(blocking.n_seeds)],
        ["Seeds", `${blocking.seed_range[0]} to ${blocking.seed_range[1]}`],
      ],
    },
    {
      id: "block",
      name: "Block",
      what: "Most pairs are never worth comparing, so they are never compared.",
      process: `${b ? blocking.rules.length : 0} blocking rules, then a dedupe across them.`,
      input: {
        value: possiblePairs, display: count(possiblePairs), label: "possible pairs",
      },
      output: {
        value: b.candidate_pairs_mean, display: count(b.candidate_pairs_mean),
        label: "candidate pairs",
      },
      scale: b.candidate_pairs_mean,
      rail: {
        value: b.candidate_pairs_mean, display: count(b.candidate_pairs_mean),
        label: "candidate pairs",
        from: { value: possiblePairs, display: count(possiblePairs),
                label: "possible pairs" },
      },
      rules: blocking.rules.map((rule) => ({
        rule, recall: b.recall_by_rule[rule],
      })),
      facts: [
        ["Search space cut", pct(b.pair_reduction_ratio, 2)],
        ["Blocking recall", dp4(b.blocking_recall)],
        ["Worst world", dp4(b.recall_min)],
        ["True pairs present", count(b.true_pairs_mean)],
      ],
      note: "A true pair no rule produces can never be recovered later, which "
          + "is why blocking recall is reported as a ceiling rather than a score.",
    },
    {
      id: "link",
      name: "Link",
      what: "Every surviving pair accumulates evidence, measured in bits.",
      process: `${SCORED.length} comparisons, each worth log2(m / u).`,
      input: {
        value: b.candidate_pairs_mean, display: count(b.candidate_pairs_mean),
        label: "candidate pairs",
      },
      output: {
        value: clustering.edge_threshold_bits,
        display: `${dp2(clustering.edge_threshold_bits)} bits`,
        label: "to draw an edge",
      },
      scale: b.candidate_pairs_mean,
      // Its output is a threshold in bits, not a count, so the rail shows the
      // edges that clear it instead, which the cluster stage carries.
      rail: null,
      weights,
      facts: [
        ["Comparisons", SCORED.length],
        ["Edge threshold", `${dp2(clustering.edge_threshold_bits)} bits`],
        ["m estimated from", link.m_source],
        ["Seed pair purity", pct(link.seed_purity, 2)],
        ["Prior odds of a match", `1 in ${count(Math.round(1 / link.prior_match_rate))}`],
      ],
      note: "Disagreement carries negative weight, so a pair that shares "
          + "nothing ends up far below the threshold rather than near it.",
    },
    {
      id: "cluster",
      name: "Cluster",
      what: "Pairs above the threshold become a graph, and the graph is cut into groups.",
      process: `Leiden at resolution ${clustering.resolution}.`,
      input: { value: c.edges, display: count(c.edges), label: "edges kept" },
      output: { value: c.n_clusters, display: count(c.n_clusters), label: "clusters" },
      scale: c.n_clusters,
      rail: {
        value: c.n_clusters, display: count(c.n_clusters), label: "clusters",
        from: { value: c.edges, display: count(c.edges),
                label: "edges above the threshold" },
      },
      facts: [
        ["Edges above threshold", count(c.edges)],
        ["Clusters found", count(c.n_clusters)],
        ["Groups too small to keep", count(c.dropped_small)],
        ["Rings present", c.n_rings],
        ["Rings fully intact", c.rings_fully_intact],
        ["Largest cluster", c.max_cluster_size],
      ],
      note: `Groups under ${clustering.min_cluster_size} accounts are dropped. `
          + "A pair on its own is not a ring.",
    },
    {
      id: "features",
      name: "Features",
      what: "Each cluster becomes a row of numbers a model can read.",
      process: "Structural, temporal, behavioural and economic features.",
      input: { value: c.n_clusters, display: count(c.n_clusters), label: "clusters" },
      output: {
        value: model.n_features, display: String(model.n_features),
        label: "features per cluster",
      },
      scale: model.n_features,
      rail: {
        value: model.n_features, display: String(model.n_features),
        label: "features per cluster",
      },
      features: topFeatures,
      facts: [
        ["Features per cluster", model.n_features],
        ["Dropped as redundant", model.dropped_features.length],
        ["Training clusters", count(model.n_train_clusters)],
        ["Held out", count(model.n_val_clusters)],
      ],
    },
    {
      id: "score",
      name: "Score",
      what: "The features resolve into one calibrated probability.",
      process: `Random forest, ${model.calibration_method} calibration.`,
      input: {
        value: model.n_features, display: String(model.n_features), label: "features",
      },
      output: {
        value: 1, display: model.brier_isotonic.toFixed(5), label: "Brier, pooled",
      },
      scale: 1,
      rail: { value: 1, display: "1", label: "score per cluster" },
      facts: [
        ["Calibration", model.calibration_method],
        ["Brier, isotonic", model.brier_isotonic.toFixed(5)],
        ["Brier, Platt", model.brier_sigmoid.toFixed(5)],
        ["Brier, uncalibrated", model.brier_raw.toFixed(5)],
        ["Purity model error", model.purity_model.mae.toFixed(5)],
      ],
      note: "A second model predicts how much of the cluster is really a ring, "
          + "because the cost of an action depends on purity and not on a class.",
    },
    {
      id: "decide",
      name: "Decide",
      what: "Each action is priced, and the cheapest one wins.",
      process: "Expected cost of block, review and allow.",
      input: { value: 1, display: "1", label: "probability and purity" },
      output: { value: 3, display: "3", label: "possible actions" },
      scale: 3,
      rail: { value: 3, display: "3", label: "possible actions" },
      actions: decisions
        ? [
            { name: "block", price: decisions.cost_blocked_innocent,
              what: "per innocent account stopped", tone: "bad" },
            { name: "review", price: decisions.cost_analyst_review,
              what: "per cluster a human reads", tone: "warn" },
            { name: "allow", price: decisions.cost_missed_abuser,
              what: "per ring account let through", tone: "ok" },
          ]
        : [],
      facts: decisions
        ? [
            ["Blocking a real customer", rupees(decisions.cost_blocked_innocent)],
            ["Missing an abuser", rupees(decisions.cost_missed_abuser)],
            ["One analyst review", rupees(decisions.cost_analyst_review)],
            ["Blocking pays above", pct(decisions.breakeven_precision, 2)],
          ]
        : [],
      note: "Only one action is taken per cluster. Which one depends on the "
          + "three prices above, which belong to the merchant, not the model.",
    },
  ];
}
