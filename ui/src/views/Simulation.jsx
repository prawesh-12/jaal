import { useEffect, useMemo, useState } from "react";
import { Crosshair, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { Inspector } from "@/components/simulation/inspector";
import { JaalCanvas } from "@/three/JaalCanvas";
import { WorldScene } from "@/three/WorldScene";
import {
  accountAt, edgeAt, edgesInCluster, layout, STAGES, strongestEdge,
} from "@/lib/world";
import { useJson } from "@/lib/useJson";
import { count, dp4, pct, TIERS } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEP_MS = 2600;
const PAIR_MS = 420;
const PAIR_STAGE = 2;

const CASES = [
  { value: "ring", label: "ring" },
  { value: "family", label: "family" },
  { value: "flatmates", label: "flatmates" },
  { value: "hostel", label: "hostel" },
  { value: "office", label: "office" },
];

/*
  The world in hand stays on screen while the next one loads. Dropping it would
  unmount the canvas, and a WebGL context rebuilt on every tier change is a
  context the browser eventually refuses to give back.
*/
function useWorld(tier, seed) {
  const [state, setState] = useState({ world: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/data/sim_world_${tier}_${seed}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((world) => live && setState({ world, loading: false, error: null }))
      .catch((error) => live && setState((s) => ({ ...s, loading: false, error })));
    return () => { live = false; };
  }, [tier, seed]);
  return state;
}

/* Every case comes out of this one real run, not out of a second dataset. */
function pickCluster(world, kind) {
  const wanted = world.clusters.filter((c) => (
    kind === "ring"
      ? c.truth.label === 1
      : c.truth.label === 0 && c.truth.dominant_benign_kind === kind));
  if (!wanted.length) return null;
  return wanted.reduce((a, b) => (
    kind === "ring"
      ? (b.features.total_discount > a.features.total_discount ? b : a)
      : (b.size > a.size ? b : a)));
}

/* What each stage did to the population, in the unit that stage works in. */
function stageReadout(world, geom, cluster) {
  const b = world.blocking;
  return {
    accounts: [count(world.n_accounts), "accounts in"],
    blocking: [count(b.n_candidate_pairs), `of ${count(b.n_possible_pairs)} pairs kept`],
    linking: [count(world.link.n_edges), `edges over ${world.link.threshold_bits} bits`],
    graph: [count(geom.insideEdges + geom.crossEdges), "edges in the graph"],
    clustering: [count(world.clustering.n_clusters), "communities found"],
    scoring: cluster ? [dp4(cluster.predicted_ring_purity), "predicted ring purity"]
                     : ["—", "no cluster"],
    decision: cluster ? [cluster.action.toUpperCase(), "cheapest action"]
                      : ["—", "no cluster"],
  };
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="label shrink-0">{label}</span>
      <div role="group" aria-label={label} className="flex border border-line">
        {options.map((o) => {
          const key = typeof o === "string" ? o : o.value;
          const text = typeof o === "string" ? o : o.label;
          return (
            <button key={key} type="button" onClick={() => onChange(key)}
                    aria-pressed={value === key}
                    className={cn(
                      "interactive h-8 border-l border-line px-3 text-[12.5px] first:border-l-0",
                      value === key ? "bg-fg font-medium text-base"
                                    : "text-fg-muted hover:bg-surface hover:text-fg")}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Transport({ stage, playing, onStage, onPlay, onFocus, onReset }) {
  const button = (key, label, icon, onClick, disabled) => (
    <button key={key} type="button" onClick={onClick} disabled={disabled}
            aria-label={label} title={label}
            className="interactive inline-flex size-8 items-center justify-center border-l border-line text-fg-muted first:border-l-0 hover:bg-surface hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent">
      {icon}
    </button>
  );
  return (
    <div className="flex border border-line">
      {button("restart", "Restart", <RotateCcw size={13} />,
              () => onStage(0), stage === 0 && !playing)}
      {button("back", "Step back", <SkipBack size={13} />,
              () => onStage(stage - 1), stage === 0)}
      {button("play", playing ? "Pause" : "Play",
              playing ? <Pause size={13} /> : <Play size={13} />, onPlay)}
      {button("forward", "Step forward", <SkipForward size={13} />,
              () => onStage(stage + 1), stage === STAGES.length - 1)}
      {button("focus", "Focus the cluster", <Crosshair size={13} />, onFocus)}
      <button type="button" onClick={onReset}
              className="interactive h-8 border-l border-line px-2.5 text-[12px] text-fg-muted hover:bg-surface hover:text-fg">
        Reset view
      </button>
    </div>
  );
}

/* The pipeline as a rail: each stage carries the number it produced on this
   world, so the run reads as a sequence of states rather than a slideshow. */
function StageRail({ stage, onStage, readout }) {
  return (
    <ol className="flex h-full flex-col">
      {STAGES.map((s, i) => {
        const done = i < stage;
        const here = i === stage;
        // A stage shows what it produced only once the run has reached it.
        const [value, unit] = done || here ? readout[s.id] : ["", "not run yet"];
        return (
          <li key={s.id} className="min-h-0 flex-1 border-b border-line last:border-b-0">
            <button type="button" onClick={() => onStage(i)}
                    aria-current={here ? "step" : undefined}
                    className={cn(
                      "interactive relative block h-full w-full px-4 py-3 text-left",
                      here ? "bg-active" : "hover:bg-surface")}>
              <span aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[2px]"
                    style={{ background: here ? "var(--color-fg)"
                             : done ? "var(--color-line-loud)" : "transparent" }} />
              <div className={cn("text-[12.5px] leading-tight",
                                 here ? "font-medium text-fg"
                                      : done ? "text-fg-2" : "text-fg-faint")}>
                {s.name}
              </div>
              <div className={cn("tnum mt-1 text-[17px] leading-none",
                                 here ? "text-fg" : done ? "text-fg-2" : "text-fg-dim")}>
                {value}
              </div>
              <div className="t-meta mt-1 text-fg-faint">{unit}</div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Dataset({ world, tier, kind, seed, onStart }) {
  const p = world.population;
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-base/97 backdrop-blur-[3px]">
      <div className="max-h-full w-full max-w-[820px] overflow-y-auto px-8 py-10">
        <div className="label">Before anything runs</div>
        <h2 className="mt-3 text-[28px] leading-tight font-medium tracking-[-0.02em] text-fg">
          This is the population Jaal is about to read.
        </h2>
        <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-fg-muted">
          A synthetic merchant population, one row per account. The twelve
          columns it arrives in are listed on the right.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-x-10 gap-y-7 sm:grid-cols-4">
          {[
            ["Accounts", count(world.n_accounts)],
            ["Fields each", world.columns.length],
            ["Ring prevalence", pct(p.ring_prevalence, 2)],
            ["Benign groups", count(p.benign_groups)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd className="tnum mt-2 text-[30px] leading-none font-medium tracking-[-0.025em] text-fg">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10">
          <button type="button" onClick={onStart}
                  className="interactive inline-flex h-11 items-center bg-accent px-6 text-[14px] font-medium text-base hover:opacity-90">
            Run Jaal on {tier} tier, {kind === "ring" ? "a ring" : `a ${kind}`}, seed {seed}
          </button>
        </div>
      </div>
    </div>
  );
}

function Verdict({ cluster }) {
  const tone = { block: "bad", review: "warn", allow: "ok" }[cluster.action];
  return (
    <div className="pointer-events-none absolute top-4 right-4 border border-line bg-base/90 px-5 py-4 backdrop-blur-[2px]">
      <div className="label">Jaal decision</div>
      <div className="tnum mt-1.5 text-[30px] leading-none font-medium uppercase"
           style={{ color: `var(--color-${tone})` }}>
        {cluster.action}
      </div>
      <div className="t-meta mt-2">
        cluster {cluster.cluster_id} · {count(cluster.size)} accounts
      </div>
    </div>
  );
}

export default function Simulation() {
  const [tier, setTier] = useState("obvious");
  const [kind, setKind] = useState("ring");
  const [seed, setSeed] = useState(975);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [viewNonce, setViewNonce] = useState(0);
  const [revealed, setRevealed] = useState(0);

  const index = useJson("sim_worlds");
  const { world, loading, error } = useWorld(tier, seed);

  const seeds = index.data?.seeds ?? [seed];
  const geom = useMemo(() => (world ? layout(world) : null), [world]);
  const cluster = useMemo(() => (world ? pickCluster(world, kind) : null),
                          [world, kind]);
  const focusIndex = useMemo(() => (
    cluster ? world.clusters.indexOf(cluster) : null), [cluster, world]);

  const focused = stage >= 5 ? focusIndex : null;

  const highlight = useMemo(() => (
    world && geom && focused !== null
      ? edgesInCluster(world, geom.clusterOf, focused)
      : null), [world, geom, focused]);

  const pairIndex = useMemo(() => (
    world && geom && focusIndex !== null
      ? strongestEdge(world, geom.clusterOf, focusIndex)
      : null), [world, geom, focusIndex]);

  const parts = pairIndex === null ? 0 : world.link.comparisons.length;

  const pair = useMemo(() => {
    if (stage !== PAIR_STAGE || pairIndex === null) return null;
    const e = edgeAt(world, pairIndex);
    const shown = e.parts.slice(0, revealed);
    const running = shown.length ? shown[shown.length - 1].running : 0;
    return {
      source: e.source,
      target: e.target,
      threshold: world.link.threshold_bits,
      crossed: running >= world.link.threshold_bits,
      done: revealed >= parts,
      running,
      // A late negative comparison pulls the total back down, so the bar is
      // scaled to the furthest it reaches, not to where it ends.
      scale: Math.max(e.bits, ...e.parts.map((p) => p.running)),
      steps: shown.map((p) => p.running),
    };
  }, [stage, pairIndex, world, revealed, parts]);

  useEffect(() => { setSelected(null); }, [tier, kind, seed]);

  useEffect(() => {
    if (stage !== PAIR_STAGE) {
      setRevealed(0);
      return undefined;
    }
    if (revealed >= parts) return undefined;
    const id = setTimeout(() => setRevealed((r) => r + 1), PAIR_MS);
    return () => clearTimeout(id);
  }, [stage, revealed, parts]);

  useEffect(() => {
    if (!playing) return undefined;
    if (stage >= STAGES.length - 1) {
      setPlaying(false);
      return undefined;
    }
    // The evidence stage waits for the pair it is reading to finish.
    const wait = stage === PAIR_STAGE ? STEP_MS + parts * PAIR_MS : STEP_MS;
    const id = setTimeout(() => setStage((s) => s + 1), wait);
    return () => clearTimeout(id);
  }, [playing, stage, parts]);

  const goto = (next) => {
    setPlaying(false);
    setStarted(true);
    setStage(Math.max(0, Math.min(STAGES.length - 1, next)));
  };

  const run = () => {
    setSelected(null);
    setStarted(true);
    setStage(0);
    setPlaying(true);
  };

  const hoverLine = hovered === null || !world || !geom ? null : (() => {
    const row = accountAt(world, hovered);
    const k = geom.clusterOf[hovered];
    return `${row.account_id} · ${row.n_orders} order${row.n_orders === 1 ? "" : "s"}`
      + ` · coupon ${row.coupon_used ? "used" : "unused"}`
      + ` · ${k >= 0 ? `cluster ${k}` : "no cluster"}`;
  })();

  const readout = world && geom ? stageReadout(world, geom, cluster) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-5 py-3">
        <Segmented label="Tier" options={TIERS} value={tier} onChange={setTier} />
        <Segmented label="Case" options={CASES} value={kind} onChange={setKind} />
        <Segmented label="Seed" options={seeds.map(String)} value={String(seed)}
                   onChange={(v) => setSeed(Number(v))} />
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={run}
                  className="interactive inline-flex h-8 items-center bg-accent px-4 text-[12.5px] font-medium text-base hover:opacity-90">
            Run Jaal
          </button>
          <Transport stage={stage} playing={playing} onStage={goto}
                     onPlay={() => { setStarted(true); setPlaying((p) => !p); }}
                     onFocus={() => {
                       setSelected(null);
                       goto(Math.max(stage, 5));
                       setViewNonce((v) => v + 1);
                     }}
                     onReset={() => setViewNonce((v) => v + 1)} />
        </div>
      </div>

      {error && (
        <p className="px-5 py-10 text-[13.5px] text-fg-muted">
          No replay file for the {tier} tier at seed {seed}. Run{" "}
          <span className="ident">python -m detector.sim_world</span>, then{" "}
          <span className="ident">npm run data</span>.
        </p>
      )}

      {world && geom && readout && (
        <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_340px] divide-x divide-line">
          <div className="min-h-0 overflow-y-auto">
            <StageRail stage={stage} onStage={goto} readout={readout} />
          </div>

          <div className="relative min-h-0">
            <JaalCanvas>
              <WorldScene world={world} geom={geom} stage={stage}
                          focus={focused} selected={selected}
                          highlightEdges={highlight} viewNonce={viewNonce}
                          pair={pair}
                          onPick={(i) => setSelected({ kind: "account", id: i })}
                          onHover={setHovered} />
            </JaalCanvas>

            <div className="pointer-events-none absolute inset-x-0 top-0 px-5 py-4">
              <div className="text-[15px] font-medium text-fg">
                {STAGES[stage].name}
              </div>
              <div className="mt-1 max-w-[54ch] text-[13px] text-fg-muted">
                {STAGES[stage].line}
              </div>
            </div>

            {stage >= 6 && cluster && <Verdict cluster={cluster} />}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-6 px-5 py-3">
              <span className="tnum text-[12.5px] text-fg-2">
                {hoverLine ?? "synthetic population · replay of a real run"}
              </span>
              <span className="text-[12px] text-fg-faint">
                drag to pan · scroll to zoom · hover to read · click to pin
              </span>
            </div>

            {!started && (
              <Dataset world={world} tier={tier} kind={kind} seed={seed}
                       onStart={run} />
            )}
          </div>

          <aside aria-busy={loading} className="min-h-0 overflow-y-auto p-5">
            {selected && (
              <button type="button" onClick={() => setSelected(null)}
                      className="interactive mb-4 text-[12.5px] text-fg-muted hover:text-fg">
                ← back to the stage
              </button>
            )}
            <Inspector world={world} geom={geom} stage={stage}
                       cluster={stage >= 5 ? cluster : null}
                       selected={selected} onSelect={setSelected}
                       pairIndex={pairIndex} revealed={revealed} />
          </aside>
        </div>
      )}

      {loading && !world && (
        <div className="min-h-0 flex-1 animate-pulse bg-surface" />
      )}
    </div>
  );
}
