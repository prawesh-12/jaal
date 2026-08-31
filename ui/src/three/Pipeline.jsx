import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { Rail, SceneLights, Shadow, SURFACE, Spring, useSlab }
  from "@/three/surface";

const ROW_STAGE = { w: 25, h: 15, d: 9, r: 1.1 };
const ROW_OUT = { w: 24, h: 10, d: 7, r: 1.1 };
// Stacked, a plate has the page's width to use and only needs one line of text.
const COL_STAGE = { w: 54, h: 13, d: 9, r: 1.1 };
const COL_OUT = { w: 26, h: 11, d: 7, r: 1.1 };
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
/*
  Two arrangements of the same chain. Wide, the stages run left to right and
  the exits fan off the end; narrow, the whole thing turns a quarter so it
  stacks down the page instead of asking a phone to scroll sideways.
*/
function layout(stages, outcomes, vertical) {
  const n = stages.length;
  const m = outcomes.length;

  if (!vertical) {
    const S = ROW_STAGE;
    const O = ROW_OUT;
    const lane = n * S.w + (n - 1) * GAP;
    const total = lane + FAN + O.w;
    const left = -total / 2;
    const span = m * (O.h + OUT_GAP) - OUT_GAP;
    return {
      S,
      O,
      width: total + 16,
      height: Math.max(S.h, span) + 20,
      stage: stages.map((_, i) => [left + S.w / 2 + i * (S.w + GAP), 0]),
      out: outcomes.map((_, j) => [left + lane + FAN + O.w / 2,
                                   span / 2 - O.h / 2 - j * (O.h + OUT_GAP)]),
      exit: [S.w / 2, 0, -O.w / 2, 0],
      hop: [S.w / 2, 0, -S.w / 2, 0],
      index: [0, S.h / 2 + 6.5],
    };
  }

  const S = COL_STAGE;
  const O = COL_OUT;
  const gap = OUT_GAP * 3;
  const step = S.h + GAP * 1.9;
  const lane = n * step - GAP * 1.9;
  const drop = 15;
  const outRow = m * O.w + gap * (m - 1);
  const total = lane + drop + O.h;
  const top = total / 2 - S.h / 2;
  return {
    S,
    O,
    width: Math.max(S.w, outRow) + 32,
    height: total + 14,
    stage: stages.map((_, i) => [0, top - i * step]),
    out: outcomes.map((_, j) => [-outRow / 2 + O.w / 2 + j * (O.w + gap),
                                 top - lane + S.h / 2 - drop - O.h / 2]),
    exit: [0, -S.h / 2, 0, O.h / 2],
    hop: [0, -S.h / 2, 0, S.h / 2],
    index: [-S.w / 2 - 7, 0],
  };
}

export function Pipeline({ stages, outcomes, active, holding, running = true,
                           vertical = false, onHover, onReach, className }) {
  const colors = useThemeColors();
  const geom = useMemo(
    () => layout(stages, outcomes, vertical), [stages, outcomes, vertical]);

  return (
    <ChartCanvas width={geom.width} height={geom.height}
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

  const stageGeo = useSlab(geom.S);
  const outGeo = useSlab(geom.O);

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

  const last = stages.length - 1;
  const [hx, hy, hx2, hy2] = geom.hop;
  const [ex, ey, ex2, ey2] = geom.exit;

  return (
    <group rotation={TILT}>
      {geom.stage.slice(0, -1).map(([x, y], i) => (
        <Rail key={stages[i].id} ax={x + hx} ay={y + hy}
              bx={geom.stage[i + 1][0] + hx2} by={geom.stage[i + 1][1] + hy2}
              z={0} rest={colors.line} live={colors.accent}
              head={hopHead(i)} />
      ))}

      {outcomes.map((o, j) => (
        <Rail key={o.label}
              ax={geom.stage[last][0] + ex} ay={geom.stage[last][1] + ey}
              bx={geom.out[j][0] + ex2} by={geom.out[j][1] + ey2}
              z={0} rest={colors.line} live={colors.accent}
              head={exitHead(j)} />
      ))}

      {stages.map((s, i) => (
        <group key={s.id}>
          <Html position={[geom.stage[i][0] + geom.index[0],
                           geom.stage[i][1] + geom.index[1], 0]} center
                transform={false} zIndexRange={[10, 0]}
                style={{ pointerEvents: "none" }}>
            <span className="tnum text-[10.5px] text-fg-dim">
              {String(i + 1).padStart(2, "0")}
            </span>
          </Html>
          <Plate x={geom.stage[i][0]} y={geom.stage[i][1]} size={geom.S}
                 geometry={stageGeo} label={s.label} sub={s.sub}
                 active={active === s.id} holding={!still && holding === i}
                 colors={colors} entry={entryAt(i)}
                 onSelect={() => onHover(s.id)} onClear={() => onHover(null)} />
        </group>
      ))}

      {outcomes.map((o, j) => (
        <Plate key={o.label} x={geom.out[j][0]} y={geom.out[j][1]} size={geom.O}
               geometry={outGeo} end label={o.label} sub={o.sub}
               colors={colors} entry={entryAt(stages.length + j)} />
      ))}
    </group>
  );
}
