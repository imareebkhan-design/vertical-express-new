import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { cleanupExpiredPendingOrders } from "@/lib/services/orders";
import { runWithContext, MetricsTracker, captureException } from "@/lib/observability";

/**
 * Timing-safe comparison for two UTF-8 strings (ISS-043).
 *
 * `timingSafeEqualHex` in `lib/services/payments.ts` decodes its inputs as hex,
 * which is right for an HMAC digest and wrong for an arbitrary secret. This is
 * the same guard for a plain string. Unequal lengths short-circuit — that leaks
 * the length of the secret and nothing else, which is the standard trade the
 * payment webhook already makes.
 */
function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Authorises a scheduled invocation (ISS-043).
 *
 * Vercel sends `CRON_SECRET` as an `Authorization: Bearer …` header on every
 * cron invocation, so the platform's own mechanism is the whole check — no new
 * dependency and no bespoke scheme.
 *
 * **Fails closed.** An unset `CRON_SECRET` denies rather than allows. This
 * endpoint cancels orders and returns stock to inventory; the cost of refusing
 * a legitimate run is one missed five-minute cycle that the next run reconciles,
 * while the cost of allowing an anonymous one is unauthenticated mutation of
 * order and inventory state. Same reasoning as the OTP limiter in DEC-016.
 */
function isAuthorisedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  return timingSafeEqualUtf8(header, `Bearer ${secret}`);
}

/** GET /api/cron/cleanup-orders — release inventory from expired pending_payment orders. */
export async function GET(request: NextRequest) {
  // Checked before any database access, so an unauthorised caller cannot use
  // this endpoint to generate load against the connection pool.
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
