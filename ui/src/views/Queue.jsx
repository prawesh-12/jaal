import { useMemo, useState } from "react";
import { Search, Ban, Eye, Sparkles, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat, StatRow } from "@/components/stat";
import { Empty, SectionHead, Skeleton, TierDot } from "@/components/bits";
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
  const rail = n.action === "block" ? "var(--color-neg)" : "var(--color-warn)";

  return (
    <Card className="relative overflow-hidden transition-colors hover:border-line">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: rail }} />
      <CardContent className="pt-4 pl-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2 text-[12px] text-ink">
            <TierDot tier={n.tier} />
            {n.tier}
          </span>
          <span className="num text-[12px] text-ink-faint">
            seed {n.seed} · cluster {n.cluster_id}
          </span>
          <span className="num text-[12px] text-ink-dim">{n.size} accounts</span>

          <span className="ml-auto flex items-center gap-2">
            <Badge tone={n.p >= 0.99 ? "neg" : "warn"}>
              p <span className="num">{n.p.toFixed(2)}</span>
            </Badge>
            <Badge tone={n.action === "block" ? "neg" : "warn"}>
              {n.action === "block" ? <Ban size={11} /> : <Eye size={11} />}
              {n.action}
            </Badge>
            <Badge tone={n.source === "live" ? "accent" : "neutral"}>
              {n.source === "live" ? <Sparkles size={11} /> : <FileText size={11} />}
              {n.source === "live" ? n.model : "template"}
            </Badge>
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-ink">{lead}</p>

        {bullets.length > 0 && (
          <div className="mt-3 rounded-lg border border-line-soft bg-surface-2/35 p-3">
            {heading && <div className="eyebrow mb-2">{heading}</div>}
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-dim">
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
      </CardContent>
    </Card>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/60",
        active
          ? "border-accent/45 bg-accent/10 text-ink"
          : "border-line-soft bg-surface/60 text-ink-dim hover:text-ink"
      )}
    >
      {children}
    </button>
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

  const reset = (fn) => (v) => {
    fn(v);
    setShown(PAGE);
  };

  return (
    <div className="space-y-8">
      <section>
        <SectionHead title="Review queue">
          {count(explanations.n_notes)} clusters the system did not simply allow,
          ordered worst first by rupees extracted. Every number inside a note is
          checked against the pipeline before it is shown. The language model, where
          one was used, only writes the sentence around those numbers.
        </SectionHead>
        <StatRow>
          <Stat
            icon={Ban}
            label="blocked outright"
            value={count(notes.filter((n) => n.action === "block").length)}
            tone="neg"
            sub="no human asked"
          />
          <Stat
            icon={Eye}
            label="sent to a human"
            value={count(notes.filter((n) => n.action === "review").length)}
            tone="warn"
            sub="the queue an analyst works through"
          />
          <Stat
            icon={Sparkles}
            label="written by a model"
            value={count(explanations.sources.live ?? 0)}
            sub={`${count(explanations.sources.template ?? 0)} came from the template fallback`}
          />
          <Stat
            icon={FileText}
            label="numbers that failed the audit"
            value={count(explanations.notes_with_unverified_numbers)}
            tone={explanations.notes_with_unverified_numbers === 0 ? "pos" : "neg"}
            sub={`served from cache, ${pct(explanations.served_from_cache / explanations.n_notes, 0)} offline`}
          />
        </StatRow>
      </section>

      <div className="sticky top-[65px] z-20 -mx-1 rounded-card border border-line-soft bg-bg/85 px-3 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={tier === "all"} onClick={() => reset(setTier)("all")}>
            all tiers
          </Chip>
          {TIERS.map((t) => (
            <Chip key={t} active={tier === t} onClick={() => reset(setTier)(t)}>
              <span className="inline-flex items-center gap-2">
                <TierDot tier={t} />
                {t}
              </span>
            </Chip>
          ))}

          <span className="mx-1 h-5 w-px bg-line" />

          {["all", "block", "review"].map((a) => (
            <Chip key={a} active={action === a} onClick={() => reset(setAction)(a)}>
              {a}
            </Chip>
          ))}

          <label className="ml-auto flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-line-soft bg-surface/60 px-3 py-1.5 focus-within:border-accent/45 sm:flex-none">
            <Search size={13} className="text-ink-faint" />
            <input
              value={q}
              onChange={(e) => reset(setQ)(e.target.value)}
              placeholder="search notes or a seed"
              className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
        </div>
        <div className="mt-2.5 border-t border-line-soft pt-2 text-[12px] text-ink-faint">
          showing <span className="num text-ink-dim">{count(Math.min(shown, filtered.length))}</span>{" "}
          of <span className="num text-ink-dim">{count(filtered.length)}</span> matching notes
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
        <button
          type="button"
          onClick={() => setShown((s) => s + PAGE)}
          className="lift w-full rounded-card border border-line-soft bg-surface/60 py-3 text-[13px] text-ink-dim transition-colors hover:border-line hover:text-ink"
        >
          show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
    </div>
  );
}
