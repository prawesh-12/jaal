import { useMemo } from "react";
import {
  Clock, Database, Fingerprint, KeyRound, Layers, Package, Ruler, ScrollText, Server,
  Terminal, Users, Wallet,
} from "lucide-react";
import { Note } from "@/components/ui/panel";
import { Code } from "@/components/code";
import { BarList } from "@/components/chart";
import { Anchored, TableOfContents, useActiveSection } from "@/components/toc";
import { Empty, Metadata, PageHeader, Skeleton, Status } from "@/components/section";
import { Metric, MetricRow } from "@/components/metric";
import { FlowPair } from "@/three/Flow";
import { SystemMap } from "@/three/SystemMap";
import { useJson } from "@/lib/useJson";
import { agreementWeights } from "@/lib/pipelineStages";
import { count, dp4, pct, rupees, signedRupees } from "@/lib/format";
import { cn } from "@/lib/utils";


const SECTIONS = [
  { id: "start", title: "Quick start", icon: Terminal },
  { id: "what", title: "What it does", icon: Layers },
  { id: "where", title: "Where it sits", icon: Server },
  { id: "send", title: "What you send", icon: Database },
  { id: "hash", title: "Nothing leaves in the clear", icon: KeyRound },
  { id: "worth", title: "What each field is worth", icon: Ruler },
  { id: "partial", title: "If you cannot send it all", icon: Layers },
  { id: "call", title: "Calling it", icon: ScrollText },
  { id: "scale", title: "Running it at scale", icon: Clock },
  { id: "staff", title: "Staffing the queue", icon: Users },
  { id: "engine", title: "Deploy the engine", icon: Package },
  { id: "limits", title: "What it does not promise", icon: ScrollText },
];

const IDS = SECTIONS.map((s) => s.id);
const ICON = Object.fromEntries(SECTIONS.map((s) => [s.id, s.icon]));

const GROUPS = [
  {
    name: "Who", icon: Fingerprint, hashable: true,
    what: "Compared for equality only, so a salted digest is enough.",
    columns: ["device_id", "address_id", "pincode", "card_bin", "ip_prefix"],
  },
  {
    name: "When", icon: Clock, hashable: false,
    what: "Compared as a gap, so the real timestamp is needed.",
    columns: ["signup_ts"],
  },
  {
    name: "What they did", icon: Wallet, hashable: false,
    what: "Counts and rupees. Money is an integer throughout.",
    columns: ["n_orders", "coupon_used", "first_order_value",
              "total_order_value", "days_to_second_order"],
  },
];

const BATCH = {
  title: "Batch discovery",
  steps: [
    { label: "Whole account population" },
    { label: "Candidate pairs and edges" },
    { label: "Graph and clustering" },
    { label: "Scores, prices, review queue", tone: "fg" },
  ],
};

const ENGINE_CODE = `pip install -r requirements.txt

python -c "
import pandas as pd
from detector.pipeline import Detector
accounts = pd.read_csv('your_accounts.csv')
for c in Detector.load().scan(accounts)['clusters']:
    print(c['action'], c['size'], c['accounts'])
"

python -m api.app          # then POST to http://127.0.0.1:5001/v1/scan`;

const ENGINE = {
  title: "Jaal Engine",
  steps: [
    { label: "detector/", note: "blocking, linkage, clustering, features" },
    { label: "results/model.pkl", note: "classifier, calibrator, purity model" },
    { label: "api/", note: "the HTTP service over it" },
    { label: "Merchant system", note: "block, review, allow", tone: "fg" },
  ],
};

const LAB = {
  title: "Jaal Lab",
  steps: [
    { label: "ui/", note: "this application" },
    { label: "Three.js scenes", note: "hero, simulation, charts" },
    { label: "results/*.json", note: "read only, copied at build time" },
    { label: "Reader", note: "explanation, not detection" },
  ],
};

const ONLINE = {
  title: "Online cluster assignment",
  steps: [
    { label: "One new account" },
    { label: "Blocking against existing members" },
    { label: "Pair evidence in bits" },
    { label: "Attach to a cluster, or stand alone", tone: "fg" },
  ],
};

/* Request and response as one real run produced them, not as they might look.
   results/api_example.json is written by detector.sim_world. */
function ApiExample({ example }) {
  if (!example) {
    return (
      <p className="mt-10 t-meta">
        results/api_example.json is missing. Run{" "}
        <span className="ident">python -m detector.sim_world</span>.
      </p>
    );
  }
  return (
    <div className="mt-10">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <div>
          <h3 className="label">You send</h3>
          <Code language="json" className="mt-4">
            {`${example.endpoint}\n${JSON.stringify(example.request, null, 2)}`}
          </Code>
        </div>
        <div>
          <h3 className="label">You get back</h3>
          <Code language="json" className="mt-4">
            {JSON.stringify(example.response, null, 2)}
          </Code>
        </div>
      </div>
      <p className="t-meta mt-4 text-fg-faint">
        Both halves are from {example.from}. The request is two of the twelve
        thousand rows that call sent, and the response is the cluster that batch
        came back with.
      </p>
    </div>
  );
}

function Architecture() {
  return (
    <figure className="m-0">
      <div className="h-[min(52vh,460px)] border border-line">
        <SystemMap className="h-full w-full" />
      </div>

      <figcaption className="mt-6 max-w-[74ch] border-l-2 border-line-loud pl-6 text-[17px] leading-[1.45] text-fg">
        Jaal is a triage layer that fills a review queue. It is not a checkout
        authorisation gate.
      </figcaption>
    </figure>
  );
}

function HashDiagram() {
  return (
    <figure className="m-0 border-y border-line py-8">
      <svg viewBox="0 0 900 150" className="w-full min-w-[620px]" role="img"
           aria-label="Two accounts sharing a device still share it after hashing">
        {[0, 1].map((row) => {
          const y = 42 + row * 56;
          return (
            <g key={row}>
              <text x="20" y={y + 4} fontSize="10.5" fill="var(--color-fg-faint)"
                    fontFamily="var(--font-sans)">account {row + 1}</text>
              <rect x="104" y={y - 14} width="148" height="28" rx="3"
                    fill="var(--color-sunken)" stroke="var(--color-line)" />
              <text x="178" y={y + 4} textAnchor="middle" fontSize="11"
                    fill="var(--color-fg-2)" fontFamily="var(--font-mono)">
                dv000000000014
              </text>
              <line x1="256" y1={y} x2="292" y2={y} stroke="var(--color-line-strong)" />
              <path d={`M292 ${y - 3.5} L298 ${y} L292 ${y + 3.5} Z`}
                    fill="var(--color-line-strong)" />
              <rect x="446" y={y - 14} width="212" height="28" rx="3"
                    fill="var(--color-sunken)" stroke="var(--color-line)" />
              <text x="552" y={y + 4} textAnchor="middle" fontSize="11"
                    fill="var(--color-fg-2)" fontFamily="var(--font-mono)">
                9f2c…a71e
              </text>
            </g>
          );
        })}

        <rect x="302" y="28" width="138" height="84" rx="3"
              fill="var(--color-raised)" stroke="var(--color-line-strong)" />
        <text x="371" y="62" textAnchor="middle" fontSize="11"
              fill="var(--color-fg)" fontFamily="var(--font-mono)">sha256</text>
        <text x="371" y="82" textAnchor="middle" fontSize="10"
              fill="var(--color-fg-faint)" fontFamily="var(--font-sans)">
          salted per tenant
        </text>

        <line x1="678" y1="70" x2="712" y2="70" stroke="var(--color-line-strong)" />
        <path d="M712 66.5 L718 70 L712 73.5 Z" fill="var(--color-line-strong)" />
        <text x="734" y="66" fontSize="12" fill="var(--color-fg)"
              fontFamily="var(--font-sans)">still equal</text>
        <text x="734" y="84" fontSize="10.5" fill="var(--color-fg-faint)"
              fontFamily="var(--font-sans)">which is all the scorer asks</text>
      </svg>
    </figure>
  );
}

const STAGE_SHADE = {
  block_ms: 0.92, link_ms: 0.74, cluster_ms: 0.56, features_ms: 0.38, score_ms: 0.22,
};
const STAGE_NAME = {
  block_ms: "block", link_ms: "link", cluster_ms: "cluster",
  features_ms: "features", score_ms: "score",
};

function TimingBars({ sizes }) {
  const widest = Math.max(...sizes.map((s) => s.total_ms));
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {Object.keys(STAGE_SHADE).map((k) => (
          <span key={k} className="inline-flex items-center gap-2.5 text-[12.5px] text-fg-muted">
            <span aria-hidden="true" className="h-2.5 w-4 rounded-[1px]"
                  style={{ background: "var(--color-accent)", opacity: STAGE_SHADE[k] }} />
            {STAGE_NAME[k]}
          </span>
        ))}
      </div>

      <div className="border-t border-line">
        {sizes.map((s) => (
          <div key={s.n_accounts}
               className="grid items-center gap-x-6 gap-y-2 border-b border-line py-4 sm:grid-cols-[130px_minmax(0,1fr)_170px]">
            <span className="tnum text-[13px] text-fg">{count(s.n_accounts)}</span>
            <span className="flex h-4 w-full" style={{ width: `${(s.total_ms / widest) * 100}%` }}>
              {Object.keys(STAGE_SHADE).map((k) => (
                <span
                  key={k}
                  title={`${STAGE_NAME[k]} ${s.timings_ms[k].toFixed(1)}ms`}
                  className="block h-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${(s.timings_ms[k] / s.total_ms) * 100}%`,
                    background: "var(--color-accent)",
                    opacity: STAGE_SHADE[k],
                  }}
                />
              ))}
            </span>
            <span className="sm:text-right">
              <span className="tnum text-[13px] text-fg">
                {(s.total_ms / 1000).toFixed(2)}s
              </span>
              <span className="ml-3 text-[12px] text-fg-faint">
                {count(Math.round(s.accounts_per_second))}/s
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function Integrate({ bare = false }) {
  const holdout = useJson("holdout");
  const decisions = useJson("decisions");
  const link = useJson("link_params");
  const ablation = useJson("field_ablation");
  const timing = useJson("scan_timing");
  const capacity = useJson("review_capacity");
  const accuracy = useJson("review_accuracy");
  const api = useJson("api_example");
  const active = useActiveSection(IDS);

  const weights = useMemo(
    () => (link.data ? agreementWeights(link.data) : []), [link.data]
  );

  if (holdout.loading) return <Skeleton className="mt-16 h-96 w-full" />;
  if (!holdout.data) return <Empty>No results/holdout.json yet. Run ./run.sh.</Empty>;

  const p = holdout.data.pooled;
  const d = decisions.data;
  const big = timing.data?.sizes?.[timing.data.sizes.length - 1];
  const profiles = ablation.data?.profiles?.filter((r) => r.usable) ?? [];
  const full = profiles.find((r) => r.name === "full");

  return (
    <div className={bare ? undefined : "pt-14"}>
      {!bare && (
        <PageHeader
          title="Using Jaal"
          lede="What you send it, where it sits, and what it costs to run."
        >
          <Metadata
            className="mt-8"
            items={[
              ["Columns", 12],
              ["Hashable", 5],
              ["Review load", pct(p.review_rate, 2)],
              ...(big ? [["12,000 accounts", `${(big.total_ms / 1000).toFixed(2)}s`]] : []),
            ]}
          />
        </PageHeader>
      )}

      <div className="grid gap-x-16 gap-y-8 pt-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <TableOfContents
          sections={SECTIONS}
          active={active}
          className={cn(
            "sticky top-[52px] z-30 -mx-1 border-b border-line bg-base/95 px-1 py-3 backdrop-blur-sm",
            "md:top-[104px] md:mx-0 md:self-start md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
          )}
        />

        <div className="min-w-0">
          <Anchored id="start" icon={ICON.start} title="Quick start"
                    lede="A batch of accounts in, one priced decision per cluster out. Nothing else to wire up.">
            <Architecture />

            <ApiExample example={api.data} />

            <dl className="mt-10 grid gap-x-10 gap-y-4 border-t border-line pt-6 sm:grid-cols-2">
              {[
                ["Interface", "REST over HTTP. Flask, loopback by default."],
                ["Shape", `Batch. Up to ${count(20000)} accounts a call.`],
                ["Cadence", "Nightly discovery. Attaching one new account is blocking and linking only, so that half can be online."],
                ["Deployment", "One stateless microservice next to your risk stack. It loads a pickled model and holds no database."],
                ["Input", "One row per account, twelve columns. The five identity columns can be salted digests."],
                ["Output", "One record per cluster: an action, a probability, a predicted purity, the expected cost of each action, and a written reason."],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-line pb-3">
                  <dt className="text-[13px] text-fg">{k}</dt>
                  <dd className="t-meta mt-1.5 text-fg-muted">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-12">
              <h3 className="label">Every endpoint</h3>
              <ul className="mt-4 grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
                {[
                  ["GET /health", "is the model loaded"],
                  ["GET /v1/schema", "columns, features and the three prices"],
                  ["GET /v1/profiles", "column sets, and what each one reaches"],
                  ["POST /v1/coverage", "your column names in, what you would get out"],
                  ["POST /v1/scan", "a batch of accounts in, priced decisions out"],
                  ["POST /v1/score", "one cluster you already featurised"],
                  ["GET /features", "the cluster features the model reads"],
                  ["GET /runs/<id>", "a saved result file, for example /runs/holdout"],
                ].map(([route, what]) => (
                  <li key={route}
                      className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                    <span className="ident text-[12.5px] text-fg">{route}</span>
                    <span className="text-[12.5px] text-fg-faint">{what}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Code language="bash" className="mt-10">{`# what you would get from the columns you already have, no account data sent
curl -s localhost:5001/v1/coverage -X POST \\
  -H 'content-type: application/json' \\
  -d '{"columns": ["account_id","device_id","card_bin","n_orders"]}'`}</Code>
          </Anchored>

          <Anchored id="what" icon={ICON.what} title="What it does"
                    lede="Finds groups of accounts run by one person farming a first-order promo. The unit is the cluster, never the transaction.">
            <MetricRow columns={3}>
              <Metric
                label="Precision, blocked"
                value={dp4(p.precision)}
                note={`${count(p.fp)} wrong block in ${count(p.accounts_blocked)}`}
                detail="A wrong block costs a customer, so this has to be near perfect."
              />
              <Metric
                label="Reached with a human"
                value={dp4(p.recall_including_review)}
                note={`Against ${dp4(p.recall)} blocked outright`}
                detail="Review is an action, not a miss. The gap is the work the queue does."
              />
              <Metric
                label="Review load"
                value={pct(p.review_rate, 2)}
                note={`${count(p.clusters_reviewed)} of ${count(holdout.data.n_clusters)} clusters`}
                detail="The share that needs a person. Everything rests on this staying small."
              />
            </MetricRow>
            <Note className="mt-8">
              A triage layer, not a gate. It blocks only where blocking pays.
            </Note>
          </Anchored>

          <Anchored id="where" icon={ICON.where} title="Where it sits"
                    lede="Two jobs, two shapes. Mixing them up is the usual way an integration goes wrong.">
            <div className="grid gap-x-12 gap-y-6 border-y border-line py-8 lg:grid-cols-2">
              <p className="t-meta max-w-[46ch]">
                Batch discovery runs nightly or hourly over the whole population.
                Clustering has to see the entire graph, so this half cannot be
                synchronous.
              </p>
              <p className="t-meta max-w-[46ch]">
                Online assignment takes one new account against the clusters that
                already exist. Blocking and linking only, which is the half that
                can run inside a request.
              </p>
              <div className="h-[360px] lg:col-span-2">
                <FlowPair left={BATCH} right={ONLINE} className="h-full w-full" />
              </div>
            </div>
            {big && (
              <p className="t-meta mt-6">
                A full pass over {count(big.n_accounts)} accounts takes{" "}
                <span className="tnum text-fg-2">{(big.total_ms / 1000).toFixed(2)}s</span>,
                measured, not estimated.
              </p>
            )}
            <Note className="mt-6">
              Cluster discovery is a batch job. Do not put it in the checkout path.
            </Note>
          </Anchored>

          <Anchored id="send" icon={ICON.send} title="What you send"
                    lede="One row per account, twelve columns, in three groups.">
            <div className="grid gap-px border border-line bg-line lg:grid-cols-3">
              {GROUPS.map((g) => (
                <div key={g.name} className="bg-surface px-5 py-6">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2.5">
                      <g.icon size={15} strokeWidth={1.5} className="text-fg-faint" />
                      <span className="text-[14px] font-medium text-fg">{g.name}</span>
                    </span>
                    {g.hashable && (
                      <span className="inline-flex items-center gap-2 text-[11.5px] text-fg-2">
                        <Status tone="ok" /> hashable
                      </span>
                    )}
                  </div>
                  <ul className="mt-4 space-y-1.5">
                    {g.columns.map((c) => (
                      <li key={c} className="ident text-[12.5px] text-fg-muted">{c}</li>
                    ))}
                  </ul>
                  <p className="t-meta mt-4 border-t border-line pt-3 text-fg-faint">
                    {g.what}
                  </p>
                </div>
              ))}
            </div>
            <Note className="mt-6">
              Plus <span className="ident text-fg-2">account_id</span>, returned untouched.
            </Note>
          </Anchored>

          <Anchored id="hash" icon={ICON.hash} title="Nothing leaves in the clear"
                    lede="The five identity columns are only ever tested for equality. Salt and hash them and the pipeline cannot tell.">
            <HashDiagram />
            <Code language="python" className="mt-8">{`from detector.profiles import hash_identifiers

payload = hash_identifiers(accounts, salt="tenant-7c1f")`}</Code>
            <div className="mt-8 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {["same candidate pairs", "identical pair scores",
                "same clusters", "every feature equal"].map((line) => (
                <span key={line} className="flex items-center gap-3 text-[13px] text-fg-muted">
                  <Status tone="ok" />{line}
                </span>
              ))}
            </div>
            <Note className="mt-6">
              Asserted in <span className="ident text-fg-2">tests/test_hashing.py</span>.
              A salted digest is still personal data under the DPDP Act. This
              changes the review, it does not remove it.
            </Note>
          </Anchored>

          <Anchored id="worth" icon={ICON.worth} title="What each field is worth"
                    lede={link.data
                      ? `Two accounts start at about one in ${count(Math.round(1 / link.data.prior_match_rate))}. Each agreement adds bits.`
                      : "Each agreement adds bits."}>
            <BarList
              items={weights.map((w) => ({
                label: `${w.field} · ${w.level}`, value: w.bits,
              }))}
              format={(v) => `+${v.toFixed(2)}`}
              color="var(--color-accent)"
            />
            <Note className="mt-6">
              An IP prefix is worth nothing. The top three outweigh everything else.
            </Note>
          </Anchored>

          <Anchored id="partial" icon={ICON.partial} title="If you cannot send it all"
                    lede="Each column set re-blocked, re-scored, re-clustered and refitted on its own. Bars are what it reaches with a human.">
            {profiles.length ? (
              <>
                <BarList
                  items={profiles.map((r) => ({
                    label: r.name,
                    value: r.pooled.recall_including_review,
                    color: r.name === "full"
                      ? "var(--color-accent)" : "var(--color-fg-faint)",
                  }))}
                  max={1}
                  format={(v) => dp4(v)}
                  describe
                />
                <div className="mt-8 grid gap-x-10 gap-y-6 border-y border-line-strong py-8 sm:grid-cols-3">
                  {[
                    ["Aggregator alone", "aggregator"],
                    ["Plus a hashed address", "aggregator_plus_address"],
                    ["Plus the coupon flag", "sdk_payload"],
                  ].map(([label, name]) => {
                    const r = profiles.find((x) => x.name === name);
                    if (!r || !full) return null;
                    return (
                      <div key={name} className="not-first:sm:border-l not-first:sm:border-line not-first:sm:pl-10">
                        <div className="label">{label}</div>
                        <div className="tnum mt-3 text-[30px] leading-none font-medium text-fg">
                          {pct(r.pooled.net_vs_nothing_rupees / full.pooled.net_vs_nothing_rupees, 0)}
                        </div>
                        <p className="t-meta mt-2.5 text-fg-faint">of the full net</p>
                      </div>
                    );
                  })}
                </div>
                <Note className="mt-6">
                  Read the bar, not the net.{" "}
                  <span className="ident text-fg-2">aggregator_strict</span> posts
                  the best net and reaches 0.0000 on the hardest tier, because net
                  rewards giving up when a miss is cheap.
                </Note>
              </>
            ) : (
              <Empty>No field_ablation.json yet. Run python -m detector.ablate.</Empty>
            )}
          </Anchored>

          <Anchored id="call" icon={ICON.call} title="Calling it"
                    lede="Coverage takes column names and no account data, so it can be answered before anyone writes an integration.">
            <Code language="bash">{`curl -s localhost:5001/v1/coverage -X POST \\
  -H 'content-type: application/json' \\
  -d '{"columns": ["account_id","device_id","card_bin","n_orders"]}'`}</Code>

            <Code language="python" className="mt-6">{`from detector.pipeline import Detector

result = Detector.load().scan(accounts_dataframe)

for cluster in result["clusters"]:
    # block, review or allow, with the expected cost of each
    print(cluster["action"], cluster["expected_cost_rupees"])`}</Code>

            <ul className="mt-8 grid gap-x-10 gap-y-2.5 border-t border-line pt-5 sm:grid-cols-2">
              {[
                ["POST /v1/coverage", "what you would get"],
                ["POST /v1/scan", "accounts in, decisions out"],
                ["POST /v1/score", "one cluster you already featurised"],
                ["GET /v1/profiles", "every column set"],
                ["GET /v1/schema", "columns, features, prices"],
                ["GET /runs/<id>", "a saved result file"],
              ].map(([route, what]) => (
                <li key={route} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                  <span className="ident text-[12.5px] text-fg">{route}</span>
                  <span className="text-[12.5px] text-fg-faint">{what}</span>
                </li>
              ))}
            </ul>
          </Anchored>

          <Anchored id="scale" icon={ICON.scale} title="Running it at scale"
                    lede="Measured, not estimated. Each batch scanned three times, best run shown.">
            {timing.data ? (
              <>
                <TimingBars sizes={timing.data.sizes} />
                <MetricRow columns={3} className="mt-10">
                  <Metric
                    label="Growth exponent"
                    value={timing.data.growth.exponent}
                    note={`${timing.data.growth.size_ratio}x the accounts, ${timing.data.growth.time_ratio}x the time`}
                    detail="One is linear, two is quadratic. Closer to linear means a large merchant does not have to be sliced to make the job finish."
                  />
                  <Metric
                    label="One million accounts"
                    value={`${Math.round(1e6 / big.accounts_per_second)}s`}
                    note="At the 12,000-account rate"
                    detail="On one core allocation of a developer laptop, with no tuning."
                  />
                  <Metric
                    label="Slowest stage"
                    value={pct(big.timings_ms.cluster_ms / big.total_ms, 0)}
                    note="Clustering"
                    detail="The one stage that has to see the whole graph, which is why discovery is a batch job."
                  />
                </MetricRow>
                <Note className="mt-8">
                  Slice by something a ring does not span: a country, a business
                  unit, a month of signups. Not a delivery city.
                </Note>
              </>
            ) : (
              <Empty>No scan_timing.json yet. Run python -m detector.throughput.</Empty>
            )}
          </Anchored>

          <Anchored id="staff" icon={ICON.staff} title="Staffing the queue"
                    lede="The queue is the product, so the number of people it needs decides whether it ships.">
            {capacity.data && accuracy.data ? (
              <>
                <MetricRow columns={3}>
                  <Metric
                    label="Clusters per 12,000"
                    value={capacity.data.best_budget.budget_per_world.toFixed(2)}
                    note="Where more capacity stops paying"
                    detail="Past this the extra reviews cost more than the abuse they catch."
                  />
                  <Metric
                    label="Reviewer accuracy needed"
                    value={pct(accuracy.data.pooled.breakeven_accuracy, 1)}
                    note="Below this the queue costs more than it saves"
                    detail="A low bar, which is the point. The queue does not need experts."
                  />
                  <Metric
                    label="What the queue is worth"
                    value={signedRupees(capacity.data.review_attributable_benefit_rupees)}
                    note="Against the same model blocking only"
                    detail="The difference the third action makes, with the model held fixed."
                  />
                </MetricRow>
              </>
            ) : (
              <Empty>No review capacity results yet. Run python -m detector.review.</Empty>
            )}
          </Anchored>

          <Anchored id="engine" icon={ICON.engine}
                    title="Deploy the engine"
                    lede="The detection system without the visualisation. A merchant installs the engine and never builds the visualisation.">
            <div className="h-[360px] border-y border-line">
              <FlowPair left={ENGINE} right={LAB} className="h-full w-full" />
            </div>

            <div className="mt-8">
              <Code language="bash">{ENGINE_CODE}</Code>
            </div>

            <Note className="mt-6">
              The Lab reads the same JSON files the engine writes. It never
              recomputes a score, and removing it changes no result.
            </Note>
          </Anchored>

          <Anchored id="limits" icon={ICON.limits} title="What it does not promise">
            <div className="border-t border-line-strong">
              {[
                ["It does not block much",
                 `${dp4(p.recall)} blocked alone, ${dp4(p.recall_including_review)} with a human. Nothing at all on the hardest tier.`],
                ["The model does not transfer",
                 "Fitted on a generator at 0.80% prevalence. Refit on your data."],
                ["u is a fact about your customers",
                 "How often two strangers share a pincode is a property of your population."],
                ["No fuzzy matching",
                 "Exact or a numeric band. A typo in an address is a miss."],
                ["The adversary is one-sided",
                 "Our operator adapts. The detector does not adapt back."],
                ...(d ? [["The three prices are yours",
                 `Priced at ${rupees(d.cost_blocked_innocent)}, ${rupees(d.cost_missed_abuser)} and ${rupees(d.cost_analyst_review)}. Change them and the answer moves.`]] : []),
              ].map(([title, body]) => (
                <div key={title} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line py-4">
                  <h3 className="w-full text-[13.5px] font-medium text-fg sm:w-[240px]">
                    {title}
                  </h3>
                  <p className="t-meta min-w-0 flex-1 text-fg-faint">{body}</p>
                </div>
              ))}
            </div>
          </Anchored>
        </div>
      </div>
    </div>
  );
}
