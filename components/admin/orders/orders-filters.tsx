"use client";

import { useState } from "react";
import {
  FULFILMENT_STATES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATES, RANGES, SORTS,
  ordersHref, hasFilters, type OrdersQuery,
} from "@/lib/admin-orders-query";

/**
 * Search, date range, sort and advanced filters for the Orders console.
 *
 * Every control writes to the URL (ordersHref) and nothing else, so the
 * server renders the list from the URL alone and reload / back / a shared link
 * show the same thing. Any change returns to page 1.
 */
export interface FilterOptions {
  cities: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending payment", confirmed: "Confirmed", packed: "Packed", out_for_delivery: "Out for delivery",
  delivered: "Delivered", cancelled: "Cancelled", refund_initiated: "Refund initiated", refunded: "Refunded",
};
const METHOD_LABEL: Record<string, string> = { razorpay: "Razorpay (online)", cod: "COD", dummy: "Test gateway" };

const field =
  "h-10 rounded-panel border border-line bg-white px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

export function OrdersFilters({
  query,
  options,
  navigate: go,
}: {
  query: OrdersQuery;
  options: FilterOptions;
  /** router.push in the app (orders-filters-bound.tsx); recorded in tests. */
  navigate: (href: string) => void;
}) {
  const [q, setQ] = useState(query.q);
  const [from, setFrom] = useState(query.from ?? "");
  const [to, setTo] = useState(query.to ?? "");
  const [showCustom, setShowCustom] = useState(query.range === "custom");
  const [open, setOpen] = useState(
    query.pay.length + query.ful.length + query.st.length + query.method.length + query.city.length + query.wh.length + query.driver.length > 0
  );
  const [draft, setDraft] = useState({
    pay: query.pay, ful: query.ful, st: query.st, method: query.method, city: query.city, wh: query.wh, driver: query.driver,
  });
  const push = (patch: Partial<OrdersQuery>) => go(ordersHref(query, { ...patch, page: 1 }));

  const toggle = <K extends keyof typeof draft>(k: K, v: string) =>
    setDraft((d) => {
      const cur = d[k] as string[];
      return { ...d, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <form
          role="search"
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: q.trim() });
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order number, customer, mobile, product or SKU"
            aria-label="Search orders"
            maxLength={80}
            className={field + " w-full"}
          />
        </form>
        <div className="flex gap-2.5">
          <select
            aria-label="Date placed"
            value={showCustom ? "custom" : query.range ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") return setShowCustom(true);
              setShowCustom(false);
              push({ range: (v || null) as OrdersQuery["range"], from: null, to: null });
            }}
            className={field + " min-w-0 flex-1 md:w-44 md:flex-none"}
          >
            <option value="">All time</option>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <select
            aria-label="Sort orders"
            value={query.sort}
            onChange={(e) => push({ sort: e.target.value as OrdersQuery["sort"] })}
            className={field + " min-w-0 flex-1 md:w-48 md:flex-none"}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {showCustom && (
        <form
          aria-label="Custom date range"
          className="flex flex-wrap items-end gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            push({ range: "custom", from: from || null, to: to || null });
          }}
        >
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className={field + " mt-1 block"} />
          </label>
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className={field + " mt-1 block"} />
          </label>
          <button type="submit" disabled={!from && !to} className="h-10 rounded-panel bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">
            Apply dates
          </button>
          <p className="w-full text-[11.5px] font-medium text-ink-500">Dates are India time (IST); the To date is included in full.</p>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-9 rounded-panel bg-chip px-4 text-[12.5px] font-bold text-ink"
        >
          {open ? "Hide filters" : "More filters"}
        </button>
        {hasFilters(query) && (
          <button
            type="button"
            onClick={() => go(ordersHref({ ...query, q: "", range: null, from: null, to: null, pay: [], ful: [], st: [], method: [], city: [], wh: [], driver: [] }, { page: 1 }))}
            className="text-[12.5px] font-bold text-ink underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-panel bg-white p-4 shadow-card" role="group" aria-label="Advanced filters">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Group label="Payment" items={PAYMENT_STATES.map((p) => [p.key, p.label])} on={draft.pay} toggle={(v) => toggle("pay", v)} />
            <Group label="Fulfilment" items={FULFILMENT_STATES.map((f) => [f.key, f.label])} on={draft.ful} toggle={(v) => toggle("ful", v)} />
            <Group label="Order status" items={ORDER_STATUSES.map((s) => [s, STATUS_LABEL[s]])} on={draft.st} toggle={(v) => toggle("st", v)} />
            <Group label="Payment method" items={PAYMENT_METHODS.map((m) => [m, METHOD_LABEL[m]])} on={draft.method} toggle={(v) => toggle("method", v)} />
            <Group label="Delivery city" items={options.cities.map((c) => [c.id, c.name])} on={draft.city} toggle={(v) => toggle("city", v)} />
            <Group label="Warehouse" items={options.warehouses.map((w) => [w.id, w.name])} on={draft.wh} toggle={(v) => toggle("wh", v)} />
            <Group label="Driver" items={options.drivers.map((d) => [d.id, d.name])} on={draft.driver} toggle={(v) => toggle("driver", v)} />
          </div>
          <button
            type="button"
            onClick={() => push(draft as Partial<OrdersQuery>)}
            className="mt-4 h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white"
          >
            Apply filters
          </button>
        </div>
      )}
    </div>
  );
}

function Group({ label, items, on, toggle }: { label: string; items: [string, string][]; on: string[]; toggle: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</legend>
      {items.length === 0 ? (
        <p className="text-[12px] font-medium text-ink-500">None yet</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map(([value, text]) => (
            <li key={value}>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                <input type="checkbox" checked={on.includes(value)} onChange={() => toggle(value)} />
                {text}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
