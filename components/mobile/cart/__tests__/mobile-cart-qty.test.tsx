import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CartStateProvider, useCart, type CartActions } from "@/components/shop/cart-provider";

/* The real hook module binds the server actions; this test supplies its own. */
mock.module("@/hooks/use-cart", { namedExports: { useCart } });
let MobileCartView: typeof import("@/components/mobile/cart/mobile-cart-view").MobileCartView;
before(async () => {
  ({ MobileCartView } = await import("@/components/mobile/cart/mobile-cart-view"));
});
import type { CartLine, CartSummary } from "@/lib/services/cart";

afterEach(cleanup);

/**
 * Staging UAT, 8 Nov 2026: on the phone-web cart, pressing + showed the new
 * quantity, flipped back to the old one ~4.5 s later, and only then settled —
 * and leaving the page in that window lost the change. The handler re-read the
 * cart straight after `updateItem`, whose server write is debounced, so the
 * read (queued first; Next.js runs server actions one at a time) returned the
 * old quantity and delayed the write behind it. The provider already
 * reconciles after the write; the extra read is what broke it.
 */

const line = (qty: number): CartLine => ({
  itemId: "i1", variantId: "v1", productSlug: "p", productId: "p1", categorySlug: "painting", categoryIsBulk: false,
  deliverySpeed: null, title: "Paint tin", variantName: "Tin", brandName: "B", imageUrl: null, unitLabel: "per tin",
  qty, basePricePaise: 100, unitPricePaise: 100, appliedTierMinQty: null, nextTier: null, lineTotalPaise: 100 * qty, inStock: true,
});
const cart = (qty: number): CartSummary => ({
  cartId: "c", lines: [line(qty)], count: qty, subtotalPaise: 100 * qty,
  freeDeliveryThresholdPaise: 50000, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: false,
});
const tick = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

test("pressing + writes once and the screen never shows the old quantity again", async () => {
  let server = 1;
  const reads: number[] = [];
  const updates: number[] = [];
  const actions: CartActions = {
    getCart: async () => { reads.push(server); await new Promise((r) => setTimeout(r, 150)); return cart(server); },
    getMyWishlistIds: async () => [],
    addToCart: async () => { throw new Error("not used"); },
    updateCartItem: async ({ qty }) => { updates.push(qty); await new Promise((r) => setTimeout(r, 150)); server = qty; return { ok: true, data: { summary: cart(qty) } }; },
    removeCartItem: async () => { throw new Error("not used"); },
  };
  render(<CartStateProvider actions={actions}><MobileCartView /></CartStateProvider>);
  await tick(400);
  const readsBefore = reads.length;
  const plus = screen.getByRole("button", { name: "Increase Paint tin" });
  const shown: string[] = [];
  await act(async () => { plus.click(); });
  for (let i = 0; i < 12; i++) { await tick(100); shown.push(plus.parentElement?.textContent ?? ""); }
  assert.deepEqual(updates, [2]);
  assert.equal(server, 2);
  assert.ok(shown.every((s) => /2/.test(s)), `quantity flipped back: ${shown.join(" | ")}`);
  assert.equal(reads.length, readsBefore, "no cart re-read is queued ahead of the write");
});
