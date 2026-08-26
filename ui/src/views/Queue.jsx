import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Stat, StatRow } from "@/components/stat";
import { Empty, PageHead, Skeleton, TierDot } from "@/components/bits";
import { TIERS, TIER_COLOR, count, pct } from "@/lib/format";
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

function NoteCard({ n }) {
  const { lead, heading, bullets } = parseNote(n.note);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-panel border-b border-border-subtle bg-muted/30 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-[12.5px] text-foreground">
          <TierDot tier={n.tier} />
          {n.tier}
        </span>
        <span className="num text-[12px] text-subtle">
          seed {n.seed} · cluster {n.cluster_id}
        </span>
        <span className="num text-[12px] text-muted-foreground">{n.size} accounts</span>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone={n.p >= 0.99 ? "negative" : "caution"}>
            p <span className="num">{n.p.toFixed(2)}</span>
          </Badge>
          <Badge tone={n.action === "block" ? "negative" : "caution"}>{n.action}</Badge>
          <Badge tone={n.source === "live" ? "primary" : "neutral"}>
            {n.source === "live" ? n.model : "template"}
          </Badge>
        </span>
      </div>

      <div className="px-4 py-4">
        <p className="text-[13px] leading-[1.65] text-foreground">{lead}</p>

        {bullets.length > 0 && (
          <div className="mt-3.5 rounded-md border border-border-subtle bg-background/40 p-3.5">
            {heading && <div className="label mb-2">{heading}</div>}
            <ul className="space-y-2">
              {bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground"
                >
                  <span
                    className="mt-[7px] size-1 shrink-0 rounded-full"
                    style={{ background: TIER_COLOR[n.tier] }}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/* One segmented control per filter, so the choices read as a set. */
function Segmented({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border-subtle bg-card p-0.5">
      {options.map((o) => {
        const key = typeof o === "string" ? o : o.value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex h-7 items-center gap-2 rounded-[5px] px-2.5 text-[12.5px] transition-colors",
              value === key
                ? "bg-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground"
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

  if (loading) return <Skeleton className="h-96 w-full" />;
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
          <TierDot tier={t} />
          {t}
        </span>
      ),
    })),
  ];

  return (
    <div className="space-y-10">
      <PageHead
        title="Review queue"
        lede={`${count(explanations.n_notes)} clusters the system did not simply allow, ordered worst first by rupees extracted. Every number inside a note is checked against the pipeline before it is shown. The language model, where one was used, only writes the sentence around those numbers.`}
      />

      <StatRow>
        <Stat
          label="Blocked outright"
          value={count(notes.filter((n) => n.action === "block").length)}
          tone="negative"
          sub="no human asked"
        />
        <Stat
          label="Sent to a human"
          value={count(notes.filter((n) => n.action === "review").length)}
          tone="caution"
          sub="the queue an analyst works through"
        />
        <Stat
          label="Written by a model"
          value={count(explanations.sources.live ?? 0)}
          sub={`${count(explanations.sources.template ?? 0)} came from the template fallback`}
        />
        <Stat
          label="Numbers that failed the audit"
          value={count(explanations.notes_with_unverified_numbers)}
          tone={explanations.notes_with_unverified_numbers === 0 ? "positive" : "negative"}
          sub={`served from cache, ${pct(explanations.served_from_cache / explanations.n_notes, 0)} offline`}
        />
      </StatRow>

      <div className="sticky top-14 z-30 -mx-2 rounded-panel border border-border-subtle bg-background/90 px-3 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={tierOptions} value={tier} onChange={set(setTier)} />
          <Separator vertical className="mx-1" />
          <Segmented options={["all", "block", "review"]} value={action} onChange={set(setAction)} />
          <SearchInput
            className="ml-auto min-w-56 flex-1 sm:flex-none"
            value={q}
            onChange={(e) => set(setQ)(e.target.value)}
            placeholder="search notes or a seed"
          />
        </div>
        <div className="mt-2.5 border-t border-border-subtle pt-2 text-[12px] text-subtle">
          showing{" "}
          <span className="num text-muted-foreground">
            {count(Math.min(shown, filtered.length))}
          </span>{" "}
          of <span className="num text-muted-foreground">{count(filtered.length)}</span>{" "}
          matching notes
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>Nothing matches that filter.</Empty>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, shown).map((n, i) => (
            <NoteCard key={`${n.seed}-${n.tier}-${n.cluster_id}-${i}`} n={n} />
          ))}
        </div>
      )}

      {shown < filtered.length && (
        <Button size="wide" onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(PAGE, filtered.length - shown)} more
        </Button>
      )}
    </div>
  );
}
