import "server-only";
import type { Prisma } from "@/prisma/generated/client/client";
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
          /* Who is bringing it. The customer gets the name and the vehicle —
             not the phone number, which is the operator's to hold. */
          driver: { select: { name: true } },
          vehicle: { select: { registration: true } },
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

/**
 * The dispatch board: everything that has not left the warehouse yet.
 *
 * Grouped by the only lane distinction that is real today — express goes out
 * from the store, scheduled goes on a truck. The artboard also draws a lane per
 * two-hour slot with an occupancy count, and that still cannot be built:
 * delivery slots do not exist (ISS-057), so there is nothing to count.
 *
 * Drivers and vehicles DO exist now, and this comment said they did not until
 * `20260905061559_drivers_vehicles` landed. A shipment can be assigned to
 * somebody, which is what turns this queue into a plan.
 *
 * Ordered oldest first, because on a dispatch board the thing that has been
 * waiting longest is the thing about to become a complaint.
 */
export async function getDispatchBoard() {
  const shipments = await db.shipment.findMany({
    where: { status: { in: ["pending", "packed"] } },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      sequence: true,
      speedClass: true,
      status: true,
      deliveryCode: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      driver: { select: { id: true, name: true } },
      vehicle: { select: { id: true, registration: true } },
      items: { select: { qty: true } },
      order: {
        select: {
          orderNo: true,
          address: true,
          totalPaise: true,
          paymentMethod: true,
        },
      },
    },
  });

  const shape = (s: (typeof shipments)[number]) => {
    const addr = s.order.address as { label?: string; name?: string; city?: string } | null;
    return {
      id: s.id,
      ref: `${s.order.orderNo}-${s.sequence}`,
      orderNo: s.order.orderNo,
      status: s.status,
      destination: addr?.name ?? addr?.label ?? addr?.city ?? "—",
      itemCount: s.items.reduce((n, i) => n + i.qty, 0),
      lineCount: s.items.length,
      valuePaise: s.order.totalPaise,
      paymentMethod: s.order.paymentMethod,
      warehouse: s.warehouse?.name ?? null,
      /* Who is taking it, so the card can show an assignment rather than only
         offer one. Null until a dispatcher assigns. */
      driver: s.driver,
      vehicle: s.vehicle,
      waitingSince: s.createdAt,
    };
  };

  return {
    express: shipments.filter((s) => s.speedClass === "express").map(shape),
    scheduled: shipments.filter((s) => s.speedClass === "scheduled").map(shape),
  };
}

export type DispatchBoard = Awaited<ReturnType<typeof getDispatchBoard>>;
export type DispatchShipment = DispatchBoard["express"][number];

/**
 * Who and what is available to carry something today.
 *
 * Only active rows: somebody who has left the job must not still appear in a
 * dispatcher's dropdown. `assignShipment` refuses an inactive driver anyway —
 * this keeps the list from offering a choice that will be rejected.
 */
export async function getDispatchRoster() {
  const [drivers, vehicles] = await Promise.all([
    db.driver.findMany({
      where: { isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.vehicle.findMany({
      where: { isActive: true },
      select: { id: true, registration: true, kind: true },
      orderBy: { registration: "asc" },
    }),
  ]);
  return { drivers, vehicles };
}

export type DispatchRoster = Awaited<ReturnType<typeof getDispatchRoster>>;

/**
 * What has left the warehouse and not arrived yet.
 *
 * Kept out of the two lanes above on purpose. Those are "waiting to be loaded",
 * and the count above them says so — putting a shipment already on the road in
 * them would make that sentence false, which is a smaller version of exactly
 * the defect this codebase keeps finding.
 *
 * It needs its own place because the handover code is issued at dispatch and,
 * until there was a screen that could take it back, nothing ever asked for it.
 */
export async function getShipmentsOnTheRoad() {
  const shipments = await db.shipment.findMany({
    where: { status: "out_for_delivery" },
    orderBy: [{ dispatchedAt: "asc" }],
    select: {
      id: true,
      sequence: true,
      speedClass: true,
      status: true,
      dispatchedAt: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      driver: { select: { id: true, name: true } },
      vehicle: { select: { id: true, registration: true } },
      items: { select: { qty: true } },
      order: {
        select: { orderNo: true, address: true, totalPaise: true, paymentMethod: true },
      },
    },
  });

  return shipments.map((s) => {
    const addr = s.order.address as { label?: string; name?: string; city?: string } | null;
    return {
      id: s.id,
      ref: `${s.order.orderNo}-${s.sequence}`,
      orderNo: s.order.orderNo,
      status: s.status,
      destination: addr?.name ?? addr?.label ?? addr?.city ?? "—",
      itemCount: s.items.reduce((n, i) => n + i.qty, 0),
      lineCount: s.items.length,
      valuePaise: s.order.totalPaise,
      paymentMethod: s.order.paymentMethod,
      warehouse: s.warehouse?.name ?? null,
      driver: s.driver,
      vehicle: s.vehicle,
      /* "Waiting since" on this lane means since it left, not since it was
         packed — that is the number a dispatcher chasing a late delivery
         wants. */
      waitingSince: s.dispatchedAt ?? s.createdAt,
    };
  });
}
