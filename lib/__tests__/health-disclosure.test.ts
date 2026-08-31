import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The health endpoint is unauthenticated and internet-facing, so everything it
 * returns is public. It previously returned the payment gateway in use, the OTP
 * channel, whether Supabase was configured, and the raw database error message
 * on failure — the last of which routinely carries host, port, database name
 * and user.
 *
 * A source test rather than a request test, because the leak is about what the
 * handler is *capable* of returning. A passing request against a healthy
 * database would never show the error branch at all, which is the branch that
 * mattered.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/api/health/route.ts", import.meta.url)),
  "utf8"
);

/** Comments explain the history; only real code should be checked. */
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

test("the health endpoint does not report environment or configuration", () => {
  for (const leak of [
    "PAYMENT_GATEWAY",
    "AUTH_OTP_CHANNEL",
    "SUPABASE",
    "paymentGateway",
    "otpChannel",
    "supabaseConfigured",
    "DATABASE_URL",
    "FIREBASE",
  ]) {
    assert.ok(
      !code.includes(leak),
      `/api/health must not expose ${leak} — it is unauthenticated and public`
    );
  }
});

test("a database failure does not return the driver's error message", () => {
  /* `err.message` in the response body was the actual leak: connection errors
     name the host and user. The catch may capture it for the error tracker;
     it must not put it in the payload. */
  assert.ok(
    !/NextResponse\.json\([\s\S]*err(or)?\s*(instanceof|\.message)/.test(code),
    "the error message must not reach the response body"
  );
  assert.ok(
    /captureException/.test(code),
    "the failure should still be reported to the error tracker"
  );
});

test("liveness is still signalled by the status code", () => {
  assert.ok(/503/.test(code) && /200/.test(code), "monitors depend on 200/503");
});
