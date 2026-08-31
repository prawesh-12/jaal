import { Disclosure } from "@/components/disclosure";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import {
  Empty, Skeleton, Status, TierLegend, TIER_TONE,
} from "@/components/section";
import { Bars, Diverging } from "@/three/Bars";
import { BlockedGrid, PrecisionScale } from "@/three/Proof";
import {
  TIERS, compactRupees, count, dp4, isUndefinedPrecision, pct, rupees,
  signedRupees,
} from "@/lib/format";

const TIER_BAR = {
  obvious: "ok", moderate: "info", sophisticated: "warn", adaptive: "bad",
};

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

function Proof({ pooled, holdout }) {
  return (
    <section className="border-b border-line-strong pb-14">
      <div className="grid gap-x-16 gap-y-8 pt-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div>
          <div className="label">Sealed holdout, {holdout.opened}</div>
          <div className="tnum mt-4 text-[clamp(2.75rem,1.6rem+3.6vw,4.5rem)] leading-[0.92] font-medium tracking-[-0.04em] whitespace-nowrap text-ok">
            {compactRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="mt-5 max-w-[34ch] text-[15px] leading-[1.55] text-fg-muted">
            net against doing nothing. Promo abuse costs this merchant{" "}
            {rupees(pooled.do_nothing_rupees)} with nothing deployed and{" "}
            {rupees(pooled.cost_rupees)} with Jaal running.
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h2 className="text-[19px] font-medium tracking-[-0.015em] text-fg">
              Every account Jaal blocked, and the one it should not have
            </h2>
            <span className="tnum t-meta">
              {count(pooled.accounts_blocked)} cells · {count(pooled.fp)} wrong
            </span>
          </div>
          <div className="mt-5 h-[260px] border border-line">
            <BlockedGrid total={pooled.accounts_blocked} wrong={pooled.fp}
                         label="the wrong block" className="h-full w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Economics({ decisions, baseline, pooled }) {
  const ratio = Math.round(
    decisions.cost_blocked_innocent / decisions.cost_missed_abuser);
  const rulesPrecision = baseline
    ? Object.values(baseline.tiers).reduce((a, t) => Math.max(a, t.precision), 0)
    : null;

  return (
    <section className="border-b border-line-strong py-14">
      <h2 className="max-w-[26ch] text-[26px] leading-tight font-medium tracking-[-0.02em] text-fg text-balance">
        A wrong block costs {ratio} times a miss, so precision is the whole game.
      </h2>

      <div className="mt-8 h-[300px]">
        <PrecisionScale
          breakeven={decisions.breakeven_precision}
          className="h-full w-full"
          points={[
            { label: "Jaal, blocking", value: pooled.precision,
              display: pct(pooled.precision, 2), tone: "ok" },
            ...(rulesPrecision ? [{
              label: "rules on device and address", value: rulesPrecision,
              display: pct(rulesPrecision, 2), tone: "bad",
            }] : []),
          ]}
        />
      </div>

      <div className="mt-8 grid gap-x-16 gap-y-8 border-t border-line pt-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="h-[200px]">
          <Bars
            className="h-full w-full"
            labelWidth={68}
            bars={[
              { label: "Block a real customer", value: decisions.cost_blocked_innocent,
                display: rupees(decisions.cost_blocked_innocent), tone: "bad" },
              { label: "Miss one abuser", value: decisions.cost_missed_abuser,
                display: rupees(decisions.cost_missed_abuser), tone: "fg-dim" },
              { label: "Review one cluster", value: decisions.cost_analyst_review,
                display: rupees(decisions.cost_analyst_review), tone: "warn" },
            ]}
          />
        </div>
        <p className="self-center text-[15px] leading-[1.65] text-fg-muted">
          Those three prices belong to the merchant's finance team, not to the
          model. They put break-even at{" "}
          <span className="tnum text-fg">{pct(decisions.breakeven_precision, 2)}</span>.
          A detector that catches every ring at{" "}
          {rulesPrecision ? pct(rulesPrecision, 2) : "lower"} precision still
          loses money, which is why review is a first-class action here and not
          a fallback.
        </p>
      </div>
    </section>
  );
}

function Baseline({ baseline, matrix }) {
  const rows = TIERS.map((t) => ({
    label: t,
    left: baseline.tiers[t].net_vs_nothing_rupees,
    right: matrix[t].net_vs_nothing_rupees,
  }));
  const baseTotal = rows.reduce((s, r) => s + r.left, 0);
  const jaalTotal = rows.reduce((s, r) => s + r.right, 0);
  const worst = TIERS.reduce(
    (a, t) => (baseline.tiers[t].net_vs_nothing_rupees
               < baseline.tiers[a].net_vs_nothing_rupees ? t : a), TIERS[0]);

  return (
    <section className="border-b border-line-strong py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3">
        <h2 className="text-[26px] leading-tight font-medium tracking-[-0.02em] text-fg">
          The same worlds, run through rules instead
        </h2>
        <div className="flex items-baseline gap-8">
          <span className="tnum text-[26px] leading-none font-medium text-ok">
            {compactRupees(jaalTotal)}
          </span>
          <span className="tnum text-[26px] leading-none font-medium text-bad">
            {compactRupees(baseTotal)}
          </span>
        </div>
      </div>

      <div className="mt-8 h-[350px]">
        <Diverging rows={rows} className="h-full w-full" />
      </div>

      <p className="mt-6 max-w-[76ch] text-[13.5px] leading-[1.7] text-fg-muted">
        Exact matching on device and address, five hand-written rules, two
        actions, on the same sealed seeds. On the {worst} tier the rules block{" "}
        <span className="tnum text-fg">{count(baseline.tiers[worst].fp)}</span>{" "}
        accounts and every one of them is innocent, at precision{" "}
        <span className="tnum text-fg">{dp4(baseline.tiers[worst].precision)}</span>.
      </p>
    </section>
  );
}

function ByTier({ matrix }) {
  const bars = TIERS.filter((t) => matrix[t]).map((t) => ({
    label: t,
    value: matrix[t].recall,
    second: matrix[t].recall_including_review,
    display: `${pct(matrix[t].recall_including_review, 1)} with review`,
    tone: TIER_BAR[t],
  }));

  return (
    <section className="py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3">
        <h2 className="max-w-[34ch] text-[26px] leading-tight font-medium tracking-[-0.02em] text-fg">
          Solid is what Jaal blocks alone. Pale is what the queue reaches.
        </h2>
        <TierLegend />
      </div>

      <div className="mt-8 h-[250px]">
        <Bars bars={bars} max={1} labelWidth={40} valueWidth={54}
              className="h-full w-full" />
      </div>

      <p className="mt-6 max-w-[76ch] text-[13.5px] leading-[1.7] text-fg-muted">
        The four tiers are never averaged. On the adaptive tier the solid part is
        absent: Jaal blocks nothing, and precision there is undefined rather than
        zero.
      </p>

      <div className="mt-10 border-t border-line-strong">
        <Disclosure
          summary={<span className="text-[14px] text-fg">View exact measurements</span>}
        >
          <TierTable matrix={matrix} />
        </Disclosure>
      </div>
    </section>
  );
}

function TierTable({ matrix }) {
  const best = TIERS.filter((t) => matrix[t]).reduce(
    (a, t) => (matrix[t].net_vs_nothing_rupees > matrix[a].net_vs_nothing_rupees ? t : a),
    TIERS.find((t) => matrix[t])
  );

  return (
    <Table className="min-w-[900px]">
      <THead>
        <TR className="hover:bg-transparent">
          <TH align="left">Tier</TH>
          <TH>Clusters</TH>
          <TH>PR-AUC</TH>
          <TH>Precision</TH>
          <TH>Brier</TH>
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
          const blocksNothing = m.accounts_blocked === 0;
          return (
            <TR key={t}>
              <TD align="left" numeric={false}><TierName tier={t} /></TD>
              <TD className="text-fg-muted">{count(m.n_clusters)}</TD>
              <TD>{dp4(m.pr_auc)}</TD>
              <TD numeric={false}><Precision value={m.precision} /></TD>
              <TD className="text-fg-muted">{m.brier.toFixed(5)}</TD>
              <TD className={blocksNothing ? "text-fg-dim" : undefined}>{dp4(m.recall)}</TD>
              <TD strong>{dp4(m.recall_including_review)}</TD>
              <TD className={blocksNothing ? "text-fg-dim" : "text-fg-muted"}>
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
  const matrix = holdout.results_matrix;

  return (
    <div>
      <Proof pooled={pooled} holdout={holdout} />
      {decisions && (
        <Economics decisions={decisions} baseline={baseline} pooled={pooled} />
      )}
      {baseline && <Baseline baseline={baseline} matrix={matrix} />}
      <ByTier matrix={matrix} />
    </div>
  );
}
