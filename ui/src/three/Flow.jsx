import { Html } from "@react-three/drei";
import { useMemo } from "react";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { Rail, SceneLights, Shadow, SURFACE, slab } from "@/three/surface";

const NODE_W = 96;
const NODE_H = 16;
const NODE_D = 7;
const GAP = 7;

const TILT = [-0.16, 0.2, 0];

function Node({ step, y, colors, width = NODE_W, geometry }) {
  const solid = Boolean(step.tone);
  const fill = solid ? (colors[step.tone] ?? colors.fg) : colors.raised;
  const px = usePxPerUnit();

  return (
    <group position={[0, y, 0]}>
      <Shadow w={width * 1.4} h={NODE_H * 2.4} z={-NODE_D / 2 - 1.4} />
      <mesh geometry={geometry}>
        <meshStandardMaterial color={fill} {...SURFACE} toneMapped={false} />
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
                  style={{ color: solid ? "var(--color-base)"
                                        : "var(--color-fg-muted)" }}>
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
  const slot = terminals ? NODE_W / terminals.length : 0;

  const full = useMemo(
    () => slab({ w: NODE_W, h: NODE_H, d: NODE_D, r: 1.2 }), []);
  const part = useMemo(
    () => (slot ? slab({ w: slot - 2, h: NODE_H, d: NODE_D, r: 1.2 }) : null),
    [slot]);

  const rows = useMemo(() => {
    const top = (steps.length * (NODE_H + GAP) + tail) / 2 - NODE_H / 2;
    return steps.map((step, i) => ({ step, y: top - i * (NODE_H + GAP) }));
  }, [steps, tail]);

  const last = rows[rows.length - 1];

  return (
    <ChartCanvas width={NODE_W + 10} height={height}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <group rotation={TILT}>
        {rows.map(({ step, y }, i) => (
          <group key={step.label}>
            {i < rows.length - 1 && (
              <Rail ax={0} ay={y - NODE_H / 2} bx={0}
                    by={rows[i + 1].y + NODE_H / 2}
                    weight={0.8} rest={colors["line-strong"]} arrow />
            )}
            <Node step={step} y={y} colors={colors} geometry={full} />
          </group>
        ))}

        {terminals && terminals.map((step, i) => {
          const x = -NODE_W / 2 + slot * (i + 0.5);
          const y = last.y - (NODE_H + GAP);
          return (
            <group key={step.label} position={[x, 0, 0]}>
              <Rail ax={0} ay={last.y - NODE_H / 2} bx={0} by={y + NODE_H / 2}
                    weight={0.8} rest={colors["line-strong"]} arrow />
              <Node step={step} y={y} colors={colors} width={slot - 2}
                    geometry={part} />
            </group>
          );
        })}
      </group>
    </ChartCanvas>
  );
}

function LaneTitle({ y, title }) {
  const px = usePxPerUnit();
  return (
    <Html position={[0, y, 0]} center transform={false} zIndexRange={[10, 0]}
          style={{ pointerEvents: "none", width: `${NODE_W * px}px` }}>
      <span className="label block text-center">{title}</span>
    </Html>
  );
}

/* Two lanes side by side, or one above the other once there is no room to
   set them against each other. */
export function FlowPair({ left, right, stacked = false, className }) {
  const colors = useThemeColors();
  const title = NODE_H + GAP;
  const geometry = useMemo(
    () => slab({ w: NODE_W, h: NODE_H, d: NODE_D, r: 1.2 }), []);

  const laneHeight = (side) => side.steps.length * (NODE_H + GAP) + title;
  const rows = Math.max(left.steps.length, right.steps.length);

  const width = stacked ? NODE_W + 12 : (NODE_W + 10) * 2 + 14;
  const height = stacked
    ? laneHeight(left) + laneHeight(right) + GAP * 3
    : rows * (NODE_H + GAP) + GAP + title;

  const lane = (side, x, top) => (
    <group position={[x, 0, 0]}>
      <LaneTitle y={top + NODE_H / 2 + GAP + 3} title={side.title} />
      {side.steps.map((step, i) => (
        <group key={step.label}>
          {i < side.steps.length - 1 && (
            <Rail ax={0} ay={top - i * (NODE_H + GAP) - NODE_H / 2} bx={0}
                  by={top - (i + 1) * (NODE_H + GAP) + NODE_H / 2}
                  weight={0.8} rest={colors["line-strong"]} arrow />
          )}
          <Node step={step} y={top - i * (NODE_H + GAP)} colors={colors}
                geometry={geometry} />
        </group>
      ))}
    </group>
  );

  const centred = (side) =>
    (side.steps.length * (NODE_H + GAP)) / 2 - NODE_H / 2 - title / 2;

  return (
    <ChartCanvas width={width} height={height}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <group rotation={TILT}>
        {stacked ? (
          <>
            {lane(left, 0, height / 2 - title - NODE_H / 2)}
            {lane(right, 0,
                  height / 2 - laneHeight(left) - GAP * 3 - title - NODE_H / 2)}
          </>
        ) : (
          <>
            {lane(left, -(NODE_W + 14) / 2, centred(left))}
            {lane(right, (NODE_W + 14) / 2, centred(right))}
          </>
        )}
      </group>
    </ChartCanvas>
  );
}
