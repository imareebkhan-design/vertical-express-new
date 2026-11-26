import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publicProductWhere } from "@/lib/catalog-policy";
import { adminListCategories, saveCategory } from "@/lib/services/admin/categories";
import { createApprovedCatalogueFixture } from "@/test-support/catalogue-fixtures";

/**
 * Categories from the console. A category is shop structure: switching it off
 * must hide what is in it and switching it on must bring exactly that back;
 * names are unique; every change is audited.
 */

const ACTOR = { email: "ops@example.test" };
const made: string[] = [];
const cleanups: (() => Promise<void>)[] = [];

after(async () => {
  for (const c of cleanups.reverse()) await c();
  await db.auditLog.deleteMany({ where: { entityType: "category", entityId: { in: made } } });
  await db.category.deleteMany({ where: { id: { in: made } } });
});

const input = (slug: string, over: Partial<Parameters<typeof saveCategory>[0]> = {}) => ({
  slug,
  name: `Test ${slug}`,
  group: "other" as const,
  description: "  A test category  ",
  sortOrder: 500,
  isActive: true,
  seoTitle: "",
  seoDescription: null,
  ...over,
});

const slug = () => `zz-cat-${randomUUID().slice(0, 8)}`;

test("a category is created, trimmed, audited, and listed without a tax mapping", async () => {
  const s = slug();
  const r = await saveCategory(input(s), ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  made.push(r.id);
  const row = await db.category.findUniqueOrThrow({ where: { slug: s } });
  assert.equal(row.description, "A test category");
  assert.equal(row.seoTitle, null);
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: r.id, action: "catalogue.category_created" } });
  assert.equal((audit.after as { by?: string }).by, ACTOR.email);
  const listed = (await adminListCategories()).find((c) => c.slug === s);
  assert.equal(listed?.hasTaxMapping, false, "a new category has no HSN/GST until one is confirmed");
});

test("names and slugs are unique; a name differing only in case is the same name", async () => {
  const s = slug();
  const r = await saveCategory(input(s, { name: `Unique ${s}` }), ACTOR);
  if (r.ok) made.push(r.id);
  assert.deepEqual(await saveCategory(input(slug(), { name: `UNIQUE ${s}` }), ACTOR), { ok: false, code: "NAME_TAKEN" });
  assert.deepEqual(await saveCategory(input(s, { name: `Other ${s}` }), ACTOR), { ok: false, code: "SLUG_TAKEN" });
});

test("an edit records what changed, and never the slug", async () => {
  const s = slug();
  const r = await saveCategory(input(s), ACTOR);
  if (!r.ok) throw new Error("setup");
  made.push(r.id);
  const e = await saveCategory(input(s, { name: `Renamed ${s}`, sortOrder: 7 }), ACTOR, s);
  assert.deepEqual(e, { ok: true, id: r.id, created: false });
  const row = await db.category.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.slug, s);
  assert.equal(row.name, `Renamed ${s}`);
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: r.id, action: "catalogue.category_edited" } });
  const changed = (audit.after as { changed: Record<string, unknown> }).changed;
  assert.deepEqual(Object.keys(changed).sort(), ["name", "sortOrder"]);
});

test("editing a category that is gone says so", async () => {
  assert.deepEqual(await saveCategory(input("zz-cat-missing"), ACTOR, "zz-cat-missing"), { ok: false, code: "NOT_FOUND" });
});

test("switching a category off hides its approved products; switching it on brings exactly them back", async () => {
  const s = slug();
  const r = await saveCategory(input(s), ACTOR);
  if (!r.ok) throw new Error("setup");
  made.push(r.id);
  const fixture = await createApprovedCatalogueFixture();
  cleanups.push(fixture.cleanup);
  // Moving category resets identity approval (database trigger); re-approve in a second write.
  await db.product.update({ where: { id: fixture.product.id }, data: { categoryId: r.id } });
  await db.product.update({
    where: { id: fixture.product.id },
    data: { identityConfirmed: true, identityApprovedAt: new Date(), identityApprovedBy: "test", identityApprovalReason: "test" },
  });
  const visible = () => db.product.count({ where: { AND: [publicProductWhere(), { id: fixture.product.id }] } });
  assert.equal(await visible(), 1);

  await saveCategory(input(s, { isActive: false }), ACTOR, s);
  assert.equal(await visible(), 0, "an inactive category hides its products");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: fixture.product.id } })).status, "published", "the product itself is untouched");

  await saveCategory(input(s, { isActive: true }), ACTOR, s);
  assert.equal(await visible(), 1);
});
