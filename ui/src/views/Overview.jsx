import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Note } from "@/components/ui/panel";
import { Metric, MetricRow, Bar } from "@/components/metric";
import {
  Empty, Metadata, Section, Skeleton, Status, SubHead, TierLegend,
  TIER_TONE,
} from "@/components/section";
import {
  TIERS, TIER_COLOR, count, dp4, isUndefinedPrecision, pct, rupees, signedRupees,
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
  if (isUndefinedPrecision(value)) {
    return <span className="text-fg-dim">undefined</span>;
  }
  return <span className="tnum">{dp4(value)}</span>;
}

function Hero({ pooled, holdout, decisions }) {
  const share = pooled.cost_rupees / pooled.do_nothing_rupees;

  const meta = [
    ["Holdout", holdout.opened],
    ["Calibration", holdout.calibration_method],
    ["Account prevalence", pct(holdout.results_matrix.obvious.account_prevalence, 2)],
  ];
  if (decisions) {
    meta.push(["Wrong block", rupees(decisions.cost_blocked_innocent)]);
    meta.push(["Review", rupees(decisions.cost_analyst_review)]);
    meta.push(["Missed abuser", rupees(decisions.cost_missed_abuser)]);
  }

  return (
    <header className="grid gap-x-16 gap-y-12 border-b border-line pt-14 pb-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div>
        <h1 className="t-hero max-w-[19ch] text-balance">
          Finding the fraud between transactions, not inside them.
        </h1>
        <p className="t-body mt-6 max-w-[58ch]">
          Fifty accounts each place one perfectly ordinary order and each claim
          one first-order discount. No single transaction looks wrong. Jaal links
          the accounts, scores the group, and prices the decision in rupees.
        </p>
        <Metadata className="mt-9" items={meta} />
      </div>

      <div className="lg:border-l lg:border-line lg:pl-16">
        <div className="label">Primary outcome · money kept against doing nothing</div>
        <div className="tnum t-hero scene-fade mt-5">
          {signedRupees(pooled.net_vs_nothing_rupees)}
        </div>
        <p className="t-meta mt-4 max-w-[44ch]">
          Across {count(holdout.n_seeds)} worlds and {count(pooled.n_accounts)}{" "}
          accounts on the sealed holdout.
        </p>

        <div className="mt-9 space-y-5 border-t border-line pt-7">
          {[
            ["Abuse cost, deploy nothing", pooled.do_nothing_rupees, 1,
             "var(--color-line-loud)"],
            ["Abuse cost, Jaal running", pooled.cost_rupees, share,
             "var(--color-accent)"],
          ].map(([label, value, frac, color]) => (
            <div key={label}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13.5px] text-fg-muted">{label}</span>
                <span className="tnum text-[15px] text-fg">{rupees(value)}</span>
              </div>
              <Bar className="mt-2.5" height={5} value={frac} color={color} />
            </div>
          ))}
          <p className="t-meta pt-1 text-fg-faint">
            {pct(1 - share, 1)} of the abuse cost removed.
          </p>
        </div>
      </div>
    </header>
  );
}

function Caveats({ pooled }) {
  return (
    <div className="grid gap-x-10 gap-y-6 border-y border-line py-8 sm:grid-cols-2">
      <div>
        <div className="label">Real customers wrongly blocked</div>
        <div className="tnum mt-3 text-[22px] leading-none text-fg">
          {count(pooled.fp)}
          <span className="ml-2.5 text-[13px] font-normal text-fg-faint">
            of {count(pooled.accounts_blocked)} accounts blocked
          </span>
        </div>
      </div>
      <div className="sm:border-l sm:border-line sm:pl-10">
        <div className="label">Ring accounts that walked through</div>
        <div className="tnum mt-3 text-[22px] leading-none text-fg">
          {count(pooled.missed)}
          <span className="ml-2.5 text-[13px] font-normal text-fg-faint">
            untouched
          </span>
        </div>
      </div>
    </div>
  );
}

function TierTable({ matrix }) {
  const best = TIERS.filter((t) => matrix[t])
    .reduce((a, t) => (matrix[t].net_vs_nothing_rupees > matrix[a].net_vs_nothing_rupees ? t : a),
            TIERS.find((t) => matrix[t]));

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
              <TD align="left" numeric={false}>
                <TierName tier={t} />
              </TD>
              <TD className="text-fg-muted">{count(m.n_clusters)}</TD>
              <TD>{dp4(m.pr_auc)}</TD>
              <TD numeric={false}>
                <Precision value={m.precision} />
              </TD>
              <TD className="text-fg-muted">{m.brier.toFixed(5)}</TD>
              <TD align="left" numeric={false} className="pl-6">
                <Bar
                  value={m.recall}
                  second={m.recall_including_review}
                  color={TIER_COLOR[t]}
                />
              </TD>
              <TD className={exceptional ? "text-fg-dim" : undefined}>
                {dp4(m.recall)}
              </TD>
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

function Baseline({ baseline, matrix }) {
  const rows = TIERS.map((t) => ({
    tier: t,
    jaal: matrix[t]?.net_vs_nothing_rupees ?? 0,
    base: baseline.tiers[t].net_vs_nothing_rupees,
    precision: baseline.tiers[t].precision,
    recall: baseline.tiers[t].recall,
  }));
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.jaal), Math.abs(r.base)]));
  const worst = rows.reduce((a, r) => (r.base < a.base ? r : a), rows[0]);

  const grow = (w, i) => ({
    className: "block h-2",
    style: { width: `${w * 100}%`, minWidth: 2, "--d": `${i * 60}ms` },
  });

  return (
    <Section
      title="Rules-only comparison"
      lede="Exact matching on device and address, five hand-written rules, two actions. Measured on validation seeds at the same prevalence, so the bars compare direction and size, not the same worlds."
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
    >
      <div className="border-t border-line-strong">
        {rows.map((r, i) => (
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
                  <span
                    {...grow(Math.abs(r.base) / max, i)}
                    style={{
                      ...grow(Math.abs(r.base) / max, i).style,
                      background: "var(--color-bad)",
                    }}
                  />
                </span>
              </div>
              <span className="h-6 w-px shrink-0 bg-line-loud" />
              <div className="flex w-1/2 items-center gap-3">
                <span className="flex-1">
                  <span
                    {...grow(Math.abs(r.jaal) / max, i)}
                    style={{
                      ...grow(Math.abs(r.jaal) / max, i).style,
                      background: "var(--color-ok)",
                    }}
                  />
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
        The worst case for the rules is the{" "}
        <span className="text-fg">{worst.tier}</span> tier, at{" "}
        <span className="tnum text-fg">{signedRupees(worst.base)}</span>. Its
        precision there is{" "}
        <span className="tnum text-fg">{dp4(worst.precision)}</span>, which is what
        a wrong block costing {rupees(15000)} does to a detector that cannot tell a
        family from a ring.
      </Note>

      <div className="mt-12">
        <SubHead title="Baseline, per tier" />
        <Table className="min-w-[520px]">
          <THead>
            <TR className="hover:bg-transparent">
              <TH align="left">Tier</TH>
              <TH>Precision</TH>
              <TH>Recall</TH>
              <TH>Net</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.tier} selected={r.tier === worst.tier}>
                <TD align="left" numeric={false} className="text-fg-muted">
                  {r.tier}
                </TD>
                <TD>{dp4(r.precision)}</TD>
                <TD>{dp4(r.recall)}</TD>
                <TD strong className="text-bad">{signedRupees(r.base)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </Section>
  );
}

export default function Overview({ holdout, baseline, decisions, loading }) {
  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const m = holdout.results_matrix;
  const pooled = holdout.pooled;

  return (
    <div>
      <Hero pooled={pooled} holdout={holdout} decisions={decisions} />

      <Section title="What that result costs">
        <Caveats pooled={pooled} />
      </Section>

      <Section
        title="System performance"
        lede="Pooled across every tier. Read the two recall figures as a pair: what the system stops on its own, and what it reaches once a human works the queue. Hover any metric for what it means."
      >
        <MetricRow>
          <Metric
            label="Precision, blocked accounts"
            value={dp4(pooled.precision)}
            note={`${count(pooled.fp)} wrong block in ${count(pooled.accounts_blocked)}`}
            detail="Of the accounts the system blocks outright, the share that really were part of a ring. This is the number that has to be near perfect, because a wrong block costs a customer."
          />
          <Metric
            label="Recall, blocked"
            value={dp4(pooled.recall)}
            tone="warn"
            note="What the system stops without asking anyone"
            detail="Deliberately low. Blocking only pays above 98.68% precision, so the system blocks only where it is nearly certain and routes the rest to a human."
          />
          <Metric
            label="Recall, blocked or reviewed"
            value={dp4(pooled.recall_including_review)}
            note="What it reaches with a human on the queue"
            detail="Review is an action, not a miss: the cluster still reaches a person. This is the honest measure of what the system catches."
          />
          <Metric
            label="Review load"
            value={pct(pooled.review_rate, 2)}
            note={`${count(pooled.clusters_reviewed)} clusters of ${count(holdout.n_clusters)}`}
            detail="The share of clusters that need a human. Everything above rests on this staying small enough for a real analyst team to work through."
          />
        </MetricRow>
      </Section>

      <Section
        title="Tier behaviour"
        lede="Blending the four tiers would hide the sophistication threshold, which is the most interesting result here."
        meta={<TierLegend />}
      >
        <TierTable matrix={m} />
        <Note className="mt-6">
          The bar runs to what the system blocks on its own, then continues at
          lower opacity to what it reaches once the queue is worked. On the
          adaptive tier the first segment is absent: it blocks nothing, and
          precision there is undefined rather than zero.
        </Note>
      </Section>

      {baseline && <Baseline baseline={baseline} matrix={m} />}
    </div>
  );
}
