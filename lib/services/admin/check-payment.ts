import "server-only";
import { db } from "@/lib/db";
import { reconcileWithGateway } from "@/lib/services/orders";
import type { CapturedLookup } from "@/lib/services/payments";
import { recordAudit } from "@/lib/services/audit";
import { captureException } from "@/lib/observability";
import { canCheckPayment, type AdminPaymentCheckResult } from "@/lib/admin-payment-check";

/**
 * "Check payment" on an order that is awaiting payment (roadmap B-4).
 *
 * A customer whose callback was lost, or whose webhook is late, has paid while
 * the console still says "awaiting payment". Until now an operator could only
 * wait for the expiry job, or try to cancel (which asks Razorpay first and
 * refuses). This asks Razorpay directly, through the same lookup every other
 * path uses (`reconcileWithGateway`): a capture at the order's amount settles
 * the order exactly as the webhook would — confirmation, outbox row and all —
 * and anything else changes nothing.
 *
 * It never cancels, restocks or marks anything paid by hand (architecture
 * principle 7: Razorpay is the authority). The gateway call is outside any
 * transaction; settlement is its own compare-and-set, safe against a webhook
 * arriving at the same moment, so pressing it twice is harmless.
 */
export async function adminCheckPayment(
  actorUserId: string,
  orderId: string,
  deps: { findCaptured?: (gatewayOrderId: string) => Promise<CapturedLookup | null> } = {}
): Promise<{ result: AdminPaymentCheckResult; orderNo: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      status: true,
      payments: { select: { gateway: true, gatewayOrderId: true, status: true } },
    },
  });
  if (!order) throw new Error("NOT_FOUND");

  let result: AdminPaymentCheckResult;
  if (order.status !== "pending_payment") {
    result = "not_pending";
  } else if (!canCheckPayment(order)) {
    result = "no_gateway_order";
  } else {
    const check = await reconcileWithGateway(order, { context: "admin_check", findCaptured: deps.findCaptured });
    result =
      check === "settled" ? "paid"
      : check === "late" ? "late"
      : check === "authorized" ? "in_progress"
      : check;
    /* The lookup only asks about payments not yet captured. A webhook or the
       customer's callback can confirm the order between the read above and
       that query, which leaves nothing to ask and reads as "not captured".
       Re-read before saying so: an order that moved is reported as moved, so
       the page refreshes instead of showing a wrong "no payment". */
    if (result !== "paid" && result !== "late") {
      const now = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (now && now.status !== "pending_payment") result = "not_pending";
    }
  }

  /* Who asked, and what Razorpay said. Only when Razorpay was actually asked:
     a press on an order that had nothing to ask about is not an event. The
     money change itself (if any) is recorded inside settlement's own
     transaction, as an order status event; this row is the operator's act,
     which has already happened and cannot roll back, so it gets its own. */
  if (result !== "not_pending" && result !== "no_gateway_order") {
    /* A failed audit write must not hide what Razorpay said: the order may
       already be confirmed, and reporting a failure here would tell the
       operator nothing changed. The failure is reported to monitoring. */
    try {
      await db.$transaction((tx) =>
        recordAudit(tx, {
          actorType: "admin",
          actorId: actorUserId,
          action: "order.payment_checked",
          entityType: "order",
          entityId: order.id,
          before: { status: order.status },
          after: { result },
        })
      );
    } catch (e) {
      captureException(e, { stage: "admin_check_payment_audit", orderNo: order.orderNo, result });
    }
  }

  return { result, orderNo: order.orderNo };
}
