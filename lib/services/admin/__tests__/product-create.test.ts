import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProduct, listingFormOptions } from "@/lib/services/admin/product-create";
import { db } from "@/lib/db";

/**
 * Listing a product.
 *
 * The interesting assertions are about what must exist together. A product
 * needs three rows before it is a real listing, and any two without the third
 * is a broken shelf entry that still looks fine on the products screen — so
 * the transaction is the feature, and most of these tests are about it holding.
 */
const P = "zzz-listing";
const SKU = "ZZZ-LISTING";

async function cleanup() {
  const products = await db.product.findMany({
    where: { slug: { startsWith: P } },
    select: { id: true, variants: { select: { id: true } } },
  });
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  await db.stockMovement.deleteMany({ where: { variantId: { in: variantIds } } });
  await db.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
  await db.auditLog.deleteMany({ where: { entityId: { in: products.map((p) => p.id) } } });
  await db.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
}

async function refs() {
  const [brand, category, warehouse, actor] = await Promise.all([
    db.brand.findFirst({ select: { id: true } }),
    db.category.findFirst({ select: { id: true } }),
    db.warehouse.findFirst({ select: { id: true } }),
    db.user.findFirst({ select: { id: true } }),
  ]);
  assert.ok(brand && category && warehouse, "the catalogue has no brand/category/warehouse");
  return { brand, category, warehouse, actor };
}

function draft(slug: string, sku: string, r: Awaited<ReturnType<typeof refs>>, qty = 0) {
  return {
    title: "Zzz Listing Test Product",
    slug,
    brandId: r.brand.id,
    categoryId: r.category.id,
    description: null,
    unitLabel: "per bag",
    deliverySpeed: null,
    status: "draft" as const,
    variant: { name: "50 kg bag", sku, pricePaise: 32_000, compareAtPaise: 33_500 },
    openingStock: { warehouseId: r.warehouse.id, qty },
  };
}

test("a listing creates the product, its variant and its stock row together", async (t) => {
  t.after(cleanup);
  await cleanup();
  const r = await refs();
  const slug = `${P}-${randomUUID().slice(0, 8)}`;

  const res = await createProduct(draft(slug, `${SKU}-${randomUUID().slice(0, 6)}`.toUpperCase(), r, 40), {
    id: r.actor?.id ?? randomUUID(),
    email: "zzz@example.invalid",
  });
  assert.equal(res.ok, true);

  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, status: true, variants: { select: { id: true, isDefault: true, inventory: true } } },
  });
  assert.ok(product, "the product was not created");
  assert.equal(product.status, "draft");

  /* All three, or the listing is broken in a way the products screen hides. */
  assert.equal(product.variants.length, 1, "a product was listed with no variant to buy");
  assert.equal(product.variants[0].isDefault, true, "the only variant is not the default");
  assert.equal(
    product.variants[0].inventory.length,
    1,
    "the variant has no stock row, so it reads as out of stock with nothing to adjust"
  );
  assert.equal(product.variants[0].inventory[0].qtyOnHand, 40);
});

test("opening stock is explained in the ledger", async (t) => {
  t.after(cleanup);
  await cleanup();
  const r = await refs();
  const slug = `${P}-${randomUUID().slice(0, 8)}`;

  await createProduct(draft(slug, `${SKU}-${randomUUID().slice(0, 6)}`.toUpperCase(), r, 25), {
    id: r.actor?.id ?? randomUUID(),
    email: "zzz@example.invalid",
  });

  const p = await db.product.findUnique({
    where: { slug },
    select: { variants: { select: { id: true } } },
  });
  const moves = await db.stockMovement.findMany({ where: { variantId: p!.variants[0].id } });

  /* The ledger's whole promise is that every quantity can be explained, and
     "it was there when I arrived" is not an explanation. */
  assert.equal(moves.length, 1, "opening stock arrived with no movement behind it");
  assert.equal(moves[0].qtyDelta, 25);
  assert.equal(moves[0].qtyAfter, 25);
  assert.equal(moves[0].reason, "received");
});

test("zero opening stock writes no movement", async (t) => {
  t.after(cleanup);
  await cleanup();
  const r = await refs();
  const slug = `${P}-${randomUUID().slice(0, 8)}`;

  await createProduct(draft(slug, `${SKU}-${randomUUID().slice(0, 6)}`.toUpperCase(), r, 0), {
    id: r.actor?.id ?? randomUUID(),
    email: "zzz@example.invalid",
  });

  const p = await db.product.findUnique({
    where: { slug },
    select: { variants: { select: { id: true, inventory: true } } },
  });
  /* The inventory row still exists — otherwise the variant is unadjustable —
     but inventing a "received 0" would put something in the ledger that never
     happened. */
  assert.equal(p!.variants[0].inventory.length, 1);
  assert.equal(await db.stockMovement.count({ where: { variantId: p!.variants[0].id } }), 0);
});

test("a duplicate slug leaves nothing behind", async (t) => {
  t.after(cleanup);
  await cleanup();
  const r = await refs();
  const slug = `${P}-${randomUUID().slice(0, 8)}`;
  const actor = { id: r.actor?.id ?? randomUUID(), email: "zzz@example.invalid" };

  await createProduct(draft(slug, `${SKU}-A${randomUUID().slice(0, 5)}`.toUpperCase(), r, 5), actor);
  const second = await createProduct(
    draft(slug, `${SKU}-B${randomUUID().slice(0, 5)}`.toUpperCase(), r, 5),
    actor
  );

  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.error, "slug_taken");

  /* THE TRANSACTION. A failed listing must not leave an orphan variant or a
     stock row for a product that does not exist. */
  assert.equal(await db.product.count({ where: { slug } }), 1, "a duplicate slug created a second product");
});

test("a duplicate SKU leaves nothing behind", async (t) => {
  t.after(cleanup);
  await cleanup();
  const r = await refs();
  const sku = `${SKU}-${randomUUID().slice(0, 6)}`.toUpperCase();
  const actor = { id: r.actor?.id ?? randomUUID(), email: "zzz@example.invalid" };

  await createProduct(draft(`${P}-${randomUUID().slice(0, 8)}`, sku, r, 5), actor);

  const secondSlug = `${P}-${randomUUID().slice(0, 8)}`;
  const second = await createProduct(draft(secondSlug, sku, r, 5), actor);

  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.error, "sku_taken");
  assert.equal(
    await db.product.count({ where: { slug: secondSlug } }),
    0,
    "a rejected SKU still created the product row"
  );
  assert.equal(await db.productVariant.count({ where: { sku } }), 1);
});

test("listing is audited", async (t) => {
  t.after(cleanup);
  await cleanup();
  const r = await refs();
  const slug = `${P}-${randomUUID().slice(0, 8)}`;
  const actorId = r.actor?.id ?? randomUUID();

  await createProduct(draft(slug, `${SKU}-${randomUUID().slice(0, 6)}`.toUpperCase(), r, 3), {
    id: actorId,
    email: "zzz@example.invalid",
  });

  const p = await db.product.findUnique({ where: { slug }, select: { id: true } });
  const audit = await db.auditLog.findMany({ where: { entityId: p!.id, entityType: "Product" } });
  assert.equal(audit.length, 1, "listing a product left no audit row");
  assert.equal(audit[0].action, "catalog.product_listed");
});

test("the form is offered only brands and categories that exist", async () => {
  const o = await listingFormOptions();
  assert.ok(o.brands.length > 0, "no brands to list against");
  assert.ok(o.categories.length > 0);

  /* Tax travels with the category so the form never needs a client-side copy
     of the rate table. A category we charge tax on must carry its rate. */
  const cement = o.categories.find((c) => c.slug === "cement");
  if (cement) {
    assert.equal(cement.gstRatePct, 28, "the cement rate stopped travelling with the category");
    assert.ok(cement.hsn, "the HSN code is missing");
  }
});
