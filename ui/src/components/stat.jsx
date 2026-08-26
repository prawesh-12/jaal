import { cn } from "@/lib/utils";

/*
  One number, said once, with the thing it is measured against underneath.
  The tone colours the number only. Labels stay neutral so the eye lands on
  the figure, not the caption.
*/
export function Stat({ label, value, sub, tone = "neutral", icon: Icon, className }) {
  const toneClass = {
    neutral: "text-ink",
    pos: "text-pos",
    neg: "text-neg",
    warn: "text-warn",
    accent: "text-accent",
  }[tone];

  return (
    <div
      className={cn(
        "lift group relative overflow-hidden rounded-card border border-line-soft bg-surface/70 p-4 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {Icon && (
          <Icon
            size={14}
            className="mt-0.5 shrink-0 text-ink-faint transition-colors group-hover:text-ink-dim"
          />
        )}
      </div>
      <div className={cn("num mt-2.5 text-2xl leading-none font-semibold", toneClass)}>
        {value}
      </div>
      {sub && <div className="mt-2 text-[12px] leading-snug text-ink-faint">{sub}</div>}
    </div>
  );
}

export function StatRow({ className, ...props }) {
  return (
    <div
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}
      {...props}
    />
  );
}
