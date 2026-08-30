import { ArrowRight } from "lucide-react";
import { Empty, Section, Skeleton } from "@/components/section";
import { count, compactRupees, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const INK = "var(--color-fg-faint)";
const LINE = "var(--color-line-strong)";

/*
  The whole page answers four questions in order: what the fraud is, whether
  Jaal catches it, how, and why the decision is priced. Every figure comes from
  a result file. Nothing here is computed except pair counts, which are
  n choose 2, and the cost ratio, which is one price divided by another.
*/

function Hero({ onSimulate }) {
  return (
    <header className="border-b border-line pt-16 pb-14">
      <h1 className="t-hero max-w-[17ch] text-balance">
        Finding the fraud between transactions, not inside them.
      </h1>
      <p className="t-body mt-6 max-w-[62ch]">
        Fifty accounts each place one perfectly ordinary order and each claim one
        first-order discount. Nothing is wrong with any of them. Jaal works on
        the group.
      </p>
      <button
        type="button"
        onClick={onSimulate}
        className="interactive mt-9 inline-flex h-10 items-center gap-2.5 border border-line-loud px-5 text-[13.5px] text-fg hover:bg-active"
      >
        Watch Jaal work
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </header>
  );
}

/* Diagram 1. Answers: what is the actual fraud? */
function OneOperator() {
  const rows = [0, 1, 2, 3, 4];
  const y = (i) => 40 + i * 42;
  const names = ["Account A", "Account B", "Account C", "Account D", "Account E"];

  return (
    <figure className="m-0 border-y border-line-strong py-10">
      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <svg
          viewBox="0 0 620 250"
          className="w-full"
          role="img"
          aria-label="Five accounts, each an ordinary first order, all run by one operator"
        >
          <text x="0" y="16" fontSize="11" fill={INK} fontFamily="var(--font-sans)"
                letterSpacing="0.08em">
            SEEN ONE AT A TIME
          </text>
          <text x="452" y="16" fontSize="11" fill={INK} fontFamily="var(--font-sans)"
                letterSpacing="0.08em">
            SEEN TOGETHER
          </text>

          {rows.map((i) => (
            <g key={i}>
              <rect x="0" y={y(i) - 13} width="270" height="26" rx="2"
                    fill="var(--color-surface)" stroke="var(--color-line)" />
              <circle cx="16" cy={y(i)} r="3.5" fill={INK} />
              <text x="32" y={y(i) + 4} fontSize="12" fill="var(--color-fg-2)"
                    fontFamily="var(--font-sans)">
                {names[i]}
              </text>
              <text x="262" y={y(i) + 4} textAnchor="end" fontSize="11.5"
                    fill="var(--color-ok)" fontFamily="var(--font-sans)">
                legitimate
              </text>
              <path
                d={`M 282 ${y(i)} C 360 ${y(i)}, 380 125, 452 125`}
                stroke={LINE} strokeWidth="1" fill="none" opacity="0.75"
              />
            </g>
          ))}

          <circle cx="470" cy="125" r="8" fill="var(--color-warn)" />
          <text x="490" y="121" fontSize="13.5" fill="var(--color-fg)"
                fontFamily="var(--font-sans)">
            one operator
          </text>
          <text x="490" y="140" fontSize="11.5" fill={INK} fontFamily="var(--font-sans)">
            5 accounts, 5 discounts
          </text>
        </svg>

        <div className="self-center lg:border-l lg:border-line lg:pl-14">
          <p className="text-[19px] leading-[1.35] tracking-[-0.015em] text-fg">
            The transaction is legitimate.
            <br />
            The relationship is fraudulent.
          </p>
          <p className="t-meta mt-5 max-w-[38ch]">
            A model that scores one transaction at a time has nothing to score.
            So the unit of detection is the cluster, never the transaction.
          </p>
        </div>
      </div>
    </figure>
  );
}

function Headline({ pooled, holdout }) {
  const supporting = [
    ["Blocking precision", pct(pooled.precision, 2), "of blocked accounts really were a ring"],
    ["Accounts blocked", count(pooled.accounts_blocked), "across the sealed holdout"],
    ["Wrong blocks", count(pooled.fp), "real customers stopped in the whole holdout"],
    ["Recall with review", pct(pooled.recall_including_review, 2),
     "ring accounts blocked or sent to a human"],
  ];

  return (
    <div className="border-b border-line pb-12">
      <div className="pt-12">
        <div className="label">Net benefit against doing nothing</div>
        <div className="tnum mt-5 text-[clamp(3.5rem,2rem+5vw,6rem)] leading-[0.95] font-medium tracking-[-0.035em] text-fg">
          {compactRupees(pooled.net_vs_nothing_rupees)}
        </div>
        <p className="t-meta mt-5 max-w-[52ch]">
          {count(holdout.n_seeds)} worlds, {count(pooled.n_accounts)} accounts,
          seeds {holdout.opened.replace("seeds ", "").replace(", once", "")}, opened
          once. {pct(1 - pooled.cost_rupees / pooled.do_nothing_rupees, 1)} of the
          abuse cost removed.
        </p>
      </div>

      <dl className="mt-12 grid gap-y-9 border-t border-line pt-9 sm:grid-cols-2 lg:grid-cols-4">
        {supporting.map(([label, value, note], i) => (
          <div
            key={label}
            className={cn("min-w-0", i > 0 && "sm:border-l sm:border-line sm:pl-8",
                          i === 2 && "sm:border-l-0 sm:pl-0 lg:border-l lg:pl-8")}
          >
            <dt className="label">{label}</dt>
            <dd className="tnum mt-3.5 text-[30px] leading-none font-medium tracking-[-0.025em] text-fg">
              {value}
            </dd>
            <dd className="t-meta mt-3 max-w-[30ch] text-fg-faint">{note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* Diagram 2 and 3. Answers: how does the search space collapse, and how does a
   pile of accounts become one decision? Log scale, or the first bar is the
   only bar. */
function Mechanism({ blocking, clustering, model, tier = "moderate" }) {
  const n = blocking.n_accounts_per_world;
  const b = blocking.tiers[tier];
  const c = clustering.tiers[tier];
  const possible = (n * (n - 1)) / 2;

  const steps = [
    [n, "accounts", "one merchant, one batch"],
    [possible, "possible pairs", "every account against every other"],
    [b.candidate_pairs_mean, "candidate pairs",
     `${blocking.rules.length} blocking rules, ${pct(b.pair_reduction_ratio, 2)} cut`],
    [c.edges, "graph edges",
     `pairs worth ${clustering.edge_threshold_bits} bits or more of evidence`],
    [c.n_clusters, "clusters", `Leiden at resolution ${clustering.resolution}`],
    [model.n_features, "features per cluster", "structure, timing, behaviour, money"],
  ];
  const top = Math.log10(possible);

  return (
    <div className="border-t border-line">
      {steps.map(([value, label, note], i) => (
        <div
          key={label}
          className="grid items-center gap-x-6 gap-y-2 border-b border-line px-2 py-4 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,230px)]"
        >
          <span className="tnum text-[15px] text-fg">
            {count(value)}
            <span className="ml-2.5 text-[12.5px] font-normal text-fg-muted">{label}</span>
          </span>
          <span className="block h-2 w-full bg-raised">
            <span
              className="block h-full"
              style={{
                width: `${(Math.log10(Math.max(value, 1)) / top) * 100}%`,
                background: i === 0 ? "var(--color-accent)" : "var(--color-fg-dim)",
              }}
            />
          </span>
          <span className="t-meta text-fg-faint sm:text-right">{note}</span>
        </div>
      ))}

      <div className="grid gap-x-6 gap-y-2 border-b border-line px-2 py-4 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
        <span className="text-[15px] text-fg">two scores</span>
        <span className="t-meta text-fg-muted">
          is this cluster a ring, and what fraction of it is ring accounts
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-2 py-5">
        {["block", "review", "allow"].map((a, i) => (
          <span key={a} className="flex items-center gap-3">
            {i > 0 && <span className="text-fg-dim">/</span>}
            <span className="border border-line-loud px-3.5 py-1.5 text-[13px] text-fg">
              {a}
            </span>
          </span>
        ))}
        <span className="t-meta ml-auto text-fg-faint">one action per cluster</span>
      </div>
    </div>
  );
}

/* Diagram 4. Answers: why is the decision priced at all? */
function CostAsymmetry({ decisions }) {
  const prices = [
    ["Blocking a real customer", decisions.cost_blocked_innocent, "var(--color-bad)"],
    ["Missing an abuser", decisions.cost_missed_abuser, "var(--color-fg-dim)"],
    ["One analyst review", decisions.cost_analyst_review, "var(--color-fg-dim)"],
  ];
  const top = decisions.cost_blocked_innocent;
  const ratio = Math.round(decisions.cost_blocked_innocent / decisions.cost_missed_abuser);

  return (
    <div className="grid gap-x-16 gap-y-10 border-y border-line-strong py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div>
        {prices.map(([label, value, color]) => (
          <div key={label} className="border-b border-line py-4 last:border-b-0">
            <div className="flex items-baseline justify-between gap-6">
              <span className="text-[13.5px] text-fg-muted">{label}</span>
              <span className="tnum text-[17px] text-fg">{rupees(value)}</span>
            </div>
            <span className="mt-2.5 block h-2.5 w-full bg-raised">
              <span className="block h-full" style={{ width: `${(value / top) * 100}%`, background: color }} />
            </span>
          </div>
        ))}
      </div>

      <div className="self-center lg:border-l lg:border-line lg:pl-16">
        <div className="tnum text-[44px] leading-none font-medium tracking-[-0.03em] text-fg">
          {ratio}&times;
        </div>
        <div className="label mt-3">cost asymmetry</div>

        <div className="tnum mt-9 border-t border-line pt-7 text-[36px] leading-none font-medium tracking-[-0.03em] text-fg">
          {pct(decisions.breakeven_precision, 2)}
        </div>
        <div className="label mt-3">break-even precision for blocking</div>

        <p className="mt-7 max-w-[42ch] text-[13.5px] leading-[1.65] text-fg-2">
          Jaal does not optimise for detection alone. It optimises for the
          merchant's decision.
        </p>
      </div>
    </div>
  );
}

export default function Overview({
  holdout, decisions, blocking, clustering, model, loading, onSimulate,
}) {
  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const pooled = holdout.pooled;

  return (
    <div>
      <Hero onSimulate={onSimulate} />

      <Section title="What the fraud actually is">
        <OneOperator />
      </Section>

      <Headline pooled={pooled} holdout={holdout} />

      {blocking && clustering && model && (
        <Section
          title="How a batch of accounts becomes one decision"
          lede="Moderate tier, measured. Log scale, because these rows span more than six orders of magnitude."
        >
          <Mechanism blocking={blocking} clustering={clustering} model={model} />
        </Section>
      )}

      {decisions && (
        <Section
          title="Why the decision is priced"
          lede="Three prices decide everything. All three belong to the merchant's finance team, not to the model."
        >
          <CostAsymmetry decisions={decisions} />
        </Section>
      )}

      <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-line-strong pt-10">
        <p className="max-w-[46ch] text-[15px] leading-[1.6] text-fg-muted">
          The rest is evidence. Watch the pipeline run on one world, then check
          the numbers on the sealed holdout.
        </p>
        <button
          type="button"
          onClick={onSimulate}
          className="interactive inline-flex h-11 shrink-0 items-center gap-2.5 border border-line-loud px-6 text-[14px] text-fg hover:bg-active"
        >
          Watch Jaal work
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
