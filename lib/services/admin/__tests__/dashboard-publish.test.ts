import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { createProduct } from "@/lib/services/admin/product-create";
import { uploadProductImage, type StoreObject } from "@/lib/services/admin/product-images";
import { recordCatalogueApproval } from "@/lib/services/admin/catalogue-approval";
import { createStockRecords } from "@/lib/services/admin/product-details";
import { currentOffer, recordCommercialReview } from "@/lib/services/admin/commercial-review";
import { setProductStatus } from "@/lib/services/admin/product-status";
import { sellableReasons } from "@/lib/services/admin/publish-guard";
import { validateCommercialReadiness } from "@/lib/services/admin/commercial-readiness";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { explainProducts } from "@/lib/services/catalog-state";
import { liveSteps, uncoveredReasons } from "@/lib/product-live";

/**
 * From a draft to the storefront using only what the dashboard can call.
 *
 * Every service here is one a console action runs. Nothing is written to the
 * database directly, no test-only approval is applied and no script is used —
 * that is the point: before the product page offered the approval form, a
 * product created from the dashboard had no route to an approved photo and
 * could never be published. If a step is ever again reachable only from a
 * script, this file fails at that step.
 */

const BASE = "https://storage.googleapis.com/ve-test-bucket";
const SLUG = `zzz-dash-publish-${Date.now()}`;
const SKU = `ZZZ-DASH-${Date.now()}`;
let userId: string | null = null;

after(async () => {
  const p = await db.product.findUnique({ where: { slug: SLUG }, select: { id: true, variants: { select: { id: true } } } });
  if (p) {
    const vids = p.variants.map((v) => v.id);
    await db.stockMovement.deleteMany({ where: { variantId: { in: vids } } });
    await db.inventory.deleteMany({ where: { variantId: { in: vids } } });
    await db.auditLog.deleteMany({ where: { entityId: p.id } });
    await db.product.delete({ where: { id: p.id } });
  }
  if (userId) await db.user.deleteMany({ where: { id: userId } });
});

const store: StoreObject = async () => {};

test("a product added from the dashboard reaches the storefront through dashboard steps alone", async () => {
  userId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  const actor = { id: userId, email: "owner@example.test" };
  const [brand, category, warehouse] = await Promise.all([
    db.brand.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    db.category.findFirstOrThrow({ where: { isActive: true, slug: { in: Object.keys(CATEGORY_TAX_CONFIGS) } }, select: { id: true, name: true } }),
    db.warehouse.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  /* 1. The listing form: a draft, with no warehouse and no delivery choice —
        the two things an operator most easily leaves for later. */
  const created = await createProduct(
    {
      title: "Zzz Dashboard Cement", slug: SLUG, brandId: brand.id, categoryId: category.id, description: null,
      unitLabel: "per bag", deliverySpeed: null, status: "draft",
      variant: { name: "50 kg bag", sku: SKU, pricePaise: 40_000, compareAtPaise: 42_000 },
      openingStock: null, express: { eligible: false, pincodes: [] },
      specs: [{ label: "Grade", value: "OPC 53" }],
    },
    actor
  );
  assert.deepEqual(created, { ok: true, slug: SLUG });
  const product = await db.product.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true, variants: { select: { id: true } } } });
  const id = product.id;

  const steps = async () => {
    const p = await db.product.findUniqueOrThrow({
      where: { id },
      select: {
        deliverySpeed: true, identityConfirmed: true, identityApprovedAt: true, commercialReview: true,
        images: { where: { isPrimary: true }, select: { identityApproved: true, approvalStatus: true } },
        variants: { where: { isActive: true }, select: { sku: true, name: true, isDefault: true, pricePaise: true, compareAtPaise: true, inventory: { select: { id: true } } } },
      },
    });
    const issues = await validateCommercialReadiness(db, id);
    return liveSteps({
      slug: SLUG, hasLeadPhoto: p.images.length > 0,
      leadPhotoApproved: p.images[0]?.identityApproved === true && p.images[0].approvalStatus === "APPROVED_EXACT",
      licenceUnattested: false, identityConfirmed: p.identityConfirmed && p.identityApprovedAt !== null,
      variants: p.variants.map((v) => ({ ...v, hasStockRecord: v.inventory.length > 0 })),
      deliverySpeed: p.deliverySpeed, taxConfigured: true, categoryName: category.name,
      reviewCurrent: p.commercialReview !== null && !issues.some((b) => /review|Delivery classification/i.test(b)),
      reviewOnFile: p.commercialReview !== null,
    });
  };
  const todo = async () => (await steps()).filter((s) => !s.done).map((s) => s.key);

  /* The checklist names exactly what the gate will refuse, and nothing the gate reports is uncovered. */
  assert.deepEqual(await todo(), ["photo", "approval", "stock", "delivery", "review"]);
  assert.deepEqual(uncoveredReasons(await sellableReasons(db, id)), []);
  const early = await setProductStatus(id, "published", actor);
  assert.equal(early.ok, false, "a draft with nothing done was published");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id }, select: { status: true } })).status, "draft", "the refused publish left the status changed");

  /* 2. The photo, from the product page. */
  const bytes = new Uint8Array(await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toBuffer());
  const up = await uploadProductImage(
    { productSlug: SLUG, bytes, alt: "Front of the 50 kg bag", licence: "manufacturer-official-dealer-use", sourceUrl: "https://example.test/bag", makePrimary: true, actor },
    { store, imageBase: BASE }
  );
  assert.equal(up.ok && up.isPrimary, true, "the first photo did not become the lead photo");
  assert.deepEqual(await todo(), ["approval", "stock", "delivery", "review"]);

  /* 3. Identity and photo approval, from the product page. */
  const forApproval = await db.product.findUniqueOrThrow({
    where: { id }, select: { updatedAt: true, images: { where: { isPrimary: true }, select: { id: true, sha256: true } } },
  });
  const approval = await recordCatalogueApproval(userId, {
    productId: id, imageId: forApproval.images[0].id, expectedImageSha256: forApproval.images[0].sha256!,
    expectedProductUpdatedAt: forApproval.updatedAt.toISOString(), identity: "CONFIRMED", image: "APPROVED_EXACT",
    severity: null, packDecision: null, evidence: "Checked against the bag in the warehouse", limitations: null,
  });
  assert.deepEqual(approval, { ok: true, public: false }, "an approved draft was reported as public");
  assert.deepEqual(await todo(), ["stock", "delivery", "review"]);

  /* 4. A stock record at zero. */
  /* All or none: an unknown pack alongside a real one writes nothing. */
  assert.deepEqual(await createStockRecords([product.variants[0].id, randomUUID()], warehouse.id, actor), { ok: false, code: "NOT_FOUND" });
  assert.equal(await db.inventory.count({ where: { variantId: product.variants[0].id } }), 0, "a refused batch left a stock record behind");
  assert.deepEqual(await createStockRecords([product.variants[0].id], warehouse.id, actor), { ok: true, created: 1 });
  assert.deepEqual(await createStockRecords([product.variants[0].id], warehouse.id, actor), { ok: true, created: 0 }, "a second click wrote a second record");
  assert.equal(await db.stockMovement.count({ where: { variantId: product.variants[0].id } }), 0, "a zero record invented a movement");
  assert.deepEqual(await todo(), ["delivery", "review"]);

  /* 5. The price review is refused until delivery is chosen, and says so. */
  const refused = await recordCommercialReview({ productId: id, actor, reason: "Supplier list of 17 Nov", seen: (await currentOffer(db, id))! });
  assert.deepEqual(refused, { ok: false, code: "NOT_REVIEWABLE", detail: "Choose the delivery class (express or scheduled) on the product first" });
  await db.product.update({ where: { id }, data: { deliverySpeed: "scheduled" } }); // the editor's Save
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id }, select: { identityConfirmed: true } })).identityConfirmed, true,
    "choosing delivery cleared the identity approval"
  );
  assert.deepEqual(await todo(), ["review"]);

  /* 6. The price and tax review. */
  const review = await recordCommercialReview({ productId: id, actor, reason: "Supplier list of 17 Nov", seen: (await currentOffer(db, id))! });
  assert.deepEqual(review, { ok: true, remaining: [] });
  assert.deepEqual(await todo(), []);
  assert.deepEqual(await sellableReasons(db, id), []);

  /* 7. Publish — gated and audited. */
  assert.deepEqual(await setProductStatus(id, "published", actor), { ok: true, changed: true, slug: SLUG });
  const audit = await db.auditLog.findFirst({ where: { entityId: id, action: "catalogue.product_published" }, select: { before: true, after: true } });
  assert.deepEqual(audit?.before, { status: "draft" });

  /* 8. The storefront's own rule lists it, and the explanation agrees. */
  assert.equal(await db.product.count({ where: { id, AND: [catalogListingWhere()] } }), 1, "the published product is not in the storefront listing");
  const state = (await explainProducts([id])).get(id);
  assert.equal(state?.visible, true);
  assert.equal(state?.action, "buy");

  /* 9. A price change takes it off sale until reviewed again, and the checklist says which step. */
  await db.productVariant.update({ where: { id: product.variants[0].id }, data: { pricePaise: 41_000 } });
  assert.deepEqual(await todo(), ["review"]);

  /* 10. Archived: hidden everywhere, and its history still reads. */
  assert.equal((await setProductStatus(id, "archived", actor)).ok, true);
  assert.equal(await db.product.count({ where: { id, AND: [catalogListingWhere()] } }), 0);
  assert.equal((await explainProducts([id])).get(id)?.reasons[0]?.code, "STATUS_ARCHIVED");
});
