import { useEffect, useState } from "react";
import { ShieldHalf } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mark } from "@/components/mark";
import { useJson } from "@/lib/useJson";
import { compactRupees, count } from "@/lib/format";
import Overview from "@/views/Overview";
import Cost from "@/views/Cost";
import Failure from "@/views/Failure";
import Pipeline from "@/views/Pipeline";
import Queue from "@/views/Queue";
import Charts from "@/views/Charts";

const TABS = [
  ["overview", "Overview"],
  ["cost", "Cost"],
  ["failure", "Failures"],
  ["pipeline", "Pipeline"],
  ["queue", "Queue"],
  ["charts", "Charts"],
];

const KEYS = TABS.map(([k]) => k);
const ALIASES = { results: "overview" };

function Header({ holdout }) {
  const net = holdout?.pooled?.net_vs_nothing_rupees;
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <a href="#overview" className="flex shrink-0 items-center gap-2.5">
          <Mark size={22} />
          <span className="text-[15px] font-semibold tracking-tight">Jaal</span>
        </a>

        <TabsList aria-label="Sections">
          {TABS.map(([k, label]) => (
            <TabsTrigger key={k} value={k}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {holdout && (
          <div className="ml-auto hidden shrink-0 items-center gap-3 lg:flex">
            <span className="num text-[12px] text-subtle">
              {count(holdout.n_seeds)} worlds · {count(holdout.n_clusters)} clusters
            </span>
            <span className="num rounded-md border border-positive/25 bg-positive/10 px-2 py-1 text-[12px] font-medium text-positive">
              {compactRupees(net)} net
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

/* Short enough to sit on every tab without becoming furniture nobody reads. */
function DefenceStrip() {
  return (
    <div className="border-b border-border-subtle bg-card/60">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-2 text-[12px] text-subtle">
        <ShieldHalf size={13} className="shrink-0" />
        <p>
          Defence only. Every account record on this page is synthetic, produced by a
          test fixture. No real identifiers, no payment rails, no evasion guidance.
        </p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-border-subtle bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Mark size={20} />
              <span className="text-[14px] font-semibold tracking-tight">Jaal</span>
            </div>
            <p className="mt-3 max-w-[52ch] text-[12.5px] leading-[1.7] text-muted-foreground">
              Jaal detects groups of accounts run by one person farming a merchant's
              first-order promo discount. The data is synthetic because real promo
              abuse is unlabelled, and there is no other way to measure a detector
              against a known answer.
            </p>
          </div>

          <div>
            <h3 className="text-[12.5px] font-semibold text-foreground">What this page is</h3>
            <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>It computes nothing.</li>
              <li>Every figure is read from a JSON file the pipeline wrote.</li>
              <li>Where a figure disagrees with the pipeline, the pipeline is right.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-[12.5px] font-semibold text-foreground">Reproducing it</h3>
            <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>
                <span className="num text-foreground">./run.sh</span> rebuilds every
                number offline.
              </li>
              <li>Seeds are fixed, so a rerun is byte for byte identical.</li>
              <li>Seeds 900 to 999 were sealed and opened once.</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[12px] text-subtle">
          <span>Razorpay Buildathon 2026 · Track 02, AI Risk Manager</span>
          <span>Synthetic data throughout. Nothing here describes a real merchant.</span>
        </div>
      </div>
    </footer>
  );
}

/* The hash keeps a tab linkable, so a reviewer can send someone straight to it. */
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
  const explanations = useJson("explanations");

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-screen flex-col">
      <Header holdout={holdout.data} />
      <DefenceStrip />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <TabsContent value="overview">
          <Overview
            holdout={holdout.data}
            baseline={baseline.data}
            decisions={decisions.data}
            loading={holdout.loading}
          />
        </TabsContent>
        <TabsContent value="cost">
          <Cost decisions={decisions.data} loading={decisions.loading} />
        </TabsContent>
        <TabsContent value="failure">
          <Failure holdout={holdout.data} loading={holdout.loading} />
        </TabsContent>
        <TabsContent value="pipeline">
          <Pipeline />
        </TabsContent>
        <TabsContent value="queue">
          <Queue explanations={explanations.data} loading={explanations.loading} />
        </TabsContent>
        <TabsContent value="charts">
          <Charts />
        </TabsContent>
      </main>

      <Footer />
    </Tabs>
  );
}
