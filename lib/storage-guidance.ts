/**
 * How to keep a material until it is used — the PDP's storage line.
 *
 * WHY THIS IS A SHORT LIST AND NOT A SENTENCE PER CATEGORY
 *
 * Storage advice is a product fact, not a business rule, so it does not need
 * the owner's sign-off the way a price or a return window does. But it is still
 * a claim printed next to something somebody is about to build with, and a
 * plausible-sounding line invented for a category nobody checked is the same
 * failure as an invented delivery time wearing safer clothes.
 *
 * So this covers only materials where the guidance is established, specific and
 * consequential — cement genuinely spoils, cured adhesive genuinely will not
 * bond, a warped board genuinely will not sit flat. Everything else returns
 * null and the row is simply absent. An absent row costs a customer nothing; a
 * wrong one costs them a slab.
 *
 * Keyed by category slug, matching CATEGORY_TAX_CONFIGS. Adding a category here
 * should mean somebody knows the material, not that the list looked short.
 */
export interface StorageGuidance {
  title: string;
  detail: string;
}

const BY_CATEGORY: Record<string, StorageGuidance> = {
  cement: {
    title: "Store it dry and off the floor",
    detail:
      "Cement takes moisture out of the air even through an unopened bag. Keep it covered, " +
      "raised off a concrete floor, and use it within the shelf life printed on the bag.",
  },
  tiling: {
    title: "Keep the bags sealed and dry",
    detail:
      "Adhesives and grouts are cement-based and go off the same way. A bag that has hardened " +
      "in storage will not bond, however it looks on the outside.",
  },
  waterproofing: {
    title: "Keep it sealed and out of frost",
    detail:
      "Once a pail has been opened the contents start to skin over, and a coating that has " +
      "frozen will not cure properly afterwards.",
  },
  fevicol: {
    title: "Close it tightly after use",
    detail: "Adhesive that has cured in the tub cannot be recovered by thinning it.",
  },
};

/** Storage guidance for a category, or null when we have nothing reliable to say. */
export function storageGuidanceFor(categorySlug: string): StorageGuidance | null {
  return BY_CATEGORY[categorySlug] ?? null;
}
