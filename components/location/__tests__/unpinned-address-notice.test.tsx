import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { UnpinnedAddressNotice, hasMapPin, UNPINNED_ADDRESS_TEXT } from "@/components/location/unpinned-address-notice";

afterEach(cleanup);

/**
 * Older saved addresses have no coordinates (O-QA-5, 14 Oct: the test order's
 * address predated pin capture, so there was no route or ETA). Checkout says so
 * and offers to add a pin. A pincode is never treated as a pin.
 */
test("only real coordinates count as a pin", () => {
  assert.equal(hasMapPin({ latitude: 34.08, longitude: 74.79 }), true);
  assert.equal(hasMapPin({ latitude: null, longitude: null }), false);
  assert.equal(hasMapPin({ latitude: 34.08, longitude: null }), false);
  assert.equal(hasMapPin({ latitude: "34.08", longitude: "74.79" }), false, "strings are not validated coordinates");
  assert.equal(hasMapPin(null), false);
});

test("the notice explains the consequence and carries the action", () => {
  render(<UnpinnedAddressNotice action={<a href="/account/addresses">Add a map pin</a>} />);
  assert.equal(screen.getByRole("note").textContent?.includes(UNPINNED_ADDRESS_TEXT), true);
  assert.ok(screen.getByRole("link", { name: "Add a map pin" }));
});
