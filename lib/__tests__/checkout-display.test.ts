import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryFeeLabel } from "../checkout-display";

/**
 * What the checkout summary says about delivery.
 *
 * For a pincode we do not serve the server reports a delivery fee of 0 — there
 * is no fee because there is no delivery. Both checkouts rendered any 0 as
 * "FREE", so a customer whose site we cannot reach was told delivery was free
 * (seen on the desktop checkout, 28 Sep). Placement is refused for that
 * pincode, so nothing wrong was charged; the words were the defect.
 */

test("no delivery to this pincode is not free delivery", () => {
  assert.equal(deliveryFeeLabel({ serviceable: false, deliveryFeePaise: 0 }), "—");
});

test("a genuinely free delivery still says FREE", () => {
  assert.equal(deliveryFeeLabel({ serviceable: true, deliveryFeePaise: 0 }), "FREE");
});

test("a charged delivery states its fee", () => {
  assert.equal(deliveryFeeLabel({ serviceable: true, deliveryFeePaise: 4900 }), "₹49");
});

test("nothing is claimed before totals arrive", () => {
  assert.equal(deliveryFeeLabel(null), "—");
});
