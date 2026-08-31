import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Metadata, PageHeader, Section } from "@/components/section";

/*
  matplotlib output, drawn on a white canvas during the run, framed as paper
  so it stays obvious this page did not draw them.

  Paired into groups, because a masonry grid fills one column before the other
  and a reader ends up jumping between unrelated charts.
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
  ["What fewer columns cost", [
    ["field_ablation.png", "What a caller with fewer columns gets", "Six column profiles, each re-blocked, re-scored, re-clustered and refitted."],
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/92 p-6"
    >
      <div className="max-h-full w-full max-w-5xl overflow-auto border border-line-strong bg-white p-3">
        <img src={`/data/${chart.file}`} alt={chart.title} className="w-full" />
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-5 right-5 border border-line-strong bg-raised p-2 text-fg-muted hover:text-fg"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function Charts({ bare = false }) {
  const [open, setOpen] = useState(null);
  const total = GROUPS.reduce((n, [, c]) => n + c.length, 0);

  return (
    <div className={bare ? undefined : "pt-14"}>
      {!bare && (
        <PageHeader
          title="Charts the pipeline drew"
          lede="Drawn by the pipeline during the run."
        >
          <Metadata
            className="mt-8"
            items={[["Figures", total], ["Drawn by", "matplotlib, during the run"]]}
          />
        </PageHeader>
      )}

      {GROUPS.map(([heading, charts]) => (
        <Section key={heading} title={heading}>
          <div className="grid grid-cols-1 items-start gap-x-8 gap-y-12 lg:grid-cols-2">
            {charts.map(([file, title, note]) => (
              <figure key={file} className="m-0">
                <h3 className="text-[14px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-fg-muted">{note}</p>
                <button
                  type="button"
                  onClick={() => setOpen({ file, title })}
                  aria-label={`Open ${title} full size`}
                  className="mt-5 block w-full cursor-zoom-in border border-line bg-white p-2 transition-colors hover:border-line-strong"
                >
                  <img src={`/data/${file}`} alt={title} className="w-full" loading="lazy" />
                </button>
              </figure>
            ))}
          </div>
        </Section>
      ))}

      {open && <Lightbox chart={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
