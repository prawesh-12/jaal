import { useMemo, useState } from "react";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Note } from "@/components/ui/panel";
import {
  Empty, Metadata, PageHeader, Section, Skeleton, Status, SubHead,
} from "@/components/section";
import { BarList } from "@/components/chart";
import { Arrow, Connector, Funnel, Node, Stage } from "@/components/flow";
import { useJson } from "@/lib/useJson";
import { MARK, TIERS, count, dp2, dp4, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
  The nine comparisons the scorer actually adds up. Mirrors SCORED_COMPARISONS
  in detector/link.py: order_value and coupon_floor are computed but excluded,
  because both punish a ring for varying its order values.
*/
const SCORED = ["device", "address", "pincode", "card_bin", "ip_prefix",
                "signup_gap", "hour_of_day", "order_count", "coupon_used"];

const TIER_TONE = {
  obvious: "ok",
  moderate: "info",
  sophisticated: "warn",
  adaptive: "bad",
};

const bits = (params, field, level) =>
  Math.log2(params.m[field][level] / params.u[field][level]);

function TierName({ tier }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Status tone={TIER_TONE[tier]} />
      <span className="text-fg">{tier}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- the rail */

function Rail({ blocking, clustering, model, tier }) {
  const b = blocking.tiers[tier];
  const c = clustering.tiers[tier];
  const n = blocking.n_accounts_per_world;
  const possible = (n * (n - 1)) / 2;

  const stages = [
    ["Accounts", "one merchant's population", count(n), "accounts in"],
    ["Block", "which pairs are worth comparing", count(b.candidate_pairs_mean),
     `of ${(possible / 1e6).toFixed(1)}M possible pairs`],
    ["Link", "evidence for each pair, in bits", String(SCORED.length),
     "comparisons per pair"],
    ["Cluster", "cut the graph into groups", count(c.edges),
     `edges above ${dp2(clustering.edge_threshold_bits)} bits`],
    ["Features", "turn a group into numbers", String(model.n_features),
     `per cluster, ${count(c.n_clusters)} clusters`],
    ["Score", "a calibrated probability", model.brier_isotonic.toFixed(5),
     "Brier, pooled"],
    ["Decide", "price the three actions", "3", "block, review, allow"],
  ];

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[1000px] items-stretch">
        {stages.map(([name, what, figure, unit], i) => (
          <div key={name} className="flex flex-1 basis-0 items-stretch">
            <Stage index={i + 1} name={name} what={what} figure={figure} unit={unit} />
            {i < stages.length - 1 && <Connector />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TierPicker({ value, onChange }) {
  return (
    <div role="group" aria-label="Tier" className="flex items-center border border-line">
      {TIERS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={cn(
            "inline-flex h-8 items-center gap-2 border-l border-line px-3 text-[12.5px] transition-colors first:border-l-0",
            value === t ? "bg-raised text-fg" : "text-fg-faint hover:text-fg-muted"
          )}
        >
          <Status tone={TIER_TONE[t]} />
          {t}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- the scorer */

/*
  Every weight here is measured. The reader picks what a pair agrees on and
  watches the total move, which is the only way the claim that six weak signals
  can outweigh one device match becomes checkable rather than asserted.

  Level indices into params.levels. Every preset total below was checked
  against results/link_params.json before it was written here.
*/
const PRESETS = {
  "a ring, same phone": {
    device: 0, pincode: 0, card_bin: 0, signup_gap: 0, hour_of_day: 0,
    order_count: 0, coupon_used: 0,
  },
  "a ring, phones rotated": {
    pincode: 0, card_bin: 0, signup_gap: 2, hour_of_day: 1,
    order_count: 0, coupon_used: 0,
  },
  "flatmates": {
    address: 0, pincode: 0, ip_prefix: 0, order_count: 1, coupon_used: 1,
  },
  "two strangers": {},
};

function Scorer({ params, threshold }) {
  const [levels, setLevels] = useState(PRESETS["a ring, same phone"]);

  const rows = SCORED.map((field) => {
    const chosen = levels[field] ?? params.levels[field].length - 1;
    return {
      field,
      chosen,
      options: params.levels[field].map((name, i) => ({
        name, i, bits: bits(params, field, i),
      })),
    };
  });

  const total = rows.reduce((sum, r) => sum + r.options[r.chosen].bits, 0);
  const edge = total >= threshold;
  const floor = rows.reduce((s, r) => s + r.options[r.options.length - 1].bits, 0);
  const ceiling = rows.reduce((s, r) => s + Math.max(...r.options.map((o) => o.bits)), 0);
  const at = (v) => ((v - floor) / (ceiling - floor)) * 100;

  return (
    <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div>
        <div className="border-t border-line">
          {rows.map((r) => (
            <div
              key={r.field}
              className="grid grid-cols-[112px_minmax(0,1fr)_70px] items-center gap-4 border-b border-line py-2"
            >
              <span className="ident truncate text-[12.5px] text-fg-muted">{r.field}</span>
              <div className="flex flex-wrap gap-px">
                {r.options.map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => setLevels((s) => ({ ...s, [r.field]: o.i }))}
                    aria-pressed={r.chosen === o.i}
                    className={cn(
                      "border px-2 py-0.5 text-[11.5px] transition-colors",
                      r.chosen === o.i
                        ? "border-line-strong bg-raised text-fg"
                        : "border-transparent text-fg-faint hover:text-fg-muted"
                    )}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
              <span
                className={cn(
                  "tnum text-right text-[12.5px]",
                  r.options[r.chosen].bits > 0 ? "text-fg" : "text-fg-faint"
                )}
              >
                {r.options[r.chosen].bits >= 0 ? "+" : ""}
                {r.options[r.chosen].bits.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="label">Try</span>
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button
              key={name}
              type="button"
              onClick={() => setLevels(preset)}
              className="border-b border-line-strong pb-0.5 text-[12.5px] text-fg-muted transition-colors hover:border-accent hover:text-fg"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="self-start border-t border-line-strong pt-5">
        <div className="label">Total evidence</div>
        <div
          className={cn(
            "tnum mt-3 text-[34px] leading-none font-medium tracking-[-0.02em]",
            edge ? "text-fg" : "text-fg-faint"
          )}
        >
          {total >= 0 ? "+" : ""}{total.toFixed(2)}
          <span className="ml-2 text-[14px] font-normal text-fg-faint">bits</span>
        </div>

        <div className="relative mt-6 h-2 bg-raised">
          <div
            className="h-full transition-[width] duration-200"
            style={{
              width: `${Math.max(0, Math.min(100, at(total)))}%`,
              background: edge ? MARK.ok : MARK.neutral,
            }}
          />
          <div
            className="absolute inset-y-[-4px] w-px bg-accent"
            style={{ left: `${at(threshold)}%` }}
          />
        </div>
        <div className="mt-2.5 flex justify-between text-[11.5px] text-fg-faint">
          <span className="tnum">{floor.toFixed(0)}</span>
          <span className="tnum text-fg-muted">edge at {dp2(threshold)}</span>
          <span className="tnum">+{ceiling.toFixed(0)}</span>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[13px] leading-[1.6] text-fg-muted">
          {edge
            ? "These two accounts get an edge. The graph will treat them as one operator."
            : "No edge. These two accounts are never compared again."}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the schematics */

function BlockingFan({ b, tier }) {
  const rules = b.rules;
  const top = 14;
  const step = 30;
  const height = top + rules.length * step + 8;
  const mid = height / 2;
  const rowY = (i) => top + i * step + 11;
  const line = "var(--color-line-strong)";

  return (
    <figure className="m-0 overflow-x-auto border-y border-line py-6">
      <svg
        viewBox={`0 0 704 ${height}`}
        className="w-full min-w-[600px]"
        role="img"
        aria-label="Six blocking rules fan out from every pair and merge back into one candidate set"
      >
        <g fill="none" stroke={line} strokeWidth="1">
          {rules.map((_, i) => (
            <g key={i}>
              <path d={`M112 ${mid} C 160 ${mid}, 160 ${rowY(i)}, 208 ${rowY(i)}`} />
              <path d={`M392 ${rowY(i)} C 440 ${rowY(i)}, 440 ${mid}, 488 ${mid}`} />
            </g>
          ))}
          <path d={`M572 ${mid} H 606`} />
        </g>
        <path d={`M606 ${mid - 3} L611 ${mid} L606 ${mid + 3} Z`} fill={line} />

        <rect x="12" y={mid - 15} width="100" height="30" rx="3"
              fill="var(--color-surface)" stroke="var(--color-line)" />
        <text x="62" y={mid + 4} textAnchor="middle" fontSize="11.5"
              fill="var(--color-fg-muted)">every pair</text>

        {rules.map((rule, i) => {
          const recall = b.tiers[tier].recall_by_rule[rule];
          const strong = recall >= 0.5;
          return (
            <g key={rule}>
              <rect x="208" y={rowY(i) - 11} width="184" height="22" rx="3"
                    fill="var(--color-surface)"
                    stroke={strong ? "var(--color-line-strong)" : "var(--color-line)"} />
              <text x="218" y={rowY(i) + 4} fontSize="11"
                    fontFamily="var(--font-mono)"
                    fill="var(--color-fg-muted)">{rule}</text>
              <text x="384" y={rowY(i) + 4} textAnchor="end" fontSize="11"
                    fill={strong ? "var(--color-fg)" : "var(--color-fg-faint)"}>
                {recall.toFixed(4)}
              </text>
            </g>
          );
        })}

        <rect x="488" y={mid - 15} width="84" height="30" rx="3"
              fill="var(--color-raised)" stroke={line} />
        <text x="530" y={mid + 4} textAnchor="middle" fontSize="11.5"
              fill="var(--color-fg)">dedupe</text>

        <text x="618" y={mid - 1} fontSize="11.5" fill="var(--color-fg)">
          {count(b.tiers[tier].candidate_pairs_mean)}
        </text>
        <text x="618" y={mid + 12} fontSize="10" fill="var(--color-fg-faint)">
          candidate pairs
        </text>
      </svg>
      <figcaption className="mt-5 text-[12.5px] leading-[1.6] text-fg-faint">
        Recall each rule reaches on its own, on the {tier} tier. A pair only has
        to survive one of them.
      </figcaption>
    </figure>
  );
}

/* Schematic, not a measured world. The bits quoted underneath are real. */
function GraphSchematic({ threshold, params }) {
  const device = bits(params, "device", 0);
  const address = bits(params, "address", 0);
  const pincode = bits(params, "pincode", 0);
  const ring = [[70, 40], [130, 20], [180, 58], [140, 98], [76, 94]];
  const family = [[310, 34], [362, 72], [300, 100]];

  return (
    <figure className="m-0 border-y border-line py-6">
      <svg viewBox="0 0 420 120" className="w-full" role="img"
           aria-label="A ring of five accounts and a family of three, drawn as graphs">
        <g stroke="var(--color-fg-faint)" strokeWidth="1" opacity="0.7">
          {ring.map(([x1, y1], i) =>
            ring.slice(i + 1).map(([x2, y2], j) => (
              <line key={`r${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            )))}
          {family.map(([x1, y1], i) =>
            family.slice(i + 1).map(([x2, y2], j) => (
              <line key={`f${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            )))}
        </g>
        {/* The edge that is never drawn, and the reason the two stay apart. */}
        <line x1="180" y1="58" x2="300" y2="66" stroke="var(--color-line-strong)"
              strokeWidth="1" strokeDasharray="3 4" />
        {ring.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={MARK.warn} />
        ))}
        {family.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={MARK.ok} />
        ))}
      </svg>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 text-[12.5px]">
        <span className="inline-flex items-center gap-2.5">
          <Status tone="warn" />
          <span className="text-fg-muted">one operator, 5 accounts</span>
        </span>
        <span className="inline-flex items-center gap-2.5">
          <Status tone="ok" />
          <span className="text-fg-muted">a family, 3 accounts</span>
        </span>
        <span className="inline-flex items-center gap-2.5">
          <span aria-hidden="true" className="h-px w-6 border-t border-dashed border-line-strong" />
          <span className="text-fg-faint">below {dp2(threshold)} bits, so no edge is drawn</span>
        </span>
      </div>

      <figcaption className="mt-4 max-w-[80ch] text-[12.5px] leading-[1.6] text-fg-faint">
        Schematic, not a measured world. Both groups are densely linked, so the
        graph on its own cannot tell them apart. Device agreement is worth{" "}
        <span className="tnum text-fg-muted">+{device.toFixed(2)}</span> bits,
        address <span className="tnum text-fg-muted">+{address.toFixed(2)}</span>,
        pincode <span className="tnum text-fg-muted">+{pincode.toFixed(2)}</span>.
        Separating a ring from a family is the model's job, not the graph's.
      </figcaption>
    </figure>
  );
}

function DecisionFlow({ decisions, nFeatures }) {
  const prices = [
    ["block", decisions.cost_blocked_innocent, "per innocent account stopped"],
    ["review", decisions.cost_analyst_review, "per cluster a human reads"],
    ["allow", decisions.cost_missed_abuser, "per ring account let through"],
  ];
  return (
    <div className="border-y border-line py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Node>{nFeatures} features</Node>
        <Arrow />
        <Node>
          <span className="block">forest</span>
          <span className="mt-0.5 block text-[10.5px] text-fg-faint">
            probability, purity
          </span>
        </Node>
        <Arrow />
        <Node>
          <span className="block">expected cost</span>
          <span className="mt-0.5 block text-[10.5px] text-fg-faint">of each action</span>
        </Node>
        <Arrow />
        <Node emphasis>cheapest wins</Node>
      </div>

      <dl className="mt-8 grid gap-x-10 gap-y-5 border-t border-line pt-6 sm:grid-cols-3">
        {prices.map(([name, value, what]) => (
          <div key={name}>
            <dt className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-fg-muted">{name}</span>
              <span className="tnum text-[14px] text-fg">{rupees(value)}</span>
            </dt>
            <dd className="mt-1.5 text-[12px] text-fg-faint">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export default function Pipeline() {
  const blocking = useJson("blocking");
  const link = useJson("link_params");
  const clustering = useJson("clustering");
  const model = useJson("model");
  const decisions = useJson("decisions");
  const [tier, setTier] = useState("moderate");

  const loading = blocking.loading || link.loading || clustering.loading || model.loading;
  const ready = blocking.data && link.data && clustering.data && model.data;

  const weights = useMemo(() => {
    if (!link.data) return [];
    const out = [];
    for (const field of SCORED) {
      link.data.levels[field].forEach((level, i) => {
        const v = bits(link.data, field, i);
        if (level !== "no" && v > 0) out.push({ label: `${field} · ${level}`, value: v });
      });
    }
    return out.sort((a, b) => b.value - a.value);
  }, [link.data]);

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!ready) return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;

  const b = blocking.data;
  const c = clustering.data;
  const m = model.data;
  const n = b.n_accounts_per_world;
  const possible = (n * (n - 1)) / 2;

  const volume = [
    { label: "pairs in one world", value: possible, display: count(possible),
      note: `${count(n)} accounts` },
    { label: "survive blocking", value: b.tiers[tier].candidate_pairs_mean,
      display: count(b.tiers[tier].candidate_pairs_mean),
      note: `${pct(b.tiers[tier].pair_reduction_ratio, 2)} cut` },
    { label: `score above ${dp2(c.edge_threshold_bits)} bits`, value: c.tiers[tier].edges,
      display: count(c.tiers[tier].edges), note: "become edges" },
    { label: "clusters of 3 or more", value: c.tiers[tier].n_clusters,
      display: count(c.tiers[tier].n_clusters),
      note: `${count(c.tiers[tier].dropped_small)} too small` },
    { label: "true co-operator pairs", value: b.tiers[tier].true_pairs_mean,
      display: count(b.tiers[tier].true_pairs_mean), color: MARK.ok,
      note: "what is actually there" },
  ];

  const variants = [
    ["forest_raw", "Random forest, uncalibrated"],
    ["forest_sigmoid", "Forest, Platt scaled"],
    ["forest_isotonic", "Forest, isotonic"],
    ["mlp_raw", "Small neural net, uncalibrated"],
  ];
  const importance = Object.entries(m.permutation_importance)
    .sort((a, x) => x[1] - a[1]).slice(0, 12);

  return (
    <div className="pt-14">
      <PageHeader
        title="How a cluster gets scored"
        lede="Seven stages. Each one is measured on its own, so a weak stage shows up as a ceiling downstream rather than as a surprise at the end."
        meta={<TierPicker value={tier} onChange={setTier} />}
      >
        <Metadata
          className="mt-8"
          items={[
            ["Worlds", count(b.n_seeds)],
            ["Accounts each", count(n)],
            ["Edge threshold", `${dp2(c.edge_threshold_bits)} bits`],
            ["Tier shown", tier],
          ]}
        />
      </PageHeader>

      <Section
        title="One world, end to end"
        lede={`Figures are the mean over ${b.n_seeds} worlds on the ${tier} tier. Changing the tier above moves every number on this page.`}
      >
        <Rail blocking={b} clustering={c} model={m} tier={tier} />
      </Section>

      <Section
        title="Where the volume goes"
        lede="Log scale, because the numbers span 72 million down to a few thousand. The distance between the last two rows is the whole problem: the graph claims far more pairs than really share an operator."
      >
        <Funnel steps={volume} />
      </Section>

      <Section
        title="What two accounts have to share"
        lede={`A pair starts at the prior odds of sharing an operator, about one in ${count(Math.round(1 / link.data.prior_match_rate))}. Pick what a pair agrees on and the evidence adds up against the edge threshold. Every weight is measured, not chosen.`}
      >
        <Scorer params={link.data} threshold={c.edge_threshold_bits} />

        <div className="mt-14">
          <SubHead
            title="Every agreement, ranked"
            lede="Disagreement carries negative weight and is not drawn."
          />
          <BarList items={weights} format={(v) => `+${v.toFixed(2)} bits`} />
        </div>

        <div className="mt-10">
          <Metadata
            items={[
              ["m estimated from", link.data.m_source],
              ["Seed rule", link.data.seed_rule],
              ["Seed pair purity", pct(link.data.seed_purity, 2)],
              ["u sampled from", `${count(link.data.u_samples)} pairs`],
            ]}
          />
        </div>

        <Note className="mt-6">
          Real scores also carry a term frequency adjustment, so a device two
          accounts share scores higher than one three hundred accounts share. The
          calculator above shows the base weights without it.
        </Note>
      </Section>

      <Section
        title="Blocking sets the ceiling"
        lede={`A true pair no rule produces can never be recovered later. Six rules, measured over ${b.n_seeds} worlds, seeds ${b.seed_range[0]} to ${b.seed_range[1]}.`}
      >
        <BlockingFan b={b} tier={tier} />

        <div className="mt-10">
          <Table className="min-w-[720px]">
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">Tier</TH>
                <TH>Blocking recall</TH>
                <TH>Worst world</TH>
                <TH>Pairs cut</TH>
                <TH>Candidate pairs</TH>
                <TH>True pairs</TH>
              </TR>
            </THead>
            <tbody>
              {TIERS.map((t) => {
                const r = b.tiers[t];
                return (
                  <TR key={t}>
                    <TD align="left" numeric={false}><TierName tier={t} /></TD>
                    <TD>{dp4(r.blocking_recall)}</TD>
                    <TD className="text-fg-muted">{dp4(r.recall_min)}</TD>
                    <TD>{pct(r.pair_reduction_ratio, 2)}</TD>
                    <TD className="text-fg-muted">{count(r.candidate_pairs_mean)}</TD>
                    <TD className="text-fg-muted">{count(r.true_pairs_mean)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>

        <div className="mt-12">
          <SubHead
            title="Device is perfect, then worthless"
            lede="A careful operator gives every account its own phone, and its own address. The rule that survives is pin_bin."
          />
          <Table className="min-w-[640px]">
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">Rule</TH>
                {TIERS.map((t) => <TH key={t}>{t}</TH>)}
              </TR>
            </THead>
            <tbody>
              {b.rules.map((rule) => (
                <TR key={rule}>
                  <TD align="left" numeric={false} className="ident text-fg-muted">
                    {rule}
                  </TD>
                  {TIERS.map((t) => {
                    const v = b.tiers[t].recall_by_rule[rule];
                    return (
                      <TD key={t} className={v >= 0.5 ? "text-fg" : "text-fg-faint"}>
                        {dp4(v)}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </Section>

      <Section
        title="Cutting the graph into groups"
        lede={`Leiden at resolution ${c.resolution}, chosen over Louvain because it guarantees every community it returns is connected. Both were run.`}
      >
        <GraphSchematic threshold={c.edge_threshold_bits} params={link.data} />

        <div className="mt-10">
          <Table className="min-w-[760px]">
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">Tier</TH>
                <TH>Clusters</TH>
                <TH>Rings</TH>
                <TH>Fully intact</TH>
                <TH>Mean recovered</TH>
                <TH>Pair F1</TH>
                <TH>Largest</TH>
                <TH>Louvain F1</TH>
              </TR>
            </THead>
            <tbody>
              {TIERS.map((t) => {
                const r = c.tiers[t];
                return (
                  <TR key={t}>
                    <TD align="left" numeric={false}><TierName tier={t} /></TD>
                    <TD className="text-fg-muted">{count(r.n_clusters)}</TD>
                    <TD className="text-fg-muted">{r.n_rings}</TD>
                    <TD>{r.rings_fully_intact}</TD>
                    <TD>{dp4(r.mean_ring_recovered)}</TD>
                    <TD>{dp4(r.pair_f1)}</TD>
                    <TD className="text-fg-muted">{r.max_cluster_size}</TD>
                    <TD className="text-fg-muted">{dp4(r.louvain.pair_f1)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>

        <Note className="mt-6">
          Groups under {c.min_cluster_size} accounts are dropped. A pair on its own
          is not a ring.
        </Note>
      </Section>

      <Section
        title="Scoring a cluster, then pricing it"
        lede={`Fitted on seeds ${m.fit_seeds[0]}-${m.fit_seeds[1]}, calibrated on ${m.cal_seeds[0]}-${m.cal_seeds[1]}, read out on ${m.val_seeds[0]}-${m.val_seeds[1]}. Split by seed, never by row.`}
      >
        {decisions.data && (
          <DecisionFlow decisions={decisions.data} nFeatures={m.n_features} />
        )}

        <div className="mt-10">
          <Table className="min-w-[680px]">
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">Variant</TH>
                <TH>PR-AUC</TH>
                <TH>Brier</TH>
                <TH>Brier, adaptive</TH>
                <TH align="left">Shipped</TH>
              </TR>
            </THead>
            <tbody>
              {variants.map(([key, name]) => {
                const v = m.variants[key];
                const shipped = key === `forest_${m.calibration_method}`;
                return (
                  <TR key={key}>
                    <TD align="left" numeric={false} className="text-fg">{name}</TD>
                    <TD>{dp4(v.all_tiers_pooled.pr_auc)}</TD>
                    <TD>{v.all_tiers_pooled.brier.toFixed(5)}</TD>
                    <TD className="text-fg-muted">{v.adaptive.brier.toFixed(5)}</TD>
                    <TD align="left" numeric={false}>
                      {shipped ? (
                        <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
                          <Status tone="ok" /> shipped
                        </span>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>

        <div className="mt-12">
          <SubHead
            title="What the forest leans on"
            lede={`Permutation importance, top twelve of ${m.n_features}. Card reuse and rupees extracted beat the graph shape.`}
          />
          <BarList
            items={importance.map(([k, v]) => ({ label: k, value: v }))}
            format={(v) => v.toFixed(5)}
          />
        </div>

        <div className="mt-10">
          <Metadata
            items={[
              ["Purity error", m.purity_model.mae.toFixed(5)],
              ["On ring clusters", m.purity_model.mae_on_ring_clusters.toFixed(5)],
              ["Training clusters", count(m.n_train_clusters)],
              ["Held out", count(m.n_val_clusters)],
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
