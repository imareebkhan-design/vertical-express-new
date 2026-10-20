import "server-only";
import { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { DEAD_ORDER_STATES } from "@/lib/services/checkout";
import type { GatewayRefund, PaymentProvider, RefundAccepted } from "@/lib/services/payments";
import { triggerAlert } from "@/lib/observability";

/**
 * Refunds of money that was never owed (ISS-025, first part).
 *
 * Scope is deliberately narrow and needs no refund *policy*: a captured payment
 * on an order that is cancelled (the late-capture worklist), or a second capture
 * on an order that was already paid. In both cases the customer is owed the
 * whole payment back; an operator decides when, writes why, and the refund is
 * recorded before Razorpay is asked.
 *
 * Out of scope until the owner sets a policy: refunds of delivered goods,
 * partial refunds, return windows, COD cash refunds.
 *
 * Money safety:
 *   - a `requested` row is committed BEFORE the gateway call; the partial unique
 *     index `payment_refunds_one_in_flight` allows one in-flight refund per
 *     payment, so two clicks or two operators can never ask Razorpay twice;
 *   - only a definite refusal frees the payment for another attempt. A timeout,
 *     a 5xx or an unreadable answer leaves the refund in flight until Razorpay's
 *     own record (webhook, or `checkRefundWithGateway`) says what happened;
 *   - Razorpay's `receipt` is the refund row id, so its record can always be
 *     tied back to ours;
 *   - the payment becomes `refunded` only when processed refunds cover it.
 */

export type RefundBasis = "dead_order" | "duplicate_capture";

export type RefundEligibility =
  | { ok: true; basis: RefundBasis; remainingPaise: number }
  | { ok: false; code: "NOT_FOUND" | "NOT_CAPTURED" | "NOT_GATEWAY" | "NOT_OWED" | "ALREADY_REFUNDED" | "IN_FLIGHT" };

const IN_FLIGHT = ["requested", "pending"] as const;

/** Whether this payment's money must go back, and how much of it is still owed. */
export async function refundEligibility(tx: DbClient, paymentId: string): Promise<RefundEligibility> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      orderId: true,
      status: true,
      gateway: true,
      gatewayPaymentId: true,
      amountPaise: true,
      createdAt: true,
      order: { select: { status: true } },
      refunds: { select: { status: true, amountPaise: true } },
    },
  });
  if (!payment) return { ok: false, code: "NOT_FOUND" };
  if (payment.status === "refunded") return { ok: false, code: "ALREADY_REFUNDED" };
  if (payment.status !== "captured") return { ok: false, code: "NOT_CAPTURED" };
  if (payment.gateway !== "razorpay" || !payment.gatewayPaymentId) return { ok: false, code: "NOT_GATEWAY" };
  if (payment.refunds.some((r) => (IN_FLIGHT as readonly string[]).includes(r.status))) return { ok: false, code: "IN_FLIGHT" };

  let basis: RefundBasis | null = null;
  if ((DEAD_ORDER_STATES as readonly string[]).includes(payment.order.status)) {
    basis = "dead_order";
  } else {
    /* The same rule as listDuplicateCaptures: the earliest capture pays for the
       order; any later capture on it is a duplicate. */
    const earlier = await tx.payment.count({
      where: {
        orderId: payment.orderId,
        id: { not: payment.id },
        status: { in: ["captured", "refunded"] },
        OR: [{ createdAt: { lt: payment.createdAt } }, { createdAt: payment.createdAt, id: { lt: payment.id } }],
      },
    });
    if (earlier > 0) basis = "duplicate_capture";
  }
  if (!basis) return { ok: false, code: "NOT_OWED" };

  const refunded = payment.refunds.filter((r) => r.status === "processed").reduce((n, r) => n + r.amountPaise, 0);
  const remainingPaise = payment.amountPaise - refunded;
  if (remainingPaise <= 0) return { ok: false, code: "ALREADY_REFUNDED" };
  return { ok: true, basis, remainingPaise };
}

/** Mark the payment refunded once processed refunds cover it. */
async function settlePaymentIfCovered(tx: DbClient, paymentId: string) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    select: { amountPaise: true, status: true, refunds: { where: { status: "processed" }, select: { amountPaise: true } } },
  });
  if (!payment || payment.status === "refunded") return;
  const processed = payment.refunds.reduce((n, r) => n + r.amountPaise, 0);
  if (processed >= payment.amountPaise) {
    await tx.payment.update({ where: { id: paymentId }, data: { status: "refunded" } });
  }
}

/** Gateway errors that mean Razorpay definitely did not accept the refund. Everything else is "unknown". */
export function isDefiniteRefusal(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (/^RAZORPAY_REFUND_NOT_ACCEPTED:failed$/.test(msg)) return true;
  if (/^RAZORPAY_REFUND_INVALID_AMOUNT/.test(msg)) return true;
  const status = /^RAZORPAY_REFUND_FAILED:(\d{3})$/.exec(msg);
  /* 4xx is a refusal (bad request, already fully refunded, not captured).
     408 and 429 are not: the request may still be processed. */
  return !!status && Number(status[1]) >= 400 && Number(status[1]) < 500 && status[1] !== "408" && status[1] !== "429";
}

/** Only the error code — a gateway response body can echo request detail. */
function errorCode(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return (msg.match(/^[A-Z_]+(?::[A-Za-z0-9_]+)?/)?.[0] ?? "UNKNOWN").slice(0, 80);
}

export type RefundOutcome =
  | { ok: true; refundId: string; status: "processed" | "pending" }
  | { ok: false; code: "INVALID_REASON" | Exclude<RefundEligibility, { ok: true }>["code"] }
  | { ok: false; code: "GATEWAY_REFUSED"; refundId: string; failure: string }
  | { ok: false; code: "OUTCOME_UNKNOWN"; refundId: string; failure: string };

export const MIN_REASON_LENGTH = 10;

/**
 * Refund what is still owed on one payment. The operator's reason is required
 * and recorded. Returns what happened; never throws for a gateway problem.
 */
export async function requestRefund(
  params: { paymentId: string; reason: string; actorEmail: string; actorUserId?: string | null },
  deps: { provider: Pick<PaymentProvider, "refundPayment"> }
): Promise<RefundOutcome> {
  const reason = params.reason.trim();
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, code: "INVALID_REASON" };

  let claimed: { refundId: string; amountPaise: number; gatewayPaymentId: string; orderId: string };
  try {
    const result = await db.$transaction(async (tx) => {
      // Serialise against other refund requests and settlements of this payment.
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${params.paymentId}::uuid FOR UPDATE`;
      const eligible = await refundEligibility(tx, params.paymentId);
      if (!eligible.ok) return eligible;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: params.paymentId },
        select: { orderId: true, gatewayPaymentId: true },
      });
      const row = await tx.paymentRefund.create({
        data: {
          paymentId: params.paymentId,
          orderId: payment.orderId,
          amountPaise: eligible.remainingPaise,
          reason,
          actorEmail: params.actorEmail,
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorType: "admin",
        actorId: params.actorUserId ?? null,
        action: "payment.refund_requested",
        entityType: "payment",
        entityId: params.paymentId,
        after: { refundId: row.id, amountPaise: eligible.remainingPaise, basis: eligible.basis, reason, by: params.actorEmail },
      });
      return {
        ok: true as const,
        refundId: row.id,
        amountPaise: eligible.remainingPaise,
        gatewayPaymentId: payment.gatewayPaymentId as string,
        orderId: payment.orderId,
      };
    });
    if (!result.ok) return result;
    claimed = result;
  } catch (e) {
    // The partial unique index: another request claimed this payment first.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, code: "IN_FLIGHT" };
    throw e;
  }

  let accepted: RefundAccepted;
  try {
    accepted = await deps.provider.refundPayment(claimed.gatewayPaymentId, claimed.amountPaise, claimed.refundId);
  } catch (e) {
    const failure = errorCode(e);
    if (isDefiniteRefusal(e)) {
      await db.$transaction(async (tx) => {
        await tx.paymentRefund.updateMany({ where: { id: claimed.refundId, status: "requested" }, data: { status: "failed", failure } });
        await recordAudit(tx, {
          actorType: "admin",
          actorId: params.actorUserId ?? null,
          action: "payment.refund_refused",
          entityType: "payment",
          entityId: params.paymentId,
          after: { refundId: claimed.refundId, failure },
        });
      });
      triggerAlert("refund_refused", "Razorpay refused a refund", { refundId: claimed.refundId, failure });
      return { ok: false, code: "GATEWAY_REFUSED", refundId: claimed.refundId, failure };
    }
    await db.paymentRefund.update({ where: { id: claimed.refundId }, data: { failure } });
    triggerAlert("refund_outcome_unknown", "A refund request's outcome is unknown; it stays in flight until Razorpay's record is checked", {
      refundId: claimed.refundId,
      failure,
    });
    return { ok: false, code: "OUTCOME_UNKNOWN", refundId: claimed.refundId, failure };
  }

  await applyGatewayRefund(claimed.refundId, { refundId: accepted.refundId, status: accepted.status, amountPaise: claimed.amountPaise }, {
    actorType: "admin",
    actorId: params.actorUserId ?? null,
    source: "refund_request",
  });
  return { ok: true, refundId: claimed.refundId, status: accepted.status };
}

/**
 * Bring one refund row in line with Razorpay's record of it. Idempotent; a
 * processed refund never moves again. Returns the row's status afterwards.
 */
export async function applyGatewayRefund(
  refundRowId: string,
  gateway: GatewayRefund | (RefundAccepted & { amountPaise: number }),
  meta: { actorType: "admin" | "system"; actorId?: string | null; source: string }
): Promise<string | null> {
  return db.$transaction(async (tx) => {
    const row = await tx.paymentRefund.findUnique({ where: { id: refundRowId } });
    if (!row) return null;
    if (row.amountPaise !== gateway.amountPaise) {
      triggerAlert("refund_amount_mismatch", "Razorpay reports a different refund amount than was requested", {
        refundId: row.id,
        requested: row.amountPaise,
        reported: gateway.amountPaise,
      });
      return row.status;
    }
    if (row.status === "processed" || row.status === gateway.status) {
      if (!row.gatewayRefundId) await tx.paymentRefund.update({ where: { id: row.id }, data: { gatewayRefundId: gateway.refundId } });
      return row.status;
    }
    if (row.status === "failed" && gateway.status !== "processed") return row.status;
    if (row.status === "failed" && gateway.status === "processed") {
      // Razorpay sent the money after all. The record must say so, loudly.
      triggerAlert("refund_processed_after_failure", "A refund recorded as failed was processed by Razorpay", { refundId: row.id });
    }
    await tx.paymentRefund.update({
      where: { id: row.id },
      data: { status: gateway.status, gatewayRefundId: gateway.refundId, ...(gateway.status === "failed" ? { failure: row.failure ?? "GATEWAY_FAILED" } : {}) },
    });
    await recordAudit(tx, {
      actorType: meta.actorType,
      actorId: meta.actorId ?? null,
      action: `payment.refund_${gateway.status}`,
      entityType: "payment",
      entityId: row.paymentId,
      before: { refundStatus: row.status },
      after: { refundId: row.id, refundStatus: gateway.status, gatewayRefundId: gateway.refundId, source: meta.source },
    });
    if (gateway.status === "processed") await settlePaymentIfCovered(tx, row.paymentId);
    if (gateway.status === "failed") {
      triggerAlert("refund_failed", "Razorpay reports a refund failed; the payment is owed again", { refundId: row.id });
    }
    return gateway.status;
  });
}

/**
 * Ask Razorpay what became of an in-flight refund (after a timeout, or when the
 * webhook is late). No record at Razorpay for a request older than ten minutes
 * means it never arrived, so the payment is freed for another attempt.
 */
export async function checkRefundWithGateway(
  refundRowId: string,
  deps: { provider: Pick<PaymentProvider, "findRefund">; now?: Date },
  meta: { actorType: "admin" | "system"; actorId?: string | null }
): Promise<{ status: string | null; found: boolean }> {
  const row = await db.paymentRefund.findUnique({
    where: { id: refundRowId },
    include: { payment: { select: { gatewayPaymentId: true } } },
  });
  if (!row) return { status: null, found: false };
  if (!(IN_FLIGHT as readonly string[]).includes(row.status)) return { status: row.status, found: true };
  if (!row.payment.gatewayPaymentId) return { status: row.status, found: false };
  const found = await deps.provider.findRefund(row.payment.gatewayPaymentId, row.id);
  if (found) {
    return { status: await applyGatewayRefund(row.id, found, { ...meta, source: "gateway_check" }), found: true };
  }
  const ageMs = (deps.now ?? new Date()).getTime() - row.createdAt.getTime();
  if (row.status === "requested" && ageMs > 10 * 60 * 1000) {
    await db.$transaction(async (tx) => {
      await tx.paymentRefund.updateMany({
        where: { id: row.id, status: "requested" },
        data: { status: "failed", failure: row.failure ?? "NOT_AT_GATEWAY" },
      });
      await recordAudit(tx, {
        actorType: meta.actorType,
        actorId: meta.actorId ?? null,
        action: "payment.refund_not_at_gateway",
        entityType: "payment",
        entityId: row.paymentId,
        after: { refundId: row.id },
      });
    });
    return { status: "failed", found: false };
  }
  return { status: row.status, found: false };
}

/**
 * A `refund.*` webhook. Matches our row by Razorpay's refund id, else by the
 * receipt we sent. A refund made in the Razorpay dashboard (no receipt of ours)
 * is recorded too, so the books here agree with Razorpay's.
 */
export async function applyRefundWebhook(entity: {
  id?: unknown;
  payment_id?: unknown;
  amount?: unknown;
  status?: unknown;
  receipt?: unknown;
}): Promise<"applied" | "ignored" | "recorded_external" | "unknown_payment"> {
  const refundId = typeof entity.id === "string" ? entity.id : null;
  const paymentRef = typeof entity.payment_id === "string" ? entity.payment_id : null;
  const amount = typeof entity.amount === "number" && Number.isInteger(entity.amount) ? entity.amount : null;
  const status = entity.status === "processed" || entity.status === "pending" || entity.status === "failed" ? entity.status : null;
  if (!refundId || !paymentRef || amount === null || !status) return "ignored";

  const receipt = typeof entity.receipt === "string" ? entity.receipt : null;
  const row =
    (await db.paymentRefund.findUnique({ where: { gatewayRefundId: refundId } })) ??
    (receipt && /^[0-9a-f-]{36}$/i.test(receipt)
      ? await db.paymentRefund.findFirst({ where: { id: receipt, payment: { gatewayPaymentId: paymentRef } } })
      : null);
  if (row) {
    await applyGatewayRefund(row.id, { refundId, status, amountPaise: amount }, { actorType: "system", source: "webhook" });
    return "applied";
  }

  const payment = await db.payment.findFirst({ where: { gatewayPaymentId: paymentRef }, select: { id: true, orderId: true } });
  if (!payment) return "unknown_payment";
  try {
    await db.$transaction(async (tx) => {
      await tx.paymentRefund.create({
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          amountPaise: amount,
          status,
          gatewayRefundId: refundId,
          reason: "Refunded in the Razorpay dashboard, outside Vertical Express",
          actorEmail: "razorpay-dashboard",
        },
      });
      await recordAudit(tx, {
        actorType: "system",
        action: "payment.refund_external",
        entityType: "payment",
        entityId: payment.id,
        after: { gatewayRefundId: refundId, amountPaise: amount, refundStatus: status },
      });
      if (status === "processed") await settlePaymentIfCovered(tx, payment.id);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      /* Either this refund is already recorded (a redelivery), or one of ours is
         in flight for the same payment and Razorpay's refund is a different one.
         The second needs a person. */
      const already = await db.paymentRefund.findUnique({ where: { gatewayRefundId: refundId } });
      if (already) return "applied";
      triggerAlert("refund_external_conflict", "A dashboard refund arrived while one of ours is in flight for the same payment", {
        gatewayRefundId: refundId,
      });
      return "ignored";
    }
    throw e;
  }
  return "recorded_external";
}

/** Refunds for the payments console, newest first. */
export async function listRecentRefunds(take = 50) {
  return db.paymentRefund.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      amountPaise: true,
      status: true,
      gatewayRefundId: true,
      reason: true,
      actorEmail: true,
      failure: true,
      createdAt: true,
      updatedAt: true,
      paymentId: true,
      order: { select: { orderNo: true } },
    },
  });
}
