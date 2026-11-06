import type { Metadata } from "next";
import { db } from "@/lib/db";
import { OpsScreen } from "@/components/admin/ops-screen";
import { BrandsManager } from "@/components/admin/brands-manager";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Brands | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminBrands() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const rows = await db.brand.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { slug: true, name: true, isActive: true, _count: { select: { products: true } } },
  });

  return (
    <OpsScreen
      title="Brands"
      intro="What a product page says it is. Only list brands you actually stock — a customer reads this as a statement about what is in the bag."
    >
      <BrandsManager
        brands={rows.map((b) => ({
          slug: b.slug,
          name: b.name,
          isActive: b.isActive,
          productCount: b._count.products,
        }))}
      />
    </OpsScreen>
  );
}
