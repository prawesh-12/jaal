import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/motion";
import { SCENES } from "./scenes";
import { cn } from "@/lib/utils";

/*
  The pipeline as a machine you can step through rather than a diagram you
  read. One scene plays per stage, holds its finished state, and the run ends
  at "output ready" instead of looping.

  Auto advances on a timer. Manual hands the timing to the reader, which is
  the mode anyone actually inspecting the system will want.
*/

const DWELL_MS = 3200;

export function PipelineVisualizer({ stages, tier, index, onIndex }) {
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("manual");
  const [done, setDone] = useState(false);
  const [runId, setRunId] = useState(0);
  const timer = useRef(null);
  const reduced = usePrefersReducedMotion();

  const last = stages.length - 1;

  const goTo = useCallback((i) => {
    onIndex(Math.max(0, Math.min(last, i)));
    setDone(false);
    setRunId((r) => r + 1);
  }, [last, onIndex]);

  // Changing the tier rebuilds every figure, so the run starts again. Skipped
  // on the first render, which would otherwise throw away the starting stage.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onIndex(0);
    setDone(false);
    setPlaying(false);
    setRunId((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing || mode !== "auto") return undefined;
    if (index >= last) {
      setPlaying(false);
      setDone(true);
      return undefined;
    }
    timer.current = setTimeout(() => {
      onIndex(index + 1);
      setRunId((r) => r + 1);
    }, reduced ? 900 : DWELL_MS);
    return () => clearTimeout(timer.current);
  }, [playing, mode, index, last, reduced, onIndex]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const stage = stages[index];
  const Scene = SCENES[stage.id];

  const replay = () => {
    onIndex(0);
    setDone(false);
    setRunId((r) => r + 1);
    if (mode === "auto") setPlaying(true);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
  };

  return (
    <div
      className="border-y border-line-strong"
      role="group"
      aria-label="Pipeline walkthrough"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <StageRail stages={stages} index={index} onSelect={goTo} done={done} />

      <div className="relative border-t border-line bg-surface/50">
        {/* Keyed on the stage and the run, so selecting or replaying a stage
            remounts it and its CSS reveals play again from the start. */}
        {/* Scrolls rather than shrinking below a readable width, which is
            what the tables on the other pages do too. */}
        <div className="overflow-x-auto">
          <div
            key={`${stage.id}-${runId}`}
            className="scene-fade min-w-[680px] px-4 py-8 sm:px-8"
          >
            <Scene stage={stage} />
          </div>
        </div>

        {done && (
          <div className="scene-fade pointer-events-none absolute right-6 bottom-5">
            <span className="label text-fg-2">output ready</span>
          </div>
        )}
      </div>

      <Controls
        index={index} last={last} playing={playing} mode={mode} done={done}
        onPlay={() => { setPlaying((p) => !p); setMode("auto"); setDone(false); }}
        onPrev={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        onReplay={replay}
        onMode={(m) => { setMode(m); if (m === "manual") setPlaying(false); }}
      />
    </div>
  );
}

/* The stage indicator. Also the way to jump straight to a stage. */
function StageRail({ stages, index, onSelect, done }) {
  return (
    <ol className="flex overflow-x-auto" aria-label="Pipeline stages">
      {stages.map((s, i) => {
        const current = i === index;
        const passed = i < index || done;
        return (
          <li key={s.id} className="min-w-[124px] flex-1 basis-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={current ? "step" : undefined}
              className={cn(
                "interactive group relative block w-full border-l border-line px-4 py-3.5 text-left first:border-l-0",
                current ? "bg-active" : "hover:bg-surface"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 top-0 h-px transition-colors",
                  current ? "bg-accent" : passed ? "bg-line-loud" : "bg-transparent"
                )}
              />
              <span
                className={cn(
                  "tnum block text-[11px]",
                  current ? "text-fg-2" : "text-fg-dim"
                )}
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

function Btn({ onClick, label, disabled, children, wide }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "interactive inline-flex h-8 items-center justify-center gap-2 border border-line bg-surface text-[12.5px] text-fg-muted",
        wide ? "px-3" : "w-8",
        "hover:border-line-strong hover:bg-raised hover:text-fg",
        "disabled:pointer-events-none disabled:text-fg-dim"
      )}
    >
      {children}
    </button>
  );
}

function Controls({ index, last, playing, mode, done, onPlay, onPrev, onNext, onReplay, onMode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-3 sm:px-6">
      <div className="flex items-center gap-1.5">
        <Btn onClick={onPrev} label="Previous stage" disabled={index === 0}>
          <ChevronLeft size={14} />
        </Btn>
        <Btn onClick={onPlay} label={playing ? "Pause" : "Play"} wide>
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? "Pause" : "Play"}
        </Btn>
        <Btn onClick={onNext} label="Next stage" disabled={index === last}>
          <ChevronRight size={14} />
        </Btn>
        <Btn onClick={onReplay} label="Replay from the first stage">
          <RotateCcw size={13} />
        </Btn>
      </div>

      <div role="group" aria-label="Playback mode" className="flex items-center border border-line">
        {["manual", "auto"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "interactive h-8 border-l border-line px-3 text-[12.5px] first:border-l-0",
              mode === m ? "bg-raised text-fg" : "text-fg-faint hover:text-fg-muted"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <p className="t-meta ml-auto text-fg-faint">
        {done
          ? "Run complete. Replay, or step back through any stage."
          : mode === "manual"
            ? "Step with the arrows, or use the left and right keys."
            : playing ? "Playing." : "Press play to run the pipeline."}
      </p>
    </div>
  );
}
