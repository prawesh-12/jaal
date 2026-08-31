import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Empty, Skeleton } from "@/components/section";
import { Population } from "@/three/Population";
import { Forest, Weights } from "@/three/Model";
import { useJson } from "@/lib/useJson";
import { cn } from "@/lib/utils";
import { compactRupees, count, dp4, pct } from "@/lib/format";

const RUN_MS = 7000;

const STEPS = [
  [0.00, "Population",
   "12,000 accounts. One order each, one coupon each, nothing out of place."],
  [0.08, "One neighbourhood",
   "Closer in, on one neighbourhood of that population."],
  [0.20, "Evidence in bits",
   "Every field two accounts agree on is worth bits. Weak agreements accumulate."],
  [0.54, "One group holds",
   "One group is bound together. The rest of the neighbourhood is not."],
  [0.70, "Priced decision",
   "Two models score it, three actions are priced, and the cheapest one wins."],
];

const stepAt = (p) => STEPS.findLastIndex(([from]) => p >= from);

/* Runs from `from.at` to the end. A new object restarts it, which is what
   picking a step does. */
function useRun(ms, from) {
  const [phase, setPhase] = useState(from.at);

  useEffect(() => {
    let frame = 0;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const p = Math.min(1, from.at + (now - start) / ms);
      setPhase(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ms, from]);

  return phase;
}


function ModelCard({ card, report }) {
  const forest = card.classifier;
  const shipped = report.variants[`forest_${report.calibration_method}`].all_tiers_pooled;
  const rows = card.importance
    .map((r) => ({ feature: r.feature, value: r.permutation }))
    .sort((a, b) => b.value - a.value);

  return (
    <section className="mt-16 border-t border-line-strong pt-10">
      <div className="grid items-start gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)]">
        <h2 className="max-w-[22ch] text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-fg">
          What scores a cluster
        </h2>
        <p className="max-w-[54ch] text-[14.5px] leading-[1.6] text-fg-muted">
          A random forest of {count(forest.n_trees)} decision trees over{" "}
          {card.features.length} cluster features, then an{" "}
          {card.calibrator.method} step function of{" "}
          {card.calibrator.n_points} breakpoints that turns their vote into a
          probability the cost model can price. A second forest of{" "}
          {count(card.purity.n_trees)} trees predicts what fraction of the
          cluster is really a ring.
        </p>
      </div>

      <div className="mt-10 grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div>
          <div className="label">Every tree in the classifier, by depth</div>
          <div className="mt-4 h-[300px] w-full">
            <Forest card={forest} className="h-full w-full" />
          </div>
          <p className="t-meta mt-4 max-w-[62ch]">
            One bar per tree, as many levels tall as that tree grew. Together
            they hold{" "}
            <span className="tnum text-fg-2">{count(forest.decision_nodes)}</span>{" "}
            decision nodes and{" "}
            <span className="tnum text-fg-2">{count(forest.leaves)}</span>{" "}
            leaves, each node one learned threshold on one feature.
          </p>
        </div>

        <div>
          <div className="label">What it leans on, measured</div>
          <div className="mt-4 h-[340px] w-full">
            <Weights rows={rows} className="h-full w-full" />
          </div>
          <p className="t-meta mt-4 max-w-[52ch]">
            PR-AUC lost when that column is shuffled on validation data. The
            four that run left are the features the model does not need.
          </p>
        </div>
      </div>

      <dl className="mt-12 grid gap-px border-t border-line-strong bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Trained on", count(report.n_train_clusters),
           `clusters, validated on ${count(report.n_val_clusters)}`],
          ["PR-AUC", dp4(shipped.pr_auc),
           `${shipped.lift_over_baseline}x a ${pct(shipped.prevalence, 2)} base rate`],
          ["Brier, calibrated", report.brier_isotonic.toFixed(5),
           `${report.brier_raw.toFixed(5)} before calibration`],
          ["Purity error", report.purity_model.mae.toFixed(5),
           `${report.purity_model.mae_on_ring_clusters.toFixed(5)} on ring clusters`],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-base py-8 pr-10 first:pl-0 lg:pl-10 lg:first:pl-0">
            <dt className="label">{label}</dt>
            <dd className="tnum mt-3 text-[26px] leading-none font-medium tracking-tight text-fg">
              {value}
            </dd>
            <dd className="t-meta mt-3 max-w-[26ch]">{note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function Overview({ holdout, loading, onSimulate }) {
  const scene = useJson("overview_scene");
  const card = useJson("model_card");
  const model = useJson("model");
  const [from, setFrom] = useState({ at: 0 });
  const phase = useRun(RUN_MS, from);
  const step = stepAt(phase);

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const pooled = holdout.pooled;

  return (
    <div>
      <header className="grid items-end gap-x-16 gap-y-6 pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <h1 className="t-hero max-w-[16ch] text-balance">
          Finding the fraud between transactions, not inside them.
        </h1>
        <p className="max-w-[46ch] text-[16px] leading-[1.6] text-fg-muted lg:pb-2">
          One operator, fifty accounts, fifty ordinary first orders. Jaal scores
          the relationships between accounts, not the accounts, and decides on
          the group.
        </p>
      </header>

      <div className="mt-9 h-[min(46vh,410px)] w-full">
        {scene.data
          ? <Population scene={scene.data} phase={phase} className="h-full w-full" />
          : <div className="h-full w-full animate-pulse bg-surface" />}
      </div>

      <ol className="mt-5 grid gap-px border-y border-line bg-line sm:grid-cols-5">
        {STEPS.map(([at, title], i) => {
          const next = STEPS[i + 1]?.[0] ?? 1;
          const done = Math.min(1, Math.max(0, (phase - at) / (next - at)));
          return (
            <li key={title} className="bg-base">
              <button
                type="button"
                onClick={() => setFrom({ at })}
                aria-current={step === i ? "step" : undefined}
                className="interactive block w-full px-1 pt-3 pb-2.5 text-left hover:bg-surface"
              >
                <span className="flex items-baseline gap-2.5">
                  <span className="tnum text-[11px] text-fg-dim">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={cn("text-[13px]",
                                      step === i ? "text-fg" : "text-fg-muted")}>
                    {title}
                  </span>
                </span>
                <span className="mt-2.5 block h-px w-full bg-line">
                  <span className="block h-px bg-fg"
                        style={{ width: `${done * 100}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 max-w-[82ch] text-[14.5px] leading-[1.6] text-fg-2">
        {STEPS[step][2]}
      </p>

      <div className="mt-11 grid gap-px border-t border-line-strong bg-line sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-base py-9 pr-10">
          <div className="label">Net against doing nothing</div>
          <div className="tnum mt-3 text-[clamp(2.5rem,1.6rem+2.4vw,3.5rem)] leading-none font-medium tracking-[-0.035em] whitespace-nowrap text-ok">
            {compactRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="t-meta mt-3">
            sealed holdout, {count(holdout.n_seeds)} worlds, opened once
          </p>
        </div>
        {[
          ["Blocking precision", pct(pooled.precision, 2),
           `${count(pooled.fp)} wrong block in ${count(pooled.accounts_blocked)}`],
          ["Caught with review", pct(pooled.recall_including_review, 2),
           `of ${count(pooled.n_ring_accounts)} ring accounts`],
          ["Review load", pct(pooled.review_rate, 2),
           `${count(pooled.clusters_reviewed)} clusters need a person`],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-base py-9 pr-10 pl-10">
            <div className="label">{label}</div>
            <div className="tnum mt-3 text-[30px] leading-none font-medium tracking-tight text-fg">
              {value}
            </div>
            <p className="t-meta mt-3 max-w-[26ch]">{note}</p>
          </div>
        ))}
      </div>

      {card.data && model.data && <ModelCard card={card.data} report={model.data} />}

      <div className="py-10">
        <button type="button" onClick={onSimulate}
                className="interactive inline-flex h-12 items-center gap-2.5 bg-fg px-7 text-[15px] font-medium text-base hover:opacity-90">
          Run it on twelve thousand accounts
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
