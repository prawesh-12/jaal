import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Empty, PageHead, Skeleton, TierName } from "@/components/bits";
import { BarList } from "@/components/chart";
import { useJson } from "@/lib/useJson";
import { MARK, TIERS, count, dp2, dp4, pct } from "@/lib/format";

/*
  A match weight is log2(m / u): how much more often a pair of accounts run by
  the same person agrees on a field than a pair of strangers does. Same formula
  the pipeline uses, applied to the m and u it estimated and wrote out.
*/
function matchWeights(params) {
  const rows = [];
  for (const field of Object.keys(params.levels)) {
    params.levels[field].forEach((level, i) => {
      const bits = Math.log2(params.m[field][i] / params.u[field][i]);
      if (level !== "no" && bits > 0) rows.push({ field, level, bits });
    });
  }
  return rows.sort((a, b) => b.bits - a.bits);
}

function Stages({ blocking, link, clustering, model }) {
  const stages = [
    ["Generate", "one synthetic world", `${count(blocking.n_accounts_per_world)} accounts`],
    ["Block", "cut the pairs to compare", `${blocking.rules.length} rules`],
    ["Link", "score each surviving pair", `${Object.keys(link.levels).length} fields`],
    ["Cluster", "cut the graph into groups", `above ${dp2(clustering.edge_threshold_bits)} bits`],
    ["Features", "turn a group into numbers", `${model.n_features} features`],
    ["Score", "a calibrated probability", `Brier ${model.brier_isotonic}`],
    ["Decide", "attach a rupee cost", "3 actions"],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {stages.map(([name, what, figure], i) => (
        <div key={name} className="panel flex flex-col px-3.5 py-3">
          <div className="num text-[11px] text-subtle">{i + 1}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-foreground">{name}</div>
          <div className="mt-1 flex-1 text-[11.5px] leading-snug text-subtle">{what}</div>
          <div className="num mt-2.5 border-t border-border-subtle pt-2 text-[12px] text-muted-foreground">
            {figure}
          </div>
        </div>
      ))}
    </div>
  );
}

function Blocking({ b }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocking, and the ceiling it sets</CardTitle>
        <CardDescription>
          Twelve thousand accounts is 72 million possible pairs. Six rules decide which
          ones are worth scoring at all. Any true pair the rules miss can never be
          recovered later, so blocking recall is a hard ceiling on everything
          downstream. Measured over {b.n_seeds} worlds, seeds {b.seed_range[0]} to{" "}
          {b.seed_range[1]}.
        </CardDescription>
      </CardHeader>

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
              <TH>Blocks skipped</TH>
            </TR>
          </THead>
          <tbody>
            {TIERS.map((t) => {
              const r = b.tiers[t];
              return (
                <TR key={t}>
                  <TD align="left" mono={false}>
                    <TierName tier={t} />
                  </TD>
                  <TD>{dp4(r.blocking_recall)}</TD>
                  <TD className="text-muted-foreground">{dp4(r.recall_min)}</TD>
                  <TD>{pct(r.pair_reduction_ratio, 2)}</TD>
                  <TD className="text-muted-foreground">{count(r.candidate_pairs_mean)}</TD>
                  <TD className="text-muted-foreground">{count(r.true_pairs_mean)}</TD>
                  <TD className="text-muted-foreground">{r.blocks_skipped_mean}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>

      <CardContent className="border-t border-border-subtle pt-5">
        <h4 className="text-[13px] font-semibold text-foreground">
          What each rule catches on its own
        </h4>
        <p className="mt-1.5 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          Device is perfect on the obvious tier and worth nothing on the adaptive one,
          because a careful operator gives every account its own phone. Address goes the
          same way. The only rule that holds up is pin_bin, which pairs a delivery
          pincode with a card BIN, and it is what keeps the ceiling high at the top tier.
        </p>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH align="left">Rule</TH>
                {TIERS.map((t) => (
                  <TH key={t}>{t}</TH>
                ))}
              </TR>
            </THead>
            <tbody>
              {b.rules.map((rule) => (
                <TR key={rule}>
                  <TD align="left">{rule}</TD>
                  {TIERS.map((t) => (
                    <TD key={t} className="text-muted-foreground">
                      {dp4(b.tiers[t].recall_by_rule[rule])}
                    </TD>
                  ))}
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </CardContent>

      <div className="border-t border-border-subtle px-5 py-3.5 text-[12px] text-subtle">
        A single blocking key matching thousands of accounts would generate millions of
        pairs on its own, so any block above {count(b.max_block_size)} members is
        skipped and counted.
      </div>
    </Card>
  );
}

function Linking({ link }) {
  const weights = matchWeights(link);
  return (
    <Card>
      <CardHeader>
        <CardTitle>What each agreement is worth, in bits</CardTitle>
        <CardDescription>
          A pair of accounts starts at the prior odds of being the same person, which is
          about one in {count(Math.round(1 / link.prior_match_rate))}. Every field the
          pair agrees on adds evidence, measured as log2 of how much more often a real
          match agrees than a stranger pair does. Two accounts on the same device start{" "}
          {dp2(weights[0].bits)} bits ahead of two strangers.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <BarList
          items={weights.map((w) => ({
            label: `${w.field} · ${w.level}`,
            value: w.bits,
          }))}
          format={(v) => `+${v.toFixed(2)} bits`}
          color={MARK.blue}
        />
        <p className="mt-4 text-[12px] leading-relaxed text-subtle">
          Disagreement carries negative weight and is not drawn here. Two accounts that
          share nothing end up well below zero, which is what stops the graph filling
          in with edges between strangers.
        </p>
      </CardContent>

      <div className="grid border-t border-border-subtle sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["m estimated from", link.m_source],
          ["Seed rule", link.seed_rule],
          ["Seed pair purity", pct(link.seed_purity, 2)],
          ["u sampled from", `${count(link.u_samples)} pairs`],
        ].map(([k, v]) => (
          <div
            key={k}
            className="border-b border-border-subtle px-5 py-3.5 last:border-b-0 sm:[&:nth-child(-n+2)]:border-b sm:[&:nth-child(n+3)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <div className="label">{k}</div>
            <div className="num mt-1 text-[12.5px] text-foreground">{v}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border-subtle px-5 py-3.5 text-[12px] leading-relaxed text-subtle">
        Expectation maximisation was tried as an alternative to the bootstrap and lost.
        It ran {link.em.iterations} iterations over {count(link.em.candidate_pairs)}{" "}
        candidate pairs from {link.em.worlds} worlds, and the m values it produced are
        kept in the results file so the negative result is on record.
      </div>
    </Card>
  );
}

function Clustering({ c }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cutting the graph into groups</CardTitle>
        <CardDescription>
          Edges above {dp2(c.edge_threshold_bits)} bits become a graph, and Leiden cuts
          it into communities at resolution {c.resolution}. Leiden is used over Louvain
          because it guarantees every community it returns is connected. Both were run;
          the comparison is in the last column.
        </CardDescription>
      </CardHeader>

      <div className="border-t border-border-subtle">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH align="left">Tier</TH>
              <TH>Clusters</TH>
              <TH>Rings</TH>
              <TH>Fully intact</TH>
              <TH>Mean ring recovered</TH>
              <TH>Pair F1</TH>
              <TH>Largest cluster</TH>
              <TH>Louvain pair F1</TH>
            </TR>
          </THead>
          <tbody>
            {TIERS.map((t) => {
              const r = c.tiers[t];
              return (
                <TR key={t}>
                  <TD align="left" mono={false}>
                    <TierName tier={t} />
                  </TD>
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

      <div className="border-t border-border-subtle px-5 py-3.5 text-[12px] leading-relaxed text-subtle">
        Clusters below {c.min_cluster_size} accounts are dropped, because a pair on its
        own is not a ring. Everything here is measured over {c.n_seeds} worlds, seeds{" "}
        {c.seed_range[0]} to {c.seed_range[1]}.
      </div>
    </Card>
  );
}

function Model({ m }) {
  const variants = [
    ["forest_raw", "Random forest, uncalibrated"],
    ["forest_sigmoid", "Forest, Platt scaled"],
    ["forest_isotonic", "Forest, isotonic"],
    ["mlp_raw", "Small neural net, uncalibrated"],
  ];
  const importance = Object.entries(m.permutation_importance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring a cluster</CardTitle>
        <CardDescription>
          A random forest over {m.n_features} cluster features, fitted on seeds{" "}
          {m.fit_seeds[0]} to {m.fit_seeds[1]}, calibrated on seeds {m.cal_seeds[0]} to{" "}
          {m.cal_seeds[1]}, and read out on seeds {m.val_seeds[0]} to {m.val_seeds[1]}.
          The split is by seed, never by row, because clusters from one generated world
          share artefacts and a random row split would leak them.
        </CardDescription>
      </CardHeader>

      <div className="border-t border-border-subtle">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH align="left">Variant</TH>
              <TH>PR-AUC, pooled</TH>
              <TH>Brier, pooled</TH>
              <TH>Brier, adaptive tier</TH>
              <TH align="left">Shipped</TH>
            </TR>
          </THead>
          <tbody>
            {variants.map(([key, name]) => {
              const v = m.variants[key];
              const shipped = key === `forest_${m.calibration_method}`;
              return (
                <TR key={key}>
                  <TD align="left" mono={false} className="text-foreground">
                    {name}
                  </TD>
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
          Which features the forest actually uses
        </h4>
        <p className="mt-1.5 max-w-[76ch] text-[13px] leading-[1.6] text-muted-foreground">
          Permutation importance, the drop in score when one column is shuffled. The top
          twelve of {m.n_features}. Card reuse and the total discount extracted carry
          more than the graph shape does, which is not what you would guess before
          measuring it.
        </p>
        <div className="mt-4">
          <BarList
            items={importance.map(([k, v]) => ({ label: k, value: v }))}
            format={(v) => v.toFixed(5)}
            color={MARK.green}
          />
        </div>
      </CardContent>

      <div className="grid border-t border-border-subtle sm:grid-cols-3">
        {[
          ["Purity model error", m.purity_model.mae.toFixed(5), "mean absolute, all clusters"],
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

export default function Pipeline() {
  const blocking = useJson("blocking");
  const link = useJson("link_params");
  const clustering = useJson("clustering");
  const model = useJson("model");

  const loading =
    blocking.loading || link.loading || clustering.loading || model.loading;
  const ready = blocking.data && link.data && clustering.data && model.data;

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!ready) return <Empty>Pipeline results are missing. Run ./run.sh.</Empty>;

  return (
    <div className="space-y-10">
      <PageHead
        title="How a cluster gets scored"
        lede="Seven stages, each one measured on its own. The numbers here are what every figure on the other tabs is built from, so a weak stage shows up as a ceiling downstream rather than as a surprise at the end."
      />

      <Stages
        blocking={blocking.data}
        link={link.data}
        clustering={clustering.data}
        model={model.data}
      />

      <Blocking b={blocking.data} />
      <Linking link={link.data} />
      <Clustering c={clustering.data} />
      <Model m={model.data} />
    </div>
  );
}
