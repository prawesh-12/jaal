import { Html } from "@react-three/drei";
import { useMemo } from "react";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";
import { Rail, SceneLights, Shadow, SURFACE, slab } from "@/three/surface";

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
      <Shadow w={node.w * 1.4} h={node.h * 1.7} z={-D / 2 - 1.4} />
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

/*
  Where Jaal sits. The merchant's population goes in on one side, one priced
  decision per cluster comes out the other, and the two lanes are the two
  shapes of the job: a batch that has to see the whole graph, and an online
  assignment that only has to place one new account.
*/
/* Wide, the two lanes sit above and below the trunk; narrow, the whole map
   turns so it stacks down the page. */
function place(vertical) {
  if (!vertical) return { nodes: NODES.map((n) => ({ ...n, h: 24 })),
                          width: 340, height: 86 };
  const W = 92;
  const H = 32;
  const STEP = 46;
  const top = STEP * 1.5;
  const at = [[0, top], [-50, top - STEP], [50, top - STEP],
              [0, top - STEP * 2], [0, top - STEP * 3]];
  return {
    nodes: NODES.map((n, i) => ({ ...n, w: W, h: H, x: at[i][0], y: at[i][1] })),
    width: W * 2 + 16,
    height: STEP * 3 + H + 14,
  };
}

function Link({ from, to, colors, vertical }) {
  if (vertical) {
    return (
      <Rail ax={from.x} ay={from.y - from.h / 2} bx={to.x} by={to.y + to.h / 2}
            weight={0.9} rest={colors["fg-dim"]} arrow />
    );
  }
  return (
    <Rail ax={from.x + from.w / 2} ay={from.y}
          bx={to.x - to.w / 2} by={to.y}
          weight={0.9} rest={colors["fg-dim"]} arrow />
  );
}

export function SystemMap({ vertical = false, className }) {
  const colors = useThemeColors();
  const { nodes, width, height } = useMemo(() => place(vertical), [vertical]);
  const shapes = useMemo(() => {
    const cache = new Map();
    for (const node of nodes) {
      const key = `${node.w}|${node.h}`;
      if (!cache.has(key)) {
        cache.set(key, slab({ w: node.w, h: node.h, d: D, r: 1.3 }));
      }
    }
    return cache;
  }, [nodes]);

  return (
    <ChartCanvas width={width} height={height}
                 lights={<SceneLights ground={colors.surface} />}
                 className={className}>
      <group rotation={TILT}>
        {ARROWS.map(([a, b]) => (
          <Link key={`${a}-${b}`} from={nodes[a]} to={nodes[b]} colors={colors}
                vertical={vertical} />
        ))}
        {nodes.map((node) => (
          <Box key={node.title} node={node} colors={colors}
               geometry={shapes.get(`${node.w}|${node.h}`)} />
        ))}
      </group>
    </ChartCanvas>
  );
}
