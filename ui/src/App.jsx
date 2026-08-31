import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Mark, GithubMark } from "@/components/mark";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";
import { useJson } from "@/lib/useJson";
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

const ALIASES = {
  failure: "failures",
  cost: "deep", pipeline: "deep", queue: "deep", charts: "deep",
};

function TopNav({ tab, onGoTo }) {
  const [open, setOpen] = useState(false);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const key = (e) => e.key === "Escape" && setOpen(false);
    const away = (e) => {
      if (!panel.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", away);
    };
  }, [open]);

  const go = (k) => {
    setOpen(false);
    onGoTo(k);
  };

  return (
    <header ref={panel}
            className="sticky top-0 z-40 border-b border-line bg-base/90 backdrop-blur-sm">
      <div className="shell flex h-[52px] items-center gap-4 md:gap-8">
        <a href="#overview" className="flex shrink-0 items-center gap-2.5 text-fg">
          <Mark />
          <span className="text-[14px] font-medium tracking-[-0.01em]">Jaal</span>
        </a>

        <div role="tablist" aria-label="Sections"
             className="-mb-px hidden min-w-0 items-stretch overflow-x-auto md:flex">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              id={`tab-${k}`}
              type="button"
              role="tab"
              aria-selected={tab === k}
              aria-controls="panel"
              onClick={() => onGoTo(k)}
              className={cn(
                "interactive relative inline-flex h-[52px] shrink-0 items-center px-3.5 text-[13.5px] whitespace-nowrap",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                tab === k ? "text-fg after:bg-accent"
                          : "text-fg-faint after:bg-transparent hover:text-fg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <a
            href="https://github.com/prawesh-12/jaal"
            target="_blank"
            rel="noreferrer"
            aria-label="Jaal on GitHub"
            className="interactive inline-flex h-8 items-center gap-2 border border-line px-2.5 text-[13px] text-fg-muted hover:border-line-strong hover:text-fg sm:px-3"
          >
            <GithubMark size={14} />
            <span className="hidden sm:inline">Repo</span>
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? "Close the menu" : "Open the menu"}
            className="interactive inline-flex size-8 items-center justify-center border border-line text-fg-muted hover:border-line-strong hover:text-fg md:hidden"
          >
            {open ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="nav-menu" aria-label="Sections"
             className="border-t border-line bg-base md:hidden">
          <ul className="shell py-2">
            {TABS.map(([k, label]) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => go(k)}
                  aria-current={tab === k ? "page" : undefined}
                  className={cn(
                    "interactive flex w-full items-center justify-between border-b border-line py-3 text-left text-[15px] last:border-b-0",
                    tab === k ? "font-medium text-fg" : "text-fg-muted")}
                >
                  {label}
                  {tab === k && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="shell flex flex-wrap items-center justify-between gap-x-16 gap-y-6 py-10">
        <div>
          <div className="flex items-center gap-2.5 text-fg">
            <Mark size={16} />
            <span className="text-[14px] font-medium">Jaal</span>
          </div>
          <p className="mt-3 text-[13.5px] text-fg-muted">
            Fraud and promo-abuse risk intelligence
          </p>
          <p className="mt-1 text-[12.5px] text-fg-faint">
            Synthetic evaluation data &middot; CC BY-NC 4.0
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-[13.5px] text-fg-muted">
          <span>Trained and developed by</span>
          <a
            href="https://github.com/prawesh-12"
            target="_blank"
            rel="noreferrer"
            aria-label="Prawesh Mandal on GitHub"
            className="interactive inline-flex size-8 items-center justify-center border border-line text-fg-faint hover:border-line-strong hover:text-fg"
          >
            <GithubMark size={15} />
          </a>
        </div>
      </div>
    </footer>
  );
}

function useHashTab() {
  const read = () => {
    const raw = window.location.hash.replace("#", "").split("?")[0];
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
  const baseline = useJson("baseline_holdout");
  const model = useJson("model");

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <TopNav tab={tab} onGoTo={setTab} />

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}
            className={cn("enter flex min-h-0 flex-1 flex-col",
                          tab === "simulation" ? "" : "shell pb-20")}>
        {tab === "overview" && (
          <Overview
            holdout={holdout.data}
            decisions={decisions.data}
            model={model.data}
            loading={holdout.loading}
            onSimulate={() => setTab("simulation")}
          />
        )}
        {tab === "simulation" && <Simulation />}
        {tab === "results" && (
          <Results
            holdout={holdout.data}
            baseline={baseline.data}
            decisions={decisions.data}
            loading={holdout.loading}
          />
        )}
        {tab === "failures" && <Failure holdout={holdout.data} loading={holdout.loading} />}
        {tab === "use" && <Integrate />}
        {tab === "deep" && <DeepDive />}
      </main>

      {tab !== "simulation" && <Footer />}
    </div>
  );
}
