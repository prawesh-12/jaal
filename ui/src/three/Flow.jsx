import { Html } from "@react-three/drei";
import { useMemo } from "react";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";

const NODE_W = 96;
const NODE_H = 16;
const GAP = 7;
const DEPTH = 3;

function Connector({ from, to, color }) {
  const mid = (from + to) / 2;
  return (
    <group position={[0, mid, 0]}>
      <mesh>
        <boxGeometry args={[0.5, Math.abs(from - to), 0.5]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, -(Math.abs(from - to) / 2) + 1.1, 0]}
            rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[1.5, 2.2, 3]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Node({ step, y, colors, width = NODE_W }) {
  const fill = colors[step.tone] ?? colors.surface;
  const solid = Boolean(step.tone);
  const px = usePxPerUnit();
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <boxGeometry args={[width, NODE_H, DEPTH]} />
        <meshLambertMaterial color={solid ? fill : colors.surface}
                             toneMapped={false} />
      </mesh>
      <Html center transform={false} zIndexRange={[10, 0]}
            style={{ pointerEvents: "none", width: `${width * px}px` }}>
        <span className="block px-2 text-center">
          <span className="block text-[13.5px] leading-tight font-medium"
                style={{ color: solid ? "var(--color-base)" : "var(--color-fg)" }}>
            {step.label}
          </span>
          {step.note && (
            <span className="mt-0.5 block text-[11.5px] leading-tight"
                  style={{ color: solid ? "var(--color-base)" : "var(--color-fg-muted)" }}>
              {step.note}
            </span>
          )}
        </span>
      </Html>
    </group>
  );
}

/* A vertical chain, optionally ending in a row of parallel outcomes. */
export function Flow({ steps, terminals, className }) {
  const colors = useThemeColors();
  const tail = terminals ? NODE_H + GAP : 0;
  const height = steps.length * (NODE_H + GAP) + GAP + tail;
  const rows = useMemo(() => {
    const top = (steps.length * (NODE_H + GAP) + tail) / 2 - NODE_H / 2;
    return steps.map((step, i) => ({ step, y: top - i * (NODE_H + GAP) }));
  }, [steps, tail]);

  const last = rows[rows.length - 1];
  const slot = terminals ? NODE_W / terminals.length : 0;

  return (
    <ChartCanvas width={NODE_W + 6} height={height} className={className}>
      {rows.map(({ step, y }, i) => (
        <group key={step.label}>
          <Node step={step} y={y} colors={colors} />
          {i < rows.length - 1 && (
            <Connector from={y - NODE_H / 2} to={rows[i + 1].y + NODE_H / 2}
                       color={colors["line-strong"]} />
          )}
        </group>
      ))}

      {terminals && terminals.map((step, i) => {
        const x = -NODE_W / 2 + slot * (i + 0.5);
        const y = last.y - (NODE_H + GAP);
        return (
          <group key={step.label} position={[x, 0, 0]}>
            <Connector from={last.y - NODE_H / 2} to={y + NODE_H / 2}
                       color={colors["line-strong"]} />
            <Node step={step} y={y} colors={colors} width={slot - 2} />
          </group>
        );
      })}
    </ChartCanvas>
  );
}

/* Two lanes side by side, for showing one architecture against another. */
export function FlowPair({ left, right, className }) {
  const colors = useThemeColors();
  const rows = Math.max(left.steps.length, right.steps.length);
  const title = NODE_H + GAP;
  const height = rows * (NODE_H + GAP) + GAP + title;
  const width = (NODE_W + 6) * 2 + 14;

  const px = usePxPerUnit();
  const lane = (side, x) => {
    const top = (side.steps.length * (NODE_H + GAP)) / 2 - NODE_H / 2 - title / 2;
    return (
      <group position={[x, 0, 0]}>
        <Html position={[0, top + NODE_H / 2 + GAP + 3, 0]} center transform={false}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none", width: `${NODE_W * px}px` }}>
          <span className="label block text-center">{side.title}</span>
        </Html>
        {side.steps.map((step, i) => (
          <group key={step.label}>
            <Node step={step} y={top - i * (NODE_H + GAP)} colors={colors} />
            {i < side.steps.length - 1 && (
              <Connector from={top - i * (NODE_H + GAP) - NODE_H / 2}
                         to={top - (i + 1) * (NODE_H + GAP) + NODE_H / 2}
                         color={colors["line-strong"]} />
            )}
          </group>
        ))}
      </group>
    );
  };

  const offset = (NODE_W + 14) / 2;

  return (
    <ChartCanvas width={width} height={height} className={className}>
      {lane(left, -offset)}
      {lane(right, offset)}
    </ChartCanvas>
  );
}
