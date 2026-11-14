import test from "node:test";
import assert from "node:assert/strict";
import { notifyOrderStatusChange, sendNotification } from "../notifications";

/**
 * Review item 16: no push/SMS/email channel is wired, yet the service logged
 * "dispatching" and answered `sent: true`. Nothing reached the customer. It must
 * say so, so that nobody — an operator reading logs, or a future caller acting
 * on the result — believes the customer was told.
 */

test("with no delivery channel configured, a notification reports not sent", async () => {
  const logs: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => { logs.push(args.join(" ")); };
  try {
    const res = await sendNotification({ userId: "u-1", type: "order_shipped", title: "t", body: "b" });
    assert.equal(res.sent, false);
  } finally {
    console.info = original;
  }
  assert.ok(logs.some((l) => /not sent/i.test(l)), logs.join("\n"));
  assert.ok(!logs.some((l) => /dispatching/i.test(l)), "the log must not claim a dispatch");
});

test("an order status change is not reported as delivered to the customer", async () => {
  const res = await notifyOrderStatusChange({ userId: "u-1", orderNo: "VE-1", status: "packed" });
  assert.equal(res.sent, false);
});
