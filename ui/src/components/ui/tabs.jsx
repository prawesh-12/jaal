import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

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
        "relative inline-flex h-[52px] shrink-0 items-center px-3.5 text-[13.5px] whitespace-nowrap",
        "text-fg-faint transition-colors duration-150 hover:text-fg-muted",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-transparent",
        "data-[state=active]:text-fg data-[state=active]:after:bg-accent",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn("enter outline-none", className)} {...props} />;
}
