import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useThemeColors } from "@/three/JaalCanvas";

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const mix = new THREE.Color();

// A colour written into an instanceColor or a vertex colour buffer is read as
// linear. Every colour here comes out of the stylesheet, which is sRGB.
const linear = (css) => new THREE.Color(css).convertSRGBToLinear();

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
    quiet: linear(colors["fg-dim"]),
    faint: linear(colors["line-strong"]),
    linked: linear(colors.info),
    risk: linear(colors.bad),
    block: linear(colors.bad),
    review: linear(colors.warn),
    allow: linear(colors.ok),
    page: linear(colors.base),
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
      scale[i] = stage === 1 ? 0.12
        : big ? 0.46
        : focus !== null ? (k >= 0 ? 0.16 : 0.1)
        : linked ? 0.32 : 0.19;
      if (stage === 2) scale[i] = onPair ? 0.7 : 0.12;
      if (selected?.kind === "account" && selected.id === i) scale[i] = 0.9;
    }
    return { rgb, scale };
  }, [world, geom, stage, focus, selected, pair, palette, n]);

  // Stable buffers. Handing JSX a fresh array on every render makes r3f build
  // a new GPU attribute each time, which is how you lose the WebGL context.
  const colorBuf = useMemo(() => new Float32Array(n * 3), [n]);
  const colorAttr = useRef();
  useLayoutEffect(() => {
    if (!colorAttr.current) return;
    colorBuf.set(rgb);
    colorAttr.current.needsUpdate = true;
    invalidate();
  }, [rgb, colorBuf, invalidate]);

  useFrame(() => {
    if (!mesh.current) return;
    for (let i = 0; i < n; i += 1) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1],
                         positions[i * 3 + 2]);
      dummy.scale.setScalar(scale[i]);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    // Picking tests this before it tests any instance, and it is stale the
    // moment the accounts move.
    mesh.current.computeBoundingSphere();
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
      <sphereGeometry args={[1, 8, 6]}>
        <instancedBufferAttribute ref={colorAttr} attach="attributes-color"
                                  args={[colorBuf, 3]} />
      </sphereGeometry>
      <meshLambertMaterial vertexColors toneMapped={false} />
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
    const weak = linear(colors["line-strong"]);
    const strong = linear(colors.info);
    const hot = linear(colors.fg);
    const page = linear(colors.base);
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

  if (pair) return <PairEdge pair={pair} positions={positions} />;

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

/* One pair on its own, while the evidence stage walks it to the threshold. */
function PairEdge({ pair, positions }) {
  const line = useRef();
  const colors = useThemeColors();
  const xyz = useMemo(() => new Float32Array(6), []);

  useFrame(() => {
    const a = pair.source * 3;
    const b = pair.target * 3;
    for (let k = 0; k < 3; k += 1) {
      xyz[k] = positions[a + k];
      xyz[k + 3] = positions[b + k];
    }
    if (line.current) line.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <line ref={line} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[xyz, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={pair.crossed ? colors.info : colors["line-loud"]}
                         toneMapped={false} />
    </line>
  );
}

/*
  The blocking stage as a grid of cells. Each cell is the same number of
  account pairs, and the lit ones are the pairs blocking kept. The point is
  the ratio, so the cells carry it instead of 72 million lines.
*/
function PairSpace({ blocking, visible }) {
  const mesh = useRef();
  const colors = useThemeColors();
  const cols = 60;
  const rows = 15;
  const total = cols * rows;
  const kept = Math.max(1, Math.round(
    total * blocking.n_candidate_pairs / blocking.n_possible_pairs));

  const colorBuf = useMemo(() => new Float32Array(total * 3), [total]);
  const colorAttr = useRef();
  useLayoutEffect(() => {
    if (!mesh.current || !colorAttr.current) return;
    const rgb = colorBuf;
    const on = linear(colors.info);
    const off = linear(colors.line);
    for (let i = 0; i < total; i += 1) {
      const c = i < kept ? on : off;
      rgb[i * 3] = c.r;
      rgb[i * 3 + 1] = c.g;
      rgb[i * 3 + 2] = c.b;
      dummy.position.set((i % cols) - cols / 2 + 0.5, 0,
                         Math.floor(i / cols) - rows / 2 + 0.5);
      dummy.scale.set(0.8, 0.28, 0.8);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    colorAttr.current.needsUpdate = true;
  }, [colorBuf, colors, kept, total]);

  return (
    <group position={[0, 24, -6]} rotation={[-0.78, 0, 0]}
           scale={visible ? 1.55 : 0.001} visible={visible}>
      <instancedMesh ref={mesh} args={[undefined, undefined, total]}
                     frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]}>
          <instancedBufferAttribute ref={colorAttr} attach="attributes-color"
                                    args={[colorBuf, 3]} />
        </boxGeometry>
        <meshLambertMaterial vertexColors toneMapped={false} />
      </instancedMesh>
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
      want.current = { target: [0, 0, 0], height: 12, back: 15 };
    } else if (stage >= 5 && focus !== null) {
      const rank = geom.islandOrder.indexOf(focus);
      const [x, z] = geom.centres.islands[rank];
      want.current = { target: [x, 4, z], height: 30, back: 36 };
    } else if (stage >= 4) {
      want.current = { target: [0, 2, 0], height: 72, back: 84 };
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
    out[pair.source * 3] = -4.5;
    out[pair.source * 3 + 1] = 0;
    out[pair.source * 3 + 2] = 0;
    out[pair.target * 3] = 4.5;
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
