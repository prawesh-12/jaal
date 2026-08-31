import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Empty, Skeleton } from "@/components/section";
import { Population } from "@/three/Population";
import { useJson } from "@/lib/useJson";
import { compactRupees, count, pct } from "@/lib/format";

const RUN_MS = 17000;

/* One line per phase of the scene, so the caption is the scene's own state. */
const CAPTIONS = [
  [0.00, "12,000 accounts. One order each, one coupon each, nothing out of place."],
  [0.14, "Closer in, on one neighbourhood of that population."],
  [0.30, "Every field two accounts agree on is worth bits. Weak agreements accumulate."],
  [0.62, "One group is bound together. The rest of the neighbourhood is not."],
  [0.78, "Two models score it, three actions are priced, and the cheapest one wins."],
];

function captionFor(p) {
  let at = CAPTIONS[0][1];
  for (const [from, line] of CAPTIONS) if (p >= from) at = line;
  return at;
}

function useRunOnce(ms) {
  const [phase, setPhase] = useState(0);
  const start = useRef(null);

  useEffect(() => {
    let frame = 0;
    const tick = (now) => {
      if (start.current === null) start.current = now;
      const p = Math.min(1, (now - start.current) / ms);
      setPhase(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ms]);

  return phase;
}

export default function Overview({ holdout, loading, onSimulate }) {
  const scene = useJson("overview_scene");
  const phase = useRunOnce(RUN_MS);

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const pooled = holdout.pooled;

  return (
    <div>
      <header className="grid items-end gap-x-16 gap-y-6 pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <h1 className="t-hero max-w-[16ch] text-balance">
          Finding the fraud between transactions, not inside them.
        </h1>
        <p className="max-w-[46ch] text-[16px] leading-[1.6] text-fg-muted lg:pb-2">
          One operator, fifty accounts, fifty ordinary first orders. Jaal scores
          the relationships between accounts, not the accounts, and decides on
          the group.
        </p>
      </header>

      <div className="mt-9 h-[min(46vh,410px)] w-full">
        {scene.data
          ? <Population scene={scene.data} phase={phase} className="h-full w-full" />
          : <div className="h-full w-full animate-pulse bg-surface" />}
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <p className="max-w-[82ch] text-[14.5px] leading-[1.6] text-fg-2">
          {captionFor(phase)}
        </p>
      </div>

      <div className="mt-11 grid gap-px border-t border-line-strong bg-line sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-base py-9 pr-10">
          <div className="label">Net against doing nothing</div>
          <div className="tnum mt-3 text-[clamp(2.5rem,1.6rem+2.4vw,3.5rem)] leading-none font-medium tracking-[-0.035em] whitespace-nowrap text-ok">
            {compactRupees(pooled.net_vs_nothing_rupees)}
          </div>
          <p className="t-meta mt-3">
            sealed holdout, {count(holdout.n_seeds)} worlds, opened once
          </p>
        </div>
        {[
          ["Blocking precision", pct(pooled.precision, 2),
           `${count(pooled.fp)} wrong block in ${count(pooled.accounts_blocked)}`],
          ["Caught with review", pct(pooled.recall_including_review, 2),
           `of ${count(pooled.n_ring_accounts)} ring accounts`],
          ["Review load", pct(pooled.review_rate, 2),
           `${count(pooled.clusters_reviewed)} clusters need a person`],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-base py-9 pr-10 pl-10">
            <div className="label">{label}</div>
            <div className="tnum mt-3 text-[30px] leading-none font-medium tracking-tight text-fg">
              {value}
            </div>
            <p className="t-meta mt-3 max-w-[26ch]">{note}</p>
          </div>
        ))}
      </div>

      <div className="py-10">
        <button type="button" onClick={onSimulate}
                className="interactive inline-flex h-12 items-center gap-2.5 bg-fg px-7 text-[15px] font-medium text-base hover:opacity-90">
          Run it on twelve thousand accounts
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
