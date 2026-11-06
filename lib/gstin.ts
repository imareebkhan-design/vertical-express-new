/**
 * The customer's own GSTIN — the buyer's registration, not ours.
 *
 * Pure so the API and its tests share one rule. A GSTIN is 15 characters:
 * two-digit state code, the holder's PAN, an entity number, the letter Z and
 * a check character computed from the first fourteen (GSTN's published
 * mod-36 scheme). Checking the check character catches the typo a pattern
 * cannot — one wrong digit on a tax identifier is a wrong invoice.
 */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normaliseGstin(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]!);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36]!;
}

export function isValidGstin(raw: string): boolean {
  const g = normaliseGstin(raw);
  if (!GSTIN_SHAPE.test(g)) return false;
  const state = Number(g.slice(0, 2));
  if (state < 1 || state > 38) return false;
  return gstinCheckChar(g.slice(0, 14)) === g[14];
}
