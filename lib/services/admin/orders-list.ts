import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/prisma/generated/client/client";
import {
  placedWindow, TABS, type FulfilmentState, type OrdersQuery, type PaymentState, type TabKey,
} from "@/lib/admin-orders-query";

/**
 * The Orders console's list, counts and filters — server-side, bounded.
 *
 * Every clause here is the database form of lib/order-classify.ts: payment
 * from the payment rows, fulfilment from the live shipments (order status only
 * for orders that predate shipments). The tests run the classifier over each
 * fixture and assert the filters return exactly the same orders.
 *
 * AND between dimensions; OR within one (two payment states = either).
 */
type W = Prisma.OrderWhereInput;

const CLOSED = ["cancelled", "refund_initiated", "refunded"] as const;
const OPEN: W = { status: { notIn: [...CLOSED] } };
const ACTIVE: W = { status: { notIn: [...CLOSED, "pending_payment"] } };
const LIVE = { status: { not: "cancelled" as const } };
const NO_LIVE: W = { shipments: { none: LIVE } };
const SETTLED = ["captured", "authorized", "refunded"] as const;

export const PAYMENT_WHERE: Record<PaymentState, W> = {
  refunded: { payments: { some: { status: "refunded" } } },
  paid: { payments: { some: { status: "captured" }, none: { status: "refunded" } } },
  authorized: { payments: { some: { status: "authorized" }, none: { status: { in: ["captured", "refunded"] } } } },
  cod: { paymentMethod: "cod", payments: { none: { status: { in: [...SETTLED] } } } },
  failed: { paymentMethod: { not: "cod" }, payments: { some: { status: "failed" }, none: { status: { in: [...SETTLED] } } } },
  pending: { paymentMethod: { not: "cod" }, status: "pending_payment", payments: { none: { status: { in: [...SETTLED, "failed"] } } } },
  unpaid: { paymentMethod: { not: "cod" }, status: { not: "pending_payment" }, payments: { none: { status: { in: [...SETTLED, "failed"] } } } },
};

export const FULFILMENT_WHERE: Record<FulfilmentState, W> = {
  cancelled: { status: { in: [...CLOSED] } },
  delivered: {
    AND: [OPEN, {
      OR: [
        { AND: [NO_LIVE, { status: "delivered" }] },
        { shipments: { some: LIVE, every: { status: { in: ["delivered", "cancelled"] } } } },
      ],
    }],
  },
  partial: {
    AND: [OPEN, { shipments: { some: { status: "delivered" } } }, { shipments: { some: { status: { in: ["pending", "packed", "out_for_delivery"] } } } }],
  },
  in_transit: {
    AND: [OPEN, {
      OR: [
        { AND: [NO_LIVE, { status: "out_for_delivery" }] },
        { shipments: { some: { status: "out_for_delivery" }, none: { status: "delivered" } } },
      ],
    }],
  },
  ready: {
    AND: [OPEN, {
      OR: [
        { AND: [NO_LIVE, { status: "packed" }] },
        { shipments: { some: { status: "packed" }, every: { status: { in: ["packed", "cancelled"] } } } },
      ],
    }],
  },
  unfulfilled: {
    AND: [OPEN, {
      OR: [
        { AND: [NO_LIVE, { status: { in: ["pending_payment", "confirmed"] } }] },
        { shipments: { some: { status: "pending" }, none: { status: { in: ["delivered", "out_for_delivery"] } } } },
      ],
    }],
  },
};

export const TAB_WHERE: Record<TabKey, W> = {
  all: {},
  awaiting_payment: { status: "pending_payment" },
  to_pack: { AND: [ACTIVE, { OR: [{ shipments: { some: { status: "pending" } } }, { AND: [NO_LIVE, { status: "confirmed" }] }] }] },
  to_dispatch: { AND: [ACTIVE, { OR: [{ shipments: { some: { status: "packed" } } }, { AND: [NO_LIVE, { status: "packed" }] }] }] },
  in_transit: { AND: [OPEN, { OR: [{ shipments: { some: { status: "out_for_delivery" } } }, { AND: [NO_LIVE, { status: "out_for_delivery" }] }] }] },
  delivered: FULFILMENT_WHERE.delivered,
  cancelled: FULFILMENT_WHERE.cancelled,
};

const SEARCH_LIMIT = 5000;

/**
 * Text search and city need SQL Prisma cannot say (JSON fields, ILIKE across
 * a join, digits-only phone match). They narrow to an id list, bounded.
 */
async function prefilterIds(q: OrdersQuery): Promise<string[] | null> {
  if (!q.q && q.city.length === 0) return null;
  const conds: Prisma.Sql[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = q.q.replace(/\D/g, "");
    const phone = digits.length >= 4 ? `%${digits.slice(-10)}%` : null;
    conds.push(Prisma.sql`(
      o.order_no ILIKE ${like}
      OR o.address->>'name' ILIKE ${like}
      ${phone ? Prisma.sql`OR regexp_replace(coalesce(o.address->>'phone', ''), '\\D', '', 'g') LIKE ${phone}
      OR regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') LIKE ${phone}` : Prisma.empty}
      OR EXISTS (
        SELECT 1 FROM order_items i JOIN product_variants v ON v.id = i.variant_id
        WHERE i.order_id = o.id AND (i.title ILIKE ${like} OR v.sku ILIKE ${like})
      )
    )`);
  }
  if (q.city.length > 0) {
    conds.push(Prisma.sql`o.address->>'pincode' IN (
      SELECT pincode FROM serviceable_pincodes WHERE city_id = ANY(${q.city}::uuid[]))`);
  }
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT o.id::text AS id FROM orders o LEFT JOIN users u ON u.id = o.user_id
    WHERE ${Prisma.join(conds, " AND ")}
    LIMIT ${SEARCH_LIMIT}`;
  return rows.map((r) => r.id);
}

/** Every filter except the tab — the base each tab count is taken over. */
export async function baseWhere(q: OrdersQuery, now: Date = new Date()): Promise<W> {
  const and: W[] = [];
  const win = placedWindow(q, now);
  if (win.gte || win.lt) and.push({ placedAt: win });
  if (q.pay.length) and.push({ OR: q.pay.map((p) => PAYMENT_WHERE[p]) });
  if (q.ful.length) and.push({ OR: q.ful.map((f) => FULFILMENT_WHERE[f]) });
  if (q.st.length) and.push({ status: { in: q.st } });
  if (q.method.length) and.push({ paymentMethod: { in: q.method } });
  if (q.wh.length) and.push({ warehouseId: { in: q.wh } });
  if (q.driver.length) and.push({ shipments: { some: { driverId: { in: q.driver } } } });
  const ids = await prefilterIds(q);
  if (ids) and.push({ id: { in: ids } });
  return and.length ? { AND: and } : {};
}

const ORDER_BY: Record<OrdersQuery["sort"], Prisma.OrderOrderByWithRelationInput[]> = {
  placed_desc: [{ placedAt: "desc" }, { id: "desc" }],
  placed_asc: [{ placedAt: "asc" }, { id: "asc" }],
  total_desc: [{ totalPaise: "desc" }, { placedAt: "desc" }, { id: "desc" }],
  total_asc: [{ totalPaise: "asc" }, { placedAt: "desc" }, { id: "desc" }],
  updated_desc: [{ updatedAt: "desc" }, { id: "desc" }],
};

export async function listAdminOrders(q: OrdersQuery, now: Date = new Date()) {
  const base = await baseWhere(q, now);
  const where: W = { AND: [base, TAB_WHERE[q.tab]] };
  const [rows, total, ...tabCounts] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: ORDER_BY[q.sort],
      skip: (q.page - 1) * q.per,
      take: q.per,
      select: {
        id: true, orderNo: true, placedAt: true, updatedAt: true, status: true, paymentMethod: true,
        totalPaise: true, address: true,
        user: { select: { phone: true } },
        warehouse: { select: { name: true } },
        items: { select: { qty: true } },
        payments: { select: { status: true } },
        shipments: { select: { status: true, driver: { select: { id: true, name: true } } }, orderBy: { sequence: "asc" } },
      },
    }),
    db.order.count({ where }),
    ...TABS.map((t) => db.order.count({ where: { AND: [base, TAB_WHERE[t.key]] } })),
  ]);
  const counts = Object.fromEntries(TABS.map((t, i) => [t.key, tabCounts[i]])) as Record<TabKey, number>;

  /* Delivery city: the service city the order's pincode belongs to (not the
     free-text city the customer typed). */
  const pins = [...new Set(rows.map((r) => String((r.address as Record<string, unknown>)?.pincode ?? "")).filter(Boolean))];
  const cityOf = new Map(
    (await db.serviceablePincode.findMany({ where: { pincode: { in: pins } }, select: { pincode: true, city: { select: { name: true } } } }))
      .map((p) => [p.pincode, p.city.name])
  );
  return { rows, total, counts, cityOf, pages: Math.max(1, Math.ceil(total / q.per)) };
}

/** Options for the filter controls. */
export async function orderFilterOptions() {
  const [cities, warehouses, drivers] = await Promise.all([
    db.serviceCity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.warehouse.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.driver.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { cities, warehouses, drivers };
}
