import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { PairScorer } from "@/components/pairScorer";
import { WorldCanvas, CanvasLegend } from "@/components/worldCanvas";
import { Disclosure } from "@/components/disclosure";
import { Empty, PageHeader, Section, Skeleton, Status, TIER_TONE } from "@/components/section";
import { useJson } from "@/lib/useJson";
import { usePrefersReducedMotion } from "@/lib/motion";
import {
  TIERS, compactRupees, count, dp2, dp4, pct, rupees,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const STEP_MS = 1500;
const BENIGN_KINDS = ["family", "flatmates", "hostel", "office"];

/*
  Nothing here runs a model. Every figure is read from the result files for the
  tier and case picked. Two things are derived, both arithmetic on published
  constants: possible pairs is n choose 2, and the purity bands come from the
  expected cost formula in detector/decide.py with the three prices in
  decisions.json. The graph beside them is a schematic and says so.
*/

const STAGES = [
  ["Accounts", "Every account looks ordinary on its own."],
  ["Blocking", "Most pairs are never worth comparing, so they never are."],
  ["Linking", "Evidence in bits. Enough of it draws an edge."],
  ["Clustering", "The graph is cut into groups."],
  ["Scoring", "Is this a ring, and how much of it is?"],
  ["Decision", "Block, review or allow, on expected cost."],
];

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

/* Straight out of detector/decide.py:
     block  (1 - purity) * n * 15,000
     allow  purity * n * 200
     review n * 150
   Every term scales with n, so the winner depends only on purity. */
function purityBands(d) {
  return [
    { action: "allow", from: 0, to: d.cost_analyst_review / d.cost_missed_abuser, tone: "ok" },
    {
      action: "review",
      from: d.cost_analyst_review / d.cost_missed_abuser,
      to: (d.cost_blocked_innocent - d.cost_analyst_review) / d.cost_blocked_innocent,
      tone: "warn",
    },
    {
      action: "block",
      from: (d.cost_blocked_innocent - d.cost_analyst_review) / d.cost_blocked_innocent,
      to: 1,
      tone: "bad",
    },
  ];
}

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

/* A row of figures. The divider only appears at the breakpoint where the row
   is genuinely one row, or the second item on a wrapped line gets a stray
   border down its left. */
const STRIP = {
  3: ["sm:grid-cols-3", "sm:border-l sm:border-line sm:pl-8"],
  4: ["sm:grid-cols-2 lg:grid-cols-4", "lg:border-l lg:border-line lg:pl-8"],
  5: ["sm:grid-cols-2 lg:grid-cols-5", "lg:border-l lg:border-line lg:pl-7"],
};

function Strip({ items, cols = 3, className }) {
  const [grid, divider] = STRIP[cols];
  return (
    <dl className={cn("grid gap-y-7 border-y border-line py-7", grid, className)}>
      {items.map(([label, value, note], i) => (
        <div key={label} className={cn("min-w-0", i > 0 && divider)}>
          <dt className="label">{label}</dt>
          <dd className="tnum mt-3 text-[24px] leading-none font-medium tracking-[-0.02em] text-fg">
            {value}
          </dd>
          {note && <dd className="t-meta mt-2.5 max-w-[28ch] text-fg-faint">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function StageRail({ step, onPick }) {
  return (
    <ol className="border-t border-line">
      {STAGES.map(([name, caption], i) => {
        const n = i + 1;
        const current = step === n;
        const passed = step > n;
        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onPick(n)}
              aria-current={current ? "step" : undefined}
              className={cn(
                "interactive block w-full border-b border-line px-3 py-3.5 text-left",
                current ? "bg-active" : "hover:bg-surface"
              )}
            >
              <span className="flex items-baseline gap-3">
                <span className={cn("tnum text-[11px]", current ? "text-fg-2" : "text-fg-dim")}>
                  {String(n).padStart(2, "0")}
                </span>
                <span className={cn("text-[13.5px] font-medium",
                                    current ? "text-fg" : passed ? "text-fg-muted" : "text-fg-faint")}>
                  {name}
                </span>
              </span>
              {current && (
                <span className="mt-2 block pl-[26px] text-[12.5px] leading-[1.55] text-fg-muted">
                  {caption}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
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

function ScoreBars({ probability, purityLabel }) {
  return (
    <div className="grid gap-x-12 gap-y-7 sm:grid-cols-2">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="label">Ring probability</span>
          <span className="tnum text-[22px] leading-none text-fg">
            {probability == null ? "low" : probability.toFixed(2)}
          </span>
        </div>
        <span className="mt-3 block h-2.5 w-full bg-raised">
          <span className="block h-full transition-[width] duration-700 ease-out"
                style={{ width: `${(probability ?? 0.06) * 100}%`, background: "var(--color-warn)" }} />
        </span>
        <p className="t-meta mt-3 max-w-[34ch]">Is this cluster a ring?</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="label">Ring purity</span>
          <span className="tnum text-[22px] leading-none text-fg">{purityLabel}</span>
        </div>
        <span className="mt-3 block h-2.5 w-full bg-raised" />
        <p className="t-meta mt-3 max-w-[34ch]">
          What fraction of its accounts are ring accounts? Not the same question,
          and it is the one the price depends on.
        </p>
      </div>
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
    () => notes.filter((n) => n.tier === tier).slice(0, 6), [notes, tier]
  );

  useEffect(() => {
    setStep(0);
    setPick(0);
    clearTimeout(timer.current);
  }, [tier, mode, kind]);

  useEffect(() => {
    if (step === 0 || step >= STAGES.length) return undefined;
    if (reduced) {
      setStep(STAGES.length);
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
  const g = generator.data.tiers[tier];
  const out = holdout.data.results_matrix[tier];
  const n = blocking.data.n_accounts_per_world;
  const possible = (n * (n - 1)) / 2;
  const stress = holdout.data.lookalike_stress;
  const kindStats = stress?.by_kind?.[kind];

  const ring = ringLevels(generator.data, tier);
  const levels = mode === "ring" ? ring.levels : BENIGN_LEVELS;
  const example = examples[pick % Math.max(examples.length, 1)];
  const action = mode === "ring" ? example?.action ?? "review" : "allow";
  const ringLinked = tier !== "adaptive";
  const done = step >= STAGES.length;

  return (
    <div className="pt-14">
      <PageHeader
        title="Watch it run"
        lede="One world, one tier, one group. Nothing is re-run in your browser. Every figure is read from the files ./run.sh wrote for exactly the case you pick."
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
            {step > 0 ? <RotateCcw size={13} /> : <Play size={13} />}
            {step > 0 ? "Run again" : "Run simulation"}
          </button>
        </div>
      </div>

      <Section
        title="The world it runs on"
        lede={`One generated world at the ${tier} tier. The answer key is hidden from the detector and opened only to score it.`}
      >
        <Strip
          cols={4}
          items={[
            ["Accounts", count(n), "one merchant, one batch"],
            ["Ring accounts", count(Math.round(out.account_prevalence * n)),
             `${pct(out.account_prevalence, 2)} of the batch`],
            ["Rings hidden in it", `${g.rings_min} to ${g.rings_max}`,
             "each one operator"],
            ["Benign lookalike groups", count(g.lookalike_groups_max),
             "families, flatmates, hostels, offices"],
          ]}
        />
      </Section>

      <Section
        title="The pipeline"
        lede="Six stages. Pick one to jump to it, or let it run."
      >
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-[140px] lg:self-start">
            <StageRail step={step} onPick={setStep} />
          </div>

          <div className="min-w-0">
            <div className="border border-line bg-surface/60 p-4 sm:p-6">
              {step === 0 ? (
                <div className="flex h-[300px] flex-col items-center justify-center gap-4 text-center">
                  <p className="max-w-[42ch] text-[15px] leading-[1.6] text-fg-muted">
                    Pick a tier and a group above, then run it.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="interactive inline-flex h-10 items-center gap-2.5 border border-line-loud px-5 text-[13.5px] text-fg hover:bg-active"
                  >
                    <Play size={13} />
                    Run simulation
                  </button>
                </div>
              ) : (
                <WorldCanvas step={step} ringLinked={ringLinked} focus={null} />
              )}
            </div>

            {step > 0 && (
              <>
                <CanvasLegend step={step} className="mt-5" />
                <p className="t-meta mt-4 max-w-[80ch]">
                  A schematic, not a measured world: one ring, three ordinary
                  groups and some accounts that link to nobody. The counts beside
                  each stage below are the measured ones.
                </p>
              </>
            )}

            {step >= 2 && (
              <Strip
                cols={3}
                className="mt-8"
                items={[
                  ["Possible pairs", count(possible), "every account against every other"],
                  ["Candidate pairs", count(b.candidate_pairs_mean),
                   `${blocking.data.rules.length} blocking rules`],
                  ["Search space cut", pct(b.pair_reduction_ratio, 2),
                   `blocking recall ${dp4(b.blocking_recall)}`],
                ]}
              />
            )}

            {step >= 4 && (
              <Strip
                cols={3}
                className="mt-8"
                items={[
                  ["Edges above threshold", count(c.edges),
                   `worth ${clustering.data.edge_threshold_bits} bits or more`],
                  ["Clusters found", count(c.n_clusters),
                   `Leiden at resolution ${clustering.data.resolution}`],
                  ["Mean of a ring recovered", dp4(c.mean_ring_recovered),
                   ringLinked ? "most of a ring survives" : "most of a ring is lost"],
                ]}
              />
            )}

            {step >= 5 && (
              <div className="mt-8 border-y border-line py-8">
                <ScoreBars
                  probability={mode === "ring" && example ? example.p : null}
                  purityLabel={mode === "ring" ? "in the band below" : "low"}
                />
              </div>
            )}

            {done && (
              <div className="mt-10 border-t border-line-strong pt-8">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <span className="label">Action taken</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-3 border px-5 py-2.5 text-[22px] tracking-[-0.02em]",
                      action === "block" ? "border-bad text-bad"
                        : action === "review" ? "border-warn text-warn"
                        : "border-ok text-ok"
                    )}
                  >
                    {action.toUpperCase()}
                  </span>
                  {mode === "ring" && example && (
                    <span className="t-meta">
                      seed {example.seed}, cluster {example.cluster_id},{" "}
                      {example.size} accounts
                    </span>
                  )}
                </div>

                {mode === "ring" && example ? (
                  <p className="mt-6 max-w-[92ch] border-l-2 border-line-loud pl-5 text-[13.5px] leading-[1.7] text-fg-2">
                    {example.note.replace(/\*\*/g, "").split("\n")[0]}
                  </p>
                ) : (
                  <p className="mt-6 max-w-[84ch] text-[13.5px] leading-[1.7] text-fg-2">
                    Across {count(stress?.worlds ?? 0)} worlds containing no rings
                    at all, {count(stress?.n_clusters ?? 0)} clusters were scored
                    and {count(stress?.accounts_wrongly_blocked ?? 0)} accounts
                    were blocked. {count(kindStats?.clusters ?? 0)} of those
                    clusters were {kind}, and{" "}
                    {count(kindStats?.wrongly_blocked ?? 0)} of them were blocked.
                    Sharing identifiers is not evidence of fraud. It is evidence
                    of living together.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      {done && (
        <Section
          title={`What that run is worth, ${tier} tier`}
          lede="Measured over the sealed holdout, not over the schematic above."
        >
          <Strip
            cols={5}
            items={[
              ["Accounts blocked", count(out.accounts_blocked)],
              ["Wrong blocks", count(out.fp)],
              ["Recall with review", pct(out.recall_including_review, 2)],
              ["Review load", pct(out.review_rate, 2)],
              ["Net benefit", compactRupees(out.net_vs_nothing_rupees)],
            ]}
          />
        </Section>
      )}

      {step > 0 && (
        <Section title="Under the animation" lede="The measured detail behind each stage.">
          <div className="border-t border-line-strong">
            <Disclosure
              summary={
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[14.5px] text-fg">What the evidence adds up to</span>
                  <span className="t-meta ml-auto text-fg-faint">
                    one pair, in bits, against the{" "}
                    {dp2(clustering.data.edge_threshold_bits)}-bit threshold
                  </span>
                </span>
              }
            >
              <div className="-ml-[30px]">
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
                <p className="t-meta mt-5 max-w-[76ch]">
                  {mode === "ring"
                    ? `Agreements taken from the generator audit for the ${tier} tier. Pincode and card BIN stay on at every tier because the pin_bin blocking rule still reaches ${dp4(b.recall_by_rule.pin_bin)} of true pairs there.`
                    : "Both members are new customers using the coupon, which is the hard case: the identifiers look exactly like a ring."}
                </p>
              </div>
            </Disclosure>

            <Disclosure
              summary={
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[14.5px] text-fg">Why that action and not another</span>
                  <span className="t-meta ml-auto text-fg-faint">
                    {rupees(d.cost_blocked_innocent)} · {rupees(d.cost_analyst_review)} ·{" "}
                    {rupees(d.cost_missed_abuser)}
                  </span>
                </span>
              }
            >
              <div className="-ml-[30px]">
                <DecisionBands decisions={d} action={action} />
                <p className="t-meta mt-6 max-w-[80ch]">
                  Every term scales with the number of accounts, so the cheapest
                  action depends only on predicted purity. Review is cheaper than a
                  wrong block all the way up to {purityBands(d)[2].from.toFixed(4)}.
                  Take review away and blocking would have to clear{" "}
                  {pct(d.breakeven_precision, 2)} to beat allowing, which is why the
                  third action exists at all. The per-cluster purity is computed by
                  the pipeline but not written to results/, so the band its action
                  implies is shown rather than a number invented here.
                </p>
              </div>
            </Disclosure>

            {mode === "ring" && examples.length > 1 && (
              <Disclosure
                summary={
                  <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-[14.5px] text-fg">Try another real cluster</span>
                    <span className="t-meta ml-auto text-fg-faint">
                      {count(examples.length)} from the {tier} tier
                    </span>
                  </span>
                }
              >
                <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                  {examples.map((e, i) => (
                    <button
                      key={`${e.seed}-${e.cluster_id}`}
                      type="button"
                      onClick={() => setPick(i)}
                      className={cn(
                        "interactive ident border-b pb-0.5 text-[12.5px]",
                        i === pick ? "border-accent text-fg"
                          : "border-line text-fg-faint hover:text-fg-muted"
                      )}
                    >
                      seed {e.seed} · {e.size} accounts · {e.action}
                    </button>
                  ))}
                </div>
              </Disclosure>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
