import { cn } from "@/lib/utils";

/*
  A table is the content, not something inside a container. Thin row rules,
  compact uppercase headers, numbers right aligned and tabular so the decimal
  columns line up. No outer border, no radius.
*/

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

export function TR({ className, ...props }) {
  return (
    <tr
      className={cn(
        "border-b border-line transition-colors last:border-b-0 hover:bg-surface/70",
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

export function TD({ className, align = "right", numeric = true, ...props }) {
  return (
    <td
      className={cn(
        "px-3 py-3 first:pl-0 last:pr-0",
        align === "left" ? "text-left" : "text-right",
        numeric && "tnum",
        className
      )}
      {...props}
    />
  );
}
