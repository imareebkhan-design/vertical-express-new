import type { Metadata } from "next";
import { db } from "@/lib/db";
import { OpsScreen } from "@/components/admin/ops-screen";
import { BrandsManager } from "@/components/admin/brands-manager";

export const metadata: Metadata = {
  title: "Brands | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminBrands() {
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
