import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { createApprovedCatalogueFixture } from "../../../test-support/catalogue-fixtures";
import { validateCommercialReadiness } from "../admin/commercial-readiness";
import { getProductBySlug, listProducts, getCategoryBySlug } from "../catalog";
import { getSuggestions } from "../search";

test("variant name, attributes and prices require a new commercial review", async t => {
  for (const data of [{ name: "Changed pack" }, { attributes: { pack: "Changed kit" } }, { pricePaise: 11000 }, { compareAtPaise: 12000 }]) {
    const f = await createApprovedCatalogueFixture();
    t.after(() => f.cleanup());
    assert.deepEqual(await validateCommercialReadiness(db, f.product.id), []);
    await db.productVariant.update({ where: { id: f.variant.id }, data });
    const product = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
    assert.equal(product.commercialReview, null);
    assert.equal(product.identityConfirmed, true, "offer changes do not revoke product identity");
    assert.ok((await validateCommercialReadiness(db, product.id)).some(r => /commercial review/.test(r)));
  }
});

test("adding or deleting an active SKU revokes the reviewed offer set", async t => {
  for (const mutation of ["insert", "delete"] as const) {
    const f = await createApprovedCatalogueFixture();
    t.after(() => f.cleanup());
    if (mutation === "insert") {
      await db.productVariant.create({ data: { productId: f.product.id, sku: `${f.product.slug}-extra`, name: "Unreviewed extra", pricePaise: 10000 } });
    } else {
      await db.inventory.deleteMany({ where: { variantId: f.variant.id } });
      await db.productVariant.delete({ where: { id: f.variant.id } });
    }
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).commercialReview, null);
    assert.equal(await getProductBySlug(f.product.slug), null);
  }
});

test("delivery class change revokes commercial approval only", async t => {
  const f = await createApprovedCatalogueFixture();
  t.after(() => f.cleanup());
  await db.product.update({ where: { id: f.product.id }, data: { deliverySpeed: "express" } });
  const product = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
  assert.equal(product.commercialReview, null);
  assert.equal(product.identityConfirmed, true);
  assert.equal((await db.productImage.findFirstOrThrow({ where: { productId: product.id } })).identityApproved, true);
});

test("revoked commercial review disappears from product, listing and search readers", async t => {
  const f = await createApprovedCatalogueFixture();
  t.after(() => f.cleanup());
  assert.ok(await getProductBySlug(f.product.slug));
  await db.productVariant.update({ where: { id: f.variant.id }, data: { name: "Unreviewed pack" } });
  assert.equal(await getProductBySlug(f.product.slug), null);
  assert.equal((await listProducts({ brandSlugs: [f.product.slug] })).total, 0);
  assert.equal((await getSuggestions(f.product.slug)).products.some(p => p.slug === f.product.slug), false);
  // A category can still exist when other approved fixtures are present.
  const category = await getCategoryBySlug(f.category.slug);
  assert.ok(category === null || category.id === f.category.id);
});

test("stock quantity and descriptive photo metadata preserve unrelated approvals", async t => {
  const f = await createApprovedCatalogueFixture();
  t.after(() => f.cleanup());
  await db.inventory.updateMany({ where: { variantId: f.variant.id }, data: { qtyOnHand: 9 } });
  await db.productImage.updateMany({ where: { productId: f.product.id }, data: { alt: "Corrected accessible description", width: 800, height: 800 } });
  const product = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
  assert.equal(product.identityConfirmed, true);
  assert.deepEqual(product.commercialReview, f.product.commercialReview);
  assert.equal((await db.productImage.findFirstOrThrow({ where: { productId: product.id } })).identityApproved, true);
  assert.deepEqual(await validateCommercialReadiness(db, product.id), []);
});

test("a tax review inconsistent with checkout is not sellable", async t => {
  const f = await createApprovedCatalogueFixture();
  t.after(() => f.cleanup());
  const review = f.product.commercialReview as Record<string, unknown>;
  await db.product.update({ where: { id: f.product.id }, data: { commercialReview: { ...review, hsn: "9999" } } });
  assert.ok((await validateCommercialReadiness(db, f.product.id)).some(r => /tax review/.test(r)));
});
