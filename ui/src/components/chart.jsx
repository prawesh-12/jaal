import { cn } from "@/lib/utils";

/*
  Recharts draws the marks; everything a reader looks at around them is ours.
  There is no library tooltip anywhere: hovering a chart lifts the active point
  into a Readout that sits in the frame, so the numbers appear in the same
  typography as the rest of the page instead of in a floating box.
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

/* A thin vertical guide, drawn by us so it matches the rest of the rules. */
export const crosshair = {
  stroke: "var(--color-line-loud)",
  strokeWidth: 1,
  strokeDasharray: "2 3",
};

export function ChartFrame({
  title, description, legend, readout, xLabel, yLabel, footer, children, className,
}) {
  return (
    <figure className={cn("m-0", className)}>
      {(title || description || legend) && (
        <figcaption className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            {title && <h3 className="t-sub">{title}</h3>}
            {description && (
              <p className={cn("t-body max-w-[74ch] text-fg-muted", title && "mt-2")}>
                {description}
              </p>
            )}
          </div>
          {legend}
        </figcaption>
      )}

      {readout}

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

/*
  The value readout. Holds its own height so the chart never jumps when the
  pointer enters, and dims to the resting message when it leaves.
*/
export function Readout({ items, resting, active }) {
  return (
    <div className="mb-6 flex min-h-[46px] flex-wrap items-baseline gap-x-9 gap-y-2 border-y border-line py-3">
      {active ? (
        items.map((it) => (
          <div key={it.label} className="flex items-baseline gap-2.5">
            {it.color && (
              <span
                aria-hidden="true"
                className="size-[7px] shrink-0 translate-y-[-1px] rounded-[1px]"
                style={{ background: it.color }}
              />
            )}
            <span className="label">{it.label}</span>
            <span className="tnum text-[14px] text-fg">{it.value}</span>
          </div>
        ))
      ) : (
        <span className="t-meta text-fg-faint">{resting}</span>
      )}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((it) => (
        <span
          key={it.label}
          className="inline-flex items-center gap-2.5 text-[12.5px] text-fg-muted"
        >
          <span
            aria-hidden="true"
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

/*
  A ranked list of magnitudes. An HTML row beats an SVG bar chart here because
  the label sits outside the plot where it can never collide, and a row can be
  hovered and selected without hit-testing a rectangle.
*/
export function BarList({
  items, max, format, color = "var(--color-fg-faint)", onHover, active, describe,
}) {
  const top = max ?? Math.max(...items.map((i) => Math.abs(i.value)));

  return (
    <div className="border-t border-line">
      {items.map((it, i) => {
        const on = active === it.label;
        return (
          <div
            key={it.label}
            onMouseEnter={() => onHover?.(it.label)}
            onMouseLeave={() => onHover?.(null)}
            className={cn(
              "interactive grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-line px-2 py-2.5",
              onHover && "cursor-default",
              on ? "bg-raised" : "hover:bg-surface"
            )}
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,190px)_minmax(0,1fr)] items-center gap-4">
              <span
                className={cn(
                  "interactive truncate text-[13px]",
                  on ? "text-fg" : "text-fg-muted"
                )}
              >
                {describe ? (
                  <>
                    <span className="tnum mr-2.5 text-fg-faint">{i + 1}</span>
                    {it.label}
                  </>
                ) : (
                  it.label
                )}
              </span>
              <span className="block h-1.5 w-full bg-raised">
                <span
                  className="block h-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${(Math.abs(it.value) / top) * 100}%`,
                    background: it.color ?? color,
                    "--d": `${i * 24}ms`,
                  }}
                />
              </span>
            </div>
            <span
              className={cn(
                "tnum interactive w-24 text-right text-[13px]",
                on ? "text-fg" : "text-fg-2"
              )}
            >
              {format ? format(it.value) : it.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
