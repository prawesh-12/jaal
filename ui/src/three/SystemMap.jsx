import { Html } from "@react-three/drei";

import { ChartCanvas, usePxPerUnit } from "@/three/ChartCanvas";
import { useThemeColors } from "@/three/JaalCanvas";

const H = 24;
const D = 3;
const LANE = 20;

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

function Box({ node, colors }) {
  const px = usePxPerUnit();
  const solid = Boolean(node.tone);
  return (
    <group position={[node.x, node.y, 0]}>
      <mesh>
        <boxGeometry args={[node.w, H, D]} />
        <meshLambertMaterial color={solid ? colors[node.tone] : colors.active}
                             toneMapped={false} />
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
  const x1 = from.x + from.w / 2;
  const x2 = to.x - to.w / 2;
  const dx = x2 - x1;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) - 3;
  return (
    <group position={[(x1 + x2) / 2, (from.y + to.y) / 2, 0]}
           rotation={[0, 0, Math.atan2(dy, dx) - Math.PI / 2]}>
      <mesh position={[0, -1.6, 0]}>
        <planeGeometry args={[0.9, len]} />
        <meshBasicMaterial color={colors["fg-dim"]} toneMapped={false} />
      </mesh>
      <mesh position={[0, len / 2 - 1.6, 0]}>
        <coneGeometry args={[2.1, 3.6, 3]} />
        <meshBasicMaterial color={colors["fg-dim"]} toneMapped={false} />
      </mesh>
    </group>
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

  return (
    <ChartCanvas width={340} height={80} className={className}>
      {ARROWS.map(([a, b]) => (
        <Arrow key={`${a}-${b}`} from={NODES[a]} to={NODES[b]} colors={colors} />
      ))}
      {NODES.map((node) => <Box key={node.title} node={node} colors={colors} />)}
    </ChartCanvas>
  );
}
