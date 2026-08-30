import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Note } from "@/components/ui/panel";
import { Disclosure } from "@/components/disclosure";
import { Metric, MetricRow } from "@/components/metric";
import {
  Empty, PageHeader, Section, Skeleton, Status,
} from "@/components/section";
import {
  ChartFrame, Legend, Readout, axisProps, crosshair, gridProps,
} from "@/components/chart";
import { count, dp4, isUndefinedPrecision } from "@/lib/format";

const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/* Where blocking recall falls away, taken from the curve itself, not guessed. */
function deadZoneStart(curve) {
  const hit = curve.find((c) => c.recall < 0.05);
  return hit ? hit.sophistication : null;
}

function FailureEntry({ f, index, stage }) {
  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tnum text-[12px] text-fg-dim">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[14.5px] font-medium tracking-[-0.01em] text-fg">
            {f.failure}
          </span>
          <span className="t-meta ml-auto text-fg-faint">{f.example}</span>
        </span>
      }
    >
      <div className="border-l-2 border-bad/70 pl-5">
        <p className="tnum text-[13px] text-fg-2">{f.detail}</p>

        <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <dt className="label">Why it happens</dt>
            <dd className="mt-2.5 text-[13px] leading-[1.65] text-fg-muted">{f.why}</dd>
          </div>
          <div>
            <dt className="label">What it costs</dt>
            <dd className="mt-2.5 text-[13px] leading-[1.65] text-fg-muted">{f.cost}</dd>
          </div>
          <div>
            <dt className="label">Stage it belongs to</dt>
            <dd className="mt-2.5 text-[13px] text-fg-2">{stage}</dd>
          </div>
          <div>
            <dt className="label">Where it was seen</dt>
            <dd className="mt-2.5 text-[13px] text-fg-2">{f.example}</dd>
          </div>
        </dl>
      </div>
    </Disclosure>
  );
}

function stageOf(f) {
  const text = `${f.failure} ${f.why}`.toLowerCase();
  if (text.includes("cluster") && text.includes("never")) return "Link, then Cluster";
  if (text.includes("split") || text.includes("fragment")) return "Cluster";
  if (text.includes("allow") || text.includes("cost")) return "Decide";
  if (text.includes("feature") || text.includes("repeat")) return "Features";
  return "Link";
}

function Lookalikes({ stress }) {
  const kinds = Object.entries(stress.by_kind).sort((a, b) => b[1].clusters - a[1].clusters);
  return (
    <Section
      title="Groups that look like rings but are not"
      lede={`${count(stress.worlds)} worlds containing no rings at all, ${count(stress.n_accounts)} accounts. Families share an address. Flatmates share a device. Hostels share both. A detector that cannot tell them from a ring is worthless in production.`}
    >
      <div className="grid border-y border-line-strong sm:grid-cols-3 lg:grid-cols-5">
        {kinds.map(([kind, k], i) => (
          <div
            key={kind}
            className={[
              "interactive px-5 py-7 first:pl-0 last:pr-0 hover:bg-surface",
              i > 0 && "sm:border-l sm:border-line",
            ].filter(Boolean).join(" ")}
          >
            <div className="label">{kind}</div>
            <div className="tnum mt-3.5 text-[26px] leading-none font-medium text-fg">
              {count(k.clusters)}
            </div>
            <div className="mt-3 text-[12.5px] text-fg-faint">
              clusters · <span className="tnum text-fg-2">{k.wrongly_blocked}</span> blocked
              {k.sent_to_review > 0 && (
                <> · <span className="tnum text-fg-2">{k.sent_to_review}</span> reviewed</>
              )}
            </div>
          </div>
        ))}
      </div>
      <Note className="mt-6 border-0 pt-0">
        <span className="tnum text-fg">{count(stress.accounts_wrongly_blocked)}</span>{" "}
        accounts wrongly blocked across all{" "}
        <span className="tnum text-fg">{count(stress.n_clusters)}</span> clusters. One
        ordinary cluster reached the review queue. Nothing else was touched.
      </Note>
    </Section>
  );
}

export default function Failure({ holdout, loading }) {
  const [hoverA, setHoverA] = useState(null);
  const [hoverB, setHoverB] = useState(null);

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const curve = holdout.detection_curve.map((c) => ({
    sophistication: c.sophistication,
    blocked: c.recall,
    withReview: c.recall_including_review,
    // Null means nothing was blocked, so precision is undefined. Break the line.
    precision: c.precision ?? null,
  }));
  const dead = deadZoneStart(holdout.detection_curve);
  const device = holdout.device_only_curve.map((c) => ({
    reuse: c.device_reuse,
    blocked: c.recall,
    withReview: c.recall_including_review,
  }));
  const deviceSpread =
    Math.max(...device.map((d) => d.blocked)) - Math.min(...device.map((d) => d.blocked));

  const a = hoverA != null ? curve[hoverA] : null;
  const bpt = hoverB != null ? device[hoverB] : null;

  return (
    <div className="pt-14">
      <PageHeader
        title="Where this stops working"
        lede="Naming the blind spot precisely is worth more than claiming there isn't one. Everything on this page is a measured failure, not a caveat."
      />

      <Section title="Failure overview">
        <MetricRow columns={3}>
          <Metric
            label="Known failure modes"
            value={holdout.failure_catalogue.length}
            level={2}
            note="Each one carries a real cluster from a real seed"
            detail="A failure nobody wrote down gets rediscovered in production, so every one that has been found is kept here rather than fixed quietly."
          />
          <Metric
            label="Blocking is finished by"
            value={dead !== null ? dead.toFixed(2) : "n/a"}
            level={2}
            tone="warn"
            note="Operator sophistication, on the swept curve"
            detail="Past this point the system blocks nothing at all. Everything it still reaches, it reaches by sending the cluster to a human."
          />
          <Metric
            label="Wrongly blocked, ring-free worlds"
            value={count(holdout.lookalike_stress?.accounts_wrongly_blocked ?? 0)}
            level={2}
            tone="ok"
            note={`Across ${count(holdout.lookalike_stress?.n_clusters ?? 0)} clusters that contain no ring`}
            detail="Families, flatmates, hostels and offices all share the attributes a ring shares. This is the count that says whether the detector can tell them apart."
          />
        </MetricRow>
      </Section>

      <Section
        title="Recall as the operator gets better"
        lede="Operator sophistication swept from the obvious tier at 0.0 to the adaptive tier at 1.0. Move across the chart to read any point."
      >
        <ChartFrame
          legend={
            <Legend
              items={[
                { label: "blocked or reviewed", color: "var(--color-ok)" },
                { label: "blocked", color: "var(--color-info)" },
                { label: "precision", color: "var(--color-warn)", dashed: true },
              ]}
            />
          }
          readout={
            <Readout
              active={!!a}
              resting="Move across the chart to read the curve at any level of operator sophistication."
              items={a ? [
                { label: "Sophistication", value: a.sophistication.toFixed(2) },
                { label: "Blocked", value: dp4(a.blocked), color: "var(--color-info)" },
                { label: "With review", value: dp4(a.withReview), color: "var(--color-ok)" },
                {
                  label: "Precision",
                  value: isUndefinedPrecision(a.precision) ? "undefined" : dp4(a.precision),
                  color: "var(--color-warn)",
                },
                {
                  label: "Blocking",
                  value: a.blocked < 0.05 ? "finished" : "still contributing",
                },
              ] : []}
            />
          }
          xLabel="operator sophistication"
          yLabel="rate"
          footer={dead !== null
            ? `Past ${dead.toFixed(2)} the blocked line is under 0.05, so blocking has stopped contributing and only the review queue is still working.`
            : undefined}
        >
          <ResponsiveContainer width="100%" height={380}>
            <LineChart
              data={curve}
              margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              onMouseMove={(s) =>
                setHoverA(s?.isTooltipActive ? s.activeTooltipIndex ?? null : null)}
              onMouseLeave={() => setHoverA(null)}
            >
              <CartesianGrid {...gridProps} />
              {dead !== null && (
                <ReferenceArea
                  x1={dead} x2={1} fill="var(--color-bad)" fillOpacity={0.07} stroke="none"
                  label={{
                    value: "blocking is finished here",
                    fill: "var(--color-fg-faint)", fontSize: 11, position: "center",
                  }}
                />
              )}
              <XAxis dataKey="sophistication" ticks={TICKS}
                     tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
              <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={42} {...axisProps} />
              <ReferenceLine y={0.5} stroke="var(--color-line-strong)" strokeDasharray="2 5" />
              <Tooltip content={() => null} cursor={crosshair} />
              <Line type="monotone" dataKey="withReview" name="blocked or reviewed"
                    stroke="var(--color-ok)" strokeWidth={1.5} dot={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: "var(--color-ok)", stroke: "var(--color-base)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="blocked" name="blocked"
                    stroke="var(--color-info)" strokeWidth={1.5} dot={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: "var(--color-info)", stroke: "var(--color-base)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="precision" name="precision"
                    stroke="var(--color-warn)" strokeWidth={1.5} strokeDasharray="4 3"
                    dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Section>

      <Section
        title="Rotating devices alone does not help the operator"
        lede={`Device reuse swept across its whole range with everything else held at the moderate tier. Blocked recall moves by ${deviceSpread.toFixed(3)} end to end, and the review queue does not move at all.`}
      >
        <ChartFrame
          legend={
            <Legend
              items={[
                { label: "blocked or reviewed", color: "var(--color-ok)" },
                { label: "blocked", color: "var(--color-info)" },
              ]}
            />
          }
          readout={
            <Readout
              active={!!bpt}
              resting="Move across the chart to read either curve at any level of device reuse."
              items={bpt ? [
                { label: "Device reuse", value: bpt.reuse.toFixed(2) },
                { label: "Blocked", value: dp4(bpt.blocked), color: "var(--color-info)" },
                { label: "With review", value: dp4(bpt.withReview), color: "var(--color-ok)" },
              ] : []}
            />
          }
          xLabel="device reuse"
          yLabel="rate"
          footer="Rotating delivery addresses is what defeats this system, not rotating phones."
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={device}
              margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              onMouseMove={(s) =>
                setHoverB(s?.isTooltipActive ? s.activeTooltipIndex ?? null : null)}
              onMouseLeave={() => setHoverB(null)}
            >
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="reuse" ticks={TICKS}
                     tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
              <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={42} {...axisProps} />
              <Tooltip content={() => null} cursor={crosshair} />
              <Line type="monotone" dataKey="withReview" name="blocked or reviewed"
                    stroke="var(--color-ok)" strokeWidth={1.5} dot={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: "var(--color-ok)", stroke: "var(--color-base)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="blocked" name="blocked"
                    stroke="var(--color-info)" strokeWidth={1.5} dot={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: "var(--color-info)", stroke: "var(--color-base)", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Section>

      {holdout.lookalike_stress && <Lookalikes stress={holdout.lookalike_stress} />}

      <Section
        title="Failure catalogue"
        lede="Every way this system is known to fail, each with a real cluster from a real seed. Open one for why it happens, what it costs, and which stage it belongs to."
        meta={
          <span className="inline-flex items-center gap-2.5 text-[12.5px] text-fg-muted">
            <Status tone="bad" />
            {holdout.failure_catalogue.length} known
          </span>
        }
      >
        <div className="border-t border-line-strong">
          {holdout.failure_catalogue.map((f, i) => (
            <FailureEntry key={i} f={f} index={i} stage={stageOf(f)} />
          ))}
        </div>
      </Section>
    </div>
  );
}
