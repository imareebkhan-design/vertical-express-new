import test from "node:test";
import assert from "node:assert/strict";
import { showsTabBar } from "@/components/mobile/navigation/tab-bar-visibility";

test("a cart with items hides the nav so it cannot cover the Checkout bar", () => {
  assert.equal(showsTabBar("/cart", true, true), false);
});

test("an empty cart keeps the nav as its way out", () => {
  assert.equal(showsTabBar("/cart", true, false), true);
});

test("other primary tabs keep the nav whatever the cart holds", () => {
  for (const path of ["/", "/categories", "/search", "/account"]) {
    assert.equal(showsTabBar(path, true, true), true, path);
  }
});

test("no nav off the primary tabs or above phone width", () => {
  assert.equal(showsTabBar("/product/gp-sealant-white", true, false), false);
  assert.equal(showsTabBar("/checkout", true, true), false);
  assert.equal(showsTabBar("/", false, false), false);
});
