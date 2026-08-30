import { useMemo, useState } from "react";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Note } from "@/components/ui/panel";
import {
  Empty, Metadata, PageHeader, Section, Skeleton, Status, SubHead, TierPicker,
} from "@/components/section";
import { BarList } from "@/components/chart";
import { PipelineVisualizer } from "@/components/pipeline/PipelineVisualizer";
import { StageDetailPanel } from "@/components/pipeline/StageDetailPanel";
import { ScaleRail } from "@/components/pipeline/ScaleRail";
import { useJson } from "@/lib/useJson";
import { buildStages, bitsFor, agreementWeights, SCORED } from "@/lib/pipelineStages";
import { TIERS, count, dp2, dp4, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIER_TONE = {
  obvious: "ok", moderate: "info", sophisticated: "warn", adaptive: "bad",
};

function TierName({ tier }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Status tone={TIER_TONE[tier]} />
      <span className="text-fg">{tier}</span>
    </span>
  );
}

/*
  Every weight here is measured. Level indices into params.levels, and every
  preset total was checked against results/link_params.json before it was
  written here.
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
        name, i, bits: bitsFor(params, field, i),
      })),
    };
  });

  const total = rows.reduce((sum, r) => sum + r.options[r.chosen].bits, 0);
  const edge = total >= threshold;
  const floor = rows.reduce((s, r) => s + r.options[r.options.length - 1].bits, 0);
  const ceiling = rows.reduce((s, r) => s + Math.max(...r.options.map((o) => o.bits)), 0);
  const at = (v) => ((v - floor) / (ceiling - floor)) * 100;

  return (
    <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div className="border-t border-line">
          {rows.map((r) => {
            const bits = r.options[r.chosen].bits;
            return (
              <div
                key={r.field}
                className="interactive grid grid-cols-[116px_minmax(0,1fr)_74px] items-center gap-4 border-b border-line px-2 py-2 hover:bg-surface"
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
                        "interactive border px-2 py-0.5 text-[11.5px]",
                        r.chosen === o.i
                          ? "border-line-loud bg-active text-fg"
                          : "border-transparent text-fg-faint hover:bg-raised hover:text-fg-muted"
                      )}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
                <span
                  className={cn("tnum text-right text-[12.5px]",
                                bits > 0 ? "text-fg" : "text-fg-faint")}
                >
                  {bits >= 0 ? "+" : ""}{bits.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="label">Try</span>
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button
              key={name}
              type="button"
              onClick={() => setLevels(preset)}
              className="interactive border-b border-line-strong pb-0.5 text-[12.5px] text-fg-muted hover:border-accent hover:text-fg"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="self-start border-t border-line-loud pt-5">
        <div className="label">Total evidence</div>
        <div
          className={cn("tnum mt-3.5 text-[38px] leading-none font-medium tracking-[-0.03em]",
                        edge ? "text-fg" : "text-fg-faint")}
        >
          {total >= 0 ? "+" : ""}{total.toFixed(2)}
          <span className="ml-2 text-[14px] font-normal text-fg-faint">bits</span>
        </div>

        <div className="relative mt-6 h-2 bg-raised">
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${Math.max(0, Math.min(100, at(total)))}%`,
              background: edge ? "var(--color-ok)" : "var(--color-fg-dim)",
            }}
          />
          <div className="absolute inset-y-[-4px] w-px bg-accent"
               style={{ left: `${at(threshold)}%` }} />
        </div>
        <div className="mt-2.5 flex justify-between text-[11.5px] text-fg-faint">
          <span className="tnum">{floor.toFixed(0)}</span>
          <span className="tnum text-fg-2">edge at {dp2(threshold)}</span>
          <span className="tnum">+{ceiling.toFixed(0)}</span>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[13px] leading-[1.6] text-fg-2">
          {edge
            ? "These two accounts get an edge. The graph will treat them as one operator."
            : "No edge. These two accounts are never compared again."}
        </p>
      </div>
    </div>
  );
}

/* Schematic, not a measured world. The bits quoted underneath are real. */
function GraphSchematic({ threshold, params }) {
  const [focus, setFocus] = useState(null);
  const device = bitsFor(params, "device", 0);
  const address = bitsFor(params, "address", 0);
  const pincode = bitsFor(params, "pincode", 0);
  const ring = [[70, 40], [130, 20], [180, 58], [140, 98], [76, 94]];
  const family = [[310, 34], [362, 72], [300, 100]];

  const dim = (g) => (focus && focus !== g ? 0.25 : 1);
  const edges = (g) =>
    g.flatMap(([x1, y1], i) =>
      g.slice(i + 1).map(([x2, y2], j) => ({ x1, y1, x2, y2, key: `${i}-${j}` })));

  return (
    <figure className="m-0 border-y border-line py-6">
      <svg viewBox="0 0 420 120" className="w-full" role="img"
           aria-label="A ring of five accounts and a family of three, drawn as graphs">
        {[["ring", ring, "var(--color-warn)"], ["family", family, "var(--color-ok)"]].map(
          ([name, nodes, colour]) => (
            <g
              key={name}
              opacity={dim(name)}
              onMouseEnter={() => setFocus(name)}
              onMouseLeave={() => setFocus(null)}
              style={{ transition: "opacity var(--motion-fast) var(--ease-out)" }}
            >
              <g stroke="var(--color-fg-faint)" strokeWidth="1" opacity="0.7">
                {edges(nodes).map((e) => (
                  <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
                ))}
              </g>
              {nodes.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="5" fill={colour} />
              ))}
            </g>
          )
        )}
        <line x1="180" y1="58" x2="300" y2="66" stroke="var(--color-line-strong)"
              strokeWidth="1" strokeDasharray="3 4" />
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
          <span aria-hidden="true"
                className="h-px w-6 border-t border-dashed border-line-strong" />
          <span className="text-fg-faint">below {dp2(threshold)} bits, so no edge is drawn</span>
        </span>
      </div>

      <figcaption className="mt-4 max-w-[80ch] text-[12.5px] leading-[1.6] text-fg-faint">
        Schematic, not a measured world. Both groups are densely linked, so the
        graph on its own cannot tell them apart. Device agreement is worth{" "}
        <span className="tnum text-fg-2">+{device.toFixed(2)}</span> bits, address{" "}
        <span className="tnum text-fg-2">+{address.toFixed(2)}</span>, pincode{" "}
        <span className="tnum text-fg-2">+{pincode.toFixed(2)}</span>. Separating a
        ring from a family is the model's job, not the graph's.
      </figcaption>
    </figure>
  );
}


export default function Pipeline() {
  const blocking = useJson("blocking");
  const link = useJson("link_params");
  const clustering = useJson("clustering");
  const model = useJson("model");
  const decisions = useJson("decisions");
  const [tier, setTier] = useState("moderate");
  const [stageIndex, setStageIndex] = useState(0);
  const [activeFeature, setActiveFeature] = useState(null);

  const loading = blocking.loading || link.loading || clustering.loading || model.loading;
  const ready = blocking.data && link.data && clustering.data && model.data;

  const stages = useMemo(() => {
    if (!ready) return [];
    return buildStages({
      blocking: blocking.data, link: link.data, clustering: clustering.data,
      model: model.data, decisions: decisions.data, tier,
    });
  }, [ready, blocking.data, link.data, clustering.data, model.data, decisions.data, tier]);

  const weights = useMemo(
    () => (link.data ? agreementWeights(link.data) : []), [link.data]
  );

  if (loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!ready) return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;

  const b = blocking.data;
  const c = clustering.data;
  const m = model.data;
  const stage = stages[stageIndex] ?? stages[0];

  const importance = Object.entries(m.permutation_importance)
    .sort((x, y) => y[1] - x[1]).slice(0, 12);
  const importanceRank = Object.fromEntries(importance.map(([k], i) => [k, i + 1]));

  const variants = [
    ["forest_raw", "Random forest, uncalibrated"],
    ["forest_sigmoid", "Forest, Platt scaled"],
    ["forest_isotonic", "Forest, isotonic"],
    ["mlp_raw", "Small neural net, uncalibrated"],
  ];

  return (
    <div className="pt-14">
      <PageHeader
        title="How a cluster gets scored"
        lede="Seven stages, each measured on its own. The figures at every stage come from the same result files as the rest of the site."
        meta={<TierPicker value={tier} onChange={setTier} />}
      >
        <Metadata
          className="mt-8"
          items={[
            ["Worlds", count(b.n_seeds)],
            ["Accounts each", count(b.n_accounts_per_world)],
            ["Edge threshold", `${dp2(c.edge_threshold_bits)} bits`],
            ["Tier shown", tier],
          ]}
        />
      </PageHeader>

      <Section
        title="Run the pipeline"
        lede="It runs on its own, a stage at a time. Select a stage to sit on it, and the panel below shows what enters it, what it does, and what it hands on."
      >
        <PipelineVisualizer
          stages={stages}
          tier={tier}
          index={stageIndex}
          onIndex={setStageIndex}
        />
        <div className="mt-10">
          <StageDetailPanel stage={stage} index={stageIndex} total={stages.length} />
        </div>
      </Section>

      <Section
        title="Where the volume goes"
        lede="The point of the whole pipeline: an enormous search space becomes a small number of decisions. Log scale, and the row for the stage on screen is brought forward."
      >
        <ScaleRail
          stages={stages}
          activeId={stage.id}
          onSelect={(id) => setStageIndex(Math.max(0, stages.findIndex((s) => s.id === id)))}
        />
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
          <BarList
            items={weights.map((w) => ({
              label: `${w.field} · ${w.level}`, value: w.bits,
            }))}
            format={(v) => `+${v.toFixed(2)} bits`}
          />
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
                <TR key={t} selected={t === tier}>
                  <TD align="left" numeric={false}><TierName tier={t} /></TD>
                  <TD strong>{dp4(r.blocking_recall)}</TD>
                  <TD className="text-fg-muted">{dp4(r.recall_min)}</TD>
                  <TD>{pct(r.pair_reduction_ratio, 2)}</TD>
                  <TD className="text-fg-muted">{count(r.candidate_pairs_mean)}</TD>
                  <TD className="text-fg-muted">{count(r.true_pairs_mean)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>

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
                      <TD key={t} className={v >= 0.5 ? "text-fg" : "text-fg-dim"}>
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
                  <TR key={t} selected={t === tier}>
                    <TD align="left" numeric={false}><TierName tier={t} /></TD>
                    <TD className="text-fg-muted">{count(r.n_clusters)}</TD>
                    <TD className="text-fg-muted">{r.n_rings}</TD>
                    <TD>{r.rings_fully_intact}</TD>
                    <TD strong>{dp4(r.mean_ring_recovered)}</TD>
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
                <TR key={key} selected={shipped}>
                  <TD align="left" numeric={false} className="text-fg">{name}</TD>
                  <TD>{dp4(v.all_tiers_pooled.pr_auc)}</TD>
                  <TD strong={shipped}>{v.all_tiers_pooled.brier.toFixed(5)}</TD>
                  <TD className="text-fg-muted">{v.adaptive.brier.toFixed(5)}</TD>
                  <TD align="left" numeric={false}>
                    {shipped ? (
                      <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-2">
                        <Status tone="ok" /> shipped
                      </span>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>

        <div className="mt-12">
          <SubHead
            title="What the forest leans on"
            lede={`Permutation importance, top twelve of ${m.n_features}. Hover a feature for its rank and what it measures.`}
          />
          <BarList
            items={importance.map(([k, v]) => ({ label: k, value: v }))}
            format={(v) => v.toFixed(5)}
            onHover={setActiveFeature}
            active={activeFeature}
            describe
          />
          <p className="mt-4 min-h-[40px] max-w-[76ch] text-[12.5px] leading-[1.6] text-fg-faint">
            {activeFeature ? (
              <>
                <span className="ident text-fg-2">{activeFeature}</span>
                {" ranks "}
                <span className="tnum text-fg-2">{importanceRank[activeFeature]}</span>
                {" of "}
                <span className="tnum text-fg-2">{m.n_features}</span>
                {". Shuffling that one column costs "}
                <span className="tnum text-fg-2">
                  {m.permutation_importance[activeFeature].toFixed(5)}
                </span>
                {" of score, which is how much the forest was leaning on it."}
              </>
            ) : (
              "Permutation importance is the drop in score when one column is shuffled and everything else is left alone."
            )}
          </p>
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
