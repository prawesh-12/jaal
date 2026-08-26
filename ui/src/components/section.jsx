import { cn } from "@/lib/utils";

/*
  Grouping is done with rules, headings and space. A bordered box is the last
  resort, not the default, so almost nothing in here draws one.

  The rule for a box, applied everywhere: use one only when the content is a
  discrete object the reader compares against peers or acts on. A box never
  contains another box.
*/

/* The top of a page. One statement, one explanation, optional right-hand meta. */
export function PageHeader({ title, lede, meta, children }) {
  return (
    <header className="border-b border-line pb-10">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <h1 className="max-w-[20ch] text-[34px] leading-[1.08] font-medium tracking-[-0.025em] text-fg text-balance sm:text-[42px]">
            {title}
          </h1>
          {lede && (
            <p className="mt-5 max-w-[68ch] text-[15px] leading-[1.65] text-fg-muted">
              {lede}
            </p>
          )}
          {children}
        </div>
        {meta}
      </div>
    </header>
  );
}

/* A major division of a page. Separated by space, and by one hairline. */
export function Section({ title, lede, meta, children, className }) {
  return (
    <section className={cn("pt-16", className)}>
      {(title || lede) && (
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[21px] leading-tight font-medium tracking-[-0.015em] text-fg">
                {title}
              </h2>
            )}
            {lede && (
              <p className="mt-2.5 max-w-[74ch] text-[14px] leading-[1.6] text-fg-muted">
                {lede}
              </p>
            )}
          </div>
          {meta}
        </div>
      )}
      {children}
    </section>
  );
}

/* A heading one level below Section, inside it. */
export function SubHead({ title, lede, meta }) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
        {lede && (
          <p className="mt-2 max-w-[74ch] text-[13.5px] leading-[1.6] text-fg-muted">
            {lede}
          </p>
        )}
      </div>
      {meta}
    </div>
  );
}

export function Rule({ className }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

/*
  Compact metadata. Plain text, not a row of pills. Items are [label, value]
  so the pairing reads on its own; a separator between them would lead the
  line whenever the row wraps.
*/
export function Metadata({ items, className }) {
  return (
    <dl className={cn("flex flex-wrap items-baseline gap-x-8 gap-y-2.5", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="text-[12.5px] text-fg-faint">{label}</dt>
          <dd className="tnum text-[12.5px] text-fg-muted">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* A small square marker. Colour carries state; the text beside it carries the name. */
export function Status({ tone = "neutral", className }) {
  const color = {
    ok: "var(--color-ok)",
    warn: "var(--color-warn)",
    bad: "var(--color-bad)",
    info: "var(--color-info)",
    neutral: "var(--color-fg-faint)",
  }[tone];
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-[7px] shrink-0 rounded-[1px]", className)}
      style={{ background: color }}
    />
  );
}

export function Empty({ children }) {
  return (
    <p className="border-t border-line py-16 text-center text-[14px] text-fg-faint">
      {children}
    </p>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("animate-pulse bg-surface", className)} />;
}
