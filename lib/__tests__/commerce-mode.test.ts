import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { commerceMode, CommerceModeError, orderingOpen, ORDERING_CLOSED, ORDERING_CLOSED_MESSAGE } from "../commerce-mode";
import { classifyPlaceOrderError } from "../checkout-errors";
import { STATUS_FOR_CODE } from "../api/response";

/** COMMERCE_MODE (owner decision, 31 Oct 2026): a typo must never open checkout. */

const saved = process.env.COMMERCE_MODE;
afterEach(() => {
  if (saved === undefined) delete process.env.COMMERCE_MODE;
  else process.env.COMMERCE_MODE = saved;
});

test("unset means transactional — today's behaviour", () => {
  delete process.env.COMMERCE_MODE;
  assert.equal(commerceMode(), "transactional");
  assert.equal(orderingOpen(), true);
});

test("catalogue closes ordering", () => {
  process.env.COMMERCE_MODE = "catalogue";
  assert.equal(commerceMode(), "catalogue");
  assert.equal(orderingOpen(), false);
});

test("an unknown mode throws, and ordering treats it as closed", () => {
  for (const v of ["Catalogue", "catalog", "open", "true"]) {
    process.env.COMMERCE_MODE = v;
    assert.throws(() => commerceMode(), CommerceModeError);
    assert.equal(orderingOpen(), false, v);
  }
});

test("the refusal reaches the customer as ORDERING_CLOSED (403) with the enquiry message", () => {
  const r = classifyPlaceOrderError(new Error(ORDERING_CLOSED));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "ORDERING_CLOSED");
  assert.equal(r.error.message, ORDERING_CLOSED_MESSAGE);
  assert.deepEqual(r.error.metadata, { orderingClosed: true });
  assert.equal(STATUS_FOR_CODE.ORDERING_CLOSED, 403);
});
