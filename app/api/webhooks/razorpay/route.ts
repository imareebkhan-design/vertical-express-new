import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/prisma/generated/client/client";
import { verifyRazorpayWebhook } from "@/lib/services/payments";
import { db } from "@/lib/db";
import { settleCapturedPayment } from "@/lib/services/checkout";
import { applyRefundWebhook } from "@/lib/services/refunds";
import { runWithContext, trackEvent, MetricsTracker, captureException, triggerAlert } from "@/lib/observability";
import { recordCaptureException, type CaptureExceptionInput } from "@/lib/services/payment-exceptions";

/** The amount Razorpay reports as captured, in paise, or null if the payload
 *  carries no integer amount. Same precedence the settlement path uses. */
function capturedAmountFrom(
  paymentEntity: { amount?: unknown } | undefined,
  orderEntity: { amount_paid?: unknown; amount?: unknown } | undefined
): number | null {
  const raw = paymentEntity?.amount ?? orderEntity?.amount_paid ?? orderEntity?.amount;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function currencyFrom(paymentEntity: { currency?: unknown } | undefined, orderEntity: { currency?: unknown } | undefined) {
  const c = paymentEntity?.currency ?? orderEntity?.currency;
  return typeof c === "string" ? c : null;
}

/**
 * Persist a signed capture that cannot be settled (A-3), then acknowledge it.
 *
 * Recorded → 200, so Razorpay stops retrying; the alert fires on first sight
 * only (a replay hits the unique key and is `already_recorded`). If recording
 * itself fails the webhook must NOT answer 200 — the evidence would be lost —
 * so it alerts and answers 500, and Razorpay retries.
 */
async function recordAndAcknowledge(
  input: CaptureExceptionInput,
  alert: { type: string; message: string; metadata: Record<string, unknown> },
  metric: MetricsTracker
) {
  let outcome;
  try {
    outcome = await recordCaptureException(input);
  } catch (e) {
    captureException(e, { reason: input.reason, razorpayPaymentId: input.gatewayPaymentId });
    triggerAlert(
      "webhook_exception_record_failed",
      "A Razorpay capture that needs investigation could not be recorded; answering 500 so Razorpay retries",
      { ...alert.metadata, reason: input.reason, alertType: alert.type }
    );
    metric.end("webhook_exception_record_failed", { reason: input.reason });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
  if (outcome === "recorded") triggerAlert(alert.type, alert.message, alert.metadata);
  metric.end(`webhook_${input.reason}_${outcome}`, { event: input.event });
  return NextResponse.json({
    status: outcome === "already_recorded" ? "already_recorded" : `${input.reason}_recorded`,
  });
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  
  return runWithContext({ requestId }, async () => {
    const metric = new MetricsTracker("webhook-service");
    try {
      const signature = req.headers.get("x-razorpay-signature");
      if (!signature) {
        metric.end("webhook_missing_signature");
        return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
      }

      const rawBody = await req.text();
      const isValid = verifyRazorpayWebhook(rawBody, signature);
      if (!isValid) {
        /* The header is whatever the caller sent; it is not logged. */
        triggerAlert("webhook_signature_failed", "Invalid Razorpay webhook signature");
        metric.end("webhook_invalid_signature");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }

      const payload = JSON.parse(rawBody);
      const event = payload.event as string;

      /* Refund events (ISS-025): matched to our refund row by Razorpay's refund
         id or the receipt we sent; dashboard refunds are recorded too. Handled
         before the payment paths, which key their dedupe on the payment row. */
      if (typeof event === "string" && event.startsWith("refund.")) {
        const refundEntity = payload.payload?.refund?.entity ?? {};
        const outcome = await applyRefundWebhook(refundEntity);
        if (outcome === "unknown_payment") {
          /* Money went back to someone for a payment this database has no row
             for. Acknowledged so Razorpay stops retrying, but never silently. */
          triggerAlert("webhook_refund_unmatched", "Razorpay reported a refund for a payment we have no record of", {
            event,
            razorpayRefundId: refundEntity.id,
            razorpayPaymentId: refundEntity.payment_id,
          });
        }
        metric.end("webhook_refund", { event, outcome });
        return NextResponse.json({ status: `refund_${outcome}` });
      }
      /* Razorpay sends the event id ONLY in the `x-razorpay-event-id` header —
         its webhook body has no `event_id`. The header is authoritative; the
         body field is a fallback for callers that put it there. Reading only
         the body left gatewayEventId NULL for every real delivery and skipped
         the dedupe fast path (verified against a real delivery, 21 Sep 2026). */
      const headerEventId = req.headers.get("x-razorpay-event-id")?.trim() || undefined;
      const bodyEventId = typeof payload.event_id === "string" ? payload.event_id : undefined;
      const eventId = headerEventId ?? bodyEventId;
      const paymentEntity = payload.payload?.payment?.entity;
      const orderEntity = payload.payload?.order?.entity;

      const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;
      /* Only the ids the payload actually carries. An undefined field inside
         an OR is dropped by Prisma, and the empty condition left behind
         matches every payment — findFirst would then pick an unrelated one.
         An empty OR matches nothing, which is the right answer here. */
      const paymentKeys = [
        ...(razorpayOrderId ? [{ gatewayOrderId: razorpayOrderId }] : []),
        ...(razorpayPaymentId ? [{ gatewayPaymentId: razorpayPaymentId }] : []),
      ];

      if (!razorpayOrderId) {
        /* A signed capture with no Razorpay order id cannot belong to any order
           here (checkout always creates one), so unless a payment row already
           carries its payment id it is money nothing accounts for (A-3). */
        if ((event === "payment.captured" || event === "order.paid") && razorpayPaymentId) {
          const known = await db.payment.findFirst({ where: { gatewayPaymentId: razorpayPaymentId }, select: { id: true } });
          if (!known) {
            const amountPaise = capturedAmountFrom(paymentEntity, orderEntity);
            return recordAndAcknowledge(
              {
                reason: "unmatched",
                gatewayPaymentId: razorpayPaymentId,
                gatewayEventId: eventId,
                event,
                amountPaise,
                currency: currencyFrom(paymentEntity, orderEntity),
              },
              {
                type: "webhook_capture_unmatched",
                message: "Razorpay reported a captured payment that matches no order here",
                metadata: { event, razorpayOrderId: null, razorpayPaymentId, amountPaise },
              },
              metric
            );
          }
        }
        metric.end("webhook_ignored_no_order_id", { event });
        return NextResponse.json({ status: "ignored_no_order_id" });
      }

      // Fast-path deduplication check
      if (eventId) {
        const alreadyProcessed = await db.payment.findFirst({
          where: { gatewayEventId: eventId },
        });
        if (alreadyProcessed) {
          metric.end("webhook_already_processed", { eventId, event });
          return NextResponse.json({ status: "already_processed" });
        }
      }

      if (event === "payment.captured" || event === "order.paid") {
        const existingPayment = await db.payment.findFirst({
          where: {
            OR: paymentKeys,
          },
          include: { order: true },
        });

        if (existingPayment) {
          // Extract and verify amount paid in Paise
          let capturedAmountPaise: number | null = null;
          if (paymentEntity?.amount !== undefined && paymentEntity?.amount !== null) {
            capturedAmountPaise = Number(paymentEntity.amount);
          } else if (orderEntity?.amount_paid !== undefined && orderEntity?.amount_paid !== null) {
            capturedAmountPaise = Number(orderEntity.amount_paid);
          } else if (orderEntity?.amount !== undefined && orderEntity?.amount !== null) {
            capturedAmountPaise = Number(orderEntity.amount);
          }

          /* A valid amount that differs from what the payment expects: real
             money in the wrong amount. Recorded and acknowledged (A-3) — a 400
             made Razorpay retry for hours and changed nothing. A payload with no
             usable amount at all is still rejected below. */
          if (
            capturedAmountPaise !== null &&
            Number.isInteger(capturedAmountPaise) &&
            capturedAmountPaise !== existingPayment.amountPaise &&
            razorpayPaymentId
          ) {
            return recordAndAcknowledge(
              {
                reason: "amount_mismatch",
                gatewayPaymentId: razorpayPaymentId,
                gatewayOrderId: razorpayOrderId,
                gatewayEventId: eventId,
                event,
                amountPaise: capturedAmountPaise,
                currency: currencyFrom(paymentEntity, orderEntity),
                expectedAmountPaise: existingPayment.amountPaise,
                orderId: existingPayment.orderId,
              },
              {
                type: "webhook_amount_mismatch",
                message: "Razorpay webhook payment amount mismatch or invalid",
                metadata: {
                  expected: existingPayment.amountPaise,
                  received: capturedAmountPaise,
                  orderNo: existingPayment.order.orderNo,
                },
              },
              metric
            );
          }

          if (
            capturedAmountPaise === null ||
            isNaN(capturedAmountPaise) ||
            !Number.isInteger(capturedAmountPaise) ||
            capturedAmountPaise !== existingPayment.amountPaise
          ) {
            triggerAlert(
              "webhook_amount_mismatch",
              "Razorpay webhook payment amount mismatch or invalid",
              {
                expected: existingPayment.amountPaise,
                received: capturedAmountPaise,
                orderNo: existingPayment.order.orderNo,
              }
            );
            metric.end("webhook_amount_mismatch");
            return NextResponse.json(
              { error: "Payment amount mismatch or invalid" },
              { status: 400 }
            );
          }
          try {
            const outcome = await settleCapturedPayment({
              paymentId: existingPayment.id,
              orderId: existingPayment.orderId,
              orderNo: existingPayment.order.orderNo,
              amountPaise: existingPayment.amountPaise,
              gatewayPaymentId: razorpayPaymentId || existingPayment.gatewayPaymentId,
              eventId,
              raw: payload,
              source: "webhook",
              note: `Razorpay webhook event: ${event}`,
            });
            if (outcome === "late_recorded" || outcome === "late_already_recorded") {
              /* 200, not an error: Razorpay must stop retrying. The capture is
                 recorded and flagged for a human; see `settleCapturedPayment`. */
              metric.end("webhook_late_payment", { event, outcome });
              return NextResponse.json({ status: "late_payment_recorded" });
            }
          } catch (e) {
            captureException(e, { razorpayOrderId, razorpayPaymentId });
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
              metric.end("webhook_already_processed_race", { event });
              return NextResponse.json({ status: "already_processed" });
            }
            throw e;
          }
        } else {
          /* A signed capture for an order this database has no payment row for:
             money Razorpay holds that no order here accounts for. Recorded for
             the Payments screen and acknowledged (a retry cannot make the row
             appear), A-3. */
          if (razorpayPaymentId) {
            const amountPaise = capturedAmountFrom(paymentEntity, orderEntity);
            return recordAndAcknowledge(
              {
                reason: "unmatched",
                gatewayPaymentId: razorpayPaymentId,
                gatewayOrderId: razorpayOrderId,
                gatewayEventId: eventId,
                event,
                amountPaise,
                currency: currencyFrom(paymentEntity, orderEntity),
              },
              {
                type: "webhook_capture_unmatched",
                message: "Razorpay reported a captured payment that matches no order here",
                metadata: { event, razorpayOrderId, razorpayPaymentId, amountPaise },
              },
              metric
            );
          }
          /* No payment id to key a record on (an order-only payload): alert
             only, as before. Real Razorpay captures always carry one. */
          triggerAlert("webhook_capture_unmatched", "Razorpay reported a captured payment that matches no order here", {
            event,
            razorpayOrderId,
            razorpayPaymentId,
            amountPaise: paymentEntity?.amount ?? orderEntity?.amount_paid ?? null,
          });
          metric.end("webhook_capture_unmatched", { event });
          return NextResponse.json({ status: "unmatched_no_payment_id" });
        }
      } else if (event === "payment.failed") {
        const existingPayment = await db.payment.findFirst({
          where: {
            OR: paymentKeys,
          },
          include: { order: true },
        });

        if (existingPayment) {
          try {
            /* A failure report never downgrades money that has already been
               captured: Razorpay can deliver a failed *attempt's* event after the
               retry that succeeded. */
            await db.payment.updateMany({
              where: { id: existingPayment.id, status: { in: ["created", "authorized", "failed"] } },
              data: {
                status: "failed",
                gatewayPaymentId: razorpayPaymentId || existingPayment.gatewayPaymentId,
                gatewayEventId: eventId || existingPayment.gatewayEventId,
                raw: payload,
              },
            });
            trackEvent("payment_failure", { orderNo: existingPayment.order.orderNo, gatewayPaymentId: razorpayPaymentId });
          } catch (e) {
            captureException(e, { razorpayOrderId, razorpayPaymentId });
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
              metric.end("webhook_already_processed_race", { event });
              return NextResponse.json({ status: "already_processed" });
            }
            throw e;
          }
        }
      }

      metric.end("webhook_success", { event });
      return NextResponse.json({ status: "ok" });
    } catch (err: unknown) {
      captureException(err);
      metric.end("webhook_error");
      /* Captured above with its detail; the caller gets no internals. */
      return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
    }
  });
}
