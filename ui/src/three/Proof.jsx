import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";

const dummy = new THREE.Object3D();
const linear = (css) => new THREE.Color(css).convertSRGBToLinear();

function Cells({ total, marked, cols, cell, colors, grow }) {
  const mesh = useRef();
  const rows = Math.ceil(total / cols);
  const colorBuf = useMemo(() => new Float32Array(total * 3), [total]);
  const attr = useRef();

  useLayoutEffect(() => {
    if (!mesh.current || !attr.current) return;
    const right = linear(colors["fg-2"]);
    const wrong = linear(colors.bad);
    for (let i = 0; i < total; i += 1) {
      const c = marked.has(i) ? wrong : right;
      colorBuf[i * 3] = c.r;
      colorBuf[i * 3 + 1] = c.g;
      colorBuf[i * 3 + 2] = c.b;
      dummy.position.set((i % cols) * cell - ((cols - 1) * cell) / 2,
                         ((rows - 1) * cell) / 2 - Math.floor(i / cols) * cell, 0);
      dummy.scale.setScalar(cell * 0.62);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    attr.current.needsUpdate = true;
  }, [colorBuf, colors, cols, cell, rows, total, marked]);

  useFrame(() => {
    if (mesh.current) mesh.current.scale.setScalar(grow.current);
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, total]}
                   frustumCulled={false}>
      <planeGeometry args={[1, 1]}>
        <instancedBufferAttribute ref={attr} attach="attributes-color"
                                  args={[colorBuf, 3]} />
      </planeGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

function Marker({ index, cols, cell, rows, colors, label }) {
  const px = usePxPerUnit();
  const x = (index % cols) * cell - ((cols - 1) * cell) / 2;
  const y = ((rows - 1) * cell) / 2 - Math.floor(index / cols) * cell;
  const top = (rows * cell) / 2 + 2;
  return (
    <group position={[x, 0, 1]}>
      <mesh position={[0, y, 0]}>
        <ringGeometry args={[cell * 1.7, cell * 2.1, 32]} />
        <meshBasicMaterial color={colors.bad} toneMapped={false}
                           side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, (y + cell * 2.1 + top) / 2, 0]}>
        <planeGeometry args={[0.22, top - y - cell * 2.1]} />
        <meshBasicMaterial color={colors.bad} toneMapped={false} />
      </mesh>
      <Html position={[0, top + 1.6, 0]} center transform={false}
            zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", width: `${30 * px}px` }}>
        <span className="block text-center text-[12px] leading-tight whitespace-nowrap"
              style={{ color: "var(--color-bad)" }}>
          {label}
        </span>
      </Html>
    </group>
  );
}

/*
  One cell per account Jaal blocked on the sealed holdout, and the ones it got
  wrong marked. The whole argument for the cost model is how hard the marked
  cell is to find.
*/
export function BlockedGrid({ total, wrong, label, className }) {
  const colors = useThemeColors();
  const cols = Math.ceil(Math.sqrt(total * 3.4));
  const rows = Math.ceil(total / cols);
  const cell = 1;
  const marked = useMemo(() => {
    const at = new Set();
    // Spread the wrong ones through the grid rather than bunching them.
    for (let i = 0; i < wrong; i += 1) {
      at.add(Math.floor(((i + 0.5) / wrong) * total * 0.61) % total);
    }
    return at;
  }, [wrong, total]);

  return (
    <ChartCanvas width={cols * cell + 6} height={rows * cell + 10}
                 className={className}>
      <Grid total={total} marked={marked} cols={cols} rows={rows} cell={cell}
            colors={colors} label={label} />
    </ChartCanvas>
  );
}

function Grid({ total, marked, cols, rows, cell, colors, label }) {
  const { invalidate } = useThree();
  const grow = useRef(0);

  useFrame((_, delta) => {
    if (grow.current >= 1) return;
    grow.current = Math.min(1, grow.current + delta * 1.4);
    invalidate();
  });

  return (
    <group>
      <Cells total={total} marked={marked} cols={cols} cell={cell}
             colors={colors} grow={grow} />
      {[...marked].map((i) => (
        <Marker key={i} index={i} cols={cols} rows={rows} cell={cell}
                colors={colors} label={label} />
      ))}
    </group>
  );
}

const LO = 0.86;
const HI = 1.0;
const W = 118;
const H = 40;

/*
  Precision on one axis with the break-even line across it. Above the line
  blocking pays for itself, below it every batch of blocks loses money, and
  where each detector lands is the whole economic argument.
*/
export function PrecisionScale({ breakeven, points, className }) {
  const colors = useThemeColors();
  const toX = (p) => ((Math.max(p, LO) - LO) / (HI - LO)) * W - W / 2;
  const cut = toX(breakeven);

  return (
    <ChartCanvas width={W + 12} height={H} className={className}>
      <ScaleBody colors={colors} toX={toX} cut={cut} points={points}
                 breakeven={breakeven} />
    </ChartCanvas>
  );
}

function ScaleBody({ colors, toX, cut, points, breakeven }) {
  const px = usePxPerUnit();
  const left = -W / 2;
  const right = W / 2;

  return (
    <group>
      <mesh position={[(left + cut) / 2, 0, -3]}>
        <planeGeometry args={[cut - left, 13]} />
        <meshBasicMaterial color={colors.bad} transparent opacity={0.1}
                           toneMapped={false} />
      </mesh>
      <mesh position={[(cut + right) / 2, 0, -3]}>
        <planeGeometry args={[right - cut, 13]} />
        <meshBasicMaterial color={colors.ok} transparent opacity={0.12}
                           toneMapped={false} />
      </mesh>

      <mesh position={[cut, 0, -1]}>
        <planeGeometry args={[0.35, 17]} />
        <meshBasicMaterial color={colors.fg} toneMapped={false} />
      </mesh>
      <Html position={[cut, 11, 0]} center transform={false} zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", width: `${34 * px}px` }}>
        <span className="block text-center">
          <span className="tnum block text-[13px] text-fg">
            {(breakeven * 100).toFixed(2)}%
          </span>
          <span className="label block">break-even</span>
        </span>
      </Html>

      <Html position={[left + 1, 5.6, 0]} transform={false} zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", width: `${30 * px}px` }}>
        <span className="label block" style={{ color: "var(--color-bad)" }}>
          blocking loses money
        </span>
      </Html>
      <Html position={[right - 1, 5.6, 0]} transform={false} zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", transform: "translateX(-100%)",
                     width: `${30 * px}px` }}>
        <span className="label block text-right" style={{ color: "var(--color-ok)" }}>
          blocking pays
        </span>
      </Html>

      {points.map((p, i) => {
        const x = toX(p.value);
        const y = i % 2 === 0 ? -3.2 : 3.2;
        return (
          <group key={p.label} position={[x, y, 1]}>
            <mesh>
              <circleGeometry args={[1.5, 24]} />
              <meshBasicMaterial color={colors[p.tone]} toneMapped={false} />
            </mesh>
            <Html position={[0, y > 0 ? 3 : -3, 0]} center transform={false}
                  zIndexRange={[9, 0]}
                  style={{ pointerEvents: "none", width: `${36 * px}px`,
                           transform: `translate(-50%, ${y > 0 ? "-100%" : "0"})` }}>
              <span className="block text-center">
                <span className="tnum block text-[14px] leading-none text-fg">
                  {p.display}
                </span>
                <span className="t-meta mt-0.5 block whitespace-nowrap">
                  {p.label}
                </span>
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
