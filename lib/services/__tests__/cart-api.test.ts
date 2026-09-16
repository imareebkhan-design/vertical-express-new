import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { handleAddCartItem } from "@/lib/api/cart-items";
import { POST } from "@/app/api/v1/cart/items/route";
import type { CartSummary } from "@/lib/services/cart";
import type { CartStockAdjustment } from "@/lib/cart-errors";

/**
 * POST /api/v1/cart/items — the first HTTP door onto existing business logic.
 *
 * WHAT IS ACTUALLY BEING PROVED
 *
 * Not that adding to a cart works: `cart-inventory.test.ts` proves that about
 * `addItem`, and this endpoint calls the same function. What is new here is the
 * boundary — that a request with no bearer token gets nothing, that a valid one
 * resolves to the same local user the cookie path would resolve to, that a
 * business refusal survives the trip to the wire with its numbers intact, and
 * that each of those answers with a status a mobile client can branch on before
 * it has parsed a body.
 *
 * ON THE STUBBED VERIFIER. `firebase-admin` refuses to verify a token without a
 * service account, and correctly so — a verifier that cannot verify must fail
 * loudly rather than wave requests through. A test has no service account, so
 * the handler takes the verifier as an injected dependency and the route passes
 * none. Two things keep that from becoming a hole: the token still has to
 * resolve to a real database row through the same `resolveUserFromToken` the
 * web uses, and the last test in this file reads the route source to assert the
 * production path has not acquired an injected verifier.
 *
 * Requests reach the handler directly, the way `cron-cleanup.test.ts` and
 * `webhook.test.ts` drive their routes.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const URL_ = "http://localhost/api/v1/cart/items";

const FIREBASE_UID = `uid-cart-api-${randomUUID().slice(0, 8)}`;
const GOOD_TOKEN = "a-token-the-stub-accepts";
const UNKNOWN_UID = `uid-cart-api-new-${randomUUID().slice(0, 8)}`;

const TEST_PINCODE = "999955";
const STOCKED_QTY = 10;

let userId: string;
let warehouseId: string;
let stockedVariantId: string;
let emptyVariantId: string;
let productId: string;
const provisioned: string[] = [];

/** Accepts exactly one token, mapping it to one uid. Everything else is a 401. */
const verify = async (token: string): Promise<DecodedIdToken | null> => {
  if (token === GOOD_TOKEN) return { uid: FIREBASE_UID } as unknown as DecodedIdToken;
  if (token === "token-for-an-unseen-identity") {
    return { uid: UNKNOWN_UID, phone_number: `+9199${String(Date.now()).slice(-8)}` } as unknown as DecodedIdToken;
  }
  return null;
};

function request(body: unknown, options: { token?: string; raw?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return new Request(URL_, {
    method: "POST",
    headers,
    body: options.raw ?? JSON.stringify(body),
  });
}

async function post(body: unknown, options: { token?: string; raw?: string } = {}) {
  const res = await handleAddCartItem(request(body, options), { verify });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function errorOf(body: Record<string, unknown>) {
  const error = body.error as { code: string; message: string; field?: string; metadata?: unknown };
  assert.ok(error, `expected a structured error, got ${JSON.stringify(body)}`);
  return error;
}

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });

  const warehouse = await db.warehouse.create({
    data: { name: "ZZZ Cart API Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = warehouse.id;

  await db.serviceablePincode.create({
    data: { pincode: TEST_PINCODE, warehouseId, isActive: true },
  });

  /* `User.id` has no database default — in production it is supplied by the
     caller alongside the Firebase uid. */
  const user = await db.user.create({
    data: {
      id: randomUUID(),
      firebaseUid: FIREBASE_UID,
      phone: `+9199${String(Date.now()).slice(-8)}`,
      addresses: {
        create: {
          label: "site",
          name: "ZZZ Cart API Buyer",
          phone: "9876543210",
          line1: "Plot 1",
          city: "Srinagar",
          state: "Jammu & Kashmir",
          /* Pins which warehouse `resolveWarehouseId` picks, so the stock
             numbers below are the ones actually read. */
          pincode: TEST_PINCODE,
          isDefault: true,
        },
      },
    },
    select: { id: true },
  });
  userId = user.id;

  const tag = randomUUID().slice(0, 8);
  const product = await db.product.create({
    data: {
      slug: `zzz-cart-api-${tag}`,
      title: "ZZZ Cart API Cement, 50 kg Bag",
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per bag",
      status: "published",
      variants: {
        create: [
          { sku: `ZZZ-CART-API-${tag}-A`, name: "50 kg", pricePaise: 38500, isDefault: true },
          { sku: `ZZZ-CART-API-${tag}-B`, name: "25 kg", pricePaise: 20000 },
        ],
      },
    },
    include: { variants: { orderBy: { name: "asc" } } },
  });
  productId = product.id;

  const stocked = product.variants.find((v) => v.name === "50 kg")!;
  const empty = product.variants.find((v) => v.name === "25 kg")!;
  stockedVariantId = stocked.id;
  emptyVariantId = empty.id;

  await db.inventory.createMany({
    data: [
      { variantId: stockedVariantId, warehouseId, qtyOnHand: STOCKED_QTY, qtyReserved: 0 },
      { variantId: emptyVariantId, warehouseId, qtyOnHand: 0, qtyReserved: 0 },
    ],
  });
});

after(async () => {
  await db.cartItem.deleteMany({ where: { variant: { productId } } });
  await db.cart.deleteMany({ where: { userId: { in: [userId, ...provisioned] } } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.serviceablePincode.deleteMany({ where: { pincode: TEST_PINCODE } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.address.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: { in: [userId, ...provisioned] } } });
});

/** Each test starts from an empty cart so quantities are absolute, not cumulative. */
async function emptyCart() {
  const cart = await db.cart.findUnique({ where: { userId }, select: { id: true } });
  if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
}

/* ── the happy path ─────────────────────────────────────────────────── */

test("a signed-in customer adds an item and gets the whole cart back", async () => {
  await emptyCart();

  const { status, body } = await post({ variantId: stockedVariantId, qty: 2 }, { token: GOOD_TOKEN });

  assert.equal(status, 200);
  assert.equal(body.ok, true);

  const cart = body.data as unknown as CartSummary;
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].variantId, stockedVariantId);
  assert.equal(cart.lines[0].qty, 2);
  assert.equal(cart.count, 2);
  assert.equal(
    cart.subtotalPaise,
    77000,
    "the totals must come back in the same response — a second round trip to read the cart is what makes the button feel broken on a slow connection"
  );

  /* The write actually happened, rather than a summary being assembled from
     the request. */
  const row = await db.cartItem.findFirst({
    where: { cart: { userId }, variantId: stockedVariantId },
    select: { qty: true },
  });
  assert.equal(row?.qty, 2, "nothing was written to the database");
});

test("adding the same variant twice increments rather than duplicating", async () => {
  await emptyCart();
  await post({ variantId: stockedVariantId, qty: 1 }, { token: GOOD_TOKEN });
  const { body } = await post({ variantId: stockedVariantId, qty: 3 }, { token: GOOD_TOKEN });

  const cart = body.data as unknown as CartSummary;
  assert.equal(cart.lines.length, 1, "the same variant appeared as two lines");
  assert.equal(cart.lines[0].qty, 4);
});

/* ── authentication ─────────────────────────────────────────────────── */

test("a request with no bearer token is refused", async () => {
  const { status, body } = await post({ variantId: stockedVariantId, qty: 1 });
  assert.equal(status, 401);
  assert.equal(body.ok, false);
  assert.equal(errorOf(body).code, "UNAUTHENTICATED");
});

test("the real route refuses an unauthenticated request without Firebase", async () => {
  /* Drives the exported POST rather than the handler, so the route's own wiring
     is exercised. Reaching a verdict before any token verification is what
     makes this possible with no service account — and that ordering is itself
     worth pinning, because it is what stops an anonymous caller from making us
     do cryptographic work. */
  const res = await POST(request({ variantId: stockedVariantId, qty: 1 }));
  assert.equal(res.status, 401);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(errorOf(body).code, "UNAUTHENTICATED");
});

test("a forged or expired token is refused, and told nothing useful", async () => {
  const { status, body } = await post(
    { variantId: stockedVariantId, qty: 1 },
    { token: "not-a-real-token" }
  );
  assert.equal(status, 401);
  const error = errorOf(body);
  assert.equal(error.code, "UNAUTHENTICATED");
  assert.equal(
    error.message,
    "Sign in to add items to your cart",
    "the reason a token failed must not be spelled out — it tells whoever is guessing which part to fix"
  );
});

test("a malformed Authorization header is refused, not parsed hopefully", async () => {
  for (const header of ["", "Bearer", "Basic abc", GOOD_TOKEN]) {
    const res = await handleAddCartItem(
      new Request(URL_, {
        method: "POST",
        headers: header ? { authorization: header, "content-type": "application/json" } : { "content-type": "application/json" },
        body: JSON.stringify({ variantId: stockedVariantId, qty: 1 }),
      }),
      { verify }
    );
    assert.equal(res.status, 401, `"${header}" was accepted as a bearer token`);
  }
});

test("an identity we have never seen resolves through the same account path as the web", async () => {
  /* Not a convenience. `resolveUserFromToken` is where account linking and the
     takeover guard live; an API that provisioned its own rows would be a second
     answer to "who is this", which is the bug `single-identity-reader.test.ts`
     was written for after six call sites were left on a retired provider. */
  const { status, body } = await post(
    { variantId: stockedVariantId, qty: 1 },
    { token: "token-for-an-unseen-identity" }
  );

  /* Not 200. This identity has no saved address, so `resolveWarehouseId` falls
     back to the oldest warehouse in the database rather than the one this file
     stocked — existing web behaviour, and worth knowing that a first-time app
     customer meets it. What is being proved here is that the request got past
     the door at all, so the assertion is on identity, not on stock. */
  assert.notEqual(status, 401, `the verified identity was refused: ${JSON.stringify(body)}`);

  const created = await db.user.findUnique({
    where: { firebaseUid: UNKNOWN_UID },
    select: { id: true },
  });
  assert.ok(created, "no local row was created for a verified identity");
  provisioned.push(created.id);
});

/* ── input validation ───────────────────────────────────────────────── */

test("a body that is not JSON is rejected before anything is written", async () => {
  const { status, body } = await post(null, { token: GOOD_TOKEN, raw: "{not json" });
  assert.equal(status, 400);
  assert.equal(errorOf(body).code, "VALIDATION");
});

test("invalid input is rejected with the offending field named", async () => {
  const cases: { input: unknown; field: string; why: string }[] = [
    { input: { variantId: stockedVariantId, qty: 0 }, field: "qty", why: "zero is not an addition" },
    { input: { variantId: stockedVariantId, qty: 2.5 }, field: "qty", why: "half a cement bag" },
    { input: { variantId: stockedVariantId, qty: 1000 }, field: "qty", why: "above the 999 ceiling" },
    { input: { variantId: "not-a-uuid", qty: 1 }, field: "variantId", why: "not an id at all" },
    { input: { qty: 1 }, field: "variantId", why: "missing entirely" },
  ];

  for (const { input, field, why } of cases) {
    const { status, body } = await post(input, { token: GOOD_TOKEN });
    assert.equal(status, 400, `${why}: expected 400, got ${status}`);
    const error = errorOf(body);
    assert.equal(error.code, "VALIDATION");
    assert.equal(error.field, field, `${why}: the client cannot mark the input without knowing which one`);
  }
});

test("validation happens before the database is touched", async () => {
  await emptyCart();
  await post({ variantId: stockedVariantId, qty: -1 }, { token: GOOD_TOKEN });
  const items = await db.cartItem.count({ where: { cart: { userId } } });
  assert.equal(items, 0, "a rejected request still wrote to the cart");
});

/* ── business rules, unchanged and carried to the wire ───────────────── */

test("a product that does not exist is a 404, not a 500", async () => {
  const { status, body } = await post(
    { variantId: randomUUID(), qty: 1 },
    { token: GOOD_TOKEN }
  );
  assert.equal(status, 404);
  assert.equal(errorOf(body).code, "NOT_FOUND");
});

test("an out-of-stock item is a 409 with a code the app can branch on", async () => {
  await emptyCart();
  const { status, body } = await post({ variantId: emptyVariantId, qty: 1 }, { token: GOOD_TOKEN });

  assert.equal(
    status,
    409,
    "the request was well-formed and the customer is allowed to make it; it collides with the warehouse, and may succeed unchanged tomorrow"
  );
  const error = errorOf(body);
  assert.equal(error.code, "OUT_OF_STOCK");
  assert.equal((error.metadata as CartStockAdjustment).status, "out_of_stock");
});

test("asking for more than exists returns how many there are", async () => {
  await emptyCart();
  const { status, body } = await post(
    { variantId: stockedVariantId, qty: STOCKED_QTY + 2 },
    { token: GOOD_TOKEN }
  );

  assert.equal(status, 409);
  const error = errorOf(body);
  assert.equal(error.code, "ONLY_X_LEFT");

  const meta = error.metadata as CartStockAdjustment;
  assert.equal(meta.available, STOCKED_QTY, "the app cannot offer '10 left' without the 10");
  assert.equal(meta.requested, STOCKED_QTY + 2);
  assert.ok(
    error.message.includes(`Requested: ${STOCKED_QTY + 2}`),
    `the message reached the wire truncated: "${error.message}"`
  );
});

test("a refused add leaves the cart exactly as it was", async () => {
  await emptyCart();
  await post({ variantId: stockedVariantId, qty: 2 }, { token: GOOD_TOKEN });
  await post({ variantId: stockedVariantId, qty: 99 }, { token: GOOD_TOKEN });

  const row = await db.cartItem.findFirst({
    where: { cart: { userId }, variantId: stockedVariantId },
    select: { qty: true },
  });
  assert.equal(row?.qty, 2, "a refused request changed the cart anyway");
});

/* ── the response contract ──────────────────────────────────────────── */

test("nothing in the response is a secret", async () => {
  await emptyCart();
  const { body } = await post({ variantId: stockedVariantId, qty: 1 }, { token: GOOD_TOKEN });
  const serialised = JSON.stringify(body);

  for (const forbidden of ["firebaseUid", "firebase_uid", "PRIVATE KEY", "postgres://", "postgresql://", "RAZORPAY", "anonId"]) {
    assert.ok(
      !serialised.includes(forbidden),
      `the response body carries "${forbidden}" to a device`
    );
  }
});

test("success and failure are the same envelope the web already reads", () => {
  /* A component that reads `res.ok` and `res.error.code` from a Server Action
     must read the same thing from fetch, or every ported screen is a rewrite. */
  const src = readFileSync(join(ROOT, "lib/api/response.ts"), "utf8");
  assert.match(src, /ActionResult/, "the wire format has drifted from the Server Action envelope");
});

/* ── the seam stays a test seam ─────────────────────────────────────── */

test("the production route injects no verifier", () => {
  /* The one thing that would turn an injectable dependency into a hole. */
  const src = readFileSync(join(ROOT, "app/api/v1/cart/items/route.ts"), "utf8");
  assert.match(src, /handleAddCartItem\(request\)/, "the route no longer calls the handler with the request alone");
  assert.ok(
    !/verify\s*:/.test(src.replace(/\/\*[\s\S]*?\*\//g, " ")),
    "the route passes a verifier — production must use the real one"
  );

  const identity = readFileSync(join(ROOT, "lib/auth/api-identity.ts"), "utf8");
  assert.match(
    identity,
    /verify: TokenVerifier = verifyIdToken/,
    "the default verifier is no longer the real Firebase one"
  );
});

test("the API resolves identity through the same function as the web", () => {
  const identity = readFileSync(join(ROOT, "lib/auth/api-identity.ts"), "utf8");
  assert.match(
    identity,
    /resolveUserFromToken/,
    "the API resolves a token to a user its own way — that is two answers to one question again"
  );

  const currentUser = readFileSync(join(ROOT, "lib/auth/current-user.ts"), "utf8");
  assert.match(
    currentUser,
    /return resolveUserFromToken\(token\)/,
    "the cookie path no longer shares the resolver, so the two can now drift"
  );
});

test("the endpoint does not accept a session cookie as a fallback", () => {
  /* A route that takes either a bearer token or an ambient cookie is a route a
     cross-site request can drive as the customer. `app/api/auth/session/route.ts`
     records that the current CSRF protection is structural — SameSite=Lax and
     no CORS — and a bearer-only API keeps it that way. */
  const handler = readFileSync(join(ROOT, "lib/api/cart-items.ts"), "utf8");
  const code = handler.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.ok(!/getAuthUserId|readSession|cookies\(\)/.test(code), "the endpoint reads an ambient cookie");
});
