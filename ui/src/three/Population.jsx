import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { useBeadMaterial } from "@/three/surface";

const TILE = 10;
const WINDOW = [33, 11];
const ZOOM_NEAR = 6;
const ZOOM_CLOSE = 6.6;
const PANEL_X = 8;

const AT = {
  arrive: [0, 0.10],
  frameIn: [0.02, 0.06],
  frameOut: [0.10, 0.18],
  zoom: [0.08, 0.20],
  wire: [0.20, 0.50],
  edges: 0.20,
  edgeRun: 0.30,
  gather: [0.26, 0.58],
  isolate: [0.54, 0.70],
  close: [0.54, 0.72],
  decide: [0.70, 0.92],
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
/* Straight from the stylesheet. Colour management is off, see CanvasHost. */
const paint = (css) => new THREE.Color(css);
const ease = (t) => 1 - (1 - t) ** 3;
const span = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;

const fieldScale = (phase) => mix(
  1,
  mix(ZOOM_NEAR, ZOOM_CLOSE, ease(span(phase, ...AT.close))),
  ease(span(phase, ...AT.zoom)),
);

/* The groups the run's own edges make, which is the count the scene file
   already reports. Nothing here is invented. */
function components(n, source, target) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (i) => {
    let at = i;
    while (parent[at] !== at) {
      parent[at] = parent[parent[at]];
      at = parent[at];
    }
    return at;
  };
  for (let e = 0; e < source.length; e += 1) {
    const a = find(source[e]);
    const b = find(target[e]);
    if (a !== b) parent[a] = b;
  }
  const bag = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const list = bag.get(root);
    if (list) list.push(i);
    else bag.set(root, [i]);
  }
  return [...bag.values()].filter((m) => m.length > 1);
}

/* Where a group settles once its evidence has drawn it together, on its own
   centre. Positions are invented. A position is not a claim. */
function gatherSpots(spots, groups) {
  const out = Float32Array.from(spots);
  for (const members of groups) {
    let cx = 0;
    let cy = 0;
    for (const i of members) {
      cx += spots[i * 2];
      cy += spots[i * 2 + 1];
    }
    cx /= members.length;
    cy /= members.length;
    const radius = 0.5 * Math.sqrt(members.length) + 0.3;
    members.forEach((i, j) => {
      const at = radius * Math.sqrt((j + 0.5) / members.length);
      const angle = j * GOLDEN;
      out[i * 2] = cx + Math.cos(angle) * at;
      out[i * 2 + 1] = cy + Math.sin(angle) * at;
    });
  }
  return out;
}

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

function Marks({ n, sync, focusRun, phase, colors, linked, degree }) {
  const mesh = useRef();
  const attr = useRef();
  const px = usePxPerUnit();
  const material = useBeadMaterial(colors.base);
  const rgb = useMemo(() => new Float32Array(n * 3), [n]);
  const last = useRef({ size: 0, gather: -1, arrive: -1, wired: -1 });

  // Distance out from the middle, 0 at the centre and 1 at the corner.
  const delay = useMemo(() => {
    const rest = sync(0);
    const out = new Float32Array(n);
    let far = 1e-6;
    for (let i = 0; i < n; i += 1) {
      out[i] = Math.hypot(rest[i * 2], rest[i * 2 + 1]);
      if (out[i] > far) far = out[i];
    }
    for (let i = 0; i < n; i += 1) out[i] /= far;
    return out;
  }, [n, sync]);

  useFrame(() => {
    if (!mesh.current || !attr.current) return;

    const zin = ease(span(phase, ...AT.zoom));
    const size = mix(2.4, 12, zin) / (px * fieldScale(phase) * 2);
    const gather = ease(span(phase, ...AT.gather));
    const at = sync(gather);
    const arrive = ease(span(phase, ...AT.arrive));
    const swell = ease(span(phase, ...AT.wire));

    if (Math.abs(size - last.current.size) > 1e-5
        || gather !== last.current.gather
        || (last.current.arrive < 1 && arrive !== last.current.arrive)
        || swell !== last.current.wired) {
      last.current = { size, gather, arrive, wired: swell };
      const SPREAD = 0.55;
      for (let i = 0; i < n; i += 1) {
        const local = Math.max(0, Math.min(
          1, (arrive * (1 + SPREAD) - delay[i] * SPREAD) / (1 - SPREAD * 0.001)));
        const held = 1 + 0.85 * (degree.count[i] / degree.top) * swell;
        dummy.position.set(at[i * 2], at[i * 2 + 1], 0);
        dummy.scale.setScalar(Math.max(size * local * held, 1e-5));
        dummy.updateMatrix();
        mesh.current.setMatrixAt(i, dummy.matrix);
      }
      mesh.current.instanceMatrix.needsUpdate = true;
    }

    const quiet = paint(colors["fg-faint"]);
    const active = paint(colors["fg-2"]);
    const page = paint(colors.base);
    const hot = paint(colors.fg);

    const wired = ease(span(phase, ...AT.wire));
    const isolate = ease(span(phase, ...AT.isolate));

    for (let i = 0; i < n; i += 1) {
      const onFocus = i >= focusRun.start && i < focusRun.start + focusRun.size;
      tint.copy(quiet);
      if (linked[i]) tint.lerp(active, wired);
      if (onFocus) tint.lerp(hot, Math.max(wired * 0.5, isolate));
      else tint.lerp(page, isolate * (linked[i] ? 0.86 : 0.92));

      rgb[i * 3] = tint.r;
      rgb[i * 3 + 1] = tint.g;
      rgb[i * 3 + 2] = tint.b;
    }
    attr.current.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]}
                   material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]}>
        <instancedBufferAttribute ref={attr} attach="attributes-aTint"
                                  args={[rgb, 3]} />
      </planeGeometry>
    </instancedMesh>
  );
}

function Edges({ scene, spots, sync, focusRun, order, phase, colors, centre,
                 gauge }) {
  const attr = useRef();
  const px = usePxPerUnit();
  const mesh = useRef();
  const material = useRef();
  const { source, target, bits, signal } = scene.edges;
  const count = source.length;

  const rgb = useMemo(() => new Float32Array(count * 3), [count]);



  /* One signal holds two thirds of the edges, so a slot per signal would draw
     most of the picture in one go. Each edge gets its own moment instead. */
  const cue = useMemo(() => {
    const at = new Map(order.map((s, i) => [s, i]));
    const byRank = [...Array(count).keys()]
      .sort((a, b) => at.get(signal[a]) - at.get(signal[b]));
    const out = new Float32Array(count);
    byRank.forEach((e, k) => { out[e] = k / count; });
    return out;
  }, [order, signal, count]);

  /* An edge leaving the window reads as a stray line, so it goes as the move
     in completes. */
  const inWindow = useMemo(() => {
    const near = (i) => Math.abs(spots[i * 2] - centre[0]) <= WINDOW[0] / 2 + 2
      && Math.abs(spots[i * 2 + 1] - centre[1]) <= WINDOW[1] / 2 + 2;
    const out = new Uint8Array(count);
    for (let e = 0; e < count; e += 1) out[e] = near(source[e]) && near(target[e]) ? 1 : 0;
    return out;
  }, [count, source, target, spots, centre]);

  useFrame(() => {
    if (!attr.current || !mesh.current || !material.current) return;
    const page = paint(colors.base);
    const ink = paint(colors.info);
    const hot = paint(colors.fg);

    const zin = ease(span(phase, ...AT.zoom));
    const isolate = ease(span(phase, ...AT.isolate));
    material.current.opacity = mix(0.2, 0.9, zin);
    const thick = 1.6 / (px * fieldScale(phase) * 2);

    const at = sync(ease(span(phase, ...AT.gather)));
    for (let e = 0; e < count; e += 1) {
      const from = AT.edges + cue[e] * AT.edgeRun * 0.88;
      const reach = ease(span(phase, from, from + AT.edgeRun * 0.12));
      // Full length before full weight: a line lands, then firms up.
      const grew = Math.min(1, reach * 1.5);
      const shown = grew * (inWindow[e] ? 1 : 1 - zin);
      const strength = Math.min(1, (bits[e] - gauge.floor) / gauge.span);
      const weight = 0.55 + 0.45 * strength;
      const inFocus = source[e] >= focusRun.start
        && source[e] < focusRun.start + focusRun.size
        && target[e] >= focusRun.start
        && target[e] < focusRun.start + focusRun.size;

      tint.copy(page).lerp(ink, shown * weight);
      if (inFocus) tint.lerp(hot, isolate * 0.6);
      else tint.lerp(page, isolate * 0.88);

      rgb[e * 3] = tint.r;
      rgb[e * 3 + 1] = tint.g;
      rgb[e * 3 + 2] = tint.b;

      const a = source[e] * 2;
      const b = target[e] * 2;
      const ax = at[a];
      const ay = at[a + 1];
      const bx = ax + (at[b] - ax) * grew;
      const by = ay + (at[b + 1] - ay) * grew;
      const len = Math.hypot(bx - ax, by - ay);

      dummy.position.set((ax + bx) / 2, (ay + by) / 2, 0);
      dummy.rotation.set(0, 0, Math.atan2(by - ay, bx - ax));
      dummy.scale.set(Math.max(len, 1e-4), thick * (0.35 + 1.15 * strength), 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(e, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    attr.current.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}
                   frustumCulled={false}>
      <planeGeometry args={[1, 1]}>
        <instancedBufferAttribute ref={attr} attach="attributes-color"
                                  args={[rgb, 3]} />
      </planeGeometry>
      <meshBasicMaterial ref={material} vertexColors transparent
                         depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

// Without this the ribbon thickness is decoration.
function BitsKey({ gauge, phase, colors }) {
  const group = useRef();
  const px = usePxPerUnit();

  useFrame(() => {
    if (!group.current) return;
    const on = ease(span(phase, AT.edges, AT.edges + 0.06))
      * (1 - ease(span(phase, ...AT.isolate)));
    group.current.visible = on > 0.02;
    group.current.children.forEach((m) => {
      if (m.material) m.material.opacity = on;
    });
  });

  const rows = [
    [gauge.floor, 0.35, `${gauge.floor} bits, the threshold`],
    [gauge.floor + gauge.span, 1.5, `${Math.round(gauge.floor + gauge.span)} bits, the strongest`],
  ];

  return (
    <group ref={group} position={[-92, -24, 4]}>
      {rows.map(([, weight, text], i) => (
        <mesh key={text} position={[6, -i * 5, 0]}>
          <planeGeometry args={[12, weight]} />
          <meshBasicMaterial color={colors.info} transparent depthWrite={false}
                             toneMapped={false} />
        </mesh>
      ))}
      {rows.map(([, , text], i) => (
        <Html key={text} position={[14, -i * 5, 0]} transform={false}
              zIndexRange={[9, 0]}
              style={{ pointerEvents: "none", transform: "translate(0, -50%)",
                       width: `${34 * px}px` }}>
          <span className="tnum block text-[10.5px] whitespace-nowrap text-fg-muted">
            {text}
          </span>
        </Html>
      ))}
    </group>
  );
}

/* The region the scene is about to move into, marked before it moves. */
function Viewfinder({ centre, phase, colors }) {
  const group = useRef();
  const [w, h] = WINDOW;

  useFrame(() => {
    if (!group.current) return;
    const on = ease(span(phase, ...AT.frameIn))
      * (1 - ease(span(phase, ...AT.frameOut)));
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
  const show = ease(span(phase, ...AT.decide));
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
  const [w, h] = scene.field;
  const n = scene.n_accounts;

  // A fixed wobble on the lattice. Positions were already arbitrary, see
  // gatherSpots, and a quarter cell keeps a contiguous run a compact block.
  const spots = useMemo(() => {
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      const [x, y] = place(i, w, h);
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 24634.6345;
      out[i * 2] = x + (a - Math.floor(a) - 0.5) * 0.5;
      out[i * 2 + 1] = y + (b - Math.floor(b) - 0.5) * 0.5;
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

  // How many of the run's edges land on each account.
  const degree = useMemo(() => {
    const out = new Uint16Array(n);
    const { source, target } = scene.edges;
    for (let e = 0; e < source.length; e += 1) {
      out[source[e]] += 1;
      out[target[e]] += 1;
    }
    let top = 1;
    for (let i = 0; i < n; i += 1) if (out[i] > top) top = out[i];
    return { count: out, top };
  }, [scene, n]);

  const focusRun = useMemo(() => scene.runs.find((r) => r.focus), [scene]);

  const knots = useMemo(
    () => gatherSpots(spots, components(n, scene.edges.source, scene.edges.target)),
    [spots, n, scene],
  );

  /* Filled by whichever part of the scene asks first, so no component has to
     run before another. */
  const live = useMemo(() => Float32Array.from(spots), [spots]);
  const filled = useRef(-1);
  const sync = useCallback((gather) => {
    if (filled.current !== gather) {
      filled.current = gather;
      for (let i = 0; i < live.length; i += 1) {
        live[i] = mix(spots[i], knots[i], gather);
      }
    }
    return live;
  }, [live, spots, knots]);

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

  const gauge = useMemo(() => {
    const { bits } = scene.edges;
    let top = scene.threshold_bits;
    for (let e = 0; e < bits.length; e += 1) if (bits[e] > top) top = bits[e];
    return {
      floor: scene.threshold_bits,
      span: Math.max(top - scene.threshold_bits, 1),
    };
  }, [scene]);

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
    const zin = ease(span(phase, ...AT.zoom));
    const close = ease(span(phase, ...AT.close));
    const s = fieldScale(phase);
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
        <Marks n={n} sync={sync} focusRun={focusRun} phase={phase} degree={degree}
               colors={colors} linked={linked} />
        <Edges scene={scene} spots={spots} sync={sync} focusRun={focusRun}
               order={order} phase={phase} colors={colors} centre={centre}
               gauge={gauge} />
        <Viewfinder centre={centre} phase={phase} colors={colors} />
      </group>
      <BitsKey gauge={gauge} phase={phase} colors={colors} />
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
