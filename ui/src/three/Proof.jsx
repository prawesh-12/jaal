import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { SceneLights, SURFACE, useBeadMaterial, useSpring }
  from "@/three/surface";

const dummy = new THREE.Object3D();
/* Straight from the stylesheet. Colour management is off, see CanvasHost. */
const paint = (css) => new THREE.Color(css);

function Cells({ total, marked, cols, cell, colors, grow }) {
  const mesh = useRef();
  const rows = Math.ceil(total / cols);
  const colorBuf = useMemo(() => new Float32Array(total * 3), [total]);
  const attr = useRef();
  const material = useBeadMaterial(colors.base);
  const drawn = useRef(-1);

  useLayoutEffect(() => {
    if (!attr.current) return;
    const right = paint(colors["fg-2"]);
    const wrong = paint(colors.bad);
    for (let i = 0; i < total; i += 1) {
      const c = marked.has(i) ? wrong : right;
      colorBuf[i * 3] = c.r;
      colorBuf[i * 3 + 1] = c.g;
      colorBuf[i * 3 + 2] = c.b;
    }
    attr.current.needsUpdate = true;
    drawn.current = -1;
  }, [colorBuf, colors, total, marked]);

  useFrame(() => {
    if (!mesh.current) return;
    const t = grow.current;
    if (t === drawn.current) return;
    drawn.current = t;

    const spread = total * 0.22;
    const head = t * (total + spread);
    for (let i = 0; i < total; i += 1) {
      const local = Math.max(0, Math.min(1, (head - i) / spread));
      dummy.position.set((i % cols) * cell - ((cols - 1) * cell) / 2,
                         ((rows - 1) * cell) / 2 - Math.floor(i / cols) * cell, 0);
      dummy.scale.setScalar(Math.max(cell * 0.62 * local, 0.0001));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, total]}
                   material={material} frustumCulled={false}>
      <planeGeometry args={[1, 1]}>
        <instancedBufferAttribute ref={attr} attach="attributes-aTint"
                                  args={[colorBuf, 3]} />
      </planeGeometry>
    </instancedMesh>
  );
}

function Marker({ index, cols, cell, rows, colors, label, grow }) {
  const px = usePxPerUnit();
  const ring = useRef();
  const stem = useRef();

  useFrame(() => {
    const show = Math.max(0, Math.min(1, grow.current * 1.35 - 0.35));
    if (ring.current) ring.current.scale.setScalar(0.4 + 0.6 * show);
    if (stem.current) stem.current.scale.y = show;
  });

  const x = (index % cols) * cell - ((cols - 1) * cell) / 2;
  const y = ((rows - 1) * cell) / 2 - Math.floor(index / cols) * cell;
  const top = (rows * cell) / 2 + 2;
  return (
    <group position={[x, 0, 1]}>
      <mesh ref={ring} position={[0, y, 0]}>
        <ringGeometry args={[cell * 1.7, cell * 2.1, 32]} />
        <meshBasicMaterial color={colors.bad} toneMapped={false}
                           side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={stem} position={[0, (y + cell * 2.1 + top) / 2, 0]}>
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
    grow.current = Math.min(1, grow.current + delta * 1.5);
    invalidate();
  });

  return (
    <group>
      <Cells total={total} marked={marked} cols={cols} cell={cell}
             colors={colors} grow={grow} />
      {[...marked].map((i) => (
        <Marker key={i} index={i} cols={cols} rows={rows} cell={cell}
                colors={colors} label={label} grow={grow} />
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
export function PrecisionScale({ breakeven, points, compact = false, className }) {
  const colors = useThemeColors();
  const toX = (p) => ((Math.max(p, LO) - LO) / (HI - LO)) * W - W / 2;
  const cut = toX(breakeven);

  return (
    <ChartCanvas width={W + 12} height={compact ? H * 0.62 : H}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <ScaleBody colors={colors} toX={toX} cut={cut} points={points}
                 breakeven={breakeven} compact={compact} />
    </ChartCanvas>
  );
}

function Landing({ point, to, from, y, delay, colors, px, compact }) {
  const group = useRef();
  const { invalidate } = useThree();
  const clock = useRef(0);
  const slide = useSpring(0, 170, 25);

  useFrame((_, delta) => {
    clock.current += delta;
    slide.target = clock.current > delay ? 1 : 0;
    const t = slide.step(delta);
    if (group.current) {
      group.current.position.x = from + (to - from) * t;
      group.current.scale.setScalar(Math.max(t, 0.001));
    }
    if (!slide.settled) invalidate();
  });

  return (
    <group ref={group} position={[from, y, 2.4]}>
      <mesh>
        <sphereGeometry args={[1.6, 20, 14]} />
        <meshStandardMaterial color={colors[point.tone]} {...SURFACE}
                              toneMapped={false} />
      </mesh>
      {!compact && (
        <Html position={[0, y > 0 ? 3 : -3, 0]} center transform={false}
              zIndexRange={[9, 0]}
              style={{ pointerEvents: "none", width: `${36 * px}px`,
                       transform: `translate(-50%, ${y > 0 ? "-100%" : "0"})` }}>
          <span className="block text-center">
            <span className="tnum block text-[14px] leading-none text-fg">
              {point.display}
            </span>
            <span className="t-meta mt-0.5 block whitespace-nowrap">
              {point.label}
            </span>
          </span>
        </Html>
      )}
    </group>
  );
}

function ScaleBody({ colors, toX, cut, points, breakeven, compact }) {
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
      <Html position={[cut, compact ? 8 : 11, 0]} center transform={false}
            zIndexRange={[8, 0]}
            style={{ pointerEvents: "none", width: `${34 * px}px` }}>
        <span className="block text-center">
          <span className="tnum block text-[13px] text-fg">
            {(breakeven * 100).toFixed(2)}%
          </span>
          <span className="label block">break-even</span>
        </span>
      </Html>

      {!compact && (
        <>
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
        </>
      )}

      {points.map((p, i) => (
        <Landing key={p.label} point={p} to={toX(p.value)} from={left}
                 y={compact ? 0 : (i % 2 === 0 ? -3.2 : 3.2)} delay={i * 0.09}
                 colors={colors} px={px} compact={compact} />
      ))}
    </group>
  );
}
