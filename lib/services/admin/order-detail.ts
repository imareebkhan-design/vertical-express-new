import "server-only";
import { db } from "@/lib/db";
import { buildOrderTimeline } from "@/lib/order-timeline";

/**
 * Everything the order screen shows, read once: the order with items,
 * payments, status events and shipments (warehouse, driver, vehicle, items,
 * last live position), the audit trail of the order and its shipments, and the
 * service city of its pincode. Read-only.
 */
export async function adminOrderDetail(orderNo: string) {
  const order = await db.order.findUnique({
    where: { orderNo },
    include: {
      items: { orderBy: { id: "asc" }, include: { variant: { select: { sku: true } } } },
      payments: { orderBy: { createdAt: "asc" } },
      statusEvents: { orderBy: { createdAt: "asc" } },
      warehouse: { select: { name: true, city: true } },
      user: { select: { id: true, phone: true, email: true } },
      shipments: {
        orderBy: { sequence: "asc" },
        include: {
          warehouse: { select: { name: true } },
          driver: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { registration: true, kind: true } },
          items: { select: { qty: true, orderItem: { select: { title: true } } } },
          liveLocation: { select: { latitude: true, longitude: true, recordedAt: true } },
        },
      },
    },
  });
  if (!order) return null;

  const audits = await db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "order", entityId: order.id },
        { entityType: "shipment", entityId: { in: order.shipments.map((s) => s.id) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, entityType: true, entityId: true, actorType: true, after: true, createdAt: true },
  });
  const driverIds = [
    ...new Set(audits.map((a) => (a.after as Record<string, unknown> | null)?.driverId).filter((d): d is string => typeof d === "string")),
  ];
  const drivers = Object.fromEntries(
    (await db.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } })).map((d) => [d.id, d.name])
  );
  const pincode = String((order.address as Record<string, unknown>)?.pincode ?? "");
  const city = pincode
    ? (await db.serviceablePincode.findUnique({ where: { pincode }, select: { city: { select: { name: true, isLive: true, state: true } } } }))?.city ?? null
    : null;

  const timeline = buildOrderTimeline({
    placedAt: order.placedAt,
    paymentMethod: order.paymentMethod,
    payments: order.payments,
    statusEvents: order.statusEvents,
    shipments: order.shipments,
    audits,
    drivers,
  });
  return { order, timeline, city };
}
