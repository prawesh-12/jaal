import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { JaalCanvas, useThemeColors } from "@/three/JaalCanvas";

const linear = (css) => new THREE.Color(css).convertSRGBToLinear();

const PLATE = { w: 42, h: 1.8, d: 26 };
const GAP = 6;

function Plate({ stage, index, total, selected, onPick, colors }) {
  const mesh = useRef();
  const { invalidate } = useThree();
  const y = ((total - 1) / 2 - index) * GAP;
  const on = selected === stage.id;

  useFrame(() => {
    if (!mesh.current) return;
    const wanted = on ? 4 : 0;
    const at = mesh.current.position.x;
    if (Math.abs(at - wanted) < 0.02) return;
    mesh.current.position.x = at + (wanted - at) * 0.14;
    invalidate();
  });

  return (
    <group position={[0, y, 0]}>
      <mesh ref={mesh}
            onPointerDown={(e) => { e.stopPropagation(); onPick(stage.id); }}>
        <boxGeometry args={[PLATE.w, PLATE.h, PLATE.d]} />
        <meshLambertMaterial
          color={linear(on ? colors.fg : colors.surface)}
          toneMapped={false} />
      </mesh>
      <Html position={[0, PLATE.h, 0]} center transform={false}
            zIndexRange={[6, 0]} style={{ pointerEvents: "none", width: "230px" }}>
        <span className="flex items-baseline justify-center gap-3 whitespace-nowrap">
          <span className="tnum text-[10.5px]"
                style={{ color: on ? "var(--color-base)" : "var(--color-fg-dim)" }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[12.5px] leading-tight font-medium"
                style={{ color: on ? "var(--color-base)" : "var(--color-fg)" }}>
            {stage.name}
          </span>
          <span className="tnum text-[11px]"
                style={{ color: on ? "var(--color-base)" : "var(--color-fg-muted)" }}>
            {stage.badge}
          </span>
        </span>
      </Html>
    </group>
  );
}

/*
  The detector as the stack it is, one plate per stage, exploded so a reader can
  reach any of them. Picking a plate is what changes the panel beside it, so
  the diagram is the navigation rather than a picture of the navigation.
*/
export function EngineStack({ stages, selected, onPick, className }) {
  const colors = useThemeColors();

  return (
    <JaalCanvas look={[24, 26, 62]} target={[0, -1, 0]} minDistance={34}
                maxDistance={140} className={className}>
      {stages.map((stage, i) => (
        <Plate key={stage.id} stage={stage} index={i} total={stages.length}
               selected={selected} onPick={onPick} colors={colors} />
      ))}
    </JaalCanvas>
  );
}
