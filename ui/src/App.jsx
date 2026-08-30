import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme";
import { useJson } from "@/lib/useJson";
import { compactRupees } from "@/lib/format";
import Overview from "@/views/Overview";
import Simulation from "@/views/Simulation";
import Results from "@/views/Results";
import Failure from "@/views/Failure";
import Integrate from "@/views/Integrate";
import DeepDive from "@/views/DeepDive";

const TABS = [
  ["overview", "Overview"],
  ["simulation", "Simulation"],
  ["results", "Results"],
  ["failures", "Failures"],
  ["use", "Using Jaal"],
  ["deep", "Deep Dive"],
];

const KEYS = TABS.map(([k]) => k);

// The old five-page layout is linked from the docs, so its hashes still land
// somewhere sensible rather than silently falling back to the overview.
const ALIASES = {
  failure: "failures",
  cost: "deep", pipeline: "deep", queue: "deep", charts: "deep",
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

        <div className="ml-auto flex shrink-0 items-center gap-4">
          {holdout && (
            <span className="tnum hidden text-[12.5px] text-fg-muted lg:inline">
              {compactRupees(net)} net on the sealed holdout
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function DefenceLine() {
  return (
    <div className="border-b border-line bg-sunken">
      <p className="shell py-2 text-[12.5px] text-fg-faint">
        Defence only. Every account record here is synthetic, produced by a test
        fixture. Every figure is read from a file <span className="ident">./run.sh</span> wrote.
      </p>
    </div>
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
            decisions={decisions.data}
            loading={holdout.loading}
          />
        </TabsContent>
        <TabsContent value="failures">
          <Failure holdout={holdout.data} loading={holdout.loading} />
        </TabsContent>
        <TabsContent value="use">
          <Integrate />
        </TabsContent>
        <TabsContent value="deep">
          <DeepDive />
        </TabsContent>
      </main>

    </Tabs>
  );
}
