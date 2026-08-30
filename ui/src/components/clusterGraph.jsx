import { useMemo } from "react";

/*
  Draws two real clusters from results/sim_cases.json. Nothing here is invented:
  the node count is the cluster's measured size and the edge count is its
  measured edge density times the pairs it could have. Which pairs get drawn is
  a seeded choice, because results/ stores the density and not the adjacency.

  The loose accounts around them are decoration and are drawn as such: dim, no
  edges, and the caption says so.
*/

const W = 900;
const H = 440;
const LOOSE = 46;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* Phyllotaxis, so a group of fifty reads as a blob and not as a wheel. */
function disc(n, cx, cy, r) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const rad = r * Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  });
}

function group(c, cx, cy, r, seed) {
  const n = Math.round(c.shape.size);
  const nodes = disc(n, cx, cy, r);
  const possible = (n * (n - 1)) / 2;
  const target = Math.min(possible, Math.round(c.shape.edge_density * possible));

  const pairs = [];
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) pairs.push([i, j]);

  // Seeded shuffle, then take the first `target`. Same case, same picture.
  const rand = rng(seed);
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const k = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[k]] = [pairs[k], pairs[i]];
  }

  return { n, nodes, edges: pairs.slice(0, target), possible, target, radius: r };
}

export function ClusterGraph({ focus, companion, step, focusTone = "warn" }) {
  const world = useMemo(() => {
    const size = (c) => Math.max(52, Math.min(132, 16 + Math.sqrt(c.shape.size) * 15));
    const a = group(focus, 268, 216, size(focus), focus.seed * 31 + focus.cluster_id);
    const b = companion
      ? group(companion, 690, 190, size(companion) * 0.82,
              companion.seed * 17 + companion.cluster_id)
      : null;

    const rand = rng(9091);
    const loose = Array.from({ length: LOOSE }, () => [
      40 + rand() * (W - 80),
      36 + rand() * (H - 110),
    ]).filter(([x, y]) =>
      Math.hypot(x - 268, y - 216) > a.radius + 34
      && (!b || Math.hypot(x - 690, y - 190) > b.radius + 30));

    return { a, b, loose };
  }, [focus, companion]);

  const { a, b, loose } = world;
  const linked = step >= 3;
  const clustered = step >= 4;
  const tone = `var(--color-${focusTone})`;

  const draw = (g, colour, on, delay) => (
    <g>
      <g stroke={colour} strokeWidth="0.7" opacity={linked ? (on ? 0.5 : 0.24) : 0}
         style={{ transition: `opacity 600ms ease-out ${delay}ms` }}>
        {g.edges.map(([i, j], k) => (
          <line key={k} x1={g.nodes[i][0]} y1={g.nodes[i][1]}
                x2={g.nodes[j][0]} y2={g.nodes[j][1]} />
        ))}
      </g>
      {g.nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={g.n > 40 ? 3.6 : 5}
                fill={clustered ? colour : "var(--color-fg-dim)"}
                opacity={on ? 0.95 : 0.55}
                style={{ transition: "fill 500ms ease-out" }} />
      ))}
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
         aria-label={`A cluster of ${a.n} accounts with ${a.target} links inside it`
                     + (b ? `, beside a group of ${b.n}` : "")}>
      <g opacity={clustered ? 0.28 : 0.6}
         style={{ transition: "opacity 600ms ease-out" }}>
        {loose.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.8" fill="var(--color-fg-dim)" />
        ))}
      </g>

      {draw(a, tone, true, 0)}
      {b && draw(b, "var(--color-ok)", false, 180)}

      {clustered && (
        <g style={{ transition: "opacity 400ms ease-out" }}>
          <circle cx="268" cy="216" r={a.radius + 22} fill="none" stroke={tone}
                  strokeWidth="1" strokeDasharray="3 5" opacity="0.7" />
          <text x="268" y={216 + a.radius + 44} textAnchor="middle" fontSize="13"
                fill={tone} fontFamily="var(--font-sans)">
            {a.n} accounts, {a.target} links
          </text>
          {b && (
            <>
              <circle cx="690" cy="190" r={b.radius + 20} fill="none"
                      stroke="var(--color-ok)" strokeWidth="1" strokeDasharray="3 5"
                      opacity="0.55" />
              <text x="690" y={190 + b.radius + 40} textAnchor="middle" fontSize="12"
                    fill="var(--color-fg-muted)" fontFamily="var(--font-sans)">
                {companion.benign_kind ?? "ring"}, {b.n} accounts
              </text>
            </>
          )}
        </g>
      )}

      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11"
            fill="var(--color-fg-faint)" fontFamily="var(--font-sans)">
        loose accounts link to nobody and are never scored
      </text>
    </svg>
  );
}
