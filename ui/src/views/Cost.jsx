import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Note } from "@/components/ui/panel";
import { Metric, MetricRow } from "@/components/metric";
import { Empty, Metadata, PageHeader, Section, Skeleton } from "@/components/section";
import { ChartFrame, ChartTooltip, Legend, axisProps, gridProps } from "@/components/chart";
import { MARK, count, pct, rupees, signedRupees } from "@/lib/format";

const M = 1e6;
const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export default function Cost({ decisions, loading }) {
  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!decisions) return <Empty>No results/decisions.json yet. Run ./run.sh.</Empty>;

  const sweep = decisions.threshold_sweep.map((r) => ({
    threshold: r.threshold,
    cost: r.cost_rupees / M,
  }));
  const nothing = decisions.do_nothing_rupees
    ? decisions.do_nothing_rupees / M
    : decisions.three_action.do_nothing_rupees / M;
  const worst = Math.max(...sweep.map((s) => s.cost));
  const three = decisions.three_action;

  return (
    <div className="pt-14">
      <PageHeader
        title="What a decision costs"
        lede="Three prices decide everything on this page. Blocking a real customer, missing an abuser, and putting one cluster in front of an analyst. All three belong to the merchant's finance team, not to the model."
      >
        <Metadata
          className="mt-8"
          items={[
            ["Wrong block", rupees(decisions.cost_blocked_innocent)],
            ["Missed abuser", rupees(decisions.cost_missed_abuser)],
            ["Analyst review", rupees(decisions.cost_analyst_review)],
            ["Break-even precision", pct(decisions.breakeven_precision, 2)],
          ]}
        />
      </PageHeader>

      <Section
        title="Four ways to run the same model"
        lede="The model is identical in all four. Only the rule that turns a probability into an action changes, and three of the four lose money."
      >
        <MetricRow>
          <Metric
            label="F1-optimal threshold"
            value={signedRupees(decisions.f1_optimal.net_vs_nothing_rupees)}
            tone="bad"
            note="The point a machine learning course would pick"
          />
          <Metric
            label="Block above 0.50"
            value={signedRupees(decisions.at_half.net_vs_nothing_rupees)}
            tone="bad"
            note="The obvious default, and it loses money"
          />
          <Metric
            label="Block, review, allow"
            value={signedRupees(three.net_vs_nothing_rupees)}
            note="Three actions. The only setting that pays."
          />
          <Metric
            label="Review load"
            value={pct(three.review_rate, 2)}
            note={`${count(three.clusters_reviewed)} clusters go to a human`}
          />
        </MetricRow>

        <Note className="mt-8">
          Blocking only pays above{" "}
          <span className="tnum text-fg">{pct(decisions.breakeven_precision, 2)}</span>{" "}
          precision. Below that line every account you stop costs more in lost
          customers than it saves in stolen discount, which is why a third action
          exists at all.
        </Note>
      </Section>

      <Section title="Cost against blocking threshold">
        <ChartFrame
          description="All 101 two-action thresholds sit inside the shaded band, above the do-nothing line. Every single one of them loses money."
          legend={
            <Legend
              items={[
                { label: "cost of blocking at this threshold", color: MARK.bad },
                { label: "deploy nothing", color: MARK.neutral, dashed: true },
              ]}
            />
          }
          xLabel="probability threshold to block"
          yLabel="cost, ₹ millions, log scale"
          footer={`Swept over ${count(decisions.threshold_sweep.length)} thresholds. Of those, ${sweep.filter((s) => s.cost < nothing).length} come in under the do-nothing line.`}
        >
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={sweep} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <ReferenceArea
                y1={nothing} y2={worst}
                fill={MARK.bad} fillOpacity={0.05} stroke="none"
              />
              <XAxis dataKey="threshold" ticks={TICKS}
                     tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
              <YAxis
                scale="log" domain={["auto", "auto"]} width={54}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
                {...axisProps}
              />
              <ReferenceLine
                y={nothing} stroke="var(--color-fg-faint)" strokeDasharray="4 4"
                label={{
                  value: `deploy nothing, ₹${nothing.toFixed(2)}M`,
                  fill: "var(--color-fg-faint)", fontSize: 11,
                  position: "insideBottomRight",
                }}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-line-strong)" }}
                content={<ChartTooltip labelPrefix="threshold " format={(v) => rupees(v * M)} />}
              />
              <Line
                type="monotone" dataKey="cost" name="cost"
                stroke={MARK.bad} strokeWidth={1.5} dot={false} isAnimationActive={false}
                activeDot={{ r: 3, fill: MARK.bad, stroke: "var(--color-base)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Section>

      <Section
        title={`Sensitivity to the ${rupees(decisions.cost_blocked_innocent)} assumption`}
        lede="The customer lifetime value figure is an assumption, not a measurement. Across every ratio from 10:1 to 200:1, three actions still pay."
      >
        <Table className="min-w-[620px]">
          <THead>
            <TR className="hover:bg-transparent">
              <TH align="left">Cost ratio</TH>
              <TH>A wrong block costs</TH>
              <TH>Best two-action threshold</TH>
              <TH>Review load</TH>
              <TH>Net, three actions</TH>
            </TR>
          </THead>
          <tbody>
            {decisions.sensitivity.map((s) => (
              <TR key={s.cost_ratio}>
                <TD align="left">{s.cost_ratio}:1</TD>
                <TD className="text-fg-muted">{rupees(s.cost_blocked_innocent)}</TD>
                <TD>{s.optimal_threshold.toFixed(2)}</TD>
                <TD className="text-fg-muted">{pct(s.three_action_review_rate, 2)}</TD>
                <TD className={s.three_action_net >= 0 ? "text-fg" : "text-bad"}>
                  {signedRupees(s.three_action_net)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  );
}
