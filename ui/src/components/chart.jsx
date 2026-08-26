import { cn } from "@/lib/utils";

/*
  Recharts defaults collide labels with legends and draw a tick per point.
  Everything here exists to stop that: the legend is our own row above the
  plot, axis titles sit in the frame rather than inside the SVG, and tick
  density is capped by the caller.

  A chart is a section of a report, so it gets rules and space, not a card.
*/

export const axisProps = {
  stroke: "var(--color-line-strong)",
  tick: { fill: "var(--color-fg-faint)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--color-line-strong)" },
};

export const gridProps = {
  stroke: "var(--color-line)",
  strokeDasharray: "0",
  vertical: false,
};

export function ChartFrame({
  title, description, legend, xLabel, yLabel, footer, children, className,
}) {
  return (
    <figure className={cn("m-0", className)}>
      {(title || description || legend) && (
        <figcaption className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
            )}
            {description && (
              <p className={cn("max-w-[74ch] text-[13.5px] leading-[1.6] text-fg-muted",
                               title && "mt-2")}>
                {description}
              </p>
            )}
          </div>
          {legend}
        </figcaption>
      )}

      <div className="flex gap-2 border-t border-line pt-6">
        {yLabel && (
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="label [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
              {yLabel}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {xLabel && <div className="label mt-2 text-center">{xLabel}</div>}
      {footer && (
        <p className="mt-6 border-t border-line pt-4 text-[12.5px] text-fg-faint">
          {footer}
        </p>
      )}
    </figure>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-2.5 text-[12.5px] text-fg-muted">
          <span
            className="inline-block h-px w-5 shrink-0"
            style={{
              background: it.dashed
                ? `repeating-linear-gradient(to right, ${it.color} 0 4px, transparent 4px 8px)`
                : it.color,
            }}
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
    <div className="min-w-44 rounded-sm border border-line-strong bg-raised px-3 py-2.5">
      <div className="label mb-2">
        {labelPrefix}
        {label}
      </div>
      <div className="space-y-1.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-5 text-[12.5px]">
            <span className="inline-flex items-center gap-2 text-fg-muted">
              <span
                className="inline-block size-[7px] rounded-[1px]"
                style={{ background: p.color || p.stroke }}
              />
              {p.name}
            </span>
            <span className="tnum text-fg">{format ? format(p.value, p) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
  A ranked list of magnitudes. An HTML row beats an SVG bar chart here because
  the label sits outside the plot where it can never collide.
*/
export function BarList({ items, max, format, color = "var(--color-fg-faint)" }) {
  const top = max ?? Math.max(...items.map((i) => Math.abs(i.value)));
  return (
    <div className="border-t border-line">
      {items.map((it) => (
        <div
          key={it.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-line py-2.5"
        >
          <div className="grid min-w-0 grid-cols-[minmax(0,190px)_minmax(0,1fr)] items-center gap-4">
            <span className="truncate text-[13px] text-fg-muted">{it.label}</span>
            <span className="block h-1.5 w-full bg-raised">
              <span
                className="block h-full"
                style={{
                  width: `${(Math.abs(it.value) / top) * 100}%`,
                  background: it.color ?? color,
                  minWidth: 1,
                }}
              />
            </span>
          </div>
          <span className="tnum w-24 text-right text-[13px] text-fg">
            {format ? format(it.value) : it.value}
          </span>
        </div>
      ))}
    </div>
  );
}
