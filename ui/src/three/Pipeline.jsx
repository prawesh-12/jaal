import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";

const STAGE = { w: 25, h: 15, d: 9, r: 1.1 };
const OUT = { w: 24, h: 10, d: 7, r: 1.1 };
const GAP = 3.6;
const FAN = 19;
const OUT_GAP = 2.6;

const SWEEP = 0.82;     // seconds a run spends on each hop between stages
const HOLD = 1.1;       // seconds the decision stage keeps the run
const EXIT = 0.7;

// Shallow enough that a label stays over its own plate, deep enough that the
// bevels and side walls shade instead of reading as flat rectangles.
const TILT = [-0.2, 0.24, 0];

/* Rounded profile extruded with a bevel, so every edge has a lit face on it
   rather than the hard silhouette a BoxGeometry gives. */
function slab({ w, h, d, r }) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d,
    bevelEnabled: true,
    bevelThickness: 0.85,
    bevelSize: 0.85,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.center();
  return geo;
}

/* A radial falloff painted once into a canvas and used as the plane behind each
   plate. Steadier and far cheaper than a shadow map for a scene this small. */
function shadowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0,
                                     size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0,0,0,0.42)");
  g.addColorStop(0.5, "rgba(0,0,0,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Damped hard enough to settle without wobbling like a toy.
class Spring {
  constructor(stiffness = 160, damping = 24) {
    this.k = stiffness;
    this.c = damping;
    this.x = 0;
    this.v = 0;
    this.target = 0;
  }

  step(dt) {
    const h = Math.min(dt, 0.033);
    this.v += (-this.k * (this.x - this.target) - this.c * this.v) * h;
    this.x += this.v * h;
    return this.x;
  }

  get settled() {
    return Math.abs(this.v) < 0.002 && Math.abs(this.x - this.target) < 0.002;
  }
}

const RAIL_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* The band is the run itself crossing between two stages. Behind its head the
   rail returns to its resting colour, so the diagram never accumulates paint. */
const RAIL_FRAG = `
  uniform vec3 uRest;
  uniform vec3 uLive;
  uniform float uHead;
  varying vec2 vUv;
  void main() {
    float lead = smoothstep(uHead + 0.05, uHead - 0.02, vUv.x);
    float tail = smoothstep(uHead - 0.5, uHead - 0.06, vUv.x);
    gl_FragColor = vec4(mix(uRest, uLive, lead * tail), 1.0);
  }
`;

function Rail({ ax, ay, bx, by, rest, live, head }) {
  const material = useRef();
  const dx = bx - ax;
  const dy = by - ay;

  const uniforms = useMemo(() => ({
    uRest: { value: new THREE.Color() },
    uLive: { value: new THREE.Color() },
    uHead: { value: -1 },
  }), []);

  useEffect(() => {
    uniforms.uRest.value.set(rest);
    uniforms.uLive.value.set(live);
  }, [rest, live, uniforms]);

  useFrame(() => {
    if (material.current) material.current.uniforms.uHead.value = head();
  });

  return (
    <mesh position={[(ax + bx) / 2, (ay + by) / 2, 0]}
          rotation={[0, 0, Math.atan2(dy, dx)]}>
      <planeGeometry args={[Math.hypot(dx, dy), 0.7]} />
      <shaderMaterial ref={material} uniforms={uniforms}
                      vertexShader={RAIL_VERT} fragmentShader={RAIL_FRAG} />
    </mesh>
  );
}

/*
  The face is an <Html> button laid exactly over the plate rather than a mesh
  pointer handler, so the diagram is reachable by keyboard and reads as a
  control to a screen reader.
*/
function Plate({ x, y, size, geometry, shadow, holding, active, end, label, sub,
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
      {shadow && (
        <mesh position={[1.4, -2, -size.d / 2 - 1.6]}>
          <planeGeometry args={[size.w * 1.55, size.h * 2]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false}
                             toneMapped={false} />
        </mesh>
      )}

      <mesh geometry={geometry}>
        <meshStandardMaterial ref={material} roughness={0.6} metalness={0.05}
                              transparent toneMapped={false} />
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

/* Key from the upper left, a fill opposite it and a rim from behind. The key
   grazes rather than facing the plates, so the front reads at its own colour
   and the shading lands on the bevels. */
function Lights({ ground }) {
  return (
    <>
      <ambientLight intensity={0.66} />
      <hemisphereLight args={["#ffffff", ground, 0.34]} />
      <directionalLight position={[-60, 42, 14]} intensity={0.9} />
      <directionalLight position={[52, -22, 30]} intensity={0.3} />
      <directionalLight position={[0, 12, -60]} intensity={0.32} />
    </>
  );
}

/*
  Stages left to right, then a three-way exit. `active` is the stage the caller
  is showing detail for; `holding` is the stage the run has reached.
*/
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
                 lights={<Lights ground={colors.surface} />}
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

  const stageGeo = useMemo(() => slab(STAGE), []);
  const outGeo = useMemo(() => slab(OUT), []);
  const shadow = useMemo(
    () => (typeof document === "undefined" ? null : shadowTexture()), []);

  const entry = useRef(still ? 1 : 0);
  const run = useRef({ t: 0, exit: 0, at: -1 });

  useEffect(() => () => {
    stageGeo.dispose();
    outGeo.dispose();
    shadow?.dispose();
  }, [stageGeo, outGeo, shadow]);

  useEffect(() => { invalidate(); }, [active, holding, colors, invalidate]);

  const hops = stages.length - 1;
  const cycle = hops * SWEEP + HOLD + EXIT;

  useFrame((_, delta) => {
    if (entry.current < 1) {
      entry.current = Math.min(1, entry.current + delta * 1.2);
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

  // Staggered so the plates settle in reading order rather than all at once.
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
              rest={colors.line} live={colors.accent} head={hopHead(i)} />
      ))}

      {outcomes.map((o, j) => (
        <Rail key={o.label} ax={geom.xs[last] + STAGE.w / 2} ay={0}
              bx={geom.outX - OUT.w / 2} by={geom.ys[j]}
              rest={colors.line} live={colors.accent} head={exitHead(j)} />
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
                 shadow={shadow} label={s.label} sub={s.sub}
                 active={active === s.id} holding={!still && holding === i}
                 colors={colors} entry={entryAt(i)}
                 onSelect={() => onHover(s.id)} onClear={() => onHover(null)} />
        </group>
      ))}

      {outcomes.map((o, j) => (
        <Plate key={o.label} x={geom.outX} y={geom.ys[j]} size={OUT}
               geometry={outGeo} shadow={shadow} end label={o.label} sub={o.sub}
               colors={colors} entry={entryAt(stages.length + j)} />
      ))}
    </group>
  );
}
