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
import Pipeline from "@/views/Pipeline";
import Queue from "@/views/Queue";
import Charts from "@/views/Charts";
import Integrate from "@/views/Integrate";

const TIERS = ["obvious", "moderate", "sophisticated", "adaptive"];
const views = [
  ["Overview", <Overview holdout={all.holdout} decisions={all.decisions}
                model={all.model} loading={false} onSimulate={() => {}} />],
  ["Results", <Results holdout={all.holdout} baseline={all.baseline} decisions={all.decisions} loading={false} />],
  ["Failure", <Failure holdout={all.holdout} loading={false} />],
  ["DeepDive", <DeepDive />],
  ["Cost", <Cost decisions={all.decisions} loading={false} bare />],
  ["Pipeline", <Pipeline bare />],
  ["Queue", <Queue explanations={all.explanations} loading={false} bare />],
  ["Charts", <Charts bare />],
  ["Integrate", <Integrate bare />],
  // Every branch of the simulation, since a tier decides which figures it reads.
  ...TIERS.flatMap((t) => ["ring", "benign"].map((m) =>
    ["Simulation " + t + "/" + m, <Simulation __tier={t} __mode={m} __step={6} />])),
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
      // The simulation drives itself from state, so the check reaches inside to
      // start it on a chosen tier and step. Source on disk is untouched.
      build.onLoad({ filter: /views[/\\]Simulation\.jsx$/ }, (a) => ({
        loader: "jsx",
        contents: readFileSync(a.path, "utf8")
          .replace("export default function Simulation() {",
                   "export default function Simulation({ __tier, __mode, __step }) {")
          .replace('useState("moderate")', 'useState(__tier ?? "moderate")')
          .replace('useState("ring")', 'useState(__mode ?? "ring")')
          .replace("const [step, setStep] = useState(0)",
                   "const [step, setStep] = useState(__step ?? 0)"),
      }));
    },
  }],
});

await import(join(tmp, "out.cjs"));
