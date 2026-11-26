/**
 * The web-address form of a brand or category name, decided in one place so the
 * Brands page, the Categories page and the product form's quick-add cannot
 * disagree: lowercase letters and digits joined by single hyphens.
 */
export function taxonomySlug(name: string, max = 60): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export const brandSlug = (name: string) => taxonomySlug(name);
export const categorySlug = (name: string) => taxonomySlug(name);
