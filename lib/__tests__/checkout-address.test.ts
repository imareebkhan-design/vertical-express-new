import test from "node:test";
import assert from "node:assert/strict";
import { initialCheckoutAddress, returnWithAddress, searchWithAddress, startingCheckoutAddress } from "@/lib/checkout-address";

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

const SAVED = [
  { id: "old", isDefault: false },
  { id: "home", isDefault: true },
  { id: "new", isDefault: false },
];

test("a requested address that is still theirs is where checkout starts, and nothing is flagged", () => {
  assert.deepEqual(startingCheckoutAddress(SAVED, "new"), { id: "new", requestedMissing: false });
});

test("a requested address that is gone is never passed off as the customer's choice", () => {
  assert.deepEqual(startingCheckoutAddress(SAVED, "deleted"), { id: "home", requestedMissing: true });
  assert.deepEqual(startingCheckoutAddress([], "deleted"), { id: "", requestedMissing: true });
});

test("with nothing requested, the default — and nothing to flag", () => {
  assert.deepEqual(startingCheckoutAddress(SAVED, null), { id: "home", requestedMissing: false });
});

test("the remembered choice is written into the URL without disturbing anything else", () => {
  assert.equal(searchWithAddress("", "a1"), "?address=a1");
  assert.equal(searchWithAddress("?coupon=X&address=old", "a1"), "?coupon=X&address=a1");
  assert.equal(searchWithAddress("?address=old", null), "");
});
