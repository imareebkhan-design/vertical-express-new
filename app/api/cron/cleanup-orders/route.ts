import { NextResponse } from "next/server";
import { cleanupExpiredPendingOrders } from "@/lib/services/orders";
import { runWithContext, MetricsTracker, captureException } from "@/lib/observability";

/** GET /api/cron/cleanup-orders — release inventory from expired pending_payment orders. */
export async function GET() {
  const requestId = `cron-${crypto.randomUUID()}`;
  return runWithContext({ requestId }, async () => {
    const metric = new MetricsTracker("cron-service");
    try {
      const cancelledCount = await cleanupExpiredPendingOrders(15);
      metric.end("cleanup_orders_cron_success", { cancelledCount });
      return NextResponse.json({ status: "ok", cancelledCount });
    } catch (err: unknown) {
      captureException(err);
      metric.end("cleanup_orders_cron_failed");
      const message = err instanceof Error ? err.message : "Cleanup error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
