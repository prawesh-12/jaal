import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mark } from "@/components/mark";
import { useJson } from "@/lib/useJson";
import { compactRupees, count } from "@/lib/format";
import Overview from "@/views/Overview";
import Simulation from "@/views/Simulation";
import Results from "@/views/Results";
import Failure from "@/views/Failure";
import DeepDive from "@/views/DeepDive";

const TABS = [
  ["overview", "Overview"],
  ["simulation", "Simulation"],
  ["results", "Results"],
  ["failures", "Failures"],
  ["deep", "Deep Dive"],
];

const KEYS = TABS.map(([k]) => k);

// The old five-page layout is linked from the docs, so its hashes still land
// somewhere sensible rather than silently falling back to the overview.
const ALIASES = {
  failure: "failures",
  cost: "deep", pipeline: "deep", queue: "deep", charts: "deep", use: "deep",
};

function TopNav({ holdout }) {
  const net = holdout?.pooled?.net_vs_nothing_rupees;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/90 backdrop-blur-sm">
      <div className="shell flex h-[52px] items-center gap-8">
        <a href="#overview" className="flex shrink-0 items-center gap-2.5 text-fg">
          <Mark />
          <span className="text-[14px] font-medium tracking-[-0.01em]">Jaal</span>
        </a>

        <TabsList aria-label="Sections">
          {TABS.map(([k, label]) => (
            <TabsTrigger key={k} value={k}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {holdout && (
          <div className="ml-auto hidden shrink-0 items-baseline gap-5 lg:flex">
            <span className="tnum text-[12.5px] text-fg-faint">
              {count(holdout.n_seeds)} worlds · {count(holdout.n_clusters)} clusters
            </span>
            <span className="tnum text-[12.5px] text-fg-muted">
              {compactRupees(net)} net
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

function DefenceLine() {
  return (
    <div className="border-b border-line bg-sunken">
      <p className="shell py-2 text-[12.5px] text-fg-faint">
        Defence only. Every account record here is synthetic, produced by a test
        fixture. No real identifiers, no payment rails, no evasion guidance.
      </p>
    </div>
  );
}

function Footer() {
  const columns = [
    ["What this page is", [
      "It computes nothing.",
      "Every figure is read from a JSON file the pipeline wrote.",
      "Where a figure disagrees with the pipeline, the pipeline is right.",
    ]],
    ["Reproducing it", [
      "./run.sh rebuilds every number offline.",
      "Seeds are fixed, so a rerun is byte for byte identical.",
      "Seeds 900 to 999 were sealed and opened once.",
    ]],
  ];

  return (
    <footer className="mt-24 border-t border-line">
      <div className="shell grid gap-12 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 text-fg">
            <Mark size={16} />
            <span className="text-[13.5px] font-medium">Jaal</span>
          </div>
          <p className="mt-4 max-w-[50ch] text-[13px] leading-[1.7] text-fg-muted">
            Jaal detects groups of accounts run by one person farming a merchant's
            first-order promo discount. The data is synthetic because real promo
            abuse is unlabelled, and there is no other way to measure a detector
            against a known answer.
          </p>
        </div>
        {columns.map(([heading, lines]) => (
          <div key={heading}>
            <h3 className="label">{heading}</h3>
            <ul className="mt-4 space-y-2.5 text-[13px] leading-[1.55] text-fg-muted">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="shell flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-[12.5px] text-fg-faint">
        <span>Razorpay Buildathon 2026 · Track 02, AI Risk Manager</span>
        <span>Synthetic data throughout. Nothing here describes a real merchant.</span>
      </div>
    </footer>
  );
}

function useHashTab() {
  const read = () => {
    const raw = window.location.hash.replace("#", "");
    const h = ALIASES[raw] ?? raw;
    return KEYS.includes(h) ? h : "overview";
  };
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const change = (v) => {
    setTab(v);
    window.history.replaceState(null, "", `#${v}`);
    window.scrollTo({ top: 0 });
  };
  return [tab, change];
}

export default function App() {
  const [tab, setTab] = useHashTab();
  const holdout = useJson("holdout");
  const decisions = useJson("decisions");
  const baseline = useJson("baseline");
  const blocking = useJson("blocking");
  const clustering = useJson("clustering");
  const model = useJson("model");

  return (
    <Tabs value={tab} onValueChange={setTab} className="relative z-10 flex min-h-screen flex-col">
      <TopNav holdout={holdout.data} />
      <DefenceLine />

      <main className="shell flex-1 pb-20">
        <TabsContent value="overview">
          <Overview
            holdout={holdout.data}
            decisions={decisions.data}
            blocking={blocking.data}
            clustering={clustering.data}
            model={model.data}
            loading={holdout.loading}
            onSimulate={() => setTab("simulation")}
          />
        </TabsContent>
        <TabsContent value="simulation">
          <Simulation />
        </TabsContent>
        <TabsContent value="results">
          <Results
            holdout={holdout.data}
            baseline={baseline.data}
            loading={holdout.loading}
          />
        </TabsContent>
        <TabsContent value="failures">
          <Failure holdout={holdout.data} loading={holdout.loading} />
        </TabsContent>
        <TabsContent value="deep">
          <DeepDive />
        </TabsContent>
      </main>

      <Footer />
    </Tabs>
  );
}
