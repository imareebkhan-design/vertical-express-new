import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/prisma/generated/client/client";
import { verifyRazorpayWebhook } from "@/lib/services/payments";
import { db } from "@/lib/db";
import { settleCapturedPayment } from "@/lib/services/checkout";
import { runWithContext, trackEvent, MetricsTracker, captureException, triggerAlert } from "@/lib/observability";

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
        triggerAlert("webhook_signature_failed", "Invalid Razorpay webhook signature", { signature });
        metric.end("webhook_invalid_signature");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }

      const payload = JSON.parse(rawBody);
      const event = payload.event as string;
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
