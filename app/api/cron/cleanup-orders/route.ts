import { NextResponse } from "next/server";
import { cleanupExpiredPendingOrders } from "@/lib/services/orders";

/** GET /api/cron/cleanup-orders — release inventory from expired pending_payment orders. */
export async function GET() {
  try {
    const cancelledCount = await cleanupExpiredPendingOrders(15);
    return NextResponse.json({ status: "ok", cancelledCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cleanup error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
