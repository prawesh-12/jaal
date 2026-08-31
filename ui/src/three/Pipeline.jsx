import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { Rail, SceneLights, Shadow, SURFACE, Spring, useSlab }
  from "@/three/surface";

const STAGE = { w: 25, h: 15, d: 9, r: 1.1 };
const OUT = { w: 24, h: 10, d: 7, r: 1.1 };
const GAP = 3.6;
const FAN = 19;
const OUT_GAP = 2.6;

const SWEEP = 0.42;     // seconds a run spends on each hop between stages
const HOLD = 0.65;      // seconds the decision stage keeps the run
const EXIT = 0.4;

// Shallow enough that a label stays over its own plate, deep enough that the
// bevels and side walls shade instead of reading as flat rectangles.
const TILT = [-0.2, 0.24, 0];

// The face is an <Html> button over the plate rather than a mesh pointer
// handler, so the diagram is reachable by keyboard.
function Plate({ x, y, size, geometry, holding, active, end, label, sub,
                 colors, entry, onSelect, onClear }) {
  const group = useRef();
  const material = useRef();
  const px = usePxPerUnit();
  const { invalidate } = useThree();
  const lift = useRef(new Spring());
  const solid = active || end;
  const ink = solid ? "var(--color-base)" : "var(--color-fg)";

  const face = useMemo(() => new THREE.Color(), []);
  const warm = useMemo(() => new THREE.Color(), []);

  lift.current.target = active ? 1 : holding ? 0.6 : 0;

  useFrame((_, delta) => {
    if (!group.current) return;
    const e = entry();
    const l = lift.current.step(delta);

    group.current.position.set(x, y + (1 - e) * -4.5, l * 5.5);
    group.current.scale.setScalar(0.88 + 0.12 * e);

    if (material.current) {
      face.set(solid ? colors.fg : colors.raised);
      if (!solid) {
        warm.set(colors.active);
        face.lerp(warm, Math.min(1, l));
      }
      material.current.color.copy(face);
      material.current.opacity = e;
    }

    if (!lift.current.settled || e < 1) invalidate();
  });

  const box = { width: `${size.w * px}px`, height: `${size.h * px}px` };

  const content = (
    <span className="block px-1.5 text-center">
      <span className="block text-[12.5px] leading-tight font-medium" style={{ color: ink }}>
        {label}
      </span>
      {sub && (
        <span className="tnum mt-0.5 block text-[11px] leading-tight"
              style={{ color: solid ? "var(--color-base)" : "var(--color-fg-muted)" }}>
          {sub}
        </span>
      )}
    </span>
  );

  return (
    <group ref={group} position={[x, y, 0]}>
      <Shadow w={size.w * 1.55} h={size.h * 2} z={-size.d / 2 - 1.6} />

      <mesh geometry={geometry}>
        <meshStandardMaterial ref={material} {...SURFACE} transparent
                              toneMapped={false} />
      </mesh>

      <Html center transform={false} zIndexRange={[10, 0]}
            style={{ pointerEvents: onSelect ? "auto" : "none", ...box }}>
        {onSelect ? (
          <button type="button" aria-pressed={active} style={box}
                  onMouseEnter={onSelect} onMouseLeave={onClear}
                  onFocus={onSelect} onBlur={onClear} onClick={onSelect}
                  className="flex w-full cursor-pointer items-center justify-center outline-none">
            {content}
          </button>
        ) : content}
      </Html>
    </group>
  );
}

// `active` is the stage the caller shows detail for, `holding` is where the
// run has reached.
export function Pipeline({ stages, outcomes, active, holding, running = true,
                           onHover, onReach, className }) {
  const colors = useThemeColors();

  const geom = useMemo(() => {
    const lane = stages.length * STAGE.w + (stages.length - 1) * GAP;
    const total = lane + FAN + OUT.w;
    const left = -total / 2;
    const span = outcomes.length * (OUT.h + OUT_GAP) - OUT_GAP;
    return {
      total,
      span,
      xs: stages.map((_, i) => left + STAGE.w / 2 + i * (STAGE.w + GAP)),
      outX: left + lane + FAN + OUT.w / 2,
      ys: outcomes.map((_, j) => span / 2 - OUT.h / 2 - j * (OUT.h + OUT_GAP)),
    };
  }, [stages, outcomes]);

  return (
    <ChartCanvas width={geom.total + 16}
                 height={Math.max(STAGE.h, geom.span) + 20}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <Chain colors={colors} geom={geom} stages={stages} outcomes={outcomes}
             active={active} holding={holding} running={running}
             onHover={onHover} onReach={onReach} />
    </ChartCanvas>
  );
}

function Chain({ colors, geom, stages, outcomes, active, holding, running,
                 onHover, onReach }) {
  const { invalidate } = useThree();
  const still = useMemo(
    () => typeof window !== "undefined" &&
          Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    []);

  const stageGeo = useSlab(STAGE);
  const outGeo = useSlab(OUT);

  const entry = useRef(still ? 1 : 0);
  const run = useRef({ t: 0, exit: 0, at: -1 });

  useEffect(() => { invalidate(); }, [active, holding, colors, invalidate]);

  const hops = stages.length - 1;
  const cycle = hops * SWEEP + HOLD + EXIT;

  useFrame((_, delta) => {
    if (entry.current < 1) {
      entry.current = Math.min(1, entry.current + delta * 2.4);
      invalidate();
    }
    if (still || !running) return;

    const r = run.current;
    r.t += Math.min(delta, 0.05);
    if (r.t > cycle) {
      r.t = 0;
      r.exit = (r.exit + 1) % outcomes.length;
    }

    const reached = r.t < hops * SWEEP
      ? Math.min(hops, Math.round(r.t / SWEEP))
      : hops;
    if (reached !== r.at) {
      r.at = reached;
      onReach(reached);
    }
    invalidate();
  });

  const entryAt = (i) => () =>
    Math.max(0, Math.min(1, entry.current * (stages.length + 4) - i));

  const hopHead = (i) => () =>
    (still || !running ? -1 : (run.current.t - i * SWEEP) / SWEEP);

  const exitHead = (j) => () =>
    (still || !running || run.current.exit !== j
      ? -1
      : (run.current.t - hops * SWEEP - HOLD) / EXIT);

  const last = geom.xs.length - 1;

  return (
    <group rotation={TILT}>
      {geom.xs.slice(0, -1).map((x, i) => (
        <Rail key={stages[i].id} ax={x + STAGE.w / 2} ay={0}
              bx={geom.xs[i + 1] - STAGE.w / 2} by={0}
              z={0} rest={colors.line} live={colors.accent}
              head={hopHead(i)} />
      ))}

      {outcomes.map((o, j) => (
        <Rail key={o.label} ax={geom.xs[last] + STAGE.w / 2} ay={0}
              bx={geom.outX - OUT.w / 2} by={geom.ys[j]}
              z={0} rest={colors.line} live={colors.accent}
              head={exitHead(j)} />
      ))}

      {stages.map((s, i) => (
        <group key={s.id}>
          <Html position={[geom.xs[i], STAGE.h / 2 + 6.5, 0]} center
                transform={false} zIndexRange={[10, 0]}
                style={{ pointerEvents: "none" }}>
            <span className="tnum text-[10.5px] text-fg-dim">
              {String(i + 1).padStart(2, "0")}
            </span>
          </Html>
          <Plate x={geom.xs[i]} y={0} size={STAGE} geometry={stageGeo}
                 label={s.label} sub={s.sub}
                 active={active === s.id} holding={!still && holding === i}
                 colors={colors} entry={entryAt(i)}
                 onSelect={() => onHover(s.id)} onClear={() => onHover(null)} />
        </group>
      ))}

      {outcomes.map((o, j) => (
        <Plate key={o.label} x={geom.outX} y={geom.ys[j]} size={OUT}
               geometry={outGeo} end label={o.label} sub={o.sub}
               colors={colors} entry={entryAt(stages.length + j)} />
      ))}
    </group>
  );
}
