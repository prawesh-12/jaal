import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return <div className={cn("panel", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("px-5 pt-5 pb-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn("text-[14.5px] font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p
      className={cn(
        "mt-1.5 max-w-[68ch] text-[13px] leading-[1.6] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn("border-t border-border-subtle px-5 py-3.5", className)}
      {...props}
    />
  );
}
