import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrailingPunctuation } from "@/lib/clean-path";

test("a page path copied with sentence punctuation is cleaned (owner 404s, 10 Oct)", () => {
  assert.equal(cleanTrailingPunctuation("/admin/catalogue-approvals."), "/admin/catalogue-approvals");
  assert.equal(cleanTrailingPunctuation("/product/qa-staging-checkout-item."), "/product/qa-staging-checkout-item");
  assert.equal(cleanTrailingPunctuation("/cart),"), "/cart");
  assert.equal(cleanTrailingPunctuation("/checkout'"), "/checkout");
});

test("clean paths, the root, and API routes are left alone", () => {
  for (const p of ["/admin/catalogue-approvals", "/product/x", "/", "/sitemap.xml", "/api/health.", "/api/v1/products/x."]) {
    assert.equal(cleanTrailingPunctuation(p), null, p);
  }
  assert.equal(cleanTrailingPunctuation("/."), "/", "a bare full stop goes home, never to an empty path");
});
