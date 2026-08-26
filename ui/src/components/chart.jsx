import { cn } from "@/lib/utils";

/*
  Recharts defaults collide labels with legends and draw a tick per point.
  Everything here exists to stop that: the legend is our own row under the
  title, the axis title sits in the frame rather than inside the SVG, and
  tick density is capped by the caller.
*/

export const axisProps = {
  stroke: "var(--color-border)",
  tick: { fill: "var(--color-subtle)", fontSize: 11, fontFamily: "var(--font-mono)" },
  tickLine: false,
  axisLine: { stroke: "var(--color-border)" },
};

export const gridProps = {
  stroke: "var(--color-border-subtle)",
  strokeDasharray: "0",
  vertical: false,
};

export function ChartFrame({ title, description, legend, xLabel, yLabel, children, className }) {
  return (
    <figure className={cn("panel m-0", className)}>
      <figcaption className="border-b border-border-subtle px-5 py-4">
        <h3 className="text-[14.5px] font-semibold tracking-tight text-foreground">{title}</h3>
        {description && (
          <p className="mt-1.5 max-w-[72ch] text-[13px] leading-[1.6] text-muted-foreground">
            {description}
          </p>
        )}
        {legend && <div className="mt-3">{legend}</div>}
      </figcaption>

      <div className="flex gap-1 px-4 pt-5 pb-1">
        {yLabel && (
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="label [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
              {yLabel}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {xLabel && <div className="label px-5 pb-4 text-center">{xLabel}</div>}
    </figure>
  );
}

export function LegendChips({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span
          key={it.label}
          className="inline-flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span
            className="inline-block h-[3px] w-4 rounded-full"
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
    <div className="min-w-44 rounded-md border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="label mb-1.5">
        {labelPrefix}
        {label}
      </div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div
            key={p.dataKey}
            className="flex items-center justify-between gap-4 text-[12px]"
          >
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span
                className="inline-block size-1.5 rounded-[2px]"
                style={{ background: p.color || p.stroke }}
              />
              {p.name}
            </span>
            <span className="num text-foreground">{format ? format(p.value, p) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
  A ranked list of magnitudes. A plain bar chart is the right form and an HTML
  row is easier to read than an SVG one, because the label can sit outside the
  plot where it never collides.
*/
export function BarList({ items, max, format, color = "var(--color-mark-2)" }) {
  const top = max ?? Math.max(...items.map((i) => Math.abs(i.value)));
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] text-muted-foreground">{it.label}</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-elevated">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(Math.abs(it.value) / top) * 100}%`,
                  background: it.color ?? color,
                  minWidth: 2,
                }}
              />
            </div>
          </div>
          <span className="num w-20 text-right text-[12.5px] text-foreground">
            {format ? format(it.value) : it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* Keep every nth tick so the axis stays readable at any point count. */
export const everyNth = (data, key, n) =>
  data.filter((_, i) => i % n === 0).map((d) => d[key]);
