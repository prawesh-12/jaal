import { cn } from "@/lib/utils";

/*
  Pieces the pipeline diagrams are built from. Nothing here holds data; the
  numbers come from the caller, which reads them out of results/.

  Connectors are thin, static and neutral. A diagram that animates is a diagram
  a reader watches instead of reads.
*/

/* One stage. Numbered, ruled, and open on three sides rather than boxed. */
export function Stage({ index, name, what, figure, unit }) {
  return (
    <div className="flex min-w-[132px] flex-1 basis-0 flex-col border-t border-line-strong pt-3 pr-5">
      <div className="tnum text-[11px] text-fg-faint">
        {String(index).padStart(2, "0")}
      </div>
      <div className="mt-2 text-[13.5px] font-medium tracking-[-0.01em] text-fg">
        {name}
      </div>
      <div className="mt-1.5 flex-1 text-[12px] leading-[1.45] text-fg-faint">{what}</div>
      <div className="tnum mt-4 text-[15px] leading-none text-fg">{figure}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-fg-faint">{unit}</div>
    </div>
  );
}

/* The wire between two stages. One hairline and a small head. */
export function Connector({ className }) {
  return (
    <div className={cn("flex w-6 shrink-0 items-start pt-3", className)}>
      <svg width="24" height="9" viewBox="0 0 24 9" aria-hidden="true">
        <line x1="0" y1="4.5" x2="17" y2="4.5" stroke="var(--color-line-strong)" strokeWidth="1" />
        <path d="M17 1.5 L22 4.5 L17 7.5 Z" fill="var(--color-line-strong)" />
      </svg>
    </div>
  );
}

/*
  A funnel drawn on a log scale, because the numbers span 72 million down to a
  few thousand. The scale is named beside it so nobody reads the lengths as
  linear. One accent, not one colour per bar.
*/
export function Funnel({ steps, color = "var(--color-fg-faint)" }) {
  const top = Math.log10(Math.max(...steps.map((s) => Math.max(s.value, 1))));

  return (
    <div className="border-t border-line">
      {steps.map((s) => {
        const width = (Math.log10(Math.max(s.value, 1)) / top) * 100;
        return (
          <div
            key={s.label}
            className="grid items-center gap-x-6 gap-y-2 border-b border-line py-3.5 sm:grid-cols-[210px_minmax(0,1fr)_210px]"
          >
            <span className="text-[13px] text-fg-muted">{s.label}</span>
            <span className="block h-2.5 w-full bg-raised">
              <span
                className="block h-full"
                style={{ width: `${width}%`, background: s.color ?? color }}
              />
            </span>
            <span className="tnum text-[13px] text-fg sm:text-right">
              {s.display}
              {s.note && <span className="ml-3 text-[12px] text-fg-faint">{s.note}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* A labelled node in a small schematic. */
export function Node({ children, className, emphasis = false }) {
  return (
    <div
      className={cn(
        "rounded-[3px] border px-3 py-2 text-center text-[12.5px] whitespace-nowrap",
        emphasis
          ? "border-line-strong bg-raised text-fg"
          : "border-line bg-surface text-fg-muted",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Arrow({ className }) {
  return (
    <svg width="22" height="9" viewBox="0 0 22 9" aria-hidden="true" className={className}>
      <line x1="0" y1="4.5" x2="15" y2="4.5" stroke="var(--color-line-strong)" strokeWidth="1" />
      <path d="M15 1.5 L20 4.5 L15 7.5 Z" fill="var(--color-line-strong)" />
    </svg>
  );
}
