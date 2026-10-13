import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CheckoutView, type CheckoutActions } from "@/components/shop/checkout-view";
import { CartStateProvider, type CartActions } from "@/components/shop/cart-provider";
import type { CartSummary } from "@/lib/services/cart";

afterEach(cleanup);

/**
 * O-QA-4 (staging, 13 Oct): a customer who has just signed in for the first
 * time has no saved address. No quote can be asked without one, so the total
 * used to read "Updating…" forever beside a disabled "Place order", with
 * nothing saying why. It must say what to do instead.
 */

const LINE = {
  itemId: "line-1", variantId: "v-1", productSlug: "qa-item", productId: "p-1", categorySlug: "painting",
  categoryIsBulk: false, deliverySpeed: null, title: "QA item", variantName: "Default", brandName: "VE QA",
  imageUrl: null, unitLabel: "per piece", qty: 3, basePricePaise: 19900, unitPricePaise: 19900, appliedTierMinQty: null,
  nextTier: null, lineTotalPaise: 59700, inStock: true,
} as const;
const CART: CartSummary = {
  cartId: "cart-1", lines: [LINE], count: 3, subtotalPaise: 59700,
  freeDeliveryThresholdPaise: 50000, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: true,
};

test("no saved address: the total asks for an address, no quote is requested, Place order stays disabled", async () => {
  let quotesAsked = 0;
  const actions = {
    getCheckoutTotals: async () => { quotesAsked += 1; throw new Error("must not be asked without an address"); },
    placeOrder: async () => { throw new Error("must not place"); },
    validateCoupon: async () => { throw new Error("unused"); },
    confirmRazorpayPayment: async () => { throw new Error("unused"); },
  } as unknown as CheckoutActions;
  const cartActions = {
    getCart: async () => CART,
    getMyWishlistIds: async () => [],
    addToCart: async () => { throw new Error("unused"); },
    updateCartItem: async () => { throw new Error("unused"); },
    removeCartItem: async () => { throw new Error("unused"); },
  } as unknown as CartActions;
  const router = { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} };

  render(
    <AppRouterContext.Provider value={router as never}>
      <CartStateProvider actions={cartActions}>
        <CheckoutView addresses={[]} email={null} actions={actions} />
      </CartStateProvider>
    </AppRouterContext.Provider>
  );
  await act(async () => {}); // the cart read

  const total = screen.getByText("Total").nextElementSibling?.textContent ?? "";
  assert.equal(total, "Add an address");
  assert.doesNotMatch(document.body.textContent ?? "", /Updating…/);
  assert.ok(screen.getByText("Add a delivery address to see your total and place the order."));
  assert.equal((screen.getByRole("button", { name: "Place order" }) as HTMLButtonElement).disabled, true);
  assert.equal(quotesAsked, 0);
});
