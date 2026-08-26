import { cn } from "@/lib/utils";

/*
  One number, said once, with the thing it is measured against underneath.
  The tone colours the figure only. Labels stay neutral so the eye lands on
  the number and not the caption.
*/
export function Stat({ label, value, sub, tone = "neutral", className }) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-positive",
    negative: "text-negative",
    caution: "text-caution",
  }[tone];

  return (
    <div className={cn("panel px-4 py-3.5", className)}>
      <div className="label">{label}</div>
      <div className={cn("num mt-2 text-[26px] leading-none font-semibold", toneClass)}>
        {value}
      </div>
      {sub && (
        <div className="mt-2 text-[12px] leading-snug text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

export function StatRow({ className, ...props }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)} {...props} />
  );
}
