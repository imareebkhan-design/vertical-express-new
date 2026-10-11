import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { publicProductWhere } from "@/lib/catalog-policy";
import { recordCatalogueApproval, recordBatchApproval, APPROVAL_BATCHES, type ApprovalInput } from "../catalogue-approval";

/**
 * Owner approval recording. One decision per product, by the signed-in admin,
 * against exactly what the screen showed. Approval makes a catalog-only product
 * public through the shared policy; a later photo change revokes it.
 */
const tag = randomUUID().slice(0, 8);
const ADMIN = randomUUID();
const ids: { cat?: string; brand?: string } = {};
type P = { id: string; imageId: string; sha: string; updatedAt: string; secondImageId?: string };
const p: Record<string, P> = {};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function make(k: string, title: string, opts: { second?: boolean } = {}): Promise<P> {
  const prod = await db.product.create({ data: { slug: `appr-${tag}-${k}`, title, brandId: ids.brand!, categoryId: ids.cat!, status: "catalog_only" } });
  const img = await db.productImage.create({ data: { productId: prod.id, url: `https://example.test/${k}.webp`, alt: k, isPrimary: true, sha256: sha(k), licence: "test", sourceUrl: "https://example.test/src" } });
  let secondImageId: string | undefined;
  if (opts.second) secondImageId = (await db.productImage.create({ data: { productId: prod.id, url: `https://example.test/${k}-2.webp`, alt: k, isPrimary: false, sha256: sha(k + "2") } })).id;
  const fresh = await db.product.findUniqueOrThrow({ where: { id: prod.id }, select: { updatedAt: true } });
  return { id: prod.id, imageId: img.id, sha: sha(k), updatedAt: fresh.updatedAt.toISOString(), secondImageId };
}
const input = (x: P, over: Partial<ApprovalInput> = {}): ApprovalInput => ({
  productId: x.id, imageId: x.imageId, expectedImageSha256: x.sha, expectedProductUpdatedAt: x.updatedAt,
  identity: "CONFIRMED", image: "APPROVED_EXACT", evidence: "Compared photo with manufacturer page", ...over,
});
const isPublic = async (id: string) => !!(await db.product.findFirst({ where: { id, AND: [publicProductWhere()] }, select: { id: true } }));

before(async () => {
  ids.cat = (await db.category.create({ data: { slug: `appr-cat-${tag}`, name: `APPR ${tag}` } })).id;
  ids.brand = (await db.brand.create({ data: { slug: `appr-brand-${tag}`, name: `APPR Brand ${tag}` } })).id;
  await db.user.create({ data: { id: ADMIN, phone: `+9195${String(Date.now()).slice(-8)}`, email: `appr_${tag}@example.com` } });
  p.a = await make("a", `Angle Grinder ${tag}`);
  p.b = await make("b", `Drill ${tag}`, { second: true });
  p.c = await make("c", `Router Bit Set 12 pcs ${tag}`);
  p.d = await make("d", `Planer ${tag}`);
  p.e = await make("e", `Blower ${tag}`);
});

after(async () => {
  const productIds = Object.values(p).map((x) => x.id);
  await db.auditLog.deleteMany({ where: { entityType: "product", entityId: { in: productIds } } });
  await db.productImage.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.brand.deleteMany({ where: { id: ids.brand } });
  await db.category.deleteMany({ where: { id: ids.cat } });
  await db.user.deleteMany({ where: { id: ADMIN } });
});

test("an unapproved catalog-only product is not public", async () => {
  assert.equal(await isPublic(p.a.id), false);
});

test("an owner decision makes it public, records the admin as approver, and audits it", async () => {
  const r = await recordCatalogueApproval(ADMIN, input(p.a));
  assert.deepEqual(r, { ok: true, public: true });
  assert.equal(await isPublic(p.a.id), true);
  const prod = await db.product.findUniqueOrThrow({ where: { id: p.a.id } });
  const img = await db.productImage.findUniqueOrThrow({ where: { id: p.a.imageId } });
  assert.equal(prod.identityApprovedBy, ADMIN);
  assert.equal(img.approvedBy, ADMIN);
  assert.equal(img.approvalStatus, "APPROVED_EXACT");
  assert.match(img.approvalReason ?? "", /Evidence: Compared photo/);
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityType: "product", entityId: p.a.id, action: "catalogue.approval_recorded" } });
  assert.equal(audit.actorId, ADMIN);
  assert.equal((audit.after as { image: { sha256: string } }).image.sha256, p.a.sha);
});

test("a later photo change revokes it (trigger), and the product leaves the storefront", async () => {
  await db.productImage.update({ where: { id: p.a.imageId }, data: { url: "https://example.test/a-display.webp" } });
  assert.equal(await isPublic(p.a.id), false);
});

test("conflict: a different image hash or a changed product since the screen loaded is refused", async () => {
  const stale = await recordCatalogueApproval(ADMIN, input(p.d, { expectedImageSha256: sha("other") }));
  assert.equal(!stale.ok && stale.code, "CONFLICT");
  await db.product.update({ where: { id: p.d.id }, data: { description: "edited after render" } });
  const changed = await recordCatalogueApproval(ADMIN, input(p.d));
  assert.equal(!changed.ok && changed.code, "CONFLICT");
  assert.equal(await isPublic(p.d.id), false);
  assert.equal(await db.auditLog.count({ where: { entityType: "product", entityId: p.d.id } }), 0);
});

test("only the primary image can carry the approval", async () => {
  const r = await recordCatalogueApproval(ADMIN, input(p.b, { imageId: p.b.secondImageId!, expectedImageSha256: sha("b2") }));
  assert.equal(!r.ok && r.code, "VALIDATION");
});

test("P0/P1 cannot be approved; a limitation needs P2/P3 and a description; evidence is required", async () => {
  for (const bad of [
    input(p.e, { image: "APPROVED_WITH_LIMITATION" }),
    input(p.e, { image: "APPROVED_WITH_LIMITATION", severity: "P2" }),
    input(p.e, { evidence: "" }),
    input(p.e, { severity: "P3" }),
  ]) {
    const r = await recordCatalogueApproval(ADMIN, bad);
    assert.equal(!r.ok && r.code, "VALIDATION", JSON.stringify(bad));
  }
  const ok = await recordCatalogueApproval(ADMIN, input(p.e, { image: "APPROVED_WITH_LIMITATION", severity: "P2", limitations: "Low resolution source" }));
  assert.deepEqual(ok, { ok: true, public: true });
});

test("a set/kit title needs an explicit pack decision", async () => {
  const missing = await recordCatalogueApproval(ADMIN, input(p.c));
  assert.equal(!missing.ok && missing.code, "VALIDATION");
  const ok = await recordCatalogueApproval(ADMIN, input(p.c, { packDecision: "12 bits in wooden case, as pictured" }));
  assert.equal(ok.ok, true);
});

test("a rejected identity or photo keeps the product hidden", async () => {
  const fresh = await db.product.findUniqueOrThrow({ where: { id: p.b.id }, select: { updatedAt: true } });
  const r = await recordCatalogueApproval(ADMIN, input({ ...p.b, updatedAt: fresh.updatedAt.toISOString() }, { image: "REJECTED", evidence: "Photo shows a different model" }));
  assert.deepEqual(r, { ok: true, public: false });
  assert.equal(await isPublic(p.b.id), false);
  assert.equal((await db.productImage.findUniqueOrThrow({ where: { id: p.b.imageId } })).approvalStatus, "REJECTED");
});

test("the action takes the approver from the session, never from the payload", () => {
  const src = readFileSync(new URL("../../../../actions/catalogue-approval.ts", import.meta.url), "utf8");
  assert.match(src, /const admin = await getAdminUser\(\);\s*if \(!admin\) return fail\("FORBIDDEN"/);
  assert.match(src, /recordCatalogueApproval\(admin\.id,/);
  assert.doesNotMatch(src, /approvedBy|approverId|input\.admin/);
});

test("approving a draft reports it as hidden, because it is", async () => {
  /* REGRESSION (11 Oct 2026): the screen said "now public" for a draft cement range. */
  const d = (p.dr = await make("draftrange", `Draft Range ${tag}`));
  await db.product.update({ where: { id: d.id }, data: { status: "draft" } });
  const fresh = await db.product.findUniqueOrThrow({ where: { id: d.id }, select: { updatedAt: true } });
  const r = await recordCatalogueApproval(ADMIN, input({ ...d, updatedAt: fresh.updatedAt.toISOString() }));
  assert.deepEqual(r, { ok: true, public: false });
  assert.equal(await isPublic(d.id), false);
});

test("batches carry slugs only — no decisions — and cover the 263 candidates", () => {
  const all = Object.entries(APPROVAL_BATCHES).filter(([b]) => b.startsWith("B")).flatMap(([, slugs]) => slugs);
  assert.equal(all.length, 263);
  assert.equal(new Set(all).size, 263);
  /* C01: the 8 draft cement ranges with an image, reviewed on staging (11 Oct 2026). */
  const cement = APPROVAL_BATCHES.C01;
  assert.equal(cement.length, 8);
  assert.ok(cement.every((s) => s.startsWith("ve-range-") && s.includes("cement")));
  assert.equal(new Set([...all, ...cement]).size, 271, "no slug in two batches");
  const raw = readFileSync(new URL("../../../catalog/approval-batches.json", import.meta.url), "utf8");
  assert.doesNotMatch(raw, /APPROVED|CONFIRMED|approvedBy/);
});

test("bulk approval = N single decisions: each validated, sha-checked, made public and audited; failures reported, not hidden", async () => {
  p.f = await make("f", `Caulking Gun ${tag}`);
  p.g = await make("g", `Hole Saw Set 5 pcs ${tag}`);
  p.h = await make("h", `Spanner Set 8 pcs ${tag}`);
  p.s = await make("s", `Chisel ${tag}`);
  const item = (x: P, packDecision?: string) => ({ productId: x.id, imageId: x.imageId, expectedImageSha256: x.sha, expectedProductUpdatedAt: x.updatedAt, packDecision });
  const r = await recordBatchApproval(ADMIN, [
    item(p.f),
    item(p.g), // kit without a pack decision → refused
    item(p.h, "8 spanners in a roll"),
    { ...item(p.s), expectedImageSha256: sha("not-what-the-screen-showed") }, // stale screen → refused
  ], "Checked each photo and model against the manufacturer catalogue");
  assert.deepEqual(r.approved.sort(), [p.f.id, p.h.id].sort());
  assert.deepEqual(r.failed.map((f) => f.productId).sort(), [p.g.id, p.s.id].sort());
  assert.equal(await isPublic(p.f.id), true);
  assert.equal(await isPublic(p.h.id), true);
  assert.equal(await isPublic(p.g.id), false);
  assert.equal(await isPublic(p.s.id), false);
  const audits = await db.auditLog.count({ where: { entityType: "product", entityId: { in: [p.f.id, p.h.id] } } });
  assert.equal(audits, 2, "one audit row per approved product");
  const h = await db.product.findUniqueOrThrow({ where: { id: p.h.id }, select: { identityApprovedBy: true, identityApprovalReason: true } });
  assert.equal(h.identityApprovedBy, ADMIN);
  assert.match(h.identityApprovalReason ?? "", /8 spanners in a roll/);
});
