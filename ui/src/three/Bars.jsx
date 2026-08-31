import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";

import { ChartCanvas } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { SceneLights, SURFACE } from "@/three/surface";
import { cn } from "@/lib/utils";
import { compactRupees } from "@/lib/format";

const ROW = 12;
const TRACK = 184;
const DEPTH = 5;

// Turned about the horizontal axis only, so every bar's length still measures
// exactly what it did.
const TILT = [-0.34, 0, 0];

function Bar({ bar, max, y, width, color, muted, grow, compact }) {
  const mesh = useRef();
  const behind = useRef();
  const full = Math.max((bar.value / max) * width, 0.4);
  const extra = bar.second === undefined
    ? 0 : Math.max((bar.second / max) * width, 0.4);

  useFrame(() => {
    const w = full * grow.current;
    if (mesh.current) {
      mesh.current.scale.x = Math.max(w, 0.001);
      mesh.current.position.x = w / 2;
    }
    if (behind.current) {
      const e = extra * grow.current;
      behind.current.scale.x = Math.max(e, 0.001);
      behind.current.position.x = e / 2;
    }
  });

  return (
    <group position={[0, y, 0]}>
      <mesh position={[width / 2, -ROW * 0.24, -DEPTH / 2]}
            rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, DEPTH]} />
        <meshBasicMaterial color={muted} toneMapped={false} />
      </mesh>
      {bar.second !== undefined && (
        <mesh ref={behind} position={[0, 0, 0]}>
          <boxGeometry args={[1, ROW * 0.46, DEPTH * 0.55]} />
          <meshStandardMaterial color={color} transparent opacity={0.4}
                                {...SURFACE} toneMapped={false} />
        </mesh>
      )}
      <mesh ref={mesh}>
        <boxGeometry args={[1, ROW * 0.46, DEPTH]} />
        <meshStandardMaterial color={color} {...SURFACE} toneMapped={false} />
      </mesh>
      {/* Beside the track when there is width for it, above the track when
          there is not. */}
      <Html position={compact ? [0, ROW * 0.62, 0] : [-1.5, 0, 0]} center={!compact}
            transform={false} zIndexRange={[10, 0]}
            style={{ pointerEvents: "none",
                     transform: compact ? "translate(0, -100%)"
                                        : "translate(-100%, -50%)" }}>
        <span className={cn("block text-[13px] whitespace-nowrap text-fg-muted",
                            compact ? "text-left" : "text-right")}>
          {bar.label}
        </span>
      </Html>
      <Html position={[Math.max(full, extra) + 1.5, 0, 0]} center transform={false}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none", transform: "translate(0, -50%)" }}>
        <span className="tnum block text-[14px] whitespace-nowrap text-fg">
          {bar.display}
        </span>
      </Html>
    </group>
  );
}

function Rig() {
  const colors = useThemeColors();
  return <SceneLights ground={colors.surface} />;
}

function Rows({ bars, max, width, row, compact }) {
  const colors = useThemeColors();
  const { invalidate } = useThree();
  const grow = useRef(0);

  useFrame((_, delta) => {
    if (grow.current >= 1) return;
    grow.current = Math.min(1, grow.current + delta * 2.6);
    invalidate();
  });

  const top = ((bars.length - 1) * row) / 2;

  return (
    <group>
      {bars.map((bar, i) => (
        <Bar key={bar.label} bar={bar} max={max} width={width} grow={grow}
             y={top - i * row} compact={compact}
             color={colors[bar.tone] ?? colors["fg-2"]}
             muted={colors.surface} />
      ))}
    </group>
  );
}

/*
  Horizontal bars, one row each, drawn to the same scale. `labelWidth` and
  `valueWidth` reserve room for the DOM labels either side of the track, in the
  same units as the track itself.
*/
export function Bars({ bars, labelWidth = 52, valueWidth = 30, max,
                       compact = false, className }) {
  const ceiling = useMemo(
    () => max ?? Math.max(...bars.map((b) => b.value), 1), [bars, max]);
  const label = compact ? 0 : labelWidth;
  const row = compact ? ROW * 2.05 : ROW;
  const width = label + TRACK + valueWidth;
  const height = bars.length * row + row * 0.6;

  return (
    <ChartCanvas width={width} height={height}
                 lights={<Rig />} className={className}>
      <group rotation={TILT}>
        <group position={[-width / 2 + label, 0, 0]}>
          <Rows bars={bars} max={ceiling} width={TRACK} row={row}
                compact={compact} />
        </group>
      </group>
    </ChartCanvas>
  );
}

/*
  One row per item, split about a zero line: losses run left, gains run right.
  Both sides share a scale, which is the whole point when one of them is two
  orders of magnitude larger.
*/
export function Diverging({ rows, labelWidth = 34, className }) {
  const colors = useThemeColors();
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.left), Math.abs(r.right)]), 1);
  const arm = 150;
  const width = labelWidth + arm * 2 + 8;
  const height = rows.length * ROW * 1.7 + ROW;
  const top = ((rows.length - 1) * ROW * 1.7) / 2;

  const side = (value, tone) => {
    const w = Math.max((Math.abs(value) / max) * arm, 0.5);
    const dir = value < 0 ? -1 : 1;
    return (
      <group>
        <mesh position={[(dir * w) / 2, 0, 0]}>
          <boxGeometry args={[w, ROW * 0.42, DEPTH]} />
          <meshStandardMaterial color={colors[tone]} {...SURFACE} toneMapped={false} />
        </mesh>
        <Html position={[dir * (w + 2), 0, 0]} center transform={false}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none",
                       transform: `translate(${dir < 0 ? "-100%" : "0"}, -50%)` }}>
          <span className="tnum block text-[12.5px] whitespace-nowrap text-fg-2">
            {compactRupees(value)}
          </span>
        </Html>
      </group>
    );
  };

  return (
    <ChartCanvas width={width} height={height}
                 lights={<Rig />} className={className}>
      <group rotation={TILT}>
      <mesh position={[0, 0, -DEPTH]}>
        <boxGeometry args={[0.4, height * 0.82, 0.2]} />
        <meshBasicMaterial color={colors["line-strong"]} toneMapped={false} />
      </mesh>
      {rows.map((row, i) => (
        <group key={row.label} position={[0, top - i * ROW * 1.7, 0]}>
          <Html position={[0, ROW * 0.62, 0]} center transform={false}
                zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <span className="label block whitespace-nowrap">{row.label}</span>
          </Html>
          {side(row.left, "bad")}
          {side(row.right, row.right >= 0 ? "ok" : "bad")}
        </group>
      ))}
      </group>
    </ChartCanvas>
  );
}
