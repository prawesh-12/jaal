import { useState } from "react";
import { bitsFor, SCORED } from "@/lib/pipelineStages";
import { dp2 } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
  Every weight here is measured. Level indices into params.levels, and every
  preset total was checked against results/link_params.json before it was
  written here.

  Two modes. Pass `initial` and the reader picks the agreements. Pass `levels`
  and the caller owns them, which is how the simulation drives it from a tier.
*/
export const PRESETS = {
  "a ring, same phone": {
    device: 0, pincode: 0, card_bin: 0, signup_gap: 0, hour_of_day: 0,
    order_count: 0, coupon_used: 0,
  },
  "a ring, phones rotated": {
    pincode: 0, card_bin: 0, signup_gap: 2, hour_of_day: 1,
    order_count: 0, coupon_used: 0,
  },
  flatmates: {
    address: 0, pincode: 0, ip_prefix: 0, order_count: 1, coupon_used: 1,
  },
  "two strangers": {},
};

export function PairScorer({
  params, threshold, initial, levels: fixed, showPresets = false, verdict,
}) {
  const [picked, setPicked] = useState(initial ?? {});
  const levels = fixed ?? picked;
  const readOnly = !!fixed;

  const rows = SCORED.map((field) => {
    const chosen = levels[field] ?? params.levels[field].length - 1;
    return {
      field,
      chosen,
      options: params.levels[field].map((name, i) => ({
        name, i, bits: bitsFor(params, field, i),
      })),
    };
  });

  const total = rows.reduce((sum, r) => sum + r.options[r.chosen].bits, 0);
  const edge = total >= threshold;
  const floor = rows.reduce((s, r) => s + r.options[r.options.length - 1].bits, 0);
  const ceiling = rows.reduce((s, r) => s + Math.max(...r.options.map((o) => o.bits)), 0);
  const at = (v) => ((v - floor) / (ceiling - floor)) * 100;

  return (
    <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div className="border-t border-line">
          {rows.map((r) => {
            const bits = r.options[r.chosen].bits;
            return (
              <div
                key={r.field}
                className="interactive grid grid-cols-[116px_minmax(0,1fr)_74px] items-center gap-4 border-b border-line px-2 py-2 hover:bg-surface"
              >
                <span className="ident truncate text-[12.5px] text-fg-muted">{r.field}</span>
                <div className="flex flex-wrap gap-px">
                  {r.options.map((o) => {
                    const on = r.chosen === o.i;
                    const cls = cn(
                      "border px-2 py-0.5 text-[11.5px]",
                      on ? "border-line-loud bg-active text-fg" : "border-transparent text-fg-faint"
                    );
                    return readOnly ? (
                      <span key={o.name} className={cn(cls, !on && "opacity-45")}>
                        {o.name}
                      </span>
                    ) : (
                      <button
                        key={o.name}
                        type="button"
                        onClick={() => setPicked((s) => ({ ...s, [r.field]: o.i }))}
                        aria-pressed={on}
                        className={cn("interactive", cls, !on && "hover:bg-raised hover:text-fg-muted")}
                      >
                        {o.name}
                      </button>
                    );
                  })}
                </div>
                <span
                  className={cn("tnum text-right text-[12.5px]",
                                bits > 0 ? "text-fg" : "text-fg-faint")}
                >
                  {bits >= 0 ? "+" : ""}{bits.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {showPresets && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="label">Try</span>
            {Object.entries(PRESETS).map(([name, preset]) => (
              <button
                key={name}
                type="button"
                onClick={() => setPicked(preset)}
                className="interactive border-b border-line-strong pb-0.5 text-[12.5px] text-fg-muted hover:border-accent hover:text-fg"
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="self-start border-t border-line-loud pt-5">
        <div className="label">Total evidence</div>
        <div
          className={cn("tnum mt-3.5 text-[38px] leading-none font-medium tracking-[-0.03em]",
                        edge ? "text-fg" : "text-fg-faint")}
        >
          {total >= 0 ? "+" : ""}{total.toFixed(2)}
          <span className="ml-2 text-[14px] font-normal text-fg-faint">bits</span>
        </div>

        <div className="relative mt-6 h-2 bg-raised">
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${Math.max(0, Math.min(100, at(total)))}%`,
              background: edge ? "var(--color-ok)" : "var(--color-fg-dim)",
            }}
          />
          <div className="absolute inset-y-[-4px] w-px bg-accent"
               style={{ left: `${at(threshold)}%` }} />
        </div>
        <div className="mt-2.5 flex justify-between text-[11.5px] text-fg-faint">
          <span className="tnum">{floor.toFixed(0)}</span>
          <span className="tnum text-fg-2">edge at {dp2(threshold)}</span>
          <span className="tnum">+{ceiling.toFixed(0)}</span>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[13px] leading-[1.6] text-fg-2">
          {verdict ?? (edge
            ? "These two accounts get an edge. The graph will treat them as one operator."
            : "No edge. These two accounts are never compared again.")}
        </p>
      </div>
    </div>
  );
}
