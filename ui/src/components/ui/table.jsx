import { cn } from "@/lib/utils";

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-[13px]", className)}
        {...props}
      />
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
        "border-b border-line-soft last:border-0 transition-colors hover:bg-surface-2/40",
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
        "eyebrow border-b border-line px-3 py-2.5 font-medium",
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
