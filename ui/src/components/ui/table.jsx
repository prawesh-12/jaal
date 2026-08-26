import { cn } from "@/lib/utils";

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }) {
  return <thead className={cn("", className)} {...props} />;
}

export function TR({ className, ...props }) {
  return (
    <tr
      className={cn(
        "border-b border-border-subtle transition-colors last:border-0 hover:bg-muted/35",
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
        "border-b border-border px-3 py-2.5 text-[12px] font-medium text-subtle",
        align === "left" ? "text-left" : "text-right",
        className
      )}
      {...props}
    />
  );
}

export function TD({ className, align = "right", mono = true, ...props }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5",
        align === "left" ? "text-left" : "text-right",
        mono && "num",
        className
      )}
      {...props}
    />
  );
}
