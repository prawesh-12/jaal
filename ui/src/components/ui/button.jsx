import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-elevated text-foreground hover:bg-muted",
        outline:
          "border border-border-subtle bg-card text-muted-foreground hover:border-border hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
      },
      size: {
        sm: "h-7 px-2.5",
        md: "h-9 px-3.5",
        wide: "h-11 w-full px-4",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button type="button" className={cn(button({ variant, size }), className)} {...props} />;
}
