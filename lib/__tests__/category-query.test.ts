import test from "node:test";
import assert from "node:assert/strict";
import { categoryQueryFromParams } from "../category-query";
import { attributeConfigFor } from "../catalog-attributes";

test("repeated and comma-separated brands use the same query contract", () => {
  assert.deepEqual(categoryQueryFromParams("cement", new URLSearchParams("brand=a,b&brand=c")).brandSlugs, ["a", "b", "c"]);
});
test("only configured attributes survive pagination", () => {
  const labels = attributeConfigFor("cement").attributes;
  const params = new URLSearchParams("unknown=x");
  for (const label of labels) params.set(label.toLowerCase(), "selected");
  assert.deepEqual(categoryQueryFromParams("cement", params).attrs, Object.fromEntries(labels.map((l) => [l, "selected"])));
});
test("invalid price, page and sort inputs normalize safely", () => {
  const q = categoryQueryFromParams("cement", new URLSearchParams("minPrice=Infinity&maxPrice=-1&page=-2&sort=bogus"));
  assert.equal(q.minPaise, undefined); assert.equal(q.maxPaise, undefined);
  assert.equal(q.page, 1); assert.equal(q.sort, "newest");
});
test("price units and an explicit later page are retained", () => {
  const q = categoryQueryFromParams("cement", new URLSearchParams("minPrice=12.50&maxPrice=100&page=3&sort=price_asc"));
  assert.equal(q.minPaise, 1250); assert.equal(q.maxPaise, 10000);
  assert.equal(q.page, 3); assert.equal(q.sort, "price_asc");
});
