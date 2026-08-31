import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";

const TILE = 10;
const WINDOW = [46, 15];
const ZOOM_NEAR = 4.3;
const ZOOM_CLOSE = 6.2;
const PANEL_X = 8;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const linear = (css) => new THREE.Color(css).convertSRGBToLinear();
const ease = (t) => 1 - (1 - t) ** 3;
const span = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;

/*
  Tiles rather than plain rows, so the contiguous run the engine gives a
  community lands as a compact block instead of a stripe across the field.
*/
function place(d, w, h) {
  const down = h / TILE;
  const tile = Math.floor(d / (TILE * TILE));
  const off = d % (TILE * TILE);
  return [
    Math.floor(tile / down) * TILE + (off % TILE) - w / 2 + 0.5,
    h / 2 - 0.5 - ((tile % down) * TILE + Math.floor(off / TILE)),
  ];
}

function Marks({ n, spots, focusRun, phase, colors, view, linked }) {
  const mesh = useRef();
  const attr = useRef();
  const px = usePxPerUnit();
  const rgb = useMemo(() => new Float32Array(n * 3), [n]);
  const lastSize = useRef(0);

  useFrame(() => {
    if (!mesh.current || !attr.current) return;

    const zin = ease(span(phase, 0.12, 0.3));
    const size = mix(2.1, 9.5, zin) / (px * view.current.scale * 2);

    if (Math.abs(size - lastSize.current) > 1e-5) {
      lastSize.current = size;
      for (let i = 0; i < n; i += 1) {
        dummy.position.set(spots[i * 2], spots[i * 2 + 1], 0);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        mesh.current.setMatrixAt(i, dummy.matrix);
      }
      mesh.current.instanceMatrix.needsUpdate = true;
    }

    const quiet = linear(colors["fg-dim"]);
    const active = linear(colors["fg-2"]);
    const page = linear(colors.base);
    const hot = linear(colors.fg);

    const arrive = ease(span(phase, 0, 0.1));
    const wired = ease(span(phase, 0.3, 0.6));
    const isolate = ease(span(phase, 0.62, 0.8));

    for (let i = 0; i < n; i += 1) {
      const onFocus = i >= focusRun.start && i < focusRun.start + focusRun.size;
      tint.copy(quiet);
      if (linked[i]) tint.lerp(active, wired);
      if (onFocus) tint.lerp(hot, Math.max(wired * 0.5, isolate));
      else tint.lerp(page, isolate * (linked[i] ? 0.86 : 0.92));
      tint.lerp(page, 1 - arrive);

      rgb[i * 3] = tint.r;
      rgb[i * 3 + 1] = tint.g;
      rgb[i * 3 + 2] = tint.b;
    }
    attr.current.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
      <circleGeometry args={[1, 10]}>
        <instancedBufferAttribute ref={attr} attach="attributes-color"
                                  args={[rgb, 3]} />
      </circleGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

function Edges({ scene, spots, focusRun, order, phase, colors }) {
  const attr = useRef();
  const point = useRef();
  const material = useRef();
  const { source, target, bits, signal } = scene.edges;
  const count = source.length;

  const xyz = useMemo(() => new Float32Array(count * 6), [count]);
  const rgb = useMemo(() => new Float32Array(count * 6), [count]);

  useFrame(() => {
    if (!attr.current || !point.current || !material.current) return;
    const page = linear(colors.base);
    const ink = linear(colors.info);
    const hot = linear(colors.fg);

    const zin = ease(span(phase, 0.12, 0.3));
    const isolate = ease(span(phase, 0.62, 0.8));
    material.current.opacity = mix(0.16, 0.5, zin);

    const slot = 0.28 / order.length;
    for (let e = 0; e < count; e += 1) {
      const rank = order.indexOf(signal[e]);
      const shown = ease(span(phase, 0.3 + rank * slot, 0.3 + (rank + 1) * slot));
      const weight = 0.6 + 0.4 * Math.min(1, (bits[e] - 14) / 38);
      const inFocus = source[e] >= focusRun.start
        && source[e] < focusRun.start + focusRun.size
        && target[e] >= focusRun.start
        && target[e] < focusRun.start + focusRun.size;

      tint.copy(page).lerp(ink, shown * weight);
      if (inFocus) tint.lerp(hot, isolate * 0.6);
      else tint.lerp(page, isolate * 0.88);

      for (const v of [0, 1]) {
        rgb[e * 6 + v * 3] = tint.r;
        rgb[e * 6 + v * 3 + 1] = tint.g;
        rgb[e * 6 + v * 3 + 2] = tint.b;
      }

      // An edge that has not been revealed collapses to a point rather than
      // drawing itself in the page colour over the field.
      const a = source[e] * 2;
      const b = shown > 0.01 ? target[e] * 2 : source[e] * 2;
      xyz[e * 6] = spots[a];
      xyz[e * 6 + 1] = spots[a + 1];
      xyz[e * 6 + 3] = spots[b];
      xyz[e * 6 + 4] = spots[b + 1];
    }
    attr.current.needsUpdate = true;
    point.current.needsUpdate = true;
  });

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={point} attach="attributes-position" args={[xyz, 3]} />
        <bufferAttribute ref={attr} attach="attributes-color" args={[rgb, 3]} />
      </bufferGeometry>
      <lineBasicMaterial ref={material} vertexColors transparent
                         depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

/* The region the scene is about to move into, marked before it moves. */
function Viewfinder({ centre, phase, colors }) {
  const group = useRef();
  const [w, h] = WINDOW;

  useFrame(() => {
    if (!group.current) return;
    const on = ease(span(phase, 0.03, 0.09)) * (1 - ease(span(phase, 0.15, 0.26)));
    group.current.visible = on > 0.02;
    group.current.children.forEach((m) => { m.material.opacity = on; });
  });

  const bars = [
    [0, h / 2, w, 0.3], [0, -h / 2, w, 0.3],
    [-w / 2, 0, 0.3, h], [w / 2, 0, 0.3, h],
  ];

  return (
    <group ref={group} position={[centre[0], centre[1], 1]}>
      {bars.map(([x, y, bw, bh]) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0]}>
          <planeGeometry args={[bw, bh]} />
          <meshBasicMaterial color={colors.fg} transparent toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Rule({ y, width, value, label, reading, colors, show }) {
  const px = usePxPerUnit();
  const at = width * Math.min(1, Math.max(0, value)) * show;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[width / 2, 0, 0]}>
        <planeGeometry args={[width, 0.18]} />
        <meshBasicMaterial color={colors.line} transparent opacity={show}
                           toneMapped={false} />
      </mesh>
      <mesh position={[at / 2, 0, 0.1]}>
        <planeGeometry args={[Math.max(at, 0.001), 0.6]} />
        <meshBasicMaterial color={colors.fg} transparent opacity={show}
                           toneMapped={false} />
      </mesh>
      <Html position={[width / 2, 4.6, 0]} center transform={false}
            zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", width: `${width * px}px`, opacity: show }}>
        <span className="flex items-baseline justify-between gap-4">
          <span className="label">{label}</span>
          <span className="tnum text-[13px] text-fg">{reading}</span>
        </span>
      </Html>
    </group>
  );
}

function CostAxis({ y, width, costs, colors, show }) {
  const px = usePxPerUnit();
  const max = Math.max(...costs.map((c) => c.value));
  return (
    <group position={[0, y, 0]}>
      <mesh position={[width / 2, 0, 0]}>
        <planeGeometry args={[width, 0.22]} />
        <meshBasicMaterial color={colors["line-strong"]} transparent opacity={show}
                           toneMapped={false} />
      </mesh>
      {costs.map((c) => (
        <group key={c.action} position={[(c.value / max) * width, 0, 0.1]}>
          <mesh>
            <planeGeometry args={[c.chosen ? 0.5 : 0.24, c.chosen ? 3.8 : 2.2]} />
            <meshBasicMaterial color={c.chosen ? colors[c.tone] : colors["line-loud"]}
                               transparent opacity={show} toneMapped={false} />
          </mesh>
          <Html position={[0, c.chosen ? -6 : 5, 0]} center transform={false}
                zIndexRange={[8, 0]}
                style={{ pointerEvents: "none", width: `${22 * px}px`, opacity: show }}>
            <span className="block text-center">
              <span className="tnum block text-[12.5px] leading-none"
                    style={{ color: c.chosen ? `var(--color-${c.tone})`
                                             : "var(--color-fg-muted)" }}>
                {c.display}
              </span>
              <span className="label mt-1 block">{c.action}</span>
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}

function Decision({ focus, phase, colors, costs }) {
  const px = usePxPerUnit();
  const show = ease(span(phase, 0.78, 1));
  if (show <= 0.001) return null;
  const w = 66;

  return (
    <group position={[PANEL_X, 0, 3]}>
      <mesh position={[w / 2, -2, -0.5]}>
        <planeGeometry args={[w + 16, 68]} />
        <meshBasicMaterial color={colors.base} transparent opacity={show * 0.97}
                           toneMapped={false} />
      </mesh>
      <Html position={[w / 2, 23, 0]} center transform={false} zIndexRange={[9, 0]}
            style={{ pointerEvents: "none", width: `${w * px}px`, opacity: show }}>
        <div>
          <div className="label">Cluster {focus.cluster_id}</div>
          <div className="mt-1.5 text-[15px] text-fg">
            {focus.size} accounts · strongest signal {focus.strongest_signal}
          </div>
        </div>
      </Html>

      <Rule y={11} width={w} value={focus.probability} colors={colors} show={show}
            label="Ring probability" reading={focus.probability.toFixed(4)} />
      <Rule y={0} width={w} value={focus.predicted_ring_purity} colors={colors}
            show={show} label="Predicted ring purity"
            reading={focus.predicted_ring_purity.toFixed(4)} />

      <Html position={[w / 2, -9.4, 0]} center transform={false} zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", width: `${w * px}px`, opacity: show }}>
        <span className="label block">Expected cost of each action</span>
      </Html>
      <CostAxis y={-15} width={w} costs={costs} colors={colors} show={show} />

      <Html position={[w / 2, -27, 0]} center transform={false} zIndexRange={[9, 0]}
            style={{ pointerEvents: "none", width: `${w * px}px`, opacity: show }}>
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <span className="label">Cheapest action</span>
          <span className="tnum text-[30px] leading-none font-medium uppercase"
                style={{ color: `var(--color-${costs.find((c) => c.chosen).tone})` }}>
            {focus.action}
          </span>
        </div>
      </Html>
    </group>
  );
}

function Scene({ scene, phase }) {
  const colors = useThemeColors();
  const field = useRef();
  const view = useRef({ scale: 1 });
  const [w, h] = scene.field;
  const n = scene.n_accounts;

  const spots = useMemo(() => {
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      const [x, y] = place(i, w, h);
      out[i * 2] = x;
      out[i * 2 + 1] = y;
    }
    return out;
  }, [n, w, h]);

  const linked = useMemo(() => {
    const seen = new Uint8Array(n);
    for (let e = 0; e < scene.edges.source.length; e += 1) {
      seen[scene.edges.source[e]] = 1;
      seen[scene.edges.target[e]] = 1;
    }
    return seen;
  }, [scene, n]);

  const focusRun = useMemo(() => scene.runs.find((r) => r.focus), [scene]);

  // Weakest signal first, so the picture is built by evidence accumulating
  // rather than handed over by the one strong field.
  const order = useMemo(() => {
    const tally = new Map();
    for (const s of scene.edges.signal) tally.set(s, (tally.get(s) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  }, [scene]);

  const centre = useMemo(() => {
    let x = 0;
    let y = 0;
    for (let i = focusRun.start; i < focusRun.start + focusRun.size; i += 1) {
      x += spots[i * 2];
      y += spots[i * 2 + 1];
    }
    return [x / focusRun.size, y / focusRun.size];
  }, [focusRun, spots]);

  const costs = useMemo(() => {
    const c = scene.focus.expected_cost_rupees;
    const cheapest = Object.keys(c).reduce((a, b) => (c[a] <= c[b] ? a : b));
    return ["block", "review", "allow"].map((action) => ({
      action,
      value: c[action],
      display: `₹${c[action].toLocaleString("en-IN")}`,
      chosen: action === cheapest,
      tone: { block: "bad", review: "warn", allow: "ok" }[action],
    }));
  }, [scene]);

  useFrame(() => {
    if (!field.current) return;
    const zin = ease(span(phase, 0.12, 0.3));
    const close = ease(span(phase, 0.62, 0.82));
    const s = mix(1, mix(ZOOM_NEAR, ZOOM_CLOSE, close), zin);
    view.current.scale = s;
    field.current.scale.setScalar(s);
    field.current.position.set(
      -centre[0] * s * zin - 62 * close,
      -centre[1] * s * zin,
      0,
    );
  });

  return (
    <>
      <group ref={field}>
        <Marks n={n} spots={spots} focusRun={focusRun} phase={phase}
               colors={colors} view={view} linked={linked} />
        <Edges scene={scene} spots={spots} focusRun={focusRun} order={order}
               phase={phase} colors={colors} />
        <Viewfinder centre={centre} phase={phase} colors={colors} />
      </group>
      <Decision focus={scene.focus} phase={phase} colors={colors} costs={costs} />
    </>
  );
}

/*
  The opening scene. Twelve thousand accounts on a lattice, then a move into one
  neighbourhood of it where a mark is an account you can see and an edge is a
  line you can follow. The edges a real run drew arrive one comparison at a
  time, and the community that holds together is the one that gets decided.
*/
export function Population({ scene, phase, className }) {
  const [w, h] = scene.field;
  return (
    <ChartCanvas width={w + 12} height={h + 6} className={className}>
      <Scene scene={scene} phase={phase} />
    </ChartCanvas>
  );
}
