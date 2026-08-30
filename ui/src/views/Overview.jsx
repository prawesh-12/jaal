import { ArrowRight, Coins, Network, SlidersHorizontal } from "lucide-react";
import { Empty, Skeleton } from "@/components/section";
import { count, compactRupees, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const INK = "var(--color-fg-faint)";
const LINE = "var(--color-line-strong)";

/*
  The whole page is the pitch, and nothing else. Four things: what the fraud
  is, that Jaal catches it, how in one line each, and a way in. Everything a
  reader might want next lives on another page.
*/

/* Answers: what is the actual fraud? */
function OneOperator() {
  const rows = [0, 1, 2, 3, 4];
  const y = (i) => 40 + i * 42;
  const names = ["Account A", "Account B", "Account C", "Account D", "Account E"];

  return (
    <figure className="m-0">
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

        <figcaption className="self-center lg:border-l lg:border-line lg:pl-14">
          <p className="text-[19px] leading-[1.35] tracking-[-0.015em] text-fg">
            The transaction is legitimate.
            <br />
            The relationship is fraudulent.
          </p>
          <p className="t-meta mt-5 max-w-[38ch]">
            A model that scores one transaction at a time has nothing to score.
            So the unit of detection is the cluster, never the transaction.
          </p>
        </figcaption>
      </div>
    </figure>
  );
}

function Headline({ pooled, holdout }) {
  const supporting = [
    ["Blocking precision", pct(pooled.precision, 2)],
    ["Accounts blocked", count(pooled.accounts_blocked)],
    ["Wrong blocks", count(pooled.fp)],
    ["Recall with review", pct(pooled.recall_including_review, 2)],
  ];

  return (
    <div className="border-y border-line-strong py-14">
      <div className="label">Net benefit against doing nothing</div>
      <div className="tnum mt-5 text-[clamp(3.75rem,2rem+6vw,7rem)] leading-[0.92] font-medium tracking-[-0.04em] text-fg">
        {compactRupees(pooled.net_vs_nothing_rupees)}
      </div>
      <p className="t-meta mt-5 max-w-[54ch]">
        Sealed holdout, {holdout.opened}. {count(holdout.n_seeds)} worlds,{" "}
        {count(pooled.n_accounts)} accounts.
      </p>

      <dl className="mt-12 grid gap-y-8 border-t border-line pt-9 sm:grid-cols-2 lg:grid-cols-4">
        {supporting.map(([label, value], i) => (
          <div
            key={label}
            className={cn("min-w-0", i > 0 && "sm:border-l sm:border-line sm:pl-8",
                          i === 2 && "sm:border-l-0 sm:pl-0 lg:border-l lg:pl-8")}
          >
            <dt className="label">{label}</dt>
            <dd className="tnum mt-3.5 text-[32px] leading-none font-medium tracking-[-0.025em] text-fg">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function HowInThreeLines({ model, decisions }) {
  const facts = [
    [Network, "It works on groups",
     `Accounts become a graph, the graph becomes clusters, and a cluster becomes ${model ? model.n_features : 24} numbers.`],
    [SlidersHorizontal, "Two models, not one",
     "One asks whether a cluster is a ring. A second asks what fraction of it is."],
    [Coins, "The decision is priced",
     decisions
       ? `A wrong block costs ${Math.round(decisions.cost_blocked_innocent / decisions.cost_missed_abuser)} times a miss, so it blocks, reviews or allows on expected cost.`
       : "It blocks, reviews or allows on expected cost, not on a threshold."],
  ];

  return (
    <dl className="grid gap-x-12 gap-y-9 py-14 sm:grid-cols-3">
      {facts.map(([Icon, title, body], i) => (
        <div key={title} className={cn("min-w-0", i > 0 && "sm:border-l sm:border-line sm:pl-12")}>
          <Icon size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-faint" />
          <dt className="mt-4 text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</dt>
          <dd className="t-meta mt-2.5 max-w-[34ch]">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Overview({ holdout, decisions, model, loading, onSimulate }) {
  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  return (
    <div>
      <header className="pt-16 pb-14">
        <h1 className="t-hero max-w-[17ch] text-balance">
          Finding the fraud between transactions, not inside them.
        </h1>
        <p className="t-body mt-6 max-w-[60ch]">
          Fifty accounts each place one perfectly ordinary order and each claim
          one first-order discount. Nothing is wrong with any of them. Jaal works
          on the group.
        </p>
      </header>

      <OneOperator />

      <div className="mt-14">
        <Headline pooled={holdout.pooled} holdout={holdout} />
      </div>

      <HowInThreeLines model={model} decisions={decisions} />

      <div className="flex flex-wrap items-center justify-between gap-6 border-t border-line-strong pt-10">
        <p className="max-w-[44ch] text-[15px] leading-[1.6] text-fg-muted">
          Watch it run on one world, then check the numbers on the sealed holdout.
        </p>
        <button
          type="button"
          onClick={onSimulate}
          className="interactive inline-flex h-11 shrink-0 items-center gap-2.5 border border-line-loud px-6 text-[14px] text-fg hover:bg-active"
        >
          Run a simulation
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
