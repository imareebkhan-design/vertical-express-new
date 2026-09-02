import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/prisma/generated/client/client";
import { verifyRazorpayWebhook } from "@/lib/services/payments";
import { db } from "@/lib/db";
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
      const eventId = payload.event_id as string | undefined;
      const paymentEntity = payload.payload?.payment?.entity;
      const orderEntity = payload.payload?.order?.entity;

      const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;

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
            OR: [
              { gatewayOrderId: razorpayOrderId },
              { gatewayPaymentId: razorpayPaymentId },
            ],
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
            await db.$transaction(async (tx) => {
              await tx.payment.update({
                where: { id: existingPayment.id },
                data: {
                  status: "captured",
                  gatewayPaymentId: razorpayPaymentId || existingPayment.gatewayPaymentId,
                  gatewayEventId: eventId || existingPayment.gatewayEventId,
                  signatureVerified: true,
                  raw: payload,
                },
              });

              if (existingPayment.order.status === "pending_payment") {
                await tx.order.update({
                  where: { id: existingPayment.orderId },
                  data: { status: "confirmed" },
                });

                await tx.orderStatusEvent.create({
                  data: {
                    orderId: existingPayment.orderId,
                    fromStatus: "pending_payment",
                    toStatus: "confirmed",
                    note: `Razorpay webhook event: ${event}`,
                  },
                });
              }
            });
            trackEvent("payment_success", { orderNo: existingPayment.order.orderNo, gatewayPaymentId: razorpayPaymentId });
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
            OR: [
              { gatewayOrderId: razorpayOrderId },
              { gatewayPaymentId: razorpayPaymentId },
            ],
          },
          include: { order: true },
        });

        if (existingPayment) {
          try {
            await db.payment.update({
              where: { id: existingPayment.id },
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
      const message = err instanceof Error ? err.message : "Webhook processing error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
