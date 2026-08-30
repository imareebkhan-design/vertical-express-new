import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook — runs once when a server process starts.
 *
 * ISS-002: refuse to boot a production server that is not configured with a real
 * payment gateway, and log which gateway is active at startup. In development
 * this only logs; `assertPaymentConfig()` throws exclusively in a misconfigured
 * production environment.
 *
 * ISS-012: initialise Sentry for whichever runtime is starting. The runtime
 * configs are imported rather than inlined so the Node-only options in
 * `sentry.server.config.ts` never reach the Edge bundle.
 */
export async function register(): Promise<void> {
  // Sentry first, so that a failure of the payment assertion below is itself
  // reported rather than only appearing in a cold-start log nobody reads.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertPaymentConfig } = await import("@/lib/services/payments");
  assertPaymentConfig();
}

/**
 * Captures unhandled server-side request errors — Server Components, Server
 * Actions, route handlers — which otherwise surface only as a 500.
 */
export const onRequestError = Sentry.captureRequestError;
