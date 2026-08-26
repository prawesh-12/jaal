import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat, StatRow } from "@/components/stat";
import { Empty, Meter, SectionHead, TierName, Skeleton } from "@/components/bits";
import {
  MARK, TIERS, TIER_COLOR, count, dp4, isUndefinedPrecision, pct, rupees, signedRupees,
} from "@/lib/format";

function Precision({ value }) {
  if (isUndefinedPrecision(value))
    return <span className="text-subtle">undefined, nothing blocked</span>;
  return <span className="num">{dp4(value)}</span>;
}

/* Two lengths on one scale. What the abuse costs untouched, and what it costs after. */
function CostBars({ nothing, withJaal }) {
  const rows = [
    { label: "if you deploy nothing", value: nothing, color: MARK.red },
    { label: "with Jaal running", value: withJaal, color: MARK.green },
  ];
  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-muted-foreground">{r.label}</span>
            <span className="num text-[13px] text-foreground">{rupees(r.value)}</span>
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full bg-elevated">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / nothing) * 100}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Prices({ decisions }) {
  const rows = [
    ["Blocking a real customer", decisions.cost_blocked_innocent, "the price of being wrong"],
    ["Missing an abuser", decisions.cost_missed_abuser, "one farmed coupon"],
    ["An analyst review", decisions.cost_analyst_review, "the third option"],
  ];
  return (
    <div className="mt-8 grid gap-px overflow-hidden rounded-panel border border-border bg-border sm:grid-cols-3">
      {rows.map(([label, value, sub]) => (
        <div key={label} className="bg-card px-4 py-3.5">
          <div className="label">{label}</div>
          <div className="num mt-1.5 text-[17px] text-foreground">{rupees(value)}</div>
          <div className="mt-1 text-[11.5px] text-subtle">{sub}</div>
        </div>
      ))}
    </div>
  );
}

function Hero({ pooled, holdout, decisions }) {
  return (
    <div className="grid gap-8 border-b border-border-subtle pb-10 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
      <div>
        <h1 className="max-w-[16ch] text-[36px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[42px]">
          Finding the fraud <span className="text-subtle">between</span> transactions,
          not inside them.
        </h1>
        <p className="mt-5 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted-foreground">
          Fifty accounts each place one perfectly ordinary order and each claim one
          first-order discount. No single transaction looks wrong. Jaal links the
          accounts, scores the group, and prices the decision in rupees.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="outline">defence only</Badge>
          <Badge tone="outline">synthetic data</Badge>
          <Badge tone="outline">sealed holdout, {holdout.opened}</Badge>
          <Badge tone="outline">{holdout.calibration_method} calibration</Badge>
        </div>

        {decisions && <Prices decisions={decisions} />}
      </div>

      <Card className="self-start">
        <CardContent className="pt-5">
          <div className="label">Money kept against doing nothing</div>
          <div className="num mt-2 text-[40px] leading-none font-semibold text-positive">
            {signedRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Across {count(holdout.n_seeds)} worlds and {count(pooled.n_accounts)}{" "}
            accounts. Every figure below is per tier. Averaging them would hide the
            point.
          </p>

          <div className="mt-6 border-t border-border-subtle pt-5">
            <CostBars nothing={pooled.do_nothing_rupees} withJaal={pooled.cost_rupees} />
          </div>

          <div className="mt-5 space-y-2 border-t border-border-subtle pt-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <p>
              <span className="num text-foreground">{count(pooled.fp)}</span> real
              customer wrongly blocked out of{" "}
              <span className="num text-foreground">{count(pooled.accounts_blocked)}</span>{" "}
              blocks.
            </p>
            <p>
              <span className="num text-foreground">{count(pooled.missed)}</span> ring
              accounts walked through untouched. That is the honest half of the number
              above.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TierTable({ matrix }) {
  return (
    <Card>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH align="left">Tier</TH>
            <TH>Clusters</TH>
            <TH>PR-AUC</TH>
            <TH>Precision</TH>
            <TH>Recall, blocked</TH>
            <TH>With review</TH>
            <TH>Brier</TH>
            <TH>Blocked</TH>
            <TH>Reviewed</TH>
            <TH>Net</TH>
          </TR>
        </THead>
        <tbody>
          {TIERS.filter((t) => matrix[t]).map((t) => {
            const m = matrix[t];
            return (
              <TR key={t}>
                <TD align="left" mono={false} className="font-medium">
                  <TierName tier={t} />
                </TD>
                <TD className="text-muted-foreground">{count(m.n_clusters)}</TD>
                <TD>{dp4(m.pr_auc)}</TD>
                <TD mono={false} className="text-[12.5px]">
                  <Precision value={m.precision} />
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-2.5">
                    <Meter value={m.recall} color={TIER_COLOR[t]} />
                    {dp4(m.recall)}
                  </span>
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-2.5">
                    <Meter value={m.recall_including_review} color={TIER_COLOR[t]} />
                    {dp4(m.recall_including_review)}
                  </span>
                </TD>
                <TD className="text-muted-foreground">{m.brier.toFixed(5)}</TD>
                <TD className="text-muted-foreground">{count(m.accounts_blocked)}</TD>
                <TD className="text-muted-foreground">{count(m.accounts_reviewed)}</TD>
                <TD className={m.net_vs_nothing_rupees >= 0 ? "text-positive" : "text-negative"}>
                  {signedRupees(m.net_vs_nothing_rupees)}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

/*
  Both sides on one scale around a shared zero. Each figure sits outside the end
  of its own bar, so a long bar can never push its label into the other side.
*/
function BaselineCompare({ baseline, matrix }) {
  const rows = TIERS.map((t) => ({
    tier: t,
    jaal: matrix[t]?.net_vs_nothing_rupees ?? 0,
    base: baseline.tiers[t].net_vs_nothing_rupees,
    precision: baseline.tiers[t].precision,
    recall: baseline.tiers[t].recall,
  }));
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.jaal), Math.abs(r.base)]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Against the rules-only baseline</CardTitle>
        <CardDescription>
          Exact matching on device and address, five hand-written rules, two actions.
          Measured on validation seeds at the same prevalence, so the bars compare
          direction and size, not the same worlds.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-[2px]" style={{ background: MARK.red }} />
            rules only
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-[2px]" style={{ background: MARK.green }} />
            Jaal
          </span>
        </div>

        <p className="mb-4 max-w-[76ch] text-[12.5px] leading-relaxed text-subtle">
          Both sides share one scale. The Jaal bars look short because the rules lose
          roughly ten times more than Jaal gains, which is the comparison, not a
          drawing mistake.
        </p>

        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.tier} className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center">
              <div className="text-[13px] font-medium">
                <TierName tier={r.tier} />
              </div>
              <div className="flex items-center">
                <div className="flex w-1/2 items-center gap-2">
                  <span className="num w-[104px] shrink-0 text-right text-[11.5px] text-negative">
                    {signedRupees(r.base)}
                  </span>
                  <span className="flex flex-1 justify-end">
                    <span
                      className="block h-2.5 rounded-l-[4px]"
                      style={{
                        width: `${(Math.abs(r.base) / max) * 100}%`,
                        background: MARK.red,
                        minWidth: 3,
                      }}
                    />
                  </span>
                </div>
                <span className="h-6 w-px shrink-0 bg-subtle/60" />
                <div className="flex w-1/2 items-center gap-2">
                  <span className="flex-1">
                    <span
                      className="block h-2.5 rounded-r-[4px]"
                      style={{
                        width: `${(Math.abs(r.jaal) / max) * 100}%`,
                        background: MARK.green,
                        minWidth: 3,
                      }}
                    />
                  </span>
                  <span className="num w-[104px] shrink-0 text-right text-[11.5px] text-positive">
                    {signedRupees(r.jaal)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <div className="border-t border-border-subtle">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH align="left">Tier</TH>
              <TH>Baseline precision</TH>
              <TH>Baseline recall</TH>
              <TH>Baseline net</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.tier}>
                <TD align="left" mono={false} className="text-muted-foreground">
                  {r.tier}
                </TD>
                <TD>{dp4(r.precision)}</TD>
                <TD>{dp4(r.recall)}</TD>
                <TD className="text-negative">{signedRupees(r.base)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

export default function Overview({ holdout, baseline, decisions, loading }) {
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const m = holdout.results_matrix;
  const pooled = holdout.pooled;

  return (
    <div className="space-y-12">
      <Hero pooled={pooled} holdout={holdout} decisions={decisions} />

      <section>
        <SectionHead title="Pooled across every tier">
          Account level prevalence {pct(m.obvious.account_prevalence, 2)}. Read the two
          recall figures as a pair: what the system blocks on its own, and what it
          reaches once a human works the queue.
        </SectionHead>
        <StatRow>
          <Stat
            label="Precision, blocked accounts"
            value={dp4(pooled.precision)}
            sub={`${count(pooled.fp)} wrong block in ${count(pooled.accounts_blocked)}`}
          />
          <Stat
            label="Recall, blocked"
            value={dp4(pooled.recall)}
            tone="caution"
            sub="what the system stops without asking anyone"
          />
          <Stat
            label="Recall, blocked or reviewed"
            value={dp4(pooled.recall_including_review)}
            tone="positive"
            sub="what it reaches with a human on the queue"
          />
          <Stat
            label="Review load"
            value={pct(pooled.review_rate, 2)}
            sub={`${count(pooled.clusters_reviewed)} clusters of ${count(holdout.n_clusters)}`}
          />
        </StatRow>
      </section>

      <section>
        <SectionHead title="Per tier, never averaged">
          Blending the four tiers would hide the sophistication threshold, which is the
          most interesting result here.
        </SectionHead>
        <TierTable matrix={m} />
      </section>

      {baseline && <BaselineCompare baseline={baseline} matrix={m} />}
    </div>
  );
}
