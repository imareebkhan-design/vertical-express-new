import { test } from "node:test";
import assert from "node:assert/strict";

import { listProducts } from "../catalog";

/**
 * "In Cement 23 · In Adhesives 6" on SearchResults: which shelves a search
 * matched, and how many products on each. Counted over every match, not the
 * page on screen, and each count must be what that shelf actually returns.
 */

test("search: category facet counts every match and agrees with each shelf", async () => {
  const res = await listProducts({ search: "cement", perPage: 1 });
  const cats = res.facets.categories ?? [];
  assert.ok(cats.length > 0, "a search that matched products reported no shelves");

  const sum = cats.reduce((n, c) => n + c.count, 0);
  assert.equal(sum, res.total, "shelf counts do not add up to the result count");

  for (const c of cats) {
    const shelf = await listProducts({ search: "cement", categorySlug: c.slug, perPage: 48 });
    assert.equal(shelf.total, c.count, `"In ${c.name} ${c.count}" leads to ${shelf.total}`);
  }
  for (let i = 1; i < cats.length; i++) assert.ok(cats[i - 1].count >= cats[i].count, "not ordered by count");
});

test("search: no match, no shelves", async () => {
  const res = await listProducts({ search: "zzzqqq excavator lease helicopter" });
  assert.deepEqual(res.facets.categories ?? [], []);
});
