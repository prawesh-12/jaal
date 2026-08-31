import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { SceneLights, Shadow, SURFACE, useSlab, useSpring } from "@/three/surface";
import { cn } from "@/lib/utils";

const PLATE = { w: 96, h: 3.4, d: 34, r: 1.2, bevel: 0.5 };
const GAP = 22;
const TILT = -0.5;
const PLATE_X = 47;
const LABEL = { x: -50, w: 89 };

function Plate({ stage, index, total, selected, onPick, colors, geometry }) {
  const group = useRef();
  const material = useRef();
  const px = usePxPerUnit();
  const { invalidate } = useThree();
  const y = ((total - 1) / 2 - index) * GAP;
  const on = selected === stage.id;
  const pull = useSpring(on ? 1 : 0);
  const face = useRef(new THREE.Color());
  const to = useRef(new THREE.Color());

  useFrame((_, delta) => {
    const p = pull.step(delta);
    if (group.current) group.current.position.x = PLATE_X + p * 6;
    if (material.current) {
      face.current.set(colors.raised);
      to.current.set(on ? colors.fg : colors.active);
      material.current.color.copy(face.current.lerp(to.current, Math.min(1, p * 1.6)));
    }
    if (!pull.settled) invalidate();
  });

  return (
    <group position={[0, y, 0]}>
      <group ref={group} position={[PLATE_X, 0, 0]}>
        <Shadow w={PLATE.w * 1.2} h={PLATE.d * 1.3} z={-PLATE.h / 2 - 2}
                offset={[2, -2]} />
        <mesh geometry={geometry}
              onPointerDown={(e) => { e.stopPropagation(); onPick(stage.id); }}>
          <meshStandardMaterial ref={material} color={colors.raised}
                                {...SURFACE} toneMapped={false} />
        </mesh>
      </group>

      {/* Left of the stack, where no plate can ever cover it. */}
      <Html position={[LABEL.x, 0, 0]} center transform={false} zIndexRange={[6, 0]}
            style={{ width: `${LABEL.w * px}px` }}>
        <button type="button" onClick={() => onPick(stage.id)} aria-pressed={on}
                className="interactive block w-full cursor-pointer pr-3 text-right">
          <span className="flex items-baseline justify-end gap-2.5">
            <span className="tnum text-[11px] text-fg-dim">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className={cn("text-[13.5px] leading-tight",
                                on ? "font-medium text-fg" : "text-fg-muted")}>
              {stage.name}
            </span>
          </span>
          <span className="tnum mt-0.5 block text-[11px] text-fg-faint">
            {stage.badge}
          </span>
        </button>
      </Html>
    </group>
  );
}

/* Picking a plate changes the panel beside it, so the diagram is the
   navigation rather than a picture of it. */
export function EngineStack({ stages, selected, onPick, className }) {
  const colors = useThemeColors();
  const geometry = useSlab(PLATE);

  return (
    <ChartCanvas width={196} height={stages.length * GAP + 30}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <group rotation={[TILT, 0, 0]}>
        {stages.map((stage, i) => (
          <Plate key={stage.id} stage={stage} index={i} total={stages.length}
                 selected={selected} onPick={onPick} colors={colors}
                 geometry={geometry} />
        ))}
      </group>
    </ChartCanvas>
  );
}
