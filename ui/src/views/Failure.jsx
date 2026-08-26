import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Note, Panel } from "@/components/ui/panel";
import {
  Empty, Metadata, PageHeader, Section, Skeleton, Status,
} from "@/components/section";
import { ChartFrame, ChartTooltip, Legend, axisProps, gridProps } from "@/components/chart";
import { MARK, count, dp4 } from "@/lib/format";

const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/* Where blocking recall falls away, taken from the curve itself, not guessed. */
function deadZoneStart(curve) {
  const hit = curve.find((c) => c.recall < 0.05);
  return hit ? hit.sophistication : null;
}

/*
  One catalogue entry. This is the one place a bordered panel earns itself:
  each failure is a discrete object a reader works through one at a time.
*/
function FailureEntry({ f, index }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <span className="tnum text-[12px] text-fg-faint">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="text-[14.5px] font-medium tracking-[-0.01em] text-fg">
          {f.failure}
        </h3>
        <span className="ml-auto text-[12.5px] text-fg-faint">{f.example}</span>
      </div>
      <p className="tnum px-5 py-4 text-[13px] text-fg-muted">{f.detail}</p>
      <dl className="grid border-t border-line sm:grid-cols-2">
        <div className="border-b border-line px-5 py-4 sm:border-r sm:border-b-0">
          <dt className="label">Why it happens</dt>
          <dd className="mt-2.5 text-[13px] leading-[1.6] text-fg-muted">{f.why}</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="label">What it costs</dt>
          <dd className="mt-2.5 text-[13px] leading-[1.6] text-fg-muted">{f.cost}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function Lookalikes({ stress }) {
  const kinds = Object.entries(stress.by_kind).sort((a, b) => b[1].clusters - a[1].clusters);
  return (
    <Section
      title="Groups that look like rings but are not"
      lede={`${count(stress.worlds)} worlds containing no rings at all, ${count(stress.n_accounts)} accounts. Families share an address. Flatmates share a device. Hostels share both. A detector that cannot tell them from a ring is worthless in production.`}
    >
      <div className="grid border-y border-line sm:grid-cols-3 lg:grid-cols-5">
        {kinds.map(([kind, k], i) => (
          <div
            key={kind}
            className={[
              "px-5 py-6 first:pl-0 last:pr-0",
              i > 0 && "sm:border-l sm:border-line",
            ].filter(Boolean).join(" ")}
          >
            <div className="label">{kind}</div>
            <div className="tnum mt-3 text-[24px] leading-none font-medium text-fg">
              {count(k.clusters)}
            </div>
            <div className="mt-3 text-[12.5px] text-fg-faint">
              clusters · <span className="tnum text-fg-muted">{k.wrongly_blocked}</span> blocked
              {k.sent_to_review > 0 && (
                <> · <span className="tnum text-fg-muted">{k.sent_to_review}</span> reviewed</>
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

  return (
    <div className="pt-14">
      <PageHeader
        title="Where this stops working"
        lede="Naming the blind spot precisely is worth more than claiming there isn't one. Everything on this page is a measured failure, not a caveat."
      >
        <Metadata
          className="mt-8"
          items={[
            ["Known failures", holdout.failure_catalogue.length],
            ["Blocking gone by", dead !== null ? dead.toFixed(2) : "n/a"],
            ["Lookalike worlds", count(holdout.lookalike_stress?.worlds ?? 0)],
          ]}
        />
      </PageHeader>

      <Section title="Recall as the operator gets better">
        <ChartFrame
          description="Operator sophistication swept from the obvious tier at 0.0 to the adaptive tier at 1.0. Past the shaded edge, blocking has stopped contributing anything and only the review queue is still working."
          legend={
            <Legend
              items={[
                { label: "blocked or reviewed", color: MARK.ok },
                { label: "blocked", color: MARK.info },
                { label: "precision", color: MARK.warn, dashed: true },
              ]}
            />
          }
          xLabel="operator sophistication"
          yLabel="rate"
        >
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              {dead !== null && (
                <ReferenceArea
                  x1={dead} x2={1} fill={MARK.bad} fillOpacity={0.06} stroke="none"
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
              <Tooltip
                cursor={{ stroke: "var(--color-line-strong)" }}
                content={<ChartTooltip labelPrefix="sophistication " format={(v) => dp4(v)} />}
              />
              <Line type="monotone" dataKey="withReview" name="blocked or reviewed"
                    stroke={MARK.ok} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="blocked" name="blocked"
                    stroke={MARK.info} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="precision" name="precision"
                    stroke={MARK.warn} strokeWidth={1.5} strokeDasharray="4 3"
                    dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Section>

      <Section title="Rotating devices alone does not help the operator">
        <ChartFrame
          description={`Device reuse swept across its whole range with everything else held at the moderate tier. Blocked recall moves by ${deviceSpread.toFixed(3)} end to end, and the review queue does not move at all. Rotating delivery addresses is what defeats this system, not rotating phones.`}
          legend={
            <Legend
              items={[
                { label: "blocked or reviewed", color: MARK.ok },
                { label: "blocked", color: MARK.info },
              ]}
            />
          }
          xLabel="device reuse"
          yLabel="rate"
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={device} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="reuse" ticks={TICKS}
                     tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
              <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={42} {...axisProps} />
              <Tooltip
                cursor={{ stroke: "var(--color-line-strong)" }}
                content={<ChartTooltip labelPrefix="device reuse " format={(v) => dp4(v)} />}
              />
              <Line type="monotone" dataKey="withReview" name="blocked or reviewed"
                    stroke={MARK.ok} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="blocked" name="blocked"
                    stroke={MARK.info} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Section>

      {holdout.lookalike_stress && <Lookalikes stress={holdout.lookalike_stress} />}

      <Section
        title="Failure catalogue"
        lede="Every way this system is known to fail, each with a real cluster from a real seed. Kept because a failure nobody wrote down gets rediscovered in production."
        meta={
          <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
            <Status tone="bad" />
            {holdout.failure_catalogue.length} known
          </span>
        }
      >
        <div className="space-y-3">
          {holdout.failure_catalogue.map((f, i) => (
            <FailureEntry key={i} f={f} index={i} />
          ))}
        </div>
      </Section>
    </div>
  );
}
