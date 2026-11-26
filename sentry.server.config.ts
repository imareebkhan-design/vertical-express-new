import * as Sentry from "@sentry/nextjs";

/**
 * Sentry — Node.js server runtime (ISS-012).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === "nodejs"`.
 *
 * Scope is deliberately errors + tracing, the SDK's recommended default. Session
 * replay, structured logging, profiling and metrics are all supported by this SDK
 * and are all deferred — instrumenting them before anyone has read a single error
 * would be doing more than was asked.
 *
 * No DSN means no init, so an unconfigured environment is silently inert rather
 * than throwing at boot. That is the correct trade here specifically because
 * `instrumentation.ts` also runs `assertPaymentConfig()`, which *must* throw: a
 * missing error-reporting DSN should never be what stops the server from serving.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // NODE_ENV is "production" on staging too (managed hosts), so it cannot tell them apart.
    environment: process.env.VE_DEPLOY_ENV ?? process.env.NODE_ENV ?? "development",

    // 100% in development so a local error is always visible; 10% in production,
    // which is the SDK's recommended starting point and keeps quota predictable
    // while the traffic shape is still unknown.
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // No local variables and no default PII (20 Oct 2026). Stack-frame locals on
    // the commerce paths hold customers' names, phone numbers and site addresses;
    // sending them to a third party is the owner's privacy decision, not a default.
    sendDefaultPii: false,
  });
}
