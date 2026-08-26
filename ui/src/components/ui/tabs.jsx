import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

/* Sits on the header's bottom border, so the active item cuts into the rule. */
export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn("-mb-px flex items-stretch overflow-x-auto", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex h-14 shrink-0 items-center px-3 text-[13px] font-medium whitespace-nowrap",
        "text-muted-foreground transition-colors hover:text-foreground",
        "after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-transparent",
        "data-[state=active]:text-foreground data-[state=active]:after:bg-primary",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content className={cn("fade-up outline-none", className)} {...props} />
  );
}
