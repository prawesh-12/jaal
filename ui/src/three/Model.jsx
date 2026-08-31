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
