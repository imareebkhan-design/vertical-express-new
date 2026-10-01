import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { mergeGuestCart, mergeGuestCartSafely, completeSignInCart } from "../cart-merge";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getCartSummary } from "../cart";

/**
 * E8 — a guest's cart at sign-in.
 *
 * The contract the code states (`cart-merge.ts`): guest items move into the
 * account's cart and quantities are combined for the same variant. Stock is not
 * decided here: every cart read clamps a line to what is available and flags it
 * ("limited" / "out_of_stock", `getCartSummary`), and that is the feedback the
 * customer sees. These tests hold the merge to it through the real service and
 * the real cart read — including a merge that fails part-way, one that is
 * retried, and two that run at once.
 */

const TAG = randomUUID().slice(0, 8);
const PIN = "999981";
let warehouseId: string;
const variants: Record<string, string> = {};
const productIds: string[] = [];
const users: string[] = [];
const anonIds: string[] = [];

async function variant(key: string, stock: number) {
  const category = await db.category.findFirstOrThrow({ where: { isBulk: false }, select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const p = await db.product.create({
    data: {
      slug: `zzz-merge-${key}-${TAG}`,
      title: `ZZZ Merge ${key}`,
      brandId: brand.id,
      categoryId: category.id,
      status: "published",
      variants: { create: [{ sku: `ZZZ-MRG-${key}-${TAG}`.toUpperCase(), name: "Default", pricePaise: 1000, isDefault: true }] },
    },
    include: { variants: true },
  });
  productIds.push(p.id);
  variants[key] = p.variants[0].id;
  await db.inventory.create({ data: { variantId: p.variants[0].id, warehouseId, qtyOnHand: stock } });
}

async function user() {
  const id = randomUUID();
  await db.user.create({ data: { id } });
  await db.address.create({
    data: { userId: id, name: "Merge", phone: "9000000008", line1: "Yard 8", city: "Srinagar", state: "Jammu & Kashmir", pincode: PIN, isDefault: true },
  });
  users.push(id);
  return id;
}

/** A guest cart as the storefront makes one: a cart keyed by the anon cookie's id. */
async function guestCart(lines: Record<string, number>) {
  const anonId = randomUUID();
  anonIds.push(anonId);
  await db.cart.create({
    data: { anonId, items: { create: Object.entries(lines).map(([k, qty]) => ({ variantId: variants[k], qty })) } },
  });
  return anonId;
}

async function accountCart(userId: string, lines: Record<string, number>) {
  await db.cart.create({
    data: { userId, items: { create: Object.entries(lines).map(([k, qty]) => ({ variantId: variants[k], qty })) } },
  });
}

async function rawQty(userId: string) {
  const cart = await db.cart.findUnique({ where: { userId }, include: { items: true } });
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(variants)) {
    const it = cart?.items.find((i) => i.variantId === v);
    if (it) out[k] = it.qty;
  }
  return out;
}

const guestExists = async (anonId: string) => (await db.cart.findUnique({ where: { anonId } })) !== null;

before(async () => {
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ Merge ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({ data: { pincode: PIN, warehouseId, isActive: true } });
  await variant("a", 50);
  await variant("b", 50);
  await variant("c", 3); // little stock
  await variant("d", 0); // none
});

after(async () => {
  const provisioned = (await db.user.findMany({ where: { firebaseUid: { startsWith: `uid-merge-${TAG}` } }, select: { id: true } })).map((u) => u.id);
  users.push(...provisioned);
  await db.cartItem.deleteMany({ where: { variantId: { in: Object.values(variants) } } });
  await db.cart.deleteMany({ where: { OR: [{ userId: { in: users } }, { anonId: { in: anonIds } }] } });
  await db.address.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PIN } });
  await db.inventory.deleteMany({ where: { variantId: { in: Object.values(variants) } } });
  await db.productVariant.deleteMany({ where: { id: { in: Object.values(variants) } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

test("guest items join the account's cart; the same variant's quantities combine; the guest cart is gone", async () => {
  const u = await user();
  await accountCart(u, { a: 2 });
  const anon = await guestCart({ a: 3, b: 1 });
  await mergeGuestCart(u, anon);
  assert.deepEqual(await rawQty(u), { a: 5, b: 1 });
  assert.equal(await guestExists(anon), false);
});

test("a guest with no account cart yet: the account gets the guest's items", async () => {
  const u = await user();
  const anon = await guestCart({ b: 4 });
  await mergeGuestCart(u, anon);
  assert.deepEqual(await rawQty(u), { b: 4 });
});

test("retrying a merge that already happened adds nothing", async () => {
  const u = await user();
  const anon = await guestCart({ a: 2 });
  await mergeGuestCart(u, anon);
  await mergeGuestCart(u, anon);
  await mergeGuestCart(u, anon);
  assert.deepEqual(await rawQty(u), { a: 2 });
});

test("a merge that fails part-way changes nothing, keeps the guest items, and a retry merges them exactly once", async () => {
  const u = await user();
  /* The second line cannot be added: the account's quantity is already at the
     column's limit, so the increment overflows — a real database failure after
     the first line has been written. */
  await accountCart(u, { a: 1, b: 2147483647 });
  const anon = await guestCart({ a: 2, b: 1 });
  await assert.rejects(mergeGuestCart(u, anon));
  assert.deepEqual(await rawQty(u), { a: 1, b: 2147483647 }, "the account cart is untouched — no half merge");
  assert.equal(await guestExists(anon), true, "the guest items are still there to recover");

  await db.cartItem.updateMany({ where: { cart: { userId: u }, variantId: variants.b }, data: { qty: 1 } });
  await mergeGuestCart(u, anon);
  assert.deepEqual(await rawQty(u), { a: 3, b: 2 }, "merged once — the first line was not added twice");
  assert.equal(await guestExists(anon), false);
});

test("two merges of the same guest cart at once (two tabs signing in): the quantities are added exactly once", async () => {
  for (let round = 0; round < 5; round++) {
    const u = await user();
    await accountCart(u, { a: 1 });
    const anon = await guestCart({ a: 2, b: 3 });
    const results = await Promise.allSettled([mergeGuestCart(u, anon), mergeGuestCart(u, anon), mergeGuestCart(u, anon)]);
    assert.deepEqual(results.map((r) => r.status), ["fulfilled", "fulfilled", "fulfilled"], `round ${round}: no merge fails`);
    assert.deepEqual(await rawQty(u), { a: 3, b: 3 }, `round ${round}: nothing lost, nothing doubled`);
  }
});

test("more than there is in stock: combined as the cart always does, then the cart read limits it and says so", async () => {
  const u = await user();
  await accountCart(u, { c: 2 });
  const anon = await guestCart({ c: 2, d: 1 });
  await mergeGuestCart(u, anon);
  const summary = await getCartSummary(u, null);
  const c = summary.lines.find((l) => l.variantId === variants.c)!;
  assert.equal(c.qty, 3, "limited to the 3 in stock");
  assert.equal(c.adjustmentReason, "limited");
  const d = summary.lines.find((l) => l.variantId === variants.d)!;
  assert.equal(d.inStock, false);
  assert.equal(d.adjustmentReason, "out_of_stock", "kept and flagged, not silently dropped");
});

test("signed out afterwards, or another customer signing in: nobody else's cart is reachable", async () => {
  const alice = await user();
  const bob = await user();
  await accountCart(alice, { a: 7 });
  const anon = await guestCart({ b: 1 });
  await mergeGuestCart(alice, anon);

  /* After sign-out the browser is a guest again, with the old anon id or none. */
  assert.equal((await getCartSummary(null, anon)).lines.length, 0, "the old guest id reaches nothing");
  /* Bob signing in on the same browser with that stale id merges nothing of Alice's. */
  await mergeGuestCart(bob, anon);
  assert.deepEqual(await rawQty(bob), {});
  assert.deepEqual(await rawQty(alice), { a: 7, b: 1 });
  /* A new guest's items go to whoever signs in next, and only to them. */
  const anon2 = await guestCart({ a: 1 });
  await mergeGuestCart(bob, anon2);
  assert.deepEqual(await rawQty(bob), { a: 1 });
  assert.deepEqual(await rawQty(alice), { a: 7, b: 1 });
});

/* ── Sign-in's path: POST /api/auth/session → completeSignInCart ─────────────
   The route verifies the Firebase token (not possible without a service account
   here) and hands the verified identity to completeSignInCart; these drive that
   function with synthetic verified tokens, as cart-api.test.ts drives the API. */

test("sign-in: the verified customer gets the guest's items, and the guest cookie may be cleared", async () => {
  const u = await user();
  const uid = `uid-merge-${TAG}-existing`;
  await db.user.update({ where: { id: u }, data: { firebaseUid: uid } });
  await accountCart(u, { a: 1 });
  const anon = await guestCart({ a: 1, b: 2 });
  const res = await completeSignInCart({ uid } as unknown as DecodedIdToken, anon);
  assert.deepEqual(res, { merged: 2, clearCookie: true });
  assert.deepEqual(await rawQty(u), { a: 2, b: 2 });
});

test("sign-in: a first-time customer is provisioned and their guest basket is waiting in the new account", async () => {
  const uid = `uid-merge-${TAG}-new`;
  const anon = await guestCart({ b: 1 });
  const res = await completeSignInCart({ uid, phone_number: `+9198${String(Date.now()).slice(-8)}` } as unknown as DecodedIdToken, anon);
  assert.equal(res.clearCookie, true);
  const created = await db.user.findUniqueOrThrow({ where: { firebaseUid: uid }, select: { id: true } });
  assert.deepEqual(await rawQty(created.id), { b: 1 });
});

test("sign-in with no guest cart: nothing is touched and no cookie is cleared", async () => {
  const u = await user();
  await accountCart(u, { a: 4 });
  const uid = `uid-merge-${TAG}-noguest`;
  await db.user.update({ where: { id: u }, data: { firebaseUid: uid } });
  assert.deepEqual(await completeSignInCart({ uid } as unknown as DecodedIdToken, null), { merged: 0, clearCookie: false });
  assert.deepEqual(await rawQty(u), { a: 4 });
});

test("a merge that fails at sign-in does not fail sign-in, keeps the guest cookie and items, and the next cart request recovers them once", async () => {
  const u = await user();
  const uid = `uid-merge-${TAG}-fails`;
  await db.user.update({ where: { id: u }, data: { firebaseUid: uid } });
  await accountCart(u, { a: 1, b: 2147483647 });
  const anon = await guestCart({ a: 2, b: 1 });

  const atSignIn = await completeSignInCart({ uid } as unknown as DecodedIdToken, anon);
  assert.deepEqual(atSignIn, { merged: 0, clearCookie: false }, "signed in; cookie kept for a retry");
  assert.equal(await guestExists(anon), true);
  assert.deepEqual(await rawQty(u), { a: 1, b: 2147483647 });

  /* What actions/cart.ts does on the next signed-in cart request with the cookie still present. */
  await db.cartItem.updateMany({ where: { cart: { userId: u }, variantId: variants.b }, data: { qty: 1 } });
  assert.deepEqual(await mergeGuestCartSafely(u, anon), { merged: 2, clearCookie: true });
  assert.deepEqual(await mergeGuestCartSafely(u, anon), { merged: 0, clearCookie: true }, "a second recovery adds nothing");
  assert.deepEqual(await rawQty(u), { a: 3, b: 2 });
});

