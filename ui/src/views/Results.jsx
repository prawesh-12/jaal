import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Disclosure } from "@/components/disclosure";
import { Note } from "@/components/ui/panel";
import { Bar } from "@/components/metric";
import {
  Empty, Section, Skeleton, Status, SubHead, TierLegend, TIER_TONE,
} from "@/components/section";
import {
  TIERS, TIER_COLOR, compactRupees, count, dp4, isUndefinedPrecision, pct,
  rupees, signedRupees,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function TierName({ tier }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Status tone={TIER_TONE[tier]} />
      <span className="text-fg">{tier}</span>
    </span>
  );
}

function Precision({ value }) {
  if (isUndefinedPrecision(value)) return <span className="text-fg-dim">undefined</span>;
  return <span className="tnum">{dp4(value)}</span>;
}

/*
  Three levels of weight, in this order: the money, then whether the blocks were
  safe, then what it costs to run. Reading downward should feel like zooming in.
*/
function Headline({ pooled, holdout }) {
  const rest = [
    ["Blocking precision", pct(pooled.precision, 2),
     `of ${count(pooled.accounts_blocked)} blocked accounts, the share that really were a ring`],
    ["Wrong blocks", count(pooled.fp),
     `real customers stopped, out of ${count(pooled.n_accounts)} scored`],
    ["Accounts blocked", count(pooled.accounts_blocked), "stopped with no human asked"],
    ["Recall including review", pct(pooled.recall_including_review, 2),
     `of ${count(pooled.n_ring_accounts)} ring accounts, blocked or sent to a person`],
    ["Review load", pct(pooled.review_rate, 2),
     `${count(pooled.clusters_reviewed)} of ${count(holdout.n_clusters)} clusters need a human`],
  ];

  return (
    <div className="border-b border-line-strong pb-14">
      <div className="grid gap-x-20 gap-y-10 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="label">Net benefit against doing nothing</div>
          <div className="tnum mt-4 text-[clamp(3.5rem,2rem+5vw,6rem)] leading-[0.92] font-medium tracking-[-0.04em] text-ok">
            {compactRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.6] text-fg-muted">
            {signedRupees(pooled.net_vs_nothing_rupees)} exactly. Promo abuse costs
            this merchant {rupees(pooled.do_nothing_rupees)} with nothing deployed
            and {rupees(pooled.cost_rupees)} with Jaal running.
          </p>
        </div>

        <dl className="grid gap-x-10 gap-y-9 self-center sm:grid-cols-2 lg:border-l lg:border-line lg:pl-20">
          {rest.map(([label, value, note]) => (
            <div key={label} className="min-w-0">
              <dt className="label">{label}</dt>
              <dd className="tnum mt-3 text-[30px] leading-none font-medium tracking-[-0.025em] text-fg">
                {value}
              </dd>
              <dd className="t-meta mt-2.5 max-w-[32ch] text-fg-faint">{note}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/* Answers: is a rules-only detector enough? Money first, table underneath. */
function Baseline({ baseline, pooled, matrix }) {
  const rows = TIERS.map((t) => ({
    tier: t,
    jaal: matrix[t]?.net_vs_nothing_rupees ?? 0,
    base: baseline.tiers[t].net_vs_nothing_rupees,
    precision: baseline.tiers[t].precision,
    recall: baseline.tiers[t].recall,
  }));
  const baseTotal = rows.reduce((s, r) => s + r.base, 0);
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.jaal), Math.abs(r.base)]));
  const worst = rows.reduce((a, r) => (r.base < a.base ? r : a), rows[0]);
  const bestRecall = rows.reduce((a, r) => (r.recall > a.recall ? r : a), rows[0]);

  return (
    <Section
      title="Against a rules-only detector"
      lede="Exact matching on device and address, five hand-written rules, two actions. Measured on validation seeds at the same prevalence, so these compare direction and size, not the same worlds."
    >
      <div className="grid gap-x-16 gap-y-10 border-y border-line-strong py-10 sm:grid-cols-2">
        <div>
          <div className="label">Jaal, three actions</div>
          <div className="tnum mt-4 text-[clamp(2.25rem,1.4rem+2.6vw,3.5rem)] leading-none font-medium tracking-[-0.03em] text-ok">
            {compactRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="t-meta mt-4">net against doing nothing</p>
        </div>
        <div className="sm:border-l sm:border-line sm:pl-16">
          <div className="label">Rules only, four tiers summed</div>
          <div className="tnum mt-4 text-[clamp(2.25rem,1.4rem+2.6vw,3.5rem)] leading-none font-medium tracking-[-0.03em] text-bad">
            {compactRupees(baseTotal)}
          </div>
          <p className="t-meta mt-4">{signedRupees(baseTotal)} exactly</p>
        </div>
      </div>

      <p className="mt-8 max-w-[62ch] text-[17px] leading-[1.45] tracking-[-0.01em] text-fg">
        High recall is not enough when a false positive costs {rupees(15000)} and
        a miss costs {rupees(200)}.
      </p>
      <p className="t-meta mt-4 max-w-[74ch]">
        The rules reach {dp4(bestRecall.recall)} recall on the{" "}
        {bestRecall.tier} tier, better than anything Jaal blocks outright, and
        still lose money. Precision there is {dp4(bestRecall.precision)}, under
        the {pct(baseline.breakeven_precision, 2)} break-even, so every batch of
        blocks costs more in lost customers than it saves in stolen discount.
      </p>

      <div className="mt-12">
        <SubHead
          title="Per tier, side by side"
          meta={
            <div className="flex items-center gap-6 text-[12.5px] text-fg-muted">
              <span className="inline-flex items-center gap-2.5">
                <span aria-hidden="true" className="h-2.5 w-4 rounded-[1px]"
                      style={{ background: "var(--color-bad)" }} />
                rules only
              </span>
              <span className="inline-flex items-center gap-2.5">
                <span aria-hidden="true" className="h-2.5 w-4 rounded-[1px]"
                      style={{ background: "var(--color-ok)" }} />
                Jaal
              </span>
            </div>
          }
        />
        <div className="border-t border-line-strong">
          {rows.map((r) => (
            <div
              key={r.tier}
              className={cn(
                "interactive grid items-center gap-x-6 gap-y-3 border-b border-line px-2 py-5 sm:grid-cols-[150px_minmax(0,1fr)]",
                r.tier === worst.tier ? "bg-surface" : "hover:bg-surface"
              )}
            >
              <div className="text-[13.5px]">
                <TierName tier={r.tier} />
              </div>
              <div className="flex items-center">
                <div className="flex w-1/2 items-center gap-3">
                  <span className="tnum w-[112px] shrink-0 text-right text-[12.5px] text-fg-2">
                    {signedRupees(r.base)}
                  </span>
                  <span className="flex flex-1 justify-end">
                    <span className="block h-2"
                          style={{ width: `${(Math.abs(r.base) / max) * 100}%`, minWidth: 2,
                                   background: "var(--color-bad)" }} />
                  </span>
                </div>
                <span className="h-6 w-px shrink-0 bg-line-loud" />
                <div className="flex w-1/2 items-center gap-3">
                  <span className="flex-1">
                    <span className="block h-2"
                          style={{ width: `${(Math.abs(r.jaal) / max) * 100}%`, minWidth: 2,
                                   background: "var(--color-ok)" }} />
                  </span>
                  <span className="tnum w-[112px] shrink-0 text-[12.5px] text-fg-2">
                    {signedRupees(r.jaal)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Note className="mt-6">
          The point is not that rules are bad. It is that exact identity matching
          breaks under adaptation: on the {worst.tier} tier the rules block{" "}
          <span className="tnum text-fg">{count(baseline.tiers[worst.tier].fp)}</span>{" "}
          accounts and every one of them is innocent, at precision{" "}
          <span className="tnum text-fg">{dp4(worst.precision)}</span>.
        </Note>
      </div>
    </Section>
  );
}

/* Answers: why is the decision priced at all? */
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
              <span className="block h-full"
                    style={{ width: `${(value / top) * 100}%`, background: color }} />
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
      </div>
    </div>
  );
}

/* Answers: what does it reach at each tier, at a glance? */
function TierRecall({ matrix }) {
  return (
    <div className="border-t border-line-strong">
      {TIERS.filter((t) => matrix[t]).map((t) => {
        const m = matrix[t];
        return (
          <div
            key={t}
            className="grid items-center gap-x-6 gap-y-2 border-b border-line px-2 py-4 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,190px)]"
          >
            <span className="text-[13.5px]"><TierName tier={t} /></span>
            <Bar value={m.recall} second={m.recall_including_review}
                 color={TIER_COLOR[t]} height={10} />
            <span className="tnum text-[13px] text-fg-2 sm:text-right">
              {pct(m.recall_including_review, 1)}
              <span className="ml-2.5 text-[12px] text-fg-faint">
                with review, {pct(m.recall, 1)} blocked
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TierTable({ matrix }) {
  const best = TIERS.filter((t) => matrix[t]).reduce(
    (a, t) => (matrix[t].net_vs_nothing_rupees > matrix[a].net_vs_nothing_rupees ? t : a),
    TIERS.find((t) => matrix[t])
  );

  return (
    <Table className="min-w-[980px]">
      <THead>
        <TR className="hover:bg-transparent">
          <TH align="left">Tier</TH>
          <TH>Clusters</TH>
          <TH>PR-AUC</TH>
          <TH>Precision</TH>
          <TH>Brier</TH>
          <TH align="left" className="w-[170px] pl-6">Recall, blocked then reviewed</TH>
          <TH>Blocked</TH>
          <TH>With review</TH>
          <TH>Accounts blocked</TH>
          <TH>Reviewed</TH>
          <TH>Net</TH>
        </TR>
      </THead>
      <tbody>
        {TIERS.filter((t) => matrix[t]).map((t) => {
          const m = matrix[t];
          // The adaptive tier blocks nothing at all, which is the finding this
          // table exists to show, so its row is marked as exceptional.
          const exceptional = m.accounts_blocked === 0;
          return (
            <TR key={t}>
              <TD align="left" numeric={false}><TierName tier={t} /></TD>
              <TD className="text-fg-muted">{count(m.n_clusters)}</TD>
              <TD>{dp4(m.pr_auc)}</TD>
              <TD numeric={false}><Precision value={m.precision} /></TD>
              <TD className="text-fg-muted">{m.brier.toFixed(5)}</TD>
              <TD align="left" numeric={false} className="pl-6">
                <Bar value={m.recall} second={m.recall_including_review}
                     color={TIER_COLOR[t]} />
              </TD>
              <TD className={exceptional ? "text-fg-dim" : undefined}>{dp4(m.recall)}</TD>
              <TD strong>{dp4(m.recall_including_review)}</TD>
              <TD className={exceptional ? "text-fg-dim" : "text-fg-muted"}>
                {count(m.accounts_blocked)}
              </TD>
              <TD className="text-fg-muted">{count(m.accounts_reviewed)}</TD>
              <TD strong={t === best}>{signedRupees(m.net_vs_nothing_rupees)}</TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

export default function Results({ holdout, baseline, decisions, loading }) {
  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const pooled = holdout.pooled;
  const m = holdout.results_matrix;

  return (
    <div className="pt-14">
      <header className="pb-2">
        <div className="label">Sealed holdout, {holdout.opened}</div>
        <h1 className="mt-5 text-[38px] leading-[1.08] font-medium tracking-[-0.03em] text-fg sm:text-[44px]">
          Does it work?
        </h1>
      </header>

      <Headline pooled={pooled} holdout={holdout} />

      {decisions && (
        <Section
          title="Why blocking has to be nearly perfect"
          lede="Three prices decide everything. All three belong to the merchant's finance team, not to the model."
        >
          <CostAsymmetry decisions={decisions} />
        </Section>
      )}

      {baseline && <Baseline baseline={baseline} pooled={pooled} matrix={m} />}

      <Section
        title="Per tier, never averaged"
        lede="Blending the four tiers would hide the sophistication threshold, which is the most interesting result here."
        meta={<TierLegend />}
      >
        <TierRecall matrix={m} />
        <Note className="mt-6">
          The solid part of each bar is what the system blocks on its own. The
          faint part is what it reaches once a human works the queue. On the
          adaptive tier the solid part is absent: it blocks nothing, and
          precision there is undefined rather than zero.
        </Note>

        <div className="mt-10 border-t border-line-strong">
          <Disclosure
            summary={
              <span className="text-[14px] text-fg">View exact measurements</span>
            }
          >
            <TierTable matrix={m} />
          </Disclosure>
        </div>
      </Section>
    </div>
  );
}
