import * as Sentry from "@sentry/nextjs";

/**
 * Sentry — Edge runtime (ISS-012).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === "edge"`, which for this
 * application means `middleware.ts` — the session refresh and the `/account`,
 * `/checkout`, `/admin` auth redirect. An error there logs nobody out visibly; it
 * just fails the request, so it is exactly the kind of fault worth reporting.
 *
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VE_DEPLOY_ENV ?? process.env.NODE_ENV ?? "development",
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  });
}
