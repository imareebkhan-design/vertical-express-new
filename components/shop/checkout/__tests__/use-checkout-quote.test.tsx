import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useCheckoutQuote, QUOTE_FAILED, type QuoteInputs } from "@/components/shop/checkout/use-checkout-quote";
import type { ActionResult } from "@/lib/validators";
import type { CheckoutTotals } from "@/lib/services/checkout";

afterEach(cleanup);

/**
 * ISS-081 — the checkout quote must answer the inputs on screen.
 *
 * Found at 390 px: after changing the delivery address, the phone checkout kept
 * the previous address's total (₹461) with "Pay & Place Order" enabled until the
 * new quote arrived. Desktop kept the previous totals the same way. The hook both
 * checkouts now use is driven here with a quote function whose answers the test
 * releases one by one, in any order.
 */

type Answer = ActionResult<CheckoutTotals>;
interface Pending { pincode: string; coupon: string | undefined; express: boolean; resolve: (a: Answer) => void; reject: (e: unknown) => void }

function gateway() {
  const pending: Pending[] = [];
  const fetchQuote = (pincode: string, coupon: string | undefined, express: boolean) =>
    new Promise<Answer>((resolve, reject) => pending.push({ pincode, coupon, express, resolve, reject }));
  return { pending, fetchQuote };
}

const totals = (totalPaise: number, serviceable = true) => ({ totalPaise, serviceable }) as unknown as CheckoutTotals;
const ok = (t: CheckoutTotals): Answer => ({ ok: true, data: t });
/* Read through a call so an assertion that it is null does not narrow later reads. */
const quoteOf = (h: { result: { current: { quote: CheckoutTotals | null } } }) => h.result.current.quote;

const SITE_A: QuoteInputs = { addressId: "a", pincode: "190014", couponCode: null, wantsExpress: false };
const SITE_B: QuoteInputs = { addressId: "b", pincode: "190001", couponCode: null, wantsExpress: false };
const SITE_C: QuoteInputs = { addressId: "c", pincode: "190002", couponCode: null, wantsExpress: false };

/** Mounted on site A and answered: ₹461, submittable. */
async function onSiteA() {
  const g = gateway();
  const h = renderHook((inputs: QuoteInputs) => useCheckoutQuote(inputs, g.fetchQuote), { initialProps: SITE_A });
  await act(async () => g.pending[0].resolve(ok(totals(46100))));
  assert.equal(h.result.current.quote?.totalPaise, 46100);
  assert.equal(h.result.current.canSubmit, true);
  return { g, h };
}

test("1. slow address-change quote: the previous total stops being current at once, and submission is off until the new one", async () => {
  const { g, h } = await onSiteA();
  h.rerender(SITE_B);
  /* Same render as the change — the new request has not been answered. */
  assert.equal(quoteOf(h), null, "the ₹461 for site A is not shown as site B's total");
  assert.equal(h.result.current.status, "loading");
  assert.equal(h.result.current.canSubmit, false);
  assert.equal(g.pending.length, 2);
  assert.equal(g.pending[1].pincode, "190001", "re-quoted for the new site");

  await act(async () => g.pending[1].resolve(ok(totals(51000))));
  assert.equal(h.result.current.quote?.totalPaise, 51000);
  assert.equal(h.result.current.canSubmit, true);
});

test("2. failed replacement quote: a clear failure, no total, submission stays off", async () => {
  const { g, h } = await onSiteA();
  h.rerender(SITE_B);
  await act(async () => g.pending[1].reject(new TypeError("Failed to fetch")));
  assert.equal(h.result.current.status, "failed");
  assert.equal(h.result.current.failure, QUOTE_FAILED);
  assert.equal(quoteOf(h), null, "the old total does not come back");
  assert.equal(h.result.current.canSubmit, false);

  /* A refusal from the server is a failure too, with its own message. */
  h.rerender(SITE_C);
  await act(async () => g.pending[2].resolve({ ok: false, error: { code: "CONFLICT", message: "Your cart is empty" } }));
  assert.equal(h.result.current.failure, "Your cart is empty");
  assert.equal(h.result.current.canSubmit, false);
});

test("3. rapid address changes, answers out of order: only the newest selection's answer is ever current", async () => {
  const { g, h } = await onSiteA();
  h.rerender(SITE_B);
  h.rerender(SITE_C);
  const [, forB, forC] = g.pending;

  await act(async () => forC.resolve(ok(totals(52000))));
  assert.equal(h.result.current.quote?.totalPaise, 52000);

  /* Site B's answer arrives last — it must not replace site C's. */
  await act(async () => forB.resolve(ok(totals(51000))));
  assert.equal(h.result.current.quote?.totalPaise, 52000, "a late answer for a site the customer left is ignored");
  assert.equal(h.result.current.canSubmit, true);

  /* Late failure for the abandoned site: ignored as well. */
  h.rerender(SITE_A);
  const forA = g.pending[3];
  h.rerender(SITE_C);
  await act(async () => g.pending[4].resolve(ok(totals(52500))));
  await act(async () => forA.reject(new TypeError("Failed to fetch")));
  assert.equal(h.result.current.status, "ready");
  assert.equal(h.result.current.quote?.totalPaise, 52500);
});

test("4. attempted submission while the quote is stale: every stale state refuses", async () => {
  const { g, h } = await onSiteA();
  const attempts: string[] = [];
  /* What both checkouts do on "place order": nothing unless the quote is current. */
  const submit = () => {
    if (h.result.current.canSubmit) attempts.push(String(h.result.current.quote?.totalPaise));
  };

  h.rerender(SITE_B);
  submit(); // loading
  await act(async () => g.pending[1].reject(new TypeError("Failed to fetch")));
  submit(); // failed
  h.rerender({ ...SITE_B, wantsExpress: true });
  submit(); // a different input changed — express — and is loading
  h.rerender({ ...SITE_B, couponCode: "ZZZE6REVAL" });
  submit(); // coupon changed
  assert.deepEqual(attempts, [], "no submission against a quote for other inputs");

  /* An unserviceable answer is current but not submittable. */
  await act(async () => g.pending[3].resolve(ok(totals(41980, false))));
  submit();
  assert.deepEqual(attempts, []);
});

test("5. recovery: after a failure, a successful fresh quote for the current inputs enables submission", async () => {
  const { g, h } = await onSiteA();
  h.rerender(SITE_B);
  await act(async () => g.pending[1].reject(new TypeError("Failed to fetch")));
  assert.equal(h.result.current.canSubmit, false);

  /* The customer picks a site again (or reloads — a fresh mount asks again). */
  h.rerender(SITE_C);
  assert.equal(h.result.current.canSubmit, false, "still off until the answer");
  await act(async () => g.pending[2].resolve(ok(totals(52000))));
  assert.equal(h.result.current.status, "ready");
  assert.equal(h.result.current.failure, null);
  assert.equal(h.result.current.quote?.totalPaise, 52000);
  assert.equal(h.result.current.canSubmit, true);

  const remount = gateway();
  const fresh = renderHook(() => useCheckoutQuote(SITE_B, remount.fetchQuote));
  assert.equal(fresh.result.current.canSubmit, false);
  await act(async () => remount.pending[0].resolve(ok(totals(51000))));
  assert.equal(fresh.result.current.canSubmit, true);
});

test("no address yet: nothing is asked and nothing can be submitted", () => {
  const g = gateway();
  const h = renderHook(() => useCheckoutQuote({ addressId: null, pincode: null, couponCode: null, wantsExpress: false }, g.fetchQuote));
  assert.equal(g.pending.length, 0);
  assert.equal(h.result.current.status, "idle");
  assert.equal(h.result.current.canSubmit, false);
});

test("3b. going back to an earlier site asks again: neither its old answer nor its old failure is reused", async () => {
  const { g, h } = await onSiteA();
  /* Found in the browser: A answered, B failed, back to A — A's earlier ₹461 was current again, enabled, while
     the new request for A was still out; and back to B showed B's old failure while B was being asked again. */
  h.rerender(SITE_B);
  await act(async () => g.pending[1].reject(new TypeError("Failed to fetch")));
  h.rerender(SITE_A);
  assert.equal(quoteOf(h), null, "A's earlier answer is not current while A is re-asked");
  assert.equal(h.result.current.status, "loading");
  assert.equal(h.result.current.canSubmit, false);
  assert.equal(g.pending.length, 3, "A was asked again");

  h.rerender(SITE_B);
  assert.equal(h.result.current.failure, null, "B's old failure is not shown while B is re-asked");
  assert.equal(h.result.current.status, "loading");

  await act(async () => g.pending[2].resolve(ok(totals(46200))));
  assert.equal(quoteOf(h), null, "A's answer lands after the customer moved to B: ignored");
  await act(async () => g.pending[3].resolve(ok(totals(51000))));
  assert.equal(h.result.current.quote?.totalPaise, 51000);
  assert.equal(h.result.current.canSubmit, true);
});
