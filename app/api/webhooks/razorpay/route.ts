import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyRazorpayWebhook } from "@/lib/services/payments";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
    }

    const rawBody = await req.text();
    const isValid = verifyRazorpayWebhook(rawBody, signature);
    if (!isValid) {
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
      return NextResponse.json({ status: "ignored_no_order_id" });
    }

    // Fast-path deduplication check
    if (eventId) {
      const alreadyProcessed = await db.payment.findFirst({
        where: { gatewayEventId: eventId },
      });
      if (alreadyProcessed) {
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
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
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
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            return NextResponse.json({ status: "already_processed" });
          }
          throw e;
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
