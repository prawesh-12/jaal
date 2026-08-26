import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchInput({ className, ...props }) {
  return (
    <label
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-card px-3",
        "focus-within:border-primary/50",
        className
      )}
    >
      <Search size={13} className="shrink-0 text-subtle" />
      <input
        className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
        {...props}
      />
    </label>
  );
}
