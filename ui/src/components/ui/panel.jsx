import { cn } from "@/lib/utils";

export function Panel({ className, ...props }) {
  return (
    <div
      className={cn("rounded-sm border border-line bg-surface", className)}
      {...props}
    />
  );
}

export function Note({ className, children }) {
  return (
    <p
      className={cn(
        "border-t border-line pt-4 text-[13px] leading-[1.6] text-fg-faint",
        className
      )}
    >
      {children}
    </p>
  );
}
