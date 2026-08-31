import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Note } from "@/components/ui/panel";
import { Empty, Metadata, PageHeader, Section, Skeleton } from "@/components/section";
import {
  ChartFrame, Legend, Readout, axisProps, crosshair, gridProps,
} from "@/components/chart";
import { count, pct, rupees, signedRupees } from "@/lib/format";

const M = 1e6;
const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export default function Cost({ decisions, loading, bare = false }) {
  const [hover, setHover] = useState(null);

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!decisions) return <Empty>No results/decisions.json yet. Run ./run.sh.</Empty>;

  const sweep = decisions.threshold_sweep.map((r) => ({
    threshold: r.threshold,
    cost: r.cost_rupees / M,
    rupees: r.cost_rupees,
    precision: r.precision,
  }));
  const nothing = decisions.do_nothing_rupees
    ? decisions.do_nothing_rupees / M
    : decisions.three_action.do_nothing_rupees / M;
  const nothingRupees = Math.round(nothing * M);
  const worst = Math.max(...sweep.map((s) => s.cost));
  const three = decisions.three_action;
  const beat = sweep.filter((s) => s.cost < nothing).length;

  const point = hover != null ? sweep[hover] : null;
  const delta = point ? nothingRupees - point.rupees : 0;

  return (
    <div className={bare ? undefined : "pt-14"}>
      {!bare && (
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
      )}

      <Section title="The decision that pays">
        <div className="grid grid-cols-1 gap-x-16 gap-y-10 border-y border-line-strong py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <div className="label">Three actions, net against doing nothing</div>
            <div className="tnum t-result mt-4">
              {signedRupees(three.net_vs_nothing_rupees)}
            </div>
            <p className="t-body mt-5 max-w-[48ch] text-fg-muted">
              Block, review, allow. Of the{" "}
              <span className="tnum text-fg">{count(sweep.length)}</span> two-action
              thresholds swept,{" "}
              <span className="tnum text-fg">{beat}</span> come in under the
              do-nothing line. The third action is what makes the difference.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-6 self-center sm:grid-cols-2">
            {[
              ["F1-optimal threshold", decisions.f1_optimal.net_vs_nothing_rupees,
               "the point a machine learning course would pick"],
              ["Block above 0.50", decisions.at_half.net_vs_nothing_rupees,
               "the obvious default"],
            ].map(([label, value, what]) => (
              <div key={label} className="border-l border-line pl-6">
                <dt className="label">{label}</dt>
                <dd className="tnum mt-3 text-[24px] leading-none font-medium text-bad">
                  {signedRupees(value)}
                </dd>
                <dd className="t-meta mt-2.5 text-fg-faint">{what}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Note className="mt-8 border-0 pt-0">
          Blocking only pays above{" "}
          <span className="tnum text-fg">{pct(decisions.breakeven_precision, 2)}</span>{" "}
          precision. Below that line every account you stop costs more in lost
          customers than it saves in stolen discount, which is why a third action
          exists at all.
        </Note>
      </Section>

      <Section
        title="Cost against blocking threshold"
        lede="Move across the curve to read any operating point against the do-nothing line."
      >
        <ChartFrame
          legend={
            <Legend
              items={[
                { label: "cost of blocking at this threshold", color: "var(--color-bad)" },
                { label: "deploy nothing", color: "var(--color-fg-faint)", dashed: true },
              ]}
            />
          }
          readout={
            <Readout
              active={!!point}
              resting="Move across the chart to inspect a threshold."
              items={point ? [
                { label: "Threshold", value: point.threshold.toFixed(2) },
                { label: "Cost", value: rupees(point.rupees), color: "var(--color-bad)" },
                { label: "Precision", value: point.precision.toFixed(4) },
                { label: "Against doing nothing", value: signedRupees(delta) },
                { label: "Verdict", value: delta >= 0 ? "pays" : "loses money" },
              ] : []}
            />
          }
          xLabel="probability threshold to block"
          yLabel="cost, ₹ millions, log scale"
          footer={`All ${count(sweep.length)} two-action thresholds sit above the do-nothing line, so every one of them loses money against deploying nothing at all.`}
        >
          <ResponsiveContainer width="100%" height={360}>
            <LineChart
              data={sweep}
              margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              onMouseMove={(s) =>
                setHover(s?.isTooltipActive ? s.activeTooltipIndex ?? null : null)}
              onMouseLeave={() => setHover(null)}
            >
              <CartesianGrid {...gridProps} />
              <ReferenceArea y1={nothing} y2={worst} fill="var(--color-bad)"
                             fillOpacity={0.05} stroke="none" />
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
              {/* Renders nothing. It is here for the crosshair and the active
                  index; the numbers appear in the Readout above the chart. */}
              <Tooltip content={() => null} cursor={crosshair} />
              <Line
                type="monotone" dataKey="cost" name="cost"
                stroke="var(--color-bad)" strokeWidth={1.5} dot={false}
                isAnimationActive={false}
                activeDot={{
                  r: 3.5, fill: "var(--color-bad)",
                  stroke: "var(--color-base)", strokeWidth: 2,
                }}
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
              <TR
                key={s.cost_ratio}
                selected={s.cost_blocked_innocent === decisions.cost_blocked_innocent}
              >
                <TD align="left">{s.cost_ratio}:1</TD>
                <TD className="text-fg-muted">{rupees(s.cost_blocked_innocent)}</TD>
                <TD>{s.optimal_threshold.toFixed(2)}</TD>
                <TD className="text-fg-muted">{pct(s.three_action_review_rate, 2)}</TD>
                <TD strong>{signedRupees(s.three_action_net)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <Note className="mt-6">
          The highlighted row is the assumption this project ships with. Three
          actions pay at every ratio in the table, so the conclusion does not
          depend on getting that one number exactly right.
        </Note>
      </Section>
    </div>
  );
}
