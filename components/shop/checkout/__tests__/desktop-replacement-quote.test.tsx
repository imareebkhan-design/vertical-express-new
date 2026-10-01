import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CheckoutView, type CheckoutActions } from "@/components/shop/checkout-view";
import { CartStateProvider, type CartActions } from "@/components/shop/cart-provider";
import { QUOTE_FAILED } from "@/components/shop/checkout/use-checkout-quote";
import type { CheckoutTotals } from "@/lib/services/checkout";
import type { CartSummary } from "@/lib/services/cart";
import type { ActionResult } from "@/lib/validators";

afterEach(cleanup);

/**
 * E6 — the replacement quote after a placement refusal, on the DESKTOP checkout
 * (the real `CheckoutView`, the real cart provider; only the server actions and
 * the router are stand-ins).
 *
 * The customer applied a coupon and pressed "Place order"; the server refused
 * because the coupon no longer qualifies (nothing placed). The view drops the
 * coupon and asks for a replacement quote. That answer is held back here, then
 * released — or fails. Until the revised total is on screen, nothing can be
 * placed; the discounted total that no longer applies is never shown as the
 * total and never submitted.
 */

type Quote = ActionResult<CheckoutTotals>;
interface Pending { coupon: string | undefined; resolve: (q: Quote) => void; reject: (e: unknown) => void }

const LINE = {
  itemId: "line-1", variantId: "v-1", productSlug: "switch", productId: "p-1", categorySlug: "switches",
  categoryIsBulk: false, deliverySpeed: null, title: "Modular Switch 16 A", variantName: "White", brandName: "Voltix",
  imageUrl: null, unitLabel: "per piece", qty: 5, basePricePaise: 8200, unitPricePaise: 8200, appliedTierMinQty: null,
  nextTier: null, lineTotalPaise: 41000, inStock: true,
} as const;
const CART: CartSummary = {
  cartId: "cart-1", lines: [LINE], count: 5, subtotalPaise: 41000,
  freeDeliveryThresholdPaise: 50000, freeDeliveryRemainingPaise: 9000, qualifiesFreeDelivery: false,
};
const ADDRESS = {
  id: "addr-1", label: "site" as const, name: "Test Buyer", phone: "9876543210", line1: "Plot 1",
  city: "Srinagar", state: "Jammu & Kashmir", pincode: "190014", isDefault: true,
};

/** A complete quote: ₹410 of goods, ₹49 delivery, optional discount. */
function quote(totalPaise: number, discountPaise = 0): CheckoutTotals {
  return {
    subtotalPaise: 41000 - discountPaise, deliveryFeePaise: 4900,
    express: { available: false, reason: "no_price", feePaise: null, eligibleVariantIds: [], ineligibleVariantIds: ["v-1"] },
    expressChosen: false, discountPaise, couponDeliveryWaivedPaise: 0, couponRejection: null,
    taxPaise: 0, gst: { ratePct: 18, hsn: "8536", taxPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, intraState: true },
    totalPaise, etaMinutes: null, serviceable: true, codAllowed: true,
  };
}

function setup() {
  const quotes: Pending[] = [];
  const placed: Parameters<CheckoutActions["placeOrder"]>[0][] = [];
  let placeAnswer: Awaited<ReturnType<CheckoutActions["placeOrder"]>> = {
    ok: false,
    error: { code: "COUPON_INVALID", message: "This coupon has expired.", field: "couponCode", metadata: { couponRejected: true, reason: "expired" } },
  };
  const actions = {
    getCheckoutTotals: (_pincode: string, coupon?: string) =>
      new Promise<Quote>((resolve, reject) => quotes.push({ coupon, resolve, reject })),
    placeOrder: async (input: Parameters<CheckoutActions["placeOrder"]>[0]) => { placed.push(input); return placeAnswer; },
    validateCoupon: async () => ({ ok: true, data: quote(41300, 4600) }),
    confirmRazorpayPayment: async () => { throw new Error("no payment in this test"); },
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
        <CheckoutView addresses={[ADDRESS]} email="buyer@example.com" actions={actions} />
      </CartStateProvider>
    </AppRouterContext.Provider>
  );
  return { quotes, placed, setPlaceAnswer: (a: typeof placeAnswer) => { placeAnswer = a; } };
}

const placeButton = () => screen.getByRole("button", { name: "Place order" }) as HTMLButtonElement;
/** The value next to "Total" in the summary. */
const shownTotal = () => screen.getByText("Total").nextElementSibling?.textContent ?? "";

/** Checkout open, coupon applied and quoted at ₹413, "Place order" pressed, refused: the replacement quote is outstanding. */
async function refusedWithReplacementPending() {
  const h = setup();
  await act(async () => {}); // the cart read
  /* The quote is asked once before the cart arrives and again for its lines;
     only the latest answer counts. */
  const first = h.quotes.length - 1;
  await act(async () => h.quotes[first].resolve({ ok: true, data: quote(45900) }));
  assert.match(shownTotal(), /₹459/);

  fireEvent.change(screen.getByPlaceholderText("e.g. FIRST3"), { target: { value: "save10" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Apply" })); });
  assert.equal(h.quotes.length, first + 2);
  assert.equal(h.quotes[first + 1].coupon, "SAVE10");
  await act(async () => h.quotes[first + 1].resolve({ ok: true, data: quote(41300, 4600) }));
  assert.match(shownTotal(), /₹413/);
  assert.equal(placeButton().disabled, false);

  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 1, "one placement attempt, refused by the server");
  assert.equal(h.placed[0].couponCode, "SAVE10");
  assert.equal(h.quotes.length, first + 3, "the replacement quote was asked for");
  const replacement = h.quotes[first + 2];
  assert.equal(replacement.coupon, undefined, "without the coupon that no longer qualifies");
  return { ...h, replacement };
}

test("desktop, replacement quote delayed: 'Place order' stays off and the ₹413 total is gone until the revised total arrives; then that total is what is placed", async () => {
  const h = await refusedWithReplacementPending();

  /* Held back. */
  assert.equal(placeButton().disabled, true, "no placement while the replacement quote is outstanding");
  assert.equal(shownTotal(), "Updating…");
  assert.doesNotMatch(shownTotal(), /₹413/, "the total that no longer applies is not shown as the total");
  assert.match(document.body.textContent ?? "", /no longer valid, so your order was not placed/, "the customer is told why the total is changing");
  assert.match(document.body.textContent ?? "", /Nothing has been charged/);
  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 1, "a press while it is outstanding places nothing");

  /* Released. */
  h.setPlaceAnswer({ ok: true, data: { orderNo: "VE-TEST-1", razorpay: null } } as never);
  await act(async () => h.replacement.resolve({ ok: true, data: quote(45900) }));
  assert.match(shownTotal(), /₹459/, "the revised total is on screen");
  assert.equal(placeButton().disabled, false, "and only now can the order be placed");

  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 2);
  assert.equal(h.placed[1].couponCode, null, "placed without the coupon");
  assert.equal(h.placed[1].expectedTotalPaise, 45900, "against the revised total the customer saw");
});

test("desktop, replacement quote fails: no total, 'Place order' stays off, nothing is placed from the old quote", async () => {
  const h = await refusedWithReplacementPending();

  await act(async () => h.replacement.reject(new Error("network")));
  assert.equal(shownTotal(), "—", "no total at all rather than the old one");
  assert.ok(screen.getByText(QUOTE_FAILED), "the existing safe failure message");
  assert.equal(placeButton().disabled, true);

  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 1, "no second placement: nothing reaches the server or the gateway from the stale quote");
});

test("desktop, replacement quote answered with a refusal: same safe state", async () => {
  const h = await refusedWithReplacementPending();

  await act(async () => h.replacement.resolve({ ok: false, error: { code: "PINCODE_UNSERVICEABLE", message: "This pincode isn't serviceable" } }));
  assert.equal(shownTotal(), "—");
  assert.equal(placeButton().disabled, true);
  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 1);
});

test("desktop, a TOTAL_CHANGED refusal is announced beside 'Place order', not under the payment card", async () => {
  const h = setup();
  await act(async () => {});
  const first = h.quotes.length - 1;
  await act(async () => h.quotes[first].resolve({ ok: true, data: quote(45900) }));
  h.setPlaceAnswer({
    ok: false,
    error: {
      code: "CONFLICT",
      message: "Your cart changed since this total was shown. Check the updated total, then place your order — nothing has been placed.",
      metadata: { totalChanged: true },
    },
  } as never);

  await act(async () => { fireEvent.click(placeButton()); });
  assert.equal(h.placed.length, 1);
  assert.equal(h.placed[0].expectedTotalPaise, 45900, "the total on screen was sent");

  const alert = screen.getByRole("alert");
  assert.match(alert.textContent ?? "", /Your cart changed since this total was shown/);
  assert.ok(
    alert.closest("aside")?.contains(placeButton()),
    "the message sits in the order summary with the button that produced it"
  );
});
