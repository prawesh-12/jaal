/*
  The bits each field agreement is worth, straight out of results/link_params.json.
  log2(m / u) is exactly what detector/link.py computes, and the numbers it reads
  are the fitted ones, not a re-estimate.
*/

export const SCORED = ["device", "address", "pincode", "card_bin", "ip_prefix",
                       "signup_gap", "hour_of_day", "order_count", "coupon_used"];

export const bitsFor = (params, field, level) =>
  Math.log2(params.m[field][level] / params.u[field][level]);

export function agreementWeights(params) {
  const out = [];
  for (const field of SCORED) {
    params.levels[field].forEach((level, i) => {
      const v = bitsFor(params, field, i);
      if (level !== "no" && v > 0) out.push({ field, level, bits: v });
    });
  }
  return out.sort((a, b) => b.bits - a.bits);
}
