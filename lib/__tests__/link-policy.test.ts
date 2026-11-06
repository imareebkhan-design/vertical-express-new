import assert from "node:assert/strict";
import test from "node:test";

import { claimableIdentifier, mayClaimRow } from "@/lib/auth/link-policy";

/**
 * Account linking is where a bug hands one customer another customer's orders,
 * wallet, cart and addresses. It cannot be checked by signing in once and
 * looking pleased, so the rule is a pure function and this is the proof.
 *
 * A real bug shipped here: an earlier version claimed a row whose phone OR
 * email matched, whichever the incoming identity happened to carry. The
 * cross-identifier cases below are that bug, written down so it cannot return.
 */

const uid = "firebase-uid-aaa";
const other = "firebase-uid-bbb";

test("a Firebase-verified phone is the identifier a phone identity claims by", () => {
  assert.deepEqual(claimableIdentifier({ uid, phoneNumber: "+919876543210" }), {
    kind: "phone",
    value: "+919876543210",
  });
});

test("an unverified email claims nothing", () => {
  // Email/password sign-up sets `email` before anyone proves they can read it.
  // Linking on that would let someone claim a stranger's account by typing
  // their address into a sign-up form.
  assert.deepEqual(
    claimableIdentifier({ uid, email: "bilal@example.com", emailVerified: false }),
    { kind: "none" }
  );
  assert.deepEqual(claimableIdentifier({ uid, email: "bilal@example.com" }), { kind: "none" });
});

test("a verified email claims by email, normalised", () => {
  assert.deepEqual(
    claimableIdentifier({ uid, email: "  Bilal@Example.COM ", emailVerified: true }),
    { kind: "email", value: "bilal@example.com" }
  );
});

test("phone outranks email when an identity carries both", () => {
  // Possession of the handset that received an OTP is stronger proof than a
  // mailbox, and it is how this market signs in.
  assert.deepEqual(
    claimableIdentifier({
      uid,
      phoneNumber: "+919876543210",
      email: "bilal@example.com",
      emailVerified: true,
    }),
    { kind: "phone", value: "+919876543210" }
  );
});

test("a malformed phone number is not an identifier", () => {
  for (const bad of ["9876543210", "+91", "", "  ", "+0123456789", "not-a-number"]) {
    assert.deepEqual(
      claimableIdentifier({ uid, phoneNumber: bad }),
      { kind: "none" },
      `expected ${JSON.stringify(bad)} to be rejected`
    );
  }
});

test("an identity with nothing verified claims nothing", () => {
  assert.deepEqual(claimableIdentifier({ uid }), { kind: "none" });
});

test("an unclaimed row may be adopted", () => {
  const claim = claimableIdentifier({ uid, phoneNumber: "+919876543210" });
  assert.equal(mayClaimRow(claim, { firebaseUid: null }, uid), true);
});

test("a row already held by another identity is never handed over", () => {
  // THE TAKEOVER CASE. Two identities asserting one phone number is a conflict,
  // not a merge — the second gets its own row, not the first one's orders.
  const claim = claimableIdentifier({ uid, phoneNumber: "+919876543210" });
  assert.equal(mayClaimRow(claim, { firebaseUid: other }, uid), false);
});

test("an identity re-reads its own row", () => {
  const claim = claimableIdentifier({ uid, phoneNumber: "+919876543210" });
  assert.equal(mayClaimRow(claim, { firebaseUid: uid }, uid), true);
});

test("an identity that claims nothing cannot claim even an unclaimed row", () => {
  // Without a verified identifier there is no evidence tying this person to the
  // row, so an empty firebaseUid is not an invitation.
  assert.equal(mayClaimRow({ kind: "none" }, { firebaseUid: null }, uid), false);
});

test("no row matched means nothing to claim", () => {
  const claim = claimableIdentifier({ uid, phoneNumber: "+919876543210" });
  assert.equal(mayClaimRow(claim, null, uid), false);
});

test("REGRESSION: a phone identity cannot claim a row found by email", () => {
  /* The shipped bug. A customer who had only ever signed in with Google —
     matched by email — must not be inheritable by someone arriving with a
     phone number. The policy makes this unrepresentable: a phone identity
     returns kind "phone", so the caller only ever looks up by phone. The email
     lookup is never reached, and this asserts that shape. */
  const claim = claimableIdentifier({
    uid,
    phoneNumber: "+919876543210",
    email: "existing-google-customer@example.com",
    emailVerified: true,
  });
  assert.equal(claim.kind, "phone");
  assert.notEqual(claim.kind, "email");
});

test("REGRESSION: an email identity cannot claim a row found by phone", () => {
  const claim = claimableIdentifier({
    uid,
    email: "someone@example.com",
    emailVerified: true,
  });
  assert.equal(claim.kind, "email");
  // No phone on the token, so no phone lookup is possible at the call site.
  assert.notEqual(claim.kind, "phone");
});
