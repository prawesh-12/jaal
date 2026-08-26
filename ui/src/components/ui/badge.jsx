import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-2/60 text-ink-dim",
        pos: "border-pos/35 bg-pos/10 text-pos",
        neg: "border-neg/35 bg-neg/10 text-neg",
        warn: "border-warn/35 bg-warn/10 text-warn",
        accent: "border-accent/35 bg-accent/10 text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({ className, tone, ...props }) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
