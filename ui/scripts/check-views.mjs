// Renders every view once, against the real result files, and fails if one
// throws. The build only proves the modules parse; this proves they run.
//
//   npm run check
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import esbuild from "esbuild";

const root = process.cwd();
const tmp = join(root, "node_modules/.cache/jaal-check");
mkdirSync(tmp, { recursive: true });

// A stylesheet without this line still compiles, and every page renders with
// no CSS at all. Cheap to assert, expensive to notice by eye.
const css = readFileSync(join(root, "src/index.css"), "utf8");
if (!/^@import\s+["']tailwindcss["'];/m.test(css)) {
  console.error("src/index.css is missing its `@import \"tailwindcss\";` line, "
                + "so the build would emit no utilities.");
  process.exit(1);
}

const data = {};
for (const f of readdirSync(join(root, "public/data"))) {
  if (f.endsWith(".json")) {
    data[f.slice(0, -5)] = JSON.parse(readFileSync(join(root, "public/data", f), "utf8"));
  }
}
const dataFile = join(tmp, "data.json");
writeFileSync(dataFile, JSON.stringify(data));

writeFileSync(join(tmp, "useJson.js"),
  `import all from ${JSON.stringify(dataFile)};\n` +
  "export function useJson(name) { return { data: all[name] ?? null, loading: false }; }\n");

const entry = join(tmp, "entry.jsx");
writeFileSync(entry, `
import { renderToString } from "react-dom/server.browser";
import all from ${JSON.stringify(dataFile)};
import Overview from "@/views/Overview";
import Simulation from "@/views/Simulation";
import Results from "@/views/Results";
import Failure from "@/views/Failure";
import DeepDive from "@/views/DeepDive";
import Cost from "@/views/Cost";
import Queue from "@/views/Queue";
import Charts from "@/views/Charts";
import Integrate from "@/views/Integrate";
import { Inspector } from "@/components/simulation/inspector";
import { layout } from "@/lib/world";

const TIERS = ["obvious", "moderate", "sophisticated", "adaptive"];
const BENIGN = ["family", "flatmates", "hostel", "office"];
const views = [
  ["Overview", <Overview holdout={all.holdout} loading={false} onSimulate={() => {}} />],
  ["Results", <Results holdout={all.holdout} baseline={all.baseline} decisions={all.decisions} loading={false} />],
  ["Failure", <Failure holdout={all.holdout} loading={false} />],
  ["DeepDive", <DeepDive />],
  ["Cost", <Cost decisions={all.decisions} loading={false} bare />],
  ["Queue", <Queue explanations={all.explanations} loading={false} bare />],
  ["Charts", <Charts bare />],
  ["Integrate", <Integrate bare />],
  ["Simulation", <Simulation />],
  // The scene needs a browser, but the panels beside it are plain React over
  // the same replay file. Every stage of every tier is rendered against the
  // real world, for both cases, so a bad field reference fails here.
  ...TIERS.flatMap((tier) => {
    const world = all["sim_world_" + tier + "_975"];
    if (!world) return [];
    const geom = layout(world);
    const pick = (ring) => world.clusters.filter((c) => (ring
      ? c.truth.label === 1
      : c.truth.label === 0 && BENIGN.includes(c.truth.dominant_benign_kind)))[0];
    return [0, 1, 2, 3, 4, 5, 6].flatMap((stage) =>
      [true, false].map((ring) => [
        "Inspector " + tier + "/" + (ring ? "ring" : "lookalike") + "/" + stage,
        <Inspector world={world} geom={geom} stage={stage}
                   cluster={stage >= 4 ? pick(ring) : null}
                   selected={null} onSelect={() => {}} />,
      ]));
  }),
  ["Inspector account", (() => {
    const world = all.sim_world_obvious_975;
    const geom = layout(world);
    return <Inspector world={world} geom={geom} stage={4}
                      cluster={null} selected={{ kind: "account", id: 0 }}
                      onSelect={() => {}} />;
  })()],
  ["Inspector edge", (() => {
    const world = all.sim_world_obvious_975;
    const geom = layout(world);
    return <Inspector world={world} geom={geom} stage={4}
                      cluster={null} selected={{ kind: "edge", id: 0 }}
                      onSelect={() => {}} />;
  })()],
];

let bad = 0;
for (const [name, el] of views) {
  try {
    renderToString(el);
    console.log("  ok    " + name);
  } catch (e) {
    bad += 1;
    console.log("  FAIL  " + name + ": " + e.message);
  }
}
console.log(bad ? bad + " view(s) failed" : views.length + " views rendered");
process.exit(bad ? 1 : 0);
`);

await esbuild.build({
  entryPoints: [entry],
  bundle: true, platform: "node", format: "cjs", jsx: "automatic",
  outfile: join(tmp, "out.cjs"), loader: { ".jsx": "jsx" }, logLevel: "error",
  plugins: [{
    name: "jaal-alias",
    setup(build) {
      build.onResolve({ filter: /^@\/lib\/useJson$/ }, () => ({ path: join(tmp, "useJson.js") }));
      build.onResolve({ filter: /^@\// }, (a) => {
        const base = resolve(root, "src", a.path.slice(2));
        for (const p of [base, base + ".jsx", base + ".js"]) {
          try { readFileSync(p); return { path: p }; } catch { /* try the next */ }
        }
        return { path: base };
      });
    },
  }],
});

await import(join(tmp, "out.cjs"));
