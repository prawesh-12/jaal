import { Html } from "@react-three/drei";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { cn } from "@/lib/utils";

const PLATE = { w: 96, h: 2.4, d: 34 };
const GAP = 22;
const TILT = -0.5;
const PLATE_X = 47;
const LABEL = { x: -50, w: 89 };

function Plate({ stage, index, total, selected, onPick, colors }) {
  const px = usePxPerUnit();
  const y = ((total - 1) / 2 - index) * GAP;
  const on = selected === stage.id;

  return (
    <group position={[0, y, 0]}>
      <mesh position={[PLATE_X + (on ? 5 : 0), 0, 0]}
            onPointerDown={(e) => { e.stopPropagation(); onPick(stage.id); }}>
        <boxGeometry args={[PLATE.w, PLATE.h, PLATE.d]} />
        <meshLambertMaterial color={on ? colors.fg : colors.active} toneMapped={false} />
      </mesh>

      {/* Left of the stack, where no plate can ever cover it. */}
      <Html position={[LABEL.x, 0, 0]} center transform={false} zIndexRange={[6, 0]}
            style={{ width: `${LABEL.w * px}px` }}>
        <button type="button" onClick={() => onPick(stage.id)} aria-pressed={on}
                className="interactive block w-full pr-3 text-right">
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

/*
  The detector as the stack it is, one plate per stage. Picking a plate is what
  changes the panel beside it, so the diagram is the navigation rather than a
  picture of the navigation.
*/
export function EngineStack({ stages, selected, onPick, className }) {
  const colors = useThemeColors();

  return (
    <ChartCanvas width={196} height={stages.length * GAP + 24} className={className}>
      <group rotation={[TILT, 0, 0]}>
        {stages.map((stage, i) => (
          <Plate key={stage.id} stage={stage} index={i} total={stages.length}
                 selected={selected} onPick={onPick} colors={colors} />
        ))}
      </group>
    </ChartCanvas>
  );
}
