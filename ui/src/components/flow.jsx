import { cn } from "@/lib/utils";
import { MARK } from "@/lib/format";

/*
  Pieces the pipeline diagram is built from. Nothing here holds data. The
  numbers come from the caller, which reads them out of results/.
*/

/* A stage in the pipeline. The figure under the rule is what it produces. */
export function Stage({ index, icon: Icon, name, what, figure, unit, tone, delay = 0 }) {
  const colour = tone ?? MARK.blue;
  return (
    <div
      className="fade-up panel flex min-w-[124px] flex-1 basis-0 flex-col p-3.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span
          className="grid size-7 place-items-center rounded-md"
          style={{ background: `color-mix(in oklch, ${colour} 18%, transparent)` }}
        >
          <Icon size={15} style={{ color: colour }} />
        </span>
        <span className="num text-[11px] text-subtle">{index}</span>
      </div>
      <div className="mt-2.5 text-[13px] font-semibold text-foreground">{name}</div>
      <div className="mt-1 flex-1 text-[11.5px] leading-snug text-subtle">{what}</div>
      <div className="mt-3 border-t border-border-subtle pt-2">
        <div className="num text-[15px] leading-none text-foreground">{figure}</div>
        <div className="mt-1 text-[11px] text-subtle">{unit}</div>
      </div>
    </div>
  );
}

/* The bit of wire between two stages, with something visibly moving along it. */
export function Connector() {
  return (
    <div className="flex w-8 shrink-0 items-center justify-center">
      <svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
        <line x1="1" y1="6" x2="23" y2="6" stroke="var(--color-border)" strokeWidth="1.5" />
        <line
          x1="1" y1="6" x2="23" y2="6"
          stroke="var(--color-mark-2)" strokeWidth="1.5" strokeLinecap="round"
          className="flow-line"
        />
        <path d="M23 2.5 L29 6 L23 9.5 Z" fill="var(--color-border)" />
      </svg>
    </div>
  );
}

/*
  A funnel drawn on a log scale, because the numbers span 72 million down to
  three. The scale is named on the axis so nobody reads the lengths as linear.
*/
export function Funnel({ steps }) {
  const values = steps.map((s) => Math.max(s.value, 1));
  const top = Math.log10(Math.max(...values));

  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const width = (Math.log10(Math.max(s.value, 1)) / top) * 100;
        return (
          <div
            key={s.label}
            className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[170px_minmax(0,1fr)_150px] sm:items-center"
          >
            <span className="text-[12.5px] text-muted-foreground">{s.label}</span>
            <span className="block h-6 rounded-[4px] bg-elevated/60">
              <span
                className="grow-x block h-full rounded-[4px]"
                style={{
                  width: `${width}%`,
                  background: s.color ?? MARK.blue,
                  animationDelay: `${i * 70}ms`,
                }}
              />
            </span>
            <span className="num text-[12.5px] text-foreground sm:text-right">
              {s.display}
              {s.note && (
                <span className="ml-2 font-sans text-[11px] text-subtle">{s.note}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* One labelled box in a small schematic. */
export function Box({ children, tone, className }) {
  return (
    <div
      className={cn("rounded-md border px-3 py-2 text-center text-[12px]", className)}
      style={tone ? { borderColor: `color-mix(in oklch, ${tone} 45%, transparent)`,
                      background: `color-mix(in oklch, ${tone} 10%, transparent)` } : undefined}
    >
      {children}
    </div>
  );
}

export function Arrow() {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
      <line x1="1" y1="6" x2="18" y2="6" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="1" y1="6" x2="18" y2="6" stroke="var(--color-mark-2)"
            strokeWidth="1.5" strokeLinecap="round" className="flow-line" />
      <path d="M18 2.5 L24 6 L18 9.5 Z" fill="var(--color-border)" />
    </svg>
  );
}
