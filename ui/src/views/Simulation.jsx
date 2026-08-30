import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { PairScorer } from "@/components/pairScorer";
import {
  Empty, PageHeader, Skeleton, Status, TIER_TONE,
} from "@/components/section";
import { useJson } from "@/lib/useJson";
import { usePrefersReducedMotion } from "@/lib/motion";
import { TIERS, count, dp2, dp4, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEP_MS = 1100;
const BENIGN_KINDS = ["family", "flatmates", "hostel", "office"];

/*
  Nothing here runs a model. Every figure is read from the result files, and
  the two things this page derives are arithmetic on published constants:
  possible pairs is n choose 2, and the purity bands come from the expected
  cost formula in detector/decide.py using the three prices in decisions.json.
*/

/* The agreement pattern a ring pair shows at each tier, taken from the
   generator audit: device and address collisions inside rings, and the median
   signup span. Nothing is guessed. */
function ringLevels(gen, tier) {
  const g = gen.tiers[tier];
  const days = g.ring_signup_span_days_median;
  const gap = days <= 0.042 ? 0 : days <= 1 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4;
  return {
    levels: {
      device: g.device_collisions_within_rings > 0 ? 0 : 1,
      address: g.address_collisions_within_rings > 0 ? 0 : 1,
      pincode: 0,
      card_bin: 0,
      ip_prefix: 1,
      signup_gap: gap,
      hour_of_day: 2,
      order_count: 0,
      coupon_used: 0,
    },
    evidence: [
      ["Devices shared inside rings", count(g.device_collisions_within_rings)],
      ["Addresses shared inside rings", count(g.address_collisions_within_rings)],
      ["Median ring signup span", `${g.ring_signup_span_days_median} days`],
    ],
  };
}

/* A benign group that shares a phone, a flat and a connection, and whose
   members both happen to be new customers using the coupon. */
const BENIGN_LEVELS = {
  device: 0, address: 0, pincode: 0, card_bin: 1, ip_prefix: 0,
  signup_gap: 4, hour_of_day: 2, order_count: 0, coupon_used: 0,
};

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center border border-line">
      {options.map((o) => {
        const key = typeof o === "string" ? o : o.value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={value === key}
            className={cn(
              "interactive inline-flex h-9 items-center gap-2 border-l border-line px-3.5 text-[12.5px] first:border-l-0",
              value === key ? "bg-active text-fg" : "text-fg-faint hover:bg-surface hover:text-fg-muted"
            )}
          >
            {typeof o === "string" ? o : o.label}
          </button>
        );
      })}
    </div>
  );
}

function Step({ n, title, question, show, children }) {
  return (
    <section
      className={cn(
        "border-t border-line-strong pt-9 transition-opacity duration-300",
        show ? "opacity-100" : "pointer-events-none opacity-25"
      )}
      aria-hidden={!show}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tnum text-[12px] text-fg-dim">{String(n).padStart(2, "0")}</span>
        <h2 className="text-[17px] font-medium tracking-[-0.015em] text-fg">{title}</h2>
        <span className="t-meta ml-auto text-fg-faint">{question}</span>
      </div>
      <div className="mt-7">{show ? children : <div className="h-24" />}</div>
    </section>
  );
}

function Figure({ value, label, note, tone = "plain" }) {
  const color = { plain: "text-fg", ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={cn("tnum mt-3 text-[28px] leading-none font-medium tracking-[-0.025em]", color)}>
        {value}
      </div>
      {note && <div className="t-meta mt-2.5 max-w-[32ch] text-fg-faint">{note}</div>}
    </div>
  );
}

function Row({ children, cols = 3 }) {
  return (
    <div
      className={cn(
        "grid gap-y-8 border-y border-line py-7",
        cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4",
        "[&>*+*]:sm:border-l [&>*+*]:sm:border-line [&>*+*]:sm:pl-8"
      )}
    >
      {children}
    </div>
  );
}

/* Step 1. 12,000 dots is a scroll, so one dot stands for twenty accounts and
   the caption says so. */
function AccountField({ n }) {
  const per = 20;
  const dots = Math.round(n / per);
  return (
    <div>
      <div className="flex flex-wrap gap-[3px] border border-line bg-sunken p-4">
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className="block size-[5px] rounded-[1px] bg-fg-dim" />
        ))}
      </div>
      <p className="t-meta mt-4 max-w-[70ch]">
        {count(n)} accounts, one dot per {per}. Every one has a real payment, a
        real delivery and one valid first-order coupon. Nothing marks any of them.
      </p>
    </div>
  );
}

/* Step 4. Schematic. Both groups are dense, which is the whole point. */
function TwoGroups({ ringLinked }) {
  const ring = [[70, 40], [130, 20], [180, 58], [140, 98], [76, 94]];
  const benign = [[310, 34], [362, 72], [300, 100]];
  const edges = (g) =>
    g.flatMap(([x1, y1], i) =>
      g.slice(i + 1).map(([x2, y2], j) => ({ x1, y1, x2, y2, key: `${i}-${j}` })));

  return (
    <svg viewBox="0 0 430 120" className="w-full max-w-[560px]" role="img"
         aria-label="A ring of five accounts and a benign group of three, drawn as graphs">
      <g stroke="var(--color-fg-faint)" strokeWidth="1"
         opacity={ringLinked ? 0.7 : 0.12}
         strokeDasharray={ringLinked ? undefined : "3 4"}>
        {edges(ring).map((e) => <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />)}
      </g>
      <g stroke="var(--color-fg-faint)" strokeWidth="1" opacity="0.7">
        {edges(benign).map((e) => <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />)}
      </g>
      {ring.map(([x, y], i) => (
        <circle key={`r${i}`} cx={x} cy={y} r="5" fill="var(--color-warn)" />
      ))}
      {benign.map(([x, y], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r="5" fill="var(--color-ok)" />
      ))}
      <text x="128" y="118" textAnchor="middle" fontSize="10.5" fill="var(--color-fg-faint)"
            fontFamily="var(--font-sans)">
        one operator, 5 accounts
      </text>
      <text x="340" y="118" textAnchor="middle" fontSize="10.5" fill="var(--color-fg-faint)"
            fontFamily="var(--font-sans)">
        a benign group, 3 accounts
      </text>
    </svg>
  );
}

/* Step 6. The bands come straight out of detector/decide.py:
     block  (1 - purity) * n * 15,000
     allow  purity * n * 200
     review n * 150
   Every term scales with n, so the winner depends only on purity. */
function purityBands(d) {
  const reviewBeatsAllow = d.cost_analyst_review / d.cost_missed_abuser;
  const blockBeatsReview =
    (d.cost_blocked_innocent - d.cost_analyst_review) / d.cost_blocked_innocent;
  return [
    { action: "allow", from: 0, to: reviewBeatsAllow, tone: "ok" },
    { action: "review", from: reviewBeatsAllow, to: blockBeatsReview, tone: "warn" },
    { action: "block", from: blockBeatsReview, to: 1, tone: "bad" },
  ];
}

function DecisionBands({ decisions, action }) {
  const bands = purityBands(decisions);
  const TONE = { ok: "var(--color-ok)", warn: "var(--color-warn)", bad: "var(--color-bad)" };

  return (
    <div>
      {/* Widths are the real proportions, so no label goes inside: the block
          band is one percent of the axis and any text would stretch it. */}
      <div
        className="flex h-4 w-full overflow-hidden border border-line"
        role="img"
        aria-label={bands
          .map((b) => `${b.action} from ${b.from.toFixed(4)} to ${b.to.toFixed(4)} purity`)
          .join(", ")}
      >
        {bands.map((b) => (
          <span
            key={b.action}
            style={{
              width: `${(b.to - b.from) * 100}%`,
              background: TONE[b.tone],
              opacity: b.action === action ? 1 : 0.22,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-fg-faint">
        <span className="tnum">purity 0</span>
        {bands.slice(1).map((b) => (
          <span key={b.action} className="tnum">{b.from.toFixed(4)}</span>
        ))}
        <span className="tnum">1</span>
      </div>

      <dl className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-3">
        {bands.map((b) => {
          const on = b.action === action;
          return (
            <div key={b.action} className={cn("px-4 py-3.5", on ? "bg-active" : "bg-surface")}>
              <dt className="flex items-center gap-2.5 text-[13.5px]">
                <Status tone={b.tone} />
                <span className={on ? "text-fg" : "text-fg-faint"}>{b.action}</span>
                {on && <span className="label ml-auto">taken</span>}
              </dt>
              <dd className={cn("tnum mt-2 text-[12.5px]", on ? "text-fg-2" : "text-fg-dim")}>
                purity {b.from.toFixed(2)} to {b.to.toFixed(2)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function Simulation() {
  const blocking = useJson("blocking");
  const clustering = useJson("clustering");
  const model = useJson("model");
  const decisions = useJson("decisions");
  const link = useJson("link_params");
  const holdout = useJson("holdout");
  const explanations = useJson("explanations");
  const generator = useJson("generator_check");

  const [tier, setTier] = useState("moderate");
  const [mode, setMode] = useState("ring");
  const [kind, setKind] = useState("flatmates");
  const [pick, setPick] = useState(0);
  const [step, setStep] = useState(0);
  const timer = useRef(null);
  const reduced = usePrefersReducedMotion();

  const notes = explanations.data?.notes ?? [];
  const examples = useMemo(
    () => notes.filter((n) => n.tier === tier).slice(0, 8), [notes, tier]
  );

  useEffect(() => {
    setStep(0);
    setPick(0);
    clearTimeout(timer.current);
  }, [tier, mode, kind]);

  useEffect(() => {
    if (step === 0 || step >= 6) return undefined;
    if (reduced) {
      setStep(6);
      return undefined;
    }
    timer.current = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(timer.current);
  }, [step, reduced]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const ready = blocking.data && clustering.data && model.data && link.data
    && decisions.data && holdout.data && generator.data;
  if (blocking.loading || clustering.loading) {
    return <Skeleton className="mt-16 h-96 w-full" />;
  }
  if (!ready) return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;

  const b = blocking.data.tiers[tier];
  const c = clustering.data.tiers[tier];
  const d = decisions.data;
  const n = blocking.data.n_accounts_per_world;
  const possible = (n * (n - 1)) / 2;
  const stress = holdout.data.lookalike_stress;
  const kindStats = stress?.by_kind?.[kind];

  const ring = ringLevels(generator.data, tier);
  const levels = mode === "ring" ? ring.levels : BENIGN_LEVELS;
  const example = examples[pick % Math.max(examples.length, 1)];
  const action = mode === "ring" ? example?.action : "allow";
  const ringLinked = tier !== "adaptive";

  const running = step > 0;

  return (
    <div className="pt-14">
      <PageHeader
        title="Watch it run"
        lede="One world, one tier, one group. The pipeline is not re-run in your browser: every figure below is read from the files ./run.sh wrote, for exactly the tier and case you pick."
      />

      <div className="sticky top-[52px] z-30 -mx-1 mt-8 border-y border-line bg-base/95 px-1 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Adversary tier"
            value={tier}
            onChange={setTier}
            options={TIERS.map((t) => ({
              value: t,
              label: (
                <span className="inline-flex items-center gap-2">
                  <Status tone={TIER_TONE[t]} />
                  {t}
                </span>
              ),
            }))}
          />
          <Segmented
            label="Group"
            value={mode}
            onChange={setMode}
            options={[
              { value: "ring", label: "a coordinated ring" },
              { value: "benign", label: "a benign lookalike" },
            ]}
          />
          {mode === "benign" && (
            <Segmented label="Kind" value={kind} onChange={setKind} options={BENIGN_KINDS} />
          )}

          <button
            type="button"
            onClick={() => setStep(1)}
            className="interactive ml-auto inline-flex h-9 shrink-0 items-center gap-2.5 border border-line-loud px-5 text-[13px] text-fg hover:bg-active"
          >
            {running ? <RotateCcw size={13} /> : <Play size={13} />}
            {running ? "Run again" : "Run simulation"}
          </button>
        </div>

        {mode === "ring" && examples.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
            <span className="label">Cluster</span>
            {examples.map((e, i) => (
              <button
                key={`${e.seed}-${e.cluster_id}`}
                type="button"
                onClick={() => setPick(i)}
                className={cn(
                  "interactive ident border-b pb-0.5",
                  i === pick ? "border-accent text-fg" : "border-line text-fg-faint hover:text-fg-muted"
                )}
              >
                seed {e.seed} · {e.size} accounts
              </button>
            ))}
          </div>
        )}
      </div>

      {!running && (
        <p className="mt-10 max-w-[62ch] text-[15px] leading-[1.6] text-fg-muted">
          Pick a tier and a group, then run it. Six steps: a field of ordinary
          accounts becomes a search space, a search space becomes a graph, a
          graph becomes clusters, and one cluster becomes one priced decision.
        </p>
      )}

      <div className="mt-12 space-y-14">
        <Step n={1} title="Accounts" question="what arrives?" show={step >= 1}>
          <AccountField n={n} />
        </Step>

        <Step n={2} title="Blocking" question="how does the search space collapse?" show={step >= 2}>
          <Row>
            <Figure value={count(possible)} label="Possible pairs"
                    note="every account against every other" />
            <Figure value={count(b.candidate_pairs_mean)} label="Candidate pairs"
                    note={`${blocking.data.rules.length} rules: ${blocking.data.rules.join(", ")}`} />
            <Figure value={pct(b.pair_reduction_ratio, 2)} label="Search space cut"
                    note={`blocking recall ${dp4(b.blocking_recall)}, worst world ${dp4(b.recall_min)}`} />
          </Row>
          <p className="t-meta mt-5 max-w-[74ch]">
            A true pair that no rule produces can never be recovered later, so
            this recall is a ceiling on everything that follows.
          </p>
        </Step>

        <Step n={3} title="Linking" question="what does the evidence add up to?" show={step >= 3}>
          <PairScorer
            params={link.data}
            threshold={clustering.data.edge_threshold_bits}
            levels={levels}
            verdict={
              mode === "ring"
                ? ringLinked
                  ? `Past ${dp2(clustering.data.edge_threshold_bits)} bits, so an edge is drawn between these two ring accounts.`
                  : `Under ${dp2(clustering.data.edge_threshold_bits)} bits. No edge for this pair. At this tier only ${dp4(c.mean_ring_recovered)} of a ring is recovered on average, and the accounts that never link are invisible to every stage after this one.`
                : `Past ${dp2(clustering.data.edge_threshold_bits)} bits. These two are linked, and they are not a ring.`
            }
          />

          <dl className="mt-9 grid gap-x-10 gap-y-3 border-t border-line pt-6 sm:grid-cols-3">
            {(mode === "ring"
              ? ring.evidence
              : [
                  ["Kind", kind],
                  ["Clusters in ring-free worlds", count(kindStats?.clusters ?? 0)],
                  ["Shared", "phone, flat and connection"],
                ]
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
                <dt className="text-[13px] text-fg-muted">{k}</dt>
                <dd className="tnum text-[13.5px] text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="t-meta mt-5 max-w-[74ch]">
            {mode === "ring"
              ? `Agreements taken from the generator audit for the ${tier} tier. Pincode and card BIN stay on at every tier because the pin_bin blocking rule still reaches ${dp4(b.recall_by_rule.pin_bin)} of true pairs there.`
              : "Sharing identifiers is not evidence of fraud. It is evidence of living together."}
          </p>
        </Step>

        <Step n={4} title="Clustering" question="who ends up in a group with whom?" show={step >= 4}>
          <div className="grid gap-x-14 gap-y-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <TwoGroups ringLinked={ringLinked} />
            <dl className="grid gap-x-10 gap-y-3 self-center">
              {[
                ["Edges above threshold", count(c.edges)],
                ["Clusters found", count(c.n_clusters)],
                ["Rings present", c.n_rings],
                ["Rings fully intact", c.rings_fully_intact],
                ["Mean of a ring recovered", dp4(c.mean_ring_recovered)],
                ["Benign groups clustered", count(stress?.n_clusters ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
                  <dt className="text-[13px] text-fg-muted">{k}</dt>
                  <dd className="tnum text-[13.5px] text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="t-meta mt-6 max-w-[80ch]">
            Both groups are densely linked, so the graph on its own cannot tell
            them apart. Separating a ring from a family is the model's job, not
            the graph's.
          </p>
        </Step>

        <Step n={5} title="Scoring" question="two questions, not one" show={step >= 5}>
          <div className="grid gap-x-14 gap-y-10 border-y border-line py-8 sm:grid-cols-2">
            <div>
              <div className="label">Ring probability</div>
              <p className="t-meta mt-2 max-w-[40ch]">
                Is this cluster a ring? A random forest over{" "}
                {model.data.n_features} cluster features, {model.data.calibration_method}{" "}
                calibrated.
              </p>
              <div className="tnum mt-6 text-[44px] leading-none font-medium tracking-[-0.03em] text-fg">
                {mode === "ring" && example ? example.p.toFixed(2) : "low"}
              </div>
              <div className="t-meta mt-3">
                {mode === "ring" && example
                  ? `measured for seed ${example.seed}, cluster ${example.cluster_id}, ${example.size} accounts`
                  : `no ${kind} cluster in the ${count(stress?.n_clusters ?? 0)} ring-free clusters scored high enough to act on`}
              </div>
            </div>

            <div className="sm:border-l sm:border-line sm:pl-14">
              <div className="label">Ring purity</div>
              <p className="t-meta mt-2 max-w-[40ch]">
                What fraction of its accounts are ring accounts? A separate
                regressor, because a cost is charged per account, not per cluster.
              </p>
              <div className="tnum mt-6 text-[44px] leading-none font-medium tracking-[-0.03em] text-fg">
                {model.data.purity_model.mae_on_ring_clusters.toFixed(3)}
              </div>
              <div className="t-meta mt-3">
                mean absolute error on ring clusters. The per-cluster value is not
                published in results/, so the band it fell in is shown below instead.
              </div>
            </div>
          </div>
          <p className="t-meta mt-5 max-w-[76ch]">
            A high probability does not mean block. It says the cluster is
            almost certainly a ring. How much of it is ring is a different
            number, and that is the one the price depends on.
          </p>
        </Step>

        <Step n={6} title="Decision" question="what does each action cost?" show={step >= 6}>
          <Row>
            <Figure value={rupees(d.cost_blocked_innocent)} label="Block, per innocent account"
                    tone="bad" />
            <Figure value={rupees(d.cost_analyst_review)} label="Review, per account read"
                    tone="warn" />
            <Figure value={rupees(d.cost_missed_abuser)} label="Allow, per ring account"
                    tone="ok" />
          </Row>

          <div className="mt-9">
            <DecisionBands decisions={d} action={action} />
            <p className="t-meta mt-5 max-w-[80ch]">
              Every term scales with the number of accounts, so the cheapest
              action depends only on predicted purity. Review is cheaper than a
              wrong block all the way up to{" "}
              {purityBands(d)[2].from.toFixed(4)}. Take review away and blocking
              would have to clear {pct(d.breakeven_precision, 2)} to beat
              allowing, which is why the third action exists at all.
            </p>
          </div>

          <div className="mt-10 border-t border-line-strong pt-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="label">Action taken</span>
              <span className="inline-flex items-center gap-2.5 text-[20px] tracking-[-0.015em] text-fg">
                <Status tone={action === "block" ? "bad" : action === "review" ? "warn" : "ok"} />
                {action}
              </span>
            </div>
            {mode === "ring" && example ? (
              <p className="mt-6 max-w-[92ch] border-l-2 border-line-loud pl-5 text-[13.5px] leading-[1.7] text-fg-2">
                {example.note.replace(/\*\*/g, "").split("\n")[0]}
              </p>
            ) : (
              <p className="mt-6 max-w-[80ch] text-[13.5px] leading-[1.7] text-fg-2">
                Across {count(stress?.worlds ?? 0)} worlds containing no rings at
                all, {count(stress?.n_clusters ?? 0)} clusters were scored and{" "}
                {count(stress?.accounts_wrongly_blocked ?? 0)} accounts were
                blocked. {count(kindStats?.clusters ?? 0)} of those clusters were{" "}
                {kind}, and {count(kindStats?.wrongly_blocked ?? 0)} of them were
                blocked.
              </p>
            )}
          </div>
        </Step>
      </div>
    </div>
  );
}
