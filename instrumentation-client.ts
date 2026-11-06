import * as Sentry from "@sentry/nextjs";

/**
 * Sentry — browser runtime (ISS-012).
 *
 * Next.js loads this file into the client bundle itself; it is not imported from
 * `instrumentation.ts`. Only `NEXT_PUBLIC_SENTRY_DSN` can be read here — the
 * server-only `SENTRY_DSN` is not inlined into browser code, and must not be.
 *
 * Errors + tracing only. Session replay is the SDK's usual third recommendation
 * for a user-facing app and is a reasonable next step, but it records what people
 * type and see — on a checkout carrying names, phone numbers and site addresses,
 * that is a privacy decision for the owner rather than a default to switch on.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Server-only VE_DEPLOY_ENV is not inlined into browser code; the public name mirrors it.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  });
}

/** Reports App Router navigations as spans. Required for client-side tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
