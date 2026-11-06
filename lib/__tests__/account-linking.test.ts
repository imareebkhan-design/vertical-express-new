import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";

import { db } from "@/lib/db";
import { provisionUser } from "@/lib/auth/current-user";

/**
 * Account linking, against a real database.
 *
 * lib/__tests__/link-policy.test.ts proves the *decision* — which identifier an
 * identity may claim by. This proves the *wiring*: that provisionUser looks up
 * by the identifier the policy chose and no other, that it refuses to hand over
 * a row belonging to somebody else, and that the refusal produces a separate
 * account rather than an error or a silent merge.
 *
 * The distinction matters because the policy could be perfect and the caller
 * could still run both lookups, or update the wrong row. That gap is the one
 * that hands a customer another customer's orders, wallet and addresses.
 *
 * These are the A–E scenarios from the production auth verification, run
 * without a handset.
 */

/** A Firebase ID token, reduced to the four claims this code path reads. */
function token(claims: {
  uid: string;
  phone_number?: string;
  email?: string;
  email_verified?: boolean;
}): DecodedIdToken {
  return claims as unknown as DecodedIdToken;
}

const tag = () => randomUUID().slice(0, 8);
const created: string[] = [];

async function seedUser(data: { phone?: string; email?: string; firebaseUid?: string | null }) {
  const row = await db.user.create({
    data: { id: randomUUID(), firebaseUid: data.firebaseUid ?? null, phone: data.phone ?? null, email: data.email ?? null },
    select: { id: true },
  });
  created.push(row.id);
  return row.id;
}

test.after(async () => {
  await db.user.deleteMany({ where: { id: { in: created } } });
});

test("A · a new phone identity gets a brand-new account", async () => {
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const uid = `uid-new-${tag()}`;

  const id = await provisionUser(token({ uid, phone_number: phone }));
  assert.ok(id, "expected a user id");
  created.push(id!);

  const row = await db.user.findUnique({ where: { id: id! }, select: { firebaseUid: true, phone: true } });
  assert.equal(row?.firebaseUid, uid);
  assert.equal(row?.phone, phone, "the verified number is recorded on the new row");
});

test("B · an existing phone customer is resolved, not duplicated", async () => {
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const uid = `uid-existing-${tag()}`;

  /* A row that predates Firebase — the migration case. It has the number but no
     uid yet, so the first sign-in adopts it rather than starting a new account
     and stranding their order history. */
  const existing = await seedUser({ phone });

  const id = await provisionUser(token({ uid, phone_number: phone }));
  assert.equal(id, existing, "must resolve to the SAME row, not a second account");

  const row = await db.user.findUnique({ where: { id: existing }, select: { firebaseUid: true } });
  assert.equal(row?.firebaseUid, uid, "the row is now bound to this identity");
});

test("C · an existing Google customer is resolved by their verified email", async () => {
  const email = `google-${tag()}@example.com`;
  const uid = `uid-google-${tag()}`;
  const existing = await seedUser({ email });

  const id = await provisionUser(token({ uid, email, email_verified: true }));
  assert.equal(id, existing);
});

test("D · an UNVERIFIED email claims nothing, even when the address matches", async () => {
  /* The takeover this closes: email/password sign-up sets `email` on the token
     before anyone proves they can read that inbox. If an unverified address
     could claim, typing a stranger's email into the sign-up form would hand
     over their account. */
  const email = `victim-${tag()}@example.com`;
  const victim = await seedUser({ email, firebaseUid: null });

  const attacker = await provisionUser(token({ uid: `uid-attacker-${tag()}`, email, email_verified: false }));
  assert.ok(attacker);
  created.push(attacker!);
  assert.notEqual(attacker, victim, "an unverified email must NOT reach the victim's row");

  /* And the separate account must be usable. Returning null here was the bug:
     a fully-authenticated customer with no row, bounced from every page. */
  const fresh = await db.user.findUnique({ where: { id: attacker! }, select: { email: true } });
  assert.equal(fresh?.email, null, "the contested address stays with its owner");

  const untouched = await db.user.findUnique({ where: { id: victim }, select: { firebaseUid: true } });
  assert.equal(untouched?.firebaseUid, null, "the victim's row must be left completely alone");
});

test("E · a conflicting identity gets its own account, never a handover", async () => {
  /* Two Firebase identities asserting one phone number. The second must not
     inherit the first's orders, wallet, cart or addresses. */
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const firstUid = `uid-first-${tag()}`;
  const held = await seedUser({ phone, firebaseUid: firstUid });

  const second = await provisionUser(token({ uid: `uid-second-${tag()}`, phone_number: phone }));
  assert.ok(second);
  created.push(second!);
  assert.notEqual(second, held, "THE TAKEOVER CASE — must not resolve to the held row");

  const separate = await db.user.findUnique({ where: { id: second! }, select: { phone: true } });
  assert.equal(separate?.phone, null, "the contested number stays with the first identity");

  const original = await db.user.findUnique({ where: { id: held }, select: { firebaseUid: true } });
  assert.equal(original?.firebaseUid, firstUid, "the original binding must be unchanged");
});

test("a phone identity never reaches a row that only matches by email", async () => {
  /* The shipped bug, at the database level: provisionUser must run the phone
     lookup ONLY. A row carrying the same person's email is not reachable from a
     phone token. */
  const email = `crossover-${tag()}@example.com`;
  const emailOnly = await seedUser({ email });

  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const id = await provisionUser(
    token({ uid: `uid-cross-${tag()}`, phone_number: phone, email, email_verified: true })
  );
  assert.ok(id);
  created.push(id!);
  assert.notEqual(id, emailOnly, "a phone token must not claim a row found by email");
});

test("re-signing in returns the same account every time (F · logout then login)", async () => {
  const phone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  const uid = `uid-stable-${tag()}`;

  const first = await provisionUser(token({ uid, phone_number: phone }));
  assert.ok(first);
  created.push(first!);

  /* Signing out clears the cookie; it does not change identity. The second
     sign-in must land on the same row — a new one each time would silently
     orphan the customer's orders. */
  const second = await provisionUser(token({ uid, phone_number: phone }));
  assert.equal(second, first);
});
