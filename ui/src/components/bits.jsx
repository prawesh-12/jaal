import { TIER_COLOR } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TierDot({ tier }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-[3px]"
      style={{ background: TIER_COLOR[tier] }}
    />
  );
}

export function TierName({ tier }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <TierDot tier={tier} />
      <span className="text-foreground">{tier}</span>
    </span>
  );
}

/* A fraction is easier to compare as a length than as four decimal places. */
export function Meter({ value, color = "var(--color-mark-2)", className }) {
  return (
    <span
      className={cn("inline-block h-1.5 w-16 shrink-0 rounded-full bg-elevated", className)}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
      />
    </span>
  );
}

/* The title of a page, once, at the top of a tab. */
export function PageHead({ title, lede, right }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {lede && (
          <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.65] text-muted-foreground">
            {lede}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function SectionHead({ title, children, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">{title}</h2>
        {children && (
          <p className="mt-1.5 max-w-[72ch] text-[13px] leading-[1.6] text-muted-foreground">
            {children}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div className="rounded-panel border border-dashed border-border px-5 py-16 text-center text-[13px] text-subtle">
      {children}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("animate-pulse rounded-panel bg-card", className)} />;
}
