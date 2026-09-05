import Link from "next/link";
import { AlertTriangle, Box, Clock, PackageCheck, ShoppingBag, Truck, Wallet } from "lucide-react";
import { getOpsToday, type QueueKind } from "@/lib/services/admin/today";
import { getOpsExceptions } from "@/lib/services/admin/exceptions";
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
  const [t, exceptions] = await Promise.all([getOpsToday(), getOpsExceptions()]);
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
          label="Shipments to dispatch"
          value={String(t.shipmentsToDispatch)}
          sub="packed or waiting to load"
          icon={Truck}
          tone={t.shipmentsToDispatch > 0 ? "warn" : undefined}
        />
        <Stat
          label="COD to collect today"
          value={formatPaise(t.codToCollectPaise)}
          sub="cash the drivers will be handed"
          icon={Wallet}
        />
        <Stat
          label="Out of stock"
          value={String(t.outOfStockCount)}
          sub={`${t.lowStock.length} at or below reorder`}
          icon={Box}
          tone={t.outOfStockCount > 0 ? "bad" : undefined}
        />
      </div>

      {/*
        "Today's capacity" from the artboard — slot occupancy per window, which
        vehicle is on each, and which window is full and should stop being sold.

        It is the half of this screen a dispatcher would actually run the day
        from, and it still cannot be computed: there are no delivery slots
        (ISS-057), so there is no window to have an occupancy. Drivers and
        vehicles do exist now — that half of the sentence stopped being true in
        `20260905061559_drivers_vehicles` — but a capacity board needs the
        windows, not the riders. Rendering it with plausible numbers would be
        the worst possible version of that, because somebody would stop selling
        a window on the strength of it.
      */}
      <section className="rounded-panel bg-white p-4 shadow-card" aria-labelledby="capacity-heading">
        <h2 id="capacity-heading" className="text-[15px] font-bold tracking-tight">
          Today&rsquo;s capacity
        </h2>
        <p className="mt-1 text-[12px] font-medium text-ink-700">
          Slot occupancy, the vehicle on each window, and which window is full.
        </p>
        <p className="mt-3 rounded-[12px] bg-ops-warn-tint px-3.5 py-2.5 text-[12px] font-semibold text-ops-warn">
          Not built. Delivery slots do not exist (ISS-057), so there is no
          window to measure occupancy against — and a board with invented
          numbers would get a window closed for selling. Drivers and vehicles
          are assignable from the dispatch board.
        </p>
      </section>

      {/*
        Exceptions — the panel that says what is broken, as opposed to how much
        work there is. Every row is computed. The artboard draws five plausible
        ones, and five plausible rows on a screen get acted on, so the checks
        nothing can run are listed separately as what this panel is *not*
        watching. Silence from a check that was never made is the failure mode.
      */}
      <section className="rounded-panel bg-white p-4 shadow-card" aria-labelledby="exceptions-heading">
        <h2 id="exceptions-heading" className="text-[15px] font-bold tracking-tight">
          Exceptions
        </h2>
        {exceptions.found.length === 0 ? (
          <p className="mt-3 text-[12.5px] font-semibold text-ink-700">
            Nothing flagged by the checks that can run. See below for the ones that
            cannot.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {exceptions.found.map((e) => (
              <li
                key={e.title}
                className={
                  "rounded-field p-3 " +
                  (e.severity === "bad" ? "bg-ops-bad-tint" : "bg-ops-warn-tint")
                }
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <p
                    className={
                      "text-[12.5px] font-bold " +
                      (e.severity === "bad" ? "text-ops-bad" : "text-ops-warn")
                    }
                  >
                    {e.title}
                  </p>
                  {e.href && (
                    <Link
                      href={e.href}
                      className="text-[11px] font-bold text-ink no-underline hover:underline"
                    >
                      Open
                    </Link>
                  )}
                </div>
                <p
                  className={
                    "mt-0.5 text-[12px] font-medium leading-[17px] " +
                    (e.severity === "bad" ? "text-ops-bad" : "text-ops-warn")
                  }
                >
                  {e.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
            Not watched
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {exceptions.unwatchable.map((u) => (
              <li key={u.title} className="text-[12px] font-medium leading-[17px] text-ink-700">
                <span className="font-bold text-ink">{u.title}</span> — needs {u.needs}.
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        Cash position — which driver is holding how much, and what has been
        banked. It is the panel that closes the day, and it needs three things
        this system does not have: a driver, a record of cash handed over at a
        gate, and a deposit. COD is switched off for exactly that reason, so
        there is currently no cash to be in a position about.
      */}
      <section className="rounded-panel bg-white p-4 shadow-card" aria-labelledby="cash-heading">
        <h2 id="cash-heading" className="text-[15px] font-bold tracking-tight">
          Cash position today
        </h2>
        <p className="mt-3 rounded-field bg-ops-info-tint p-3.5 text-[12px] font-medium leading-[17px] text-ops-info">
          <span className="font-bold">No cash is being collected.</span> COD is off, and
          it is off because none of the pieces behind this panel exist — there is no
          driver to hold a float, nothing records what was handed over at the gate, and
          no deposit is reconciled against a bank line. A board showing two drivers
          holding a lakh and a half between them would be the point at which somebody
          starts trusting it.
        </p>
      </section>

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
