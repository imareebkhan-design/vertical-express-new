import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  getCategoryBySlug,
  getProductBySlug,
  listCategoryDirectory,
  listProducts,
  visibleProductCount,
} from "../catalog";
import { directoryEntries, PRIMARY_GROUPS } from "@/lib/category-directory";
import { handleListCategories } from "@/lib/api/v1";

/**
 * Coming-soon categories (owner, 12 Oct 2026) against the real database: a
 * category becomes discoverable, but its unapproved products stay invisible.
 */
const tag = randomUUID().slice(0, 8);
const cleanup: (() => Promise<unknown>)[] = [];
after(async () => {
  for (const f of cleanup.reverse()) await f();
});

async function unapprovedProductIn(categorySlug: string) {
  const category = await db.category.findUniqueOrThrow({ where: { slug: categorySlug } });
  const brand = await db.brand.create({ data: { slug: `disc-${tag}-${categorySlug}`, name: `Disc ${tag}` } });
  const product = await db.product.create({
    data: {
      slug: `disc-${tag}-${categorySlug}`, title: `Unapproved ${tag}`, brandId: brand.id, categoryId: category.id,
      status: "published", unitLabel: "per piece",
      variants: { create: { sku: `disc-${tag}-${categorySlug}`, name: "One", pricePaise: 1000, isDefault: true } },
    },
  });
  cleanup.push(async () => {
    await db.productVariant.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });
    await db.brand.delete({ where: { id: brand.id } });
  });
  return { category, product };
}

test("the directory lists every active designated category, its state matching the visible count", async () => {
  const entries = directoryEntries(await listCategoryDirectory());
  const active = await db.category.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
  const activeSlugs = new Set(active.map((c) => c.slug));
  for (const slug of PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => c.slug))) {
    if (!activeSlugs.has(slug)) continue;
    const e = entries.find((x) => x.slug === slug);
    assert.ok(e, `${slug} is active and designated, so it must be listed`);
    const id = active.find((c) => c.slug === slug)!.id;
    const visible = await visibleProductCount(id);
    assert.equal(e.visibleProducts, visible);
    assert.equal(e.state, visible > 0 ? "available" : "coming_soon");
  }
});

test("an unapproved product in a designated category is still invisible, and adds nothing to the count", async () => {
  const before = directoryEntries(await listCategoryDirectory()).find((e) => e.slug === "cement");
  const { product } = await unapprovedProductIn("cement");
  const afterE = directoryEntries(await listCategoryDirectory()).find((e) => e.slug === "cement");
  assert.equal(afterE?.visibleProducts, before?.visibleProducts);
  assert.equal(await getProductBySlug(product.slug), null);
  const listed = await listProducts({ categorySlug: "cement", perPage: 100 });
  assert.ok(!listed.items.some((i) => i.slug === product.slug));
});

test("a designated category page exists even when empty; an undesignated empty one does not", async () => {
  assert.ok(await getCategoryBySlug("cement"), "a designated active category must have a page");

  const empty = await db.category.create({ data: { slug: `disc-empty-${tag}`, name: `Empty ${tag}`, group: "tools", isActive: true } });
  cleanup.push(() => db.category.delete({ where: { id: empty.id } }));
  assert.equal(await getCategoryBySlug(empty.slug), null);
  assert.ok(!directoryEntries(await listCategoryDirectory()).some((e) => e.slug === empty.slug));
});

test("/api/v1/categories serves the directory: coming-soon entries, generated pictures, no composites", async () => {
  const res = await handleListCategories(new Request("http://localhost/api/v1/categories"));
  const body = (await res.json()) as { data: { slug: string; discovery: string; imageUrl: string | null; productCount: number; displayGroup: string }[] };
  assert.equal(res.status, 200);
  assert.ok(body.data.length > 0);
  for (const c of body.data) {
    assert.ok(["available", "coming_soon"].includes(c.discovery));
    assert.equal(c.discovery === "coming_soon", c.productCount === 0);
    if (c.imageUrl) assert.match(c.imageUrl, /^\/merchandising\/category-tiles\//, `${c.slug} exposes an uncleared composite`);
  }
  const groups = [...new Set(body.data.map((c) => c.displayGroup))];
  assert.equal(groups.at(-1) === "tools_equipment" || !groups.includes("tools_equipment"), true, "tools must come last");
});
