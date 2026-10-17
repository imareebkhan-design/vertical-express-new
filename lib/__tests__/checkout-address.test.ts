import test from "node:test";
import assert from "node:assert/strict";
import { initialCheckoutAddress, returnWithAddress } from "@/lib/checkout-address";

const LIST = [{ id: "home", isDefault: true }, { id: "site", isDefault: false }];

test("back from adding an address, checkout opens on the one just saved (issue #1)", () => {
  assert.equal(initialCheckoutAddress(LIST, "site"), "site");
});

test("an unknown id is ignored: default, else first, else nothing", () => {
  assert.equal(initialCheckoutAddress(LIST, "someone-elses"), "home");
  assert.equal(initialCheckoutAddress(LIST, null), "home");
  assert.equal(initialCheckoutAddress([{ id: "a", isDefault: false }], null), "a");
  assert.equal(initialCheckoutAddress([], "site"), "");
});

test("the return path carries the new id", () => {
  assert.equal(returnWithAddress("/checkout", "abc"), "/checkout?address=abc");
  assert.equal(returnWithAddress("/checkout?step=2", "a b"), "/checkout?step=2&address=a%20b");
});
