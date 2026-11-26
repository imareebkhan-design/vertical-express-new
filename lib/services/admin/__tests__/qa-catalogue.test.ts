import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publicProductWhere } from "@/lib/catalog-policy";
import { QA_CATALOGUE, QA_OPENING_STOCK, upsertQaCatalogue, archiveQaCatalogue } from "../qa-catalogue";
import { UAT_OPENING_ACTION } from "../uat-inventory";
import { QA_FIXTURE_APPROVER, isQaFixtureSlug } from "@/lib/catalog/qa-fixture-ids";

/**
 * Staging UAT products (owner approval, 8 Nov 2026): sellable through the real
 * gate, labelled as tests everywhere, MRP equal to price, never public where
 * real money moves, and stock written once so a rerun never replenishes it.
 */
let warehouseId: string;
const savedGateway = process.env.PAYMENT_GATEWAY;
const slugs = QA_CATALOGUE.map(i => i.slug);
const skus = QA_CATALOGUE.flatMap(i => i.variants.map(v => v.sku));

before(async () => {
  warehouseId = (await db.warehouse.create({ data: { name: `QA catalogue test ${randomUUID().slice(0, 6)}`, city: "Srinagar", pincode: "190001" } })).id;
});

after(async () => {
  process.env.PAYMENT_GATEWAY = savedGateway;
  const products = await db.product.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  const ids = products.map(p => p.id);
  const variants = await db.productVariant.findMany({ where: { productId: { in: ids } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...variants.map(v => v.id)] } } });
  await db.stockMovement.deleteMany({ where: { variantId: { in: variants.map(v => v.id) } } });
  await db.inventory.deleteMany({ where: { variant: { productId: { in: ids } } } });
  await db.productVariant.deleteMany({ where: { productId: { in: ids } } });
  await db.productImage.deleteMany({ where: { productId: { in: ids } } });
  await db.product.deleteMany({ where: { id: { in: ids } } });
  await db.brand.deleteMany({ where: { slug: "qa-staging-brand", products: { none: {} } } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

test("the catalogue is three or more synthetic products, all prefixed and labelled as tests", () => {
  assert.ok(QA_CATALOGUE.length >= 3 && QA_CATALOGUE.length <= 5);
  for (const item of QA_CATALOGUE) {
    assert.ok(isQaFixtureSlug(item.slug), item.slug);
    assert.match(item.title, /^QA TEST ITEM .* staging only, not for sale$/);
    assert.equal(item.variants.filter(v => v.isDefault).length, 1);
  }
  assert.ok(QA_CATALOGUE.some(i => i.variants.length > 1), "one product exercises variant choice");
});

test("published through the real gate, MRP equals price, approvals marked as TEST reviews", async () => {
  const results = await db.$transaction(tx => upsertQaCatalogue(tx, warehouseId));
  for (const r of results) assert.deepEqual(r.sellable, [], r.slug);
  process.env.PAYMENT_GATEWAY = "dummy";
  for (const slug of slugs) {
    const p = await db.product.findUniqueOrThrow({ where: { slug }, include: { variants: true, images: true } });
    assert.equal(p.status, "published");
    assert.equal(p.identityApprovedBy, QA_FIXTURE_APPROVER);
    assert.match(p.identityApprovalReason ?? "", /TEST REVIEW/);
    assert.match(JSON.stringify(p.commercialReview), /TEST REVIEW/);
    assert.equal(p.images[0].approvedBy, QA_FIXTURE_APPROVER);
    for (const v of p.variants) assert.equal(v.compareAtPaise, v.pricePaise);
    assert.ok(await db.product.findFirst({ where: { slug, AND: [publicProductWhere()] } }), `${slug} public on staging`);
  }
});

test("opening stock is 50 once, with the UAT marker; a rerun does not replenish consumed stock", async () => {
  const variants = await db.productVariant.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
  assert.equal(variants.length, skus.length);
  const key = (variantId: string) => ({ variantId_warehouseId: { variantId, warehouseId } });
  for (const v of variants) {
    assert.equal((await db.inventory.findUniqueOrThrow({ where: key(v.id) })).qtyOnHand, QA_OPENING_STOCK);
    assert.equal(await db.auditLog.count({ where: { action: UAT_OPENING_ACTION, entityId: v.id } }), 1);
  }
  await db.inventory.update({ where: key(variants[0].id), data: { qtyOnHand: 47 } });
  const again = await db.$transaction(tx => upsertQaCatalogue(tx, warehouseId));
  assert.deepEqual(again.flatMap(r => r.stockCreated), []);
  for (const r of again) assert.deepEqual(r.sellable, [], r.slug);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: key(variants[0].id) })).qtyOnHand, 47);
  assert.equal(await db.auditLog.count({ where: { action: UAT_OPENING_ACTION, entityId: variants[0].id } }), 1);
});

test("rerun at another warehouse does not allocate another opening stock", async () => {
  const other = await db.warehouse.create({ data: { name: `Other QA ${randomUUID()}`, city: "Srinagar", pincode: "190001" } });
  try {
    const again = await db.$transaction(tx => upsertQaCatalogue(tx, other.id));
    assert.deepEqual(again.flatMap(r => r.stockCreated), []);
    assert.equal(await db.inventory.count({ where: { warehouseId: other.id } }), 0);
  } finally {
    await db.stockMovement.deleteMany({ where: { warehouseId: other.id } });
    await db.inventory.deleteMany({ where: { warehouseId: other.id } });
    await db.warehouse.delete({ where: { id: other.id } });
  }
});

test("an opening marker prevents replenishment even if its inventory row is missing", async () => {
  const variant = await db.productVariant.findUniqueOrThrow({ where: { sku: skus[0] } });
  const key = { variantId_warehouseId: { variantId: variant.id, warehouseId } };
  const saved = await db.inventory.findUniqueOrThrow({ where: key });
  await db.inventory.delete({ where: key });
  try {
    const again = await db.$transaction(tx => upsertQaCatalogue(tx, warehouseId));
    assert.deepEqual(again.flatMap(r => r.stockCreated), []);
    assert.equal(await db.inventory.findUnique({ where: key }), null);
  } finally {
    await db.inventory.upsert({ where: key, create: saved, update: { qtyOnHand: saved.qtyOnHand } });
  }
});

test("never public where the live gateway is configured", async () => {
  process.env.PAYMENT_GATEWAY = "razorpay-live";
  for (const slug of slugs) assert.equal(await db.product.findFirst({ where: { slug, AND: [publicProductWhere()] } }), null);
  process.env.PAYMENT_GATEWAY = "dummy";
});

test("refuses an unknown or inactive warehouse and leaves nothing behind", async () => {
  const before = await db.product.count({ where: { slug: { in: slugs } } });
  await assert.rejects(db.$transaction(tx => upsertQaCatalogue(tx, randomUUID())), /active warehouse/);
  assert.equal(await db.product.count({ where: { slug: { in: slugs } } }), before);
});

test("archive deactivates, never deletes", async () => {
  assert.equal(await db.$transaction(tx => archiveQaCatalogue(tx)), QA_CATALOGUE.length);
  const ps = await db.product.findMany({ where: { slug: { in: slugs } }, include: { variants: true } });
  assert.equal(ps.length, QA_CATALOGUE.length);
  for (const p of ps) {
    assert.equal(p.status, "archived");
    assert.ok(p.variants.every(v => !v.isActive));
  }
});
