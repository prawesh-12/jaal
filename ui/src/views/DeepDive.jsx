import { Disclosure } from "@/components/disclosure";
import { Empty, Metadata, PageHeader, Section, Skeleton } from "@/components/section";
import { useJson } from "@/lib/useJson";
import { count, dp4, pct, rupees } from "@/lib/format";
import Cost from "@/views/Cost";
import Pipeline from "@/views/Pipeline";
import Queue from "@/views/Queue";
import Charts from "@/views/Charts";
import Integrate from "@/views/Integrate";

/*
  Nothing on this page is new. It is the four dense views the site already had,
  each behind a heading a reader can leave shut. The short answers above them
  are the questions those views take a scroll to answer.
*/

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
      <div className="-ml-[30px]">{children}</div>
    </Disclosure>
  );
}

export default function DeepDive() {
  const link = useJson("link_params");
  const clustering = useJson("clustering");
  const model = useJson("model");
  const decisions = useJson("decisions");
  const baseline = useJson("baseline");
  const holdout = useJson("holdout");
  const explanations = useJson("explanations");
  const linkEval = useJson("link_eval");

  if (model.loading || clustering.loading) {
    return <Skeleton className="mt-16 h-96 w-full" />;
  }
  if (!model.data || !clustering.data || !link.data) {
    return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;
  }

  const m = model.data;
  const c = clustering.data;
  const d = decisions.data;
  const at14 = linkEval.data?.sweep?.obvious?.find((s) => s.threshold_bits === 14);

  return (
    <div className="pt-14">
      <PageHeader
        title="Deep dive"
        lede="Everything the judging flow leaves out. Open what you want to check. Every figure is read from the same result files as the rest of the site."
      >
        <Metadata
          className="mt-8"
          items={[
            ["Edge threshold", `${c.edge_threshold_bits} bits`],
            ["Cluster features", m.n_features],
            ["Calibration", m.calibration_method],
            ["Purity error", m.purity_model.mae.toFixed(5)],
          ]}
        />
      </PageHeader>

      <Section
        title="Short answers"
        lede="One paragraph each, for the questions that otherwise need a scroll."
      >
        <div className="border-t border-line-strong">
          <Answer q="Why Fellegi-Sunter, and not a model on pairs?">
            Every field agreement is worth a fixed number of bits, log2(m / u),
            and a pair's score is the sum. That makes a score readable: a pair
            clears the threshold because of the fields you can name, and the
            same numbers can be quoted back to an analyst. The weights are
            estimated without labels, m from {link.data.m_source} on seed pairs
            that are {pct(link.data.seed_purity, 2)} pure, u from{" "}
            {count(link.data.u_samples)} sampled pairs.
          </Answer>

          <Answer q={`Why ${c.edge_threshold_bits} bits for an edge?`}>
            {at14
              ? `Swept from 0 upward on the obvious tier. At ${c.edge_threshold_bits} bits
                 the graph keeps ${count(at14.edges)} edges at ${dp4(at14.precision)} pair
                 precision and ${dp4(at14.recall)} pair recall. Lower and the graph turns
                 into one giant component; higher and true pairs start dropping out, and a
                 pair no edge connects can never be recovered by any later stage.`
              : `Swept from 0 upward. Lower and the graph turns into one giant component;
                 higher and true pairs drop out, and a pair no edge connects can never be
                 recovered by any later stage.`}
          </Answer>

          <Answer q="Why two models rather than one?">
            The classifier answers one question, is this cluster a ring. The
            purity model answers a different one, what fraction of its accounts
            are ring accounts. A cost is charged per account, not per cluster, so
            the decision layer needs the second number to price anything. Purity
            error is {m.purity_model.mae.toFixed(5)} overall and{" "}
            {m.purity_model.mae_on_ring_clusters.toFixed(5)} on ring clusters,
            which is where it matters.
          </Answer>

          <Answer q="Why not the small neural net?">
            It was run. Pooled PR-AUC{" "}
            {dp4(m.variants.mlp_raw.all_tiers_pooled.pr_auc)} against{" "}
            {dp4(m.variants.forest_raw.all_tiers_pooled.pr_auc)} for the forest,
            a gap far smaller than the gap between tiers. The bottleneck is
            linkage, not model capacity: on the adaptive tier the ring never
            forms a cluster, and no classifier can score a cluster that does not
            exist.
          </Answer>

          <Answer q="Why not simple rules on shared device and address?">
            {baseline.data
              ? `They were built and measured. On the obvious tier the rules reach
                 ${dp4(baseline.data.tiers.obvious.recall)} recall at
                 ${dp4(baseline.data.tiers.obvious.precision)} precision, and still lose
                 ${rupees(Math.abs(baseline.data.tiers.obvious.net_vs_nothing_rupees))}
                 against deploying nothing, because blocking only pays above
                 ${pct(baseline.data.breakeven_precision, 2)} precision. On the adaptive
                 tier they block ${count(baseline.data.tiers.adaptive.fp)} accounts and
                 every one of them is innocent.`
              : "The rules baseline is in results/baseline.json. Run ./run.sh."}
          </Answer>

          <Answer q="How are identifiers handled?">
            The five identity columns are compared for equality only, so a salted
            digest is enough and nothing has to leave a merchant in the clear.
            Timestamps and money are compared as gaps and amounts, so those go as
            they are. The breakdown, column by column, is under Running and
            integrating below.
          </Answer>

          <Answer q="Where can the pipeline fail?">
            {holdout.data
              ? `${holdout.data.failure_catalogue.length} known failure modes, each with a
                 real cluster from a real seed, are on the Failures page. The one that
                 sets the ceiling is the first: if no pair between two ring accounts
                 clears ${c.edge_threshold_bits} bits, the ring never becomes a cluster and
                 no later stage can see it.`
              : "The failure catalogue is on the Failures page."}
          </Answer>
        </div>
      </Section>

      <Section
        title="The dense material"
        lede="Four views, unchanged. Each opens where it was."
      >
        <div className="border-t border-line-strong">
          <Area title="How a cluster gets scored"
                what="blocking, pair evidence, Leiden, the forest, calibration, purity">
            <Pipeline bare />
          </Area>

          <Area title="Why the decision is priced, not thresholded"
                what={d ? `the ${pct(d.breakeven_precision, 2)} break-even, the sweep, the sensitivity table` : "the cost curve"}>
            <Cost decisions={decisions.data} loading={decisions.loading} bare />
          </Area>

          <Area title="The review queue, note by note"
                what={explanations.data ? `${count(explanations.data.n_notes)} clusters a human would work` : "the queue"}>
            <Queue explanations={explanations.data} loading={explanations.loading} bare />
          </Area>

          <Area title="Charts the pipeline drew"
                what="matplotlib output, written during the run">
            <Charts bare />
          </Area>

          <Area title="Running and integrating Jaal"
                what="columns, hashing, the call, throughput, staffing, limits">
            <Integrate bare />
          </Area>
        </div>
      </Section>
    </div>
  );
}
