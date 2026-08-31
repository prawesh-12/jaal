/*
  Positions for one results/sim_world_<tier>_<seed>.json. The file is a real
  run and nothing here changes it. Positions are the only thing this file
  invents, and a position is not a claim.

    field    every account on a flat disc
    graph    accounts holding an edge lift off the disc
    islands  each cluster moved out to its own place
*/

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FIELD_RADIUS = 46;
const ISLAND_GAP = 1.2;
const ISLAND_PACKING = 0.75;
const SHELF_INNER = 96;
const SHELF_OUTER = 132;

export const STAGES = [
  { id: "accounts", name: "Accounts",
    line: "One row per account. Nothing is judged on its own." },
  { id: "blocking", name: "Blocking",
    line: "Most pairs are never worth scoring, so they are never scored." },
  { id: "linking", name: "Pair evidence",
    line: "Weak agreements add up. Enough bits draw an edge." },
  { id: "graph", name: "Graph",
    line: "Accounts are nodes. Edges make a group the thing being judged." },
  { id: "clustering", name: "Clustering",
    line: "Leiden cuts the graph into communities." },
  { id: "scoring", name: "Probability and purity",
    line: "Is it a ring, and how much of it is?" },
  { id: "decision", name: "Decision",
    line: "All three actions are priced. The cheapest one wins." },
];

export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Even coverage of a disc, no clumping, no randomness. */
function phyllotaxis(i, n, radius) {
  const r = radius * Math.sqrt((i + 0.5) / n);
  const a = i * GOLDEN;
  return [r * Math.cos(a), r * Math.sin(a)];
}

export function layout(world) {
  const n = world.n_accounts;
  const { source, target } = world.edges;

  const clusterOf = new Int32Array(n).fill(-1);
  world.clusters.forEach((c, k) => {
    for (const m of c.members) clusterOf[m] = k;
  });

  const degree = new Int32Array(n);
  for (let e = 0; e < source.length; e += 1) {
    degree[source[e]] += 1;
    degree[target[e]] += 1;
  }

  // Phyllotaxis alone lays 12,000 points on visible spiral arms. A small
  // deterministic nudge breaks the pattern without moving anything far.
  const field = new Float32Array(n * 3);
  const noise = mulberry(world.seed * 104729 + 7);
  for (let i = 0; i < n; i += 1) {
    const [x, z] = phyllotaxis(i, n, FIELD_RADIUS);
    field[i * 3] = x + (noise() - 0.5) * 0.85;
    field[i * 3 + 2] = z + (noise() - 0.5) * 0.85;
  }

  const radiusOf = (size) => 0.62 * Math.sqrt(size) + 0.9;

  // Lifting rather than regrouping: every account keeps the place it held, so
  // the graph reads as a layer over the population it came from.
  const jitter = mulberry(world.seed * 7919 + 13);
  const graph = new Float32Array(field);
  for (let i = 0; i < n; i += 1) {
    if (degree[i] > 0) graph[i * 3 + 1] = 7 + jitter() * 1.2;
  }

  // Biggest clusters nearest the middle, so the eye lands on them first.
  const order = Array.from({ length: world.clusters.length }, (_, k) => k)
    .sort((a, b) => world.clusters[b].size - world.clusters[a].size);

  // Accounts in no cluster move to a shelf below and outside, so the clusters
  // own the middle without anything being dropped from the scene.
  const islands = new Float32Array(graph);
  for (let i = 0; i < n; i += 1) {
    if (clusterOf[i] >= 0) continue;
    const x = field[i * 3];
    const z = field[i * 3 + 2];
    const d = Math.hypot(x, z) || 1;
    const out = SHELF_INNER + (d / FIELD_RADIUS) * (SHELF_OUTER - SHELF_INNER);
    islands[i * 3] = (x / d) * out;
    islands[i * 3 + 1] = -16;
    islands[i * 3 + 2] = (z / d) * out;
  }

  // Spacing on a plain spiral is the same for a cluster of three and a cluster
  // of sixty, so the big ones land on top of each other. Stepping the radius by
  // the area already placed keeps them apart at any size.
  const centres = [];
  let placed = 0;
  order.forEach((k, rank) => {
    const c = world.clusters[k];
    const r = radiusOf(c.size);
    const ring = Math.sqrt(placed / Math.PI);
    const a = rank * GOLDEN;
    const px = ring * Math.cos(a);
    const pz = ring * Math.sin(a);
    placed += (Math.PI * (r + ISLAND_GAP) ** 2) / ISLAND_PACKING;
    centres.push([px, pz]);
    c.members.forEach((m, i) => {
      const [dx, dz] = phyllotaxis(i, c.members.length, r);
      islands[m * 3] = px + dx;
      islands[m * 3 + 1] = 5;
      islands[m * 3 + 2] = pz + dz;
    });
  });

  let insideEdges = 0;
  for (let e = 0; e < source.length; e += 1) {
    const a = clusterOf[source[e]];
    if (a >= 0 && a === clusterOf[target[e]]) insideEdges += 1;
  }

  return { clusterOf, degree, field, graph, islands, islandOrder: order,
           insideEdges, crossEdges: source.length - insideEdges,
           centres: { islands: centres } };
}

/* The strongest edge inside a cluster: the pair the linkage was surest about,
   and the one the evidence stage walks through. */
export function strongestEdge(world, clusterOf, k) {
  const { source, target, bits } = world.edges;
  let best = -1;
  for (let e = 0; e < source.length; e += 1) {
    if (clusterOf[source[e]] !== k || clusterOf[target[e]] !== k) continue;
    if (best < 0 || bits[e] > bits[best]) best = e;
  }
  return best < 0 ? null : best;
}

export function accountAt(world, i) {
  const row = { index: i };
  for (const c of world.columns) row[c] = world.accounts[c][i];
  return row;
}

export function edgeAt(world, e) {
  const { source, target, bits, contributions } = world.edges;
  const parts = world.link.comparisons
    .map((name, k) => ({ name, bits: contributions[e][k] }))
    .sort((a, b) => b.bits - a.bits);

  // Running total in the order the reader sees them, so the line where it
  // crosses the threshold is the line that crossed it.
  let total = 0;
  for (const part of parts) {
    total += part.bits;
    part.running = Math.round(total * 100) / 100;
  }

  return {
    index: e,
    source: source[e],
    target: target[e],
    bits: bits[e],
    parts,
  };
}

export function edgesInCluster(world, clusterOf, k) {
  const { source, target } = world.edges;
  const out = [];
  for (let e = 0; e < source.length; e += 1) {
    if (clusterOf[source[e]] === k && clusterOf[target[e]] === k) out.push(e);
  }
  return out;
}
