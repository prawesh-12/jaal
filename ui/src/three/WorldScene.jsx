import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useThemeColors } from "@/three/JaalCanvas";
import { pairCells } from "@/lib/world";

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const mix = new THREE.Color();

/* Straight from the stylesheet. Colour management is off, see CanvasHost. */
const paint = (css) => new THREE.Color(css);

const LAYOUT_FOR_STAGE = ["field", "field", "field", "graph", "islands",
                          "islands", "islands"];

const ACTION_TOKEN = { block: "bad", review: "warn", allow: "ok" };

function purityColor(target, purity, quiet, risk) {
  return target.copy(quiet).lerp(risk, Math.min(1, Math.max(0, purity)));
}

function Accounts({ world, geom, stage, focus, selected, pair, onPick, onHover,
                    positions }) {
  const mesh = useRef();
  const colors = useThemeColors();
  const { invalidate } = useThree();
  const n = world.n_accounts;

  const palette = useMemo(() => ({
    quiet: paint(colors["fg-dim"]),
    faint: paint(colors["line-strong"]),
    linked: paint(colors.info),
    risk: paint(colors.bad),
    block: paint(colors.bad),
    review: paint(colors.warn),
    allow: paint(colors.ok),
    page: paint(colors.base),
  }), [colors]);

  const { rgb, scale } = useMemo(() => {
    const rgb = new Float32Array(n * 3);
    const scale = new Float32Array(n);
    const { clusterOf, degree } = geom;

    for (let i = 0; i < n; i += 1) {
      const k = clusterOf[i];
      const linked = degree[i] > 0;
      let c = palette.quiet;

      if (stage >= 4) {
        if (k < 0) c = palette.faint;
        else if (stage >= 6) c = palette[world.clusters[k].action];
        else if (stage === 5) {
          c = purityColor(tint, world.clusters[k].predicted_ring_purity,
                          palette.faint, palette.risk);
        } else c = palette.linked;
      } else if (stage >= 2 && linked) {
        c = palette.linked;
      }

      const inFocus = focus === null || k === focus;
      const onPair = pair !== null && (pair.source === i || pair.target === i);
      mix.copy(c);
      if (!inFocus) mix.lerp(palette.page, k >= 0 ? 0.78 : 0.9);
      if (stage === 1) mix.lerp(palette.page, 0.82);
      if (stage === 2) mix.lerp(palette.page, onPair ? 0 : 0.88);
      if (onPair) mix.copy(palette.linked);
      if (selected?.kind === "account" && selected.id === i) mix.copy(palette.risk);

      rgb[i * 3] = mix.r;
      rgb[i * 3 + 1] = mix.g;
      rgb[i * 3 + 2] = mix.b;

      const big = k >= 0 && inFocus;
      scale[i] = stage === 1 ? 0
        : big ? 0.46
        : focus !== null ? (k >= 0 ? 0.16 : 0.1)
        : linked ? 0.32 : 0.19;
      if (stage === 2) scale[i] = onPair ? 0.4 : 0;
      if (selected?.kind === "account" && selected.id === i) scale[i] = 0.9;
    }
    return { rgb, scale };
  }, [world, geom, stage, focus, selected, pair, palette, n]);

  // Stable buffers. Handing JSX a fresh array on every render makes r3f build
  // a new GPU attribute each time, which is how you lose the WebGL context.
  const colorBuf = useMemo(() => new Float32Array(n * 3), [n]);
  const shownScale = useMemo(() => new Float32Array(n), [n]);
  const colorAttr = useRef();
  const settled = useRef(false);

  useLayoutEffect(() => {
    settled.current = false;
    invalidate();
  }, [rgb, scale, invalidate]);

  // A stage change eases every account toward the new stage rather than
  // cutting to it.
  useFrame((_, delta) => {
    if (!mesh.current || !colorAttr.current) return;

    let moving = false;
    if (!settled.current) {
      const k = 1 - Math.exp(-Math.min(delta, 0.05) * 16);
      for (let i = 0; i < n; i += 1) {
        const ds = scale[i] - shownScale[i];
        if (Math.abs(ds) > 0.0015) moving = true;
        shownScale[i] += ds * k;

        for (let c = i * 3; c < i * 3 + 3; c += 1) {
          const dc = rgb[c] - colorBuf[c];
          if (Math.abs(dc) > 0.002) moving = true;
          colorBuf[c] += dc * k;
        }
      }
      if (!moving) {
        shownScale.set(scale);
        colorBuf.set(rgb);
        settled.current = true;
      }
      colorAttr.current.needsUpdate = true;
    }

    for (let i = 0; i < n; i += 1) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1],
                         positions[i * 3 + 2]);
      dummy.scale.setScalar(shownScale[i]);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    // Picking tests this before it tests any instance, and it is stale the
    // moment the accounts move.
    mesh.current.computeBoundingSphere();
    if (moving) invalidate();
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, n]}
      frustumCulled={false}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPick(e.instanceId);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(e.instanceId);
      }}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[1, 12, 8]}>
        <instancedBufferAttribute ref={colorAttr} attach="attributes-color"
                                  args={[colorBuf, 3]} />
      </sphereGeometry>
      <meshStandardMaterial vertexColors roughness={0.6} metalness={0.05}
                            toneMapped={false} />
    </instancedMesh>
  );
}

function Edges({ world, geom, stage, focus, highlight, pair, positions }) {
  const line = useRef();
  const colors = useThemeColors();
  const { source, target, bits } = world.edges;
  const count = source.length;

  const rgb = useMemo(() => new Float32Array(count * 6), [count]);
  const colorAttr = useRef();

  useLayoutEffect(() => {
    const out = rgb;
    const weak = paint(colors["line-strong"]);
    const strong = paint(colors.info);
    const hot = paint(colors.fg);
    const page = paint(colors.base);
    const set = new Set(highlight ?? []);

    for (let e = 0; e < count; e += 1) {
      const a = geom.clusterOf[source[e]];
      const inside = a >= 0 && a === geom.clusterOf[target[e]];
      const strength = Math.min(1, Math.max(0, (bits[e] - 14) / 40));
      tint.copy(weak).lerp(strong, strength);
      if (set.has(e)) tint.copy(hot);
      else if (focus !== null && a !== focus) tint.lerp(page, 0.93);
      else if (stage >= 4 && !inside) tint.lerp(page, 0.9);
      for (const v of [0, 1]) {
        out[e * 6 + v * 3] = tint.r;
        out[e * 6 + v * 3 + 1] = tint.g;
        out[e * 6 + v * 3 + 2] = tint.b;
      }
    }
    if (colorAttr.current) colorAttr.current.needsUpdate = true;
  }, [rgb, count, colors, bits, geom, stage, focus, highlight, source, target]);

  const xyz = useMemo(() => new Float32Array(count * 6), [count]);

  useFrame(() => {
    if (!line.current || stage < 2) return;
    for (let e = 0; e < count; e += 1) {
      const a = source[e] * 3;
      const b = target[e] * 3;
      xyz[e * 6] = positions[a];
      xyz[e * 6 + 1] = positions[a + 1];
      xyz[e * 6 + 2] = positions[a + 2];
      xyz[e * 6 + 3] = positions[b];
      xyz[e * 6 + 4] = positions[b + 1];
      xyz[e * 6 + 5] = positions[b + 2];
    }
    line.current.geometry.attributes.position.needsUpdate = true;
  });

  if (stage < 2) return null;

  if (pair) return <PairEvidence pair={pair} />;

  return (
    <lineSegments ref={line} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[xyz, 3]} />
        <bufferAttribute ref={colorAttr} attach="attributes-color"
                         args={[rgb, 3]} />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={0.75}
                         toneMapped={false} />
    </lineSegments>
  );
}

/* One pair, and the evidence between it: every comparison adds its bits, and
   past the mark the bar is an edge. */
const PAIR_X = 6;
const BAR_FROM = -PAIR_X + 0.8;
const BAR_SPAN = (PAIR_X - 0.8) * 2;

function PairEvidence({ pair }) {
  const colors = useThemeColors();
  const at = (bits) => BAR_FROM + (bits / pair.scale) * BAR_SPAN;
  const head = at(pair.running);
  const cut = at(pair.threshold);
  const tone = pair.crossed ? colors.info : colors["line-loud"];

  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[BAR_SPAN, 0.1, 0.9]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>

      <mesh position={[(BAR_FROM + head) / 2, 0.06, 0]}>
        <boxGeometry args={[Math.max(head - BAR_FROM, 0.001), 0.4, 1.05]} />
        <meshBasicMaterial color={tone} toneMapped={false} />
      </mesh>

      {pair.steps.slice(0, -1).map((r) => (
        <mesh key={r} position={[at(r), 0.14, 0]}>
          <boxGeometry args={[0.06, 0.42, 1.1]} />
          <meshBasicMaterial color={colors.base} toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[cut, 0.06, 0]}>
        <boxGeometry args={[0.14, 0.46, 1.3]} />
        <meshBasicMaterial color={colors.fg} toneMapped={false} />
      </mesh>
      <Html position={[cut, 0, -2.3]} center transform={false} zIndexRange={[6, 0]}
            style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span className="t-meta">{pair.threshold} bits, an edge is drawn</span>
      </Html>

      <Html position={[head, 0, 1.7]} center transform={false} zIndexRange={[6, 0]}
            style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span className="tnum text-[15px] font-medium"
              style={{ color: pair.crossed ? "var(--color-info)" : "var(--color-fg)" }}>
          {pair.running.toFixed(2)} bits
        </span>
      </Html>
    </group>
  );
}

/* Each cell holds as many pairs as blocking kept in total, so exactly one
   lights up and the picture is the ratio itself. */
function PairSpace({ blocking, visible }) {
  const mesh = useRef();
  const colors = useThemeColors();
  const cells = pairCells(blocking);
  const cols = Math.ceil(Math.sqrt(cells * 1.8));
  const rows = Math.ceil(cells / cols);
  const lit = Math.floor(cells / 2);

  const at = (i) => [(i % cols) - cols / 2 + 0.5, Math.floor(i / cols) - rows / 2 + 0.5];

  const colorBuf = useMemo(() => new Float32Array(cells * 3), [cells]);
  const colorAttr = useRef();
  useLayoutEffect(() => {
    if (!mesh.current || !colorAttr.current) return;
    const on = paint(colors.info);
    const off = paint(colors["line-strong"]);
    for (let i = 0; i < cells; i += 1) {
      const c = i === lit ? on : off;
      colorBuf[i * 3] = c.r;
      colorBuf[i * 3 + 1] = c.g;
      colorBuf[i * 3 + 2] = c.b;
      const [x, z] = at(i);
      dummy.position.set(x, i === lit ? 0.34 : 0, z);
      dummy.scale.set(0.8, i === lit ? 0.9 : 0.22, 0.8);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    colorAttr.current.needsUpdate = true;
  }, [colorBuf, colors, cells, lit, cols]);

  const [lx, lz] = at(lit);

  return (
    <group scale={visible ? 2.4 : 0.001} visible={visible}>
      <instancedMesh ref={mesh} args={[undefined, undefined, cells]}
                     frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]}>
          <instancedBufferAttribute ref={colorAttr} attach="attributes-color"
                                    args={[colorBuf, 3]} />
        </boxGeometry>
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0.05}
                            toneMapped={false} />
      </instancedMesh>
      <mesh position={[lx, 0.82, lz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.66, 0.73, 40]} />
        <meshBasicMaterial color={colors.fg} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ClusterRings({ world, geom, stage, focus, positions }) {
  const group = useRef();
  const colors = useThemeColors();

  const rings = useMemo(() => world.clusters.map((c, k) => ({
    k,
    radius: 0.62 * Math.sqrt(c.size) + 2.2,
    color: stage >= 6 ? colors[ACTION_TOKEN[c.action]] : colors["line-loud"],
  })), [world, stage, colors]);

  useFrame(() => {
    if (!group.current || stage < 4) return;
    group.current.children.forEach((ring, k) => {
      const members = world.clusters[k].members;
      let x = 0;
      let z = 0;
      for (const m of members) {
        x += positions[m * 3];
        z += positions[m * 3 + 2];
      }
      ring.position.set(x / members.length, 4.4, z / members.length);
    });
  });

  if (stage < 4) return null;

  return (
    <group ref={group}>
      {rings.map((r) => (
        <mesh key={r.k} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r.radius, r.radius + 0.16, 48]} />
          <meshBasicMaterial
            color={r.color}
            transparent
            opacity={focus === null ? 0.4 : focus === r.k ? 0.95 : 0.08}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig({ stage, focus, geom, viewNonce, walking }) {
  const { camera, controls, invalidate } = useThree();
  const want = useRef(null);

  useEffect(() => {
    if (walking) {
      want.current = { target: [0, 0, 0], height: 11, back: 21 };
    } else if (stage >= 5 && focus !== null) {
      const rank = geom.islandOrder.indexOf(focus);
      const [x, z] = geom.centres.islands[rank];
      want.current = { target: [x, 4, z], height: 30, back: 36 };
    } else if (stage >= 4) {
      want.current = { target: [0, 2, 0], height: 72, back: 84 };
    } else if (stage === 1) {
      // Nearly overhead, or a grid of cells reads as a squashed band.
      want.current = { target: [0, 0, 0], height: 58, back: 12 };
    } else {
      want.current = { target: [0, 0, 0], height: 92, back: 104 };
    }
    invalidate();
  }, [stage, focus, geom, viewNonce, walking, invalidate]);

  // Only while a move is outstanding, or the rig would haul the camera back
  // every frame and the reader could never pan anywhere.
  useFrame((_, delta) => {
    const w = want.current;
    if (!w || !controls) return;
    const [tx, ty, tz] = w.target;
    if (controls.target.distanceTo({ x: tx, y: ty, z: tz }) < 0.06
        && Math.abs(camera.position.y - (ty + w.height)) < 0.06) {
      want.current = null;
      return;
    }
    const k = Math.min(1, delta * 2.4);
    controls.target.lerp({ x: tx, y: ty, z: tz }, k);
    camera.position.lerp({ x: tx, y: ty + w.height, z: tz + w.back }, k);
    controls.update();
    invalidate();
  });

  return null;
}

export function WorldScene({ world, geom, stage, focus = null, selected = null,
                            highlightEdges = null, viewNonce = 0, pair = null,
                            onPick, onHover }) {
  const { invalidate } = useThree();
  const n = world.n_accounts;

  // Two members of one cluster sit anywhere on the disc, so aiming a camera at
  // the midpoint frames empty ground. The evidence stage brings the pair to the
  // middle instead and leaves the rest of the population where it was.
  const pairLayout = useMemo(() => {
    if (!pair) return null;
    const out = Float32Array.from(geom.field);
    out[pair.source * 3] = -PAIR_X;
    out[pair.source * 3 + 1] = 0;
    out[pair.source * 3 + 2] = 0;
    out[pair.target * 3] = PAIR_X;
    out[pair.target * 3 + 1] = 0;
    out[pair.target * 3 + 2] = 0;
    return out;
  }, [geom, pair?.source, pair?.target]);

  const positions = useMemo(() => new Float32Array(geom.field), [geom]);
  const travel = useRef({ from: geom.field, to: geom.field, t: 1 });
  const wanted = pairLayout ?? geom[LAYOUT_FOR_STAGE[stage]];

  useEffect(() => {
    travel.current = { from: Float32Array.from(positions), to: wanted, t: 0 };
    invalidate();
  }, [wanted, invalidate, positions]);

  useFrame((_, delta) => {
    const move = travel.current;
    if (move.t >= 1) return;
    move.t = Math.min(1, move.t + delta * 1.35);
    const e = 1 - (1 - move.t) ** 3;
    for (let i = 0; i < n * 3; i += 1) {
      positions[i] = move.from[i] + (move.to[i] - move.from[i]) * e;
    }
    invalidate();
  });

  return (
    <>
      <Accounts world={world} geom={geom} stage={stage} focus={focus}
                selected={selected} pair={pair} onPick={onPick} onHover={onHover}
                positions={positions} />
      <Edges world={world} geom={geom} stage={stage} focus={focus}
             highlight={highlightEdges} pair={pair} positions={positions} />
      <ClusterRings world={world} geom={geom} stage={stage} focus={focus}
                    positions={positions} />
      <PairSpace blocking={world.blocking} visible={stage === 1} />
      <CameraRig stage={stage} focus={focus} geom={geom} viewNonce={viewNonce}
                 walking={pairLayout !== null} />
    </>
  );
}
