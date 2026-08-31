import { accountAt, edgeAt, pairCells } from "@/lib/world";
import { count, dp2, dp4, pct, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

const HASHABLE = new Set(["device_id", "address_id", "pincode", "card_bin",
                          "ip_prefix"]);

// The twelve columns as docs/06-run-and-integrate.md defines them.
const FIELD_TYPE = {
  account_id: "string", device_id: "string", address_id: "string",
  pincode: "string", card_bin: "string", ip_prefix: "string",
  signup_ts: "int", n_orders: "int", coupon_used: "bool",
  first_order_value: "int", total_order_value: "int",
  days_to_second_order: "int",
};

const FIELD_NOTE = {
  account_id: "your identifier, returned untouched",
  device_id: "device fingerprint",
  address_id: "delivery address, normalised by you",
  pincode: "postcode, also a blocking key",
  card_bin: "first six of the card",
  ip_prefix: "first three octets",
  signup_ts: "unix seconds, compared as a gap",
  n_orders: "orders placed so far",
  coupon_used: "did this account claim the first-order promo",
  first_order_value: "rupees, integer",
  total_order_value: "rupees, integer",
  days_to_second_order: "-1 if there was never a second order",
};

export function Row({ label, value, tone, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2 last:border-b-0">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <span
        className={cn("tnum text-[13px] text-fg", mono && "ident")}
        style={tone ? { color: `var(--color-${tone})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Head({ title, note }) {
  return (
    <div className="mb-3">
      <h3 className="text-[14px] font-medium text-fg">{title}</h3>
      {note && <p className="mt-1.5 text-[12.5px] leading-[1.55] text-fg-muted">{note}</p>}
    </div>
  );
}

function BitsBar({ bits, max, tone = "info" }) {
  const w = Math.max(0, Math.min(100, (bits / max) * 100));
  return (
    <div className="h-[3px] w-full bg-raised">
      <div className="h-full" style={{ width: `${w}%`,
                                       background: `var(--color-${tone})` }} />
    </div>
  );
}

function Histogram({ histogram, threshold }) {
  const { counts, from_bits: from, bin_width: width } = histogram;
  const peak = Math.max(...counts);
  const cut = Math.round((threshold - from) / width);
  return (
    <div>
      <div className="flex h-[86px] items-end gap-px">
        {counts.map((c, i) => (
          <div
            key={i}
            title={`${from + i * width} to ${from + (i + 1) * width} bits: ${count(c)} pairs`}
            className="min-w-px flex-1"
            style={{
              height: `${Math.max(c > 0 ? 1 : 0, (c / peak) * 100)}%`,
              background: i >= cut ? "var(--color-info)" : "var(--color-line-strong)",
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-fg-faint">
        <span>{from} bits</span>
        <span style={{ color: "var(--color-info)" }}>
          edge drawn at {threshold} bits
        </span>
        <span>{from + counts.length * width}+</span>
      </div>
    </div>
  );
}

function AccountPanel({ world, geom, index, onSelectEdge }) {
  const row = accountAt(world, index);
  const { source, target } = world.edges;
  const mine = [];
  for (let e = 0; e < source.length && mine.length < 24; e += 1) {
    if (source[e] === index || target[e] === index) mine.push(e);
  }
  const k = geom.clusterOf[index];

  return (
    <div>
      <Head title={row.account_id}
            note={k >= 0 ? `In cluster ${k}, ${world.clusters[k].size} accounts.`
                         : "In no cluster."} />
      <div className="mb-5">
        {world.columns.filter((c) => c !== "account_id").map((c) => (
          <Row key={c} label={c} mono
               value={String(row[c])} />
        ))}
      </div>

      <Head title={`${mine.length ? "Edges" : "No edges"} on this account`}
            note={mine.length ? "Click one to see the evidence behind it." : null} />
      <div className="flex flex-wrap gap-1.5">
        {mine.map((e) => (
          <button key={e} type="button" onClick={() => onSelectEdge(e)}
                  className="interactive tnum border border-line px-2 py-1 text-[12px] text-fg-muted hover:border-line-strong hover:text-fg">
            {dp2(world.edges.bits[e])} bits
          </button>
        ))}
      </div>
    </div>
  );
}

function EdgePanel({ world, index, onSelectAccount }) {
  const e = edgeAt(world, index);
  const a = world.accounts.account_id[e.source];
  const b = world.accounts.account_id[e.target];
  const threshold = world.link.threshold_bits;
  const max = Math.max(...e.parts.map((p) => Math.abs(p.bits)), 1);

  return (
    <div>
      <Head title="Pair evidence"
            note={`Every comparison contributes log2(m / u) bits. They sum to ${dp2(e.bits)}, and an edge is drawn at ${threshold}.`} />
      <div className="mb-4 flex gap-2">
        {[[a, e.source], [b, e.target]].map(([id, i]) => (
          <button key={id} type="button" onClick={() => onSelectAccount(i)}
                  className="interactive ident border border-line px-2.5 py-1.5 text-[12px] text-fg hover:border-line-strong">
            {id}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {e.parts.map((p) => (
          <div key={p.name}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[12.5px] text-fg-muted">{p.name}</span>
              <span className="tnum text-[12.5px]"
                    style={{ color: p.bits >= 0 ? "var(--color-fg)"
                                                : "var(--color-fg-faint)" }}>
                {p.bits >= 0 ? "+" : ""}{dp2(p.bits)}
              </span>
            </div>
            <BitsBar bits={Math.abs(p.bits)} max={max}
                     tone={p.bits >= 0 ? "info" : "line-strong"} />
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <Row label="Total" value={`${dp2(e.bits)} bits`} />
        <Row label="Threshold" value={`${threshold} bits`} />
      </div>
    </div>
  );
}

function ClusterPanel({ world, cluster, stage, revealTruth }) {
  const costs = cluster.expected_cost_rupees;
  const cheapest = Object.keys(costs).reduce((a, b) => (costs[a] <= costs[b] ? a : b));
  const tone = { block: "bad", review: "warn", allow: "ok" }[cluster.action];

  return (
    <div>
      <Head title={`Cluster ${cluster.cluster_id}`}
            note={`${cluster.size} accounts, ${dp2(cluster.features.mean_edge_bits)} bits on the average edge inside it.`} />

      <Row label="Accounts" value={count(cluster.size)} />
      <Row label="Edge density" value={dp4(cluster.features.edge_density)} />
      <Row label="Weakest edge" value={`${dp2(cluster.features.min_edge_bits)} bits`} />
      <Row label="Strongest signal" value={cluster.strongest_signal} />
      <Row label="Signup span" value={`${dp2(cluster.features.signup_span_days)} days`} />
      <Row label="Distinct devices" value={pct(cluster.features.distinct_device_ratio)} />
      <Row label="Coupon value taken"
           value={rupees(cluster.features.total_discount)} />

      {stage >= 5 && (
        <div className="mt-5">
          <Head title="Two questions, two models"
                note="One says whether this is a ring. The other says how much of it is. The decision uses the second." />
          <Row label="Ring probability" value={dp4(cluster.probability)} />
          <Row label="Predicted ring purity" value={dp4(cluster.predicted_ring_purity)} />
        </div>
      )}

      {stage >= 6 && (
        <div className="mt-5">
          <Head title="What each action is expected to cost"
                note="Priced from the purity above, at ₹15,000 a wrong block, ₹200 a missed abuser and ₹150 an analyst review." />
          {["block", "review", "allow"].map((a) => (
            <Row key={a} label={a} value={rupees(costs[a])}
                 tone={a === cheapest ? tone : undefined} />
          ))}
          <div className="mt-4 border border-line px-4 py-3">
            <div className="label">Action</div>
            <div className="tnum mt-1 text-[26px] leading-none font-medium uppercase"
                 style={{ color: `var(--color-${tone})` }}>
              {cluster.action}
            </div>
          </div>

          {revealTruth && (
            <div className="mt-4 border border-dashed border-line px-4 py-3">
              <div className="label">Answer key, opened after the decision</div>
              <div className="mt-2">
                <Row label="Really a ring" value={cluster.truth.label ? "yes" : "no"} />
                <Row label="True ring purity" value={dp4(cluster.truth.ring_purity)} />
                <Row label="Ring members" value={count(cluster.truth.n_ring_members)} />
                <Row label="Innocent members" value={count(cluster.truth.n_innocent_members)} />
                {cluster.truth.dominant_benign_kind && (
                  <Row label="Benign group" value={cluster.truth.dominant_benign_kind} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SchemaPanel({ world }) {
  const sample = accountAt(world, 0);
  return (
    <div>
      <Head title="What a merchant sends"
            note="One row per account, twelve columns. Five of them may arrive as a salted digest: the pipeline only ever tests them for equality." />
      <div className="space-y-2">
        {world.columns.map((c) => (
          <div key={c} className="border-b border-line pb-2 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex items-baseline gap-2.5">
                <span className="ident text-[12.5px] text-fg">{c}</span>
                <span className="text-[11.5px] text-fg-dim">{FIELD_TYPE[c]}</span>
              </span>
              {HASHABLE.has(c) && (
                <span className="label" style={{ color: "var(--color-info)" }}>
                  hashable
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <span className="text-[12px] text-fg-faint">{FIELD_NOTE[c]}</span>
              <span className="tnum ident shrink-0 text-[12px] text-fg-muted">
                {String(sample[c])}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-[1.55] text-fg-faint">
        A salted digest is still a pseudonymous identifier. It is not anonymised
        data.
      </p>
    </div>
  );
}

function BlockingPanel({ world }) {
  const b = world.blocking;
  const cells = pairCells(b);
  const perCell = Math.round(b.n_possible_pairs / cells);
  return (
    <div>
      <Head title="Cutting the pair space"
            note="Six loose rules, deduplicated. A pair no rule produces can never be found later, so the cost of this step is measured, not assumed." />
      <Row label="Possible pairs" value={count(b.n_possible_pairs)} />
      <Row label="Candidate pairs" value={count(b.n_candidate_pairs)} />
      <Row label="Search space cut" value={pct(b.pair_reduction_ratio, 3)} />
      <Row label="Blocks skipped as too large" value={count(b.blocks_skipped)} />
      <p className="mt-3 text-[12px] leading-[1.55] text-fg-faint">
        Each cell on the left is {count(perCell)} pairs. One cell in{" "}
        {count(cells)} survives blocking, and it is the lit one.
      </p>

      <div className="mt-5">
        <Head title="Pairs each rule produced" />
        {Object.entries(b.rules).map(([name, r]) => (
          <Row key={name} label={name} value={count(r.pairs)} />
        ))}
      </div>
    </div>
  );
}

function PairWalk({ world, index, revealed }) {
  const e = edgeAt(world, index);
  const threshold = world.link.threshold_bits;
  const a = world.accounts.account_id[e.source];
  const b = world.accounts.account_id[e.target];
  const shown = e.parts.slice(0, revealed);
  const running = shown.length ? shown[shown.length - 1].running : 0;
  const crossed = running >= threshold;

  return (
    <div className="border border-line px-4 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="ident text-[12.5px] text-fg">{a}</span>
        <span className="text-[11.5px] text-fg-faint">against</span>
        <span className="ident text-[12.5px] text-fg">{b}</span>
      </div>

      <div className="mt-4 space-y-1.5">
        {e.parts.map((p, i) => (
          <div key={p.name}
               className="flex items-baseline justify-between gap-4 text-[12.5px]"
               style={{ opacity: i < revealed ? 1 : 0.18,
                        transition: "opacity 220ms ease-out" }}>
            <span className="text-fg-muted">{p.name}</span>
            <span className="tnum text-fg">
              {p.bits >= 0 ? "+" : ""}{dp2(p.bits)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[12.5px] text-fg-muted">
            {crossed ? "edge drawn at" : "running total"}
          </span>
          <span className="tnum text-[20px] leading-none font-medium"
                style={{ color: crossed ? "var(--color-info)" : "var(--color-fg)" }}>
            {dp2(running)} bits
          </span>
        </div>
        <div className="mt-2.5 h-[3px] w-full bg-raised">
          <div className="h-full"
               style={{ width: `${Math.min(100, (running / (threshold * 2)) * 100)}%`,
                        background: crossed ? "var(--color-info)"
                                            : "var(--color-line-loud)",
                        transition: "width 220ms ease-out" }} />
        </div>
        <div className="mt-2 text-[11.5px] text-fg-faint">
          threshold {threshold} bits
        </div>
      </div>
    </div>
  );
}

function LinkingPanel({ world, pairIndex, revealed }) {
  return (
    <div>
      <Head title="Weak agreements add up"
            note={`Each comparison is worth log2(m / u) bits. ${count(world.link.n_scored_pairs)} candidate pairs were scored and ${count(world.link.n_edges)} cleared ${world.link.threshold_bits} bits.`} />

      {pairIndex !== null && (
        <div className="mb-5">
          <PairWalk world={world} index={pairIndex} revealed={revealed} />
        </div>
      )}

      <Head title="Every candidate pair, scored" />
      <Histogram histogram={world.link.bits_histogram}
                 threshold={world.link.threshold_bits} />
      <div className="mt-5">
        <Row label="Pairs scored" value={count(world.link.n_scored_pairs)} />
        <Row label="Edges drawn" value={count(world.link.n_edges)} />
        <Row label="Comparisons used" value={world.link.comparisons.length} />
        <Row label="Comparisons dropped"
             value={world.link.excluded_comparisons.join(", ")} />
      </div>
      <p className="mt-4 text-[12px] leading-[1.55] text-fg-faint">
        Order value and the coupon floor were dropped because they punish a ring
        for varying its order values.
      </p>
    </div>
  );
}

function GraphPanel({ world, geom }) {
  let linked = 0;
  for (let i = 0; i < geom.degree.length; i += 1) if (geom.degree[i] > 0) linked += 1;
  return (
    <div>
      <Head title="Accounts become a graph"
            note="From here nothing is judged one account at a time. The thing being judged is a group." />
      <Row label="Accounts" value={count(world.n_accounts)} />
      <Row label="Accounts holding an edge" value={count(linked)} />
      <Row label="Edges" value={count(world.link.n_edges)} />
      <Row label="Edge weight" value="bits of evidence" />
      <p className="mt-4 text-[12px] leading-[1.55] text-fg-faint">
        Click any account in the scene to read its record and the evidence on
        each of its edges.
      </p>
    </div>
  );
}

function ClusteringPanel({ world, geom }) {
  const c = world.clustering;
  const sizes = world.clusters.map((x) => x.size).sort((a, b) => b - a);
  return (
    <div>
      <Head title="Communities, not components"
            note="Leiden rather than Louvain, because Louvain can return a community that is internally disconnected, and a disconnected ring is not a ring." />
      <Row label="Clusters kept" value={count(c.n_clusters)} />
      <Row label="Accounts in a cluster" value={count(c.n_clustered_accounts)} />
      <Row label="Largest cluster" value={count(sizes[0])} />
      <Row label="Edges inside a cluster" value={count(geom.insideEdges)} />
      <Row label="Edges between clusters" value={count(geom.crossEdges)} />
      <Row label="Minimum cluster size" value={c.min_cluster_size} />
      <Row label="Resolution" value={c.resolution} />
      <Row label="Random seed" value={c.seed} />
    </div>
  );
}

export function Inspector({ world, geom, stage, cluster, selected, onSelect,
                            pairIndex = null, revealed = 0 }) {
  if (selected?.kind === "account") {
    return (
      <AccountPanel world={world} geom={geom} index={selected.id}
                    onSelectEdge={(e) => onSelect({ kind: "edge", id: e })} />
    );
  }
  if (selected?.kind === "edge") {
    return (
      <EdgePanel world={world} index={selected.id}
                 onSelectAccount={(i) => onSelect({ kind: "account", id: i })} />
    );
  }

  if (stage === 0) return <SchemaPanel world={world} />;
  if (stage === 1) return <BlockingPanel world={world} />;
  if (stage === 2) {
    return <LinkingPanel world={world} pairIndex={pairIndex} revealed={revealed} />;
  }
  if (stage === 3) return <GraphPanel world={world} geom={geom} />;
  if (!cluster) return <ClusteringPanel world={world} geom={geom} />;
  return <ClusterPanel world={world} cluster={cluster} stage={stage}
                       revealTruth={stage >= 6} />;
}
