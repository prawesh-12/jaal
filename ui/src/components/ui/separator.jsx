import { cn } from "@/lib/utils";

export function Separator({ className, vertical = false, ...props }) {
  return (
    <div
      role="separator"
      className={cn(
        "shrink-0 bg-border-subtle",
        vertical ? "h-5 w-px" : "h-px w-full",
        className
      )}
      {...props}
    />
  );
}
