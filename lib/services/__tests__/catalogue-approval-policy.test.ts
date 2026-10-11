import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { getProductBySlug, listProducts, listRooms } from "../catalog";
import { getSuggestions } from "../search";
import { getWishlistItems } from "../wishlist";

const tag = randomUUID().slice(0, 8);
const slug = `approval-probe-${tag}`;
let brandId: string;
let categoryId: string;
let productId: string;
let imageId: string;
const userId = randomUUID();
const productApproval = { identityConfirmed: true, identityApprovedBy: "local-test-reviewer",
  identityApprovedAt: new Date(), identityApprovalReason: "Synthetic fixture identity explicitly reviewed" };
const imageApproval = { sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT" as const,
  approvedAt: new Date(), approvedBy: "local-test-reviewer", approvalReason: "Synthetic fixture image explicitly reviewed" };

before(async () => {
  brandId = (await db.brand.create({ data: { name: slug, slug } })).id;
  categoryId = (await db.category.create({ data: { name: slug, slug } })).id;
  await db.room.create({ data: { name: slug, slug, categories: { create: { categoryId } } } });
  productId = (await db.product.create({ data: { title: `Approval Probe ${tag}`, slug, brandId, categoryId, status: "catalog_only", ...productApproval } })).id;
  imageId = (await db.productImage.create({ data: { productId, url: "https://example.test/approved.webp", alt: "Synthetic approved image", isPrimary: true,
    sha256: "a".repeat(64), licence: "test-fixture-only", ...imageApproval } })).id;
  await db.user.create({ data: { id: userId, phone: `+9198${Date.now().toString().slice(-8)}` } });
  await db.wishlist.create({ data: { userId, items: { create: { productId } } } });
});

after(async () => {
  await db.room.delete({ where: { slug } });
  await db.wishlistItem.deleteMany({ where: { productId } });
  await db.wishlist.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.productImage.deleteMany({ where: { productId } });
  await db.product.delete({ where: { id: productId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.brand.delete({ where: { id: brandId } });
});

async function assertVisibility(expected: boolean) {
  assert.equal(Boolean(await getProductBySlug(slug)), expected, "direct product URL");
  assert.equal((await listProducts({ categorySlug: slug })).items.some(p => p.id === productId), expected, "category listing");
  assert.equal((await listProducts({ search: `Approval Probe ${tag}` })).items.some(p => p.id === productId), expected, "ranked search");
  const suggestions = await getSuggestions(`Approval Probe ${tag}`);
  assert.equal(suggestions.products.some(p => p.slug === slug), expected, "suggestions");
  assert.equal((await getWishlistItems(userId)).some(p => p.id === productId), expected, "wishlist");
  const count = await db.product.count({ where: { categoryId, AND: [catalogListingWhere()] } });
  assert.equal(count, expected ? 1 : 0, "authoritative category count");
  assert.equal((await listRooms()).some(room => room.slug === slug), expected, "room shelves omit hidden categories");
}

test("explicitly approved catalogue-only product is visible with no price or variant", async () => {
  await assertVisibility(true);
  const product = await getProductBySlug(slug);
  assert.equal(product?.purchasable, false);
  assert.deepEqual(product?.variants, []);
});

test("inactive brand fails closed across public readers", async () => {
  await db.brand.update({ where: { id: brandId }, data: { isActive: false } });
  try { await assertVisibility(false); }
  finally { await db.brand.update({ where: { id: brandId }, data: { isActive: true } }); }
});

test("inactive category fails closed across public readers", async () => {
  await db.category.update({ where: { id: categoryId }, data: { isActive: false } });
  try { await assertVisibility(false); }
  finally { await db.category.update({ where: { id: categoryId }, data: { isActive: true } }); }
});

test("provenance alone never qualifies an image", async () => {
  await db.productImage.update({ where: { id: imageId }, data: { identityApproved: false, approvalStatus: "REVIEW_REQUIRED" } });
  try { await assertVisibility(false); }
  finally { await db.productImage.update({ where: { id: imageId }, data: imageApproval }); }
});

test("unconfirmed product identity stays hidden even with an approved image", async () => {
  await db.product.update({ where: { id: productId }, data: { identityConfirmed: false } });
  try { await assertVisibility(false); }
  finally { await db.product.update({ where: { id: productId }, data: productApproval }); }
});

test("P0/P1 cannot be approved; explicit P2 limitation can", async () => {
  for (const severity of ["P0", "P1"] as const) {
    await assert.rejects(db.productImage.update({ where: { id: imageId }, data: { severity, ...imageApproval } }));
    await db.productImage.update({ where: { id: imageId }, data: { severity, identityApproved: false, approvalStatus: "REVIEW_REQUIRED" } });
    await assertVisibility(false);
  }
  await db.productImage.update({ where: { id: imageId }, data: { ...imageApproval, severity: "P2", approvalStatus: "APPROVED_WITH_LIMITATION", approvalReason: "Synthetic fixture: identity correct; crop limitation approved" } });
  await assertVisibility(true);
  await db.productImage.update({ where: { id: imageId }, data: { ...imageApproval, severity: null } });
});

test("replacing image bytes revokes the old approval even in the same update", async () => {
  await db.productImage.update({ where: { id: imageId }, data: { sha256: "b".repeat(64), ...imageApproval } });
  const image = await db.productImage.findUniqueOrThrow({ where: { id: imageId } });
  assert.equal(image.identityApproved, false);
  assert.equal(image.sourceVerified, false);
  assert.equal(image.approvalStatus, "REVIEW_REQUIRED");
  await assertVisibility(false);
  await db.productImage.update({ where: { id: imageId }, data: imageApproval });
});

test("changing product identity revokes the old review", async () => {
  await db.product.update({ where: { id: productId }, data: { title: `Approval Probe ${tag} changed`, ...productApproval } });
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).identityConfirmed, false);
  await assertVisibility(false);
  await db.product.update({ where: { id: productId }, data: productApproval });
});

test("draft/archived and a missing primary image stay hidden", async () => {
  for (const status of ["draft", "archived"] as const) {
    await db.product.update({ where: { id: productId }, data: { status } });
    await assertVisibility(false);
  }
  await db.product.update({ where: { id: productId }, data: { status: "catalog_only" } });
  await db.productImage.update({ where: { id: imageId }, data: { isPrimary: false } });
  await assertVisibility(false);
});

test("in production a photo also needs attested reuse rights; staging is unchanged", async () => {
  /* Owner, 11 Oct 2026: unconfirmed image rights must not silently become a
     production listing. This fixture's licence ("test-fixture-only") is not an
     attested code, so the same approved product disappears where money is live. */
  await db.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
  await assertVisibility(true); // staging baseline: approved product is visible
  const previous = process.env.PAYMENT_GATEWAY;
  try {
    process.env.PAYMENT_GATEWAY = "razorpay-live";
    await assertVisibility(false);
    /* A licence change revokes the image approval (invalidate_catalogue_image_review),
       so attesting rights forces a fresh approval — re-record it, as the owner would. */
    await db.productImage.update({ where: { id: imageId }, data: { licence: "manufacturer-official-dealer-use" } });
    assert.equal((await db.productImage.findUniqueOrThrow({ where: { id: imageId } })).approvalStatus, "REVIEW_REQUIRED");
    await db.productImage.update({ where: { id: imageId }, data: imageApproval });
    await assertVisibility(true);
  } finally {
    if (previous === undefined) delete process.env.PAYMENT_GATEWAY; else process.env.PAYMENT_GATEWAY = previous;
    await db.productImage.update({ where: { id: imageId }, data: { licence: "test-fixture-only" } });
    await db.productImage.update({ where: { id: imageId }, data: imageApproval });
  }
  await assertVisibility(true);
});

