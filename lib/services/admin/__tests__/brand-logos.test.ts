import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { removeBrandLogo, uploadBrandLogo } from "@/lib/services/admin/brand-logos";
import { handleBrandLogoUpload } from "@/lib/services/admin/brand-logo-upload-handler";
import { createBrand } from "@/lib/services/admin/brand-writes";
import type { StoreObject } from "@/lib/services/admin/product-images";

/**
 * Brand logos (issue #7). A logo is stored only with a rights declaration and a
 * licence, both audited with the file's hash; only raster images from their
 * bytes; nothing changes when storing fails; removing keeps an undo trail.
 */

const BASE = "https://storage.googleapis.com/ve-test-bucket";
const TAG = `zzlogo-${randomUUID().slice(0, 8)}`;
const createdIds: string[] = [];
after(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
  await db.brand.deleteMany({ where: { id: { in: createdIds } } });
});

async function actor() {
  const u = await db.user.findFirst({ select: { id: true } });
  return { id: u?.id ?? randomUUID(), email: "ops@example.test" };
}
async function brand(suffix: string) {
  const a = await actor();
  const created = await createBrand({ name: `${TAG} ${suffix}`, slug: `${TAG}-${suffix}`, isActive: true }, a);
  createdIds.push(created.id);
  return { ...created, actor: a };
}
const png = (w: number, h: number, shade = 90) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: shade, g: 30, b: 160 } } }).png().toBuffer().then((b) => new Uint8Array(b));
function memoryStore() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const store: StoreObject = async (path, bytes, contentType) => {
    objects.set(path, { bytes, contentType });
  };
  return { objects, store };
}
const LICENCE = "dealer agreement 2026";

test("a logo is stored by its hash and audited with the rights declaration and licence", async () => {
  const b = await brand("ok");
  const m = memoryStore();
  const bytes = await png(200, 120);
  const r = await uploadBrandLogo(
    { brandSlug: b.slug, bytes, rightsConfirmed: true, licence: LICENCE, sourceUrl: "https://example.test/brand", actor: b.actor },
    { store: m.store, imageBase: BASE }
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const prefix = `${BASE}/brands/${b.slug}/logo-`;
  assert.ok(r.logoUrl.startsWith(prefix) && r.logoUrl.endsWith(".png"), r.logoUrl);
  assert.match(r.logoUrl.slice(prefix.length, -".png".length), /^[a-f0-9]{64}$/);
  assert.equal(m.objects.size, 1);
  const row = await db.brand.findUniqueOrThrow({ where: { id: b.id }, select: { logoUrl: true } });
  assert.equal(row.logoUrl, r.logoUrl);
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: b.id, action: "brand.logo_set" } });
  const after = audit.after as Record<string, unknown>;
  assert.equal(after.licence, LICENCE);
  assert.equal(after.rightsDeclaredBy, "ops@example.test");
  assert.equal(after.sourceUrl, "https://example.test/brand");
  assert.match(String(after.sha256), /^[a-f0-9]{64}$/);

  // The same file again changes nothing and writes no second audit row.
  const again = await uploadBrandLogo(
    { brandSlug: b.slug, bytes, rightsConfirmed: true, licence: LICENCE, actor: b.actor },
    { store: m.store, imageBase: BASE }
  );
  assert.deepEqual(again, { ok: true, logoUrl: r.logoUrl, unchanged: true });
  assert.equal(await db.auditLog.count({ where: { entityId: b.id, action: "brand.logo_set" } }), 1);
});

test("no rights declaration or no licence: refused before anything is stored", async () => {
  const b = await brand("rights");
  const m = memoryStore();
  const bytes = await png(200, 120);
  const noRights = await uploadBrandLogo({ brandSlug: b.slug, bytes, rightsConfirmed: false, licence: LICENCE, actor: b.actor }, { store: m.store, imageBase: BASE });
  assert.equal(noRights.ok === false && noRights.code, "RIGHTS_REQUIRED");
  const noLicence = await uploadBrandLogo({ brandSlug: b.slug, bytes, rightsConfirmed: true, licence: "  ", actor: b.actor }, { store: m.store, imageBase: BASE });
  assert.equal(noLicence.ok === false && noLicence.code, "LICENCE_REQUIRED");
  const badSource = await uploadBrandLogo(
    { brandSlug: b.slug, bytes, rightsConfirmed: true, licence: LICENCE, sourceUrl: "javascript:alert(1)", actor: b.actor },
    { store: m.store, imageBase: BASE }
  );
  assert.equal(badSource.ok === false && badSource.code, "BAD_SOURCE");
  assert.equal(m.objects.size, 0);
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: b.id } })).logoUrl, null);
});

test("only raster images of a usable size; SVG and tiny files never reach storage", async () => {
  const b = await brand("files");
  const m = memoryStore();
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  const r1 = await uploadBrandLogo({ brandSlug: b.slug, bytes: svg, rightsConfirmed: true, licence: LICENCE, actor: b.actor }, { store: m.store, imageBase: BASE });
  assert.equal(r1.ok === false && r1.code, "NOT_AN_IMAGE");
  const r2 = await uploadBrandLogo({ brandSlug: b.slug, bytes: await png(40, 40), rightsConfirmed: true, licence: LICENCE, actor: b.actor }, { store: m.store, imageBase: BASE });
  assert.equal(r2.ok === false && r2.code, "TOO_SMALL");
  assert.equal(m.objects.size, 0);
});

test("a failed store changes nothing; replacing and removing keep the previous URL in the audit", async () => {
  const b = await brand("swap");
  const failing: StoreObject = async () => {
    throw new Error("bucket down");
  };
  const failed = await uploadBrandLogo({ brandSlug: b.slug, bytes: await png(100, 100), rightsConfirmed: true, licence: LICENCE, actor: b.actor }, { store: failing, imageBase: BASE });
  assert.equal(failed.ok === false && failed.code, "STORE_FAILED");
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: b.id } })).logoUrl, null);

  const m = memoryStore();
  const first = await uploadBrandLogo({ brandSlug: b.slug, bytes: await png(100, 100, 10), rightsConfirmed: true, licence: LICENCE, actor: b.actor }, { store: m.store, imageBase: BASE });
  const second = await uploadBrandLogo({ brandSlug: b.slug, bytes: await png(100, 100, 200), rightsConfirmed: true, licence: LICENCE, actor: b.actor }, { store: m.store, imageBase: BASE });
  assert.ok(first.ok && second.ok);
  if (!first.ok || !second.ok) return;
  const replaced = await db.auditLog.findMany({ where: { entityId: b.id, action: "brand.logo_set" }, orderBy: { createdAt: "asc" } });
  assert.equal((replaced[1].before as { logoUrl: string }).logoUrl, first.logoUrl);

  assert.equal(await removeBrandLogo(b.slug, b.actor), "removed");
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: b.id } })).logoUrl, null);
  const removed = await db.auditLog.findFirstOrThrow({ where: { entityId: b.id, action: "brand.logo_removed" } });
  assert.equal((removed.before as { logoUrl: string }).logoUrl, second.logoUrl);
  assert.equal(await removeBrandLogo(b.slug, b.actor), "unchanged");
  assert.equal(await removeBrandLogo(`${TAG}-nope`, b.actor), "missing");
});

test("the upload route refuses cross-site requests and non-admins before reading the file", async () => {
  const b = await brand("route");
  const m = memoryStore();
  const form = new FormData();
  form.set("file", new Blob([await png(100, 100)], { type: "image/png" }));
  form.set("slug", b.slug);
  form.set("licence", LICENCE);
  form.set("rightsConfirmed", "1");
  const req = (origin: string) =>
    new NextRequest("https://admin.example.test/api/admin/brand-logos", { method: "POST", body: form, headers: { origin, host: "admin.example.test" } });

  const cross = await handleBrandLogoUpload(req("https://evil.example"), { admin: async () => b.actor, store: () => m.store, imageBase: BASE });
  assert.equal(cross.status, 403);
  const notAdmin = await handleBrandLogoUpload(req("https://admin.example.test"), { admin: async () => null, store: () => m.store, imageBase: BASE });
  assert.equal(notAdmin.status, 403);
  assert.equal(m.objects.size, 0);
});

test("createBrand refuses a duplicate name or slug instead of renaming the existing brand", async () => {
  const b = await brand("dupe");
  const a = await actor();
  const isBrandP2002 = (e: unknown) => (e as { code?: string; meta?: { modelName?: string } }).code === "P2002" && (e as { meta?: { modelName?: string } }).meta?.modelName === "Brand";
  await assert.rejects(createBrand({ name: `${TAG} other`, slug: b.slug, isActive: true }, a, "product_form"), isBrandP2002);
  await assert.rejects(createBrand({ name: b.name, slug: `${TAG}-other`, isActive: true }, a, "product_form"), isBrandP2002);
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: b.id } })).name, b.name);
});
