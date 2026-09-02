/** All money is stored as integer paise (₹1 = 100 paise). */

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Format paise as an INR display string, e.g. 249900 -> "₹2,499". */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const hasFraction = paise % 100 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Percentage discount between compare-at and price, rounded. */
export function discountPercent(pricePaise: number, compareAtPaise?: number | null): number | null {
  if (!compareAtPaise || compareAtPaise <= pricePaise) return null;
  return Math.round(((compareAtPaise - pricePaise) / compareAtPaise) * 100);
}

/**
 * A rupee amount typed by a person, as integer paise. Null when it is not a
 * valid amount.
 *
 * `rupeesToPaise(Number(input))` is the obvious thing and it is wrong here in
 * three ways. `Number("")` is 0, so an empty field silently becomes free.
 * `Number("12abc")` is NaN, which `Math.round` passes straight through into a
 * money column. And `Number("1e3")` is 1000, so a typo in exponent notation
 * becomes a thousand rupees.
 *
 * So the string is matched, not coerced, and the paise are assembled from the
 * digits directly — no float multiply, so no drift to reason about. "1234.5"
 * is 123450 paise exactly, by construction rather than by rounding.
 *
 * Anything beyond two decimal places is rejected rather than rounded: a person
 * typing three decimals into a rupee field has made a mistake, and quietly
 * picking one of the two nearby answers for them is how a wrong price ships.
 */
export function parseRupeeInput(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "") return null;

  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!m) return null;

  const rupees = Number(m[1]);
  const paise = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return rupees * 100 + paise;
}
