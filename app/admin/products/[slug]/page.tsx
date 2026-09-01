import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { ProductEditor } from "@/components/admin/product-editor";

export const dynamic = "force-dynamic";

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [product, brands] = await Promise.all([
    db.product.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        brandId: true,
        deliverySpeed: true,
        category: { select: { slug: true, name: true, group: true, isBulk: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: { id: true, url: true, alt: true, isPrimary: true },
        },
        variants: {
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            sku: true,
            pricePaise: true,
            compareAtPaise: true,
            inventory: {
              select: {
                qtyOnHand: true,
                qtyReserved: true,
                lowStockThreshold: true,
                warehouse: { select: { id: true, name: true, city: true } },
              },
            },
          },
        },
      },
    }),
    /* Only active brands: an inactive one is retired, and assigning a product
       to it would hide the product from the storefront by a side door. */
    db.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!product) notFound();

  /* Tax is read, never written, from the category's owner-confirmed config —
     see the note the editor renders alongside it. */
  const tax = CATEGORY_TAX_CONFIGS[product.category.slug] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/products"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500 no-underline hover:underline"
        >
          ← Products
        </Link>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">{product.title}</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {product.variants.length} variant{product.variants.length === 1 ? "" : "s"} ·{" "}
          {product.category.name}
        </p>
      </div>

      <ProductEditor
        brands={brands}
        product={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          status: product.status,
          brandId: product.brandId,
          categoryName: product.category.name,
          categoryGroup: product.category.group,
          categoryIsBulk: product.category.isBulk,
          deliverySpeed: product.deliverySpeed ?? "",
          hsn: tax?.hsn ?? null,
          gstRatePct: tax?.ratePct ?? null,
          images: product.images,
          variants: product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            pricePaise: v.pricePaise,
            compareAtPaise: v.compareAtPaise,
            onHand: v.inventory.reduce((s, i) => s + (i.qtyOnHand - i.qtyReserved), 0),
            /* Per warehouse, not just the total. The artboard's "Stock by
               warehouse" panel is where a reorder decision gets made, and a
               single number cannot say which shed is empty. */
            stock: v.inventory.map((i) => ({
              warehouseId: i.warehouse.id,
              warehouse: i.warehouse.name,
              city: i.warehouse.city,
              onHand: i.qtyOnHand,
              committed: i.qtyReserved,
              lowStockThreshold: i.lowStockThreshold,
            })),
          })),
        }}
      />
    </div>
  );
}
