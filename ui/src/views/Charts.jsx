import { useState } from "react";
import { ImageIcon, Maximize2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionHead } from "@/components/bits";

/*
  These are matplotlib output, drawn on a white canvas during the run. Framing
  them as paper rather than forcing them into the dark palette keeps it obvious
  that the page did not draw them.
*/
const CHARTS = [
  ["pr_curve.png", "Precision-recall by tier, cluster level", "One curve per adversary tier against the random-guess floor."],
  ["reliability.png", "Reliability diagram", "Does a predicted 0.80 actually mean 80 out of 100?"],
  ["cost_curve.png", "Cost against every operating point", "The same sweep as the Cost tab, drawn by the pipeline."],
  ["detection_curve.png", "Where the detector stops working", "Recall and precision as the operator gets better."],
  ["review_capacity.png", "What a bounded analyst budget buys", "Recall against how many clusters a human can actually read."],
  ["adaptive_loop.png", "An operator that adapts to its own outcomes", "Blocking falls to zero in two moves."],
  ["adaptive_visibility.png", "How much of the review queue the operator can see", "Swept from none to all."],
  ["adaptive_visibility_replicates.png", "The same sweep, repeated", "Spread across replicates, so the gap can be judged against the noise."],
];

export default function Charts() {
  const [open, setOpen] = useState(null);

  return (
    <div className="space-y-8">
      <SectionHead
        title="Charts the pipeline drew"
        right={
          <Badge>
            <ImageIcon size={12} /> matplotlib, during the run
          </Badge>
        }
      >
        Written to results/ by the pipeline itself, not by this page. If a number
        here disagrees with a number above, the pipeline is the one to trust.
      </SectionHead>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {CHARTS.map(([file, title, note]) => (
          <figure
            key={file}
            className="lift group m-0 overflow-hidden rounded-card border border-line-soft bg-surface/70"
          >
            <figcaption className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
              <div>
                <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">{title}</h3>
                <p className="mt-0.5 text-[12px] text-ink-faint">{note}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen({ file, title })}
                aria-label={`Open ${title} full size`}
                className="rounded-md border border-line-soft p-1.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Maximize2 size={13} />
              </button>
            </figcaption>
            <button
              type="button"
              onClick={() => setOpen({ file, title })}
              className="block w-full cursor-zoom-in bg-white p-2"
            >
              <img src={`/data/${file}`} alt={title} className="w-full rounded" loading="lazy" />
            </button>
          </figure>
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/85 p-6 backdrop-blur-sm"
        >
          <div className="max-h-full w-full max-w-5xl overflow-auto rounded-card border border-line bg-white p-3">
            <img src={`/data/${open.file}`} alt={open.title} className="w-full" />
          </div>
          <button
            type="button"
            aria-label="Close"
            className="absolute top-5 right-5 rounded-lg border border-line bg-surface p-2 text-ink-dim hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
