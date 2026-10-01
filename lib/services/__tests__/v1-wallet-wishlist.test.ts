import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { handleGetWallet, handleGetWishlist, handleToggleWishlist } from "@/lib/api/v1";

/**
 * Wallet and wishlist, over `/api/v1`.
 *
 * Both were real on the web — `Wallet`/`WalletTransaction` and
 * `Wishlist`/`WishlistItem` already modelled, already read by the account
 * pages — and unreachable from the app because nothing exposed them. These
 * are thin doors onto that existing service layer, and the tests are mostly
 * about the door: authentication, ownership, and that toggling twice returns
 * to where it started.
 */

const TOKEN_A = "token-wallet-a";
const TOKEN_B = "token-wallet-b";
const UID_A = `uid-wallet-a-${randomUUID().slice(0, 8)}`;
const UID_B = `uid-wallet-b-${randomUUID().slice(0, 8)}`;

const verify = async (token: string): Promise<DecodedIdToken | null> => {
  if (token === TOKEN_A) return { uid: UID_A } as unknown as DecodedIdToken;
  if (token === TOKEN_B) return { uid: UID_B } as unknown as DecodedIdToken;
  return null;
};

let productId: string;

function req(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

before(async () => {
  const mkUser = async (uid: string) =>
    (
      await db.user.create({
        data: { id: randomUUID(), firebaseUid: uid, phone: `+9198${String(Math.random()).slice(2, 10)}`, profile: { create: {} } },
        select: { id: true },
      })
    ).id;
  await mkUser(UID_A);
  await mkUser(UID_B);

  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const tag = randomUUID().slice(0, 8);
  const product = await db.product.create({
    data: {
      slug: `zzz-wallet-${tag}`,
      title: "ZZZ Wallet Test Product",
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per unit",
      status: "published",
      variants: { create: [{ sku: `ZZZ-WT-${tag}`, name: "Default", pricePaise: 10000, isDefault: true }] },
    },
    select: { id: true },
  });
  productId = product.id;
});

after(async () => {
  await db.wishlistItem.deleteMany({ where: { productId } });
  await db.wishlist.deleteMany({ where: { user: { firebaseUid: { in: [UID_A, UID_B] } } } });
  await db.walletTransaction.deleteMany({ where: { wallet: { user: { firebaseUid: UID_A } } } });
  await db.wallet.deleteMany({ where: { user: { firebaseUid: UID_A } } });
  await db.product.deleteMany({ where: { slug: { startsWith: "zzz-wallet-" } } });
  await db.user.deleteMany({ where: { firebaseUid: { in: [UID_A, UID_B] } } });
});

test("wallet: unauthenticated is refused", async () => {
  const res = await json(await handleGetWallet(req("GET", "/x"), { verify }));
  assert.equal(res.status, 401);
});

test("wallet: a customer with no history gets a real zero balance, not an error", async () => {
  /* getOrCreateWallet makes the row on first read. Zero is the honest state of
     an account that has never earned cashback — not an unbuilt screen. */
  const res = await json(await handleGetWallet(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.balancePaise, 0);
  assert.deepEqual(res.body.data.transactions, []);
});

test("wishlist: unauthenticated is refused", async () => {
  const res = await json(await handleGetWishlist(req("GET", "/x"), { verify }));
  assert.equal(res.status, 401);
});

test("wishlist: starts empty, toggle adds, toggle again removes", async () => {
  const empty = await json(await handleGetWishlist(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.deepEqual(empty.body.data, []);

  const added = await json(
    await handleToggleWishlist(req("POST", "/x", { token: TOKEN_A, body: { productId } }), { verify })
  );
  assert.equal(added.body.data.saved, true);

  const withItem = await json(await handleGetWishlist(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(withItem.body.data.length, 1);
  assert.equal(withItem.body.data[0].id, productId);

  const removed = await json(
    await handleToggleWishlist(req("POST", "/x", { token: TOKEN_A, body: { productId } }), { verify })
  );
  assert.equal(removed.body.data.saved, false);

  const emptyAgain = await json(await handleGetWishlist(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.deepEqual(emptyAgain.body.data, []);
});

test("wishlist: one customer's saved item is invisible to another", async () => {
  await handleToggleWishlist(req("POST", "/x", { token: TOKEN_A, body: { productId } }), { verify });

  const bView = await json(await handleGetWishlist(req("GET", "/x", { token: TOKEN_B }), { verify }));
  assert.deepEqual(bView.body.data, []);

  /* clean up what this test added */
  await handleToggleWishlist(req("POST", "/x", { token: TOKEN_A, body: { productId } }), { verify });
});

test("wishlist: an invalid product id is rejected, not silently ignored", async () => {
  const res = await json(
    await handleToggleWishlist(req("POST", "/x", { token: TOKEN_A, body: { productId: "not-a-uuid" } }), { verify })
  );
  assert.equal(res.status, 400);
});

