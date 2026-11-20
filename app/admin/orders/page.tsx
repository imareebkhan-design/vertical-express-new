import Link from "next/link";
import { getAdminUser } from "@/lib/services/admin/authz";
import { listAdminOrders, orderFilterOptions } from "@/lib/services/admin/orders-list";
import {
  FULFILMENT_STATES, PAYMENT_STATES, RANGES, TABS, hasFilters, ordersHref, parseOrdersQuery, type OrdersQuery,
} from "@/lib/admin-orders-query";
import { FULFILMENT_TONE, PAYMENT_TONE, fulfilmentState, paymentState } from "@/lib/order-classify";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import { OrdersFiltersBound } from "@/components/admin/orders/orders-filters-bound";

export const dynamic = "force-dynamic";

const PAY_LABEL = Object.fromEntries(PAYMENT_STATES.map((p) => [p.key, p.label]));
const FUL_LABEL = Object.fromEntries(FULFILMENT_STATES.map((f) => [f.key, f.label]));

/**
 * Orders — every view is a URL, every count and row comes from the database.
 *
 * Payment and fulfilment are separate badges (lib/order-classify.ts): a paid
 * order with nothing packed, a cash order, and one of two shipments delivered
 * are three different rows, not one status. Placement times are exact and in
 * IST (lib/ist.ts).
 */
export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const query = parseOrdersQuery(await searchParams);
  const [{ rows, total, counts, cityOf, pages }, options] = await Promise.all([listAdminOrders(query), orderFilterOptions()]);
  const page = Math.min(query.page, pages);
  const rangeLabel =
    query.range === "custom"
      ? `${query.from ?? "…"} to ${query.to ?? "…"}`
      : RANGES.find((r) => r.key === query.range)?.label.toLowerCase();
  const cleared = { ...query, q: "", range: null, from: null, to: null, pay: [], ful: [], st: [], method: [], city: [], wh: [], driver: [] };

  const view = rows.map((o) => {
    const addr = (o.address ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof addr[k] === "string" ? (addr[k] as string) : "");
    const drivers = [...new Set(o.shipments.filter((x) => x.status !== "cancelled" && x.driver).map((x) => x.driver!.name))];
    return {
      id: o.id,
      orderNo: o.orderNo,
      when: `${formatIstDate(o.placedAt)} · ${formatIstTime(o.placedAt)} IST`,
      iso: o.placedAt.toISOString(),
      name: s("name") || "—",
      phone: s("phone") || o.user?.phone || "",
      units: o.items.reduce((n, i) => n + i.qty, 0),
      lines: o.items.length,
      total: formatPaise(o.totalPaise),
      pay: paymentState(o),
      ful: fulfilmentState(o),
      city: cityOf.get(s("pincode")) ?? (s("city") || "—"),
      pincode: s("pincode"),
      warehouse: o.warehouse?.name ?? "—",
      drivers,
      shipments: o.shipments.filter((x) => x.status !== "cancelled").length,
    };
  });
  const back = ordersHref(query);
  const detail = (orderNo: string) => `/admin/orders/${orderNo}?back=${encodeURIComponent(back)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Orders</h1>
        <p className="mt-0.5 text-[12px] font-semibold text-ink-500">
          {total} {total === 1 ? "order" : "orders"}
          {rangeLabel ? ` · placed ${rangeLabel}` : ""}
          {query.q ? ` · matching “${query.q}”` : ""} · times in IST
        </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {query.tab === "to_pack" && (
            <Link href="/admin/dispatch" className="inline-flex h-9 items-center rounded-panel bg-chip px-4 text-[12.5px] font-bold text-ink">
              Open pick list
            </Link>
          )}
          {/* A plain link: the route re-checks admin access, caps the size and audits the export. */}
          <a
            href={`/admin/orders/export${ordersHref({ ...query, page: 1 }).replace("/admin/orders", "")}`}
            className="inline-flex h-9 items-center rounded-panel bg-ink px-4 text-[12.5px] font-bold text-white"
          >
            Export CSV
          </a>
        </div>
      </div>

      <nav aria-label="Saved views" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex items-center gap-2 pb-1">
          <li className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-500">Views</li>
          {savedViews(query, options.cities).map((v) => (
            <li key={v.label}>
              <Link href={v.href} className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-chip px-3.5 text-[12px] font-semibold text-ink hover:bg-hush">
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Order views" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 pb-1">
          {TABS.map((t) => {
            const on = t.key === query.tab;
            return (
              <li key={t.key}>
                <Link
                  href={ordersHref(query, { tab: t.key, page: 1 })}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[12.5px] transition-colors ${
                    on ? "bg-ink font-bold text-white" : "border border-line bg-white font-semibold text-ink hover:bg-chip"
                  }`}
                >
                  {t.label}
                  <span className={`tabular-nums ${on ? "text-white/70" : "text-ink-500"}`}>{counts[t.key]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <OrdersFiltersBound query={query} options={options} />

      {view.length === 0 ? (
        <div className="rounded-panel bg-white p-10 text-center shadow-card">
          <p className="text-[14px] font-bold text-ink">No orders match this view.</p>
          <p className="mt-1 text-[12.5px] font-medium text-ink-500">
            {hasFilters(query) ? "Try a wider date range, or clear the filters." : "Orders appear here as soon as they are placed."}
          </p>
          {hasFilters(query) && (
            <Link href={ordersHref(cleared, { page: 1 })} className="mt-3 inline-block text-[12.5px] font-bold text-ink underline">
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-panel bg-white p-4 shadow-card md:block">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                  <th className="px-3 pb-2.5">Order / placed</th>
                  <th className="px-3 pb-2.5">Customer</th>
                  <th className="px-3 pb-2.5 text-right">Items</th>
                  <th className="px-3 pb-2.5 text-right">Total</th>
                  <th className="px-3 pb-2.5">Payment</th>
                  <th className="px-3 pb-2.5">Fulfilment</th>
                  <th className="px-3 pb-2.5">Delivery</th>
                  <th className="px-3 pb-2.5">Driver</th>
                </tr>
              </thead>
              <tbody>
                {view.map((o) => (
                  <tr key={o.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <Link href={detail(o.orderNo)} className="text-[12.5px] font-bold tabular-nums hover:underline">
                        {o.orderNo}
                      </Link>
                      <p className="text-[11px] font-semibold text-ink-500">
                        <time dateTime={o.iso}>{o.when}</time>
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[12.5px] font-semibold">{o.name}</p>
                      <p className="text-[11px] font-semibold tabular-nums text-ink-500">{o.phone}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-[12.5px] font-semibold tabular-nums">
                      {o.units}
                      <span className="block text-[11px] text-ink-500">{o.lines} {o.lines === 1 ? "line" : "lines"}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">{o.total}</td>
                    <td className="px-3 py-3"><StatusChip tone={PAYMENT_TONE[o.pay]}>{PAY_LABEL[o.pay]}</StatusChip></td>
                    <td className="px-3 py-3">
                      <StatusChip tone={FULFILMENT_TONE[o.ful]}>{FUL_LABEL[o.ful]}</StatusChip>
                      {o.shipments > 1 && <span className="mt-1 block text-[11px] font-semibold text-ink-500">{o.shipments} shipments</span>}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[12px] font-semibold">{o.city}{o.pincode ? ` · ${o.pincode}` : ""}</p>
                      <p className="text-[11px] font-semibold text-ink-500">{o.warehouse}</p>
                    </td>
                    <td className="px-3 py-3 text-[12px] font-semibold">
                      {o.drivers.length ? o.drivers.join(", ") : <span className="text-ink-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-2.5 md:hidden" aria-label="Orders list">
            {view.map((o) => (
              <li key={o.id}>
                <Link href={detail(o.orderNo)} className="block rounded-panel bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold tabular-nums">{o.orderNo}</p>
                      <p className="text-[11.5px] font-semibold text-ink-500"><time dateTime={o.iso}>{o.when}</time></p>
                    </div>
                    <p className="text-[13.5px] font-bold tabular-nums">{o.total}</p>
                  </div>
                  <p className="mt-2 text-[12.5px] font-semibold">
                    {o.name} <span className="text-ink-500">· {o.city}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusChip tone={PAYMENT_TONE[o.pay]}>{PAY_LABEL[o.pay]}</StatusChip>
                    <StatusChip tone={FULFILMENT_TONE[o.ful]}>{FUL_LABEL[o.ful]}</StatusChip>
                    <span className="text-[11.5px] font-semibold text-ink-500">
                      {o.units} {o.units === 1 ? "item" : "items"}{o.drivers.length ? ` · ${o.drivers.join(", ")}` : ""}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-2">
          <PageLink href={page > 1 ? ordersHref(query, { page: page - 1 }) : null} label="Previous" />
          <span className="px-2 text-[12.5px] font-semibold tabular-nums text-ink-500">Page {page} of {pages}</span>
          <PageLink href={page < pages ? ordersHref(query, { page: page + 1 }) : null} label="Next" />
        </nav>
      )}
    </div>
  );
}

/**
 * Reusable views, as links over the URL state (no stored model yet — a saved
 * view table would need its own owner and audit; these cover the requested
 * set). "Delivered" here means placed this month and now delivered.
 */
function savedViews(q: OrdersQuery, cities: { id: string; name: string }[]) {
  const base: OrdersQuery = { ...q, tab: "all", q: "", range: null, from: null, to: null, pay: [], ful: [], st: [], method: [], city: [], wh: [], driver: [], sort: "placed_desc", page: 1 };
  const delhi = cities.find((c) => c.name.toLowerCase() === "delhi");
  return [
    { label: "Today's orders", href: ordersHref(base, { range: "today" }) },
    { label: "Awaiting payment", href: ordersHref(base, { tab: "awaiting_payment" }) },
    { label: "To dispatch now", href: ordersHref(base, { tab: "to_dispatch", sort: "placed_asc" }) },
    { label: "In transit", href: ordersHref(base, { tab: "in_transit" }) },
    ...(delhi ? [{ label: "Delhi orders", href: ordersHref(base, { city: [delhi.id] }) }] : []),
    { label: "Delivered · placed this month", href: ordersHref(base, { tab: "delivered", range: "month" }) },
  ];
}

function PageLink({ href, label }: { href: string | null; label: string }) {
  const cls = "inline-flex h-9 items-center rounded-panel px-4 text-[12.5px] font-bold";
  return href ? (
    <Link href={href} className={cls + " bg-chip text-ink hover:bg-hush"}>{label}</Link>
  ) : (
    <span aria-disabled="true" className={cls + " bg-chip text-ink-500 opacity-50"}>{label}</span>
  );
}
