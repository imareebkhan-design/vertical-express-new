import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { applyLaunchChange, listLaunchBatches, planLaunchChange, planLaunchUndo } from "../launch-control";

/**
 * Launch Control switches (PR-4): plan, apply, undo.
 *
 *  - a plan measures with the storefront's own queries and leaves the database
 *    exactly as it was;
 *  - an apply is one batch, all or nothing, refused when anything changed since
 *    the plan, typed when it changes more than one switch, audited per row and
 *    per batch;
 *  - hiding never touches a product, so undo restores the shop exactly;
 *  - undo leaves alone what was changed again since, and says so.
 */

const tag = randomUUID().slice(0, 8);
const ACTOR = { id: null, email: "ops@example.test" };
const cat = (n: number) => `ls-${tag}-c${n}`;
const brandSlug = `ls-${tag}-b`;
const ids = { c1: "", c2: "", brand: "", warehouse: "", p1: "", p2: "", v1: "" };
const NOW = new Date();

async function listedProduct(categoryId: string, n: number) {
  const p = await db.product.create({ data: {
    slug: `ls-${tag}-p${n}`, title: `LS ${tag} ${n}`, status: "published", brandId: ids.brand, categoryId,
    identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic fixture",
    images: { create: { url: `https://example.test/ls-${tag}-${n}.webp`, alt: "ls", isPrimary: true, licence: "manufacturer-official-dealer-use",
      sha256: "9".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT",
      approvedAt: NOW, approvedBy: "test-reviewer", approvalReason: "Synthetic fixture" } },
  } });
  const v = await db.productVariant.create({ data: { productId: p.id, sku: `LS-${tag}-${n}`, name: "Unit", pricePaise: 5000, compareAtPaise: 5000, isDefault: true } });
  await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 2 } });
  await db.product.update({ where: { id: p.id }, data: { commercialReview: { approvedBy: "test-reviewer", reason: "Synthetic fixture" } } });
  return { id: p.id, variantId: v.id };
}

before(async () => {
  ids.c1 = (await db.category.create({ data: { slug: cat(1), name: `LS ${tag} one` } })).id;
  ids.c2 = (await db.category.create({ data: { slug: cat(2), name: `LS ${tag} two` } })).id;
  ids.brand = (await db.brand.create({ data: { slug: brandSlug, name: `LS ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `LS ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const a = await listedProduct(ids.c1, 1);
  ids.p1 = a.id; ids.v1 = a.variantId;
  ids.p2 = (await listedProduct(ids.c2, 2)).id;
});

after(async () => {
  const products = [ids.p1, ids.p2];
  await db.cartItem.deleteMany({ where: { variant: { productId: { in: products } } } });
  await db.auditLog.deleteMany({ where: { OR: [
    { entityId: { in: [ids.c1, ids.c2, ids.brand] } },
    { entityType: "launch_batch", after: { path: ["by"], equals: ACTOR.email } },
  ] } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: { in: products } } });
  await db.productVariant.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.warehouse.delete({ where: { id: ids.warehouse } });
  await db.brand.delete({ where: { id: ids.brand } });
  await db.category.deleteMany({ where: { id: { in: [ids.c1, ids.c2] } } });
});

const flags = async () => ({
  cats: await db.category.findMany({ where: { id: { in: [ids.c1, ids.c2] } }, select: { slug: true, isActive: true, updatedAt: true }, orderBy: { slug: "asc" } }),
  brand: await db.brand.findUniqueOrThrow({ where: { id: ids.brand }, select: { isActive: true, updatedAt: true } }),
  audits: await db.auditLog.count({ where: { entityId: { in: [ids.c1, ids.c2, ids.brand] } } }),
});
const productState = () => db.product.findMany({
  where: { id: { in: [ids.p1, ids.p2] } }, orderBy: { slug: "asc" },
  select: { status: true, commercialReview: true, updatedAt: true, variants: { select: { isActive: true, pricePaise: true, inventory: { select: { qtyOnHand: true } } } } },
});
const listed = () => db.product.count({ where: { id: { in: [ids.p1, ids.p2] }, AND: [catalogListingWhere()] } });

test("a plan measures the real effect and leaves the database exactly as it was", async () => {
  const anonId = randomUUID();
  const cart = await db.cart.create({ data: { anonId } });
  await db.cartItem.create({ data: { cartId: cart.id, variantId: ids.v1, qty: 1 } });
  try {
    const before = await flags();
    const plan = await planLaunchChange({ categories: [{ slug: cat(1), isActive: false }], brands: [] });
    assert.deepEqual(await flags(), before, "nothing written, not even an updated_at");
    assert.deepEqual(plan.rows, [{ kind: "category", slug: cat(1), name: `LS ${tag} one`, before: true, to: false, change: "change" }]);
    assert.equal(plan.impact.newlyHidden, 1);
    assert.equal(plan.impact.newlyShown, 0);
    assert.equal(plan.impact.productsVisibleBefore - plan.impact.productsVisibleAfter, 1);
    assert.equal(plan.impact.cartLinesAffected, 1, "the shopper's cart line is counted");
    assert.equal(plan.confirmText, null, "one switch is a click");
  } finally {
    await db.cart.delete({ where: { anonId } });
  }
});

test("a brand switch is measured across categories", async () => {
  const plan = await planLaunchChange({ brands: [{ slug: brandSlug, isActive: false }] });
  assert.equal(plan.impact.newlyHidden, 2);
});

test("apply refuses without the planned states, when stale, when missing, and when the typed confirmation is wrong — writing nothing", async () => {
  const before = await flags();
  const twoRows = { categories: [{ slug: cat(1), isActive: false, expected: true }, { slug: cat(2), isActive: false, expected: true }] };
  assert.equal((await applyLaunchChange({ categories: [{ slug: cat(1), isActive: false }] }, null, ACTOR)).ok, false, "no expected state");
  assert.deepEqual(await applyLaunchChange({ categories: [{ slug: cat(1), isActive: false, expected: false }] }, null, ACTOR),
    { ok: false, code: "STALE_PLAN", stale: [{ kind: "category", slug: cat(1) }] });
  assert.deepEqual(await applyLaunchChange({ categories: [{ slug: `ls-${tag}-nope`, isActive: false, expected: true }] }, null, ACTOR),
    { ok: false, code: "MISSING", missing: [{ kind: "category", slug: `ls-${tag}-nope` }] });
  assert.deepEqual(await applyLaunchChange(twoRows, null, ACTOR), { ok: false, code: "CONFIRMATION_REQUIRED", expected: "HIDE 2" });
  assert.deepEqual(await applyLaunchChange(twoRows, "HIDE 1", ACTOR), { ok: false, code: "CONFIRMATION_REQUIRED", expected: "HIDE 2" });
  assert.deepEqual(await flags(), before, "every refusal left the database untouched");
});

test("a stale row aborts the whole batch, including rows that were still current", async () => {
  const before = await flags();
  const r = await applyLaunchChange({ categories: [
    { slug: cat(1), isActive: false, expected: true },
    { slug: cat(2), isActive: false, expected: false }, // operator saw it hidden; it is shown
  ] }, "HIDE 2", ACTOR);
  assert.equal(r.ok, false);
  assert.deepEqual(await flags(), before);
});

test("apply hides as one audited batch; undo restores the shop and every product exactly", async () => {
  const productsBefore = await productState();
  assert.equal(await listed(), 2);
  const r = await applyLaunchChange({ categories: [
    { slug: cat(1), isActive: false, expected: true }, { slug: cat(2), isActive: false, expected: true },
  ] }, "hide 2", ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok || !r.batchId) throw new Error("apply failed");
  assert.equal(await listed(), 0);
  assert.deepEqual(await productState(), productsBefore, "hiding touched no product");

  const rowAudits = await db.auditLog.findMany({ where: { entityId: { in: [ids.c1, ids.c2] }, after: { path: ["batchId"], equals: r.batchId } } });
  assert.equal(rowAudits.length, 2);
  assert.ok(rowAudits.every((a) => a.action === "catalogue.category_hidden"));
  const batchAudit = await db.auditLog.findFirstOrThrow({ where: { entityType: "launch_batch", entityId: r.batchId } });
  assert.equal((batchAudit.after as { by: string }).by, ACTOR.email);

  const undo = await planLaunchUndo(r.batchId);
  assert.ok(undo?.plan);
  assert.deepEqual(undo.conflicts, []);
  assert.equal(undo.plan.undoOf, r.batchId);
  assert.equal(undo.plan.impact.newlyShown, 2);
  const u = await applyLaunchChange(
    { categories: undo.plan.rows.filter((x) => x.kind === "category").map((x) => ({ slug: x.slug, isActive: x.to, expected: x.before! })) },
    undo.plan.confirmText, ACTOR, r.batchId,
  );
  assert.equal(u.ok, true);
  assert.equal(await listed(), 2);
  assert.deepEqual(await productState(), productsBefore, "after undo every product is byte-identical");

  const batches = await listLaunchBatches(20);
  const original = batches.find((b) => b.batchId === r.batchId);
  assert.equal(original?.undoneBy, u.ok ? u.batchId : null, "the history shows the batch was undone, and by which");
});

test("undo leaves alone what was changed again since, and reports it", async () => {
  const r = await applyLaunchChange({ categories: [
    { slug: cat(1), isActive: false, expected: true }, { slug: cat(2), isActive: false, expected: true },
  ] }, "HIDE 2", ACTOR);
  if (!r.ok || !r.batchId) throw new Error("apply failed");
  // Someone shows category two again by hand.
  await applyLaunchChange({ categories: [{ slug: cat(2), isActive: true, expected: false }] }, null, ACTOR);
  const undo = await planLaunchUndo(r.batchId);
  assert.deepEqual(undo?.conflicts, [{ kind: "category", slug: cat(2) }]);
  assert.deepEqual(undo?.plan?.rows.map((x) => [x.slug, x.to]), [[cat(1), true]]);
  const u = await applyLaunchChange({ categories: [{ slug: cat(1), isActive: true, expected: false }] }, null, ACTOR, r.batchId);
  assert.equal(u.ok, true);
  assert.equal(await listed(), 2);
});

test("two applies of the same change race: exactly one wins, the other is stale", async () => {
  const change = { brands: [{ slug: brandSlug, isActive: false, expected: true }] };
  const results = await Promise.all([applyLaunchChange(change, null, ACTOR), applyLaunchChange(change, null, ACTOR)]);
  assert.deepEqual(results.map((x) => x.ok).sort(), [false, true]);
  const loser = results.find((x) => !x.ok);
  assert.equal(loser && !loser.ok ? loser.code : null, "STALE_PLAN");
  await applyLaunchChange({ brands: [{ slug: brandSlug, isActive: true, expected: false }] }, null, ACTOR);
  assert.equal(await listed(), 2);
});

test("an unknown batch cannot be undone", async () => {
  assert.equal(await planLaunchUndo(randomUUID()), null);
});
