import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { handleDeleteAccount, handleGetDeletionStatus } from "@/lib/api/account-deletion";
import type { FirebaseAccountOps } from "@/lib/services/account-deletion";

/**
 * GET/POST /api/v1/me/deletion — the contract the Expo app builds against.
 *
 *   GET   200 { ok, data: { state: "eligible" | "blocked", blockers?, explainer } }
 *   POST  { confirm: true }
 *         200 { ok, data: { status: "deleted" } }          only once Firebase is done too
 *         409 CONFLICT    error.metadata.blockers           nothing changed
 *         503 UNAVAILABLE error.metadata.status="pending"   retry; never success
 *         400 VALIDATION  without confirm: true
 *         401             no token / revoked token on a live account
 */

const users: string[] = [];
const VALID = new Map<string, string>();
const REVOKED = new Map<string, string>();

const verify = async (t: string) => (VALID.has(t) ? ({ uid: VALID.get(t) } as unknown as DecodedIdToken) : null);
const verifyAllowingRevoked = async (t: string) => {
  const uid = VALID.get(t) ?? REVOKED.get(t);
  return uid ? ({ uid } as unknown as DecodedIdToken) : null;
};
const firebase = (fail = false): FirebaseAccountOps => ({
  async deleteUser() {
    if (fail) throw new Error("simulated Firebase outage");
  },
});

async function customer() {
  const uid = `v1del${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const id = (await db.user.create({ data: { id: randomUUID(), firebaseUid: uid }, select: { id: true } })).id;
  users.push(id);
  const tok = `tok-${uid}`;
  VALID.set(tok, uid);
  return { id, uid, tok };
}

const req = (method: string, tok?: string, body?: unknown) =>
  new Request("http://localhost/api/v1/me/deletion", {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, any> });

after(async () => {
  await db.order.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

test("GET reports eligible with the explainer the confirmation screen shows", async () => {
  const c = await customer();
  const r = await json(await handleGetDeletionStatus(req("GET", c.tok), { verify }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.state, "eligible");
  assert.ok(r.body.data.explainer.deleted.length > 0 && r.body.data.explainer.kept.length > 0);
});

test("GET reports blocked with each reason and remedy", async () => {
  const c = await customer();
  await db.order.create({
    data: { orderNo: `V1DEL-${randomUUID().slice(0, 8)}`, userId: c.id, status: "packed", paymentMethod: "razorpay", subtotalPaise: 1, totalPaise: 1, address: {} },
  });
  const r = await json(await handleGetDeletionStatus(req("GET", c.tok), { verify }));
  assert.equal(r.body.data.state, "blocked");
  assert.equal(r.body.data.blockers[0].code, "ORDER_IN_PROGRESS");
  assert.ok(r.body.data.blockers[0].orderNo);

  const post = await json(await handleDeleteAccount(req("POST", c.tok, { confirm: true }), { verify, verifyAllowingRevoked, firebase: firebase() }));
  assert.equal(post.status, 409);
  assert.equal(post.body.error.code, "CONFLICT");
  assert.equal(post.body.error.metadata.blockers[0].code, "ORDER_IN_PROGRESS");
});

test("POST without confirm: true deletes nothing", async () => {
  const c = await customer();
  const r = await json(await handleDeleteAccount(req("POST", c.tok, {}), { verify, verifyAllowingRevoked, firebase: firebase() }));
  assert.equal(r.status, 400);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: c.id } })).firebaseUid, c.uid);
});

test("POST deletes and answers 200 only when Firebase is done; GET afterwards is signed out", async () => {
  const c = await customer();
  const r = await json(await handleDeleteAccount(req("POST", c.tok, { confirm: true }), { verify, verifyAllowingRevoked, firebase: firebase() }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "deleted");
  const after = await handleGetDeletionStatus(req("GET", c.tok), { verify });
  assert.equal(after.status, 401, "the deleted account's token still reaches an account");
});

test("a Firebase failure answers 503 pending; the retry with the now-revoked token finishes it", async () => {
  const c = await customer();
  const first = await json(await handleDeleteAccount(req("POST", c.tok, { confirm: true }), { verify, verifyAllowingRevoked, firebase: firebase(true) }));
  assert.equal(first.status, 503);
  assert.equal(first.body.error.metadata.status, "pending");
  assert.notEqual(first.body.ok, true);

  /* Deletion revoked the customer's tokens before the Firebase delete failed. */
  VALID.delete(c.tok);
  REVOKED.set(c.tok, c.uid);
  const retry = await json(await handleDeleteAccount(req("POST", c.tok, { confirm: true }), { verify, verifyAllowingRevoked, firebase: firebase() }));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.status, "deleted");
});

test("a revoked token cannot start the deletion of a live account", async () => {
  const c = await customer();
  VALID.delete(c.tok);
  REVOKED.set(c.tok, c.uid);
  const r = await handleDeleteAccount(req("POST", c.tok, { confirm: true }), { verify, verifyAllowingRevoked, firebase: firebase() });
  assert.equal(r.status, 401);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: c.id } })).firebaseUid, c.uid);
});

test("no token is 401", async () => {
  const r = await handleDeleteAccount(req("POST", undefined, { confirm: true }), { verify, verifyAllowingRevoked, firebase: firebase() });
  assert.equal(r.status, 401);
});
