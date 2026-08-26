import { useMemo, useState } from "react";
import {
  Users, Funnel as FunnelIcon, Scale3d, Network, Table2, Cpu, Gavel,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Empty, PageHead, SectionHead, Skeleton, TierDot, TierName } from "@/components/bits";
import { BarList } from "@/components/chart";
import { Arrow, Box, Connector, Funnel, Stage } from "@/components/flow";
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

const bits = (params, field, level) =>
  Math.log2(params.m[field][level] / params.u[field][level]);

/* ---------------------------------------------------------------- the rail */

function Rail({ blocking, clustering, link, model, tier }) {
  const b = blocking.tiers[tier];
  const c = clustering.tiers[tier];
  const possible = (blocking.n_accounts_per_world *
                    (blocking.n_accounts_per_world - 1)) / 2;

  const stages = [
    [Users, "Accounts", "one merchant's population",
     count(blocking.n_accounts_per_world), "accounts in", MARK.blue],
    [FunnelIcon, "Block", "which pairs are worth comparing",
     count(b.candidate_pairs_mean), `of ${(possible / 1e6).toFixed(1)}M pairs`, MARK.blue],
    [Scale3d, "Link", "evidence for each pair, in bits",
     `${SCORED.length}`, "comparisons per pair", MARK.amber],
    [Network, "Cluster", "cut the graph into groups",
     count(c.edges), `edges above ${dp2(clustering.edge_threshold_bits)} bits`, MARK.amber],
    [Table2, "Features", "turn a group into numbers",
     `${model.n_features}`, `per cluster, ${count(c.n_clusters)} clusters`, MARK.green],
    [Cpu, "Score", "a calibrated probability",
     model.brier_isotonic.toFixed(5), "Brier, pooled", MARK.green],
    [Gavel, "Decide", "price the three actions",
     "3", "block, review, allow", MARK.green],
  ];

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[980px] items-stretch">
        {stages.map(([Icon, name, what, figure, unit, tone], i) => (
          <div key={name} className="flex flex-1 basis-0 items-stretch">
            <Stage index={i + 1} icon={Icon} name={name} what={what}
                   figure={figure} unit={unit} tone={tone} delay={i * 55} />
            {i < stages.length - 1 && <Connector />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TierPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border-subtle bg-card p-0.5">
      {TIERS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            "inline-flex h-7 items-center gap-2 rounded-[5px] px-2.5 text-[12.5px] transition-colors",
            value === t ? "bg-elevated text-foreground"
                        : "text-muted-foreground hover:text-foreground"
          )}
        >
          <TierDot tier={t} />
          {t}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- the funnel */

function Volume({ blocking, clustering, tier }) {
  const b = blocking.tiers[tier];
  const c = clustering.tiers[tier];
  const n = blocking.n_accounts_per_world;
  const possible = (n * (n - 1)) / 2;

  const steps = [
    { label: "pairs in one world", value: possible,
      display: count(possible), color: MARK.red,
      note: `${count(n)} accounts` },
    { label: "survive blocking", value: b.candidate_pairs_mean,
      display: count(b.candidate_pairs_mean), color: MARK.amber,
      note: `${pct(b.pair_reduction_ratio, 2)} cut` },
    { label: `score above ${dp2(clustering.edge_threshold_bits)} bits`, value: c.edges,
      display: count(c.edges), color: MARK.blue,
      note: "become edges" },
    { label: "clusters of 3 or more", value: c.n_clusters,
      display: count(c.n_clusters), color: MARK.green,
      note: `${count(c.dropped_small)} too small` },
    { label: "true co-operator pairs", value: b.true_pairs_mean,
      display: count(b.true_pairs_mean), color: MARK.green,
      note: "what is actually there" },
  ];
  return <Funnel steps={steps} />;
}

/* ------------------------------------------------------------- the scorer */

/*
  Every weight here is measured. The reader picks what a pair agrees on and
  watches the total move, which is the only way the "six weak signals beat one
  device match" claim becomes obvious rather than asserted.
*/
const PRESETS = {
  // Level indices into params.levels. Every total below was checked against
  // results/link_params.json before it was written here.
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

const DEFAULT_PRESET = PRESETS["a ring, same phone"];

function Scorer({ params, threshold }) {
  const [levels, setLevels] = useState(DEFAULT_PRESET);

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
  // The plot runs from a pair that agrees on nothing to one that agrees on all.
  const floor = rows.reduce((s, r) => s + r.options[r.options.length - 1].bits, 0);
  const ceiling = rows.reduce((s, r) => s + Math.max(...r.options.map((o) => o.bits)), 0);
  const at = (v) => ((v - floor) / (ceiling - floor)) * 100;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.field} className="grid grid-cols-[110px_minmax(0,1fr)_74px] items-center gap-3">
            <span className="num truncate text-[12px] text-muted-foreground">{r.field}</span>
            <div className="flex flex-wrap gap-1">
              {r.options.map((o) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => setLevels((s) => ({ ...s, [r.field]: o.i }))}
                  className={cn(
                    "rounded-[5px] border px-2 py-0.5 text-[11.5px] transition-colors",
                    r.chosen === o.i
                      ? "border-transparent bg-elevated text-foreground"
                      : "border-border-subtle text-subtle hover:text-muted-foreground"
                  )}
                >
                  {o.name}
                </button>
              ))}
            </div>
            <span
              className="num text-right text-[12px]"
              style={{ color: r.options[r.chosen].bits > 0 ? MARK.green : "var(--color-subtle)" }}
            >
              {r.options[r.chosen].bits >= 0 ? "+" : ""}
              {r.options[r.chosen].bits.toFixed(2)}
            </span>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <span className="text-[12px] text-subtle">try</span>
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button
              key={name}
              type="button"
              onClick={() => setLevels(preset)}
              className="rounded-md border border-border-subtle bg-card px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="panel self-start p-4">
        <div className="label">Total evidence</div>
        <div
          className="num mt-2 text-[30px] leading-none font-semibold"
          style={{ color: edge ? MARK.green : "var(--color-subtle)" }}
        >
          {total >= 0 ? "+" : ""}{total.toFixed(2)}
          <span className="ml-1.5 text-[14px] font-normal text-subtle">bits</span>
        </div>

        <div className="relative mt-5 h-2.5 rounded-full bg-elevated">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${Math.max(0, Math.min(100, at(total)))}%`,
              background: edge ? MARK.green : MARK.red,
            }}
          />
          <div
            className="absolute inset-y-[-5px] w-px bg-caution"
            style={{ left: `${at(threshold)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-subtle">
          <span className="num">{floor.toFixed(0)}</span>
          <span className="num text-caution">
            edge at {dp2(threshold)}
          </span>
          <span className="num">+{ceiling.toFixed(0)}</span>
        </div>

        <p className="mt-4 border-t border-border-subtle pt-3 text-[12px] leading-relaxed text-muted-foreground">
          {edge
            ? "These two accounts get an edge. The graph will consider them the same operator."
            : "No edge. These two accounts are never compared again."}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the schematics */

function BlockingSchematic({ b, tier }) {
  const rules = b.rules;
  const top = 14;
  const step = 30;
  const height = top + rules.length * step + 10;
  const mid = height / 2;
  const rowY = (i) => top + i * step + 11;

  return (
    <figure className="m-0 overflow-x-auto rounded-md border border-border-subtle bg-background/40 p-4">
      <svg viewBox={`0 0 704 ${height}`} className="w-full min-w-[560px]" role="img"
           aria-label="Six blocking rules fan out from every pair and merge back into one candidate set">
        {/* fan out, then fan back in */}
        <g fill="none" strokeWidth="1.2">
          {rules.map((_, i) => (
            <g key={i}>
              <path d={`M112 ${mid} C 160 ${mid}, 160 ${rowY(i)}, 208 ${rowY(i)}`}
                    stroke="var(--color-border)" />
              <path d={`M112 ${mid} C 160 ${mid}, 160 ${rowY(i)}, 208 ${rowY(i)}`}
                    stroke="var(--color-mark-2)" className="flow-line" strokeLinecap="round" />
              <path d={`M392 ${rowY(i)} C 440 ${rowY(i)}, 440 ${mid}, 488 ${mid}`}
                    stroke="var(--color-border)" />
              <path d={`M392 ${rowY(i)} C 440 ${rowY(i)}, 440 ${mid}, 488 ${mid}`}
                    stroke="var(--color-mark-2)" className="flow-line" strokeLinecap="round" />
            </g>
          ))}
          <path d={`M572 ${mid} H 610`} stroke="var(--color-border)" />
          <path d={`M572 ${mid} H 610`} stroke="var(--color-mark-2)"
                className="flow-line" strokeLinecap="round" />
        </g>

        <g>
          <rect x="12" y={mid - 16} width="100" height="32" rx="6"
                fill="var(--color-card)" stroke="var(--color-border)" />
          <text x="62" y={mid + 4} textAnchor="middle" fontSize="11"
                fontFamily="var(--font-mono)" fill="var(--color-muted-foreground)">
            every pair
          </text>
        </g>

        {rules.map((rule, i) => {
          const recall = b.tiers[tier].recall_by_rule[rule];
          const strong = recall >= 0.5;
          return (
            <g key={rule}>
              <rect x="208" y={rowY(i) - 11} width="184" height="22" rx="5"
                    fill="var(--color-card)"
                    stroke={strong ? "color-mix(in oklch, var(--color-mark-1) 50%, transparent)"
                                   : "var(--color-border-subtle)"} />
              <text x="218" y={rowY(i) + 4} fontSize="10.5"
                    fontFamily="var(--font-mono)" fill="var(--color-muted-foreground)">
                {rule}
              </text>
              <text x="384" y={rowY(i) + 4} textAnchor="end" fontSize="10.5"
                    fontFamily="var(--font-mono)"
                    fill={strong ? "var(--color-positive)" : "var(--color-subtle)"}>
                {recall.toFixed(4)}
              </text>
            </g>
          );
        })}

        <g>
          <rect x="488" y={mid - 16} width="84" height="32" rx="6"
                fill="color-mix(in oklch, var(--color-mark-2) 10%, transparent)"
                stroke="color-mix(in oklch, var(--color-mark-2) 45%, transparent)" />
          <text x="530" y={mid + 4} textAnchor="middle" fontSize="11"
                fontFamily="var(--font-mono)" fill="var(--color-muted-foreground)">
            dedupe
          </text>
        </g>

        <g>
          <text x="614" y={mid - 2} fontSize="11" fontFamily="var(--font-mono)"
                fill="var(--color-foreground)">
            {count(b.tiers[tier].candidate_pairs_mean)}
          </text>
          <text x="614" y={mid + 11} fontSize="9.5" fontFamily="var(--font-sans)"
                fill="var(--color-subtle)">
            candidates
          </text>
        </g>
      </svg>
      <figcaption className="mt-3 text-[12px] leading-relaxed text-subtle">
        Recall each rule reaches on its own, on the {tier} tier. A pair only has
        to survive one of them. Green is a rule still worth more than half the
        true pairs at this tier.
      </figcaption>
    </figure>
  );
}

/*
  Schematic, not a measured world. Text lives in HTML rather than in the SVG,
  because SVG text scales with the viewBox and ends up enormous.
*/
function GraphSchematic({ threshold, params }) {
  const device = bits(params, "device", 0);
  const address = bits(params, "address", 0);
  const pincode = bits(params, "pincode", 0);
  const ring = [[70, 40], [130, 20], [180, 58], [140, 98], [76, 94]];
  const family = [[310, 34], [362, 72], [300, 100]];

  return (
    <figure className="m-0 rounded-md border border-border-subtle bg-background/40 p-4">
      <svg viewBox="0 0 420 120" className="w-full" role="img"
           aria-label="A ring of five accounts and a family of three, drawn as graphs">
        <g stroke={MARK.amber} strokeWidth="1.3" opacity="0.8">
          {ring.map(([x1, y1], i) =>
            ring.slice(i + 1).map(([x2, y2], j) => (
              <line key={`r${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            )))}
        </g>
        <g stroke={MARK.green} strokeWidth="1.3" opacity="0.8">
          {family.map(([x1, y1], i) =>
            family.slice(i + 1).map(([x2, y2], j) => (
              <line key={`f${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            )))}
        </g>
        {/* The edge that is never drawn, and the reason the two stay apart. */}
        <line x1="180" y1="58" x2="300" y2="66" stroke="var(--color-subtle)"
              strokeWidth="1.1" strokeDasharray="4 5" opacity="0.55" />
        {ring.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5.5" fill={MARK.amber} />
        ))}
        {family.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5.5" fill={MARK.green} />
        ))}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border-subtle pt-3 text-[12px]">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: MARK.amber }} />
          <span className="text-muted-foreground">one operator, 5 accounts</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: MARK.green }} />
          <span className="text-muted-foreground">a family, 3 accounts</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-6 border-t border-dashed border-subtle" />
          <span className="text-subtle">
            below {dp2(threshold)} bits, so no edge is drawn
          </span>
        </span>
      </div>

      <figcaption className="mt-3 text-[12px] leading-relaxed text-subtle">
        Schematic, not a measured world. Both groups are densely linked, so the
        graph on its own cannot tell them apart. Device agreement is worth{" "}
        <span className="num text-muted-foreground">+{device.toFixed(2)}</span>{" "}
        bits, address{" "}
        <span className="num text-muted-foreground">+{address.toFixed(2)}</span>,
        pincode{" "}
        <span className="num text-muted-foreground">+{pincode.toFixed(2)}</span>.
        Separating a ring from a family is the model's job, not the graph's.
      </figcaption>
    </figure>
  );
}

function DecisionSchematic({ decisions }) {
  const costs = [
    ["block", decisions.cost_blocked_innocent, "per innocent account stopped", MARK.red],
    ["review", decisions.cost_analyst_review, "per cluster a human reads", MARK.amber],
    ["allow", decisions.cost_missed_abuser, "per ring account let through", MARK.green],
  ];
  return (
    <div className="rounded-md border border-border-subtle bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Box className="border-border-subtle bg-card">
          <span className="num">24 features</span>
        </Box>
        <Arrow />
        <Box className="border-border-subtle bg-card">
          <div className="num">forest</div>
          <div className="mt-0.5 text-[10.5px] text-subtle">probability, purity</div>
        </Box>
        <Arrow />
        <Box tone={MARK.amber}>
          <div className="num">expected cost</div>
          <div className="mt-0.5 text-[10.5px] text-subtle">of each action</div>
        </Box>
        <Arrow />
        <Box tone={MARK.green}>
          <span className="num">cheapest wins</span>
        </Box>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {costs.map(([name, value, what, colour]) => (
          <div key={name} className="rounded-md border border-border-subtle bg-card px-3 py-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px]" style={{ color: colour }}>{name}</span>
              <span className="num text-[13px] text-foreground">{rupees(value)}</span>
            </div>
            <div className="mt-1 text-[11px] text-subtle">{what}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

function Blocking({ b, tier }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocking sets the ceiling</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-4 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          A true pair no rule produces can never be recovered later. Six rules,
          measured over {b.n_seeds} worlds, seeds {b.seed_range[0]} to{" "}
          {b.seed_range[1]}.
        </p>
        <BlockingSchematic b={b} tier={tier} />
      </CardContent>

      <div className="border-t border-border-subtle">
        <Table>
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
                  <TD align="left" mono={false}><TierName tier={t} /></TD>
                  <TD>{dp4(r.blocking_recall)}</TD>
                  <TD className="text-muted-foreground">{dp4(r.recall_min)}</TD>
                  <TD>{pct(r.pair_reduction_ratio, 2)}</TD>
                  <TD className="text-muted-foreground">{count(r.candidate_pairs_mean)}</TD>
                  <TD className="text-muted-foreground">{count(r.true_pairs_mean)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>

      <CardContent className="border-t border-border-subtle pt-5">
        <h4 className="text-[13px] font-semibold text-foreground">
          Device is perfect, then worthless
        </h4>
        <p className="mt-1.5 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          A careful operator gives every account its own phone, and its own
          address. The rule that survives is pin_bin.
        </p>
        <div className="mt-4">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">Rule</TH>
                {TIERS.map((t) => <TH key={t}>{t}</TH>)}
              </TR>
            </THead>
            <tbody>
              {b.rules.map((rule) => (
                <TR key={rule}>
                  <TD align="left">{rule}</TD>
                  {TIERS.map((t) => {
                    const v = b.tiers[t].recall_by_rule[rule];
                    return (
                      <TD key={t} style={{ color: v >= 0.5 ? undefined : "var(--color-subtle)" }}>
                        {dp4(v)}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Clustering({ c, params }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cutting the graph into groups</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-4 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          Leiden at resolution {c.resolution}, chosen over Louvain because it
          guarantees every community it returns is connected. Both were run.
        </p>
        <GraphSchematic threshold={c.edge_threshold_bits} params={params} />
      </CardContent>

      <div className="border-t border-border-subtle">
        <Table>
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
                  <TD align="left" mono={false}><TierName tier={t} /></TD>
                  <TD className="text-muted-foreground">{count(r.n_clusters)}</TD>
                  <TD className="text-muted-foreground">{r.n_rings}</TD>
                  <TD>{r.rings_fully_intact}</TD>
                  <TD>{dp4(r.mean_ring_recovered)}</TD>
                  <TD>{dp4(r.pair_f1)}</TD>
                  <TD className="text-muted-foreground">{r.max_cluster_size}</TD>
                  <TD className="text-muted-foreground">{dp4(r.louvain.pair_f1)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>

      <div className="border-t border-border-subtle px-5 py-3.5 text-[12px] text-subtle">
        Groups under {c.min_cluster_size} accounts are dropped. A pair on its own
        is not a ring.
      </div>
    </Card>
  );
}

function Model({ m, decisions }) {
  const variants = [
    ["forest_raw", "Random forest, uncalibrated"],
    ["forest_sigmoid", "Forest, Platt scaled"],
    ["forest_isotonic", "Forest, isotonic"],
    ["mlp_raw", "Small neural net, uncalibrated"],
  ];
  const importance = Object.entries(m.permutation_importance)
    .sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring a cluster, then pricing it</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-4 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          Fitted on seeds {m.fit_seeds[0]}-{m.fit_seeds[1]}, calibrated on{" "}
          {m.cal_seeds[0]}-{m.cal_seeds[1]}, read out on {m.val_seeds[0]}-
          {m.val_seeds[1]}. Split by seed, never by row.
        </p>
        {decisions && <DecisionSchematic decisions={decisions} />}
      </CardContent>

      <div className="border-t border-border-subtle">
        <Table>
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
                  <TD align="left" mono={false} className="text-foreground">{name}</TD>
                  <TD>{dp4(v.all_tiers_pooled.pr_auc)}</TD>
                  <TD>{v.all_tiers_pooled.brier.toFixed(5)}</TD>
                  <TD className="text-muted-foreground">{v.adaptive.brier.toFixed(5)}</TD>
                  <TD align="left" mono={false}>
                    {shipped ? <Badge tone="positive">shipped</Badge> : null}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>

      <CardContent className="border-t border-border-subtle pt-5">
        <h4 className="text-[13px] font-semibold text-foreground">
          What the forest leans on
        </h4>
        <p className="mt-1.5 mb-4 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          Permutation importance, top twelve of {m.n_features}. Card reuse and
          rupees extracted beat the graph shape.
        </p>
        <BarList
          items={importance.map(([k, v]) => ({ label: k, value: v }))}
          format={(v) => v.toFixed(5)}
          color={MARK.green}
        />
      </CardContent>

      <div className="grid border-t border-border-subtle sm:grid-cols-3">
        {[
          ["Purity error", m.purity_model.mae.toFixed(5), "mean absolute, all clusters"],
          ["On ring clusters", m.purity_model.mae_on_ring_clusters.toFixed(5), "where it matters"],
          ["Training clusters", count(m.n_train_clusters), `${count(m.n_val_clusters)} held out`],
        ].map(([k, v, sub]) => (
          <div key={k} className="border-b border-border-subtle px-5 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
            <div className="label">{k}</div>
            <div className="num mt-1.5 text-[17px] text-foreground">{v}</div>
            <div className="mt-1 text-[11.5px] text-subtle">{sub}</div>
          </div>
        ))}
      </div>
    </Card>
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

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!ready) return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;

  return (
    <div className="space-y-10">
      <PageHead
        title="How a cluster gets scored"
        lede="Seven stages. Each one is measured on its own, so a weak stage shows up as a ceiling downstream rather than as a surprise at the end."
        right={<TierPicker value={tier} onChange={setTier} />}
      />

      <section>
        <SectionHead title="One world, end to end">
          Figures are the mean over {blocking.data.n_seeds} worlds on the{" "}
          {tier} tier. Change the tier above and the whole page follows.
        </SectionHead>
        <Rail blocking={blocking.data} clustering={clustering.data}
              link={link.data} model={model.data} tier={tier} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Where the volume goes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-5 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
            Log scale, because the numbers span 72 million down to a few
            thousand. The gap between the last two bars is the whole problem:
            the graph claims far more pairs than really share an operator.
          </p>
          <Volume blocking={blocking.data} clustering={clustering.data} tier={tier} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What two accounts have to share</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-5 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
            Pick what a pair agrees on and watch the evidence add up. A pair
            starts at the prior odds of sharing an operator, about one in{" "}
            {count(Math.round(1 / link.data.prior_match_rate))}. Every weight
            below is measured, not chosen.
          </p>
          <Scorer params={link.data} threshold={clustering.data.edge_threshold_bits} />
        </CardContent>

        <CardContent className="border-t border-border-subtle pt-5">
          <h4 className="text-[13px] font-semibold text-foreground">
            Every agreement, ranked
          </h4>
          <p className="mt-1.5 mb-4 text-[13px] text-muted-foreground">
            Disagreement carries negative weight and is not drawn.
          </p>
          <BarList items={weights} format={(v) => `+${v.toFixed(2)} bits`}
                   color={MARK.blue} />
        </CardContent>

        <div className="grid border-t border-border-subtle sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["m estimated from", link.data.m_source],
            ["Seed rule", link.data.seed_rule],
            ["Seed pair purity", pct(link.data.seed_purity, 2)],
            ["u sampled from", `${count(link.data.u_samples)} pairs`],
          ].map(([k, v]) => (
            <div key={k} className="border-b border-border-subtle px-5 py-3.5 last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0">
              <div className="label">{k}</div>
              <div className="num mt-1 text-[12.5px] text-foreground">{v}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-border-subtle px-5 py-3.5 text-[12px] leading-relaxed text-subtle">
          Real scores also carry a term frequency adjustment, so a device two
          accounts share scores higher than one three hundred accounts share.
          The calculator above shows the base weights without it.
        </div>
      </Card>

      <Blocking b={blocking.data} tier={tier} />
      <Clustering c={clustering.data} params={link.data} />
      <Model m={model.data} decisions={decisions.data} />
    </div>
  );
}
