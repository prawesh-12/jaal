import { useMemo, useState } from "react";

import { Disclosure } from "@/components/disclosure";
import { Empty, Skeleton } from "@/components/section";
import { EngineStack } from "@/three/EngineStack";
import { useJson } from "@/lib/useJson";
import { count, dp2, dp4, pct, rupees } from "@/lib/format";
import Cost from "@/views/Cost";
import Queue from "@/views/Queue";
import Charts from "@/views/Charts";

/* Every row is read out of the file the stage wrote, so opening a plate is
   reading that stage's own record rather than a description of it. */
function buildStages({ blocking, link, clustering, model, decisions, linkEval }) {
  const at14 = linkEval?.sweep?.obvious?.find((s) => s.threshold_bits === 14);
  const b = blocking.tiers.obvious;
  const c = clustering.tiers?.obvious;

  return [
    {
      id: "blocking",
      name: "Blocking",
      badge: `${blocking.rules.length} rules`,
      why: "Twelve thousand accounts make 72 million pairs. Only pairs that agree on some coarse key are ever compared, and no rule blocks on pincode alone because the busiest pincode holds thousands of accounts.",
      rows: [
        ["Rules", blocking.rules.join(", ")],
        ["Max block size", count(blocking.max_block_size)],
        ["Candidate pairs, obvious tier", count(b.candidate_pairs_mean)],
        ["Search space cut", pct(b.pair_reduction_ratio, 3)],
        ["Blocking recall", dp4(b.blocking_recall)],
        ["Worst world", dp4(b.recall_min)],
      ],
      note: "A true pair no rule produces can never be recovered later, so this recall is a hard ceiling on everything downstream.",
    },
    {
      id: "link",
      name: "Pair evidence",
      badge: "Fellegi-Sunter",
      why: "Each field agreement is worth log2(m / u) bits and a pair's score is the sum. m and u are estimated without labels, so a score can be read back to an analyst as the fields that produced it.",
      rows: [
        ["m estimated from", String(link.m_source)],
        ["Seed pair purity", pct(link.seed_purity, 2)],
        ["u sampled from", `${count(link.u_samples)} pairs`],
        ["Comparisons scored", link.levels ? Object.keys(link.levels).length : "—"],
        ["Term frequency weight", dp2(0.75)],
      ],
      note: "Rare values carry more evidence than common ones, so a device two accounts share outweighs one three hundred share.",
    },
    {
      id: "threshold",
      name: "Edge threshold",
      badge: `${clustering.edge_threshold_bits} bits`,
      why: "Swept from zero upward. Lower and the graph collapses into one giant component; higher and true pairs drop out.",
      rows: at14 ? [
        ["Threshold", `${clustering.edge_threshold_bits} bits`],
        ["Edges kept", count(at14.edges)],
        ["Pair precision", dp4(at14.precision)],
        ["Pair recall", dp4(at14.recall)],
      ] : [["Threshold", `${clustering.edge_threshold_bits} bits`]],
      note: "At 6 bits Leiden returned clusters of 1,812 accounts and pair F1 of 0.0014.",
    },
    {
      id: "cluster",
      name: "Clustering",
      badge: "Leiden",
      why: "Leiden rather than Louvain, because Louvain can return a community that is internally disconnected, and a disconnected ring is not a ring. Both are run and Louvain's failures are counted.",
      rows: [
        ["Algorithm", "Leiden, RBConfiguration"],
        ["Resolution", clustering.resolution],
        ["Minimum cluster size", clustering.min_cluster_size],
        ["Random seed", clustering.seed],
        ...(c ? [
          ["Pair F1, obvious tier", dp4(c.leiden?.pair_f1 ?? c.pair_f1 ?? 0)],
        ] : []),
      ],
      note: "Community detection is randomised, so the seed is pinned and the same world always gives the same clusters.",
    },
    {
      id: "features",
      name: "Cluster features",
      badge: `${model.n_features} features`,
      why: "A cluster becomes a fixed-length row: how it is shaped, when it signed up, how it behaved, and what it took. Nothing in the row is an account-level score.",
      rows: [
        ["Features kept", model.n_features],
        ["Dropped as leaky or redundant", model.dropped_features?.length ?? 0],
        ["Training clusters", count(model.n_train_clusters)],
        ["Validation clusters", count(model.n_val_clusters)],
        ["Top signal", Object.entries(model.permutation_importance)
          .sort((a, x) => x[1] - a[1])[0][0]],
      ],
      note: "Fit seeds, calibration seeds and validation seeds are disjoint, and the holdout is opened once.",
    },
    {
      id: "model",
      name: "Two models",
      badge: model.calibration_method,
      why: "The classifier answers whether a cluster is a ring. The purity model answers what fraction of it is. A cost is charged per account, so the decision needs the second number.",
      rows: [
        ["Forest, raw PR-AUC", dp4(model.variants.forest_raw.all_tiers_pooled.pr_auc)],
        ["Small neural net, PR-AUC", dp4(model.variants.mlp_raw.all_tiers_pooled.pr_auc)],
        ["Brier, raw", model.brier_raw.toFixed(5)],
        ["Brier, calibrated", model.brier_isotonic.toFixed(5)],
        ["Purity error", model.purity_model.mae.toFixed(5)],
        ["Purity error on rings", model.purity_model.mae_on_ring_clusters.toFixed(5)],
      ],
      note: "The neural net won on validation. The forest shipped because the decision layer needs a probability it can price and a feature it can name.",
    },
    {
      id: "decide",
      name: "Priced decision",
      badge: decisions ? pct(decisions.breakeven_precision, 2) : "",
      why: "Three prices, three actions, and whichever costs least wins. No probability threshold appears anywhere in this stage.",
      rows: decisions ? [
        ["Wrong block", rupees(decisions.cost_blocked_innocent)],
        ["Missed abuser", rupees(decisions.cost_missed_abuser)],
        ["Analyst review", rupees(decisions.cost_analyst_review)],
        ["Break-even precision", pct(decisions.breakeven_precision, 2)],
        ["Calibration", decisions.calibration_method],
      ] : [],
      note: "Change the three prices and the answer moves. They belong to the merchant, not to the model.",
    },
  ];
}

function Answer({ q, children }) {
  return (
    <Disclosure summary={<span className="text-[14.5px] text-fg">{q}</span>}>
      <p className="max-w-[80ch] text-[13.5px] leading-[1.7] text-fg-muted">{children}</p>
    </Disclosure>
  );
}

function Area({ title, what, children }) {
  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</span>
          <span className="t-meta text-fg-faint">{what}</span>
        </span>
      }
    >
      <div className="-ml-7.5">{children}</div>
    </Disclosure>
  );
}

export default function DeepDive() {
  const link = useJson("link_params");
  const clustering = useJson("clustering");
  const model = useJson("model");
  const decisions = useJson("decisions");
  const blocking = useJson("blocking");
  const holdout = useJson("holdout");
  const explanations = useJson("explanations");
  const linkEval = useJson("link_eval");
  const [selected, setSelected] = useState("link");

  const ready = model.data && clustering.data && link.data && blocking.data;
  const stages = useMemo(() => (ready ? buildStages({
    blocking: blocking.data, link: link.data, clustering: clustering.data,
    model: model.data, decisions: decisions.data, linkEval: linkEval.data,
  }) : []), [ready, blocking.data, link.data, clustering.data, model.data,
             decisions.data, linkEval.data]);

  if (model.loading || clustering.loading) {
    return <Skeleton className="mt-16 h-96 w-full" />;
  }
  if (!ready) return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;

  const open = stages.find((s) => s.id === selected) ?? stages[0];

  return (
    <div>
      <div className="grid gap-x-12 gap-y-8 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div>
          <div className="label">The engine, plate by plate</div>
          <h1 className="mt-4 max-w-[22ch] text-[32px] leading-[1.1] font-medium tracking-[-0.03em] text-fg text-balance sm:text-[38px]">
            Pick a stage. It opens its own record.
          </h1>
          <div className="mt-7 h-[min(62vh,580px)] border border-line">
            <EngineStack stages={stages} selected={selected} onPick={setSelected}
                         className="h-full w-full" />
          </div>
        </div>

        <div className="lg:pt-26">
          <div className="border border-line-strong">
            <div className="border-b border-line px-5 py-4">
              <div className="label">{open.badge}</div>
              <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.015em] text-fg">
                {open.name}
              </h2>
              <p className="mt-3 text-[13.5px] leading-[1.65] text-fg-muted">
                {open.why}
              </p>
            </div>
            <dl className="px-5 py-2">
              {open.rows.map(([k, v]) => (
                <div key={k}
                     className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
                  <dt className="text-[13px] text-fg-muted">{k}</dt>
                  <dd className="tnum max-w-[55%] text-right text-[13px] text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            {open.note && (
              <p className="border-t border-line px-5 py-4 text-[12.5px] leading-[1.6] text-fg-faint">
                {open.note}
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="mt-16 border-t border-line-strong pt-10">
        <h2 className="text-[21px] font-medium tracking-[-0.015em] text-fg">
          Questions the plates do not answer
        </h2>
        <div className="mt-6 border-t border-line-strong">
          <Answer q="Why not simple rules on shared device and address?">
            They were built and measured, and they are on the Results page. On
            the obvious tier they reach full recall and still lose money, because
            blocking only pays above{" "}
            {decisions.data ? pct(decisions.data.breakeven_precision, 2) : "the break-even"}{" "}
            precision. On the adaptive tier they block hundreds of accounts and
            every one of them is innocent.
          </Answer>
          <Answer q="How are identifiers handled?">
            The five identity columns are compared for equality only, so a salted
            digest is enough and nothing has to leave a merchant in the clear.
            Timestamps and money are compared as gaps and amounts, so those go as
            they are. The breakdown, column by column, is on Using Jaal. A salted
            identifier is still a pseudonymous identifier, not anonymised data.
          </Answer>
          <Answer q="Where can the pipeline fail?">
            {holdout.data
              ? `${holdout.data.failure_catalogue.length} known failure modes, each with a
                 real cluster from a real seed, are on the Failures page. The one that sets
                 the ceiling is the first: if no pair between two ring accounts clears
                 ${clustering.data.edge_threshold_bits} bits, the ring never becomes a
                 cluster and no later stage can see it.`
              : "The failure catalogue is on the Failures page."}
          </Answer>
        </div>
      </section>

      <section className="mt-14 border-t border-line-strong pt-10">
        <h2 className="text-[21px] font-medium tracking-[-0.015em] text-fg">
          The dense material
        </h2>
        <div className="mt-6 border-t border-line-strong">
          <Area title="Why the decision is priced, not thresholded"
                what={decisions.data
                  ? `the ${pct(decisions.data.breakeven_precision, 2)} break-even, the sweep, the sensitivity table`
                  : "the cost curve"}>
            <Cost decisions={decisions.data} loading={decisions.loading} bare />
          </Area>

          <Area title="The review queue, note by note"
                what={explanations.data
                  ? `${count(explanations.data.n_notes)} clusters a human would work`
                  : "the queue"}>
            <Queue explanations={explanations.data} loading={explanations.loading} bare />
          </Area>

          <Area title="Charts the pipeline drew"
                what="matplotlib output, written during the run">
            <Charts bare />
          </Area>
        </div>
      </section>
    </div>
  );
}
