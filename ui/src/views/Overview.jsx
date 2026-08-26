import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Note } from "@/components/ui/panel";
import { Metric, MetricRow, Bar } from "@/components/metric";
import {
  Empty, Metadata, PageHeader, Section, Skeleton, Status, SubHead,
} from "@/components/section";
import {
  MARK, TIERS, TIER_COLOR, count, dp4, isUndefinedPrecision, pct, rupees,
  signedRupees,
} from "@/lib/format";

function TierName({ tier }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Status tone={TIER_TONE[tier]} />
      <span className="text-fg">{tier}</span>
    </span>
  );
}

const TIER_TONE = {
  obvious: "ok",
  moderate: "info",
  sophisticated: "warn",
  adaptive: "bad",
};

function Precision({ value }) {
  if (isUndefinedPrecision(value)) {
    return <span className="text-fg-faint">undefined</span>;
  }
  return <span className="tnum">{dp4(value)}</span>;
}

/*
  The primary outcome. One figure at hero size, the do-nothing comparison
  underneath as two lengths on one scale, and the honest half of the result
  next to it. No box around any of it.
*/
function Outcome({ pooled, holdout }) {
  const kept = pooled.do_nothing_rupees - pooled.cost_rupees;
  return (
    <Section title="Primary outcome">
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="label">Money kept against doing nothing</div>
          <div className="tnum mt-4 text-[46px] leading-none font-medium tracking-[-0.03em] text-fg sm:text-[58px]">
            {signedRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="mt-5 max-w-[46ch] text-[14px] leading-[1.65] text-fg-muted">
            Across {count(holdout.n_seeds)} worlds and {count(pooled.n_accounts)}{" "}
            accounts. Every figure below is reported per tier. Averaging them
            would hide the point.
          </p>
        </div>

        <div className="lg:pt-1">
          <div className="space-y-5">
            {[
              ["Abuse cost, deploy nothing", pooled.do_nothing_rupees, "var(--color-line-strong)"],
              ["Abuse cost, Jaal running", pooled.cost_rupees, "var(--color-accent)"],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13.5px] text-fg-muted">{label}</span>
                  <span className="tnum text-[13.5px] text-fg">{rupees(value)}</span>
                </div>
                <Bar
                  className="mt-2.5"
                  height={4}
                  value={value / pooled.do_nothing_rupees}
                  color={color}
                />
              </div>
            ))}
          </div>

          <dl className="mt-8 grid gap-x-8 gap-y-5 border-t border-line pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-[13px] leading-[1.55] text-fg-muted">
                Real customers wrongly blocked
              </dt>
              <dd className="tnum mt-1.5 text-[15px] text-fg">
                {count(pooled.fp)}{" "}
                <span className="text-[13px] text-fg-faint">
                  of {count(pooled.accounts_blocked)} blocked
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[13px] leading-[1.55] text-fg-muted">
                Ring accounts that walked through
              </dt>
              <dd className="tnum mt-1.5 text-[15px] text-fg">
                {count(pooled.missed)}{" "}
                <span className="text-[13px] text-fg-faint">untouched</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Section>
  );
}

function TierTable({ matrix }) {
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH align="left">Tier</TH>
          <TH>Clusters</TH>
          <TH>PR-AUC</TH>
          <TH>Precision</TH>
          <TH>Brier</TH>
          <TH align="left" className="w-[168px] pl-6">Recall</TH>
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
              {/* One bar, two segments: what it blocks alone, and what it reaches
                  once a human works the queue. The gap is the point. */}
              <TD align="left" numeric={false} className="pl-6">
                <Bar
                  value={m.recall}
                  second={m.recall_including_review}
                  color={TIER_COLOR[t]}
                />
              </TD>
              <TD>{dp4(m.recall)}</TD>
              <TD>{dp4(m.recall_including_review)}</TD>
              <TD className="text-fg-muted">{count(m.accounts_blocked)}</TD>
              <TD className="text-fg-muted">{count(m.accounts_reviewed)}</TD>
              <TD className={m.net_vs_nothing_rupees >= 0 ? "text-fg" : "text-bad"}>
                {signedRupees(m.net_vs_nothing_rupees)}
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

/*
  Both sides on one scale around a shared zero. The rules bars are long because
  the rules lose roughly ten times more than Jaal gains, which is the comparison.
*/
function Baseline({ baseline, matrix }) {
  const rows = TIERS.map((t) => ({
    tier: t,
    jaal: matrix[t]?.net_vs_nothing_rupees ?? 0,
    base: baseline.tiers[t].net_vs_nothing_rupees,
    precision: baseline.tiers[t].precision,
    recall: baseline.tiers[t].recall,
  }));
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.jaal), Math.abs(r.base)]));

  return (
    <Section
      title="Rules-only comparison"
      lede="Exact matching on device and address, five hand-written rules, two actions. Measured on validation seeds at the same prevalence, so the bars compare direction and size, not the same worlds."
      meta={
        <div className="flex items-center gap-6 text-[12.5px] text-fg-muted">
          <span className="inline-flex items-center gap-2">
            <Status tone="bad" /> rules only
          </span>
          <span className="inline-flex items-center gap-2">
            <Status tone="ok" /> Jaal
          </span>
        </div>
      }
    >
      <div className="border-t border-line-strong">
        {rows.map((r) => (
          <div
            key={r.tier}
            className="grid items-center gap-x-6 gap-y-3 border-b border-line py-5 sm:grid-cols-[150px_minmax(0,1fr)]"
          >
            <div className="text-[13.5px]">
              <TierName tier={r.tier} />
            </div>
            <div className="flex items-center">
              <div className="flex w-1/2 items-center gap-3">
                <span className="tnum w-[112px] shrink-0 text-right text-[12.5px] text-fg-muted">
                  {signedRupees(r.base)}
                </span>
                <span className="flex flex-1 justify-end">
                  <span
                    className="block h-2"
                    style={{
                      width: `${(Math.abs(r.base) / max) * 100}%`,
                      background: MARK.bad,
                      minWidth: 2,
                    }}
                  />
                </span>
              </div>
              <span className="h-6 w-px shrink-0 bg-line-strong" />
              <div className="flex w-1/2 items-center gap-3">
                <span className="flex-1">
                  <span
                    className="block h-2"
                    style={{
                      width: `${(Math.abs(r.jaal) / max) * 100}%`,
                      background: MARK.ok,
                      minWidth: 2,
                    }}
                  />
                </span>
                <span className="tnum w-[112px] shrink-0 text-[12.5px] text-fg-muted">
                  {signedRupees(r.jaal)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10">
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
              <TR key={r.tier}>
                <TD align="left" numeric={false} className="text-fg-muted">
                  {r.tier}
                </TD>
                <TD>{dp4(r.precision)}</TD>
                <TD>{dp4(r.recall)}</TD>
                <TD className="text-bad">{signedRupees(r.base)}</TD>
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

  const meta = [
    ["Holdout", holdout.opened],
    ["Calibration", holdout.calibration_method],
    ["Prevalence", pct(m.obvious.account_prevalence, 2)],
  ];
  if (decisions) {
    meta.push(["Wrong block", rupees(decisions.cost_blocked_innocent)]);
    meta.push(["Review", rupees(decisions.cost_analyst_review)]);
    meta.push(["Missed abuser", rupees(decisions.cost_missed_abuser)]);
  }

  return (
    <div className="pt-14">
      <PageHeader
        title="Finding the fraud between transactions, not inside them."
        lede="Fifty accounts each place one perfectly ordinary order and each claim one first-order discount. No single transaction looks wrong. Jaal links the accounts, scores the group, and prices the decision in rupees."
      >
        <Metadata className="mt-8" items={meta} />
      </PageHeader>

      <Outcome pooled={pooled} holdout={holdout} />

      <Section
        title="System performance"
        lede="Pooled across every tier. Read the two recall figures as a pair: what the system stops on its own, and what it reaches once a human works the queue."
      >
        <MetricRow>
          <Metric
            label="Precision, blocked accounts"
            value={dp4(pooled.precision)}
            note={`${count(pooled.fp)} wrong block in ${count(pooled.accounts_blocked)}`}
          />
          <Metric
            label="Recall, blocked"
            value={dp4(pooled.recall)}
            note="What the system stops without asking anyone"
          />
          <Metric
            label="Recall, blocked or reviewed"
            value={dp4(pooled.recall_including_review)}
            note="What it reaches with a human on the queue"
          />
          <Metric
            label="Review load"
            value={pct(pooled.review_rate, 2)}
            note={`${count(pooled.clusters_reviewed)} clusters of ${count(holdout.n_clusters)}`}
          />
        </MetricRow>
      </Section>

      <Section
        title="Per-tier analysis"
        lede="Blending the four tiers would hide the sophistication threshold, which is the most interesting result here."
      >
        <TierTable matrix={m} />
        <Note className="mt-6">
          The bar in the recall column runs to what the system blocks on its own,
          then continues at lower opacity to what it reaches once the queue is
          worked. On the adaptive tier the first segment is absent: it blocks
          nothing, and precision there is undefined rather than zero.
        </Note>
      </Section>

      {baseline && <Baseline baseline={baseline} matrix={m} />}
    </div>
  );
}
