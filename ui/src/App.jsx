import { useEffect, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const TIERS = ["obvious", "moderate", "sophisticated", "adaptive"];
const rupees = (n) =>
  (n < 0 ? "-" : "+") + "Rs." + Math.abs(Math.round(n)).toLocaleString("en-IN");
const plain = (n) => "Rs." + Math.round(n).toLocaleString("en-IN");

function useJson(name) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`/data/${name}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [name]);
  return data;
}

function Cards({ items }) {
  return (
    <div className="cards">
      {items.map((c) => (
        <div className="card" key={c.label}>
          <div className="label">{c.label}</div>
          <div className={"value " + (c.tone || "")}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function Results({ holdout, baseline }) {
  if (!holdout) return <p className="loading">No results/holdout.json yet. Run ./run.sh.</p>;
  const m = holdout.results_matrix;
  const pooled = holdout.pooled;
  return (
    <>
      <section>
        <h2>Sealed holdout, seeds 900 to 999</h2>
        <p className="sub">
          Opened once. Account level prevalence 0.80%. Never averaged across tiers,
          because the variation is the interesting part.
        </p>
        <Cards
          items={[
            { label: "net against deploying nothing", value: rupees(pooled.net_vs_nothing_rupees),
              tone: pooled.net_vs_nothing_rupees >= 0 ? "pos" : "neg" },
            { label: "precision, blocked accounts", value: pooled.precision.toFixed(4) },
            { label: "recall, blocked", value: pooled.recall.toFixed(4) },
            { label: "recall, blocked or reviewed", value: pooled.recall_including_review.toFixed(4) },
          ]}
        />
      </section>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>tier</th><th>clusters</th><th>PR-AUC</th><th>precision</th>
              <th>recall</th><th>+ review</th><th>Brier</th>
              <th>blocked</th><th>reviewed</th><th>net</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.filter((t) => m[t]).map((t) => (
              <tr key={t}>
                <td>{t}</td>
                <td>{m[t].n_clusters.toLocaleString()}</td>
                <td>{m[t].pr_auc.toFixed(4)}</td>
                <td>{m[t].precision.toFixed(4)}</td>
                <td>{m[t].recall.toFixed(4)}</td>
                <td>{m[t].recall_including_review.toFixed(4)}</td>
                <td>{m[t].brier.toFixed(5)}</td>
                <td>{m[t].accounts_blocked.toLocaleString()}</td>
                <td>{m[t].accounts_reviewed.toLocaleString()}</td>
                <td className={m[t].net_vs_nothing_rupees >= 0 ? "pos" : "neg"}>
                  {rupees(m[t].net_vs_nothing_rupees)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {baseline && (
        <section>
          <h2>Against the rules-only baseline</h2>
          <p className="sub">
            Exact matching on device and address, five hand-written rules, two
            actions. Measured on validation seeds at the same prevalence.
          </p>
          <div className="panel">
            <table>
              <thead>
                <tr><th>tier</th><th>baseline precision</th><th>baseline recall</th>
                  <th>baseline net</th></tr>
              </thead>
              <tbody>
                {TIERS.map((t) => (
                  <tr key={t}>
                    <td>{t}</td>
                    <td>{baseline.tiers[t].precision.toFixed(4)}</td>
                    <td>{baseline.tiers[t].recall.toFixed(4)}</td>
                    <td className="neg">{rupees(baseline.tiers[t].net_vs_nothing_rupees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Cost({ decisions }) {
  if (!decisions) return <p className="loading">No results/decisions.json yet.</p>;
  const sweep = decisions.threshold_sweep.map((r) => ({
    threshold: r.threshold,
    cost: r.cost_rupees / 1e6,
    f1: r.f1,
  }));
  const nothing = decisions.three_action.do_nothing_rupees / 1e6;
  return (
    <>
      <section>
        <h2>What each operating point costs</h2>
        <p className="sub">
          Blocking a real customer costs Rs.15,000. Missing an abuser costs
          Rs.200. Blocking only pays above{" "}
          {(decisions.breakeven_precision * 100).toFixed(1)}% precision.
        </p>
        <Cards
          items={[
            { label: "F1-optimal threshold", value: rupees(decisions.f1_optimal.net_vs_nothing_rupees), tone: "neg" },
            { label: "block above 0.50", value: rupees(decisions.at_half.net_vs_nothing_rupees), tone: "neg" },
            { label: "three actions, expected cost", value: rupees(decisions.three_action.net_vs_nothing_rupees), tone: "pos" },
            { label: "review queue", value: (decisions.three_action.review_rate * 100).toFixed(2) + "% of clusters" },
          ]}
        />
      </section>

      <section className="panel">
        <h2>Cost against blocking threshold</h2>
        <p className="sub">
          Log scale. Every two-action threshold sits above the do-nothing line,
          so every one of them loses money.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={sweep} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke="#262b36" />
            <XAxis dataKey="threshold" stroke="#98a0b3"
              label={{ value: "probability threshold to block", position: "insideBottom", offset: -8, fill: "#98a0b3" }} />
            <YAxis scale="log" domain={["auto", "auto"]} stroke="#98a0b3"
              label={{ value: "Rs. millions", angle: -90, position: "insideLeft", fill: "#98a0b3" }} />
            <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #262b36" }}
              formatter={(v) => "Rs." + (v * 1e6).toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
            <ReferenceLine y={nothing} stroke="#98a0b3" strokeDasharray="4 4"
              label={{ value: "deploy nothing", fill: "#98a0b3", fontSize: 11 }} />
            <Line type="monotone" dataKey="cost" stroke="#5b8def" dot={false} name="cost" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2>Sensitivity to the Rs.15,000 assumption</h2>
        <p className="sub">
          The lifetime value figure is an assumption, so here is how the
          conclusion moves if you disagree with it.
        </p>
        <div className="panel">
          <table>
            <thead>
              <tr><th>cost ratio</th><th>a wrong block costs</th>
                <th>best two-action threshold</th><th>net, three actions</th></tr>
            </thead>
            <tbody>
              {decisions.sensitivity.map((s) => (
                <tr key={s.cost_ratio}>
                  <td>{s.cost_ratio}:1</td>
                  <td>{plain(s.cost_blocked_innocent)}</td>
                  <td>{s.optimal_threshold.toFixed(2)}</td>
                  <td className={s.three_action_net >= 0 ? "pos" : "neg"}>
                    {rupees(s.three_action_net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Curve({ holdout }) {
  if (!holdout) return <p className="loading">No results/holdout.json yet.</p>;
  const data = holdout.detection_curve.map((c) => ({
    sophistication: c.sophistication,
    blocked: c.recall,
    withReview: c.recall_including_review,
    precision: c.precision,
  }));
  const device = holdout.device_only_curve.map((c) => ({
    reuse: c.device_reuse, blocked: c.recall,
  }));
  return (
    <>
      <section className="panel">
        <h2>Where this detector stops working</h2>
        <p className="sub">
          Operator sophistication swept from the obvious tier (0.0) to the
          adaptive tier (1.0). Naming the blind spot precisely is more useful
          than claiming there isn't one.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke="#262b36" />
            <XAxis dataKey="sophistication" stroke="#98a0b3"
              label={{ value: "operator sophistication", position: "insideBottom", offset: -8, fill: "#98a0b3" }} />
            <YAxis stroke="#98a0b3" domain={[0, 1]} />
            <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #262b36" }} />
            <Legend />
            <Line type="monotone" dataKey="withReview" stroke="#4ea87a" name="recall, blocked or reviewed" dot={false} />
            <Line type="monotone" dataKey="blocked" stroke="#5b8def" name="recall, blocked" dot={false} />
            <Line type="monotone" dataKey="precision" stroke="#e0b054" name="precision" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <h2>Rotating devices alone does not help the operator</h2>
        <p className="sub">
          Device reuse swept from 1.0 to 0.0 with everything else held at the
          moderate tier. The line is flat. Rotating delivery addresses is what
          defeats this system, not rotating phones.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={device} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke="#262b36" />
            <XAxis dataKey="reuse" reversed stroke="#98a0b3"
              label={{ value: "device reuse", position: "insideBottom", offset: -8, fill: "#98a0b3" }} />
            <YAxis stroke="#98a0b3" domain={[0, 1]} />
            <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #262b36" }} />
            <Line type="monotone" dataKey="blocked" stroke="#d4685a" name="recall, blocked" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2>Failure catalogue</h2>
        <p className="sub">Every failure mode, with a concrete example.</p>
        <div className="panel">
          <table>
            <thead><tr><th>failure</th><th>example</th><th>why</th></tr></thead>
            <tbody>
              {holdout.failure_catalogue.map((f, i) => (
                <tr key={i}>
                  <td>{f.failure}<div className="meta">{f.detail}</div></td>
                  <td style={{ textAlign: "left" }}>{f.example}</td>
                  <td style={{ textAlign: "left" }}>{f.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Queue({ explanations }) {
  if (!explanations) return <p className="loading">No results/explanations.json yet.</p>;
  return (
    <section>
      <h2>Review queue</h2>
      <p className="sub">
        {explanations.n_notes} clusters the system did not simply allow, worst
        first by rupees extracted. Every number in a note comes from the
        pipeline. The language model, when one is available, only writes the
        sentence.
      </p>
      {explanations.notes.map((n, i) => (
        <div className="panel" key={i} style={{ marginBottom: 10 }}>
          <div className="meta">
            {n.tier} tier, seed {n.seed}, cluster {n.cluster_id}, {n.size} accounts,
            p {n.p.toFixed(2)}
            <span className={"pill " + n.action}>{n.action}</span>
            <span className="pill">{n.source}</span>
          </div>
          <div className="note">{n.note}</div>
        </div>
      ))}
    </section>
  );
}

function Charts() {
  const charts = [
    ["pr_curve.png", "Precision-recall by tier, cluster level"],
    ["reliability.png", "Reliability diagram, does 0.80 mean 80%?"],
    ["cost_curve.png", "What each operating point costs"],
    ["detection_curve.png", "Where the detector stops working"],
  ];
  return (
    <section>
      <h2>Charts the pipeline drew</h2>
      <p className="sub">Written by matplotlib during the run, not by this page.</p>
      {charts.map(([f, title]) => (
        <div className="panel" key={f} style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 14 }}>{title}</h2>
          <img className="chart" src={`/data/${f}`} alt={title} />
        </div>
      ))}
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState("results");
  const holdout = useJson("holdout");
  const decisions = useJson("decisions");
  const baseline = useJson("baseline");
  const explanations = useJson("explanations");

  const tabs = [
    ["results", "Results"],
    ["cost", "Cost"],
    ["curve", "Where it fails"],
    ["queue", "Review queue"],
    ["charts", "Charts"],
  ];

  return (
    <div className="wrap">
      <header>
        <h1>Jaal</h1>
        <p>Finding the fraud between transactions, not inside them.</p>
      </header>
      <div className="defence">
        <strong>Defence only, synthetic data only.</strong> Jaal detects groups of
        accounts run by one person farming a merchant's first-order promo
        discount. Every account record here is synthetic, produced by a test
        fixture, because real promo abuse is unlabelled and there is no other way
        to measure a detector against a known answer. No real identifiers, no
        payment rails, no evasion guidance.
      </div>
      <nav>
        {tabs.map(([k, label]) => (
          <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "results" && <Results holdout={holdout} baseline={baseline} />}
      {tab === "cost" && <Cost decisions={decisions} />}
      {tab === "curve" && <Curve holdout={holdout} />}
      {tab === "queue" && <Queue explanations={explanations} />}
      {tab === "charts" && <Charts />}
    </div>
  );
}
