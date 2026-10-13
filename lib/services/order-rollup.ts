import "server-only";
import type { OrderStatus, Prisma, ShipmentStatus } from "@/prisma/generated/client/client";
import { ORDER_FLOW } from "@/lib/order-flow";
import { recordAudit } from "@/lib/services/audit";
import { db } from "@/lib/db";
import { creditCashbackForOrder } from "@/lib/services/wallet";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { triggerAlert } from "@/lib/observability";

/**
 * The order follows its shipments, forward only.
 *
 * Shipments move independently (lib/shipment-flow.ts) and nothing ever moved
 * the order: a single-shipment order whose goods were delivered against the
 * customer's code stayed `confirmed` in order history and the console
 * (O-QA-5, 14 Oct). This derives the furthest status the shipments justify and
 * walks the order there along `ORDER_FLOW`, one recorded step at a time:
 *
 *   every live shipment delivered          → delivered
 *   any shipment out for delivery/delivered → out_for_delivery
 *   every live shipment packed (or later)   → packed
 *
 * "Live" excludes cancelled shipments; an order whose shipments are all
 * cancelled is left alone (the order cancel owns that). It never moves an order
 * backwards, never touches pending_payment/cancelled/refund states, and changes
 * no stock. Cashback and the status notification run after commit through the
 * same idempotent functions the admin path uses — see `afterOrderRollup`.
 *
 * Call inside the shipment's transaction; it locks the order row first, the
 * same lock every order cancel takes, so the two serialise.
 */
const CHAIN: OrderStatus[] = ["confirmed", "packed", "out_for_delivery", "delivered"];

export function targetFromShipments(statuses: ShipmentStatus[]): OrderStatus | null {
  const live = statuses.filter((s) => s !== "cancelled");
  if (live.length === 0) return null;
  if (live.every((s) => s === "delivered")) return "delivered";
  if (live.some((s) => s === "out_for_delivery" || s === "delivered")) return "out_for_delivery";
  if (live.every((s) => s === "packed")) return "packed";
  return "confirmed";
}

/** The forward steps from `from` to `to` along the order flow, or [] if `to` is not ahead. */
export function forwardSteps(from: OrderStatus, to: OrderStatus): OrderStatus[] {
  const a = CHAIN.indexOf(from);
  const b = CHAIN.indexOf(to);
  if (a < 0 || b <= a) return [];
  const steps = CHAIN.slice(a + 1, b + 1);
  /* Every step must be a move ORDER_FLOW allows — the one definition of legal. */
  let cur = from;
  for (const s of steps) {
    if (!(ORDER_FLOW[cur] ?? []).includes(s)) return [];
    cur = s;
  }
  return steps;
}

export interface RollupResult {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
}

export async function rollUpOrderStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: { type: "admin" | "driver" | "system"; id: string | null }
): Promise<RollupResult | null> {
  const [locked] = await tx.$queryRaw<{ status: OrderStatus }[]>`
    SELECT status::text AS status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  if (!locked) return null;
  const shipments = await tx.shipment.findMany({ where: { orderId }, select: { status: true } });
  const target = targetFromShipments(shipments.map((s) => s.status));
  if (!target) return null;
  const steps = forwardSteps(locked.status, target);
  if (steps.length === 0) return null;

  const to = steps[steps.length - 1];
  const moved = await tx.order.updateMany({
    where: { id: orderId, status: locked.status },
    data: { status: to, ...(to === "delivered" ? { deliveredAt: new Date() } : {}) },
  });
  if (moved.count !== 1) return null;

  let from = locked.status;
  for (const step of steps) {
    await tx.orderStatusEvent.create({
      data: {
        orderId,
        fromStatus: from,
        toStatus: step,
        actorUserId: actor.type === "admin" ? actor.id : null,
        note: "From shipment progress",
      },
    });
    from = step;
  }
  await recordAudit(tx, {
    actorType: actor.type,
    actorId: actor.type === "system" ? null : actor.id,
    action: "order.status_changed",
    entityType: "order",
    entityId: orderId,
    before: { status: locked.status },
    after: { status: to, source: "shipments" },
  });
  return { orderId, from: locked.status, to };
}

export interface AfterRollupDeps {
  credit?: typeof creditCashbackForOrder;
  notify?: (p: { userId: string; orderNo: string; status: string }) => Promise<{ sent: boolean }>;
}

/**
 * After the shipment's transaction has committed: the same side effects the
 * admin "delivered" path runs, and nothing else.
 *
 * - Cashback only when the order reached `delivered`, through
 *   `creditCashbackForOrder`, which credits at most once per order (it checks
 *   for an existing `cashback_credit` on the order). A failure here does NOT
 *   undo the delivery — it raises an alert, and calling this again (or the
 *   credit directly) is safe and credits exactly once.
 * - The status notification goes through the notification service, which has
 *   no delivery channel yet and says so (`sent: false`); the outcome is
 *   recorded as `pending_integration`, never as sent.
 */
export async function afterOrderRollup(result: RollupResult | null, deps: AfterRollupDeps = {}): Promise<void> {
  if (!result) return;
  const order = await db.order.findUnique({
    where: { id: result.orderId },
    select: { id: true, orderNo: true, userId: true, totalPaise: true },
  });
  if (!order) return;

  if (result.to === "delivered") {
    try {
      await (deps.credit ?? creditCashbackForOrder)({
        userId: order.userId,
        orderId: order.id,
        orderNo: order.orderNo,
        orderTotalPaise: order.totalPaise,
      });
    } catch (err) {
      triggerAlert("cashback_credit_failed", "Order delivered but cashback could not be credited — retry is safe (idempotent)", {
        orderNo: order.orderNo,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let sent = false;
  try {
    sent = (await (deps.notify ?? notifyOrderStatusChange)({ userId: order.userId, orderNo: order.orderNo, status: result.to })).sent;
  } catch {
    sent = false;
  }
  await recordAudit(db, {
    actorType: "system",
    action: sent ? "order.notification_sent" : "order.notification_pending",
    entityType: "order",
    entityId: order.id,
    after: { status: result.to, channel: sent ? "sent" : "pending_integration" },
  });
}
