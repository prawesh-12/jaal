
import { cn } from "@/lib/utils";

/*
  Log scale, because the values span 72 million down to three. The scale is
  named so nobody reads the lengths as linear.
*/
export function ScaleRail({ stages, activeId, onSelect }) {
  /*
    How many things exist at each point in the pipeline. Only counts appear
    here: a stage whose output is a threshold in bits or a Brier score has no
    volume of its own and sits this out, and a stage that receives a volume
    nothing else published contributes that too.
  */
  const rows = [];
  for (const s of stages) {
    if (!s.rail) continue;
    if (s.rail.from) {
      rows.push({
        id: `${s.id}-in`, stageId: s.id, note: `into ${s.name}`,
        value: s.rail.from.value, display: s.rail.from.display,
        label: s.rail.from.label,
      });
    }
    rows.push({
      id: s.id, stageId: s.id, note: s.name,
      value: Math.max(s.rail.value, 1), display: s.rail.display,
      label: s.rail.label,
    });
  }

  const top = Math.log10(Math.max(...rows.map((r) => Math.max(r.value, 1))));

  return (
    <div className="border-t border-line">
      {rows.map((r, i) => {
        const on = r.stageId === activeId;
        const width = (Math.log10(Math.max(r.value, 1)) / top) * 100;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect?.(r.stageId)}
            className={cn(
              "interactive grid w-full items-center gap-x-6 gap-y-1 border-b border-line px-2 py-3 text-left sm:grid-cols-[190px_minmax(0,1fr)_210px]",
              on ? "bg-active" : "hover:bg-surface"
            )}
          >
            <span className={cn("text-[13px]", on ? "text-fg" : "text-fg-muted")}>
              {r.note}
            </span>
            <span className="block h-2.5 w-full bg-raised">
              <span
                className="block h-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${width}%`,
                  background: on ? "var(--color-accent)" : "var(--color-fg-dim)",
                  "--d": `${i * 40}ms`,
                }}
              />
            </span>
            <span className="sm:text-right">
              <span className={cn("tnum text-[13.5px]", on ? "text-fg" : "text-fg-2")}>
                {r.display}
              </span>
              <span className="ml-3 text-[12px] text-fg-faint">{r.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
