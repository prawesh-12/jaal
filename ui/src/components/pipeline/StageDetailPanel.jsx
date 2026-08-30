import { dp4 } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StageDetailPanel({ stage, index, total }) {
  return (
    <div key={stage.id} className="scene-fade">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tnum text-[12px] text-fg-dim">
            {String(index + 1).padStart(2, "0")} of {String(total).padStart(2, "0")}
          </span>
          <h3 className="t-sub">{stage.name}</h3>
        </div>
        <p className="t-body mt-3 max-w-[68ch]">{stage.what}</p>

        <dl className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-3">
          <Cell label="Input">
            {stage.input ? (
              <>
                <Figure>{stage.input.display}</Figure>
                <Sub>{stage.input.label}</Sub>
              </>
            ) : (
              <Sub>the batch itself</Sub>
            )}
          </Cell>
          <Cell label="Process">
            <p className="mt-1 text-[13.5px] leading-[1.55] text-fg-2">{stage.process}</p>
          </Cell>
          <Cell label="Output" emphasis>
            <Figure emphasis>{stage.output.display}</Figure>
            <Sub>{stage.output.label}</Sub>
          </Cell>
        </dl>

        {stage.facts?.length > 0 && (
          <dl className="mt-8 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {stage.facts.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
                <dt className="text-[13px] text-fg-muted">{k}</dt>
                <dd className="tnum text-[13.5px] text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {stage.rules && (
          <div className="mt-8">
            <h4 className="label">Blocking rules, and what each reaches alone</h4>
            <ul className="mt-3 grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {stage.rules.map((r) => (
                <li
                  key={r.rule}
                  className="flex items-baseline justify-between gap-4 border-b border-line pb-2"
                >
                  <span className="ident text-[12.5px] text-fg-muted">{r.rule}</span>
                  <span
                    className={cn("tnum text-[13px]",
                                  r.recall >= 0.5 ? "text-fg" : "text-fg-faint")}
                  >
                    {dp4(r.recall)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stage.note && (
          <p className="mt-8 max-w-[76ch] border-t border-line pt-4 text-[12.5px] leading-[1.65] text-fg-faint">
            {stage.note}
          </p>
        )}
    </div>
  );
}

function Cell({ label, children, emphasis = false }) {
  return (
    <div className={cn("px-5 py-4", emphasis ? "bg-raised" : "bg-surface")}>
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Figure({ children, emphasis = false }) {
  return (
    <div
      className={cn(
        "tnum mt-2.5 leading-none font-medium tracking-[-0.02em]",
        emphasis ? "text-[26px] text-fg" : "text-[22px] text-fg-2"
      )}
    >
      {children}
    </div>
  );
}

function Sub({ children }) {
  return <div className="mt-2 text-[12.5px] text-fg-faint">{children}</div>;
}
