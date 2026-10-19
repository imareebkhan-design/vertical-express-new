import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CheckoutView, type CheckoutActions } from "@/components/shop/checkout-view";
import { CartStateProvider, type CartActions } from "@/components/shop/cart-provider";
import type { CheckoutTotals } from "@/lib/services/checkout";
import type { CartSummary } from "@/lib/services/cart";

afterEach(cleanup);

/**
 * Staging, 17 Oct (VE-2026-MVC648PX1424): a served Delhi address whose
 * warehouse had none of the item was quoted ₹199 with "Place order" on. The
 * placement was refused, and the customer — in a hurry — paid for another,
 * pinless address. The quote now names the unavailable lines; the desktop
 * checkout says so against the address and offers no "Place order" for it.
 */
const LINE = {
  itemId: "line-1", variantId: "v-1", productSlug: "qa", productId: "p-1", categorySlug: "switches",
  categoryIsBulk: false, deliverySpeed: null, title: "QA TEST ITEM", variantName: "QA unit", brandName: "VE QA",
  imageUrl: null, unitLabel: "per piece", qty: 1, basePricePaise: 19900, unitPricePaise: 19900, appliedTierMinQty: null,
  nextTier: null, lineTotalPaise: 19900, inStock: true,
} as const;
const CART: CartSummary = {
  cartId: "cart-1", lines: [LINE], count: 1, subtotalPaise: 19900,
  freeDeliveryThresholdPaise: 0, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: true,
};
const base = { label: "site" as const, phone: "9000000000", city: "", state: "", isDefault: false };
const DELHI = { ...base, id: "delhi", name: "Delhi site", line1: "19/6 Raj Niwas", pincode: "110054", latitude: 28.67, longitude: 77.22 };
const RAJBAGH = { ...base, id: "rajbagh", name: "Rajbagh site", line1: "45, Rajbagh", pincode: "190008", latitude: 34.0687, longitude: 74.8325 };

const quote = (unavailableLines: string[]): CheckoutTotals => ({
  subtotalPaise: 16864, deliveryFeePaise: 0,
  express: { available: false, reason: "no_price", feePaise: null, eligibleVariantIds: [], ineligibleVariantIds: ["v-1"] },
  expressChosen: false, discountPaise: 0, couponDeliveryWaivedPaise: 0, couponRejection: null, taxPaise: 3036,
  gst: { ratePct: 18, hsn: "8536", taxPaise: 3036, cgstPaise: 1518, sgstPaise: 1518, igstPaise: 0, intraState: true },
  totalPaise: 19900, etaMinutes: 60, serviceable: true, codAllowed: false, placeOfSupplyState: "Jammu & Kashmir", unavailableLines,
});

function setup() {
  const placed: unknown[] = [];
  const actions = {
    getCheckoutTotals: async (pincode: string) => ({ ok: true, data: quote(pincode === "110054" ? ["QA TEST ITEM"] : []) }),
    placeOrder: async (input: unknown) => { placed.push(input); return { ok: false, error: { code: "CONFLICT", message: "unused" } }; },
    validateCoupon: async () => { throw new Error("unused"); },
    confirmRazorpayPayment: async () => { throw new Error("unused"); },
  } as unknown as CheckoutActions;
  const cartActions = {
    getCart: async () => CART, getMyWishlistIds: async () => [],
    addToCart: async () => { throw new Error("unused"); }, updateCartItem: async () => { throw new Error("unused"); },
    removeCartItem: async () => { throw new Error("unused"); },
  } as unknown as CartActions;
  const router = { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} };
  render(
    <AppRouterContext.Provider value={router as never}>
      <CartStateProvider actions={cartActions}>
        {/* Delhi first and default: the address just added from checkout. */}
        <CheckoutView addresses={[{ ...DELHI, isDefault: true }, RAJBAGH]} email="buyer@example.com" actions={actions} />
      </CartStateProvider>
    </AppRouterContext.Provider>
  );
  return { placed };
}
const placeButton = () => screen.getByRole("button", { name: "Place order" }) as HTMLButtonElement;
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => {}); };

test("an address whose warehouse cannot supply the cart says so and cannot be placed; choosing one that can re-enables it", async () => {
  const h = setup();
  await settle();
  assert.match(document.body.textContent ?? "", /QA TEST ITEM isn't in stock for delivery to 110054/);
  assert.equal(placeButton().disabled, true, "no 'Place order' for an address that cannot be fulfilled");
  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 0);

  await act(async () => { fireEvent.click(screen.getByText(/Rajbagh site/)); });
  await settle();
  assert.doesNotMatch(document.body.textContent ?? "", /isn't in stock for delivery/);
  assert.equal(placeButton().disabled, false);
});

test("each address card says whether it has a map pin, so a pinless one is not chosen by mistake", async () => {
  setup();
  await settle();
  const card = (name: RegExp) => screen.getByText(name).closest("label")!;
  assert.match(card(/Rajbagh site/).textContent ?? "", /Map pin confirmed/);
  assert.match(card(/Delhi site/).textContent ?? "", /Map pin confirmed/);
  cleanup();

  const actions = { getCheckoutTotals: async () => ({ ok: true, data: quote([]) }) } as unknown as CheckoutActions;
  const cartActions = { getCart: async () => CART, getMyWishlistIds: async () => [] } as unknown as CartActions;
  const router = { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} };
  const LEGACY = { ...base, id: "legacy", name: "Legacy site", line1: "QA test address", pincode: "190001", latitude: null, longitude: null };
  render(
    <AppRouterContext.Provider value={router as never}>
      <CartStateProvider actions={cartActions}>
        <CheckoutView addresses={[{ ...RAJBAGH, isDefault: true }, LEGACY]} email="buyer@example.com" actions={actions} />
      </CartStateProvider>
    </AppRouterContext.Provider>
  );
  await settle();
  assert.match(card(/Legacy site/).textContent ?? "", /No map pin/);
  assert.doesNotMatch(card(/Rajbagh site/).textContent ?? "", /No map pin/);
});
