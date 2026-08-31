import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { JaalCanvas, useThemeColors } from "@/three/JaalCanvas";

const SPAN = 78;
const DEPTH = 30;
const HEIGHT = 24;
export const TIER_AT = { obvious: 0, moderate: 0.33, sophisticated: 0.66, adaptive: 1 };

const linear = (css) => new THREE.Color(css).convertSRGBToLinear();

const toX = (t) => (t - 0.5) * SPAN;
const toY = (v) => v * HEIGHT;

/* A filled band standing on the floor, one quad per step of the sweep. */
function band(points, key, z) {
  const xyz = new Float32Array(points.length * 6);
  points.forEach((p, i) => {
    const x = toX(p.x);
    xyz[i * 6] = x;
    xyz[i * 6 + 1] = 0;
    xyz[i * 6 + 2] = z;
    xyz[i * 6 + 3] = x;
    xyz[i * 6 + 4] = toY(p[key]);
    xyz[i * 6 + 5] = z;
  });
  const index = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(xyz, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function Floor({ colors }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[SPAN + 16, DEPTH + 16]} />
      <meshBasicMaterial color={colors.surface} toneMapped={false} />
    </mesh>
  );
}

function Ticks({ colors, tier }) {
  return Object.entries(TIER_AT).map(([name, at]) => (
    <mesh key={name} position={[toX(at), 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[name === tier ? 0.5 : 0.3, DEPTH + 6]} />
      <meshBasicMaterial color={name === tier ? colors.fg : colors["line-strong"]}
                         toneMapped={false} />
    </mesh>
  ));
}

function Scene({ points, tier, dead, active, onHover }) {
  const colors = useThemeColors();
  const { invalidate } = useThree();
  const grow = useRef(0);
  const group = useRef();

  const shapes = useMemo(() => ({
    reach: band(points, "withReview", -DEPTH / 3),
    blocked: band(points, "blocked", DEPTH / 3),
  }), [points]);

  useFrame((_, delta) => {
    if (grow.current >= 1) return;
    grow.current = Math.min(1, grow.current + delta * 0.9);
    if (group.current) group.current.scale.y = grow.current;
    invalidate();
  });

  const pick = (event) => {
    const t = Math.min(1, Math.max(0, event.point.x / SPAN + 0.5));
    onHover(Math.round(t * (points.length - 1)));
    invalidate();
  };

  return (
    <group position={[0, -6, 0]}>
      <Floor colors={colors} />

      {dead !== null && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}
              position={[(toX(dead) + toX(1)) / 2, 0.03, DEPTH / 3]}>
          <planeGeometry args={[toX(1) - toX(dead), DEPTH / 3]} />
          <meshBasicMaterial color={colors.bad} transparent opacity={0.12}
                             toneMapped={false} />
        </mesh>
      )}

      <group ref={group}>
        <mesh geometry={shapes.reach}>
          <meshLambertMaterial color={linear(colors.ok)} transparent opacity={0.5}
                               side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh geometry={shapes.blocked}>
          <meshLambertMaterial color={linear(colors.info)} transparent opacity={0.75}
                               side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>

      {active && (
        <group position={[toX(active.x), 0, 0]}>
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.5, DEPTH + 6]} />
            <meshBasicMaterial color={colors.fg} toneMapped={false} />
          </mesh>
          <mesh position={[0, toY(active.withReview) / 2, -DEPTH / 3]}>
            <boxGeometry args={[0.5, toY(active.withReview), 0.5]} />
            <meshBasicMaterial color={colors.fg} toneMapped={false} />
          </mesh>
          <mesh position={[0, toY(active.blocked) / 2 + 0.4, DEPTH / 3]}>
            <boxGeometry args={[0.5, toY(active.blocked) + 0.8, 0.5]} />
            <meshBasicMaterial color={colors.fg} toneMapped={false} />
          </mesh>
        </group>
      )}

      <Ticks colors={colors} tier={tier} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}
            onPointerMove={pick} onPointerLeave={() => { onHover(null); invalidate(); }}>
        <planeGeometry args={[SPAN, DEPTH]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

/*
  The sweep as two standing bands over the same ground: what Jaal blocks by
  itself in front, what the queue still reaches behind it. The front band falls
  to the floor long before the back one does, and the tinted floor marks where
  it has stopped contributing.
*/
export function Collapse({ curve, dead, tier, activeIndex, onHover, className }) {
  const points = useMemo(() => curve.map((c) => ({
    x: c.sophistication,
    blocked: c.recall,
    withReview: c.recall_including_review,
  })), [curve]);

  return (
    <JaalCanvas look={[0, 34, 76]} target={[0, 5, 0]} minDistance={36}
                maxDistance={190} className={className}>
      <Scene points={points} tier={tier} dead={dead} onHover={onHover}
             active={activeIndex === null ? null : points[activeIndex]} />
    </JaalCanvas>
  );
}
