import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createProductEnquiry } from "../product-enquiries";
import { addItem } from "../cart";
import { reorder } from "../orders";
import { handleProductEnquiry } from "@/lib/api/product-enquiry";
import { handleGetProduct } from "@/lib/api/v1";
import { classifyCartError } from "@/lib/cart-errors";
import { ORDERING_CLOSED, ORDERING_CLOSED_MESSAGE } from "@/lib/commerce-mode";
import { STATUS_FOR_CODE } from "@/lib/api/response";
import { createApprovedCatalogueFixture } from "../../../test-support/catalogue-fixtures";

/**
 * COMMERCE_MODE=catalogue — catalogue-and-enquiries.
 *
 * Nothing can be bought, so every product the storefront shows takes an
 * enquiry: catalog-only as before, and now published products too. What the
 * storefront does not show (drafts, archived, a published product without its
 * approvals) still cannot be enquired about. The cart add and reorder are
 * refused like checkout, so a cached page or an older app cannot fill a cart
 * that can never be paid for. Transactional mode is unchanged: a published
 * product is bought, not enquired about.
 */
const tag = randomUUID().slice(0, 8);
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const hidden: Record<string, string> = {};
let fixture: Awaited<ReturnType<typeof createApprovedCatalogueFixture>>;
let brandId: string;

const saved = process.env.COMMERCE_MODE;
const setMode = (mode: "catalogue" | "transactional" | undefined) => {
  if (mode === undefined) delete process.env.COMMERCE_MODE;
  else process.env.COMMERCE_MODE = mode;
};
afterEach(() => setMode(saved as "catalogue" | undefined));

before(async () => {
  fixture = await createApprovedCatalogueFixture();
  brandId = (await db.brand.create({ data: { slug: `catenq-${tag}`, name: `CatEnq ${tag}` } })).id;
  /* Same category as the fixture; none of these has the approvals the storefront requires. */
  for (const [k, status] of [["draft", "draft"], ["archived", "archived"], ["pubHidden", "published"], ["coHidden", "catalog_only"]] as const) {
    hidden[k] = (await db.product.create({
      data: { slug: `catenq-${tag}-${k}`, title: `CatEnq ${tag} ${k}`, brandId, categoryId: fixture.category.id, status },
    })).id;
  }
});

after(async () => {
  const ids = [fixture.product.id, ...Object.values(hidden)];
  await db.productEnquiry.deleteMany({ where: { productId: { in: ids } } });
  await db.product.deleteMany({ where: { id: { in: Object.values(hidden) } } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await fixture.cleanup();
});

test("catalogue mode: a publicly visible published product accepts an enquiry, by service and by the app endpoint", async () => {
  setMode("catalogue");
  const r = await createProductEnquiry({ productId: fixture.product.id, name: "Asha", phone: phone() });
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = await db.productEnquiry.findFirst({ where: { productId: fixture.product.id }, orderBy: { createdAt: "desc" } });
  assert.equal(row?.productTitle, fixture.product.title);

  const res = await handleProductEnquiry(
    new Request(`http://localhost/api/v1/products/${fixture.product.slug}/enquiry`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` },
      body: JSON.stringify({ name: "Ravi", phone: phone() }),
    }),
    fixture.product.slug
  );
  assert.equal(res.status, 201);
});

test("catalogue mode: drafts, archived and unapproved products still cannot receive public enquiries", async () => {
  setMode("catalogue");
  for (const [k, id] of [...Object.entries(hidden), ["unknown", randomUUID()]]) {
    const r = await createProductEnquiry({ productId: id, name: "Asha", phone: phone() });
    assert.deepEqual(r, { ok: false, reason: "NOT_ENQUIRABLE" }, k);
  }
  assert.equal(await db.productEnquiry.count({ where: { productId: { in: Object.values(hidden) } } }), 0);
});

test("transactional mode is unchanged: a published product is bought, not enquired about", async () => {
  for (const mode of ["transactional", undefined] as const) {
    setMode(mode);
    const r = await createProductEnquiry({ productId: fixture.product.id, name: "Asha", phone: phone() });
    assert.deepEqual(r, { ok: false, reason: "NOT_ENQUIRABLE" }, String(mode));
  }
});

test("an unknown mode fails closed: enquiries open, cart closed", async () => {
  process.env.COMMERCE_MODE = "Catalogue";
  assert.equal((await createProductEnquiry({ productId: fixture.product.id, name: "Asha", phone: phone() })).ok, true);
  await assert.rejects(addItem(null, randomUUID(), fixture.variant.id, 1), new RegExp(`^Error: ${ORDERING_CLOSED}$`));
});

test("catalogue mode: the cart add is refused with ORDERING_CLOSED (403) and no guest cart is created", async () => {
  setMode("catalogue");
  const anonId = randomUUID();
  await assert.rejects(addItem(null, anonId, fixture.variant.id, 1), (e: Error) => e.message === ORDERING_CLOSED);
  assert.equal(await db.cart.count({ where: { anonId } }), 0);

  const r = classifyCartError(new Error(ORDERING_CLOSED), 1);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "ORDERING_CLOSED");
  assert.equal(r.error.message, ORDERING_CLOSED_MESSAGE);
  assert.equal(STATUS_FOR_CODE[r.error.code], 403);
});

test("catalogue mode: reorder is refused before any order is read; transactional reaches the lookup", async () => {
  setMode("catalogue");
  await assert.rejects(reorder(randomUUID(), "VE-NOT-A-REAL-ORDER"), (e: Error) => e.message === ORDERING_CLOSED);
  setMode("transactional");
  await assert.rejects(reorder(randomUUID(), "VE-NOT-A-REAL-ORDER"), (e: Error) => e.message === "NOT_FOUND");
});

test("GET /api/v1/products/:slug tells the app which action to offer; hidden products stay 404", async () => {
  const read = async (slug: string) => {
    const res = await handleGetProduct(new Request(`http://localhost/api/v1/products/${slug}`), slug);
    return { status: res.status, body: (await res.json()) as { data?: { orderingOpen: boolean; enquirable: boolean; purchasable: boolean } } };
  };
  setMode("catalogue");
  const closed = await read(fixture.product.slug);
  assert.equal(closed.status, 200);
  assert.deepEqual([closed.body.data?.purchasable, closed.body.data?.orderingOpen, closed.body.data?.enquirable], [true, false, true]);

  setMode("transactional");
  const open = await read(fixture.product.slug);
  assert.deepEqual([open.body.data?.purchasable, open.body.data?.orderingOpen, open.body.data?.enquirable], [true, true, false]);

  setMode("catalogue");
  assert.equal((await read(`catenq-${tag}-pubHidden`)).status, 404);
  assert.equal((await read(`catenq-${tag}-draft`)).status, 404);
});

test("every cart response tells the app whether checkout is open (additive field)", async () => {
  const { withShipments } = await import("@/lib/api/cart-shipments");
  const empty = { cartId: null, lines: [], count: 0, subtotalPaise: 0, freeDeliveryThresholdPaise: 0, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: false };
  setMode("catalogue");
  assert.equal(withShipments(empty).orderingOpen, false);
  setMode("transactional");
  assert.equal(withShipments(empty).orderingOpen, true);
});

test("the closed-ordering message is the owner's wording (1 Nov 2026)", () => {
  assert.equal(ORDERING_CLOSED_MESSAGE, "Online ordering isn’t available yet. Send an enquiry to confirm pricing, availability and delivery.");
});
