import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus } from "@/prisma/generated/client/client";

/**
 * The dispatcher's screen.
 *
 * Deliberately a work queue rather than a KPI wall: the question at 9am is "what
 * needs a person right now", not "what is our GMV". Counts are here to size the
 * day, not to be admired.
 *
 * SCOPE NOTE — everything below is derived from data that exists today. The
 * canvas design also shows slot capacity, unassigned shipments, driver cash and
 * batch-capture gaps. None of those are here because none of Shipment, Batch or
 * CashCollection exist in the schema yet, and a panel that renders a plausible
 * number from nothing is worse than an absent panel.
 */

/** How long an order may sit unpaid before it needs a human. */
const STALE_PAYMENT_MINUTES = 20;

/** At or below this on-hand count a variant is treated as low. */
const LOW_STOCK_THRESHOLD = 10;

export type QueueKind =
  | "payment_stalled"
  | "awaiting_pack"
  | "awaiting_dispatch"
  | "in_transit"
  | "refund_pending";

export interface QueueItem {
  kind: QueueKind;
  orderNo: string;
  placedAt: Date;
  customer: string;
  place: string;
  itemCount: number;
  totalPaise: number;
  status: OrderStatus;
}

export interface LowStockItem {
  variantId: string;
  sku: string;
  productTitle: string;
  warehouseName: string;
  qtyOnHand: number;
}

export interface OpsToday {
  ordersToday: number;
  revenueTodayPaise: number;
  /** Shipments packed or pending that have not left the warehouse. */
  shipmentsToDispatch: number;
  /**
   * Cash a driver will be handed today, across orders that have not been
   * delivered yet. The number a dispatcher needs before sending anyone out —
   * it decides how much float goes on the vehicles.
   */
  codToCollectPaise: number;
  queue: QueueItem[];
  queueCounts: Record<QueueKind, number>;
  lowStock: LowStockItem[];
  outOfStockCount: number;
}

const KIND_BY_STATUS: Partial<Record<OrderStatus, QueueKind>> = {
  pending_payment: "payment_stalled",
  confirmed: "awaiting_pack",
  packed: "awaiting_dispatch",
  out_for_delivery: "in_transit",
  refund_initiated: "refund_pending",
};

export async function getOpsToday(): Promise<OpsToday> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const staleBefore = new Date(Date.now() - STALE_PAYMENT_MINUTES * 60_000);

  const [
    ordersToday,
    revenueToday,
    actionable,
    lowStock,
    outOfStockCount,
    shipmentsToDispatch,
    codToCollect,
  ] = await Promise.all([
    db.order.count({ where: { placedAt: { gte: startOfToday } } }),
    db.order.aggregate({
      where: { placedAt: { gte: startOfToday }, status: { notIn: ["cancelled", "refunded"] } },
      _sum: { totalPaise: true },
    }),
    db.order.findMany({
      where: {
        OR: [
          // Unpaid and old enough that the customer has almost certainly
          // abandoned or hit a gateway problem.
          { status: "pending_payment", placedAt: { lt: staleBefore } },
          { status: { in: ["confirmed", "packed", "out_for_delivery", "refund_initiated"] } },
        ],
      },
      orderBy: { placedAt: "asc" },
      take: 40,
      select: {
        orderNo: true,
        placedAt: true,
        status: true,
        totalPaise: true,
        address: true,
        _count: { select: { items: true } },
      },
    }),
    db.inventory.findMany({
      where: { qtyOnHand: { lte: LOW_STOCK_THRESHOLD } },
      orderBy: { qtyOnHand: "asc" },
      take: 12,
      select: {
        variantId: true,
        qtyOnHand: true,
        warehouse: { select: { name: true } },
        variant: { select: { sku: true, product: { select: { title: true } } } },
      },
    }),
    db.inventory.count({ where: { qtyOnHand: { lte: 0 } } }),
    /* Anything packed or still pending has not left. `out_for_delivery` has,
       and `delivered`/`cancelled` are done. */
    db.shipment.count({ where: { status: { in: ["pending", "packed"] } } }),
    db.order.aggregate({
      where: { paymentMethod: "cod", status: { in: ["confirmed", "packed", "out_for_delivery"] } },
      _sum: { totalPaise: true },
    }),
  ]);

  const queue: QueueItem[] = actionable.map((o) => {
    // `address` is a JSON snapshot taken at order time, so it is read defensively.
    const addr = (o.address ?? {}) as Record<string, unknown>;
    const name = typeof addr.name === "string" ? addr.name : "—";
    const city = typeof addr.city === "string" ? addr.city : "";
    const pincode = typeof addr.pincode === "string" ? addr.pincode : "";
    return {
      kind: KIND_BY_STATUS[o.status] ?? "awaiting_pack",
      orderNo: o.orderNo,
      placedAt: o.placedAt,
      customer: name,
      place: [city, pincode].filter(Boolean).join(" · "),
      itemCount: o._count.items,
      totalPaise: o.totalPaise,
      status: o.status,
    };
  });

  const queueCounts = queue.reduce(
    (acc, q) => ({ ...acc, [q.kind]: (acc[q.kind] ?? 0) + 1 }),
    {} as Record<QueueKind, number>
  );

  return {
    ordersToday,
    shipmentsToDispatch,
    codToCollectPaise: codToCollect._sum.totalPaise ?? 0,
    revenueTodayPaise: revenueToday._sum.totalPaise ?? 0,
    queue,
    queueCounts,
    lowStock: lowStock.map((i) => ({
      variantId: i.variantId,
      sku: i.variant.sku,
      productTitle: i.variant.product.title,
      warehouseName: i.warehouse.name,
      qtyOnHand: i.qtyOnHand,
    })),
    outOfStockCount,
  };
}
