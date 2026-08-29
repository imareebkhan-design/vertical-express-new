import Link from "next/link";
import { AlertTriangle, Box, Clock, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { getOpsToday, type QueueKind } from "@/lib/services/admin/today";
import { formatPaise } from "@/lib/money";
import { OrderStatusChip, StatusChip, type StatusTone } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

const KIND: Record<QueueKind, { label: string; tone: StatusTone; icon: typeof Clock }> = {
  payment_stalled: { label: "Payment stalled", tone: "bad", icon: AlertTriangle },
  awaiting_pack: { label: "Needs packing", tone: "warn", icon: PackageCheck },
  awaiting_dispatch: { label: "Needs dispatch", tone: "warn", icon: Truck },
  in_transit: { label: "In transit", tone: "info", icon: Truck },
  refund_pending: { label: "Refund to process", tone: "bad", icon: AlertTriangle },
};

const ORDER = [
  "payment_stalled",
  "awaiting_pack",
  "awaiting_dispatch",
  "refund_pending",
  "in_transit",
] as const;

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Clock;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-panel bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
          {label}
        </span>
        <span className="flex-1" />
        <Icon className="size-4 text-ink-500" aria-hidden />
      </div>
      <p
        className={`mt-2 text-2xl font-extrabold tabular-nums tracking-tight ${
          tone === "bad" ? "text-ops-bad" : tone === "warn" ? "text-ops-warn" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-ink-500">{sub}</p>
    </div>
  );
}

export default async function AdminToday() {
  const t = await getOpsToday();
  const needsAction =
    (t.queueCounts.payment_stalled ?? 0) +
    (t.queueCounts.awaiting_pack ?? 0) +
    (t.queueCounts.awaiting_dispatch ?? 0) +
    (t.queueCounts.refund_pending ?? 0);

  const sorted = [...t.queue].sort(
    (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || +a.placedAt - +b.placedAt
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Today</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          {" · "}
          {needsAction} {needsAction === 1 ? "order needs" : "orders need"} action
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Orders today"
          value={String(t.ordersToday)}
          sub={formatPaise(t.revenueTodayPaise)}
          icon={ShoppingBag}
        />
        <Stat
          label="Needs action"
          value={String(needsAction)}
          sub="unpaid, unpacked or undispatched"
          icon={Clock}
          tone={needsAction > 0 ? "warn" : undefined}
        />
        <Stat
          label="In transit"
          value={String(t.queueCounts.in_transit ?? 0)}
          sub="out for delivery now"
          icon={Truck}
        />
        <Stat
          label="Out of stock"
          value={String(t.outOfStockCount)}
          sub={`${t.lowStock.length} at or below reorder`}
          icon={Box}
          tone={t.outOfStockCount > 0 ? "bad" : undefined}
        />
      </div>

      <section className="rounded-panel bg-white p-4 shadow-card" aria-labelledby="queue-heading">
        <div className="mb-3 flex items-center gap-3">
          <h2 id="queue-heading" className="text-[15px] font-bold tracking-tight">
            Needs you now
          </h2>
          <span className="flex-1" />
          <Link href="/admin/orders" className="text-[11px] font-bold hover:underline">
            All orders
          </Link>
        </div>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[13px] font-semibold text-ink-500">
            Nothing waiting. Every order is either delivered or with a customer.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                  <th className="px-3 pb-2.5 font-extrabold">Flag</th>
                  <th className="px-3 pb-2.5 font-extrabold">Order</th>
                  <th className="px-3 pb-2.5 font-extrabold">Customer</th>
                  <th className="px-3 pb-2.5 font-extrabold">Items</th>
                  <th className="px-3 pb-2.5 font-extrabold">Value</th>
                  <th className="px-3 pb-2.5 font-extrabold">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((q) => {
                  const k = KIND[q.kind];
                  return (
                    <tr key={q.orderNo} className="border-t border-line">
                      <td className="px-3 py-2.5">
                        <StatusChip tone={k.tone}>
                          <k.icon className="size-3" aria-hidden />
                          {k.label}
                        </StatusChip>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/orders/${q.orderNo}`}
                          className="text-[12.5px] font-bold tabular-nums hover:underline"
                        >
                          {q.orderNo}
                        </Link>
                        <p className="text-[11px] font-semibold text-ink-500">
                          {q.placedAt.toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[12.5px] font-semibold">{q.customer}</p>
                        <p className="text-[11px] font-semibold text-ink-500">{q.place}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] font-semibold tabular-nums">
                        {q.itemCount}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] font-bold tabular-nums">
                        {formatPaise(q.totalPaise)}
                      </td>
                      <td className="px-3 py-2.5">
                        <OrderStatusChip status={q.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-panel bg-white p-4 shadow-card" aria-labelledby="stock-heading">
        <div className="mb-3 flex items-center gap-3">
          <h2 id="stock-heading" className="text-[15px] font-bold tracking-tight">
            Running low
          </h2>
          <span className="flex-1" />
          <Link href="/admin/inventory" className="text-[11px] font-bold hover:underline">
            All inventory
          </Link>
        </div>

        {t.lowStock.length === 0 ? (
          <p className="py-8 text-center text-[13px] font-semibold text-ink-500">
            Nothing at or below the reorder point.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.lowStock.map((s) => (
              <li
                key={`${s.variantId}-${s.warehouseName}`}
                className="flex items-center gap-3 rounded-full bg-canvas px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold">{s.productTitle}</p>
                  <p className="text-[11px] font-semibold text-ink-500">
                    <span className="tabular-nums">{s.sku}</span> · {s.warehouseName}
                  </p>
                </div>
                <StatusChip tone={s.qtyOnHand <= 0 ? "bad" : "warn"}>
                  {s.qtyOnHand <= 0 ? "Out of stock" : `${s.qtyOnHand} left`}
                </StatusChip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
