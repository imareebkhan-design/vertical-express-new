import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { publicProductWhere } from "@/lib/catalog-policy";
import { upsertQaFixture, archiveQaFixture } from "../qa-fixture";
import { QA_FIXTURE_PRODUCT_SLUG, QA_FIXTURE_APPROVER, isQaFixtureSlug } from "@/lib/catalog/qa-fixture-ids";
import { qaTargetRefusal, STAGING_REF } from "@/lib/catalog/qa-target";

/**
 * The staging checkout QA fixture: sellable through the real gate, labelled as
 * synthetic everywhere, never public where real money moves, archived (not
 * deleted) on cleanup, and its script refuses anything but staging.
 */
let warehouseId: string;
let categorySlug: string;
const savedGateway = process.env.PAYMENT_GATEWAY;

before(async () => {
  warehouseId = (await db.warehouse.create({ data: { name: `QA fixture test ${randomUUID().slice(0, 6)}`, city: "Srinagar", pincode: "190001" } })).id;
  const cat = await db.category.findFirstOrThrow({ where: { isActive: true, slug: { in: Object.keys(CATEGORY_TAX_CONFIGS) } }, select: { slug: true } });
  categorySlug = cat.slug;
});

after(async () => {
  process.env.PAYMENT_GATEWAY = savedGateway;
  const p = await db.product.findUnique({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, select: { id: true } });
  if (p) {
    await db.inventory.deleteMany({ where: { variant: { productId: p.id } } });
    await db.productVariant.deleteMany({ where: { productId: p.id } });
    await db.productImage.deleteMany({ where: { productId: p.id } });
    await db.product.delete({ where: { id: p.id } });
  }
  await db.brand.deleteMany({ where: { slug: "qa-staging-brand" } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

const isPublic = async () => !!(await db.product.findFirst({ where: { slug: QA_FIXTURE_PRODUCT_SLUG, AND: [publicProductWhere()] }, select: { id: true } }));

test("created through the real gate: published, sellable, labelled synthetic", async () => {
  const r = await db.$transaction((tx) => upsertQaFixture(tx, { categorySlug, warehouseId, pricePaise: 19900, stock: 20 }));
  assert.deepEqual(r.sellable, []);
  const p = await db.product.findUniqueOrThrow({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, include: { images: true } });
  assert.equal(p.status, "published");
  assert.match(p.title, /QA TEST ITEM — staging only, not for sale/);
  assert.equal(p.identityApprovedBy, QA_FIXTURE_APPROVER);
  assert.equal(p.images[0].approvedBy, QA_FIXTURE_APPROVER);
  assert.ok(isQaFixtureSlug(p.slug));
  process.env.PAYMENT_GATEWAY = "dummy";
  assert.equal(await isPublic(), true);
});

test("never public where the live gateway is configured", async () => {
  process.env.PAYMENT_GATEWAY = "razorpay-live";
  assert.equal(await isPublic(), false);
  process.env.PAYMENT_GATEWAY = "dummy";
});

test("refuses a category without a confirmed tax mapping and non-positive values", async () => {
  await assert.rejects(db.$transaction((tx) => upsertQaFixture(tx, { categorySlug: "no-such-tax-category", warehouseId, pricePaise: 100, stock: 1 })));
  await assert.rejects(db.$transaction((tx) => upsertQaFixture(tx, { categorySlug, warehouseId, pricePaise: 0, stock: 1 })));
});

test("cleanup archives and deactivates; nothing deleted", async () => {
  assert.equal(await db.$transaction((tx) => archiveQaFixture(tx)), true);
  const p = await db.product.findUniqueOrThrow({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, include: { variants: true } });
  assert.equal(p.status, "archived");
  assert.equal(p.variants.every((v) => !v.isActive), true);
  assert.equal(await isPublic(), false);
});

test("the script refuses anything but staging", () => {
  const STAGING = `postgresql://postgres.${STAGING_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
  const PROD = "postgresql://postgres.gsfslnxvwmrgulzqypdp:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
  assert.equal(qaTargetRefusal(STAGING, STAGING_REF, {}), null);
  assert.ok(qaTargetRefusal(PROD, STAGING_REF, {}));
  assert.ok(qaTargetRefusal(PROD, "gsfslnxvwmrgulzqypdp", {}));
  assert.ok(qaTargetRefusal(STAGING, undefined, {}));
  assert.ok(qaTargetRefusal("postgresql://me@localhost/x", STAGING_REF, {}));
  assert.ok(qaTargetRefusal(STAGING, STAGING_REF, { PAYMENT_GATEWAY: "razorpay-live" }));
});
