import Link from "next/link";
import { adminListOrders, nextOrderStatuses } from "@/lib/services/admin/manage";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { StatusControl } from "@/components/admin/status-control";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const { orders, total, perPage } = await adminListOrders(page);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Orders ({total})</h1>

      <div className="overflow-x-auto rounded-card border border-neutral-100 bg-white shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-neutral-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center font-semibold text-neutral-400">
                  No orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="font-bold">
                  <td className="px-4 py-3">{o.orderNo}</td>
                  <td className="px-4 py-3 font-semibold text-neutral-500">
                    {new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3">{o.items.length}</td>
                  <td className="px-4 py-3">{formatPaise(o.totalPaise)}</td>
                  <td className="px-4 py-3 font-semibold uppercase text-neutral-500">
                    {o.paymentMethod === "cod" ? "COD" : "Online"}
                  </td>
                  <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                  <td className="px-4 py-3">
                    <StatusControl kind="order" id={o.id} options={nextOrderStatuses(o.status)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/orders?page=${p}`}
              className={`grid size-9 place-items-center rounded-full text-sm font-extrabold ${
                p === page ? "bg-ink text-white" : "border border-neutral-200 hover:border-ink"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
