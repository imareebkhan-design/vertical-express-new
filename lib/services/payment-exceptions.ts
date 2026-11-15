import "server-only";
import { db } from "@/lib/db";
import { Prisma, type PaymentExceptionReason } from "@/prisma/generated/client/client";

/**
 * Signed Razorpay captures the webhook could not settle (roadmap A-3).
 *
 * Two shapes, both money Razorpay holds that this database does not account
 * for: a capture whose ids match no order or payment here (`unmatched`), and a
 * capture that matches a payment row but for a different amount
 * (`amount_mismatch`). Before A-3 both raised a log alert and stored nothing —
 * and the mismatch answered 400, so Razorpay retried for hours and alerted on
 * every retry.
 *
 * Recording is idempotent by the database, not by a lookup: the unique key on
 * (gateway payment id, reason) means a replay, or two deliveries racing, insert
 * one row. The loser's P2002 is reported as `already_recorded`, which is what
 * keeps the alert to first sight.
 *
 * Deliberately read-only beyond this insert. What happens to the money — refund
 * it, attach it to an order — is the owner's policy, and nothing here decides it.
 */

export interface CaptureExceptionInput {
  reason: PaymentExceptionReason;
  gatewayPaymentId: string;
  gatewayOrderId?: string | null;
  gatewayEventId?: string | null;
  event: string;
  amountPaise: number | null;
  currency?: string | null;
  /** `amount_mismatch` only. */
  expectedAmountPaise?: number | null;
  /** `amount_mismatch` only: the order whose payment the capture claimed. */
  orderId?: string | null;
}

export type RecordOutcome = "recorded" | "already_recorded";

/** Throws on any failure other than "already recorded" — the caller must then
 *  NOT acknowledge the webhook, so Razorpay retries. */
export async function recordCaptureException(input: CaptureExceptionInput): Promise<RecordOutcome> {
  try {
    await db.paymentException.create({
      data: {
        reason: input.reason,
        gatewayPaymentId: input.gatewayPaymentId,
        gatewayOrderId: input.gatewayOrderId ?? null,
        gatewayEventId: input.gatewayEventId ?? null,
        event: input.event,
        amountPaise: input.amountPaise,
        currency: input.currency ?? null,
        expectedAmountPaise: input.expectedAmountPaise ?? null,
        orderId: input.orderId ?? null,
      },
    });
    return "recorded";
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "already_recorded";
    throw e;
  }
}

/** The Payments screen's "Needs investigation" list, newest first. Gateway ids,
 *  amounts and the claimed order's number and status only — no customer data. */
export async function listPaymentExceptions(limit = 100) {
  return db.paymentException.findMany({
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: {
      id: true,
      reason: true,
      gatewayPaymentId: true,
      gatewayOrderId: true,
      gatewayEventId: true,
      event: true,
      amountPaise: true,
      currency: true,
      expectedAmountPaise: true,
      receivedAt: true,
      order: { select: { orderNo: true, status: true } },
    },
  });
}

/** Every recorded exception. There is no resolved state yet, so this is all of them. */
export async function countPaymentExceptions() {
  return db.paymentException.count();
}
