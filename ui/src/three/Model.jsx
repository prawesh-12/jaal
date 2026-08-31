import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { SceneLights, SURFACE } from "@/three/surface";

function Rig() {
  const colors = useThemeColors();
  return <SceneLights ground={colors.surface} />;
}

// Each chart turns about the axis its values are not measured on, so a length
// still means exactly what it did.
const TILT_Y = [0, 0.22, 0];    // vertical bars: heights stay exact
const TILT_X = [-0.3, 0, 0];    // horizontal bars: lengths stay exact

const dummy = new THREE.Object3D();

export function Forest({ card, className }) {
  const width = 200;
  const height = 74;

  return (
    <ChartCanvas width={width} height={height} lights={<Rig />}
                 className={className}>
      <group rotation={TILT_Y}>
        <Trees card={card} width={width} height={height} />
      </group>
    </ChartCanvas>
  );
}

function Trees({ card, width, height }) {
  const colors = useThemeColors();
  const mesh = useRef();
  const { invalidate } = useThree();
  const grow = useRef(0);

  const { bins, lo, hi, tallest } = useMemo(() => {
    const low = card.depth_min;
    const high = card.depth_max;
    const counts = new Int32Array(high - low + 1);
    for (const d of card.tree_depth) counts[d - low] += 1;
    return {
      bins: counts,
      lo: low,
      hi: high,
      tallest: Math.max(...counts),
    };
  }, [card]);

  const n = bins.length;
  const slot = (width - 26) / n;
  const tall = height - 26;
  const floor = -tall / 2;

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const moving = grow.current < 1;
    if (moving) grow.current = Math.min(1, grow.current + delta * 2.2);

    const SPREAD = 0.45;
    for (let i = 0; i < n; i += 1) {
      const local = Math.max(0, Math.min(
        1, (grow.current * (1 + SPREAD) - (i / n) * SPREAD) / 1));
      const h = Math.max((bins[i] / tallest) * tall * local, 0.001);
      dummy.position.set(-width / 2 + 13 + slot * (i + 0.5), h / 2 + floor,
                         0);
      dummy.scale.set(slot * 0.68, h, slot * 1.6);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (moving) invalidate();
  });

  const at = (d) => -width / 2 + 13 + slot * (d - lo + 0.5);

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={colors.info} {...SURFACE} toneMapped={false} />
      </instancedMesh>

      <mesh position={[0, floor - 0.5, 0]}>
        <boxGeometry args={[width - 20, 0.4, 2.4]} />
        <meshStandardMaterial color={colors["line-strong"]} {...SURFACE}
                              toneMapped={false} />
      </mesh>

      <mesh position={[at(card.depth_mean), 0, 2.4]}>
        <boxGeometry args={[0.5, tall + 4, 0.5]} />
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
      <Html position={[at(card.depth_mean), tall / 2 + 4, 0]} center
            transform={false} zIndexRange={[10, 0]}
            style={{ pointerEvents: "none" }}>
        <span className="tnum whitespace-nowrap text-[10.5px]"
              style={{ color: "var(--color-accent)" }}>
          mean {card.depth_mean}
        </span>
      </Html>

      {[[lo, "left"], [hi, "right"]].map(([d, side]) => (
        <Html key={side} position={[at(d), floor - 3, 0]} center transform={false}
              zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span className="tnum block whitespace-nowrap text-[10.5px] text-fg-dim">
            {d}
          </span>
        </Html>
      ))}

      <Html position={[0, floor - 7.5, 0]} center transform={false}
            zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <span className="label whitespace-nowrap">Levels deep</span>
      </Html>
    </group>
  );
}

/* PR-AUC lost when a feature is shuffled on validation data. A negative one
   is a feature the model does not need. */
export function Weights({ rows, className }) {
  const label = 74;
  const back = 10;
  const arm = 126;
  const row = 10;
  const width = label + back + arm + 30;
  const height = rows.length * row + row * 2.2;

  return (
    <ChartCanvas width={width} height={height} lights={<Rig />}
                 className={className}>
      <group rotation={TILT_X}>
        <Rows rows={rows} zero={-width / 2 + label + back} row={row}
              arm={arm} height={height} />
      </group>
    </ChartCanvas>
  );
}

function Bar({ value, max, arm, row, colors, grow, index, total }) {
  const mesh = useRef();
  const full = Math.max((Math.abs(value) / max) * arm, 0.6);
  const dir = value < 0 ? -1 : 1;

  useFrame(() => {
    if (!mesh.current) return;
    const local = Math.max(0, Math.min(
      1, grow.current * (1 + 0.5) - (index / total) * 0.5));
    const w = Math.max(full * local, 0.001);
    mesh.current.scale.x = w;
    mesh.current.position.x = (dir * w) / 2;
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[1, row * 0.52, row * 0.46]} />
      <meshStandardMaterial color={value < 0 ? colors["line-loud"] : colors.info}
                            {...SURFACE} toneMapped={false} />
    </mesh>
  );
}

function Rows({ rows, zero, row, arm, height }) {
  const colors = useThemeColors();
  const { invalidate } = useThree();
  const grow = useRef(0);
  const max = Math.max(...rows.map((r) => Math.abs(r.value)));
  const top = ((rows.length - 1) * row) / 2;
  const negatives = rows.filter((r) => r.value < 0).length;

  useFrame((_, delta) => {
    if (grow.current >= 1) return;
    grow.current = Math.min(1, grow.current + delta * 2.1);
    invalidate();
  });

  return (
    <group>
      <mesh position={[zero, 0, 0]}>
        <boxGeometry args={[0.5, height - row * 0.4, 2.6]} />
        <meshStandardMaterial color={colors["line-loud"]} {...SURFACE}
                              toneMapped={false} />
      </mesh>

      <Html position={[zero, -height / 2 + row * 0.1, 0]} center transform={false}
            zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <span className="label whitespace-nowrap">0</span>
      </Html>

      {negatives > 0 && (
        <Html position={[zero - 6, -height / 2 + row * 0.1, 0]} transform={false}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none", transform: "translate(-100%, -50%)" }}>
          <span className="label whitespace-nowrap">
            {negatives} not needed
          </span>
        </Html>
      )}

      {rows.map((r, i) => (
        <group key={r.feature} position={[zero, top - i * row, 0]}>
          <Bar value={r.value} max={max} arm={arm} row={row} colors={colors}
               grow={grow} index={i} total={rows.length} />
          <Html position={[-13, 0, 0]} transform={false} zIndexRange={[10, 0]}
                style={{ pointerEvents: "none",
                         transform: "translate(-100%, -50%)" }}>
            <span className="ident block text-right text-[11.5px] whitespace-nowrap text-fg-muted">
              {r.feature}
            </span>
          </Html>
          <Html position={[arm + 4, 0, 0]} transform={false} zIndexRange={[10, 0]}
                style={{ pointerEvents: "none",
                         transform: "translate(0, -50%)" }}>
            <span className="tnum block text-[11.5px] whitespace-nowrap"
                  style={{ color: r.value < 0 ? "var(--color-fg-faint)"
                                              : "var(--color-fg-2)" }}>
              {r.value.toFixed(4)}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}

// The diagonal is where a raw score would already be a probability, so the gap
// to the staircase is the correction.
export function Calibration({ score, probability, className }) {
  const plot = 104;
  const pad = 16;

  return (
    <ChartCanvas width={plot + pad * 2} height={plot + pad * 2} lights={<Rig />}
                 className={className}>
      <Steps score={score} probability={probability} plot={plot} />
    </ChartCanvas>
  );
}

const GRID = [0.25, 0.5, 0.75];

function Steps({ score, probability, plot }) {
  const colors = useThemeColors();
  const { invalidate } = useThree();
  const draw = useRef(0);
  const half = plot / 2;
  const at = (s, p) => [s * plot - half, p * plot - half];

  const segments = useMemo(() => {
    const out = [];
    for (let i = 0; i < score.length - 1; i += 1) {
      const [ax, ay] = at(score[i], probability[i]);
      const [bx, by] = at(score[i + 1], probability[i + 1]);
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.01) continue;
      out.push({
        key: i,
        from: score[i],
        to: score[i + 1],
        x: (ax + bx) / 2,
        y: (ay + by) / 2,
        len,
        angle: Math.atan2(by - ay, bx - ax),
      });
    }
    return out;
  }, [score, probability]);

  // The first breakpoint the calibrator calls an even chance.
  const half50 = useMemo(() => {
    const i = probability.findIndex((p) => p >= 0.5);
    return i < 0 ? null : { raw: score[i], cal: probability[i] };
  }, [score, probability]);

  useFrame((_, delta) => {
    if (draw.current >= 1) return;
    draw.current = Math.min(1, draw.current + delta * 1.9);
    invalidate();
  });

  return (
    <group>
      <mesh position={[0, 0, -3]}>
        <planeGeometry args={[plot, plot]} />
        <meshBasicMaterial color={colors.surface} toneMapped={false} />
      </mesh>

      {GRID.map((g) => (
        <group key={g}>
          <mesh position={[g * plot - half, 0, -2.4]}>
            <planeGeometry args={[0.3, plot]} />
            <meshBasicMaterial color={colors.line} toneMapped={false} />
          </mesh>
          <mesh position={[0, g * plot - half, -2.4]}>
            <planeGeometry args={[plot, 0.3]} />
            <meshBasicMaterial color={colors.line} toneMapped={false} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, -half - 0.5, -2]}>
        <boxGeometry args={[plot, 0.4, 0.3]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>
      <mesh position={[-half - 0.5, 0, -2]}>
        <boxGeometry args={[0.4, plot, 0.3]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>

      <mesh position={[0, 0, -1.5]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[Math.SQRT2 * plot, 0.4, 0.3]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>

      {segments.map((s) => (
        <Step key={s.key} seg={s} draw={draw} colors={colors} />
      ))}

      {half50 && (
        <Readout raw={half50.raw} cal={half50.cal} at={at} half={half}
                 draw={draw} colors={colors} />
      )}

      {[["0", -half, -half, "translate(-100%, 0)"],
        ["1.0", half, -half, "translate(-50%, 0)"],
        ["1.0", -half, half, "translate(-100%, -50%)"]].map(([text, x, y, t], i) => (
        <Html key={i} position={[x - 1.5, y - 1.5, 0]} transform={false}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none", transform: t }}>
          <span className="tnum block pr-1.5 text-[10.5px] whitespace-nowrap text-fg-dim">
            {text}
          </span>
        </Html>
      ))}
    </group>
  );
}

function Step({ seg, draw, colors }) {
  const mesh = useRef();

  useFrame(() => {
    if (!mesh.current) return;
    const on = Math.max(0, Math.min(1, (draw.current - seg.from) * 6));
    mesh.current.scale.x = Math.max(on, 0.0001);
  });

  return (
    <mesh ref={mesh} position={[seg.x, seg.y, 1.6]} rotation={[0, 0, seg.angle]}>
      <boxGeometry args={[seg.len + 1.4, 1.6, 3.2]} />
      <meshStandardMaterial color={colors.info} {...SURFACE} toneMapped={false} />
    </mesh>
  );
}

function Readout({ raw, cal, at, half, draw, colors }) {
  const group = useRef();
  const [x, y] = at(raw, cal);

  useFrame(() => {
    if (!group.current) return;
    const on = Math.max(0, Math.min(1, (draw.current - raw) * 3));
    group.current.scale.setScalar(Math.max(on, 0.0001));
  });

  return (
    <group ref={group}>
      <mesh position={[(x - half) / 2, y, 0]}>
        <planeGeometry args={[x + half, 0.45]} />
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
      <mesh position={[x, (y - half) / 2, 0]}>
        <planeGeometry args={[0.45, y + half]} />
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
      <mesh position={[x, y, 3]}>
        <sphereGeometry args={[2, 18, 12]} />
        <meshStandardMaterial color={colors.accent} {...SURFACE} toneMapped={false} />
      </mesh>
      <Html position={[x + 3, y - 3, 0]} transform={false} zIndexRange={[11, 0]}
            style={{ pointerEvents: "none" }}>
        <span className="tnum block whitespace-nowrap text-[10.5px]"
              style={{ color: "var(--color-accent)" }}>
          {raw.toFixed(2)} vote &rarr; {cal.toFixed(2)}
        </span>
      </Html>
    </group>
  );
}
