import { addDays, istDateKey, istDayStart, isDateKey } from "@/lib/ist";

/**
 * The Orders console's view, as URL search parameters.
 *
 * Everything an operator chose — tab, search, dates, filters, sort, page —
 * lives in the URL, so a reload, the back button, a shared link and "back to
 * orders" from a detail page all land on the same list. Parsing is strict and
 * bounded: unknown values are dropped rather than passed to the database, and
 * page / page size are capped. Pure; safe on server and client.
 */

export const TABS = [
  { key: "all", label: "All" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "to_pack", label: "To pack" },
  { key: "to_dispatch", label: "To dispatch" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "returns", label: "Returns" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom range" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export const SORTS = [
  { key: "placed_desc", label: "Newest first" },
  { key: "placed_asc", label: "Oldest first" },
  { key: "total_desc", label: "Amount: high to low" },
  { key: "total_asc", label: "Amount: low to high" },
  { key: "updated_desc", label: "Recently updated" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

/** Payment as its own dimension — never inferred from the order status. */
export const PAYMENT_STATES = [
  { key: "paid", label: "Paid" },
  { key: "authorized", label: "Authorized" },
  { key: "pending", label: "Awaiting payment" },
  { key: "failed", label: "Payment failed" },
  { key: "unpaid", label: "Unpaid (closed)" },
  { key: "cod", label: "Cash on delivery" },
  { key: "refunded", label: "Refunded" },
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number]["key"];

/** Fulfilment as its own dimension — from the shipments, not the order status. */
export const FULFILMENT_STATES = [
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "ready", label: "Ready to dispatch" },
  { key: "in_transit", label: "In transit" },
  { key: "partial", label: "Partially delivered" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;
export type FulfilmentState = (typeof FULFILMENT_STATES)[number]["key"];

export const ORDER_STATUSES = [
  "pending_payment", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "refund_initiated", "refunded",
] as const;
export const PAYMENT_METHODS = ["razorpay", "cod", "dummy"] as const;
export const PER_PAGE = [25, 50, 100] as const;
export const MAX_PAGE = 400;
const MAX_Q = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrdersQuery {
  tab: TabKey;
  q: string;
  range: RangeKey | null;
  from: string | null;
  to: string | null;
  pay: PaymentState[];
  ful: FulfilmentState[];
  st: (typeof ORDER_STATUSES)[number][];
  method: (typeof PAYMENT_METHODS)[number][];
  city: string[];
  wh: string[];
  driver: string[];
  sort: SortKey;
  page: number;
  per: (typeof PER_PAGE)[number];
}

type Raw = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}
/** Comma lists and repeated params both work; only allowed values survive, de-duplicated. */
function many<T extends string>(v: string | string[] | undefined, ok: (s: string) => s is T): T[] {
  const parts = (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(",")).map((s) => s.trim());
  return [...new Set(parts.filter(ok))].slice(0, 50);
}
function inList<T extends string>(list: readonly { readonly key: T }[]): (s: string) => s is T;
function inList<T extends string>(list: readonly T[]): (s: string) => s is T;
function inList(list: readonly (string | { readonly key: string })[]) {
  const keys = list.map((x) => (typeof x === "string" ? x : x.key));
  return (s: string) => keys.includes(s);
}
const isUuid = (s: string): s is string => UUID.test(s);

export function parseOrdersQuery(raw: Raw): OrdersQuery {
  const tab = one(raw.tab);
  const range = one(raw.range);
  const sort = one(raw.sort);
  const per = Number(one(raw.per));
  const page = Math.trunc(Number(one(raw.page)));
  let from = one(raw.from);
  let to = one(raw.to);
  const rangeKey = inList(RANGES)(range) ? range : null;
  from = rangeKey === "custom" && isDateKey(from) ? from : "";
  to = rangeKey === "custom" && isDateKey(to) ? to : "";
  if (from && to && from > to) [from, to] = [to, from];
  return {
    tab: inList(TABS)(tab) ? tab : "all",
    q: one(raw.q).slice(0, MAX_Q),
    range: rangeKey === "custom" && !from && !to ? null : rangeKey,
    from: from || null,
    to: to || null,
    pay: many(raw.pay, inList(PAYMENT_STATES)),
    ful: many(raw.ful, inList(FULFILMENT_STATES)),
    st: many(raw.st, inList(ORDER_STATUSES)),
    method: many(raw.method, inList(PAYMENT_METHODS)),
    city: many(raw.city, isUuid),
    wh: many(raw.wh, isUuid),
    driver: many(raw.driver, isUuid),
    sort: inList(SORTS)(sort) ? sort : "placed_desc",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    per: (PER_PAGE as readonly number[]).includes(per) ? (per as OrdersQuery["per"]) : 25,
  };
}

/**
 * The placed-at window as [gte, lt) UTC instants. The end date is inclusive for
 * the operator — "to 15 Oct" means through 23:59:59 IST — implemented as an
 * exclusive bound at the start of the next IST day.
 */
export function placedWindow(q: Pick<OrdersQuery, "range" | "from" | "to">, now: Date = new Date()): { gte?: Date; lt?: Date } {
  const today = istDateKey(now);
  switch (q.range) {
    case "today":
      return { gte: istDayStart(today), lt: istDayStart(addDays(today, 1)) };
    case "yesterday":
      return { gte: istDayStart(addDays(today, -1)), lt: istDayStart(today) };
    case "7d":
      return { gte: istDayStart(addDays(today, -6)), lt: istDayStart(addDays(today, 1)) };
    case "30d":
      return { gte: istDayStart(addDays(today, -29)), lt: istDayStart(addDays(today, 1)) };
    case "month":
      return { gte: istDayStart(`${today.slice(0, 8)}01`), lt: istDayStart(addDays(today, 1)) };
    case "custom":
      return {
        ...(q.from ? { gte: istDayStart(q.from) } : {}),
        ...(q.to ? { lt: istDayStart(addDays(q.to, 1)) } : {}),
      };
    default:
      return {};
  }
}

const DEFAULTS: Partial<Record<keyof OrdersQuery, unknown>> = { tab: "all", sort: "placed_desc", page: 1, per: 25 };

/** Back to search params, omitting defaults, so links stay short and stable. */
export function ordersHref(q: OrdersQuery, patch: Partial<OrdersQuery> = {}): string {
  const next = { ...q, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(next) as [keyof OrdersQuery, unknown][]) {
    if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (DEFAULTS[k] !== undefined && DEFAULTS[k] === v) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = p.toString();
  return s ? `/admin/orders?${s}` : "/admin/orders";
}

/** Whether anything beyond the tab/sort/page is narrowing the list. */
export function hasFilters(q: OrdersQuery): boolean {
  return Boolean(q.q || q.range || q.pay.length || q.ful.length || q.st.length || q.method.length || q.city.length || q.wh.length || q.driver.length);
}
