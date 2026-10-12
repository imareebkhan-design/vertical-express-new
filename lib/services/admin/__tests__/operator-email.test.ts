import test from "node:test";
import assert from "node:assert/strict";
import { operatorEmail } from "../authz";

/**
 * Who is an operator, decided on the Firebase session token alone (no Supabase
 * session has been read since 1 Sep; the Supabase SDK was removed 12 Oct).
 * The source-level checks in lib/__tests__/admin-authorization.test.ts guard
 * the wiring; these run the rule on the token shapes sign-in actually produces.
 */

const env = process.env as Record<string, string | undefined>;
const saved = env.ADMIN_EMAILS;
test.afterEach(() => {
  if (saved === undefined) delete env.ADMIN_EMAILS;
  else env.ADMIN_EMAILS = saved;
});

test("a verified Google email on the allowlist is an operator, normalised", () => {
  env.ADMIN_EMAILS = " Ops@Example.com , second@example.com";
  assert.equal(operatorEmail({ email: "ops@example.com", email_verified: true }), "ops@example.com");
  assert.equal(operatorEmail({ email: "  SECOND@example.COM ", email_verified: true }), "second@example.com");
});

test("an unverified email is not, even when it matches the allowlist", () => {
  env.ADMIN_EMAILS = "ops@example.com";
  for (const email_verified of [false, undefined, "true", 1]) {
    assert.equal(operatorEmail({ email: "ops@example.com", email_verified }), null, String(email_verified));
  }
});

test("a phone-only identity (no email on the token) is never an operator", () => {
  env.ADMIN_EMAILS = "ops@example.com";
  assert.equal(operatorEmail({ email_verified: true }), null);
  assert.equal(operatorEmail({ email: "", email_verified: true }), null);
  assert.equal(operatorEmail({ email: 42, email_verified: true }), null);
});

test("a verified email that is not on the allowlist is not an operator", () => {
  env.ADMIN_EMAILS = "ops@example.com";
  assert.equal(operatorEmail({ email: "customer@example.com", email_verified: true }), null);
  assert.equal(operatorEmail({ email: "ops@example.com.evil.test", email_verified: true }), null);
});

test("an unset or empty allowlist admits nobody (fails closed)", () => {
  for (const value of [undefined, "", " , ,"]) {
    if (value === undefined) delete env.ADMIN_EMAILS;
    else env.ADMIN_EMAILS = value;
    assert.equal(operatorEmail({ email: "ops@example.com", email_verified: true }), null, JSON.stringify(value));
    assert.equal(operatorEmail({ email: "", email_verified: true }), null, "an empty email must not match an empty entry");
  }
});
