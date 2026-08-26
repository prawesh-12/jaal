import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/bits";

/*
  These are matplotlib output, drawn on a white canvas during the run. Framing
  them as paper rather than forcing them into the dark palette keeps it obvious
  that the page did not draw them.
*/
/*
  Paired into groups, because a plain masonry grid fills one column before the
  other and a reader ends up jumping between unrelated charts.
*/
const GROUPS = [
  ["Is the model any good", [
    ["pr_curve.png", "Precision-recall by tier, cluster level", "One curve per adversary tier against the random-guess floor."],
    ["reliability.png", "Reliability diagram", "Does a predicted 0.80 actually mean 80 out of 100?"],
  ]],
  ["What it costs to act on it", [
    ["cost_curve.png", "Cost against every operating point", "The same sweep as the Cost tab, drawn by the pipeline."],
    ["review_capacity.png", "What a bounded analyst budget buys", "Recall against how many clusters a human can actually read."],
  ]],
  ["Where it stops working", [
    ["detection_curve.png", "Where the detector stops working", "Recall and precision as the operator gets better."],
    ["adaptive_loop.png", "An operator that adapts to its own outcomes", "Blocking falls to zero in two moves."],
  ]],
  ["What the operator can see", [
    ["adaptive_visibility.png", "How much of the review queue the operator can see", "Swept from none to all."],
    ["adaptive_visibility_replicates.png", "The same sweep, repeated", "Spread across replicates, so the gap can be judged against the noise."],
  ]],
];

function Lightbox({ chart, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={chart.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur-sm"
    >
      <div className="max-h-full w-full max-w-5xl overflow-auto rounded-panel bg-white p-3">
        <img src={`/data/${chart.file}`} alt={chart.title} className="w-full" />
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-5 right-5 rounded-md border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function Charts() {
  const [open, setOpen] = useState(null);

  return (
    <div className="space-y-10">
      <PageHead
        title="Charts the pipeline drew"
        lede="Written to results/ by the pipeline itself, not by this page. If a number here disagrees with a number elsewhere on the site, the pipeline is the one to trust."
        right={<Badge tone="outline">matplotlib, during the run</Badge>}
      />

      {GROUPS.map(([heading, charts]) => (
        <section key={heading}>
          <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-foreground">
            {heading}
          </h2>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {charts.map(([file, title, note]) => (
              <figure key={file} className="panel m-0 overflow-hidden">
                <figcaption className="border-b border-border-subtle px-4 py-3.5">
                  <h3 className="text-[13.5px] font-semibold tracking-tight text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">{note}</p>
                </figcaption>
                <button
                  type="button"
                  onClick={() => setOpen({ file, title })}
                  aria-label={`Open ${title} full size`}
                  className="block w-full cursor-zoom-in bg-white p-2"
                >
                  <img src={`/data/${file}`} alt={title} className="w-full" loading="lazy" />
                </button>
              </figure>
            ))}
          </div>
        </section>
      ))}

      {open && <Lightbox chart={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
