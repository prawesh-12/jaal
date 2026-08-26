import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line-soft bg-surface/60 p-1 backdrop-blur sm:w-auto",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-dim",
        "transition-colors duration-150 outline-none",
        "hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60",
        "data-[state=active]:bg-surface-2 data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)]",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn("rise mt-7 outline-none", className)}
      {...props}
    />
  );
}
