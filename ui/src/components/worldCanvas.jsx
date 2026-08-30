import { useMemo } from "react";
import { cn } from "@/lib/utils";

/*
  A schematic of one world, not a measured one. It exists to show the shape of
  the change at each stage: a flat field of accounts becomes candidate pairs,
  candidate pairs become a few strong edges, and strong edges become groups.
  Every number beside it on the page is measured. This picture is not.

  Positions are fixed by a seeded generator, so the same stage always draws the
  same picture.
*/

const W = 900;
const H = 380;

// Small deterministic generator. Same seed, same world, every render.
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const GROUPS = [
  { id: "ring", kind: "ring", size: 8, at: [190, 200], r: 74 },
  { id: "family", kind: "benign", size: 3, at: [470, 120], r: 40 },
  { id: "flatmates", kind: "benign", size: 3, at: [610, 240], r: 40 },
  { id: "hostel", kind: "benign", size: 5, at: [770, 130], r: 52 },
];
const SINGLETONS = 44;

function buildWorld() {
  const rand = lcg(20260830);
  const nodes = [];

  const scatter = (i) => {
    const cols = 16;
    const x = 40 + (i % cols) * ((W - 80) / (cols - 1));
    const y = 46 + Math.floor(i / cols) * 74 + (rand() - 0.5) * 26;
    return [x + (rand() - 0.5) * 22, y];
  };

  let slot = 0;
  for (const g of GROUPS) {
    for (let k = 0; k < g.size; k += 1) {
      const angle = (k / g.size) * Math.PI * 2 + 0.4;
      nodes.push({
        id: `${g.id}-${k}`,
        group: g.id,
        kind: g.kind,
        scatter: scatter(slot),
        clustered: [
          g.at[0] + Math.cos(angle) * g.r * (0.72 + rand() * 0.28),
          g.at[1] + Math.sin(angle) * g.r * (0.72 + rand() * 0.28),
        ],
      });
      slot += 1;
    }
  }
  for (let k = 0; k < SINGLETONS; k += 1) {
    const s = scatter(slot);
    nodes.push({ id: `alone-${k}`, group: null, kind: "alone", scatter: s, clustered: s });
    slot += 1;
  }

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // Edges inside a group survive linking. The rest are candidate pairs that
  // blocking produced and the evidence threshold then threw away.
  const strong = [];
  for (const g of GROUPS) {
    for (let i = 0; i < g.size; i += 1) {
      for (let j = i + 1; j < g.size; j += 1) {
        strong.push({
          key: `${g.id}-${i}-${j}`, group: g.id,
          a: `${g.id}-${i}`, b: `${g.id}-${j}`,
          weight: 0.6 + rand() * 0.9,
        });
      }
    }
  }
  const weak = [];
  for (let k = 0; k < 120; k += 1) {
    const a = nodes[Math.floor(rand() * nodes.length)];
    const b = nodes[Math.floor(rand() * nodes.length)];
    if (a.id !== b.id && a.group !== b.group) {
      weak.push({ key: `w${k}`, a: a.id, b: b.id });
    }
  }

  return { nodes, byId, strong, weak };
}

const FILL = {
  ring: "var(--color-warn)",
  benign: "var(--color-ok)",
  alone: "var(--color-fg-dim)",
};

export function WorldCanvas({ step, ringLinked, focus }) {
  const world = useMemo(buildWorld, []);
  const { byId, strong, weak } = world;

  // Stage 4 onwards the groups pull together. Before that everything sits in
  // the field it arrived in.
  const grouped = step >= 4;
  const pos = (n) => (grouped && !(n.group === "ring" && !ringLinked) ? n.clustered : n.scatter);
  const at = (id) => pos(byId[id]);

  const showWeak = step === 2;
  const showStrong = step >= 3;
  const coloured = step >= 4;

  const line = (e, key, extra) => {
    const [x1, y1] = at(e.a);
    const [x2, y2] = at(e.b);
    return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} {...extra} />;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={[
        "A schematic world of accounts.",
        step >= 2 ? "Candidate pairs are drawn between them." : "",
        step >= 3 ? "Only pairs above the evidence threshold keep an edge." : "",
        step >= 4 ? "Linked accounts have gathered into clusters." : "",
      ].filter(Boolean).join(" ")}
    >
      {showWeak && (
        <g stroke="var(--color-line-strong)" strokeWidth="0.6" opacity="0.5">
          {weak.map((e) => line(e, e.key))}
        </g>
      )}

      {showStrong && (
        <g>
          {strong
            .filter((e) => e.group !== "ring" || ringLinked)
            .map((e) =>
              line(e, e.key, {
                stroke: coloured && e.group === "ring"
                  ? "var(--color-warn)" : "var(--color-fg-faint)",
                strokeWidth: e.weight,
                opacity: focus && focus !== e.group ? 0.18 : 0.75,
                style: { transition: "opacity 300ms ease-out" },
              })
            )}
        </g>
      )}

      {world.nodes.map((n) => {
        const [x, y] = pos(n);
        const dim = focus && focus !== n.group;
        const fill = coloured ? FILL[n.kind] : "var(--color-fg-dim)";
        const isAlone = n.kind === "alone";
        return (
          <g
            key={n.id}
            style={{
              transform: `translate(${x}px, ${y}px)`,
              transition: "transform 780ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <circle
              r={isAlone ? 3.2 : 4.6}
              fill={fill}
              opacity={dim ? 0.2 : coloured && isAlone ? 0.35 : 0.9}
              style={{ transition: "fill 400ms ease-out, opacity 400ms ease-out" }}
            />
          </g>
        );
      })}

      {step >= 4 && ringLinked && (
        <g className="scene-fade" style={{ "--d": "700ms" }}>
          <circle cx={GROUPS[0].at[0]} cy={GROUPS[0].at[1]} r={GROUPS[0].r + 16}
                  fill="none" stroke="var(--color-warn)" strokeWidth="1"
                  strokeDasharray="3 4" opacity="0.6" />
          <text x={GROUPS[0].at[0]} y={GROUPS[0].at[1] + GROUPS[0].r + 38}
                textAnchor="middle" fontSize="11.5" fill="var(--color-warn)"
                fontFamily="var(--font-sans)">
            one operator
          </text>
        </g>
      )}

      {step >= 4 && !ringLinked && (
        <g className="scene-fade" style={{ "--d": "700ms" }}>
          <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="12"
                fill="var(--color-bad)" fontFamily="var(--font-sans)">
            the ring never links, so it never becomes a cluster
          </text>
        </g>
      )}

      {step >= 4 && (
        <g className="scene-fade" style={{ "--d": "900ms" }}>
          {GROUPS.slice(1).map((g) => (
            <text key={g.id} x={g.at[0]} y={g.at[1] + g.r + 22} textAnchor="middle"
                  fontSize="11" fill="var(--color-fg-faint)" fontFamily="var(--font-sans)">
              {g.id}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

export function CanvasLegend({ step, className }) {
  const items = step >= 4
    ? [["ring", "var(--color-warn)"], ["benign group", "var(--color-ok)"],
       ["unclustered", "var(--color-fg-dim)"]]
    : [["account", "var(--color-fg-dim)"]];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}>
      {items.map(([label, colour]) => (
        <span key={label} className="inline-flex items-center gap-2.5 text-[12.5px] text-fg-muted">
          <span aria-hidden="true" className="size-[7px] rounded-full"
                style={{ background: colour }} />
          {label}
        </span>
      ))}
    </div>
  );
}
