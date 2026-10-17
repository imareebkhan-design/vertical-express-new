import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SEARCH_LENGTH, parseProductsQuery, productsHref } from "../admin-products-query";

const ID = "3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60";

test("an empty URL is the unfiltered first page", () => {
  assert.deepEqual(parseProductsQuery({}), { q: "", status: null, categoryId: null, brandId: null, page: 1 });
});

test("every filter is read from the URL", () => {
  assert.deepEqual(parseProductsQuery({ q: "  OPC 53 ", status: "draft", category: ID, brand: ID.toUpperCase(), page: "3" }), {
    q: "OPC 53", status: "draft", categoryId: ID, brandId: ID, page: 3,
  });
});

test("malformed values are dropped, never passed to the database", () => {
  const q = parseProductsQuery({ status: "deleted", category: "cement", brand: "1 OR 1=1", page: "-2" });
  assert.deepEqual(q, { q: "", status: null, categoryId: null, brandId: null, page: 1 });
  assert.equal(parseProductsQuery({ page: "abc" }).page, 1);
  assert.equal(parseProductsQuery({ q: "x".repeat(500) }).q.length, MAX_SEARCH_LENGTH);
  assert.equal(parseProductsQuery({ status: ["published", "draft"] }).status, "published", "a repeated key takes the first");
});

test("links keep the filters, and changing a filter goes back to page 1", () => {
  const q = parseProductsQuery({ q: "wire", status: "published", page: "4" });
  assert.equal(productsHref(q), "/admin/products?q=wire&status=published&page=4");
  assert.equal(productsHref(q, { page: 5 }), "/admin/products?q=wire&status=published&page=5");
  assert.equal(productsHref(q, { status: "draft" }), "/admin/products?q=wire&status=draft");
  assert.equal(productsHref(q, { q: "", status: null, page: 1 }), "/admin/products");
});
