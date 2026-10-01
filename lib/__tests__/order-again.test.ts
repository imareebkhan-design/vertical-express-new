import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_EXCLUDED, lastOrderedLabel, orderAgainFrom, type OrderAgainSourceOrder } from "../order-again";

/** W-07: the returning customer's "Order again" rail, from their own orders only. */

const item = (variantId: string, qty = 1, productSlug: string | null = `p-${variantId}`) => ({
  variantId,
  title: `Title ${variantId}`,
  variantName: "Unit",
  imageUrl: null,
  qty,
  productSlug,
});
const order = (status: string, placedAt: string, items: OrderAgainSourceOrder["items"]): OrderAgainSourceOrder => ({ status, placedAt, items });

test("orders that are not history contribute nothing — the same four /me excludes", () => {
  assert.deepEqual([...HISTORY_EXCLUDED], ["pending_payment", "cancelled", "refunded", "refund_initiated"]);
  const orders = HISTORY_EXCLUDED.map((s, i) => order(s, `2026-09-0${i + 1}T10:00:00Z`, [item(`v${i}`)]));
  assert.deepEqual(orderAgainFrom(orders), []);
  assert.equal(orderAgainFrom([...orders, order("delivered", "2026-09-10T10:00:00Z", [item("kept")])]).length, 1);
});

test("newest order first; a variant bought twice appears once, with its latest quantity and a count", () => {
  const rail = orderAgainFrom([
    order("delivered", "2026-08-01T10:00:00Z", [item("cement", 40), item("wire", 2)]),
    order("confirmed", "2026-09-15T10:00:00Z", [item("cement", 10)]),
  ]);
  assert.deepEqual(rail.map((r) => r.variantId), ["cement", "wire"]);
  assert.equal(rail[0].lastQty, 10);
  assert.equal(rail[0].timesOrdered, 2);
  assert.equal(rail[0].lastOrderedAt, "2026-09-15T10:00:00.000Z");
  assert.equal("pricePaise" in rail[0], false, "the rail never carries the price paid");
});

test("something no longer sold is never offered", () => {
  assert.deepEqual(orderAgainFrom([order("delivered", "2026-09-01T10:00:00Z", [item("gone", 1, null), item("ok")])]).map((r) => r.variantId), ["ok"]);
});

test("the rail is capped", () => {
  const many = Array.from({ length: 12 }, (_, i) => item(`v${i}`));
  assert.equal(orderAgainFrom([order("delivered", "2026-09-01T10:00:00Z", many)]).length, 8);
  assert.equal(orderAgainFrom([order("delivered", "2026-09-01T10:00:00Z", many)], 3).length, 3);
});

test("the label is the quantity and the day, in India time", () => {
  /* 20:00 UTC on the 14th is already the 15th in Srinagar. */
  assert.equal(lastOrderedLabel({ lastQty: 40, lastOrderedAt: "2026-08-14T20:00:00Z" }), "40 on 15 Aug");
});
