import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRazorpayWebhook } from "@/lib/services/payments";
import { markOrderPaid } from "@/lib/services/checkout";

// Webhooks must read the raw body for signature verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/razorpay — asynchronous payment reconciliation (P0-2).
 * Verifies the signature, then confirms/fails the order. Idempotent: replays
 * and out-of-order deliveries are safe (markOrderPaid no-ops once confirmed;
 * gatewayEventId de-dupes at the DB level).
 */
export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();

  if (!verifyRazorpayWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: {
    id?: string;
    event?: string;
    payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Idempotency: record the gateway event id once; ignore replays.
  if (event.id) {
    const seen = await db.payment.findFirst({ where: { gatewayEventId: event.id } });
    if (seen) return NextResponse.json({ ok: true, deduped: true });
  }

  const rzpOrderId = event.payload?.payment?.entity?.order_id;
  const rzpPaymentId = event.payload?.payment?.entity?.id;

  if (event.event === "payment.captured" && rzpOrderId && rzpPaymentId) {
    // Find our order via the Razorpay order id stored on the payment row.
    const payment = await db.payment.findFirst({
      where: { gatewayOrderId: rzpOrderId },
      include: { order: { select: { orderNo: true } } },
    });
    if (payment?.order) {
      await markOrderPaid({ orderNo: payment.order.orderNo, gatewayPaymentId: rzpPaymentId });
      if (event.id) {
        await db.payment.updateMany({
          where: { id: payment.id },
          data: { gatewayEventId: event.id },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
