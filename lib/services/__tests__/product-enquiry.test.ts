import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { createProductEnquiry, setProductEnquiryStatus, listProductEnquiries } from "../product-enquiries";
import { submitProductEnquiry, ENQUIRY_LIMITS } from "../product-enquiry-submit";
import { handleProductEnquiry } from "@/lib/api/product-enquiry";
import { approveSyntheticProductForSale } from "../../../test-support/catalogue-fixtures";

/**
 * Product enquiries ("Enquire about this product").
 *
 * Accepted only for a product the storefront shows as catalog-only right now;
 * title and brand come from the database, never the client; abuse limits fail
 * closed; admin status changes are audited; nothing names a business phone.
 */
const tag = randomUUID().slice(0, 8);
const ADMIN = randomUUID();
const ids: { cat?: string; offCat?: string; brand?: string } = {};
const p: Record<string, string> = {};
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const ctx = () => ({ ip: `10.${tag.length}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, userId: null });

before(async () => {
  ids.cat = (await db.category.create({ data: { slug: `enq-cat-${tag}`, name: `ENQ ${tag}` } })).id;
  ids.offCat = (await db.category.create({ data: { slug: `enq-off-${tag}`, name: `ENQ off ${tag}`, isActive: false } })).id;
  ids.brand = (await db.brand.create({ data: { slug: `enq-brand-${tag}`, name: `ENQ Brand ${tag}` } })).id;
  for (const [k, status, cat] of [
    ["co", "catalog_only", ids.cat], ["unapproved", "catalog_only", ids.cat], ["draft", "draft", ids.cat], ["pub", "published", ids.cat], ["offcat", "catalog_only", ids.offCat],
  ] as const) {
    p[k] = (await db.product.create({ data: { slug: `enq-${tag}-${k}`, title: `Enquiry Probe ${tag} ${k}`, brandId: ids.brand!, categoryId: cat!, status } })).id;
  }
  /* Only "co" gets a (synthetic, test-only) identity + photo approval. "unapproved"
     is catalog_only too but has no recorded approval, so it is not public. */
  await approveSyntheticProductForSale(p.co, { allowUntaxed: true });
  await db.user.create({ data: { id: ADMIN, phone: `+9197${String(Date.now()).slice(-8)}`, email: `enq_${tag}@example.com` } });
});

after(async () => {
  const productIds = Object.values(p);
  const enq = await db.productEnquiry.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityType: "product_enquiry", entityId: { in: enq.map((e) => e.id) } } });
  await db.productEnquiry.deleteMany({ where: { productId: { in: productIds } } });
  await db.productImage.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.brand.deleteMany({ where: { id: ids.brand } });
  await db.category.deleteMany({ where: { id: { in: [ids.cat!, ids.offCat!] } } });
  await db.user.deleteMany({ where: { id: ADMIN } });
});

test("a catalog-only product accepts an enquiry; title and brand are DB snapshots", async () => {
  const r = await submitProductEnquiry(
    { productId: p.co, name: "Asha", phone: phone(), quantity: "2 units", message: "Need by Monday", productTitle: "FORGED", brandName: "FORGED" },
    ctx()
  );
  assert.equal(r.ok, true);
  const row = await db.productEnquiry.findFirst({ where: { productId: p.co }, orderBy: { createdAt: "desc" } });
  assert.ok(row);
  assert.equal(row.productTitle, `Enquiry Probe ${tag} co`);
  assert.equal(row.brandName, `ENQ Brand ${tag}`);
  assert.equal(row.status, "new");
  assert.equal(row.quantity, "2 units");
  assert.match(row.enquiryNo, /^ENQ-\d{8}-[0-9A-F]{8}$/);
});

test("unapproved catalog-only, draft, published, inactive-category and unknown products are refused", async () => {
  for (const id of [p.unapproved, p.draft, p.pub, p.offcat, randomUUID()]) {
    const r = await createProductEnquiry({ productId: id, name: "Asha", phone: phone() });
    assert.deepEqual(r, { ok: false, reason: "NOT_ENQUIRABLE" });
  }
  assert.equal(await db.productEnquiry.count({ where: { productId: { in: [p.unapproved, p.draft, p.pub, p.offcat] } } }), 0);
});

test("a resubmission within the window returns the same enquiry, no second row", async () => {
  const ph = phone();
  const a = await createProductEnquiry({ productId: p.co, name: "Ravi", phone: ph });
  const b = await createProductEnquiry({ productId: p.co, name: "Ravi", phone: ph });
  assert.ok(a.ok && b.ok);
  assert.equal(a.ok && a.enquiryNo, b.ok && b.enquiryNo);
  assert.equal(b.ok && b.duplicate, true);
  assert.equal(await db.productEnquiry.count({ where: { productId: p.co, phone: ph } }), 1);
});

test("validation: bad phone, short name, filled honeypot, oversize message", async () => {
  const base = { productId: p.co, name: "Asha", phone: phone() };
  for (const bad of [{ ...base, phone: "12345" }, { ...base, name: "A" }, { ...base, website: "http://spam" }, { ...base, message: "x".repeat(1001) }]) {
    const r = await submitProductEnquiry(bad, ctx());
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, "VALIDATION");
  }
});

test("per-phone limit refuses beyond the hourly allowance", async () => {
  const ph = phone();
  let last;
  for (let i = 0; i <= ENQUIRY_LIMITS.perPhone.hits; i++) {
    last = await submitProductEnquiry({ productId: p.co, name: "Spam", phone: ph }, ctx());
  }
  assert.equal(last && !last.ok && last.code, "RATE_LIMITED");
});

test("both limiters fail closed", () => {
  const src = readFileSync(new URL("../product-enquiry-submit.ts", import.meta.url), "utf8");
  assert.equal((src.match(/failClosed: true/g) ?? []).length, 2);
});

test("admin status change is audited with before/after; unchanged is a no-op", async () => {
  const r = await createProductEnquiry({ productId: p.co, name: "Meera", phone: phone() });
  assert.ok(r.ok);
  const row = await db.productEnquiry.findUniqueOrThrow({ where: { enquiryNo: r.ok ? r.enquiryNo : "" } });
  assert.deepEqual(await setProductEnquiryStatus(ADMIN, row.id, "contacted"), { ok: true });
  const audit = await db.auditLog.findFirst({ where: { entityType: "product_enquiry", entityId: row.id } });
  assert.ok(audit);
  assert.equal(audit.actorId, ADMIN);
  assert.equal(audit.action, "product_enquiry.status_changed");
  assert.deepEqual((audit.before as { status: string }).status, "new");
  assert.deepEqual((audit.after as { status: string }).status, "contacted");
  assert.deepEqual(await setProductEnquiryStatus(ADMIN, row.id, "contacted"), { ok: false, reason: "UNCHANGED" });
  assert.equal(await db.auditLog.count({ where: { entityType: "product_enquiry", entityId: row.id } }), 1);
  assert.ok((await listProductEnquiries("contacted")).some((e) => e.id === row.id));
});

test("v1 endpoint: catalog-only by slug → 201; draft → 404; malformed body → 400", async () => {
  const post = (slug: string, body: unknown) =>
    handleProductEnquiry(new Request(`http://t/api/v1/products/${slug}/enquiry`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "x-real-ip": `10.9.${tag.length}.${Math.floor(Math.random() * 250)}` } }), slug);
  const ok = await post(`enq-${tag}-co`, { name: "Imran", phone: phone() });
  assert.equal(ok.status, 201);
  const body = await ok.json();
  assert.match(body.data.enquiryNo, /^ENQ-/);
  assert.equal((await post(`enq-${tag}-draft`, { name: "Imran", phone: phone() })).status, 404);
  assert.equal((await post(`enq-${tag}-co`, "not json")).status, 400);
});

test("the enquiry UI and admin page name no business phone or WhatsApp destination", () => {
  for (const f of ["../../../components/shop/product-enquiry-form.tsx", "../../../app/admin/enquiries/page.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /wa\.me|whatsapp:\/\/|tel:|\+91\s?\d/i);
  }
});
