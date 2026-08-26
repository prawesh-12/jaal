// Money is rupees, always shown in the Indian grouping. Never rounded away.
const inr = (n) => Math.abs(Math.round(n)).toLocaleString("en-IN");

export const signedRupees = (n) => (n < 0 ? "-" : "+") + "₹" + inr(n);
export const rupees = (n) => "₹" + inr(n);

export function compactRupees(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return sign + "₹" + inr(a);
}

export const count = (n) => Number(n).toLocaleString("en-IN");
export const pct = (n, dp = 1) => `${(n * 100).toFixed(dp)}%`;
export const dp4 = (n) => Number(n).toFixed(4);
export const dp2 = (n) => Number(n).toFixed(2);

// Nothing blocked means precision is 0 of 0. That is undefined, not zero.
export const isUndefinedPrecision = (p) => p === null || p === undefined;

export const TIERS = ["obvious", "moderate", "sophisticated", "adaptive"];

export const TIER_COLOR = {
  obvious: "var(--color-tier-obvious)",
  moderate: "var(--color-tier-moderate)",
  sophisticated: "var(--color-tier-sophisticated)",
  adaptive: "var(--color-tier-adaptive)",
};

/*
  The only four hues anything is allowed to draw with. They were checked with
  the palette validator against the surface colour, so adjacent pairs stay
  apart under simulated protanopia and deuteranopia.
*/
export const MARK = {
  ok: "var(--color-ok)",
  info: "var(--color-info)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  neutral: "var(--color-fg-faint)",
};
