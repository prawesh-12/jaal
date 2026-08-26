import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  An expandable row. The open state is a real layout rather than a measured
  height, so the content is present and readable whether or not the transition
  runs. No rounded accordion card, and the summary stays fully readable closed.
*/
export function Disclosure({ summary, children, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={cn("border-b border-line", className)}>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="interactive group flex w-full items-start gap-4 py-5 text-left hover:bg-surface"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={cn(
              "mt-1 shrink-0 text-fg-faint transition-transform duration-200 group-hover:text-fg-muted",
              open && "rotate-90"
            )}
          />
          <span className="min-w-0 flex-1">{summary}</span>
        </button>
      </h3>

      <div id={id} className={cn("expand", open && "expand-open")} hidden={!open && undefined}>
        <div className="overflow-hidden">
          <div className="pb-6 pl-[30px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
