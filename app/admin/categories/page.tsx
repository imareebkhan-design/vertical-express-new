import type { Metadata } from "next";
import { db } from "@/lib/db";
import { OpsScreen } from "@/components/admin/ops-screen";
import { CategoriesManager, type CategoryGroupKey } from "@/components/admin/categories-manager";
import { getAdminUser } from "@/lib/services/admin/authz";
import { adminListCategories } from "@/lib/services/admin/categories";
import { publicProductWhere } from "@/lib/catalog-policy";
import { adminSaveCategory } from "@/actions/categories";

export const metadata: Metadata = {
  title: "Categories | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCategories() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const [rows, visible] = await Promise.all([
    adminListCategories(),
    /* "In the shop" uses the storefront's own rule, so the number an operator
       sees is the number a switch-off would hide. */
    db.product.groupBy({ by: ["categoryId"], where: publicProductWhere(), _count: { _all: true } }),
  ]);
  const visibleBy = new Map(visible.map((v) => [v.categoryId, v._count._all]));

  return (
    <OpsScreen
      title="Categories"
      intro="How the shop is arranged. A new category can be browsed straight away; nothing in it can be sold until its HSN and GST rate are confirmed and set up."
    >
      <CategoriesManager
        save={adminSaveCategory}
        categories={rows.map((c) => ({
          slug: c.slug,
          name: c.name,
          group: c.group as CategoryGroupKey,
          description: c.description,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          seoTitle: c.seoTitle,
          seoDescription: c.seoDescription,
          productCount: c.productCount,
          visibleCount: visibleBy.get(c.id) ?? 0,
          hasTaxMapping: c.hasTaxMapping,
        }))}
      />
    </OpsScreen>
  );
}
