import { adminListProducts } from "@/lib/services/admin/manage";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const { products, total } = await adminListProducts();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Products ({total})</h1>
      <div className="overflow-x-auto rounded-card border border-neutral-100 bg-white shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-neutral-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {products?.map((p) => {
              const variant = p?.variants?.[0];
              const stock = variant?.inventory?.reduce((s, i) => s + i?.qtyOnHand, 0) ?? 0;
              const low = stock <= 10;
              return (
                <tr key={p?.id} className="font-bold">
                  <td className="max-w-xs truncate px-4 py-3">{p?.title}</td>
                  <td className="px-4 py-3 font-semibold text-neutral-500">{p?.brand?.name}</td>
                  <td className="px-4 py-3 font-semibold text-neutral-500">{p?.category?.name}</td>
                  <td className="px-4 py-3">{variant ? formatPaise(variant?.pricePaise) : "—"}</td>
                  <td className={`px-4 py-3 ${low ? "text-danger" : ""}`}>{stock}{low ? " ⚠" : ""}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase ${
                      p?.status === "published" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"
                    }`}>
                      {p?.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
