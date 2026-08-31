import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { captureException } from "@/lib/observability";

/**
 * GET /api/health — liveness for load balancers and uptime monitors.
 *
 * WHAT THIS DELIBERATELY DOES NOT SAY
 *
 * A health endpoint is unauthenticated and internet-facing, so everything it
 * returns is public. This one used to return the payment gateway in use, the
 * OTP channel, whether Supabase was configured, and — on a database failure —
 * the raw driver error message.
 *
 * That last one is the serious one: a Prisma or Postgres connection error
 * routinely carries the host, port, database name and user, so the endpoint was
 * most informative to an attacker at precisely the moment the system was
 * failing. The others were free reconnaissance: `paymentGateway: "dummy"`
 * announces that orders confirm without money changing hands (ISS-002).
 *
 * A monitor needs one bit: is this instance serving or not. That bit is the
 * HTTP status. The detail goes to the error tracker, where operators can see it
 * and the public cannot.
 */
export async function GET() {
  let healthy = true;

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (err: unknown) {
    healthy = false;
    captureException(err, { endpoint: "/api/health", check: "database" });
  }

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
