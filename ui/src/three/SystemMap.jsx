import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { JaalCanvas, useThemeColors } from "@/three/JaalCanvas";

const linear = (css) => new THREE.Color(css).convertSRGBToLinear();

const LANE = 11;
const SLAB = { w: 24, h: 2.6, d: 13 };

function Slab({ x, z, title, note, tone, colors, wide = 1, onPick, active }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, SLAB.h / 2, 0]}
            onPointerDown={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined}>
        <boxGeometry args={[SLAB.w * wide, SLAB.h, SLAB.d]} />
        <meshLambertMaterial
          color={linear(tone ? colors[tone] : active ? colors.active : colors.surface)}
          toneMapped={false} />
      </mesh>
      <Html position={[0, SLAB.h + 0.2, 0]} center transform={false}
            zIndexRange={[6, 0]}
            style={{ pointerEvents: "none", width: "150px" }}>
        <span className="block text-center">
          <span className="block text-[12.5px] leading-tight font-medium"
                style={{ color: tone ? "var(--color-base)" : "var(--color-fg)" }}>
            {title}
          </span>
          {note && (
            <span className="mt-0.5 block text-[10.5px] leading-tight"
                  style={{ color: tone ? "var(--color-base)" : "var(--color-fg-muted)" }}>
              {note}
            </span>
          )}
        </span>
      </Html>
    </group>
  );
}

function Beam({ from, to, colors }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  return (
    <group position={[(from[0] + to[0]) / 2, 0.3, (from[1] + to[1]) / 2]}
           rotation={[0, angle, 0]}>
      <mesh>
        <boxGeometry args={[0.45, 0.45, len]} />
        <meshBasicMaterial color={colors["line-loud"]} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* One packet travelling the lane, so the direction of the flow is not something
   the reader has to infer from arrowheads. */
function Packet({ from, to, colors, offset }) {
  const mesh = useRef();
  const { invalidate } = useThree();
  const t = useRef(offset);

  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.24) % 1;
    if (mesh.current) {
      mesh.current.position.x = from[0] + (to[0] - from[0]) * t.current;
      mesh.current.position.z = from[1] + (to[1] - from[1]) * t.current;
    }
    invalidate();
  });

  return (
    <mesh ref={mesh} position={[from[0], 1.1, from[1]]}>
      <sphereGeometry args={[0.8, 12, 10]} />
      <meshLambertMaterial color={linear(colors.info)} toneMapped={false} />
    </mesh>
  );
}

/*
  Where Jaal sits. The merchant's population goes in on one side, one priced
  decision per cluster comes out the other, and the two lanes are the two
  shapes of the job: a batch that has to see the whole graph, and an online
  assignment that only has to place one new account.
*/
export function SystemMap({ className }) {
  const colors = useThemeColors();

  const nodes = useMemo(() => ({
    merchant: [-36, 0],
    batch: [-13, -LANE],
    online: [-13, LANE],
    engine: [13, 0],
    queue: [36, 0],
  }), []);

  return (
    <JaalCanvas look={[0, 40, 54]} target={[0, 0, 0]} minDistance={34}
                maxDistance={150} className={className}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <planeGeometry args={[120, 62]} />
        <meshBasicMaterial color={colors.surface} toneMapped={false} />
      </mesh>

      <Beam from={nodes.merchant} to={nodes.batch} colors={colors} />
      <Beam from={nodes.merchant} to={nodes.online} colors={colors} />
      <Beam from={nodes.batch} to={nodes.engine} colors={colors} />
      <Beam from={nodes.online} to={nodes.engine} colors={colors} />
      <Beam from={nodes.engine} to={nodes.queue} colors={colors} />

      <Packet from={nodes.merchant} to={nodes.batch} colors={colors} offset={0} />
      <Packet from={nodes.batch} to={nodes.engine} colors={colors} offset={0.4} />
      <Packet from={nodes.engine} to={nodes.queue} colors={colors} offset={0.7} />

      <Slab x={nodes.merchant[0]} z={nodes.merchant[1]} colors={colors}
            title="Merchant population" note="one row per account, twelve columns" />
      <Slab x={nodes.batch[0]} z={nodes.batch[1]} colors={colors}
            title="Batch discovery" note="nightly, sees the whole graph" />
      <Slab x={nodes.online[0]} z={nodes.online[1]} colors={colors}
            title="Online assignment" note="one account against existing clusters" />
      <Slab x={nodes.engine[0]} z={nodes.engine[1]} colors={colors} tone="fg"
            title="Jaal Engine" note="link · cluster · score · price" />
      <Slab x={nodes.queue[0]} z={nodes.queue[1]} colors={colors}
            title="Your risk queue" note="block · review · allow" />
    </JaalCanvas>
  );
}
