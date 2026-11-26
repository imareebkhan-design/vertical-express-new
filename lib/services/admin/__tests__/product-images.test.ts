import test, { after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "@/lib/db";
import { publicProductWhere } from "@/lib/catalog-policy";
import {
  bucketFromImageBase,
  removeProductImage,
  setPrimaryImage,
  MAX_PHOTOS_PER_PRODUCT,
  approveExtraPhotos,
  sniffImage,
  uploadProductImage,
  type StoreObject,
} from "@/lib/services/admin/product-images";
import { NextRequest } from "next/server";
import { handleImageUpload, sameOrigin } from "@/lib/services/admin/image-upload-handler";
import { createApprovedCatalogueFixture } from "@/test-support/catalogue-fixtures";
import { getProductBySlug } from "@/lib/services/catalog";

/**
 * Photos from the console. An uploaded photo must never be visible before it
 * is approved; the stored file must be the bytes recorded; nothing is attached
 * when storing fails; and a bad file never reaches storage.
 */

const BASE = "https://storage.googleapis.com/ve-test-bucket";
const ACTOR = { id: null, email: "ops@example.test" };
const cleanups: (() => Promise<void>)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

async function fixture() {
  const f = await createApprovedCatalogueFixture();
  cleanups.push(async () => {
    await db.auditLog.deleteMany({ where: { entityId: f.product.id } });
    await f.cleanup();
  });
  return f;
}
const png = (w: number, h: number, shade = 120) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: shade, g: 80, b: 40 } } }).png().toBuffer().then((b) => new Uint8Array(b));
function memoryStore() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const store: StoreObject = async (path, bytes, contentType) => {
    objects.set(path, { bytes, contentType });
  };
  return { objects, store };
}
const upload = (slug: string, bytes: Uint8Array, store: StoreObject, makePrimary = true) =>
  uploadProductImage(
    { productSlug: slug, bytes, alt: "Front of pack", licence: "manufacturer-official-dealer-use", sourceUrl: "https://example.test/p", makePrimary, actor: ACTOR },
    { store, imageBase: BASE }
  );

test("file type comes from the bytes, not the name", async () => {
  assert.deepEqual(sniffImage(await png(10, 10)), { ext: "png", contentType: "image/png" });
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(bucketFromImageBase("https://storage.googleapis.com/ve-staging-product-images"), "ve-staging-product-images");
  assert.throws(() => bucketFromImageBase("https://example.test/x"));
});

test("an uploaded photo is stored by its hash, attached for review, and shown to nobody yet", async () => {
  const f = await fixture();
  const m = memoryStore();
  const bytes = await png(600, 400);
  const r = await upload(f.product.slug, bytes, m.store);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.isPrimary, false, "the product already has a primary photo; the new one does not displace it");
  const [path, obj] = [...m.objects.entries()][0];
  assert.match(path, new RegExp(`^products/${f.product.slug}/upload-[0-9a-f]{64}\\.png$`));
  assert.equal(obj.contentType, "image/png");
  const row = await db.productImage.findUniqueOrThrow({ where: { id: r.imageId! } });
  assert.equal(row.url, `${BASE}/${path}`);
  assert.equal(row.identityApproved, false);
  assert.equal(row.approvalStatus, "REVIEW_REQUIRED");
  assert.deepEqual([row.width, row.height], [600, 400]);
  const again = await upload(f.product.slug, bytes, m.store);
  assert.deepEqual(again.ok && again.alreadyAttached, true, "the same picture twice is one photo");
  assert.equal(await db.productImage.count({ where: { productId: f.product.id } }), 2);
});

test("making an unapproved photo lead hides the product until it is approved", async () => {
  const f = await fixture();
  const m = memoryStore();
  const r = await upload(f.product.slug, await png(500, 500, 30), m.store);
  if (!r.ok || !r.imageId) throw new Error("setup");
  const isPublic = () => db.product.count({ where: { AND: [publicProductWhere(), { id: f.product.id }] } });
  assert.equal(await isPublic(), 1);
  assert.deepEqual(await setPrimaryImage(r.imageId, ACTOR), { ok: true });
  assert.equal(await db.productImage.count({ where: { productId: f.product.id, isPrimary: true } }), 1);
  assert.equal(await isPublic(), 0, "a public product needs an approved primary photo");
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: f.product.id, action: "product.primary_image_changed" } });
  assert.ok(audit.before);
});

test("removing a photo is audited with what was removed", async () => {
  const f = await fixture();
  const primary = await db.productImage.findFirstOrThrow({ where: { productId: f.product.id, isPrimary: true } });
  assert.deepEqual(await removeProductImage(primary.id, ACTOR), { ok: true, wasPrimary: true });
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: f.product.id, action: "product.image_removed" } });
  assert.equal((audit.before as { sha256: string }).sha256, primary.sha256);
});

test("a bad file never reaches storage, and a storage failure attaches nothing", async () => {
  const f = await fixture();
  const m = memoryStore();
  assert.deepEqual(await upload(f.product.slug, new TextEncoder().encode("not an image"), m.store), { ok: false, code: "NOT_AN_IMAGE" });
  assert.deepEqual(await upload(f.product.slug, await png(120, 900), m.store), { ok: false, code: "TOO_SMALL" });
  assert.equal(m.objects.size, 0);
  const failing: StoreObject = async () => {
    throw new Error("403 forbidden");
  };
  const r = await upload(f.product.slug, await png(700, 700, 200), failing);
  assert.equal(!r.ok && r.code, "STORE_FAILED");
  assert.equal(await db.productImage.count({ where: { productId: f.product.id } }), 1);
});

test("an upload without a licence or https source is refused before storage", async () => {
  const f = await fixture();
  const m = memoryStore();
  const r = await uploadProductImage(
    { productSlug: f.product.slug, bytes: await png(400, 400, 90), alt: "x", licence: "", sourceUrl: "http://insecure", makePrimary: false, actor: ACTOR },
    { store: m.store, imageBase: BASE }
  );
  assert.equal(!r.ok && r.code, "INVALID");
  assert.equal(m.objects.size, 0);
});

test("uploads are refused from another site", () => {
  const h = (o: Record<string, string>) => ({ headers: new Headers(o) });
  assert.equal(sameOrigin(h({ origin: "https://shop.example", host: "shop.example" })), true);
  assert.equal(sameOrigin(h({ origin: "https://evil.example", host: "shop.example" })), false);
  assert.equal(sameOrigin(h({ origin: "https://shop.example", "x-forwarded-host": "shop.example", host: "internal:8080" })), true);
  assert.equal(sameOrigin(h({ host: "shop.example" })), false, "no Origin header, no upload");
});

test("a signed-out or non-admin upload is refused before the file is read or stored", async () => {
  const m = memoryStore();
  let formRead = false;
  const req = new NextRequest("https://shop.example/api/admin/product-images", {
    method: "POST",
    headers: { origin: "https://shop.example", host: "shop.example" },
  });
  Object.defineProperty(req, "formData", { value: async () => ((formRead = true), new FormData()) });
  const res = await handleImageUpload(req, { admin: async () => null, store: () => m.store, imageBase: BASE });
  assert.equal(res.status, 403);
  assert.equal(formRead, false);
  assert.equal(m.objects.size, 0);
});

test("a photo from the operator's computer needs no source link, and a blank description takes the product's name", async () => {
  const f = await fixture();
  const m = memoryStore();
  const r = await uploadProductImage(
    { productSlug: f.product.slug, bytes: await png(500, 500, 33), alt: "  ", licence: "manufacturer-official-dealer-use", makePrimary: false, actor: ACTOR },
    { store: m.store, imageBase: BASE }
  );
  assert.equal(r.ok, true, r.ok ? "" : `${r.code} ${r.detail ?? ""}`);
  if (!r.ok || !r.imageId) return;
  const row = await db.productImage.findUniqueOrThrow({ where: { id: r.imageId }, select: { sourceUrl: true, alt: true, licence: true } });
  const title = (await db.product.findUniqueOrThrow({ where: { id: f.product.id }, select: { title: true } })).title;
  assert.deepEqual(row, { sourceUrl: null, alt: title, licence: "manufacturer-official-dealer-use" });
  const audit = await db.auditLog.findFirst({ where: { entityId: f.product.id, action: "product.images_attached" }, orderBy: { createdAt: "desc" }, select: { actorId: true } });
  assert.ok(audit, "the upload left no audit row recording who made it");
});

test("a product holds at most 30 photos; the 31st is refused before storage", async () => {
  const f = await fixture();
  const count = await db.productImage.count({ where: { productId: f.product.id } });
  await db.productImage.createMany({
    data: Array.from({ length: MAX_PHOTOS_PER_PRODUCT - count }, (_, i) => ({ productId: f.product.id, url: `${BASE}/filler-${i}.png`, alt: "x", sortOrder: 100 + i })),
  });
  const m = memoryStore();
  const r = await uploadProductImage(
    { productSlug: f.product.slug, bytes: await png(500, 500, 44), alt: "x", licence: "manufacturer-official-dealer-use", makePrimary: false, actor: ACTOR },
    { store: m.store, imageBase: BASE }
  );
  assert.equal(!r.ok && r.code, "TOO_MANY");
  assert.equal(m.objects.size, 0, "a refused photo was stored");
});

test("an extra photo reaches the customer gallery only once a named operator approves it, after the lead", async () => {
  const f = await fixture();
  const user = await db.user.create({ data: { id: crypto.randomUUID() }, select: { id: true } });
  cleanups.push(async () => { await db.user.deleteMany({ where: { id: user.id } }); });
  const actor = { id: user.id, email: "owner@example.test" };
  const m = memoryStore();
  const up = await upload(f.product.slug, await png(500, 500, 77), m.store, false);
  assert.ok(up.ok && up.imageId);
  if (!up.ok || !up.imageId) return;
  const gallery = async () => (await getProductBySlug(f.product.slug))?.images.length ?? 0;
  const before = await gallery();

  /* The lead cannot be approved this way: its approval is the identity decision. */
  const lead = await db.productImage.findFirstOrThrow({ where: { productId: f.product.id, isPrimary: true }, select: { id: true } });
  assert.equal((await approveExtraPhotos(f.product.id, [lead.id], actor)).ok, false);

  assert.deepEqual(await approveExtraPhotos(f.product.id, [up.imageId], actor), { ok: true, approved: 1 });
  assert.equal(await gallery(), before + 1, "the approved extra photo is not in the customer gallery");
  assert.deepEqual(await approveExtraPhotos(f.product.id, [up.imageId], actor), { ok: true, approved: 0 }, "approving twice wrote twice");
  const audit = await db.auditLog.findFirst({ where: { entityId: f.product.id, action: "catalogue.extra_photos_approved" }, select: { actorId: true } });
  assert.equal(audit?.actorId, user.id);

  /* Without the identity decision nothing extra can be approved. */
  await db.product.update({ where: { id: f.product.id }, data: { identityConfirmed: false, identityApprovedAt: null, identityApprovedBy: null, identityApprovalReason: null } });
  const up2 = await upload(f.product.slug, await png(500, 500, 88), m.store, false);
  assert.ok(up2.ok && up2.imageId);
  if (!up2.ok || !up2.imageId) return;
  assert.deepEqual(await approveExtraPhotos(f.product.id, [up2.imageId], actor), { ok: false, code: "LEAD_NOT_APPROVED" });
});
