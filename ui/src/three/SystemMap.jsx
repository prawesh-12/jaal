import { Html } from "@react-three/drei";
import { useMemo } from "react";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { Rail, SceneLights, Shadow, SURFACE, slab } from "@/three/surface";

const H = 24;
const D = 8;
const LANE = 20;

const TILT = [-0.15, 0.18, 0];

const NODES = [
  { x: -128, y: 0, w: 66, title: "Merchant population",
    note: "one row per account, twelve columns" },
  { x: -40, y: LANE, w: 78, title: "Batch discovery",
    note: "nightly, sees the whole graph" },
  { x: -40, y: -LANE, w: 78, title: "Online assignment",
    note: "one account against existing clusters" },
  { x: 52, y: 0, w: 66, title: "Jaal Engine", note: "link · cluster · score · price",
    tone: "fg" },
  { x: 132, y: 0, w: 62, title: "Your risk queue", note: "block · review · allow" },
];

const ARROWS = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];

function Box({ node, colors, geometry }) {
  const px = usePxPerUnit();
  const solid = Boolean(node.tone);
  return (
    <group position={[node.x, node.y, 0]}>
      <Shadow w={node.w * 1.4} h={H * 1.7} z={-D / 2 - 1.4} />
      <mesh geometry={geometry}>
        <meshStandardMaterial color={solid ? colors[node.tone] : colors.raised}
                              {...SURFACE} toneMapped={false} />
      </mesh>
      <Html center transform={false} zIndexRange={[10, 0]}
            style={{ pointerEvents: "none", width: `${node.w * px}px` }}>
        <span className="block px-2 text-center">
          <span className="block text-[13px] leading-tight font-medium"
                style={{ color: solid ? "var(--color-base)" : "var(--color-fg)" }}>
            {node.title}
          </span>
          <span className="mt-1 block text-[11px] leading-tight"
                style={{ color: solid ? "var(--color-base)" : "var(--color-fg-muted)" }}>
            {node.note}
          </span>
        </span>
      </Html>
    </group>
  );
}

/* Edge of one box to edge of the next, so an arrow never runs under a box. */
function Arrow({ from, to, colors }) {
  return (
    <Rail ax={from.x + from.w / 2} ay={from.y}
          bx={to.x - to.w / 2} by={to.y}
          weight={0.9} rest={colors["fg-dim"]} arrow />
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
  const shapes = useMemo(() => {
    const cache = new Map();
    for (const node of NODES) {
      if (!cache.has(node.w)) {
        cache.set(node.w, slab({ w: node.w, h: H, d: D, r: 1.3 }));
      }
    }
    return cache;
  }, []);

  return (
    <ChartCanvas width={340} height={86}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <group rotation={TILT}>
        {ARROWS.map(([a, b]) => (
          <Arrow key={`${a}-${b}`} from={NODES[a]} to={NODES[b]} colors={colors} />
        ))}
        {NODES.map((node) => (
          <Box key={node.title} node={node} colors={colors}
               geometry={shapes.get(node.w)} />
        ))}
      </group>
    </ChartCanvas>
  );
}
