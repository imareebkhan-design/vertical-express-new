import test, { after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "@/lib/db";
import { publicProductWhere } from "@/lib/catalog-policy";
import {
  bucketFromImageBase,
  removeProductImage,
  setPrimaryImage,
  sniffImage,
  uploadProductImage,
  type StoreObject,
} from "@/lib/services/admin/product-images";
import { sameOrigin } from "@/lib/services/admin/image-upload-handler";
import { createApprovedCatalogueFixture } from "@/test-support/catalogue-fixtures";

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
