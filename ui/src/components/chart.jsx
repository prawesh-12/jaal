import { cn } from "@/lib/utils";

/*
  Recharts defaults collide labels with legends and draw a tick per point.
  Everything here exists to stop that: the legend is our own chips above the
  plot, the axis title sits in the frame rather than inside the SVG, and tick
  density is capped by the caller.
*/

export const axisProps = {
  stroke: "var(--color-line)",
  tick: { fill: "var(--color-ink-faint)", fontSize: 11, fontFamily: "var(--font-mono)" },
  tickLine: false,
  axisLine: { stroke: "var(--color-line)" },
};

export const gridProps = {
  stroke: "var(--color-line-soft)",
  strokeDasharray: "0",
  vertical: false,
};

export function ChartFrame({ title, description, legend, xLabel, yLabel, children, className }) {
  return (
    <figure
      className={cn(
        "lift m-0 rounded-card border border-line-soft bg-surface/70 backdrop-blur-sm",
        className
      )}
    >
      <figcaption className="border-b border-line-soft px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
            {description && (
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-dim">
                {description}
              </p>
            )}
          </div>
          {legend}
        </div>
      </figcaption>

      <div className="flex gap-2 px-4 pt-5 pb-2">
        {yLabel && (
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="eyebrow [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
              {yLabel}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {xLabel && (
        <div className="eyebrow px-5 pb-4 text-center">{xLabel}</div>
      )}
    </figure>
  );
}

export function LegendChips({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-2 text-[12px] text-ink-dim">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ChartTooltip({ active, payload, label, labelPrefix = "", format }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="lift min-w-40 rounded-lg border border-line bg-bg-deep/95 px-3 py-2 backdrop-blur">
      <div className="eyebrow mb-1.5">
        {labelPrefix}
        {label}
      </div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="inline-flex items-center gap-2 text-ink-dim">
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: p.color || p.stroke }}
              />
              {p.name}
            </span>
            <span className="num text-ink">{format ? format(p.value, p) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Keep every nth tick so the axis stays readable at any point count. */
export const everyNth = (data, key, n) =>
  data.filter((_, i) => i % n === 0).map((d) => d[key]);
