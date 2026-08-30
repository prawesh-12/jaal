import { cn } from "@/lib/utils";

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full min-w-[640px] border-collapse text-[13.5px]", className)}
        {...props}
      />
    </div>
  );
}

export function THead(props) {
  return <thead {...props} />;
}

/*
  `selected` marks the row a control elsewhere on the page is pointing at, for
  example the tier chosen in the header. It is a surface shift, not a colour.
*/
export function TR({ className, selected = false, ...props }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        "interactive border-b border-line last:border-b-0",
        selected ? "bg-active" : "hover:bg-surface",
        className
      )}
      {...props}
    />
  );
}

export function TH({ className, align = "right", ...props }) {
  return (
    <th
      className={cn(
        "label border-b border-line-strong px-3 py-2.5 align-bottom whitespace-nowrap first:pl-0 last:pr-0",
        align === "left" ? "text-left" : "text-right",
        className
      )}
      {...props}
    />
  );
}

/* `strong` marks the column a reader should land on first in that row. */
export function TD({ className, align = "right", numeric = true, strong = false, ...props }) {
  return (
    <td
      className={cn(
        "px-3 py-3 first:pl-0 last:pr-0",
        align === "left" ? "text-left" : "text-right",
        numeric && "tnum",
        strong ? "text-fg" : "text-fg-2",
        className
      )}
      {...props}
    />
  );
}
