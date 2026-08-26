import { cn } from "@/lib/utils";

/*
  The one bordered surface in the system, and it is meant to stay rare. Use it
  only for a discrete object the reader compares against peers or acts on: one
  review note, one failure entry. A panel never contains another panel.
*/
export function Panel({ className, ...props }) {
  return (
    <div
      className={cn("rounded-sm border border-line bg-surface", className)}
      {...props}
    />
  );
}

/* A quiet strip for a caveat or a note attached to the thing above it. */
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
