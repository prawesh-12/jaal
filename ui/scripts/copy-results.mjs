// Copy what the pipeline wrote into public/data so the dashboard can fetch it.
// The UI computes nothing. It reads results and draws them.
import { cpSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const from = join(process.cwd(), "..", "results");
const to = join(process.cwd(), "public", "data");

if (!existsSync(from)) {
  console.error("no ../results directory. Run ./run.sh first.");
  process.exit(1);
}
mkdirSync(to, { recursive: true });
let n = 0;
for (const f of readdirSync(from)) {
  if (f.endsWith(".json") || f.endsWith(".png")) {
    cpSync(join(from, f), join(to, f));
    n += 1;
  }
}
console.log(`copied ${n} result files into public/data`);
