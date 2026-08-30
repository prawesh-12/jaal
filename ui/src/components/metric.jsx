import { useState } from "react";
import { cn } from "@/lib/utils";

/*
  `level` matches the interface's three levels of importance: 1 is what the
  page is about, 2 is the analysis, 3 is support.
*/
const LEVEL = {
  1: "t-result",
  2: "text-[30px] leading-none font-medium tracking-[-0.025em]",
  3: "text-[19px] leading-none font-medium tracking-[-0.015em]",
};

export function Metric({
  label, value, note, detail, tone = "plain", level = 2, className,
}) {
  const [open, setOpen] = useState(false);

  const toneClass = {
    plain: "text-fg",
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
    quiet: "text-fg-muted",
  }[tone];

  const Wrapper = detail ? "button" : "div";
  const wrapperProps = detail
    ? {
        type: "button",
        onClick: () => setOpen((v) => !v),
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
        "aria-expanded": open,
        className: "group block w-full min-w-0 text-left",
      }
    : { className: "min-w-0" };

  return (
    <Wrapper {...wrapperProps} className={cn(wrapperProps.className, className)}>
      <div
        className={cn(
          "label interactive",
          detail && "group-hover:text-fg-muted"
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "tnum interactive mt-3.5",
          LEVEL[level], toneClass,
          detail && "group-hover:text-fg"
        )}
      >
        {value}
      </div>
      {note && (
        <div className="t-meta mt-3 max-w-[36ch] text-fg-faint">{note}</div>
      )}

      {detail && (
        <div className={cn("expand", open && "expand-open")}>
          <div className="overflow-hidden">
            <span className="mt-3 block max-w-[38ch] border-t border-line pt-3 text-[12.5px] leading-[1.6] text-fg-muted">
              {detail}
            </span>
          </div>
        </div>
      )}
    </Wrapper>
  );
}

export function MetricRow({ children, columns = 4, className }) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <div
      className={cn(
        "grid items-start gap-y-10 border-y border-line-strong py-9",
        cols,
        "[&>*+*]:sm:border-l [&>*+*]:sm:border-line [&>*+*]:sm:pl-8",
        columns === 4 && "[&>*:nth-child(3)]:lg:border-l [&>*:nth-child(3)]:sm:border-l-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Bar({ value, second, color, className, height = 6 }) {
  const clamp = (v) => `${Math.max(0, Math.min(1, v ?? 0)) * 100}%`;
  return (
    <span
      className={cn("relative block w-full overflow-hidden bg-raised", className)}
      style={{ height, borderRadius: 1 }}
    >
      {second != null && (
        <span
          className="absolute inset-y-0 left-0 block transition-[width] duration-500 ease-out"
          style={{ width: clamp(second), background: color, opacity: 0.34 }}
        />
      )}
      <span
        className="absolute inset-y-0 left-0 block transition-[width] duration-500 ease-out"
        style={{ width: clamp(value), background: color }}
      />
    </span>
  );
}
