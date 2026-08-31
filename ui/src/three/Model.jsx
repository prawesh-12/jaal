import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";

const dummy = new THREE.Object3D();

/* One bar per tree, as many levels tall as that tree grew, sorted so the ramp
   is the spread of the forest. */
export function Forest({ card, className }) {
  const width = 200;
  const height = 66;

  return (
    <ChartCanvas width={width} height={height} className={className}>
      <Trees card={card} width={width} height={height} />
    </ChartCanvas>
  );
}

function Trees({ card, width, height }) {
  const colors = useThemeColors();
  const mesh = useRef();
  const { invalidate } = useThree();
  const grow = useRef(0);

  const { depth, n, deepest } = useMemo(() => {
    const sorted = [...card.tree_depth].sort((a, b) => a - b);
    return {
      depth: Float32Array.from(sorted),
      n: sorted.length,
      deepest: sorted[sorted.length - 1],
    };
  }, [card]);

  const slot = (width - 8) / n;
  const tall = height - 18;

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const moving = grow.current < 1;
    if (moving) grow.current = Math.min(1, grow.current + delta * 1.4);

    for (let i = 0; i < n; i += 1) {
      const h = Math.max((depth[i] / deepest) * tall * grow.current, 0.001);
      dummy.position.set(-width / 2 + 4 + slot * (i + 0.5), h / 2 - tall / 2, 0);
      dummy.scale.set(slot * 0.78, h, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (moving) invalidate();
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={colors.info} toneMapped={false} />
      </instancedMesh>

      <mesh position={[0, -tall / 2 - 0.6, 0]}>
        <boxGeometry args={[width - 6, 0.35, 0.4]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>

      {/* Hung upward, or the text sits on the tallest trees. */}
      <Html position={[-width / 2 + 4, tall / 2 + 3, 0]} transform={false}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none", transform: "translateY(-100%)" }}>
        <span className="label whitespace-nowrap">
          {card.depth_min} levels
        </span>
      </Html>
      <Html position={[width / 2 - 4, tall / 2 + 3, 0]} transform={false}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none",
                     transform: "translate(-100%, -100%)" }}>
        <span className="label whitespace-nowrap">
          {card.depth_max} levels
        </span>
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
  const height = rows.length * row + row;

  return (
    <ChartCanvas width={width} height={height} className={className}>
      <Rows rows={rows} zero={-width / 2 + label + back} row={row}
            arm={arm} height={height} />
    </ChartCanvas>
  );
}

function Rows({ rows, zero, row, arm, height }) {
  const colors = useThemeColors();
  const max = Math.max(...rows.map((r) => Math.abs(r.value)));
  const top = ((rows.length - 1) * row) / 2;

  return (
    <group>
      <mesh position={[zero, 0, -1]}>
        <boxGeometry args={[0.35, height - row, 0.2]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>

      {rows.map((r, i) => {
        const y = top - i * row;
        const w = Math.max((Math.abs(r.value) / max) * arm, 0.6);
        const dir = r.value < 0 ? -1 : 1;
        return (
          <group key={r.feature} position={[zero, y, 0]}>
            <mesh position={[(dir * w) / 2, 0, 0]}>
              <planeGeometry args={[w, row * 0.5]} />
              <meshBasicMaterial
                color={r.value < 0 ? colors["line-loud"] : colors.info}
                toneMapped={false} />
            </mesh>
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
              <span className="tnum block text-[11.5px] whitespace-nowrap text-fg-2">
                {r.value.toFixed(4)}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/* The shipped step function, drawn from the breakpoints it was fitted with.
   The diagonal is where a raw score would already be a probability. */
export function Calibration({ score, probability, className }) {
  const plot = 96;
  const pad = 13;

  return (
    <ChartCanvas width={plot + pad * 2} height={plot + pad * 2} className={className}>
      <Steps score={score} probability={probability} plot={plot} />
    </ChartCanvas>
  );
}

function Steps({ score, probability, plot }) {
  const colors = useThemeColors();
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
        x: (ax + bx) / 2,
        y: (ay + by) / 2,
        len,
        angle: Math.atan2(by - ay, bx - ax),
      });
    }
    return out;
  }, [score, probability]);

  return (
    <group>
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
        <meshBasicMaterial color={colors.line} toneMapped={false} />
      </mesh>

      {segments.map((s) => (
        <mesh key={s.key} position={[s.x, s.y, 0]} rotation={[0, 0, s.angle]}>
          <boxGeometry args={[s.len + 1, 1.5, 1.5]} />
          <meshBasicMaterial color={colors.info} toneMapped={false} />
        </mesh>
      ))}

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
