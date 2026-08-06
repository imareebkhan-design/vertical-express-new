/**
 * Next.js instrumentation hook — runs once when a server process starts.
 *
 * ISS-002: refuse to boot a production server that is not configured with a real
 * payment gateway, and log which gateway is active at startup. In development
 * this only logs; `assertPaymentConfig()` throws exclusively in a misconfigured
 * production environment.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertPaymentConfig } = await import("@/lib/services/payments");
  assertPaymentConfig();
}
