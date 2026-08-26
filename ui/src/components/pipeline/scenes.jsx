import { count, dp2, rupees } from "@/lib/format";

/*
  One SVG scene per pipeline stage. Each shows the same three things the
  detail panel names in words: what goes in, what happens to it, what comes
  out. A scene plays once when its stage becomes current and then holds.
  Nothing loops.

  The reveals are CSS animations rather than JS ones. animation-fill-mode
  guarantees the finished state, so a stalled frame loop or a slow device
  leaves the diagram fully drawn instead of blank. That matters more here than
  anywhere else on the site, because this diagram is the explanation.

  Node positions are illustrative. Every figure printed is from the stage
  model, which reads the results files.
*/

const W = 900;
const H = 250;
const INK = "var(--color-fg-faint)";
const LINE = "var(--color-line-strong)";
const ACCENT = "var(--color-accent)";

/* Delay in ms, handed to the CSS keyframes through a custom property. */
const at = (ms) => ({ "--d": `${ms}ms` });

function Scene({ children, label }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  );
}

function Caption({ x, y, children, anchor = "middle", tone = INK, size = 11, delay = 0 }) {
  return (
    <text
      x={x} y={y} textAnchor={anchor} fontSize={size} fill={tone}
      fontFamily="var(--font-sans)" className="scene-fade" style={at(delay)}
    >
      {children}
    </text>
  );
}

function Figure({ x, y, children, anchor = "middle", size = 15, delay = 0 }) {
  return (
    <text
      x={x} y={y} textAnchor={anchor} fontSize={size} fill="var(--color-fg)"
      fontFamily="var(--font-sans)" className="scene-fade" style={at(delay)}
      // eslint-disable-next-line react/forbid-dom-props
      dominantBaseline="auto"
    >
      {children}
    </text>
  );
}

/* Deterministic grid, so the same stage always draws the same figure. */
function grid(n, x0, y0, w, h, cols) {
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => [
    x0 + (i % cols) * (w / Math.max(1, cols - 1)),
    y0 + Math.floor(i / cols) * (h / Math.max(1, rows - 1)),
  ]);
}

/* A labelled result, to the right of every scene. */
function Outcome({ x, label, value, sub, delay }) {
  return (
    <g>
      <line x1={x} y1="58" x2={x} y2="196" stroke={LINE} strokeWidth="1"
            className="scene-fade" style={at(delay)} />
      <Caption x={x + 26} y={104} anchor="start" delay={delay}>{label}</Caption>
      <Figure x={x + 26} y={138} anchor="start" size={26} delay={delay + 60}>{value}</Figure>
      {sub && (
        <Caption x={x + 26} y={164} anchor="start" tone="var(--color-fg-2)"
                 delay={delay + 120}>
          {sub}
        </Caption>
      )}
    </g>
  );
}

/* 01 INPUT ---------------------------------------------------------------- */

export function InputScene({ stage }) {
  const nodes = grid(40, 90, 62, 250, 132, 8);
  return (
    <Scene label={`${count(stage.output.value)} accounts entering the pipeline`}>
      <Caption x={215} y={42}>a batch of accounts</Caption>
      {nodes.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="7" height="7" rx="1" fill={INK}
              opacity="0.8" className="scene-in" style={at((i % 8) * 32)} />
      ))}
      <line x1="378" y1="128" x2="520" y2="128" stroke={LINE} strokeWidth="1"
            pathLength="1" className="scene-draw" style={at(260)} />
      <path d="M520 124 L527 128 L520 132 Z" fill={LINE}
            className="scene-fade" style={at(600)} />
      <Outcome x={578} label="into the pipeline" value={stage.output.display}
               sub={stage.output.label} delay={620} />
    </Scene>
  );
}

/* 02 BLOCK ---------------------------------------------------------------- */

export function BlockScene({ stage }) {
  const left = Array.from({ length: 22 }, (_, i) => [70 + (i % 2) * 16, 58 + i * 6.4]);
  const right = Array.from({ length: 22 }, (_, i) => [300 - (i % 2) * 16, 58 + i * 6.4]);
  // Which lines survive is fixed, not random, so a replay draws the same picture.
  const kept = new Set([2, 7, 11, 18]);

  return (
    <Scene label="Most possible pairs are filtered out by the blocking rules">
      <Caption x={185} y={38}>{stage.input.display} {stage.input.label}</Caption>

      {left.map(([x1, y1], i) => {
        const [x2, y2] = right[(i * 7) % right.length];
        const survives = kept.has(i);
        return (
          <line
            key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={survives ? ACCENT : LINE}
            strokeWidth={survives ? 1.1 : 0.6}
            opacity={survives ? 0.9 : 0.1}
            pathLength="1"
            className="scene-draw"
            style={at(survives ? 700 : 80 + (i % 8) * 24)}
          />
        );
      })}

      {[...left, ...right].map(([x, y], i) => (
        <rect key={i} x={x - 3} y={y - 3} width="6" height="6" rx="1"
              fill={INK} opacity="0.6" className="scene-fade" style={at(i * 8)} />
      ))}

      <g className="scene-fade" style={at(1000)}>
        <line x1="418" y1="58" x2="418" y2="196" stroke={LINE} strokeWidth="1" />
        <Caption x={444} y={92} anchor="start" delay={1000}>{stage.process}</Caption>
        <Figure x={444} y={126} anchor="start" size={24} delay={1060}>
          {stage.output.display}
        </Figure>
        <Caption x={444} y={150} anchor="start" delay={1060}>{stage.output.label}</Caption>
        <Caption x={444} y={176} anchor="start" tone="var(--color-fg-2)" delay={1120}>
          search space cut by {stage.facts[0][1]}
        </Caption>
      </g>
    </Scene>
  );
}

/* 03 LINK ----------------------------------------------------------------- */

export function LinkScene({ stage }) {
  const shown = stage.weights.slice(0, 7);
  const threshold = stage.output.value;
  const running = shown.reduce((acc, w, i) => {
    acc.push((acc[i - 1] ?? 0) + w.bits);
    return acc;
  }, []);
  const total = running[running.length - 1];
  const scale = (v) => 118 + (v / Math.max(total, threshold)) * 380;

  return (
    <Scene label="Evidence accumulating field by field until an edge is drawn">
      <Caption x={60} y={34} anchor="start">
        one candidate pair, evidence added one field at a time
      </Caption>

      {shown.map((w, i) => {
        const y = 60 + i * 23;
        const from = i === 0 ? 118 : scale(running[i - 1]);
        const to = scale(running[i]);
        return (
          <g key={`${w.field}-${w.level}`}>
            <Caption x={112} y={y + 4} anchor="end" size={10.5} delay={100 + i * 120}>
              {w.field}
            </Caption>
            <rect
              x={from} y={y - 4} width={Math.max(to - from, 1)} height="8"
              fill={ACCENT} opacity="0.85"
              className="scene-grow" style={at(140 + i * 120)}
            />
            <text
              x={to + 8} y={y + 4} fontSize="10.5" fill="var(--color-fg-2)"
              fontFamily="var(--font-sans)" className="scene-fade"
              style={at(240 + i * 120)}
            >
              +{w.bits.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* The line an edge has to clear. */}
      <line x1={scale(threshold)} y1="46" x2={scale(threshold)} y2="222"
            stroke="var(--color-fg-faint)" strokeWidth="1" strokeDasharray="3 3" />
      <Caption x={scale(threshold)} y={238} size={10}>
        edge at {dp2(threshold)} bits
      </Caption>

      <Outcome
        x={640}
        label="total evidence"
        value={`+${total.toFixed(2)} bits`}
        sub={total >= threshold ? "an edge is drawn" : "no edge"}
        delay={140 + shown.length * 120}
      />
    </Scene>
  );
}

/* 04 CLUSTER -------------------------------------------------------------- */

export function ClusterScene({ stage }) {
  const groupA = [[120, 86], [180, 58], [232, 100], [186, 144], [124, 138]];
  const groupB = [[360, 74], [418, 112], [352, 146]];
  const loose = [[290, 186], [462, 60]];

  const edges = (g) =>
    g.flatMap(([x1, y1], i) =>
      g.slice(i + 1).map(([x2, y2], j) => ({ x1, y1, x2, y2, key: `${i}-${j}` })));
  const all = [...edges(groupA), ...edges(groupB)];

  return (
    <Scene label="Edges resolve into clusters, and weak links fall away">
      <Caption x={60} y={34} anchor="start">
        {stage.input.display} {stage.input.label}
      </Caption>

      {all.map((e, i) => (
        <line
          key={e.key + i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke={ACCENT} strokeWidth="1" opacity="0.55" pathLength="1"
          className="scene-draw" style={at(80 + i * 32)}
        />
      ))}

      {/* Below the threshold, so it never becomes an edge. */}
      <line x1="232" y1="100" x2="352" y2="146" stroke={LINE} strokeWidth="1"
            strokeDasharray="3 4" opacity="0.18" />

      {[...groupA, ...groupB, ...loose].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill={INK} opacity="0.9"
                className="scene-fade" style={at(i * 34)} />
      ))}

      <Outcome
        x={548}
        label={stage.process}
        value={stage.output.display}
        sub={`${stage.output.label}, ${stage.facts[2][1]} groups too small to keep`}
        delay={1000}
      />
    </Scene>
  );
}

/* 05 FEATURES ------------------------------------------------------------- */

export function FeaturesScene({ stage }) {
  const top = Math.max(...stage.features.map((f) => f.value));

  return (
    <Scene label="A cluster becomes a row of feature values">
      <Caption x={60} y={34} anchor="start">one cluster, measured</Caption>

      <rect x="60" y="56" width="70" height="70" rx="2" fill="none"
            stroke={LINE} strokeWidth="1" className="scene-fade" style={at(0)} />
      {grid(9, 74, 70, 42, 42, 3).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill={INK} opacity="0.75"
                className="scene-fade" style={at(i * 24)} />
      ))}
      <line x1="138" y1="91" x2="176" y2="91" stroke={LINE} strokeWidth="1"
            pathLength="1" className="scene-draw" style={at(240)} />
      <path d="M176 87 L183 91 L176 95 Z" fill={LINE}
            className="scene-fade" style={at(500)} />

      {stage.features.map((f, i) => {
        const y = 58 + i * 26;
        return (
          <g key={f.name}>
            <text
              x="200" y={y + 4} fontSize="11" fill="var(--color-fg-2)"
              fontFamily="var(--font-mono)" className="scene-in"
              style={at(300 + i * 100)}
            >
              {f.name}
            </text>
            <rect
              x="430" y={y - 4} width={(f.value / top) * 180} height="7" rx="1"
              fill={ACCENT} opacity="0.8" className="scene-grow"
              style={at(340 + i * 100)}
            />
          </g>
        );
      })}

      <Outcome x={660} label="per cluster" value={stage.output.display}
               sub={stage.output.label} delay={900} />
    </Scene>
  );
}

/* 06 SCORE ---------------------------------------------------------------- */

export function ScoreScene({ stage }) {
  const rows = [70, 100, 128, 156, 186];

  return (
    <Scene label="Feature values converge into one calibrated probability">
      <Caption x={60} y={36} anchor="start">
        {stage.input.display} {stage.input.label}
      </Caption>

      {rows.map((y, i) => (
        <g key={y}>
          <rect x="60" y={y - 5} width="86" height="10" rx="1" fill={INK}
                opacity="0.35" className="scene-fade" style={at(i * 60)} />
          <path
            d={`M 152 ${y} C 250 ${y}, 300 128, 392 128`}
            stroke={ACCENT} strokeWidth="1" fill="none" opacity="0.6"
            pathLength="1" className="scene-draw" style={at(120 + i * 70)}
          />
        </g>
      ))}

      <g className="scene-fade" style={at(620)}>
        <rect x="396" y="106" width="170" height="44" rx="3"
              fill="var(--color-raised)" stroke="var(--color-line-loud)" strokeWidth="1" />
        <Caption x={481} y={133} tone="var(--color-fg)" delay={620}>
          calibrated probability
        </Caption>
      </g>
      {/* Under the box, not inside it: the sentence is wider than the box. */}
      <Caption x={481} y={176} tone="var(--color-fg-2)" size={10.5} delay={680}>
        {stage.process}
      </Caption>

      <line x1="572" y1="128" x2="612" y2="128" stroke={LINE} strokeWidth="1"
            pathLength="1" className="scene-draw" style={at(760)} />
      <path d="M612 124 L619 128 L612 132 Z" fill={LINE}
            className="scene-fade" style={at(900)} />

      <Outcome x={652} label={stage.output.label} value={stage.output.display}
               delay={900} />
    </Scene>
  );
}

/* 07 DECIDE --------------------------------------------------------------- */

export function DecideScene({ stage }) {
  // One action is taken per cluster. Review is what this system does most, and
  // is the action the whole project argues for, so it is the one that resolves.
  const chosen = "review";
  const y = { block: 74, review: 128, allow: 182 };

  return (
    <Scene label="Three actions are priced and the cheapest is taken">
      <Caption x={60} y={38} anchor="start">one scored cluster</Caption>
      <rect x="60" y="108" width="92" height="40" rx="2" fill="var(--color-raised)"
            stroke={LINE} strokeWidth="1" className="scene-fade" style={at(0)} />
      <Caption x={106} y={132} tone="var(--color-fg-2)" delay={60}>probability</Caption>

      {stage.actions.map((a, i) => {
        const on = a.name === chosen;
        return (
          <g key={a.name}>
            <path
              d={`M 158 128 C 240 128, 260 ${y[a.name]}, 334 ${y[a.name]}`}
              stroke={on ? ACCENT : LINE} strokeWidth={on ? 1.4 : 1} fill="none"
              opacity={on ? 0.95 : 0.3} pathLength="1"
              className="scene-draw" style={at(120 + i * 90)}
            />
            <g className="scene-fade" style={at(500 + i * 90)}>
              <rect
                x="338" y={y[a.name] - 20} width="210" height="40" rx="3"
                fill={on ? "var(--color-active)" : "var(--color-surface)"}
                stroke={on ? "var(--color-line-loud)" : "var(--color-line)"}
                strokeWidth="1"
              />
              <rect x="338" y={y[a.name] - 20} width="2" height="40"
                    fill={`var(--color-${a.tone})`} opacity={on ? 1 : 0.45} />
              <text x={358} y={y[a.name] + 4} fontSize="12.5"
                    fill={on ? "var(--color-fg)" : "var(--color-fg-faint)"}
                    fontFamily="var(--font-sans)">
                {a.name}
              </text>
              <text x={530} y={y[a.name] + 4} textAnchor="end" fontSize="12.5"
                    fill={on ? "var(--color-fg-2)" : "var(--color-fg-faint)"}
                    fontFamily="var(--font-sans)"
                    style={{ fontVariantNumeric: "tabular-nums lining-nums" }}>
                {rupees(a.price)}
              </text>
            </g>
          </g>
        );
      })}

      <Caption x={443} y={224} tone="var(--color-fg-faint)" size={10.5} delay={860}>
        the price of getting this one wrong
      </Caption>

      <Outcome x={604} label="cheapest action wins" value={chosen}
               sub="for this cluster" delay={880} />
    </Scene>
  );
}

export const SCENES = {
  input: InputScene,
  block: BlockScene,
  link: LinkScene,
  cluster: ClusterScene,
  features: FeaturesScene,
  score: ScoreScene,
  decide: DecideScene,
};
