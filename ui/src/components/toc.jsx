import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
  A contents list that follows the reader. The active entry is decided by an
  IntersectionObserver rather than by scroll maths, so it costs nothing while
  the page is still and nothing while it moves.

  The list is a real set of links, so it works before the observer runs and
  keeps working with JavaScript throttled.
*/
export function useActiveSection(ids, offset = 140) {
  const [active, setActive] = useState(ids[0]);
  const seen = useRef(new Map());

  useEffect(() => {
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.current.set(e.target.id, e);
        // The active section is the last one whose top has passed the header.
        let current = ids[0];
        for (const id of ids) {
          const e = seen.current.get(id);
          if (e && e.boundingClientRect.top <= offset) current = id;
        }
        setActive(current);
      },
      { rootMargin: `-${offset}px 0px -55% 0px`, threshold: [0, 1] }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [ids, offset]);

  return active;
}

export function TableOfContents({ sections, active, className }) {
  return (
    <nav aria-label="On this page" className={className}>
      <p className="label mb-4">On this page</p>
      <ol className="space-y-px">
        {sections.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "interactive flex gap-3 border-l py-1.5 pl-3.5 text-[13px]",
                  on
                    ? "border-accent text-fg"
                    : "border-line text-fg-faint hover:border-line-loud hover:text-fg-muted"
                )}
              >
                <span className="tnum text-[11px] text-fg-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">{s.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/*
  A section that the contents list can point at. scroll-margin-top keeps the
  heading clear of the sticky header when a contents link jumps to it.
*/
export function Anchored({ id, title, lede, icon: Icon, children }) {
  return (
    <section id={id} className="scroll-mt-[120px] pt-16 first:pt-0">
      <h2 className="t-section flex items-center gap-3.5">
        {Icon && (
          <Icon
            size={17}
            aria-hidden="true"
            className="shrink-0 text-fg-faint"
            strokeWidth={1.5}
          />
        )}
        {title}
      </h2>
      {lede && <p className="t-body mt-3 max-w-[72ch]">{lede}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
