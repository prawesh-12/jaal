import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHead, SectionHead, Skeleton } from "@/components/bits";
import { ChartFrame, ChartTooltip, LegendChips, axisProps, gridProps } from "@/components/chart";
import { MARK, count, dp4 } from "@/lib/format";

const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/* Where blocking recall falls away, taken from the curve itself, not guessed. */
function deadZoneStart(curve) {
  const hit = curve.find((c) => c.recall < 0.05);
  return hit ? hit.sophistication : null;
}

function FailureCard({ f, index }) {
  return (
    <Card>
      <div className="flex gap-4 px-5 pt-5 pb-4">
        <span className="num grid size-6 shrink-0 place-items-center rounded-md border border-border bg-muted text-[11px] text-subtle">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
              {f.failure}
            </h3>
            <Badge tone="outline">{f.example}</Badge>
          </div>
          <p className="num mt-2 text-[12.5px] text-muted-foreground">{f.detail}</p>
        </div>
      </div>
      <dl className="grid border-t border-border-subtle sm:grid-cols-2">
        <div className="border-b border-border-subtle px-5 py-4 sm:border-r sm:border-b-0">
          <dt className="label">Why it happens</dt>
          <dd className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {f.why}
          </dd>
        </div>
        <div className="px-5 py-4">
          <dt className="label">What it costs</dt>
          <dd className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {f.cost}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function Lookalikes({ stress }) {
  const kinds = Object.entries(stress.by_kind).sort((a, b) => b[1].clusters - a[1].clusters);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups that look like rings but are not</CardTitle>
        <CardDescription>
          {count(stress.worlds)} worlds containing no rings at all,{" "}
          {count(stress.n_accounts)} accounts. Families share an address. Flatmates
          share a device. Hostels share both. A detector that cannot tell them from a
          ring is worthless in production.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kinds.map(([kind, k]) => (
            <div key={kind} className="rounded-md border border-border-subtle bg-muted/35 p-3">
              <div className="label">{kind}</div>
              <div className="num mt-1.5 text-[19px] leading-none text-foreground">
                {count(k.clusters)}
              </div>
              <div className="mt-1 text-[11.5px] text-subtle">clusters</div>
              <div className="mt-3 border-t border-border-subtle pt-2 text-[11.5px]">
                <span className="num text-positive">{k.wrongly_blocked}</span>
                <span className="text-subtle"> blocked</span>
                {k.sent_to_review > 0 && (
                  <>
                    <span className="num text-caution">, {k.sent_to_review}</span>
                    <span className="text-subtle"> reviewed</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          <span className="num text-positive">{count(stress.accounts_wrongly_blocked)}</span>{" "}
          accounts wrongly blocked across all{" "}
          <span className="num text-foreground">{count(stress.n_clusters)}</span> clusters.
          One ordinary cluster reached the review queue. Nothing else was touched.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Failure({ holdout, loading }) {
  if (loading) return <Skeleton className="h-96 w-full" />;
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
    <div className="space-y-12">
      <PageHead
        title="Where this stops working"
        lede="Naming the blind spot precisely is worth more than claiming there isn't one. Everything on this page is a measured failure, not a caveat."
      />

      <ChartFrame
        title="Recall as the operator gets better"
        description="Operator sophistication swept from the obvious tier at 0.0 to the adaptive tier at 1.0. Past the shaded edge, blocking has stopped contributing anything and only the review queue is still working."
        legend={
          <LegendChips
            items={[
              { label: "recall, blocked or reviewed", color: MARK.green },
              { label: "recall, blocked", color: MARK.blue },
              { label: "precision", color: MARK.amber },
            ]}
          />
        }
        xLabel="operator sophistication"
        yLabel="rate"
      >
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid {...gridProps} />
            {dead !== null && (
              <ReferenceArea
                x1={dead}
                x2={1}
                fill={MARK.red}
                fillOpacity={0.07}
                label={{
                  value: "blocking is finished here",
                  fill: "var(--color-negative)",
                  fontSize: 11,
                  position: "center",
                }}
              />
            )}
            <XAxis dataKey="sophistication" ticks={TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={40} {...axisProps} />
            <ReferenceLine y={0.5} stroke="var(--color-border)" strokeDasharray="3 6" />
            <Tooltip
              cursor={{ stroke: "var(--color-border)" }}
              content={<ChartTooltip labelPrefix="sophistication " format={(v) => dp4(v)} />}
            />
            <Line type="monotone" dataKey="withReview" name="blocked or reviewed"
              stroke={MARK.green} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="blocked" name="blocked"
              stroke={MARK.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="precision" name="precision"
              stroke={MARK.amber} strokeWidth={2} strokeDasharray="4 3"
              dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Rotating devices alone does not help the operator"
        description={`Device reuse swept across its whole range with everything else held at the moderate tier. Blocked recall moves by ${deviceSpread.toFixed(3)} end to end, and the review queue does not move at all. Rotating delivery addresses is what defeats this system, not rotating phones.`}
        legend={
          <LegendChips
            items={[
              { label: "recall, blocked or reviewed", color: MARK.green },
              { label: "recall, blocked", color: MARK.blue },
            ]}
          />
        }
        xLabel="device reuse"
        yLabel="rate"
      >
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={device} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="reuse" ticks={TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={40} {...axisProps} />
            <Tooltip
              cursor={{ stroke: "var(--color-border)" }}
              content={<ChartTooltip labelPrefix="device reuse " format={(v) => dp4(v)} />}
            />
            <Line type="monotone" dataKey="withReview" name="blocked or reviewed"
              stroke={MARK.green} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="blocked" name="blocked"
              stroke={MARK.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      {holdout.lookalike_stress && <Lookalikes stress={holdout.lookalike_stress} />}

      <section>
        <SectionHead
          title="Failure catalogue"
          right={<Badge tone="negative">{holdout.failure_catalogue.length} known</Badge>}
        >
          Every way this system is known to fail, each with a real cluster from a real
          seed. Kept because a failure nobody wrote down gets rediscovered in
          production.
        </SectionHead>
        <div className="space-y-3">
          {holdout.failure_catalogue.map((f, i) => (
            <FailureCard key={i} f={f} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
