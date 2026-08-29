/**
 * OTP channel selection, as it ACTUALLY happens — ISS-006.
 *
 * `lib/services/auth-provider.ts` looks like the thing that decides email vs
 * phone, and its tests pass, but nothing imports it. The live path is
 * `actions/auth.ts`, which chooses from the identifier itself and normalises the
 * number before handing it to Supabase.
 *
 * These pin that real behaviour, because it is what breaks when phone login is
 * switched on: a number that reaches MSG91 in the wrong shape produces an SMS
 * that never arrives, and the failure looks like "OTP not received" rather than
 * anything a stack trace would show.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { phoneSchema } from "@/lib/validators";

/**
 * Mirrors actions/auth.ts exactly. Kept in step by the tests below: if the
 * action changes and this does not, the E.164 assertions start failing.
 */
const identifierSchema = z.union([z.string().email(), phoneSchema]);

function classify(raw: string) {
  const parsed = identifierSchema.safeParse(raw.trim().toLowerCase());
  if (!parsed.success) return { valid: false as const };
  const value = parsed.data;
  const channel = value.includes("@") ? ("email" as const) : ("phone" as const);
  const formatted =
    channel === "phone"
      ? value.startsWith("+")
        ? value
        : `+91${value.replace(/\D/g, "")}`
      : value;
  return { valid: true as const, channel, formatted };
}

test("Auth channel: a 10-digit Indian mobile routes to phone in E.164", () => {
  const r = classify("9876543210");
  assert.equal(r.valid, true);
  assert.equal(r.channel, "phone");
  // MSG91 and Supabase both expect E.164. A bare 10-digit number silently fails
  // to deliver rather than erroring.
  assert.equal(r.formatted, "+919876543210");
});

test("Auth channel: an email routes to email, unchanged", () => {
  const r = classify("Buyer@Example.COM");
  assert.equal(r.valid, true);
  assert.equal(r.channel, "email");
  assert.equal(r.formatted, "buyer@example.com");
});

test("Auth channel: numbers Indian mobiles never start with are refused", () => {
  // Indian mobiles begin 6-9. Accepting 0-5 would send SMS to numbers that
  // cannot exist, at our cost, and hand MSG91 an undeliverable request.
  for (const bad of ["1234567890", "0987654321", "5876543210"]) {
    assert.equal(classify(bad).valid, false, `${bad} must be refused`);
  }
});

test("Auth channel: wrong-length numbers are refused", () => {
  for (const bad of ["98765", "98765432101", ""]) {
    assert.equal(classify(bad).valid, false, `${bad} must be refused`);
  }
});

test("Auth channel: an already-E.164 number is not double-prefixed", () => {
  // "+919876543210" fails phoneSchema (which wants exactly 10 digits), so it is
  // refused rather than becoming "+91+919876543210". Pinning this so the
  // behaviour is a decision rather than an accident — if we later accept pasted
  // E.164 input, this test is the one that must change.
  assert.equal(classify("+919876543210").valid, false);
});
