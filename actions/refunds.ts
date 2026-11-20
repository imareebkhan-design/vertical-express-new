"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { activeGateway, getPaymentProvider } from "@/lib/services/payments";
import { checkRefundWithGateway, MIN_REASON_LENGTH, requestRefund } from "@/lib/services/refunds";
import { type ActionErrorCode, type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Refunds from the payments console (ISS-025, money that was never owed).
 * The service decides eligibility and amount; the screen sends only which
 * payment and why.
 */

const refundSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(MIN_REASON_LENGTH, `Say why, in at least ${MIN_REASON_LENGTH} characters`).max(500),
});

const MESSAGES: Record<string, string> = {
  INVALID_REASON: `Say why, in at least ${MIN_REASON_LENGTH} characters`,
  NOT_FOUND: "That payment no longer exists",
  NOT_CAPTURED: "Only a captured payment can be refunded",
  NOT_GATEWAY: "This payment was not taken through Razorpay, so it cannot be refunded here",
  NOT_OWED:
    "This payment pays for a live order. Refunds of delivered goods or part-refunds need the owner's refund policy and are not available yet",
  ALREADY_REFUNDED: "This payment has already been refunded in full",
  IN_FLIGHT: "A refund for this payment is already in progress",
  GATEWAY_REFUSED: "Razorpay refused the refund. Nothing was sent; the payment is still owed",
  OUTCOME_UNKNOWN:
    "Razorpay did not answer clearly. The refund stays in progress until Razorpay's record is checked — do not refund it again from the dashboard",
};

const ACTION_CODE: Record<string, ActionErrorCode> = {
  INVALID_REASON: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  NOT_CAPTURED: "CONFLICT",
  NOT_GATEWAY: "CONFLICT",
  NOT_OWED: "CONFLICT",
  ALREADY_REFUNDED: "CONFLICT",
  IN_FLIGHT: "CONFLICT",
  GATEWAY_REFUSED: "PAYMENT_FAILED",
  OUTCOME_UNKNOWN: "UNAVAILABLE",
};

export async function adminRefundPayment(
  input: unknown
): Promise<ActionResult<{ refundId: string; status: "processed" | "pending" }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");

  let provider;
  try {
    provider = getPaymentProvider(activeGateway());
  } catch {
    return fail("UNAVAILABLE", "The payment gateway is not configured on this server");
  }

  const outcome = await requestRefund(
    { paymentId: parsed.data.paymentId, reason: parsed.data.reason, actorEmail: admin.email, actorUserId: admin.id },
    { provider }
  );
  revalidatePath("/admin/payments");
  if (!outcome.ok) {
    return fail(ACTION_CODE[outcome.code] ?? "CONFLICT", MESSAGES[outcome.code] ?? "The refund could not be made", undefined, {
      outcome: outcome.code,
    });
  }
  return succeed({ refundId: outcome.refundId, status: outcome.status });
}

const checkSchema = z.object({ refundId: z.uuid() });

export async function adminCheckRefund(input: unknown): Promise<ActionResult<{ status: string | null; found: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That refund reference is not valid");
  try {
    const result = await checkRefundWithGateway(
      parsed.data.refundId,
      { provider: getPaymentProvider(activeGateway()) },
      { actorType: "admin", actorId: admin.id }
    );
    revalidatePath("/admin/payments");
    return succeed(result);
  } catch {
    return fail("UNAVAILABLE", "Razorpay could not be asked just now. Try again in a minute");
  }
}
