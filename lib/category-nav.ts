/**
 * Site navigation, derived from the category directory.
 *
 * The navbar, footer and the phone home's quantity helpers used to carry their
 * own lists of category links. Every other surface reads the directory
 * (lib/category-directory.ts), so switching a category off hid it everywhere
 * except those links, which then led to a 404 (ISS-102). They now read this
 * model, built from the same directory, so they cannot list a category the shop
 * does not show.
 *
 * Only the primary departments appear in the navigation: the navbar and footer
 * never carried the secondary "Tools & Equipment" group, and adding a top-level
 * entry is a design change. `slugs` covers every shown category, secondary
 * included, for callers that only need to know whether a link would open.
 *
 * Pure and serializable: built on the server, passed to client components.
 */
import { PRIMARY_GROUPS, type DirectoryGroup } from "@/lib/category-directory";

export interface NavItem {
  slug: string;
  label: string;
  href: string;
}

export interface NavDepartment {
  key: string;
  /** The department's short title, as the navbar shows it. */
  label: string;
  href: string;
  items: NavItem[];
}

export interface CategoryNav {
  departments: NavDepartment[];
  /** Every category the directory shows, in display order. */
  slugs: string[];
}

export const EMPTY_CATEGORY_NAV: CategoryNav = { departments: [], slugs: [] };

const categoryHref = (slug: string) => `/category/${slug}`;

export function buildCategoryNav(groups: readonly DirectoryGroup[]): CategoryNav {
  const departments = groups
    .filter((g) => g.primary && g.categories.length > 0)
    .map((g): NavDepartment => {
      const landing = PRIMARY_GROUPS.find((p) => p.key === g.key)?.landing;
      const target = g.categories.find((c) => c.slug === landing) ?? g.categories[0];
      return {
        key: g.key,
        label: g.shortTitle,
        href: categoryHref(target.slug),
        items: g.categories.map((c) => ({ slug: c.slug, label: c.name, href: categoryHref(c.slug) })),
      };
    });
  return { departments, slugs: groups.flatMap((g) => g.categories.map((c) => c.slug)) };
}

/** A link's category slug, when it opens a category page; otherwise null. */
export function categorySlugOf(href: string): string | null {
  const m = /^\/category\/([a-z0-9-]+)(?:[?#]|$)/.exec(href);
  return m ? m[1] : null;
}

/**
 * Merchandising (the home hero carousel) whose every category link is shown.
 *
 * A banner advertises its categories in its copy ("Tiles, paint, plywood and
 * bath fittings"), not only in its buttons, so a banner with any hidden
 * category is dropped whole rather than left promising a shelf customers
 * cannot reach. Banners that link to no category (the launch banner opens
 * /categories) always stay.
 */
export function withShownCategoryLinks<T extends { primary: { href: string }; secondary?: { href: string } }>(
  items: readonly T[],
  slugs: readonly string[],
): T[] {
  const shown = new Set(slugs);
  return items.filter((item) =>
    [item.primary, item.secondary].every((link) => {
      const slug = link ? categorySlugOf(link.href) : null;
      return slug === null || shown.has(slug);
    }),
  );
}
