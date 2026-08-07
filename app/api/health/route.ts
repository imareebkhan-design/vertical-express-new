import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/health — Production SRE Health Check Endpoint.
 * Used by load balancers, uptime monitors, and Kubernetes/Vercel probes.
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus = "ok";
  let healthy = true;

  try {
    // Verify PostgreSQL database connection
    await db.$queryRaw`SELECT 1`;
  } catch (err: unknown) {
    dbStatus = err instanceof Error ? err.message : "database_unreachable";
    healthy = false;
  }

  const envStatus = {
    supabaseConfigured: !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
    paymentGateway: process.env.PAYMENT_GATEWAY || "dummy",
    otpChannel: process.env.AUTH_OTP_CHANNEL || "email",
  };

  const status = healthy ? "ok" : "unhealthy";
  const httpStatus = healthy ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp,
      checks: {
        database: dbStatus,
        environment: envStatus,
      },
    },
    {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
