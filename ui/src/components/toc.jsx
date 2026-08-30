import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function useActiveSection(ids, offset = 140) {
  const [active, setActive] = useState(ids[0]);
  const seen = useRef(new Map());

  useEffect(() => {
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;

    const pick = () => {
      let current = ids[0];
      for (const id of ids) {
        const e = seen.current.get(id);
        if (e && e.top <= offset) current = id;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          seen.current.set(e.target.id, { top: e.boundingClientRect.top });
        }
        pick();
      },
      { rootMargin: `-${offset}px 0px -55% 0px`, threshold: [0, 1] }
    );
    nodes.forEach((n) => observer.observe(n));

    // The observer only fires on a crossing, so a plain scroll inside one long
    // section would leave the list stale. This keeps it honest.
    const onScroll = () => {
      for (const n of nodes) {
        seen.current.set(n.id, { top: n.getBoundingClientRect().top });
      }
      pick();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids, offset]);

  return active;
}

export function TableOfContents({ sections, active, className }) {
  const go = useCallback((e, id) => {
    // Never let the hash change: the app routes on it.
    e.preventDefault();
    const node = document.getElementById(id);
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <nav aria-label="On this page" className={className}>
      <p className="label mb-4 hidden md:block">On this page</p>

      <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:block md:space-y-px md:overflow-visible md:px-0">
        {sections.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="shrink-0 md:shrink">
              <a
                href={`#${s.id}`}
                onClick={(e) => go(e, s.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "interactive flex items-center gap-2.5 whitespace-nowrap md:gap-3 md:whitespace-normal",
                  "border-b px-2.5 py-2 text-[13px] md:border-b-0 md:border-l md:py-1.5 md:pr-0 md:pl-3.5",
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
  A section the contents list can point at. scroll-margin-top keeps the heading
  clear of the sticky header when a contents entry jumps to it.
*/
export function Anchored({ id, title, lede, icon: Icon, children }) {
  return (
    <section id={id} className="scroll-mt-[120px] pt-16 first:pt-0">
      <h2 className="t-section flex items-center gap-3.5">
        {Icon && (
          <Icon size={17} aria-hidden="true" strokeWidth={1.5}
                className="shrink-0 text-fg-faint" />
        )}
        {title}
      </h2>
      {lede && <p className="t-body mt-3 max-w-[68ch]">{lede}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
