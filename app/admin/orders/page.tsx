import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { adminListOrders } from "@/lib/services/admin/manage";
import { formatPaise } from "@/lib/money";
import { OrderStatusChip, PaymentStatusChip, StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

/** Filter tabs. `needs_action` is a view, not a status — see below. */
const FILTERS: { key: string; label: string; status?: OrderStatus }[] = [
  { key: "all", label: "All" },
  { key: "pending_payment", label: "Awaiting payment", status: "pending_payment" },
  { key: "confirmed", label: "To pack", status: "confirmed" },
  { key: "packed", label: "To dispatch", status: "packed" },
  { key: "out_for_delivery", label: "In transit", status: "out_for_delivery" },
  { key: "delivered", label: "Delivered", status: "delivered" },
  { key: "refund_initiated", label: "Refunds", status: "refund_initiated" },
];

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const active = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];
  const { orders, total, perPage } = await adminListOrders(page, 20, active.status);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Orders</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {total} {total === 1 ? "order" : "orders"}
          {active.status ? ` · ${active.label.toLowerCase()}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = f.key === active.key;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/orders" : `/admin/orders?status=${f.key}`}
              className={`inline-flex h-8 items-center rounded-panel px-3.5 text-[12px] transition-colors ${
                on ? "bg-ink font-bold text-white" : "bg-chip font-semibold text-ink hover:bg-hush"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Order</th>
              <th className="px-3 pb-2.5">Customer</th>
              <th className="px-3 pb-2.5 text-right">Items</th>
              <th className="px-3 pb-2.5">Status</th>
              <th className="px-3 pb-2.5">Payment</th>
              <th className="px-3 pb-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const addr = (o.address ?? {}) as Record<string, unknown>;
              const name = typeof addr.name === "string" ? addr.name : "—";
              const city = typeof addr.city === "string" ? addr.city : "";
              const pincode = typeof addr.pincode === "string" ? addr.pincode : "";
              const payment = o.payments[0];
              return (
                <tr key={o.id} className="border-t border-line">
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/orders/${o.orderNo}`}
                      className="text-[12.5px] font-bold tabular-nums hover:underline"
                    >
                      {o.orderNo}
                    </Link>
                    <p className="text-[11px] font-semibold text-ink-500">
                      {o.placedAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[12.5px] font-semibold">{name}</p>
                    <p className="text-[11px] font-semibold text-ink-500">
                      {[city, pincode].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] font-semibold tabular-nums">
                    {o.items.length}
                  </td>
                  <td className="px-3 py-3">
                    <OrderStatusChip status={o.status} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusChip tone="neutral">{o.paymentMethod}</StatusChip>
                      {payment && <PaymentStatusChip status={payment.status} />}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                    {formatPaise(o.totalPaise)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {orders.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No orders match this filter.
          </p>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{
                pathname: "/admin/orders",
                query: { ...(active.status ? { status: active.key } : {}), page: p },
              }}
              className={`grid size-9 place-items-center rounded-chip text-[12px] tabular-nums transition-colors ${
                p === page ? "bg-ink font-bold text-white" : "bg-chip font-semibold hover:bg-hush"
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
