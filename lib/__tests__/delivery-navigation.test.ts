import test from "node:test";
import assert from "node:assert/strict";
import { hasCustomerPin, navigationUrlFor } from "@/lib/delivery-navigation";

const written = { line1: "House 7, Lane 3", landmark: "near the mosque", city: "Srinagar", state: "J&K", pincode: "190008" };

test("the customer's confirmed pin is what the driver navigates to", () => {
  const url = navigationUrlFor({ ...written, latitude: 34.0734, longitude: 74.8021 });
  assert.equal(url, "https://www.google.com/maps/search/?api=1&query=34.073400,74.802100");
  assert.equal(hasCustomerPin({ latitude: 34.07, longitude: 74.8 }), true);
});

test("without a pin it falls back to the written address, never to nothing useful", () => {
  const url = navigationUrlFor(written);
  assert.match(url ?? "", /query=House%207/);
  assert.match(url ?? "", /190008/);
  assert.equal(hasCustomerPin(written), false);
});

test("half a pin is not a pin", () => {
  const url = navigationUrlFor({ ...written, latitude: 34.07, longitude: null });
  assert.match(url ?? "", /query=House%207/);
  assert.equal(hasCustomerPin({ latitude: 34.07, longitude: null }), false);
});

test("an order with no address at all yields no link", () => {
  assert.equal(navigationUrlFor(null), null);
  assert.equal(navigationUrlFor({}), null);
  assert.equal(navigationUrlFor({ line1: "   " }), null);
});
