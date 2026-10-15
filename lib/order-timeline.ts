/**
 * The order's activity history, assembled only from rows that exist.
 *
 * Sources, all persisted: the order's placedAt; each payment row (its
 * creation, and its current status at the row's last update); the order's
 * status events; and the audit log of the order and its shipments (assigned,
 * packed, dispatched, delivered — with the delivery proof — cancelled). No
 * step is shown that did not happen and no timestamp is made up: a payment's
 * status time is labelled as the payment's last update because that is what
 * the row records. Pure; safe on server and client.
 */
export interface TimelineInput {
  placedAt: Date;
  paymentMethod: string;
  payments: { id: string; status: string; gateway: string; createdAt: Date; updatedAt: Date; gatewayPaymentId: string | null }[];
  statusEvents: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date; actorUserId: string | null }[];
  shipments: { id: string; sequence: number }[];
  audits: { id: string; action: string; entityType: string; entityId: string; actorType: string; after: unknown; createdAt: Date }[];
  drivers: Record<string, string>;
}

export interface TimelineEntry {
  id: string;
  at: Date;
  title: string;
  detail?: string;
  tone: "ok" | "info" | "warn" | "bad" | "neutral";
}

const STATUS: Record<string, string> = {
  pending_payment: "Awaiting payment", confirmed: "Confirmed", packed: "Packed", out_for_delivery: "Out for delivery",
  delivered: "Delivered", cancelled: "Cancelled", refund_initiated: "Refund initiated", refunded: "Refunded",
};
const SHIP_STATUS: Record<string, string> = {
  packed: "packed", out_for_delivery: "dispatched — out for delivery", delivered: "delivered", cancelled: "cancelled", pending: "back to pending",
};
const PAY: Record<string, { title: string; tone: TimelineEntry["tone"] }> = {
  captured: { title: "Payment captured", tone: "ok" },
  authorized: { title: "Payment authorized", tone: "info" },
  failed: { title: "Payment failed", tone: "bad" },
  refunded: { title: "Payment refunded", tone: "neutral" },
};
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function buildOrderTimeline(o: TimelineInput): TimelineEntry[] {
  const out: TimelineEntry[] = [{ id: "placed", at: o.placedAt, title: "Order placed", tone: "neutral" }];
  const seq = new Map(o.shipments.map((s) => [s.id, s.sequence]));
  const multi = o.shipments.length > 1;
  const label = (id: string) => (multi ? `Shipment ${seq.get(id) ?? "?"}` : "Shipment");

  for (const p of o.payments) {
    if (p.gateway !== "cod") {
      out.push({ id: `pay-${p.id}`, at: p.createdAt, title: `Payment started (${p.gateway})`, tone: "neutral" });
    }
    const st = PAY[p.status];
    if (st) {
      out.push({
        id: `pay-${p.id}-${p.status}`, at: p.updatedAt, title: st.title, tone: st.tone,
        detail: [p.gatewayPaymentId ? `ref ${p.gatewayPaymentId}` : null, "time of the payment's last update"].filter(Boolean).join(" · "),
      });
    }
  }

  for (const e of o.statusEvents) {
    out.push({
      id: `ev-${e.id}`, at: e.createdAt,
      title: `Order ${e.fromStatus ? `${STATUS[e.fromStatus] ?? e.fromStatus} → ` : ""}${STATUS[e.toStatus] ?? e.toStatus}`,
      detail: [e.note, e.actorUserId ? "by an operator" : null].filter(Boolean).join(" · ") || undefined,
      tone: e.toStatus === "cancelled" ? "bad" : e.toStatus === "delivered" ? "ok" : "info",
    });
  }

  for (const a of o.audits) {
    const after = rec(a.after);
    if (a.entityType === "shipment" && a.action === "shipment.assigned") {
      const driver = typeof after.driverId === "string" ? o.drivers[after.driverId] : undefined;
      out.push({ id: `au-${a.id}`, at: a.createdAt, title: `${label(a.entityId)} assigned${driver ? ` to ${driver}` : ""}`, tone: "info" });
    } else if (a.entityType === "shipment" && a.action === "shipment.status_changed" && typeof after.status === "string") {
      const proof = after.proof === "delivery_code" ? "confirmed with the customer's delivery code"
        : after.proof === "override" ? `exception: delivered without the code${typeof after.overrideReason === "string" ? ` — ${after.overrideReason}` : ""}`
        : undefined;
      out.push({
        id: `au-${a.id}`, at: a.createdAt, title: `${label(a.entityId)} ${SHIP_STATUS[after.status] ?? after.status}`,
        detail: [proof, a.actorType === "driver" ? "by the driver" : a.actorType === "admin" ? "by an operator" : null].filter(Boolean).join(" · ") || undefined,
        tone: after.status === "delivered" ? "ok" : after.status === "cancelled" ? "bad" : after.proof === "override" ? "warn" : "info",
      });
    } else if (a.action === "order.notification_pending") {
      out.push({ id: `au-${a.id}`, at: a.createdAt, title: "Customer notification not sent", detail: "no delivery channel is configured yet", tone: "neutral" });
    } else if (a.action === "inventory.released") {
      out.push({ id: `au-${a.id}`, at: a.createdAt, title: "Stock released back to the warehouse", tone: "neutral" });
    }
  }
  return out.sort((x, y) => x.at.getTime() - y.at.getTime() || x.id.localeCompare(y.id));
}
