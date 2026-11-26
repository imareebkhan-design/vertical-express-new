import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useCheckoutQuote, cartKeyOf, type QuoteInputs } from "@/components/shop/checkout/use-checkout-quote";
import type { ActionResult } from "@/lib/validators";
import type { CheckoutTotals } from "@/lib/services/checkout";

afterEach(cleanup);

/**
 * E8 — checkout must quote the cart as it is now. A guest cart merged at
 * sign-in, a change made in another tab, or a line limited to stock changes the
 * cart without touching the address, coupon or delivery choice; the quote for
 * the old cart must stop being current, exactly as for those inputs (ISS-081).
 */

type Answer = ActionResult<CheckoutTotals>;
function gateway() {
  const pending: { resolve: (a: Answer) => void }[] = [];
  const fetchQuote = () => new Promise<Answer>((resolve) => pending.push({ resolve }));
  return { pending, fetchQuote };
}
/* Read through a call so an assertion that it is null does not narrow later reads. */
const quoteOf = (h: { result: { current: { quote: CheckoutTotals | null } } }) => h.result.current.quote;
const ok = (totalPaise: number): Answer => ({ ok: true, data: { totalPaise, serviceable: true } as unknown as CheckoutTotals });

const base: QuoteInputs = { addressId: "a", pincode: "190014", couponCode: null, wantsExpress: false };
const before = cartKeyOf([{ variantId: "v1", qty: 1 }]);
const merged = cartKeyOf([{ variantId: "v1", qty: 3 }, { variantId: "v2", qty: 1 }]);

test("a changed cart: the old quote stops being current at once, is re-asked, and a late answer for the old cart is ignored", async () => {
  const g = gateway();
  const h = renderHook((inputs: QuoteInputs) => useCheckoutQuote(inputs, g.fetchQuote), { initialProps: { ...base, cartKey: before } });
  await act(async () => g.pending[0].resolve(ok(46100)));
  assert.equal(h.result.current.canSubmit, true);

  h.rerender({ ...base, cartKey: merged });
  assert.equal(quoteOf(h), null, "the ₹461 was for the old cart");
  assert.equal(h.result.current.canSubmit, false);
  assert.equal(g.pending.length, 2, "re-quoted");

  await act(async () => g.pending[1].resolve(ok(71000)));
  assert.equal(h.result.current.quote?.totalPaise, 71000);
  assert.equal(h.result.current.canSubmit, true);
});

test("the same cart re-rendered: no new request", async () => {
  const g = gateway();
  const h = renderHook((inputs: QuoteInputs) => useCheckoutQuote(inputs, g.fetchQuote), { initialProps: { ...base, cartKey: before } });
  await act(async () => g.pending[0].resolve(ok(46100)));
  h.rerender({ ...base, cartKey: cartKeyOf([{ variantId: "v1", qty: 1 }]) });
  assert.equal(g.pending.length, 1);
  assert.equal(h.result.current.canSubmit, true);
});

test("cartKeyOf distinguishes quantity and variant", () => {
  assert.notEqual(cartKeyOf([{ variantId: "v1", qty: 1 }]), cartKeyOf([{ variantId: "v1", qty: 2 }]));
  assert.notEqual(cartKeyOf([{ variantId: "v1", qty: 1 }]), cartKeyOf([{ variantId: "v2", qty: 1 }]));
  assert.equal(cartKeyOf([]), "");
});
