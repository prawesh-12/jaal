import { ShieldCheck, Crosshair, Users, Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat, StatRow } from "@/components/stat";
import { Empty, Meter, SectionHead, TierName, Skeleton } from "@/components/bits";
import {
  TIERS, TIER_COLOR, count, dp4, isUndefinedPrecision, pct, rupees, signedRupees,
} from "@/lib/format";

function Precision({ value }) {
  if (isUndefinedPrecision(value))
    return <Badge tone="neutral">undefined, nothing blocked</Badge>;
  return <span className="num">{dp4(value)}</span>;
}

/* Two lengths, one scale. What the abuse costs untouched, and what it costs after. */
function CostBars({ nothing, withJaal }) {
  const rows = [
    { label: "abuse cost if you deploy nothing", value: nothing, color: "var(--color-neg)" },
    { label: "abuse cost with Jaal running", value: withJaal, color: "var(--color-pos)" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-ink-dim">{r.label}</span>
            <span className="num text-[13px] text-ink">{rupees(r.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
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

function Headline({ pooled, holdout }) {
  const net = pooled.net_vs_nothing_rupees;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-px bg-line-soft lg:grid-cols-[1.15fr_1fr]">
        <div className="bg-surface/70 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">
              <ShieldCheck size={12} /> sealed holdout
            </Badge>
            <Badge>{holdout.opened}</Badge>
            <Badge>{holdout.calibration_method} calibration</Badge>
          </div>

          <div className="num mt-5 text-5xl leading-none font-semibold text-pos">
            {signedRupees(net)}
          </div>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink-dim">
            Money kept against doing nothing, across {count(holdout.n_seeds)} worlds and{" "}
            {count(pooled.n_accounts)} accounts. Every figure below is per tier.
            Averaging them would hide the point.
          </p>

          <div className="mt-6 grid gap-4 border-t border-line-soft pt-5 sm:grid-cols-3">
            {[
              ["clusters scored", count(holdout.n_clusters)],
              ["ring accounts hidden", count(pooled.n_ring_accounts)],
              ["sent to a human", pct(pooled.review_rate, 2)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="eyebrow">{k}</div>
                <div className="num mt-1 text-[15px] text-ink">{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface/40 p-6">
          <CostBars nothing={pooled.do_nothing_rupees} withJaal={pooled.cost_rupees} />
          <div className="mt-6 space-y-2.5 border-t border-line-soft pt-5 text-[12.5px] leading-relaxed text-ink-dim">
            <p>
              <span className="num text-ink">{count(pooled.fp)}</span> real customer
              wrongly blocked out of{" "}
              <span className="num text-ink">{count(pooled.accounts_blocked)}</span> blocks.
            </p>
            <p>
              <span className="num text-ink">{count(pooled.missed)}</span> ring accounts
              walked through untouched. That is the honest half of the number above.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TierTable({ matrix }) {
  return (
    <Card>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH align="left">tier</TH>
            <TH>clusters</TH>
            <TH>PR-AUC</TH>
            <TH>precision</TH>
            <TH>recall, blocked</TH>
            <TH>with review</TH>
            <TH>Brier</TH>
            <TH>blocked</TH>
            <TH>reviewed</TH>
            <TH>net</TH>
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
                <TD className="text-ink-dim">{count(m.n_clusters)}</TD>
                <TD>{dp4(m.pr_auc)}</TD>
                <TD mono={false}>
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
                <TD className="text-ink-dim">{m.brier.toFixed(5)}</TD>
                <TD className="text-ink-dim">{count(m.accounts_blocked)}</TD>
                <TD className="text-ink-dim">{count(m.accounts_reviewed)}</TD>
                <TD className={m.net_vs_nothing_rupees >= 0 ? "text-pos" : "text-neg"}>
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

/* Both sides on one scale. The baseline bars are long for a reason. */
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
        <CardTitle>Jaal against the rules-only baseline</CardTitle>
        <CardDescription>
          Exact matching on device and address, five hand-written rules, two actions.
          Measured on validation seeds at the same prevalence, so the bars compare
          direction and size, not the same worlds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => (
          <div key={r.tier} className="grid gap-2 sm:grid-cols-[130px_1fr] sm:items-center">
            <div className="text-[13px] font-medium">
              <TierName tier={r.tier} />
            </div>
            <div>
              <div className="relative flex h-9 flex-col justify-center gap-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-ink-faint/40" />
                <div className="flex h-2.5">
                  <div className="flex w-1/2 justify-end pr-px">
                    <div
                      className="rounded-l-sm bg-neg/80"
                      style={{ width: `${(Math.abs(r.base) / max) * 100}%`, minWidth: 3 }}
                    />
                  </div>
                  <div className="w-1/2" />
                </div>
                <div className="flex h-2.5">
                  <div className="w-1/2" />
                  <div className="flex w-1/2 pl-px">
                    <div
                      className="rounded-r-sm bg-pos"
                      style={{ width: `${(Math.abs(r.jaal) / max) * 100}%`, minWidth: 3 }}
                    />
                  </div>
                </div>
              </div>
              {/* Both labels hug the zero line, so each sits where its bar starts. */}
              <div className="mt-0.5 flex text-[11.5px]">
                <div className="w-1/2 pr-2 text-right">
                  <span className="font-sans text-ink-faint">rules </span>
                  <span className="num text-neg">{signedRupees(r.base)}</span>
                </div>
                <div className="w-1/2 pl-2 text-left">
                  <span className="num text-pos">{signedRupees(r.jaal)}</span>
                  <span className="font-sans text-ink-faint"> Jaal</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="mt-2 border-t border-line-soft pt-4">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">tier</TH>
                <TH>baseline precision</TH>
                <TH>baseline recall</TH>
                <TH>baseline net</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.tier}>
                  <TD align="left" mono={false} className="text-ink-dim">
                    {r.tier}
                  </TD>
                  <TD>{dp4(r.precision)}</TD>
                  <TD>{dp4(r.recall)}</TD>
                  <TD className="text-neg">{signedRupees(r.base)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Results({ holdout, baseline, loading }) {
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const m = holdout.results_matrix;
  const pooled = holdout.pooled;

  return (
    <div className="space-y-10">
      <Headline pooled={pooled} holdout={holdout} />

      <section>
        <SectionHead title="Pooled across every tier">
          Account level prevalence {pct(m.obvious.account_prevalence, 2)}. Read the
          recall figures as a pair: what the system blocks on its own, and what it
          reaches once a human looks at the queue.
        </SectionHead>
        <StatRow>
          <Stat
            icon={Crosshair}
            label="precision, blocked accounts"
            value={dp4(pooled.precision)}
            sub={`${count(pooled.fp)} wrong block in ${count(pooled.accounts_blocked)}`}
          />
          <Stat
            icon={ShieldCheck}
            label="recall, blocked"
            value={dp4(pooled.recall)}
            tone="warn"
            sub="what the system stops without asking anyone"
          />
          <Stat
            icon={Users}
            label="recall, blocked or reviewed"
            value={dp4(pooled.recall_including_review)}
            tone="pos"
            sub="what it reaches with a human on the queue"
          />
          <Stat
            icon={Gauge}
            label="review load"
            value={pct(pooled.review_rate, 2)}
            sub={`${count(pooled.clusters_reviewed)} clusters of ${count(holdout.n_clusters)}`}
          />
        </StatRow>
      </section>

      <section>
        <SectionHead title="Per tier, never averaged">
          Blending the four tiers would hide the sophistication threshold, which is
          the most interesting result here.
        </SectionHead>
        <TierTable matrix={m} />
      </section>

      {baseline && <BaselineCompare baseline={baseline} matrix={m} />}
    </div>
  );
}
