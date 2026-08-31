import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Binary, Boxes, Filter, Gauge, IndianRupee, Share2,
         Sigma, Spline, Table2, TreePine, Users, Check, FileJson } from "lucide-react";

import { Empty, Skeleton } from "@/components/section";
import { GithubMark } from "@/components/mark";
import { Population } from "@/three/Population";
import { Calibration, Forest, Weights } from "@/three/Model";
import { Pipeline } from "@/three/Pipeline";
import { useJson } from "@/lib/useJson";
import { useOnScreen } from "@/lib/useOnScreen";
import { cn } from "@/lib/utils";
import { compactRupees, count, dp4, pct, rupees } from "@/lib/format";

const RUN_MS = 4800;

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


const OUTCOMES = [
  { label: "Block" }, { label: "Review" }, { label: "Allow" },
];

const STAGE_ICON = {
  accounts: Users,
  blocking: Filter,
  pairs: Binary,
  graph: Share2,
  clusters: Boxes,
  features: Table2,
  score: Gauge,
  decide: IndianRupee,
};

function buildStages({ blocking, link, clustering, model, decisions }) {
  return [
    { id: "accounts", name: "Accounts", label: "Accounts",
      sub: count(blocking.n_accounts_per_world),
      head: `${count(blocking.n_accounts_per_world)} per world`,
      note: "Twelve ordinary fields per account. Nothing in the row is a risk score, and no account is judged on its own." },
    { id: "blocking", name: "Blocking", label: "Blocking",
      sub: `${blocking.rules.length} rules`,
      head: `${pct(blocking.tiers.obvious.pair_reduction_ratio, 1)} of pairs never compared`,
      note: `Only pairs agreeing on some coarse key are ever scored, and no block grows past ${count(blocking.max_block_size)} accounts.` },
    { id: "pairs", name: "Pair evidence", label: "Pair evidence",
      sub: `${Object.keys(link.levels).length} fields`,
      head: "Fellegi-Sunter, measured in bits",
      note: `Every field agreement is worth log2(m/u) bits. Both are estimated without labels, u from ${count(link.u_samples)} sampled pairs.` },
    { id: "graph", name: "Graph", label: "Graph",
      sub: `${clustering.edge_threshold_bits} bits`,
      head: `${clustering.edge_threshold_bits} bits to keep an edge`,
      note: "Swept upward from zero. Lower and the graph collapses into one giant component; higher and true pairs drop out." },
    { id: "clusters", name: "Clustering", label: "Clustering",
      sub: "Leiden",
      head: `Leiden, resolution ${clustering.resolution}`,
      note: `Minimum cluster size ${clustering.min_cluster_size}, seed ${clustering.seed} pinned, so one world always splits the same way.` },
    { id: "features", name: "Cluster features", label: "Features",
      sub: `${model.n_features} per cluster`,
      head: `${model.n_features} features per cluster`,
      note: `Shape, timing, behaviour and what was taken, as one fixed-length row. ${model.dropped_features.length} dropped as leaky or redundant.` },
    { id: "score", name: "Ring probability", label: "Probability",
      sub: "2 forests",
      head: `Fitted on ${count(model.n_train_clusters)} clusters`,
      note: `One forest says whether the cluster is a ring, a second says what fraction of it is. Validated on ${count(model.n_val_clusters)} clusters from unseen worlds.` },
    { id: "decide", name: "Priced decision", label: "Decision",
      sub: pct(decisions.breakeven_precision, 2),
      head: `${pct(decisions.breakeven_precision, 2)} break-even precision`,
      note: `A wrong block costs ${rupees(decisions.cost_blocked_innocent)}, a missed abuser ${rupees(decisions.cost_missed_abuser)}, an analyst review ${rupees(decisions.cost_analyst_review)}. The cheapest action wins.` },
  ];
}

function Architecture({ blocking, link, clustering, model, decisions }) {
  const stages = useMemo(
    () => buildStages({ blocking, link, clustering, model, decisions }),
    [blocking, link, clustering, model, decisions]);
  const [lit, setLit] = useState(0);
  const [held, setHeld] = useState(null);
  const [ref, onScreen] = useOnScreen();

  const active = held ?? stages[lit].id;
  const shown = stages.find((s) => s.id === active) ?? stages[0];

  return (
    <section className="mt-16 border-t border-line-strong pt-10">
      <div className="grid items-start gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)]">
        <h2 className="max-w-[22ch] text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-fg">
          How the system works
        </h2>
        <p className="max-w-[54ch] text-[14.5px] leading-[1.6] text-fg-muted">
          Eight stages, each one a file on disk that the next stage reads. No
          stage scores an account on its own. The first six build the group,
          the seventh puts a number on it, and only the last one decides
          anything.
        </p>
      </div>

      <div ref={ref} className="mt-10 -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
        <div className="h-[230px] min-w-[1060px]">
          <Pipeline stages={stages} outcomes={OUTCOMES} active={active}
                    holding={lit} running={onScreen} onHover={setHeld}
                    onReach={setLit} className="h-full w-full" />
        </div>
      </div>

      {/* All eight in one grid cell, so the panel is always as tall as the
          longest note and the page below never shifts. */}
      <div className="mt-8 grid border-t border-line pt-6">
        {stages.map((s) => {
          const Icon = STAGE_ICON[s.id];
          const on = s.id === shown.id;
          return (
            <div key={s.id} aria-hidden={!on}
                 className="col-start-1 row-start-1 flex items-start gap-5"
                 style={{ visibility: on ? "visible" : "hidden" }}>
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center border border-line text-fg-muted">
                <Icon size={16} aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[15px] font-medium text-fg">{s.name}</span>
                  <span className="tnum text-[14px] text-fg-2">{s.head}</span>
                </div>
                <p className="mt-1.5 max-w-[86ch] text-[14px] leading-[1.6] text-fg-muted">
                  {s.note}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
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
          <div className="label">How deep the {count(forest.n_trees)} trees grew</div>
          <div className="mt-4 h-[300px] w-full">
            <Forest card={forest} className="h-full w-full" />
          </div>
          <p className="t-meta mt-4 max-w-[62ch]">
            One bar per depth, as tall as the number of trees that reached it.
            The shallowest stopped at{" "}
            <span className="tnum text-fg-2">{forest.depth_min}</span> levels and
            the deepest ran to{" "}
            <span className="tnum text-fg-2">{forest.depth_max}</span>. Together
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

      <Spec card={card} report={report} />
    </section>
  );
}

const REPO = "https://github.com/prawesh-12/jaal";

function SpecColumn({ icon: Icon, title, subtitle, rows }) {
  return (
    <div className="bg-base py-7 pr-10 lg:pl-10 lg:first:pl-0">
      <div className="flex items-center gap-2.5">
        <Icon size={15} className="text-fg-faint" aria-hidden="true" />
        <span className="text-[14px] font-medium text-fg">{title}</span>
      </div>
      <div className="ident mt-1 text-[12px] text-fg-faint">{subtitle}</div>
      <dl className="mt-5 grid gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k}
               className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0">
            <dt className="text-[13px] text-fg-muted">{k}</dt>
            <dd className="tnum text-[13px] text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Spec({ card, report }) {
  const { classifier, calibrator, purity } = card;
  const tried = [
    ["Random forest, uncalibrated", "forest_raw"],
    ["Random forest, Platt scaling", "forest_sigmoid"],
    ["Random forest, isotonic", "forest_isotonic"],
    ["Neural net, 32-16, uncalibrated", "mlp_raw"],
  ].filter(([, key]) => report.variants[key]);

  const shippedKey = `forest_${report.calibration_method}`;

  return (
    <div className="mt-14">
      <div className="grid items-start gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)]">
        <h3 className="t-sub">The trained model, exactly</h3>
        <p className="max-w-[54ch] text-[14.5px] leading-[1.6] text-fg-muted">
          Three fitted objects ship together: the classifier, the step function
          that corrects its probabilities, and the regressor that predicts how
          much of a flagged cluster is really a ring. Every number below is read
          back out of the fitted estimators.
        </p>
      </div>

      <div className="mt-8 grid gap-px border-t border-line-strong bg-line lg:grid-cols-3">
        <SpecColumn
          icon={TreePine}
          title="Ring classifier"
          subtitle={classifier.kind}
          rows={[
            ["Trees", count(classifier.n_trees)],
            ["Min samples per leaf", classifier.min_samples_leaf],
            ["Class weight", classifier.class_weight],
            ["Depth, min to max", `${classifier.depth_min} - ${classifier.depth_max}`],
            ["Depth, mean", classifier.depth_mean],
            ["Decision nodes", count(classifier.decision_nodes)],
            ["Leaves", count(classifier.leaves)],
            ["Input features", card.features.length],
          ]}
        />
        <SpecColumn
          icon={Spline}
          title="Probability calibrator"
          subtitle={calibrator.kind}
          rows={[
            ["Method", calibrator.method],
            ["Breakpoints", calibrator.n_points],
            ["Fitted on", "held-back worlds"],
            ["Brier before", report.brier_raw.toFixed(5)],
            ["Brier after", report.brier_isotonic.toFixed(5)],
            ["Platt, for comparison", report.brier_sigmoid.toFixed(5)],
          ]}
        />
        <SpecColumn
          icon={Sigma}
          title="Purity regressor"
          subtitle={purity.kind}
          rows={[
            ["Trees", count(purity.n_trees)],
            ["Min samples per leaf", purity.min_samples_leaf],
            ["Depth, min to max", `${purity.depth_min} - ${purity.depth_max}`],
            ["Depth, mean", purity.depth_mean],
            ["Decision nodes", count(purity.decision_nodes)],
            ["Leaves", count(purity.leaves)],
            ["Mean predicted", report.purity_model.mean_predicted.toFixed(5)],
            ["Mean actual", report.purity_model.mean_actual.toFixed(5)],
          ]}
        />
      </div>

      <div className="mt-12 grid items-center gap-x-14 gap-y-8 border-t border-line pt-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="h-[320px] w-full">
          <Calibration score={calibrator.score} probability={calibrator.probability}
                       className="h-full w-full" />
        </div>

        <div>
          <div className="label">What the calibrator changes</div>
          <p className="mt-4 max-w-[56ch] text-[14.5px] leading-[1.6] text-fg-2">
            A forest's {count(classifier.n_trees)} trees vote, and the share
            that vote yes is not a probability. The step function maps each
            raw vote onto the rate that actually held on held-back worlds, so
            the cost model can multiply it by rupees and get an answer worth
            acting on.
          </p>
          <dl className="mt-8 grid gap-px border-t border-line-strong bg-line sm:grid-cols-3">
            {[
              ["Brier, raw", report.brier_raw.toFixed(5), "straight from the vote"],
              ["Brier, isotonic", report.brier_isotonic.toFixed(5), "what ships"],
              ["Brier, Platt", report.brier_sigmoid.toFixed(5), "the alternative"],
            ].map(([label, value, note]) => (
              <div key={label} className="bg-base py-5 pr-8 sm:pl-8 sm:first:pl-0">
                <dt className="label">{label}</dt>
                <dd className="tnum mt-2.5 text-[21px] leading-none font-medium tracking-tight text-fg">
                  {value}
                </dd>
                <dd className="t-meta mt-2">{note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-12 grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)]">
        <div>
          <div className="label">What else was tried, on validation</div>
          <table className="mt-4 w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th className="py-2 pr-4 font-medium text-fg-muted">Candidate</th>
                <th className="tnum py-2 pr-4 text-right font-medium text-fg-muted">PR-AUC</th>
                <th className="tnum py-2 pr-4 text-right font-medium text-fg-muted">ROC-AUC</th>
                <th className="tnum py-2 text-right font-medium text-fg-muted">Brier</th>
              </tr>
            </thead>
            <tbody>
              {tried.map(([name, key]) => {
                const m = report.variants[key].all_tiers_pooled;
                const on = key === shippedKey;
                return (
                  <tr key={key} className={cn("border-b border-line",
                                              on && "bg-surface")}>
                    <td className={cn("py-2.5 pr-4 pl-3 -indent-3",
                                      on ? "text-fg" : "text-fg-muted")}>
                      {on && <Check size={13} className="mr-1.5 inline text-ok"
                                    aria-hidden="true" />}
                      {name}
                      {on && <span className="t-meta ml-2">shipped</span>}
                    </td>
                    <td className="tnum py-2.5 pr-4 text-right text-fg-2">{dp4(m.pr_auc)}</td>
                    <td className="tnum py-2.5 pr-4 text-right text-fg-2">{dp4(m.roc_auc)}</td>
                    <td className="tnum py-2.5 pr-3 text-right text-fg-2">{m.brier.toFixed(5)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="t-meta mt-4 max-w-[62ch]">
            All four on the same {count(report.n_val_clusters)} validation
            clusters at a {pct(report.variants.forest_raw.all_tiers_pooled.prevalence, 2)}{" "}
            base rate. Fit, calibration and validation seeds are disjoint whole
            worlds, so no cluster from a training world is scored here. The
            neural net scores highest and did not ship: the decision layer
            needs a probability it can price and a feature it can name.
          </p>
        </div>

        <div>
          <div className="label">Check it yourself</div>
          <ul className="mt-4 grid gap-px border-t border-line bg-line">
            {[
              ["/data/model_card.json", FileJson,
               "Every tree's depth and leaf count, the calibrator's breakpoints, per-feature importance"],
              ["/data/model.json", FileJson,
               "Validation metrics per tier and per candidate, seed ranges, calibration Brier scores"],
              [`${REPO}/blob/main/detector/model.py`, GithubMark,
               "The training code that wrote both files", "detector/model.py"],
            ].map(([href, Icon, note, text]) => (
              <li key={href} className="bg-base py-3">
                <a href={href} target="_blank" rel="noreferrer"
                   className="interactive flex items-start gap-2.5 text-fg hover:text-accent">
                  <Icon size={14} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden="true" />
                  <span className="ident block text-[12.5px]">{text ?? href}</span>
                </a>
                <span className="t-meta mt-1 block max-w-[46ch] pl-[26px]">{note}</span>
              </li>
            ))}
          </ul>
          <p className="t-meta mt-4 max-w-[46ch]">
            The fitted estimators themselves are written to{" "}
            <span className="ident text-fg-2">results/model.pkl</span> by a
            local run. Nothing on this page is computed in the browser.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Overview({ holdout, loading, onSimulate }) {
  const scene = useJson("overview_scene");
  const card = useJson("model_card");
  const model = useJson("model");
  const blocking = useJson("blocking");
  const link = useJson("link_params");
  const clustering = useJson("clustering");
  const decisions = useJson("decisions");
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
                  <span className="block h-px bg-accent"
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
          <div className="label">Saved against doing nothing</div>
          <div className="tnum mt-3 text-[clamp(2.5rem,1.6rem+2.4vw,3.5rem)] leading-none font-medium tracking-[-0.035em] whitespace-nowrap text-ok">
            {compactRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="t-meta mt-3">
            Sealed holdout, {count(holdout.n_seeds)} worlds, opened once
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

      {blocking.data && link.data && clustering.data && model.data && decisions.data && (
        <Architecture blocking={blocking.data} link={link.data}
                      clustering={clustering.data} model={model.data}
                      decisions={decisions.data} />
      )}

      {card.data && model.data && <ModelCard card={card.data} report={model.data} />}

      <div className="py-10">
        <button type="button" onClick={onSimulate}
                className="interactive inline-flex h-12 items-center gap-2.5 bg-accent px-7 text-[15px] font-medium text-base hover:opacity-90">
          Run it on twelve thousand accounts
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
