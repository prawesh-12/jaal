import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Metric, MetricRow } from "@/components/metric";
import {
  Empty, Metadata, PageHeader, Section, Skeleton, Status, TierLegend, TIER_TONE,
} from "@/components/section";
import { TIERS, count, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE = 24;

/*
  Notes arrive as one string: a paragraph, then a heading, then dashed bullets.
  Splitting it here is presentation only, the text itself is untouched.
*/
function parseNote(text) {
  // Some cached model notes carry markdown emphasis. Strip the syntax only,
  // never a word, because every number in here has been audited as written.
  const lines = text.replace(/\*\*/g, "").split("\n");
  const lead = [];
  const bullets = [];
  let heading = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("-")) bullets.push(line.replace(/^-\s*/, ""));
    else if (line.endsWith(":")) heading = line.slice(0, -1);
    else lead.push(line);
  }
  return { lead: lead.join(" "), heading, bullets };
}

function NoteEntry({ n }) {
  const { lead, heading, bullets } = parseNote(n.note);
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-line px-5 py-3">
        <span className="inline-flex items-center gap-2.5 text-[13px] text-fg">
          <Status tone={TIER_TONE[n.tier]} />
          {n.tier}
        </span>
        <span className="ident text-[12.5px] text-fg-faint">
          seed {n.seed} · cluster {n.cluster_id}
        </span>
        <span className="tnum text-[12.5px] text-fg-muted">{n.size} accounts</span>
        <span className="ml-auto flex flex-wrap items-baseline gap-x-5 text-[12.5px]">
          <span className="text-fg-faint">
            p <span className="tnum text-fg-muted">{n.p.toFixed(2)}</span>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-2",
              n.action === "block" ? "text-bad" : "text-warn"
            )}
          >
            <Status tone={n.action === "block" ? "bad" : "warn"} />
            {n.action}
          </span>
          <span className="ident text-fg-faint">
            {n.source === "live" ? n.model : "template"}
          </span>
        </span>
      </div>

      <div className="px-5 py-5">
        <p className="max-w-[92ch] text-[14px] leading-[1.65] text-fg">{lead}</p>
        {bullets.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            {heading && <div className="label mb-3">{heading}</div>}
            <ul className="space-y-2.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-[1.6] text-fg-muted">
                  <span className="tnum shrink-0 text-fg-faint">{i + 1}</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex items-center border border-line">
      {options.map((o) => {
        const key = typeof o === "string" ? o : o.value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={value === key}
            className={cn(
              "inline-flex h-8 items-center gap-2 border-l border-line px-3 text-[12.5px] transition-colors first:border-l-0",
              value === key
                ? "bg-raised text-fg"
                : "text-fg-faint hover:text-fg-muted"
            )}
          >
            {typeof o === "string" ? o : o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Queue({ explanations, loading }) {
  const [tier, setTier] = useState("all");
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const notes = explanations?.notes ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notes.filter(
      (n) =>
        (tier === "all" || n.tier === tier) &&
        (action === "all" || n.action === action) &&
        (!needle ||
          n.note.toLowerCase().includes(needle) ||
          String(n.seed).includes(needle))
    );
  }, [notes, tier, action, q]);

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!explanations) return <Empty>No results/explanations.json yet. Run ./run.sh.</Empty>;

  const set = (fn) => (v) => {
    fn(v);
    setShown(PAGE);
  };

  const tierOptions = [
    { value: "all", label: "all tiers" },
    ...TIERS.map((t) => ({
      value: t,
      label: (
        <span className="inline-flex items-center gap-2">
          <Status tone={TIER_TONE[t]} />
          {t}
        </span>
      ),
    })),
  ];

  return (
    <div className="pt-14">
      <PageHeader
        title="Review queue"
        lede={`${count(explanations.n_notes)} clusters the system did not simply allow, ordered worst first by rupees extracted. Every number inside a note is checked against the pipeline before it is shown. The language model, where one was used, only writes the sentence around those numbers.`}
      >
        <Metadata
          className="mt-8"
          items={[
            ["Served from cache", pct(explanations.served_from_cache / explanations.n_notes, 0)],
            ["Failed the audit", explanations.notes_with_unverified_numbers],
          ]}
        />
      </PageHeader>

      <Section title="Queue composition">
        <MetricRow>
          <Metric
            label="Blocked outright"
            value={count(notes.filter((n) => n.action === "block").length)}
            note="No human asked"
          />
          <Metric
            label="Sent to a human"
            value={count(notes.filter((n) => n.action === "review").length)}
            note="The queue an analyst works through"
          />
          <Metric
            label="Written by a model"
            value={count(explanations.sources.live ?? 0)}
            note={`${count(explanations.sources.template ?? 0)} came from the template fallback`}
          />
          <Metric
            label="Numbers that failed the audit"
            value={count(explanations.notes_with_unverified_numbers)}
            note="Every figure in a note is checked against the pipeline"
          />
        </MetricRow>
      </Section>

      <Section
        title="Notes"
        lede="Ordered worst first by rupees extracted, so the top of this list is the work to do first."
        meta={<TierLegend />}
      >
        <div className="sticky top-[52px] z-30 -mx-1 border-y border-line bg-base/95 px-1 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Tier" options={tierOptions} value={tier} onChange={set(setTier)} />
            <Segmented
              label="Action"
              options={["all", "block", "review"]}
              value={action}
              onChange={set(setAction)}
            />
            <label className="ml-auto flex h-8 min-w-56 flex-1 items-center gap-2 border border-line px-3 focus-within:border-line-strong sm:flex-none">
              <Search size={13} className="shrink-0 text-fg-faint" />
              <input
                value={q}
                onChange={(e) => set(setQ)(e.target.value)}
                placeholder="search notes or a seed"
                className="w-full bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
              />
            </label>
          </div>
          <div className="mt-3 text-[12.5px] text-fg-faint">
            Showing <span className="tnum text-fg-muted">{count(Math.min(shown, filtered.length))}</span>{" "}
            of <span className="tnum text-fg-muted">{count(filtered.length)}</span> matching notes
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty>Nothing matches that filter.</Empty>
        ) : (
          <div className="mt-8 space-y-3">
            {filtered.slice(0, shown).map((n, i) => (
              <NoteEntry
                key={`${n.seed}-${n.tier}-${n.cluster_id}-${i}`}
                n={n}
                rank={i + 1}
              />
            ))}
          </div>
        )}

        {shown < filtered.length && (
          <button
            type="button"
            onClick={() => setShown((s) => s + PAGE)}
            className="mt-3 h-11 w-full border border-line text-[13px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
        )}
      </Section>
    </div>
  );
}
