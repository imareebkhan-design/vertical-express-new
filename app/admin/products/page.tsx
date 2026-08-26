import Link from "next/link";
import { adminListProducts } from "@/lib/services/admin/manage";
import { formatPaise } from "@/lib/money";
import { ProductStatusChip, StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const { products, total } = await adminListProducts();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Products</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">{total} products</p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-card">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Product</th>
              <th className="px-3 pb-2.5">Brand</th>
              <th className="px-3 pb-2.5">Category</th>
              <th className="px-3 pb-2.5 text-right">Price</th>
              <th className="px-3 pb-2.5 text-right">Stock</th>
              <th className="px-3 pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const variant = p.variants[0];
              const stock =
                variant?.inventory.reduce((s, i) => s + (i.qtyOnHand - i.qtyReserved), 0) ?? 0;
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-3">
                    <Link
                      href={`/product/${p.slug}`}
                      className="text-[12.5px] font-bold hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-[11px] font-semibold tabular-nums text-ink-500">
                      {variant?.sku ?? "no default variant"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[12px] font-semibold">{p.brand.name}</td>
                  <td className="px-3 py-3 text-[12px] font-semibold text-ink-500">
                    {p.category.name}
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                    {variant ? formatPaise(variant.pricePaise) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {stock <= 0 ? (
                      <StatusChip tone="bad">Out</StatusChip>
                    ) : stock <= 10 ? (
                      <StatusChip tone="warn">{stock} left</StatusChip>
                    ) : (
                      <span className="text-[12.5px] font-semibold tabular-nums">{stock}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <ProductStatusChip status={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="rounded-2xl bg-ops-warn-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-warn">
        Read-only (ISS-019). Creating and editing products from here needs HSN and GST rate
        per product, which the schema does not carry yet — and an invoice cannot be raised
        without them. Editing arrives with those columns.
      </p>
    </div>
  );
}
