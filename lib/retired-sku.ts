/**
 * Item codes of packs retired by the one-time catalogue reset.
 *
 * The reset (lib/services/admin/catalogue-reset.ts) frees a retired pack's item
 * code for the same real product to be listed again, by appending
 * `--LEGACY-YYYYMMDD`. An order line points at that pack by id and does not keep
 * its own copy of the code, so every historical record that shows a code — the
 * order, the packing slip and pick list, the stock ledger — reads it through
 * here and shows the code the customer actually bought.
 *
 * Pure and client-safe. The suffix is written only by the reset, from
 * `retiredSku` below, so reading it back is exact.
 */
const RETIRED = /^(.+)--LEGACY-(\d{4})(\d{2})(\d{2})$/;

/** The code a retired pack is given. `cutoff` is the reset's cutoff. */
export function retiredSku(sku: string, cutoff: Date): string {
  return `${sku}--LEGACY-${cutoff.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/** The code as it was when the pack was sold, and when it was retired (YYYY-MM-DD), if it was. */
export function purchasedSku(sku: string): { code: string; retiredOn: string | null } {
  const m = RETIRED.exec(sku);
  return m ? { code: m[1], retiredOn: `${m[2]}-${m[3]}-${m[4]}` } : { code: sku, retiredOn: null };
}

/** For operator lists: the original code, marked when its listing has been retired. */
export function skuForDisplay(sku: string): string {
  const p = purchasedSku(sku);
  return p.retiredOn ? `${p.code} (retired listing)` : p.code;
}
