import { ArrowRight } from "lucide-react";
import { Empty, Skeleton } from "@/components/section";
import { count, compactRupees, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const MUTED = "var(--color-fg-faint)";
const LINE = "var(--color-line-strong)";

/*
  Ten seconds: what Jaal is, what it is for, why it is different, what it
  returned. Everything else on this page is one scroll below that and stops
  after the diagram. Detail lives on the other five pages.
*/

function Hero({ pooled, holdout, onSimulate }) {
  const differences = [
    "Scores relationships, not transactions",
    "Decides on a cluster, never an account",
    "Prices block, review and allow in rupees",
  ];

  return (
    <header className="grid gap-x-20 gap-y-14 border-b border-line-strong pt-14 pb-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div>
        <div className="label">Coordinated promo-abuse detection</div>
        <h1 className="t-hero mt-6 max-w-[16ch] text-balance">
          Finding the fraud between transactions, not inside them.
        </h1>
        <p className="mt-7 max-w-[56ch] text-[17px] leading-[1.55] text-fg-2">
          One operator, fifty accounts, fifty ordinary first orders, fifty
          first-order discounts. Jaal finds the group.
        </p>

        <ul className="mt-9 space-y-3">
          {differences.map((d) => (
            <li key={d} className="flex items-baseline gap-3.5 text-[15px] text-fg-muted">
              <span aria-hidden="true" className="mt-[7px] size-[6px] shrink-0 bg-fg-dim" />
              {d}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onSimulate}
          className="interactive mt-10 inline-flex h-12 items-center gap-2.5 bg-fg px-7 text-[15px] font-medium text-base hover:opacity-90"
        >
          Watch a cluster get decided
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="self-center lg:border-l lg:border-line lg:pl-20">
        <div className="label">Net benefit against doing nothing</div>
        <div className="tnum mt-4 text-[clamp(3.25rem,2rem+4vw,5rem)] leading-[0.95] font-medium tracking-[-0.035em] text-ok">
          {compactRupees(pooled.net_vs_nothing_rupees)}
        </div>
        <p className="t-meta mt-4 max-w-[42ch]">
          On a sealed holdout of {count(holdout.n_seeds)} worlds and{" "}
          {count(pooled.n_accounts)} accounts, opened once.
        </p>

        <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-line pt-8">
          {[
            ["Blocking precision", pct(pooled.precision, 2)],
            ["Wrong blocks", count(pooled.fp)],
            ["Accounts blocked", count(pooled.accounts_blocked)],
            ["Caught with review", pct(pooled.recall_including_review, 2)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd className="tnum mt-3 text-[28px] leading-none font-medium tracking-[-0.025em] text-fg">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

/* The one diagram this project needs: five ordinary accounts, then the same
   five as one operator. Read top to bottom. */
function Relationship() {
  const names = ["Account A", "Account B", "Account C", "Account D", "Account E"];

  return (
    <figure className="m-0 py-16">
      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="label">Seen one at a time</div>
          <ul className="mt-5 space-y-2">
            {names.map((name) => (
              <li key={name}
                  className="flex items-center justify-between gap-6 border border-line bg-surface px-4 py-3">
                <span className="flex items-center gap-3 text-[14px] text-fg-2">
                  <span aria-hidden="true" className="size-2 rounded-full bg-fg-dim" />
                  {name}
                </span>
                <span className="text-[13px] text-fg-muted">
                  1 order · coupon claimed · paid · delivered
                </span>
                <span className="text-[13px] text-ok">legitimate</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[14px] text-fg-muted">
            Every check a transaction model can run comes back clean.
          </p>
        </div>

        <div>
          <div className="label">Seen together</div>
          <svg viewBox="0 0 560 260" className="mt-5 w-full" role="img"
               aria-label="The same five accounts converging on one operator">
            {[0, 1, 2, 3, 4].map((i) => {
              const y = 34 + i * 48;
              return (
                <g key={i}>
                  <circle cx="26" cy={y} r="6" fill={MUTED} />
                  <text x="46" y={y + 4} fontSize="13" fill="var(--color-fg-2)"
                        fontFamily="var(--font-sans)">
                    {String.fromCharCode(65 + i)}
                  </text>
                  <path d={`M 70 ${y} C 168 ${y}, 200 130, 286 130`}
                        stroke={LINE} strokeWidth="1.2" fill="none" />
                </g>
              );
            })}
            <circle cx="306" cy="130" r="13" fill="var(--color-warn)" />
            <text x="336" y="124" fontSize="17" fill="var(--color-fg)"
                  fontFamily="var(--font-sans)" fontWeight="500">
              One operator
            </text>
            <text x="336" y="148" fontSize="13" fill={MUTED}
                  fontFamily="var(--font-sans)">
              5 accounts, 5 discounts, 1 person
            </text>
          </svg>

          <div className="mt-8 border-l-2 border-warn pl-6">
            <p className="text-[21px] leading-[1.35] tracking-[-0.015em] text-fg">
              The transaction is legitimate.
              <br />
              The relationship is fraudulent.
            </p>
            <p className="mt-4 max-w-[44ch] text-[14px] leading-[1.6] text-fg-muted">
              A model that scores one transaction at a time has nothing to score.
              So the unit of detection is the cluster, never the transaction.
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* What the product does, in three moves. Not a pipeline diagram: that is on
   the simulation page, running. */
function Product({ model, decisions, onSimulate }) {
  const ratio = decisions
    ? Math.round(decisions.cost_blocked_innocent / decisions.cost_missed_abuser)
    : null;

  const steps = [
    ["Link", "Every pair of accounts is scored in bits of evidence. Enough of it draws an edge.",
     "Fellegi-Sunter, 14-bit threshold"],
    ["Cluster", `The graph is cut into groups, and each group becomes ${model ? model.n_features : 24} numbers.`,
     "Leiden communities"],
    ["Price", ratio
      ? `Two models score the group, then each action is priced. A wrong block costs ${ratio}x a miss.`
      : "Two models score the group, then each action is priced.",
     "Block · review · allow"],
  ];

  return (
    <section className="border-y border-line-strong py-16">
      <h2 className="text-[26px] leading-tight font-medium tracking-[-0.02em] text-fg">
        Three moves, then a priced decision.
      </h2>

      <ol className="mt-12 grid gap-x-14 gap-y-12 sm:grid-cols-3">
        {steps.map(([title, body, meta], i) => (
          <li key={title} className={cn("min-w-0", i > 0 && "sm:border-l sm:border-line sm:pl-14")}>
            <span className="tnum text-[12px] text-fg-dim">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-[20px] font-medium tracking-[-0.015em] text-fg">
              {title}
            </h3>
            <p className="mt-3 max-w-[36ch] text-[14.5px] leading-[1.6] text-fg-muted">
              {body}
            </p>
            <p className="mt-4 text-[12.5px] text-fg-faint">{meta}</p>
          </li>
        ))}
      </ol>

      {decisions && (
        <div className="mt-14 grid gap-x-14 gap-y-8 border-t border-line pt-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="label">Why the price matters</div>
            <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.45] text-fg">
              Blocking a real customer costs {rupees(decisions.cost_blocked_innocent)}.
              Missing an abuser costs {rupees(decisions.cost_missed_abuser)}.
            </p>
            <p className="mt-4 max-w-[48ch] text-[14px] leading-[1.6] text-fg-muted">
              So blocking only pays above{" "}
              <span className="tnum text-fg">{pct(decisions.breakeven_precision, 2)}</span>{" "}
              precision. Below that, a detector that catches everything still
              loses money. That is why there is a third action.
            </p>
          </div>
          <div className="self-center">
            {[
              ["Block a real customer", decisions.cost_blocked_innocent, "var(--color-bad)"],
              ["Review one cluster", decisions.cost_analyst_review, "var(--color-warn)"],
              ["Miss one abuser", decisions.cost_missed_abuser, "var(--color-fg-dim)"],
            ].map(([label, value, colour]) => (
              <div key={label} className="border-b border-line py-3.5 last:border-b-0">
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-[13.5px] text-fg-muted">{label}</span>
                  <span className="tnum text-[16px] text-fg">{rupees(value)}</span>
                </div>
                <span className="mt-2.5 block h-2.5 w-full bg-raised">
                  <span className="block h-full"
                        style={{ width: `${(value / decisions.cost_blocked_innocent) * 100}%`,
                                 background: colour }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSimulate}
        className="interactive mt-14 inline-flex h-12 items-center gap-2.5 border border-line-loud px-7 text-[15px] text-fg hover:bg-active"
      >
        See it happen on a real cluster
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
}

export default function Overview({ holdout, decisions, model, loading, onSimulate }) {
  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  return (
    <div>
      <Hero pooled={holdout.pooled} holdout={holdout} onSimulate={onSimulate} />
      <Relationship />
      <Product model={model} decisions={decisions} onSimulate={onSimulate} />
    </div>
  );
}
