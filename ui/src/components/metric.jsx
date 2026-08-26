import { cn } from "@/lib/utils";

/*
  A metric is a label, a figure and the thing the figure is measured against.
  No box, no icon, no fill. Adjacent metrics are separated by a vertical rule,
  which is enough to group them and costs nothing.
*/

const SIZES = {
  sm: "text-[19px]",
  md: "text-[26px]",
  lg: "text-[34px]",
  hero: "text-[46px] sm:text-[58px]",
};

export function Metric({ label, value, note, tone = "plain", size = "md", className }) {
  const toneClass = {
    plain: "text-fg",
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
    muted: "text-fg-muted",
  }[tone];

  return (
    <div className={cn("min-w-0", className)}>
      <div className="label">{label}</div>
      <div
        className={cn(
          "tnum mt-3 leading-none font-medium tracking-[-0.02em]",
          SIZES[size], toneClass
        )}
      >
        {value}
      </div>
      {note && (
        <div className="mt-3 max-w-[34ch] text-[13px] leading-[1.5] text-fg-faint">
          {note}
        </div>
      )}
    </div>
  );
}

/*
  Metrics in a row, divided rather than boxed. The dividers are drawn with a
  left border on every item after the first, so they never appear at the ends.
*/
export function MetricRow({ children, columns = 4, className }) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <div
      className={cn(
        "grid gap-y-10 border-y border-line py-8",
        cols,
        "[&>*+*]:sm:border-l [&>*+*]:sm:border-line [&>*+*]:sm:pl-8",
        columns === 4 && "[&>*:nth-child(3)]:lg:border-l [&>*:nth-child(3)]:sm:border-l-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/*
  One horizontal bar. Used only where the length says something the number
  beside it does not, which in practice means showing a gap or a share.
*/
export function Bar({ value, second, color, className, height = 6 }) {
  const clamp = (v) => Math.max(0, Math.min(1, v ?? 0));
  return (
    <span
      className={cn("relative block w-full overflow-hidden bg-raised", className)}
      style={{ height, borderRadius: 1 }}
    >
      {second != null && (
        <span
          className="absolute inset-y-0 left-0 block"
          style={{ width: `${clamp(second) * 100}%`, background: color, opacity: 0.32 }}
        />
      )}
      <span
        className="absolute inset-y-0 left-0 block"
        style={{ width: `${clamp(value) * 100}%`, background: color }}
      />
    </span>
  );
}
