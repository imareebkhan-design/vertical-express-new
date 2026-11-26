/**
 * How a listing renders is a property of the category, not of the app.
 *
 * Owner-approved rule (25 Aug 2026):
 *
 *   SPEC-DRIVEN   → one-column dense rows. The buyer already knows what they
 *                   want and is comparing numbers: brand, grade, pack, price,
 *                   MRP, speed and a stepper all have to be readable at once,
 *                   which does not fit a 170px card.
 *
 *   APPEARANCE-DRIVEN → two-column visual grid, image-forward, minimal text.
 *                   The image is the spec. Nobody picks a tile off a text row.
 *
 * Categories not listed fall back to the grid, which is the safer default for an
 * unknown product type.
 */

/** Category slugs whose buyers compare numbers rather than looks. */
const SPEC_DRIVEN = new Set([
  "cement",
  "fevicol", // adhesives & sealants
  "waterproofing",
  "wires-mcb-distribution-boards",
  "conduits-gi-boxes",
  "plywood-mdf-hdhmr",
  "general-hardware-tools",
  "cpvc-pipes-overhead-tanks",
]);

export type ListingLayout = "rows" | "grid";

export function listingLayoutFor(categorySlug: string | null | undefined): ListingLayout {
  if (!categorySlug) return "grid";
  return SPEC_DRIVEN.has(categorySlug) ? "rows" : "grid";
}
