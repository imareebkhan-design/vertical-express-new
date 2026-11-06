import test from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { handleGetCategory } from "@/lib/api/v1";
import { catalogListingWhere } from "@/lib/catalog-policy";

/**
 * The category landing — the `Subcategory` artboard's two evidence-bound lists.
 *
 * Both exist to avoid a specific lie. "Brands we stock" must never offer a
 * shortcut that leads to an empty results page, and "Most ordered in" must
 * never dress the catalogue's first few products up as what customers actually
 * buy. The interesting assertions here are therefore the negative ones.
 */

const req = (path: string) => new Request(`http://localhost${path}`, { method: "GET" });
const json = async (res: Response) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  ({ status: res.status, body: (await res.json()) as Record<string, any> });

test("category landing: an unknown slug is a 404, not an empty landing", async () => {
  const res = await json(await handleGetCategory(req("/x"), "no-such-category"));
  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
});

test("category landing: returns the category with its brands and most-ordered list", async () => {
  const category = await db.category.findFirstOrThrow({
    where: { isActive: true, products: { some: { status: "published" } } },
    select: { slug: true, name: true },
  });

  const res = await json(await handleGetCategory(req("/x"), category.slug));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.slug, category.slug);
  assert.equal(res.body.data.name, category.name);
  assert.ok(Array.isArray(res.body.data.brands));
  assert.ok(Array.isArray(res.body.data.mostOrdered));
});

test("category landing: every brand offered actually has products in that category", async () => {
  /* THE CASE THAT MATTERS. A brand chip that leads nowhere tells the customer
     we stock a brand and then shows them nothing.

     "What it leads to" is the public listing (`catalogListingWhere`, the approval
     gate since 9 Oct), not every row marked published: a published product with
     no recorded approval is never listed, and counting it made this test depend
     on which unordered row Postgres returned first (ISS-097). The category is one
     that has a listing, so the loop below has something to check. */
  const category = await db.category.findFirstOrThrow({
    where: { isActive: true, products: { some: { AND: [catalogListingWhere()] } } },
    orderBy: { slug: "asc" },
    select: { slug: true },
  });

  /* A published product of an offered brand with no recorded approval: it is in
     the table but never in the listing, so it must not be counted. Synthetic,
     removed afterwards. */
  const offered = await db.brand.findFirstOrThrow({
    where: { isActive: true, products: { some: { AND: [catalogListingWhere()], category: { slug: category.slug } } } },
    orderBy: { slug: "asc" },
    select: { id: true },
  });
  const categoryRow = await db.category.findUniqueOrThrow({ where: { slug: category.slug }, select: { id: true } });
  const unlisted = await db.product.create({
    data: {
      slug: `iss097-unlisted-${Date.now()}`,
      title: "ISS-097 published but never approved (test fixture)",
      status: "published",
      brandId: offered.id,
      categoryId: categoryRow.id,
    },
  });
  let res;
  try {
    res = await json(await handleGetCategory(req("/x"), category.slug));
  } finally {
    await db.product.delete({ where: { id: unlisted.id } });
  }
  assert.ok(res.body.data.brands.length > 0, "a category with a listing offers at least one brand");

  for (const brand of res.body.data.brands) {
    assert.ok(brand.productCount > 0, `"${brand.name}" is offered with nothing behind it`);
    const real = await db.product.count({
      where: { AND: [catalogListingWhere()], brand: { slug: brand.slug }, category: { slug: category.slug } },
    });
    assert.equal(real, brand.productCount, `the count shown for "${brand.name}" is not what it leads to`);
  }
});

test("category landing: a category with no orders reports no most-ordered items", async () => {
  /* Empty is the correct early answer. The screen renders nothing rather than
     substituting the catalogue's first few products. */
  const untouched = await db.category.findFirst({
    where: { isActive: true, products: { none: { variants: { some: { orderItems: { some: {} } } } } } },
    select: { slug: true },
  });
  if (!untouched) return; // every category has been ordered from; nothing to prove here

  const res = await json(await handleGetCategory(req("/x"), untouched.slug));
  assert.equal(res.body.data.mostOrdered.length, 0);
});
