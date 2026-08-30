import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Note } from "@/components/ui/panel";
import { Disclosure } from "@/components/disclosure";
import { Empty, Section, Skeleton, Status, SubHead } from "@/components/section";
import {
  ChartFrame, Legend, Readout, axisProps, crosshair, gridProps,
} from "@/components/chart";
import { useJson } from "@/lib/useJson";
import { TIERS, count, dp4, isUndefinedPrecision } from "@/lib/format";
import { cn } from "@/lib/utils";

const TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/* Where blocking recall falls away, taken from the curve itself, not guessed. */
function deadZoneStart(curve) {
  const hit = curve.find((c) => c.recall < 0.05);
  return hit ? hit.sophistication : null;
}

function FailureEntry({ f, index }) {
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
        <dl className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          <div>
            <dt className="label">Why it happens</dt>
            <dd className="mt-2.5 text-[13px] leading-[1.65] text-fg-muted">{f.why}</dd>
          </div>
          <div>
            <dt className="label">What it costs</dt>
            <dd className="mt-2.5 text-[13px] leading-[1.65] text-fg-muted">{f.cost}</dd>
          </div>
        </dl>
      </div>
    </Disclosure>
  );
}

/* Answers: which signals survive an operator that adapts? Straight out of the
   per-tier blocking recall, so it is measured rather than argued. */
function SignalDecay({ blocking }) {
  const rows = blocking.rules.map((rule) => ({
    rule,
    by: TIERS.map((t) => blocking.tiers[t].recall_by_rule[rule]),
  }));
  // Tailwind cannot see a class built from a template string, so the colour
  // is looked up rather than interpolated.
  const VERDICT = {
    holds: { tone: "ok", text: "text-ok" },
    collapses: { tone: "bad", text: "text-bad" },
    "weak throughout": { tone: "warn", text: "text-warn" },
  };
  const verdict = (by) => {
    const last = by[by.length - 1];
    if (last >= 0.5) return "holds";
    if (by[0] >= 0.5) return "collapses";
    return "weak throughout";
  };

  return (
    <div className="border-t border-line-strong">
      <div className="hidden grid-cols-[150px_minmax(0,1fr)_140px] gap-6 border-b border-line px-2 pb-2.5 sm:grid">
        <span className="label">Blocking rule</span>
        <span className="label">{TIERS.join("  →  ")}</span>
        <span className="label text-right">Against adaptive</span>
      </div>
      {rows.map((r) => {
        const word = verdict(r.by);
        const { tone, text } = VERDICT[word];
        return (
          <div
            key={r.rule}
            className="grid items-center gap-x-6 gap-y-3 border-b border-line px-2 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)_140px]"
          >
            <span className="ident text-[12.5px] text-fg-muted">{r.rule}</span>
            <span className="flex items-end gap-1.5">
              {r.by.map((v, i) => (
                <span key={i} className="flex-1">
                  <span className="block h-8 w-full bg-raised">
                    <span
                      className="block w-full origin-bottom bg-fg-dim"
                      style={{
                        height: `${Math.max(v, 0.02) * 100}%`,
                        marginTop: `${(1 - Math.max(v, 0.02)) * 100}%`,
                        background: i === TIERS.length - 1
                          ? `var(--color-${tone})` : "var(--color-fg-dim)",
                      }}
                    />
                  </span>
                  <span className="tnum mt-1.5 block text-center text-[10.5px] text-fg-faint">
                    {v.toFixed(2)}
                  </span>
                </span>
              ))}
            </span>
            <span className={cn("text-[12.5px] sm:text-right", text)}>{word}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Answers: which single change actually hurts? One knob moved at a time. */
function OneChangeAtATime({ mechanism }) {
  const entries = Object.entries(mechanism.configs);
  const base = mechanism.configs.ordinary;

  return (
    <div className="border-t border-line-strong">
      {entries.map(([name, cfg]) => {
        const isBase = name === "ordinary";
        return (
          <div
            key={name}
            className={cn(
              "grid items-center gap-x-6 gap-y-2 border-b border-line px-2 py-3.5 sm:grid-cols-[minmax(0,210px)_120px_minmax(0,1fr)_110px]",
              isBase && "bg-surface"
            )}
          >
            <span className={cn("text-[13px]", isBase ? "text-fg" : "text-fg-muted")}>
              {name}
            </span>
            <span className={cn("tnum text-[13px]", cfg.recall_blocked > 0 ? "text-fg" : "text-fg-dim")}>
              {dp4(cfg.recall_blocked)}
              <span className="ml-2 text-[11px] text-fg-faint">blocked</span>
            </span>
            <span className="block h-2 w-full bg-raised">
              <span
                className="block h-full"
                style={{
                  width: `${cfg.recall_including_review * 100}%`,
                  background: isBase ? "var(--color-accent)" : "var(--color-fg-dim)",
                }}
              />
            </span>
            <span className="tnum text-[13px] text-fg-2 sm:text-right">
              {dp4(cfg.recall_including_review)}
            </span>
          </div>
        );
      })}
      <p className="t-meta mt-5 max-w-[80ch]">
        Bar and right-hand figure are recall including review, against{" "}
        {dp4(base.recall_including_review)} for an ordinary operator. Rotating
        devices alone changes it by {base.recall_including_review > 0 ? "" : ""}
        {dp4(Math.abs(mechanism.configs["devices rotated only"].change_vs_ordinary))}.
        Rotating addresses alone kills blocking outright. Every one of these was
        run over {count(mechanism.n_worlds)} worlds.
      </p>
    </div>
  );
}

function Lookalikes({ stress }) {
  const kinds = Object.entries(stress.by_kind).sort((a, b) => b[1].clusters - a[1].clusters);
  return (
    <Section
      title="Groups that look like rings but are not"
      lede={`${count(stress.worlds)} worlds containing no rings at all, ${count(stress.n_accounts)} accounts. Families share an address. Flatmates share a device. Hostels share both.`}
    >
      <div className="grid border-y border-line-strong sm:grid-cols-3 lg:grid-cols-5">
        {kinds.map(([kind, k], i) => (
          <div
            key={kind}
            className={cn("interactive px-5 py-7 first:pl-0 last:pr-0 hover:bg-surface",
                          i > 0 && "sm:border-l sm:border-line")}
          >
            <div className="label">{kind}</div>
            <div className="tnum mt-3.5 text-[26px] leading-none font-medium text-fg">
              {count(k.clusters)}
            </div>
            <div className="mt-3 text-[12.5px] text-fg-faint">
              clusters · <span className="tnum text-fg-2">{k.wrongly_blocked}</span> blocked
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
  const blocking = useJson("blocking");
  const mechanism = useJson("adaptive_mechanism");
  const [hover, setHover] = useState(null);

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
  const a = hover != null ? curve[hover] : null;
  const last = curve[curve.length - 1];

  return (
    <div className="pt-14">
      <header className="pb-10">
        <div className="label">Measured, not caveated</div>
        <h1 className="mt-5 max-w-[24ch] text-[38px] leading-[1.08] font-medium tracking-[-0.03em] text-fg text-balance sm:text-[44px]">
          A sufficiently adaptive operator defeats automatic blocking.
        </h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.55] text-fg-2">
          Blocking fails first. The review queue survives longer. Both halves of
          that sentence are swept and plotted below.
        </p>
      </header>

      <div className="grid gap-x-16 gap-y-10 border-y border-line-strong py-12 sm:grid-cols-3">
        <div>
          <div className="label">Blocking stops contributing at</div>
          <div className="tnum mt-4 text-[52px] leading-none font-medium tracking-[-0.035em] text-warn">
            {dead !== null ? dead.toFixed(2) : "n/a"}
          </div>
          <p className="t-meta mt-4 max-w-[30ch]">
            operator sophistication, 0 is the obvious tier and 1 is the adaptive
            one
          </p>
        </div>
        <div className="sm:border-l sm:border-line sm:pl-16">
          <div className="label">Blocked recall at sophistication 1.0</div>
          <div className="tnum mt-4 text-[52px] leading-none font-medium tracking-[-0.035em] text-bad">
            {dp4(last.blocked)}
          </div>
          <p className="t-meta mt-4 max-w-[30ch]">
            nothing is blocked, and precision there is undefined rather than zero
          </p>
        </div>
        <div className="sm:border-l sm:border-line sm:pl-16">
          <div className="label">Blocked or reviewed, same point</div>
          <div className="tnum mt-4 text-[52px] leading-none font-medium tracking-[-0.035em] text-ok">
            {dp4(last.withReview)}
          </div>
          <p className="t-meta mt-4 max-w-[30ch]">
            the queue still puts most of the ring in front of a person
          </p>
        </div>
      </div>

      <Section
        title="Recall as the operator gets better"
        lede="Sophistication swept end to end. Move across the chart to read any point."
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
                { label: "Blocking", value: a.blocked < 0.05 ? "finished" : "still contributing" },
              ] : []}
            />
          }
          xLabel="operator sophistication"
          yLabel="rate"
          footer={dead !== null
            ? `Past ${dead.toFixed(2)} the blocked line is under 0.05, so blocking has stopped contributing and only the review queue is still working.`
            : undefined}
        >
          <ResponsiveContainer width="100%" height={340}>
            <LineChart
              data={curve}
              margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              onMouseMove={(s) => setHover(s?.isTooltipActive ? s.activeTooltipIndex ?? null : null)}
              onMouseLeave={() => setHover(null)}
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
              <Line type="monotone" dataKey="withReview" stroke="var(--color-ok)"
                    strokeWidth={1.5} dot={false} isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: "var(--color-ok)", stroke: "var(--color-base)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="blocked" stroke="var(--color-info)"
                    strokeWidth={1.5} dot={false} isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: "var(--color-info)", stroke: "var(--color-base)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="precision" stroke="var(--color-warn)"
                    strokeWidth={1.5} strokeDasharray="4 3" dot={false}
                    isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Section>

      <Section title="Why it fails, in detail" lede="Open what you want to check.">
        <div className="border-t border-line-strong">
          {blocking.data && (
            <Disclosure
              summary={
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[14.5px] text-fg">
                    What survives an operator who adapts
                  </span>
                  <span className="t-meta ml-auto text-fg-faint">
                    six blocking rules against four tiers
                  </span>
                </span>
              }
            >
              <div className="-ml-[30px]">
                <p className="t-meta mb-6 max-w-[76ch]">
                  Device and address are perfect against a careless operator and
                  worthless against a careful one. The rules built on pincode and
                  card BIN are the ones still standing.
                </p>
                <SignalDecay blocking={blocking.data} />
              </div>
            </Disclosure>
          )}

          {mechanism.data && (
            <Disclosure
              summary={
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[14.5px] text-fg">
                    Which single evasion actually pays
                  </span>
                  <span className="t-meta ml-auto text-fg-faint">
                    one knob at a time, {count(mechanism.data.n_worlds)} worlds each
                  </span>
                </span>
              }
            >
              <div className="-ml-[30px]">
                <OneChangeAtATime mechanism={mechanism.data} />
              </div>
            </Disclosure>
          )}
        </div>
      </Section>

      {holdout.lookalike_stress && <Lookalikes stress={holdout.lookalike_stress} />}

      <Section
        title="Failure catalogue"
        lede="Every way this system is known to fail, each with a real cluster from a real seed. Open one for why it happens and what it costs."
        meta={
          <span className="inline-flex items-center gap-2.5 text-[12.5px] text-fg-muted">
            <Status tone="bad" />
            {holdout.failure_catalogue.length} known
          </span>
        }
      >
        <div className="border-t border-line-strong">
          {holdout.failure_catalogue.map((f, i) => (
            <FailureEntry key={f.failure} f={f} index={i} />
          ))}
        </div>
      </Section>
    </div>
  );
}
