import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Banknote, Scale, SplitSquareHorizontal, Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat, StatRow } from "@/components/stat";
import { Empty, Meter, SectionHead, Skeleton } from "@/components/bits";
import { ChartFrame, ChartTooltip, LegendChips, axisProps, gridProps } from "@/components/chart";
import { count, pct, rupees, signedRupees } from "@/lib/format";

const M = 1e6;
const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export default function Cost({ decisions, loading }) {
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!decisions) return <Empty>No results/decisions.json yet. Run ./run.sh.</Empty>;

  const sweep = decisions.threshold_sweep.map((r) => ({
    threshold: r.threshold,
    cost: r.cost_rupees / M,
    precision: r.precision,
    f1: r.f1,
  }));
  const nothing = decisions.do_nothing_rupees
    ? decisions.do_nothing_rupees / M
    : decisions.three_action.do_nothing_rupees / M;
  const worst = Math.max(...sweep.map((s) => s.cost));
  const three = decisions.three_action;

  return (
    <div className="space-y-10">
      <section>
        <SectionHead title="What each operating point costs">
          Blocking a real customer costs {rupees(decisions.cost_blocked_innocent)}. Missing
          an abuser costs {rupees(decisions.cost_missed_abuser)}. An analyst review costs{" "}
          {rupees(decisions.cost_analyst_review)}. Those three prices decide everything
          on this page.
        </SectionHead>
        <StatRow>
          <Stat
            icon={Scale}
            label="F1-optimal threshold"
            value={signedRupees(decisions.f1_optimal.net_vs_nothing_rupees)}
            tone="neg"
            sub="the point a machine learning course would pick"
          />
          <Stat
            icon={Banknote}
            label="block above 0.50"
            value={signedRupees(decisions.at_half.net_vs_nothing_rupees)}
            tone="neg"
            sub="the obvious default, and it loses money"
          />
          <Stat
            icon={SplitSquareHorizontal}
            label="three actions"
            value={signedRupees(three.net_vs_nothing_rupees)}
            tone="pos"
            sub="block, review, allow. The only setting that pays."
          />
          <Stat
            icon={Inbox}
            label="review queue"
            value={pct(three.review_rate, 2)}
            sub={`${count(three.clusters_reviewed)} clusters go to a human`}
          />
        </StatRow>
      </section>

      <Card className="border-warn/25 bg-warn/5">
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">
          <Badge tone="warn">break-even</Badge>
          <p className="text-[13px] leading-relaxed text-ink-dim">
            Blocking only pays above{" "}
            <span className="num text-warn">{pct(decisions.breakeven_precision, 2)}</span>{" "}
            precision. Below that line, every account you stop costs more in lost
            customers than it saves in stolen discount.
          </p>
        </CardContent>
      </Card>

      <ChartFrame
        title="Cost against blocking threshold"
        description="All 101 two-action thresholds sit inside the red band, above the do-nothing line. Every single one of them loses money."
        legend={
          <LegendChips
            items={[
              { label: "cost of blocking at this threshold", color: "var(--color-neg)" },
              { label: "deploy nothing", color: "var(--color-ink-faint)" },
            ]}
          />
        }
        xLabel="probability threshold to block"
        yLabel="cost, ₹ millions, log scale"
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={sweep} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <ReferenceArea
              y1={nothing}
              y2={worst}
              fill="var(--color-neg)"
              fillOpacity={0.045}
              label={{
                value: "everything in here loses money",
                fill: "var(--color-neg)",
                fontSize: 11,
                position: "insideTopLeft",
              }}
            />
            <XAxis dataKey="threshold" ticks={TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
            <YAxis
              scale="log"
              domain={["auto", "auto"]}
              width={52}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
              {...axisProps}
            />
            <ReferenceLine
              y={nothing}
              stroke="var(--color-ink-faint)"
              strokeDasharray="5 5"
              label={{
                value: `deploy nothing, ₹${nothing.toFixed(2)}M`,
                fill: "var(--color-ink-faint)",
                fontSize: 11,
                position: "insideBottomRight",
              }}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-line)" }}
              content={
                <ChartTooltip
                  labelPrefix="threshold "
                  format={(v) => rupees(v * M)}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="cost"
              name="cost"
              stroke="var(--color-neg)"
              strokeWidth={2}
              dot={false} isAnimationActive={false}
              activeDot={{ r: 3, fill: "var(--color-neg)", stroke: "var(--color-bg)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <Card>
        <CardHeader>
          <CardTitle>Sensitivity to the {rupees(decisions.cost_blocked_innocent)} assumption</CardTitle>
          <CardDescription>
            The customer lifetime value figure is an assumption, not a measurement.
            Here is how far the conclusion moves if you disagree with it. Across
            every ratio from 10:1 to 200:1, three actions still pay.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">cost ratio</TH>
                <TH>a wrong block costs</TH>
                <TH>best two-action threshold</TH>
                <TH>review load</TH>
                <TH>net, three actions</TH>
              </TR>
            </THead>
            <tbody>
              {decisions.sensitivity.map((s) => (
                <TR key={s.cost_ratio}>
                  <TD align="left">{s.cost_ratio}:1</TD>
                  <TD className="text-ink-dim">{rupees(s.cost_blocked_innocent)}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-2.5">
                      <Meter value={s.optimal_threshold} color="var(--color-warn)" />
                      {s.optimal_threshold.toFixed(2)}
                    </span>
                  </TD>
                  <TD className="text-ink-dim">{pct(s.three_action_review_rate, 2)}</TD>
                  <TD className={s.three_action_net >= 0 ? "text-pos" : "text-neg"}>
                    {signedRupees(s.three_action_net)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
