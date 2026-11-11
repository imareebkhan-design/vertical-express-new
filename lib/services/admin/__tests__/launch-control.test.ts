import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { getLaunchCategory, getLaunchOverview } from "../launch-control";
import { setCategoryActive } from "../categories";

/**
 * Launch Control's read side against the database: its counts are the
 * storefront's, a switched-off category reads as hidden with its products'
 * statuses intact, and the category view gives each product its reasons.
 * Read-only: the only writes here are the test's own fixtures and one
 * category switch, restored before the test ends.
 */

const tag = randomUUID().slice(0, 8);
const slug = `lc-${tag}`;
const ids = { category: "", brand: "", warehouse: "", listed: "", draft: "" };
const NOW = new Date();
const ACTOR = { id: null, email: "ops@example.test" };

before(async () => {
  ids.category = (await db.category.create({ data: { slug, name: `LC ${tag}` } })).id;
  ids.brand = (await db.brand.create({ data: { slug, name: `LC ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `LC ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const listed = await db.product.create({ data: {
    slug: `${slug}-listed`, title: `LC ${tag} listed`, status: "published", brandId: ids.brand, categoryId: ids.category,
    identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic fixture",
    images: { create: { url: `https://example.test/${slug}.webp`, alt: "lc", isPrimary: true, licence: "manufacturer-official-dealer-use",
      sha256: "e".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT",
      approvedAt: NOW, approvedBy: "test-reviewer", approvalReason: "Synthetic fixture" } },
  } });
  ids.listed = listed.id;
  const v = await db.productVariant.create({ data: { productId: listed.id, sku: `LC-${tag}`, name: "50 kg", pricePaise: 45000, compareAtPaise: 45000, isDefault: true } });
  await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 3 } });
  await db.product.update({ where: { id: listed.id }, data: { commercialReview: { approvedBy: "test-reviewer", reason: "Synthetic fixture" } } });
  ids.draft = (await db.product.create({ data: {
    slug: `${slug}-draft`, title: `LC ${tag} draft`, status: "draft", brandId: ids.brand, categoryId: ids.category,
  } })).id;
});

after(async () => {
  const products = [ids.listed, ids.draft];
  await db.auditLog.deleteMany({ where: { entityId: ids.category } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: { in: products } } });
  await db.productVariant.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.warehouse.delete({ where: { id: ids.warehouse } });
  await db.brand.delete({ where: { id: ids.brand } });
  await db.category.delete({ where: { id: ids.category } });
});

const mine = (o: Awaited<ReturnType<typeof getLaunchOverview>>) => o.departments.flatMap((d) => d.categories).find((c) => c.slug === slug);

test("the overview counts what the storefront lists, and totals agree with the database", async () => {
  const o = await getLaunchOverview();
  const c = mine(o);
  assert.ok(c, "a new category appears in the overview");
  assert.equal(c.state, "shown");
  assert.equal(c.visible, 1);
  assert.deepEqual(c.byStatus, { published: 1, draft: 1 });
  assert.equal(c.hasTaxMapping, false);
  assert.equal(o.totals.visible, await db.product.count({ where: catalogListingWhere() }));
  assert.equal(o.totals.products, await db.product.count());
  assert.equal(o.totals.categories, await db.category.count());
});

test("switched off: reads as hidden, every product says why, and nothing about them changes", async () => {
  assert.equal(await setCategoryActive(slug, false, ACTOR), "changed");
  try {
    const c = mine(await getLaunchOverview());
    assert.equal(c?.state, "hidden");
    assert.equal(c?.visible, 0);
    assert.deepEqual(c?.byStatus, { published: 1, draft: 1 }, "statuses are untouched");

    const view = await getLaunchCategory(slug);
    assert.ok(view);
    assert.equal(view.isActive, false);
    assert.equal(view.total, 2);
    for (const p of view.products) {
      assert.equal(p.state.visible, false);
      assert.ok(p.state.reasons.some((r) => r.code === "CATEGORY_HIDDEN"), `${p.slug} does not name the switched-off category`);
    }
    const draft = view.products.find((p) => p.id === ids.draft);
    assert.ok(draft?.state.reasons.some((r) => r.code === "STATUS_DRAFT"));
  } finally {
    await setCategoryActive(slug, true, ACTOR);
  }
});

test("the category view reports a listed product as visible", async () => {
  const view = await getLaunchCategory(slug);
  const listed = view?.products.find((p) => p.id === ids.listed);
  assert.equal(listed?.state.visible, true);
  assert.equal(listed?.brand.name, `LC ${tag}`);
});

test("an unknown category is null, not an empty page", async () => {
  assert.equal(await getLaunchCategory(`lc-missing-${tag}`), null);
});
