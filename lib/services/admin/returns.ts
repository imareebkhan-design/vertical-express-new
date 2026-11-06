import "server-only";
import { db } from "@/lib/db";
import type { Prisma, ReturnReason, ReturnStatus } from "@/prisma/generated/client/client";
import { recordAudit } from "@/lib/services/audit";
import { RETURN_FLOW, canMoveReturn, needsDecisionNote } from "@/lib/return-flow";

/**
 * Return requests — intake and review, nothing monetary.
 *
 * An operator records what a customer asked to return (by phone, at the gate,
 * on WhatsApp): which delivered items, how many, why, in their words, and
 * when they asked. It then moves through review → inspection → approved or
 * rejected → closed, each step audited.
 *
 * What it deliberately does NOT do — the return window, opened/damaged
 * material rules and refund policy are the owner's and not approved: no
 * refund (Razorpay or wallet), no restock, no exchange, no promise of money.
 * "Approved" records that the return is accepted for collection/inspection.
 * Only delivered quantities can be requested, and never more than remain
 * un-requested (rejected requests free their quantity again).
 */
export type ReturnResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "invalid" | "conflict"; message: string };

const OPEN_OR_ACCEPTED: ReturnStatus[] = ["requested", "under_review", "inspecting", "approved", "closed"];

/** Per order line: delivered quantity, already requested (not rejected), still returnable. */
export async function returnableLines(client: Prisma.TransactionClient | typeof db, orderId: string) {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      items: { select: { id: true, title: true, variantName: true, qty: true } },
      shipments: { select: { status: true, items: { select: { orderItemId: true, qty: true } } } },
    },
  });
  if (!order) return null;
  const requested = await client.returnRequestItem.groupBy({
    by: ["orderItemId"],
    where: { orderItem: { orderId }, returnRequest: { status: { in: OPEN_OR_ACCEPTED } } },
    _sum: { qty: true },
  });
  const req = new Map(requested.map((r) => [r.orderItemId, r._sum.qty ?? 0]));
  const hasShipments = order.shipments.some((s) => s.status !== "cancelled");
  return order.items.map((i) => {
    /* Delivered = what delivered shipments carried; for an order from before
       shipments existed, the whole line once the order itself is delivered. */
    const delivered = hasShipments
      ? order.shipments.filter((s) => s.status === "delivered").flatMap((s) => s.items).filter((x) => x.orderItemId === i.id).reduce((n, x) => n + x.qty, 0)
      : order.status === "delivered" ? i.qty : 0;
    const already = req.get(i.id) ?? 0;
    return { orderItemId: i.id, title: i.title, variantName: i.variantName, ordered: i.qty, delivered, requested: already, returnable: Math.max(0, delivered - already) };
  });
}

export interface ReturnIntake {
  orderNo: string;
  items: { orderItemId: string; qty: number }[];
  reason: ReturnReason;
  explanation: string;
  requestedAt: Date;
  channel: string;
}

export async function createReturnRequest(input: ReturnIntake, actorId: string): Promise<ReturnResult<{ returnNo: string }>> {
  const explanation = input.explanation.trim();
  const channel = input.channel.trim();
  if (explanation.length < 5) return { ok: false, reason: "invalid", message: "Write down what the customer said (at least a few words)" };
  if (!channel) return { ok: false, reason: "invalid", message: "Say how the customer asked (phone, at the gate…)" };
  if (Number.isNaN(input.requestedAt.getTime()) || input.requestedAt.getTime() > Date.now() + 60_000) {
    return { ok: false, reason: "invalid", message: "The request time cannot be in the future" };
  }
  const lines = input.items.filter((i) => i.qty > 0);
  if (lines.length === 0) return { ok: false, reason: "invalid", message: "Choose at least one item and quantity" };
  if (lines.some((l) => !Number.isInteger(l.qty))) return { ok: false, reason: "invalid", message: "Quantities are whole numbers" };
  if (new Set(lines.map((l) => l.orderItemId)).size !== lines.length) return { ok: false, reason: "invalid", message: "Each item once" };

  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { orderNo: input.orderNo }, select: { id: true, orderNo: true, placedAt: true } });
    if (!order) return { ok: false as const, reason: "not_found" as const, message: "Order not found" };
    if (input.requestedAt < order.placedAt) return { ok: false as const, reason: "invalid" as const, message: "The request cannot be before the order was placed" };
    /* One request at a time per order, so two operators cannot both claim the last bag. */
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
    const avail = await returnableLines(tx, order.id);
    const byId = new Map((avail ?? []).map((a) => [a.orderItemId, a]));
    for (const l of lines) {
      const a = byId.get(l.orderItemId);
      if (!a) return { ok: false as const, reason: "invalid" as const, message: "That item is not on this order" };
      if (a.delivered === 0) return { ok: false as const, reason: "invalid" as const, message: `${a.title} has not been delivered, so it cannot be returned` };
      if (l.qty > a.returnable) {
        return { ok: false as const, reason: "conflict" as const, message: `${a.title}: only ${a.returnable} of ${a.delivered} delivered can still be requested` };
      }
    }
    const n = (await tx.returnRequest.count({ where: { orderId: order.id } })) + 1;
    const returnNo = `RET-${order.orderNo}-${n}`;
    const created = await tx.returnRequest.create({
      data: {
        returnNo, orderId: order.id, reason: input.reason, explanation, requestedAt: input.requestedAt, channel,
        createdByUserId: actorId, items: { create: lines.map((l) => ({ orderItemId: l.orderItemId, qty: l.qty })) },
      },
    });
    await recordAudit(tx, {
      actorType: "admin", actorId, action: "return.requested", entityType: "return_request", entityId: created.id,
      before: null,
      after: { returnNo, orderNo: order.orderNo, reason: input.reason, channel, requestedAt: input.requestedAt.toISOString(), items: lines },
    });
    return { ok: true as const, value: { returnNo } };
  });
}

export async function moveReturnRequest(
  input: { returnNo: string; to: ReturnStatus; note: string },
  actorId: string
): Promise<ReturnResult> {
  const note = input.note.trim();
  if (needsDecisionNote(input.to) && note.length < 5) {
    return { ok: false, reason: "invalid", message: "Record why — an approval or rejection needs a reason" };
  }
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findUnique({ where: { returnNo: input.returnNo } });
    if (!r) return { ok: false as const, reason: "not_found" as const, message: "Return request not found" };
    if (!canMoveReturn(r.status, input.to)) {
      return { ok: false as const, reason: "conflict" as const, message: `A ${r.status.replace("_", " ")} request cannot move to ${input.to.replace("_", " ")}` };
    }
    const decided = input.to === "approved" || input.to === "rejected";
    const moved = await tx.returnRequest.updateMany({
      where: { id: r.id, status: r.status },
      data: {
        status: input.to,
        ...(decided ? { decidedAt: new Date(), decidedByUserId: actorId, decisionNote: note } : {}),
      },
    });
    if (moved.count !== 1) return { ok: false as const, reason: "conflict" as const, message: "This request changed while you were looking at it — reload" };
    await recordAudit(tx, {
      actorType: "admin", actorId, action: "return.status_changed", entityType: "return_request", entityId: r.id,
      before: { status: r.status }, after: { status: input.to, ...(note ? { note } : {}) },
    });
    return { ok: true as const, value: null };
  });
}

export async function listReturnRequests(status: ReturnStatus | null) {
  const [rows, grouped] = await Promise.all([
    db.returnRequest.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: "desc" },
      take: 200,
      include: {
        order: { select: { orderNo: true, address: true } },
        items: { select: { qty: true, orderItem: { select: { title: true, unitPricePaise: true } } } },
      },
    }),
    db.returnRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Partial<Record<ReturnStatus, number>>;
  return { rows, counts };
}

export async function getReturnRequest(returnNo: string) {
  const r = await db.returnRequest.findUnique({
    where: { returnNo },
    include: {
      order: { select: { orderNo: true, address: true, placedAt: true } },
      items: { include: { orderItem: { select: { title: true, variantName: true, qty: true, unitPricePaise: true } } } },
    },
  });
  if (!r) return null;
  const history = await db.auditLog.findMany({
    where: { entityType: "return_request", entityId: r.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, before: true, after: true, createdAt: true },
  });
  return { r, history, next: RETURN_FLOW[r.status] };
}
