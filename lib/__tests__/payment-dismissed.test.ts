import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAYMENT_DISMISSED_MESSAGE } from "@/lib/payment-window";

/**
 * Closing the Razorpay window is not proof that nothing was paid (iOS, 10 Oct:
 * captured while the sheet stayed open). The customer is never told "not
 * charged" on a dismiss, and every web checkout that opens Razorpay says the
 * same thing.
 */
const VIEWS = [
  "components/shop/checkout-view.tsx",
  "components/account/order-actions.tsx",
  "components/mobile/checkout/mobile-checkout-view.tsx",
  "components/mobile/account/mobile-order-detail-view.tsx",
];

test("the dismiss message never claims nothing was charged, and warns against paying again", () => {
  assert.doesNotMatch(PAYMENT_DISMISSED_MESSAGE, /not (been )?charged|nothing (was|will be) charged|cancell?ed/i);
  assert.match(PAYMENT_DISMISSED_MESSAGE, /do not pay again/i);
  assert.match(PAYMENT_DISMISSED_MESSAGE, /order is saved/i);
});

test("every Razorpay ondismiss in the web uses the shared message", () => {
  for (const file of VIEWS) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    const handlers = [...src.matchAll(/ondismiss:/g)].map((m) => src.slice(m.index, m.index + 160));
    assert.ok(handlers.length >= 1, `${file} opens Razorpay without an ondismiss handler`);
    for (const h of handlers) assert.match(h, /PAYMENT_DISMISSED_MESSAGE/, `${file}: ${h}`);
  }
});
