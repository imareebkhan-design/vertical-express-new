import { NextRequest, NextResponse } from "next/server";
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
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;

    if (!razorpayOrderId) {
      return NextResponse.json({ status: "ignored_no_order_id" });
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
        await db.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: "captured",
            gatewayPaymentId: razorpayPaymentId || existingPayment.gatewayPaymentId,
            signatureVerified: true,
            raw: payload,
          },
        });

        if (existingPayment.order.status === "pending_payment") {
          await db.order.update({
            where: { id: existingPayment.orderId },
            data: { status: "confirmed" },
          });

          await db.orderStatusEvent.create({
            data: {
              orderId: existingPayment.orderId,
              fromStatus: "pending_payment",
              toStatus: "confirmed",
              note: `Razorpay webhook event: ${event}`,
            },
          });
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
        await db.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: "failed",
            gatewayPaymentId: razorpayPaymentId || existingPayment.gatewayPaymentId,
            raw: payload,
          },
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
