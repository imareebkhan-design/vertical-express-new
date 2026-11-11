import "server-only";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { orderingOpen } from "@/lib/commerce-mode";
import { strictCatalogue } from "@/lib/deploy-env";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { explainProducts } from "@/lib/services/catalog-state";
import { buildLaunchTree, LAUNCH_CATEGORY_LIMIT, type LaunchCategoryRow, type LaunchDepartment } from "@/lib/launch-control";
import type { CatalogState } from "@/lib/catalog-explain";

/**
 * Launch Control, read side. Read-only: nothing here writes, and nothing here
 * decides what customers see — counts use the storefront's own filter and
 * category states come from the category directory (lib/launch-control.ts).
 */

export interface LaunchOverview {
  orderingOpen: boolean;
  strict: boolean;
  departments: LaunchDepartment[];
  totals: {
    categories: number;
    categoriesReachable: number;
    products: number;
    /** Products the storefront lists. */
    visible: number;
    /** Of those, published (the rest are catalogue-only enquiries). */
    visiblePublished: number;
  };
}

export async function getLaunchOverview(): Promise<LaunchOverview> {
  const [categories, byStatus, visible, visiblePublished] = await Promise.all([
    db.category.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, group: true, isActive: true } }),
    db.product.groupBy({ by: ["categoryId", "status"], _count: { _all: true } }),
    db.product.groupBy({ by: ["categoryId"], where: catalogListingWhere(), _count: { _all: true } }),
    db.product.count({ where: { AND: [catalogListingWhere(), { status: "published" }] } }),
  ]);
  const visibleBy = new Map(visible.map((v) => [v.categoryId, v._count._all]));
  const rows: LaunchCategoryRow[] = categories.map((c) => {
    const statuses: LaunchCategoryRow["byStatus"] = {};
    for (const s of byStatus) if (s.categoryId === c.id) statuses[s.status] = s._count._all;
    return {
      slug: c.slug, name: c.name, group: String(c.group), isActive: c.isActive,
      visible: visibleBy.get(c.id) ?? 0, byStatus: statuses, hasTaxMapping: Boolean(CATEGORY_TAX_CONFIGS[c.slug]),
    };
  });
  const departments = buildLaunchTree(rows);
  const all = departments.flatMap((d) => d.categories).filter((c) => c.state !== "missing");
  return {
    orderingOpen: orderingOpen(),
    strict: strictCatalogue(),
    departments,
    totals: {
      categories: all.length,
      categoriesReachable: departments.reduce((n, d) => n + d.reachable, 0),
      products: byStatus.reduce((n, s) => n + s._count._all, 0),
      visible: visible.reduce((n, v) => n + v._count._all, 0),
      visiblePublished,
    },
  };
}


export interface LaunchProductRow {
  id: string;
  slug: string;
  title: string;
  brand: { name: string; isActive: boolean };
  status: "draft" | "catalog_only" | "published" | "archived";
  state: CatalogState;
}

export interface LaunchCategoryView {
  slug: string;
  name: string;
  isActive: boolean;
  /** Every product in the category; `products` holds at most LAUNCH_CATEGORY_LIMIT of them. */
  total: number;
  products: LaunchProductRow[];
}

export async function getLaunchCategory(slug: string): Promise<LaunchCategoryView | null> {
  const category = await db.category.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, isActive: true } });
  if (!category) return null;
  const [total, products] = await Promise.all([
    db.product.count({ where: { categoryId: category.id } }),
    db.product.findMany({
      where: { categoryId: category.id },
      // Archived last: they are the least likely to be what someone is looking for.
      orderBy: [{ status: "asc" }, { title: "asc" }],
      take: LAUNCH_CATEGORY_LIMIT,
      select: { id: true, slug: true, title: true, status: true, brand: { select: { name: true, isActive: true } } },
    }),
  ]);
  const states = await explainProducts(products.map((p) => p.id));
  return {
    ...category,
    total,
    products: products.flatMap((p) => {
      const state = states.get(p.id);
      return state ? [{ ...p, state }] : [];
    }),
  };
}
