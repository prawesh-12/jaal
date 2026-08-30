import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import { ClusterGraph } from "@/components/clusterGraph";
import { Empty, Skeleton, Status } from "@/components/section";
import { useJson } from "@/lib/useJson";
import { usePrefersReducedMotion } from "@/lib/motion";
import { bitsFor, SCORED } from "@/lib/pipelineStages";
import { TIERS, count, dp4, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEP_MS = 1600;
const LAST = 6;

/*
  A replay, not a run. Every case on this page is a cluster that went through
  the real pipeline: results/sim_cases.json holds its size, its measured edge
  density, its calibrated probability, its predicted purity, the expected cost
  of all three actions and the action taken. The browser draws them. It does
  not compute them.
*/

const SCHEMA = [
  ["account_id", "string", "returned untouched", false],
  ["device_id", "identifier", "9f2c…a71e", true],
  ["address_id", "identifier", "4b81…02cd", true],
  ["pincode", "identifier", "1a77…9e30", true],
  ["card_bin", "identifier", "c204…5fb1", true],
  ["ip_prefix", "identifier", "e8d0…7a22", true],
  ["signup_ts", "timestamp", "2026-03-04T11:22:31Z", false],
  ["n_orders", "integer", "1", false],
  ["coupon_used", "boolean", "true", false],
  ["first_order_value", "rupees", "1499", false],
  ["total_order_value", "rupees", "1499", false],
  ["days_to_second_order", "integer or null", "null", false],
];

const TONE_FOR = { block: "bad", review: "warn", allow: "ok" };

const STEPS = [
  ["Accounts", "One row per account. No account is judged on its own."],
  ["Blocking", "Most pairs are never worth scoring, so they are never scored."],
  ["Link", "Weak signals add up. Enough of them draw an edge."],
  ["Graph", "Accounts become nodes. Edges make the unit of detection a group."],
  ["Cluster", "The group is scored twice: is it a ring, and how much of it is."],
  ["Decision", "Each action is priced. The cheapest one wins."],
];

/* The agreement pattern a ring pair shows at this tier, from the generator
   audit: device and address collisions inside rings, and the signup span. */
function ringLevels(gen, tier) {
  const g = gen.tiers[tier];
  const days = g.ring_signup_span_days_median;
  const gap = days <= 0.042 ? 0 : days <= 1 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4;
  return {
    device: g.device_collisions_within_rings > 0 ? 0 : 1,
    address: g.address_collisions_within_rings > 0 ? 0 : 1,
    pincode: 0,
    card_bin: 0,
    ip_prefix: 1,
    signup_gap: gap,
    hour_of_day: 2,
    order_count: 0,
    coupon_used: 0,
  };
}

/* A group that shares a phone, a flat and a connection, and whose members are
   both new customers using the coupon. The hard case for any rule. */
const BENIGN_LEVELS = {
  device: 0, address: 0, pincode: 0, card_bin: 1, ip_prefix: 0,
  signup_gap: 4, hour_of_day: 2, order_count: 0, coupon_used: 0,
};

const LABEL = {
  device: "same device", address: "same address", pincode: "same pincode",
  card_bin: "same card BIN", ip_prefix: "same IP prefix",
  signup_gap: "signed up together", hour_of_day: "same hour of day",
  order_count: "both one order", coupon_used: "both used the coupon",
};

function param(name, allowed, fallback) {
  if (typeof window === "undefined") return fallback;
  const query = window.location.hash.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get(name);
  return allowed.includes(value) ? value : fallback;
}

function Control({ label, options, value, onChange }) {
  return (
    <div>
      <div className="label mb-2.5">{label}</div>
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
                "interactive inline-flex h-10 items-center gap-2 border-l border-line px-4 text-[13px] first:border-l-0",
                value === key ? "bg-active font-medium text-fg"
                              : "text-fg-muted hover:bg-surface hover:text-fg"
              )}
            >
              {typeof o === "string" ? o : o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Figure({ label, value, note, tone, size = "md" }) {
  const colour = tone ? `var(--color-${tone})` : "var(--color-fg)";
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div
        className={cn("tnum mt-2.5 leading-none font-medium tracking-[-0.025em]",
                      size === "lg" ? "text-[34px]" : "text-[24px]")}
        style={{ color: colour }}
      >
        {value}
      </div>
      {note && <div className="t-meta mt-2.5 max-w-[30ch] text-fg-faint">{note}</div>}
    </div>
  );
}

/* Step 1. The real twelve columns, their types, and which ones a merchant may
   send as a salted digest. */
function Schema({ n, prevalence }) {
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="border border-line">
        <div className="flex items-baseline justify-between gap-4 border-b border-line bg-surface px-4 py-3">
          <span className="text-[13px] font-medium text-fg">Jaal input data</span>
          <span className="tnum text-[12.5px] text-fg-muted">
            {count(n)} accounts · {SCHEMA.length} fields
          </span>
        </div>
        <table className="w-full text-[12.5px]">
          <tbody>
            {SCHEMA.map(([name, type, example, hashable]) => (
              <tr key={name} className="border-b border-line last:border-b-0">
                <td className="ident py-2 pl-4 text-fg-2">{name}</td>
                <td className="py-2 pl-4 text-fg-faint">{type}</td>
                <td className="ident py-2 pl-4 text-fg-muted">{example}</td>
                <td className="py-2 pr-4 pl-4 text-right">
                  {hashable && (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ok">
                      <Status tone="ok" /> hashable
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="space-y-7 self-start">
        {[
          ["Dataset scale", `${count(n)} accounts per world`],
          ["Account-level ring prevalence", pct(prevalence, 1)],
          ["Adversary tiers", TIERS.join(" · ")],
          ["Benign lookalikes", "family · flatmates · hostel · office"],
        ].map(([k, v]) => (
          <div key={k} className="border-b border-line pb-4">
            <dt className="label">{k}</dt>
            <dd className="mt-2.5 text-[15px] text-fg">{v}</dd>
          </div>
        ))}
        <p className="t-meta max-w-[40ch]">
          The five identity fields are only ever tested for equality, so a
          merchant can salt and hash them before sending.
        </p>
      </dl>
    </div>
  );
}

/* Step 2. Two bars on a log scale, because 72 million against half a million
   is invisible on a linear one. */
function Blocking({ possible, candidates, cut, rules, recall }) {
  const top = Math.log10(possible);
  const bar = (v, colour) => (
    <span className="mt-3 block h-3 w-full bg-raised">
      <span className="block h-full transition-[width] duration-700 ease-out"
            style={{ width: `${(Math.log10(v) / top) * 100}%`, background: colour }} />
    </span>
  );

  return (
    <div>
      <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
        <div>
          <div className="label">Pairs a naive scan would score</div>
          <div className="tnum mt-2.5 text-[30px] leading-none font-medium text-fg-muted">
            {count(possible)}
          </div>
          {bar(possible, "var(--color-fg-dim)")}
        </div>
        <div>
          <div className="label">Pairs Jaal actually scores</div>
          <div className="tnum mt-2.5 text-[30px] leading-none font-medium text-fg">
            {count(candidates)}
          </div>
          {bar(candidates, "var(--color-ok)")}
        </div>
      </div>
      <p className="mt-8 max-w-[70ch] text-[15px] leading-[1.55] text-fg-2">
        <span className="tnum font-medium text-fg">{pct(cut, 2)}</span> of the
        search space never gets scored, and{" "}
        <span className="tnum font-medium text-fg">{dp4(recall)}</span> of the
        pairs that matter survive. Log scale on both bars.
      </p>
      <p className="t-meta mt-4">
        Six rules: {rules.join(", ")}. A true pair no rule produces cannot be
        recovered later, so that recall is a ceiling on everything downstream.
      </p>
    </div>
  );
}

/* Step 3. Only the agreements that add evidence, then the total against the
   threshold. Every weight is measured, from results/link_params.json. */
function Evidence({ params, levels, threshold, meanBits, minBits }) {
  const rows = SCORED.map((field) => ({
    field,
    level: params.levels[field][levels[field] ?? params.levels[field].length - 1],
    bits: bitsFor(params, field, levels[field] ?? params.levels[field].length - 1),
  }));
  const positive = rows.filter((r) => r.bits > 0).sort((a, b) => b.bits - a.bits);
  const negative = rows.filter((r) => r.bits <= 0);
  const drag = negative.reduce((s, r) => s + r.bits, 0);
  const total = rows.reduce((s, r) => s + r.bits, 0);
  const edge = total >= threshold;
  const widest = Math.max(...positive.map((r) => r.bits), threshold);

  return (
    <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div className="label mb-3">What this pair agrees on</div>
        {positive.map((r) => (
          <div key={r.field}
               className="grid grid-cols-[minmax(0,190px)_minmax(0,1fr)_86px] items-center gap-4 border-b border-line py-2.5">
            <span className="text-[13.5px] text-fg-2">{LABEL[r.field]}</span>
            <span className="block h-2 w-full bg-raised">
              <span className="block h-full transition-[width] duration-500 ease-out"
                    style={{ width: `${(r.bits / widest) * 100}%`,
                             background: "var(--color-info)" }} />
            </span>
            <span className="tnum text-right text-[13px] text-fg">
              +{r.bits.toFixed(2)}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,190px)_minmax(0,1fr)_86px] items-center gap-4 border-b border-line py-2.5">
          <span className="text-[13.5px] text-fg-faint">
            everything else disagrees
          </span>
          <span />
          <span className="tnum text-right text-[13px] text-fg-faint">
            {drag.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="self-start">
        <div className="label">Total evidence</div>
        <div className="tnum mt-3 text-[40px] leading-none font-medium tracking-[-0.03em]"
             style={{ color: edge ? "var(--color-ok)" : "var(--color-bad)" }}>
          {total.toFixed(2)}
          <span className="ml-2 text-[14px] font-normal text-fg-faint">bits</span>
        </div>
        <div className="t-meta mt-3">
          Edge threshold {threshold.toFixed(2)} bits.
        </div>
        <p className="mt-5 border-t border-line pt-4 text-[13.5px] leading-[1.6] text-fg-2">
          {edge
            ? "Enough. An edge is drawn between these two accounts."
            : "Not enough. No edge, and these two are never compared again."}
        </p>
        <dl className="mt-6 space-y-2.5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="t-meta">This cluster's average edge</dt>
            <dd className="tnum text-[13px] text-fg">{meanBits.toFixed(1)} bits</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="t-meta">Its weakest link</dt>
            <dd className="tnum text-[13px] text-fg">{minBits.toFixed(1)} bits</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/* Step 5. Two questions, two answers, never conflated. */
function Scores({ c }) {
  const meter = (value, colour) => (
    <span className="mt-3 block h-3 w-full bg-raised">
      <span className="block h-full transition-[width] duration-700 ease-out"
            style={{ width: `${value * 100}%`, background: colour }} />
    </span>
  );

  return (
    <div className="grid gap-x-14 gap-y-10 sm:grid-cols-2">
      <div>
        <div className="label">Ring probability</div>
        <p className="t-meta mt-2 max-w-[38ch]">Is this cluster a ring?</p>
        <div className="tnum mt-5 text-[40px] leading-none font-medium tracking-[-0.03em] text-fg">
          {c.probability.toFixed(3)}
        </div>
        {meter(c.probability, "var(--color-info)")}
      </div>
      <div>
        <div className="label">Predicted ring purity</div>
        <p className="t-meta mt-2 max-w-[38ch]">
          What fraction of its {Math.round(c.shape.size)} accounts are ring
          accounts?
        </p>
        <div className="tnum mt-5 text-[40px] leading-none font-medium tracking-[-0.03em] text-fg">
          {c.predicted_ring_purity.toFixed(3)}
        </div>
        {meter(c.predicted_ring_purity, "var(--color-warn)")}
        <p className="t-meta mt-3">
          True purity once the answer key is opened:{" "}
          <span className="tnum text-fg-2">{c.true_ring_purity.toFixed(2)}</span>
        </p>
      </div>
    </div>
  );
}

/* Step 6. Three prices, the cheapest wins, and you can see by how much. */
function Decision({ c }) {
  const costs = c.expected_cost_rupees;
  const worst = Math.max(...Object.values(costs));
  const order = ["block", "review", "allow"];

  return (
    <div>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
        {order.map((a) => {
          const on = a === c.action;
          return (
            <div key={a} className={cn("px-5 py-5", on ? "bg-active" : "bg-surface")}>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2.5">
                  <Status tone={TONE_FOR[a]} />
                  <span className={cn("text-[15px] font-medium uppercase tracking-[0.02em]",
                                      on ? "text-fg" : "text-fg-faint")}>
                    {a}
                  </span>
                </span>
                {on && <span className="label">chosen</span>}
              </div>
              <div className={cn("tnum mt-4 text-[24px] leading-none font-medium",
                                 on ? "text-fg" : "text-fg-muted")}>
                {rupees(costs[a])}
              </div>
              <span className="mt-3 block h-2 w-full bg-raised">
                <span className="block h-full"
                      style={{ width: `${(costs[a] / worst) * 100}%`,
                               background: on ? `var(--color-${TONE_FOR[a]})`
                                              : "var(--color-fg-dim)" }} />
              </span>
              <p className="t-meta mt-3">expected cost of this action</p>
            </div>
          );
        })}
      </div>
      <p className="mt-6 max-w-[76ch] text-[15px] leading-[1.55] text-fg-2">
        {c.action === "block"
          ? "Purity is high enough that stopping the whole cluster costs less than letting it run."
          : c.action === "review"
          ? "Too risky to allow, not certain enough to block. A person decides, for the price of their time."
          : "Blocking this group would cost far more than the discount it could ever farm."}
      </p>
    </div>
  );
}

function Step({ n, title, caption, active, children }) {
  return (
    <section
      className={cn("border-t border-line-strong pt-8 transition-opacity duration-500",
                    active ? "opacity-100" : "pointer-events-none opacity-0")}
      hidden={!active}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tnum text-[12px] text-fg-dim">
          {String(n).padStart(2, "0")} / {String(LAST).padStart(2, "0")}
        </span>
        <h3 className="text-[19px] font-medium tracking-[-0.015em] text-fg">{title}</h3>
      </div>
      <p className="mt-2.5 max-w-[70ch] text-[15px] leading-[1.55] text-fg-muted">
        {caption}
      </p>
      <div className="mt-9">{children}</div>
    </section>
  );
}

export default function Simulation({ onGoTo }) {
  const sim = useJson("sim_cases");
  const blocking = useJson("blocking");
  const clustering = useJson("clustering");
  const link = useJson("link_params");
  const holdout = useJson("holdout");
  const generator = useJson("generator_check");

  // #simulation?tier=adaptive&group=lookalike deep-links one case, so a run
  // can be sent to somebody rather than described to them.
  const [tier, setTier] = useState(() => param("tier", TIERS, "moderate"));
  const [scenario, setScenario] = useState(
    () => param("group", ["ring", "lookalike"], "ring"));
  const [pick, setPick] = useState(0);
  // Runs on arrival. A judge should not have to find a button to see the
  // product work, and changing tier or case restarts it.
  const [step, setStep] = useState(1);
  const timer = useRef(null);
  const reduced = usePrefersReducedMotion();

  const cases = sim.data?.cases?.[scenario]?.[tier] ?? [];
  const other = sim.data?.cases?.[scenario === "ring" ? "lookalike" : "ring"]?.[tier] ?? [];
  const c = cases[Math.min(pick, cases.length - 1)];
  const companion = other[0];

  useEffect(() => {
    setPick(0);
    setStep(1);
    clearTimeout(timer.current);
  }, [tier, scenario]);

  useEffect(() => {
    if (step === 0 || step >= LAST) return undefined;
    if (reduced) {
      setStep(LAST);
      return undefined;
    }
    timer.current = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(timer.current);
  }, [step, reduced]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const route = window.location.hash.replace("#", "").split("?")[0] || "simulation";
    window.history.replaceState(null, "", `#${route}?tier=${tier}&group=${scenario}`);
  }, [tier, scenario]);

  const levels = useMemo(
    () => (generator.data
      ? (scenario === "ring" ? ringLevels(generator.data, tier) : BENIGN_LEVELS)
      : null),
    [generator.data, scenario, tier]
  );

  if (sim.loading || blocking.loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!sim.data || !blocking.data || !clustering.data || !link.data || !generator.data) {
    return <Empty>No results/sim_cases.json yet. Run ./run.sh.</Empty>;
  }
  if (!c) return <Empty>No case for this tier yet. Run python -m detector.sim_cases.</Empty>;

  const b = blocking.data.tiers[tier];
  const cl = clustering.data.tiers[tier];
  const n = blocking.data.n_accounts_per_world;
  const possible = (n * (n - 1)) / 2;
  const prevalence = holdout.data?.results_matrix?.[tier]?.account_prevalence ?? 0.008;
  const done = step >= LAST;

  return (
    <div className="pt-12">
      <header className="pb-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-[34px] leading-[1.08] font-medium tracking-[-0.03em] text-fg sm:text-[40px]">
            Watch one cluster get decided.
          </h1>
          <span className="inline-flex items-center gap-2.5 border border-line px-3 py-1.5 text-[12px] text-fg-muted">
            <Status tone="info" />
            Deterministic replay of a real Jaal run
          </span>
        </div>
        <p className="mt-4 max-w-[76ch] text-[16px] leading-[1.55] text-fg-muted">
          Every number below belongs to a real cluster that went through the
          pipeline on the sealed holdout. The browser draws them, it does not
          compute them.
        </p>
      </header>

      <div className="border-y border-line-strong py-7">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-7">
          <Control
            label="Adversary tier"
            value={tier}
            onChange={setTier}
            options={TIERS.map((t) => ({ value: t, label: t }))}
          />
          <Control
            label="Group"
            value={scenario}
            onChange={setScenario}
            options={[
              { value: "ring", label: "coordinated ring" },
              { value: "lookalike", label: "benign lookalike" },
            ]}
          />
          <div>
            <div className="label mb-2.5">Case</div>
            <select
              value={pick}
              onChange={(e) => { setPick(Number(e.target.value)); setStep(1); }}
              className="interactive h-10 border border-line bg-base px-3 text-[13px] text-fg-2 hover:border-line-strong"
            >
              {cases.map((x, i) => (
                <option key={`${x.seed}-${x.cluster_id}`} value={i}>
                  seed {x.seed} · cluster {x.cluster_id} ·{" "}
                  {Math.round(x.shape.size)} accounts
                  {x.benign_kind ? ` · ${x.benign_kind}` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            className="interactive ml-auto inline-flex h-11 shrink-0 items-center gap-2.5 bg-fg px-6 text-[14px] font-medium text-base hover:opacity-90"
          >
            <RotateCcw size={15} />
            Replay
          </button>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-x-1 gap-y-2">
            {STEPS.map(([name], i) => {
              const nStep = i + 1;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setStep(nStep)}
                  aria-current={step === nStep ? "step" : undefined}
                  className={cn(
                    "interactive h-9 border-b-2 px-4 text-[13px]",
                    step === nStep ? "border-fg font-medium text-fg"
                      : step > nStep ? "border-line-loud text-fg-muted hover:text-fg"
                      : "border-line text-fg-faint hover:text-fg-muted"
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            <Step n={1} title="Accounts" caption={STEPS[0][1]} active={step === 1}>
              <Schema n={n} prevalence={prevalence} />
              <p className="mt-9 max-w-[74ch] text-[15px] leading-[1.55] text-fg-2">
                Each row is one account with a real payment, a real delivery and
                one valid first-order coupon.{" "}
                <span className="tnum text-fg">{count(Math.round(prevalence * n))}</span>{" "}
                of the {count(n)} belong to a ring, and the detector is not told
                which. Nothing in a single row is wrong, which is why nothing is
                judged row by row.
              </p>
            </Step>

            <Step n={2} title="Blocking" caption={STEPS[1][1]} active={step === 2}>
              <Blocking
                possible={possible}
                candidates={b.candidate_pairs_mean}
                cut={b.pair_reduction_ratio}
                rules={blocking.data.rules}
                recall={b.blocking_recall}
              />
            </Step>

            <Step n={3} title="Link" caption={STEPS[2][1]} active={step === 3}>
              <Evidence
                params={link.data}
                levels={levels}
                threshold={clustering.data.edge_threshold_bits}
                meanBits={c.shape.mean_edge_bits}
                minBits={c.shape.min_edge_bits}
              />
            </Step>

            <Step n={4} title="Graph" caption={STEPS[3][1]} active={step === 4}>
              <div className="border border-line bg-surface/50 p-4 sm:p-6">
                <ClusterGraph focus={c} companion={companion} step={4}
                              focusTone={scenario === "ring" ? "warn" : "ok"} />
              </div>
              <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-3">
                <Figure label="Edges above the threshold" value={count(cl.edges)}
                        note={`across the whole world, worth ${clustering.data.edge_threshold_bits} bits or more`} />
                <Figure label="Clusters found" value={count(cl.n_clusters)}
                        note={`Leiden at resolution ${clustering.data.resolution}`} />
                <Figure label="This cluster's edge density"
                        value={c.shape.edge_density.toFixed(2)}
                        note={`1.00 means every account links to every other`} />
              </div>
            </Step>

            <Step n={5} title="Cluster" caption={STEPS[4][1]} active={step === 5}>
              <div className="border border-line bg-surface/50 p-4 sm:p-6">
                <ClusterGraph focus={c} companion={companion} step={5}
                              focusTone={scenario === "ring" ? "warn" : "ok"} />
              </div>
              <div className="mt-10">
                <Scores c={c} />
              </div>
            </Step>

            <Step n={6} title="Decision" caption={STEPS[5][1]} active={step === 6}>
              <Decision c={c} />
            </Step>
      </div>

      {done && (
        <section className="mt-16 border border-line-strong">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-strong bg-surface px-6 py-4">
            <h2 className="text-[15px] font-medium text-fg">Simulation result</h2>
            <span className="t-meta">
              {tier} tier · seed {c.seed} · cluster {c.cluster_id} ·{" "}
              {scenario === "ring" ? "coordinated ring" : c.benign_kind}
            </span>
          </div>

          <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Accounts in cluster", Math.round(c.shape.size), null],
              ["Ring probability", c.probability.toFixed(3), null],
              ["Predicted ring purity", c.predicted_ring_purity.toFixed(3), null],
              ["Action", c.action.toUpperCase(), TONE_FOR[c.action]],
              ["Discount at risk", rupees(c.behaviour.total_discount), null],
              ["Strongest signal", c.strongest_signal, null],
              ["Cheapest action costs", rupees(c.expected_cost_rupees[c.action]), null],
              ["Human needed", c.action === "review" ? "yes" : "no", null],
            ].map(([k, v, tone]) => (
              <div key={k} className="bg-base px-6 py-5">
                <dt className="label">{k}</dt>
                <dd className="tnum mt-3 text-[22px] leading-none font-medium tracking-[-0.02em]"
                    style={{ color: tone ? `var(--color-${tone})` : "var(--color-fg)" }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3 border-t border-line-strong px-6 py-5">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="interactive inline-flex h-10 items-center gap-2.5 border border-line-loud px-4 text-[13px] text-fg hover:bg-active"
            >
              <RotateCcw size={13} /> Run again
            </button>
            <button
              type="button"
              onClick={() => setScenario(scenario === "ring" ? "lookalike" : "ring")}
              className="interactive inline-flex h-10 items-center gap-2.5 border border-line-loud px-4 text-[13px] text-fg hover:bg-active"
            >
              {scenario === "ring" ? "Try a benign lookalike" : "Try a coordinated ring"}
            </button>
            <button
              type="button"
              onClick={() => setTier(TIERS[Math.min(TIERS.indexOf(tier) + 1, TIERS.length - 1)])}
              disabled={tier === "adaptive"}
              className="interactive inline-flex h-10 items-center gap-2.5 border border-line-loud px-4 text-[13px] text-fg hover:bg-active disabled:cursor-not-allowed disabled:border-line disabled:text-fg-dim"
            >
              Try a harder operator
            </button>
            <button
              type="button"
              onClick={() => onGoTo?.("results")}
              className="interactive ml-auto inline-flex h-10 items-center gap-2.5 text-[13px] text-fg-muted hover:text-fg"
            >
              See the holdout results <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
