import type { FulfilmentState, PaymentState } from "@/lib/admin-orders-query";

/**
 * Payment and fulfilment, as two separate answers about one order.
 *
 * The order status is a single line through confirmed → packed → delivered; it
 * cannot say "paid but nothing packed", "cash due on delivery", or "one of two
 * shipments delivered". These read the persisted rows — payments and
 * shipments — and never invent a state. The Orders console filters with
 * database clauses built to give exactly these answers (orders-list.ts), and
 * the tests hold the two together. Pure; safe on server and client.
 */

export interface ClassifyInput {
  status: string;
  paymentMethod: string;
  payments: { status: string }[];
  shipments: { status: string }[];
  /** Return requests recorded against the order (any status). */
  returnRequests?: { status: string }[];
}

const CLOSED = new Set(["cancelled", "refund_initiated", "refunded"]);

/**
 * Priority, highest first: refunded > paid (captured) > authorized > cash on
 * delivery > failed > awaiting payment (order still open) > unpaid (order
 * closed without a payment). A captured payment is never hidden by a newer
 * failed retry.
 */
export function paymentState(o: ClassifyInput): PaymentState {
  const has = (s: string) => o.payments.some((p) => p.status === s);
  if (has("refunded")) return "refunded";
  if (has("captured")) return "paid";
  if (has("authorized")) return "authorized";
  if (o.paymentMethod === "cod") return "cod";
  if (has("failed")) return "failed";
  return o.status === "pending_payment" ? "pending" : "unpaid";
}

/**
 * From the live (non-cancelled) shipments when there are any; otherwise from
 * the order status, for orders placed before shipments existed. A closed order
 * is cancelled whatever its shipments say. One delivered shipment of two is
 * "partial", never "delivered".
 */
export function fulfilmentState(o: ClassifyInput): FulfilmentState {
  if (CLOSED.has(o.status)) return "cancelled";
  const live = o.shipments.filter((s) => s.status !== "cancelled").map((s) => s.status);
  if (live.length === 0) {
    switch (o.status) {
      case "delivered": return "delivered";
      case "out_for_delivery": return "in_transit";
      case "packed": return "ready";
      default: return "unfulfilled";
    }
  }
  const delivered = live.filter((s) => s === "delivered").length;
  if (delivered === live.length) return "delivered";
  if (delivered > 0) return "partial";
  if (live.includes("out_for_delivery")) return "in_transit";
  if (live.every((s) => s === "packed")) return "ready";
  return "unfulfilled";
}

/** The operational queues an order is in. An order can be in more than one. */
export function orderTabs(o: ClassifyInput): string[] {
  const tabs = ["all"];
  const returns = (o.returnRequests?.length ?? 0) > 0 ? ["returns"] : [];
  if (o.status === "pending_payment") tabs.push("awaiting_payment");
  if (CLOSED.has(o.status)) return [...tabs, "cancelled", ...returns];
  const live = o.shipments.filter((s) => s.status !== "cancelled").map((s) => s.status);
  const active = o.status !== "pending_payment";
  if (active && (live.includes("pending") || (live.length === 0 && o.status === "confirmed"))) tabs.push("to_pack");
  if (active && (live.includes("packed") || (live.length === 0 && o.status === "packed"))) tabs.push("to_dispatch");
  if (live.includes("out_for_delivery") || (live.length === 0 && o.status === "out_for_delivery")) tabs.push("in_transit");
  if (fulfilmentState(o) === "delivered") tabs.push("delivered");
  return [...tabs, ...returns];
}

export const PAYMENT_TONE: Record<PaymentState, "ok" | "warn" | "bad" | "neutral" | "info"> = {
  paid: "ok", authorized: "info", pending: "warn", failed: "bad", unpaid: "neutral", cod: "info", refunded: "neutral",
};
export const FULFILMENT_TONE: Record<FulfilmentState, "ok" | "warn" | "bad" | "neutral" | "info"> = {
  unfulfilled: "warn", ready: "info", in_transit: "info", partial: "warn", delivered: "ok", cancelled: "neutral",
};
