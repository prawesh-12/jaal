import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";
import { SCENES } from "./scenes";
import { cn } from "@/lib/utils";

/*
  The pipeline runs itself. Each stage plays its scene, holds it long enough to
  read, then hands on to the next and starts again at the top.

  The stage rail is the only control, and it is there because a reader who
  wants to sit on one stage should be able to. Selecting a stage shows it and
  the run carries on from there rather than fighting the click.

  Reduced motion stops the advance entirely: the rail still selects a stage,
  and every scene holds its finished state, so the page stays complete without
  anything moving on its own.
*/

const DWELL_MS = 4200;

export function PipelineVisualizer({ stages, tier, index, onIndex }) {
  const [runId, setRunId] = useState(0);
  const timer = useRef(null);
  const reduced = usePrefersReducedMotion();
  const last = stages.length - 1;

  const goTo = (i) => {
    onIndex(i);
    setRunId((r) => r + 1);
  };

  // Changing the tier rebuilds every figure, so the run starts again. Skipped
  // on the first render, which would otherwise throw away the starting stage.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    goTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (reduced) return undefined;
    timer.current = setTimeout(() => {
      onIndex(index >= last ? 0 : index + 1);
      setRunId((r) => r + 1);
    }, DWELL_MS);
    return () => clearTimeout(timer.current);
  }, [index, last, reduced, onIndex]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const stage = stages[index];
  const Scene = SCENES[stage.id];

  return (
    <div className="border-y border-line-strong" role="group" aria-label="Pipeline walkthrough">
      <StageRail stages={stages} index={index} onSelect={goTo} reduced={reduced} />

      <div className="overflow-x-auto border-t border-line bg-surface/50">
        {/* Keyed on the stage and the run, so arriving at a stage remounts it
            and its CSS reveals play again from the start. */}
        <div
          key={`${stage.id}-${runId}`}
          className="scene-fade min-w-[680px] px-4 py-8 sm:px-8"
        >
          <Scene stage={stage} />
        </div>
      </div>
    </div>
  );
}

/*
  The stage indicator, and the way to sit on a stage. The bar under the current
  one runs for as long as that stage holds, so the rail doubles as the clock.
*/
function StageRail({ stages, index, onSelect, reduced }) {
  return (
    <ol className="flex overflow-x-auto" aria-label="Pipeline stages">
      {stages.map((s, i) => {
        const current = i === index;
        const passed = i < index;
        return (
          <li key={s.id} className="min-w-[124px] flex-1 basis-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={current ? "step" : undefined}
              className={cn(
                "interactive relative block w-full border-l border-line px-4 py-3.5 text-left first:border-l-0",
                current ? "bg-active" : "hover:bg-surface"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 top-0 h-px",
                  passed ? "bg-line-loud" : "bg-transparent"
                )}
              />
              {current && (
                <span
                  aria-hidden="true"
                  key={index}
                  className={cn(
                    "absolute inset-x-0 top-0 h-px origin-left bg-accent",
                    !reduced && "stage-clock"
                  )}
                />
              )}
              <span
                className={cn("tnum block text-[11px]",
                              current ? "text-fg-2" : "text-fg-dim")}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "mt-1.5 block text-[13px] font-medium",
                  current ? "text-fg" : passed ? "text-fg-muted" : "text-fg-faint"
                )}
              >
                {s.name}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
