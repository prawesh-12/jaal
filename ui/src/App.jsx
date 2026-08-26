import { useEffect, useState } from "react";
import { ShieldAlert, TerminalSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mark } from "@/components/mark";
import { useJson } from "@/lib/useJson";
import { count } from "@/lib/format";
import Results from "@/views/Results";
import Cost from "@/views/Cost";
import Failure from "@/views/Failure";
import Queue from "@/views/Queue";
import Charts from "@/views/Charts";

const TABS = [
  ["results", "Results"],
  ["cost", "Cost"],
  ["failure", "Where it fails"],
  ["queue", "Review queue"],
  ["charts", "Charts"],
];

function Header({ holdout }) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line-soft bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-5">
        <Mark />
        <div className="flex items-baseline gap-3">
          <span className="text-[17px] font-semibold tracking-tight">Jaal</span>
          <span className="hidden text-[13px] text-ink-faint sm:inline">
            promo abuse ring detector
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {holdout && (
            <span className="num hidden rounded-lg border border-line-soft bg-surface/60 px-2.5 py-1 text-[11.5px] text-ink-dim lg:inline">
              {count(holdout.n_seeds)} worlds · {count(holdout.n_clusters)} clusters
            </span>
          )}
          <span className="num inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface/60 px-2.5 py-1 text-[11.5px] text-ink-dim">
            <TerminalSquare size={12} className="text-ink-faint" />
            ./run.sh
          </span>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="pt-12 pb-8">
      <h1 className="max-w-2xl text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-balance sm:text-[42px]">
        Finding the fraud{" "}
        <span className="text-ink-faint">between</span> transactions,
        <br className="hidden sm:block" /> not inside them.
      </h1>
      <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-dim">
        Fifty accounts each place one perfectly ordinary order and each claim one
        first-order discount. No single transaction looks wrong. Jaal links the
        accounts, scores the group, and prices the decision in rupees.
      </p>
    </div>
  );
}

function DefenceNotice() {
  return (
    <div className="lift relative overflow-hidden rounded-card border border-line-soft bg-surface/50">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-accent/70" />
      <div className="flex gap-3.5 px-5 py-4 pl-6">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-[13px] leading-relaxed text-ink-dim">
          <span className="font-semibold text-ink">
            Defence only, synthetic data only.
          </span>{" "}
          Jaal detects groups of accounts run by one person farming a merchant's
          first-order promo discount. Every account record here is synthetic,
          produced by a test fixture, because real promo abuse is unlabelled and
          there is no other way to measure a detector against a known answer. No
          real identifiers, no payment rails, no evasion guidance.
        </p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line-soft pt-6 pb-12 text-[12px] leading-relaxed text-ink-faint">
      <p>
        This page computes nothing. Every figure is read from a JSON file the
        pipeline wrote, and reproduces offline with{" "}
        <span className="num text-ink-dim">./run.sh</span>. Seeds 900 to 999 were
        sealed until Phase 7 and opened once.
      </p>
    </footer>
  );
}

const KEYS = TABS.map(([k]) => k);

/* The hash keeps a tab linkable, so a reviewer can send someone straight to it. */
function useHashTab() {
  const read = () => {
    const h = window.location.hash.replace("#", "");
    return KEYS.includes(h) ? h : "results";
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
    <div className="relative z-10 min-h-screen">
      <Header holdout={holdout.data} />

      <main className="mx-auto max-w-6xl px-5">
        <Hero />
        <DefenceNotice />

        <Tabs value={tab} onValueChange={setTab} className="mt-9">
          <TabsList>
            {TABS.map(([k, label]) => (
              <TabsTrigger key={k} value={k}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="results">
            <Results
              holdout={holdout.data}
              baseline={baseline.data}
              loading={holdout.loading}
            />
          </TabsContent>
          <TabsContent value="cost">
            <Cost decisions={decisions.data} loading={decisions.loading} />
          </TabsContent>
          <TabsContent value="failure">
            <Failure holdout={holdout.data} loading={holdout.loading} />
          </TabsContent>
          <TabsContent value="queue">
            <Queue explanations={explanations.data} loading={explanations.loading} />
          </TabsContent>
          <TabsContent value="charts">
            <Charts />
          </TabsContent>
        </Tabs>

        <Footer />
      </main>
    </div>
  );
}
