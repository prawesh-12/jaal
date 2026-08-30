import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const RULES = [
  // Order matters. Strings are matched before comments so a # inside a string
  // is not mistaken for the start of one.
  { kind: "str", re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g },
  { kind: "com", re: /(#[^\n]*|\/\/[^\n]*)/g },
];

function highlight(source) {
  const marks = [];
  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) {
      const start = m.index;
      const end = start + m[0].length;
      if (marks.some((k) => start < k.end && end > k.start)) continue;
      marks.push({ start, end, kind });
    }
  }
  marks.sort((a, b) => a.start - b.start);

  const out = [];
  let at = 0;
  marks.forEach((k, i) => {
    if (k.start > at) out.push({ text: source.slice(at, k.start), kind: null, key: `t${i}` });
    out.push({ text: source.slice(k.start, k.end), kind: k.kind, key: `k${i}` });
    at = k.end;
  });
  if (at < source.length) out.push({ text: source.slice(at), kind: null, key: "tail" });
  return out;
}

export function Code({ language, children, className }) {
  const source = String(children).trim();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused. The text is selectable either way.
      setCopied(false);
    }
  };

  return (
    <figure className={cn("m-0 border border-line bg-sunken", className)}>
      <figcaption className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="label">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="interactive inline-flex items-center gap-2 text-[12px] text-fg-faint hover:text-fg"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "copied" : "copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-[1.7]">
        <code className="ident">
          {highlight(source).map((p) => (
            <span
              key={p.key}
              className={p.kind === "com" ? "text-fg-dim"
                       : p.kind === "str" ? "text-fg-2" : "text-fg-muted"}
            >
              {p.text}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
