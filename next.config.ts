import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Origin of a configured URL, or null when it is unset or unparseable.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` carries credentials in the userinfo position
 * (`https://<key>@o0.ingest.sentry.io/0`); `URL.origin` drops them, so nothing
 * secret can reach a response header through here.
 */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Mirrors how `lib/observability` resolves the DSN, so the policy cannot allow a
// different ingest host than the one the app actually reports to. Only the
// origin is used — the key in the DSN's userinfo never reaches the header.
const sentryOrigin = originOf(
  process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
);
const posthogOrigin =
  originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://app.posthog.com";

/**
 * Razorpay Checkout.
 *
 * Checkout.js is loaded from `checkout.razorpay.com` but talks to several sibling
 * hosts at runtime (`api.razorpay.com`, `cdn.razorpay.com`, and their analytics
 * host), and Razorpay publishes no authoritative CSP host list. A missing host
 * here does not degrade gracefully — it silently breaks the payment modal, which
 * is the one screen that must never break.
 *
 * So the wildcard is deliberate: it is scoped to the single payment provider we
 * have integrated on purpose, and it is narrower than the `'unsafe-inline'` we
 * already have to carry for scripts. Revisit if Razorpay ever publishes an
 * explicit list.
 */
const RAZORPAY = "https://*.razorpay.com";

/**
 * Content Security Policy — ISS-022.
 *
 * Deliberately NOT nonce-based. Next.js applies nonces during server-side
 * rendering, so a nonce forces every page to render dynamically: "Static
 * optimization and Incremental Static Regeneration (ISR) are disabled" — which
 * would cost all 96 prerendered pages. On mid-tier Android over degrading 4G
 * that is a worse trade than the weaker `script-src` this policy accepts.
 * Owner-approved; see the Next.js CSP guide, "Without Nonces".
 *
 * `'unsafe-inline'` on `script-src` is therefore load-bearing: it covers the
 * three JSON-LD blocks (`site-jsonld`, and the category and product switchers),
 * whose content is dynamic and so cannot be covered by a static hash. The one
 * genuinely executable inline script the app used to ship — the invoice print
 * handler — was removed in favour of a client component, so no application code
 * depends on `'unsafe-inline'` any more; only Next's own framework inlines and
 * the JSON-LD do.
 *
 * `style-src` needs `'unsafe-inline'` for Next's injected styles and for the
 * styles Razorpay's modal writes at runtime.
 */
export function contentSecurityPolicy(isDev: boolean): string {
  return [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  // 'unsafe-eval' is required in development only — React uses eval to rebuild
  // server error stacks in the browser. Neither React nor Next use it in production.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${RAZORPAY} ${posthogOrigin}`,
  `style-src 'self' 'unsafe-inline'`,
  // Supabase Storage is the provisioned image host (DEC-011); product imagery
  // moves there with admin product management (ISS-019).
  `img-src 'self' data: blob: ${RAZORPAY}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  `font-src 'self' data:`,
  [
    `connect-src 'self'`,
    RAZORPAY,
    posthogOrigin,
    supabaseOrigin,
    sentryOrigin,
    // Turbopack HMR runs over a websocket in development.
    isDev ? "ws: wss:" : null,
  ]
    .filter(Boolean)
    .join(" "),
  `frame-src 'self' ${RAZORPAY}`,
  `worker-src 'self' blob:`,
  `media-src 'self'`,
  `manifest-src 'self'`,
  // Would break plain-http localhost in development.
  isDev ? null : `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Security headers — ISS-022.
 *
 * Applied at `/(.*)`, which covers static pages too: Next checks headers before
 * the filesystem. HSTS is supplied by Vercel and is not repeated here.
 */
export function securityHeaders(isDev: boolean) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    // Superseded by frame-ancestors above, kept for browsers that predate it.
    { key: "X-Frame-Options", value: "DENY" },
  ];
}

/**
 * The config is a function of the build PHASE, not of `process.env.NODE_ENV`.
 *
 * Next loads this file before it settles NODE_ENV, defaulting it to
 * "development" when the shell has not set it. A `NODE_ENV === "development"`
 * check here therefore reported *development* during `next build`, and an
 * earlier revision of this change baked `'unsafe-eval'` into the production
 * CSP — silently, because the header test imported the config under
 * `NODE_ENV=test` and so evaluated a different branch than the build did.
 *
 * The phase is supplied by Next itself and is unambiguous.
 */
export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    async headers() {
      return [{ source: "/(.*)", headers: securityHeaders(isDev) }];
    },

    outputFileTracingRoot: process.cwd(),
    turbopack: {
      root: process.cwd(),
    },

    experimental: {
      /**
     * Static generation concurrency, sized to the database connection pool.
     *
     * `generateStaticParams` prerenders every published product page — around 45
     * today and growing with the catalogue. Each one runs Prisma queries, and
     * `DATABASE_URL` points at the Supabase pooler with `connection_limit=5` and
     * a 10s pool timeout. At Next's default concurrency the build opened more
     * concurrent queries than the pool allows, and pages failed with:
     *
     *   Timed out fetching a new connection from the connection pool
     *
     * It failed on a different product each run, which is the signature of pool
     * exhaustion rather than a bad page. Because `vercel-build` runs `next build`,
     * a flaky prerender is a flaky deploy.
     *
     * Concurrency is held below the connection limit so queued pages wait on the
     * scheduler instead of racing for a connection. The retry covers a genuinely
     * slow response rather than masking a real error — a page that fails twice
       * still fails the build.
       */
      staticGenerationMaxConcurrency: 2,
      staticGenerationRetryCount: 2,
    },
  };
}
