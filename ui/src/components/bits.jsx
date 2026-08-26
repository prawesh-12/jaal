import { TIER_COLOR } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TierDot({ tier }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{
        background: TIER_COLOR[tier],
        boxShadow: `0 0 0 3px color-mix(in oklch, ${TIER_COLOR[tier]} 18%, transparent)`,
      }}
    />
  );
}

export function TierName({ tier }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <TierDot tier={tier} />
      <span className="text-ink">{tier}</span>
    </span>
  );
}

/* A fraction is easier to compare as a length than as four decimal places. */
export function Meter({ value, color = "var(--color-accent)", className }) {
  return (
    <span
      className={cn("inline-block h-1 w-14 shrink-0 rounded-full bg-surface-2", className)}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
      />
    </span>
  );
}

export function SectionHead({ title, children, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
        {children && (
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-dim">
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
    <div className="rounded-card border border-dashed border-line px-5 py-14 text-center text-[13px] text-ink-faint">
      {children}
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-card bg-surface/60", className)} />
  );
}
