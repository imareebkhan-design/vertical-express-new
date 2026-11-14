import test from "node:test";
import assert from "node:assert/strict";
import { cartPausedOn } from "@/lib/cart-paused";

test("the cart is paused on the operations console and nowhere else", () => {
  for (const p of ["/admin", "/admin/products/x", "/admin/payments"]) assert.equal(cartPausedOn(p), true, p);
  for (const p of ["/", "/cart", "/checkout", "/product/x", "/administrator", "/account/orders", null]) assert.equal(cartPausedOn(p), false, String(p));
});
