/**
 * ISS-022 — security headers and Content Security Policy.
 *
 * Asserts the policy the application ships rather than a live response: the
 * suite has no HTTP server, and `next.config.ts` is the single place the headers
 * are declared. A live check across the real routes is part of the browser
 * verification for this change, not of CI.
 *
 * The point of this test is regression, not discovery — these headers are easy
 * to weaken accidentally (dropping a directive while adding an origin, say), and
 * nothing else in the suite would notice.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import config from "@/next.config";

/**
 * Always resolved through the PRODUCTION BUILD phase — the same input Next gives
 * the config during `next build`. An earlier revision of this test called the
 * config with whatever `NODE_ENV` the test runner happened to set, so it
 * asserted a policy the build never emitted and passed while the real build
 * shipped `'unsafe-eval'`.
 */
async function headerMap(
  phase: string = PHASE_PRODUCTION_BUILD
): Promise<Map<string, string>> {
  const resolved = config(phase);
  assert.ok(resolved.headers, "next.config must define headers()");
  const routes = await resolved.headers();

  const all = routes.find((r) => r.source === "/(.*)");
  assert.ok(all, "security headers must apply to every route");

  return new Map(all.headers.map((h) => [h.key, h.value]));
}

async function cspDirectives(phase?: string): Promise<Map<string, string>> {
  const csp = (await headerMap(phase)).get("Content-Security-Policy");
  assert.ok(csp, "a Content-Security-Policy must be set");

  const entries = csp.split(";").map((part) => {
    const [name, ...rest] = part.trim().split(/\s+/);
    return [name, rest.join(" ")] as const;
  });
  return new Map(entries);
}

test("ISS-022: every hardening header is present on every route", async () => {
  const headers = await headerMap();

  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("X-Frame-Options"), "DENY");

  const permissions = headers.get("Permissions-Policy");
  assert.ok(permissions, "Permissions-Policy must be set");
  for (const feature of ["camera", "microphone", "geolocation"]) {
    assert.match(
      permissions,
      new RegExp(`${feature}=\\(\\)`),
      `Permissions-Policy must deny ${feature}`
    );
  }
});

test("ISS-022: the CSP locks down the directives that matter", async () => {
  const csp = await cspDirectives();

  assert.equal(csp.get("default-src"), "'self'");
  assert.equal(csp.get("object-src"), "'none'");
  assert.equal(csp.get("frame-ancestors"), "'none'");
  assert.equal(csp.get("base-uri"), "'self'");
  assert.equal(csp.get("form-action"), "'self'");
});

test("ISS-022: Razorpay checkout is allowed to load, frame and connect", async () => {
  // If any of these three regress, the payment modal silently stops working —
  // the one failure mode this policy must never introduce.
  const csp = await cspDirectives();

  for (const directive of ["script-src", "frame-src", "connect-src"]) {
    assert.match(
      csp.get(directive) ?? "",
      /razorpay\.com/,
      `${directive} must allow Razorpay`
    );
  }
});

test("ISS-022: the production build carries no 'unsafe-eval' and upgrades insecure requests", async () => {
  // 'unsafe-inline' is a deliberate, documented trade to keep static rendering
  // (owner-approved). 'unsafe-eval' is not, and neither React nor Next needs it
  // in production. This regressed once already — see the note on `headerMap`.
  const csp = await cspDirectives(PHASE_PRODUCTION_BUILD);

  assert.ok(
    !(csp.get("script-src") ?? "").includes("'unsafe-eval'"),
    "the production CSP must not carry 'unsafe-eval'"
  );
  assert.ok(
    !(csp.get("connect-src") ?? "").includes("ws:"),
    "the production CSP must not open websockets for HMR"
  );
  assert.ok(
    csp.has("upgrade-insecure-requests"),
    "the production CSP must upgrade insecure requests"
  );
});

test("ISS-022: the development phase still permits eval and HMR websockets", async () => {
  // The dev allowances must stay real, or `next dev` breaks: React uses eval to
  // rebuild server error stacks, and Turbopack HMR runs over a websocket.
  const csp = await cspDirectives(PHASE_DEVELOPMENT_SERVER);

  assert.ok((csp.get("script-src") ?? "").includes("'unsafe-eval'"));
  assert.ok((csp.get("connect-src") ?? "").includes("ws:"));
  assert.ok(
    !csp.has("upgrade-insecure-requests"),
    "upgrade-insecure-requests would break plain-http localhost"
  );
});

test("ISS-022: no credential leaks into the policy via a configured DSN", async () => {
  // NEXT_PUBLIC_SENTRY_DSN carries a key in the userinfo position. The config
  // reduces it to an origin; this guards that it never ships whole.
  const csp = await cspDirectives();
  const joined = [...csp.values()].join(" ");

  assert.ok(!joined.includes("@"), "no userinfo may appear in the CSP");
});
