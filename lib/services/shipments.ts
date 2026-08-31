import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Splitting an order into physically separate deliveries.
 *
 * A coil of wire and a tonne of cement do not travel together: the wire goes out
 * from the Srinagar store within the hour, the cement goes on a truck. One flat
 * `Order.status` cannot describe an order where one half is out for delivery and
 * the other has not been loaded, which is what `Shipment` exists to fix.
 *
 * The grouping rule is deliberately the same one the storefront already shows on
 * every product card — `Category.isBulk` — so the split a customer is told about
 * at checkout is the split that actually happens. If those two ever diverge, the
 * cart is lying.
 */

/** The minimum a line needs to be assigned to a shipment. */
/* The pure grouping rule now lives in `lib/shipment-plan.ts` so the client cart
 * can render the same split this file persists. Re-exported here so existing
 * importers and tests keep their import path. */
export { planShipments } from "@/lib/shipment-plan";
export type { PlannableLine, PlannedShipment } from "@/lib/shipment-plan";
import type { PlannedShipment } from "@/lib/shipment-plan";

/**
 * Persists the planned shipments for an order.
 *
 * Runs inside the caller's transaction so an order can never exist without its
 * shipments — the same all-or-nothing guarantee the order, its items, its payment
 * and the stock decrement already share.
 */
export async function createShipmentsForOrder(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    warehouseId: string;
    /** Line refs must match the `ref` values given to planShipments. */
    orderItemIdByRef: Record<string, string>;
    planned: PlannedShipment[];
  }
): Promise<void> {
  for (const shipment of args.planned) {
    await tx.shipment.create({
      data: {
        orderId: args.orderId,
        sequence: shipment.sequence,
        speedClass: shipment.speedClass,
        warehouseId: args.warehouseId,
        items: {
          create: shipment.lines.map((l) => ({
            orderItemId: args.orderItemIdByRef[l.ref],
            qty: l.qty,
          })),
        },
      },
    });
  }
}

/**
 * The shipments of one order, for the customer who placed it.
 *
 * Ownership is enforced in the query rather than checked after it — `orderNo` is
 * sequential and guessable, so a `findFirst` that omitted `userId` would hand a
 * stranger somebody else's delivery code. That code is what the driver asks for
 * at the gate; it is the one field on this screen that must never leak.
 *
 * Returns null for an order that does not exist *and* for one belonging to
 * somebody else, deliberately indistinguishable.
 */
export async function getShipmentsForOrder(userId: string, orderNo: string) {
  const order = await db.order.findFirst({
    where: { orderNo, userId },
    select: {
      id: true,
      orderNo: true,
      address: true,
      shipments: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          speedClass: true,
          status: true,
          promisedAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          deliveryCode: true,
          warehouse: { select: { name: true } },
          items: {
            select: {
              qty: true,
              orderItem: { select: { title: true } },
            },
          },
        },
      },
    },
  });

  return order;
}

export type OrderShipments = NonNullable<Awaited<ReturnType<typeof getShipmentsForOrder>>>;
export type TrackedShipment = OrderShipments["shipments"][number];
