import test from "node:test";
import assert from "node:assert/strict";

/**
 * Error reporting (ISS-012): the browser may reach the Sentry ingest host named
 * by the DSN, and nothing else about the DSN — its key sits in the userinfo
 * position and must never reach a response header.
 */
test("the CSP allows the DSN's ingest origin and never carries the key", async () => {
  process.env.SENTRY_DSN = "https://abc123secretkey@o42.ingest.sentry.io/7";
  const { contentSecurityPolicy } = await import("../../../next.config");
  const csp = contentSecurityPolicy(false);
  const connect = csp.split("; ").find((d) => d.startsWith("connect-src")) ?? "";
  assert.ok(connect.includes("https://o42.ingest.sentry.io"));
  assert.equal(csp.includes("abc123secretkey"), false);
});
